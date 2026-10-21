// Helpers de test : base SQLite temporaire (jamais data/ ni AppData) + serveur sur port aleatoire.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe } from 'node:test';
import type { DatabaseSync } from 'node:sqlite';
import { openDb } from '../src/db.ts';
import { createAgentServer } from '../src/server.ts';

export const TEST_TOKEN = 'test-token-0123456789abcdef';

// Schema metier final de l'app (V1 + migrations deleted_at/tag/group_id), suffisant pour l'API.
const BUSINESS_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#4a90e2',
    initial_balance REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#94a3b8',
    group_id INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS imports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL,
    account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    date_start TEXT,
    date_end TEXT,
    row_count INTEGER NOT NULL DEFAULT 0,
    imported_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  // V4 de l'app : templates d'import (en-tetes -> roles).
  `CREATE TABLE IF NOT EXISTS import_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
    initial_balance REAL,
    column_roles_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    value_date TEXT,
    debit REAL NOT NULL DEFAULT 0,
    credit REAL NOT NULL DEFAULT 0,
    label TEXT NOT NULL DEFAULT '',
    category_code TEXT,
    tag TEXT,
    import_id INTEGER REFERENCES imports(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT,
    deleted_at TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_tx_account_date ON transactions(account_id, date)`,
  `CREATE TABLE IF NOT EXISTS autocat_stats (
    word TEXT NOT NULL,
    category_code TEXT NOT NULL,
    count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (word, category_code)
  )`,
  `CREATE TABLE IF NOT EXISTS label_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    word TEXT NOT NULL UNIQUE,
    category_code TEXT,
    tag TEXT,
    active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  // V14 de l'app : regroupements de categories.
  `CREATE TABLE IF NOT EXISTS category_groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#64748b',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  // Facturation (payload JSON, aligne Comptal2.1/src/services/db.ts).
  `CREATE TABLE IF NOT EXISTS devis (
    id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL,
    numero TEXT NOT NULL,
    statut TEXT NOT NULL,
    supprime INTEGER NOT NULL DEFAULT 0,
    payload TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS factures (
    id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL,
    numero TEXT NOT NULL,
    statut TEXT NOT NULL,
    devis_origine TEXT,
    supprime INTEGER NOT NULL DEFAULT 0,
    payload TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  // Parametres de numerotation facturation (aligne db.ts SCHEMA_V5).
  `CREATE TABLE IF NOT EXISTS invoice_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    payload TEXT NOT NULL
  )`,
  // Contacts / clients (payload JSON, aligne Comptal2.1/src/services/db.ts).
  `CREATE TABLE IF NOT EXISTS clients (
    id TEXT PRIMARY KEY,
    code_client TEXT,
    type TEXT NOT NULL,
    archived INTEGER NOT NULL DEFAULT 0,
    payload TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS contact_groups (
    id TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  // Dons lies aux contacts (aligne Comptal2.1/src/services/db.ts, table donations).
  `CREATE TABLE IF NOT EXISTS donations (
    id TEXT PRIMARY KEY,
    contact_id TEXT NOT NULL
  )`,
  // Dons (payload JSON, aligne Comptal2.1/src/services/db.ts).
  `CREATE TABLE IF NOT EXISTS donateurs (
    id TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS dons_manuels (
    id TEXT PRIMARY KEY,
    donateur_id TEXT NOT NULL,
    payload TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS donateur_transactions (
    transaction_id TEXT PRIMARY KEY,
    donateur_id TEXT NOT NULL
  )`,
];

export interface TestDb {
  db: DatabaseSync;
  dir: string;
  dbPath: string;
  cleanup(): void;
}

/** Cree une base de test dans un dossier temporaire unique, avec donnees factices. */
export function createTestDb(): TestDb {
  const dir = mkdtempSync(join(tmpdir(), 'comptal-agent-api-test-'));
  const dbPath = join(dir, 'test.db');
  const db = openDb(dbPath);
  for (const sql of BUSINESS_SCHEMA) db.exec(sql);
  // Donnees factices : compte, categorie normale, categorie transfert X (protegee).
  db.prepare("INSERT INTO accounts (code, name, color, initial_balance) VALUES ('ACC1', 'Compte courant', '#4a90e2', 100)").run();
  db.prepare("INSERT INTO categories (code, name, color) VALUES ('ALIM', 'Alimentation', '#e2b34a')").run();
  db.prepare("INSERT INTO categories (code, name, color) VALUES ('X', 'Transferts inter-comptes', '#ffffff')").run();
  db.prepare("INSERT INTO category_groups (name, color, sort_order) VALUES ('Courant', '#64748b', 0)").run();
  db.prepare("UPDATE categories SET group_id = 1 WHERE code = 'ALIM'").run();
  return {
    db,
    dir,
    dbPath,
    cleanup() {
      db.close();
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    },
  };
}

export interface TestServer {
  baseUrl: string;
  cleanup(): void;
}

/** Demarre l'API sur 127.0.0.1:0 (port aleatoire) contre la base de test passee. */
export async function startTestServer(dbPath: string): Promise<TestServer> {
  const { server, db: serverDb } = createAgentServer({
    token: TEST_TOKEN,
    dbPath,
    port: 0,
    host: '127.0.0.1',
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('Port du serveur de test indisponible');
  }
  const baseUrl = `http://127.0.0.1:${address.port}`;
  return {
    baseUrl,
    cleanup() {
      // Ferme les connexions keep-alive de fetch, sinon close() ne se termine jamais.
      server.closeAllConnections();
      server.close();
      serverDb.close();
    },
  };
}

export interface ApiResponse {
  status: number;
  body: Record<string, unknown>;
}

/** Appel HTTP simple avec authentification Bearer. */
export async function api(
  baseUrl: string,
  method: string,
  path: string,
  body?: unknown
): Promise<ApiResponse> {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${TEST_TOKEN}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await res.text();
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(text) as Record<string, unknown>;
  } catch {
    parsed = { raw: text };
  }
  return { status: res.status, body: parsed };
}

/** Monte un scénario de test : base + serveur, nettoyes apres le describe. */
export function withServer(
  name: string,
  fn: (t: { baseUrl: string; db: DatabaseSync }) => void | Promise<void>
): void {
  describe(name, () => {
    let testDb: TestDb;
    let testServer: TestServer;
    before(async () => {
      testDb = createTestDb();
      testServer = await startTestServer(testDb.dbPath);
    });
    after(() => {
      testServer.cleanup();
      testDb.cleanup();
    });
    fn({ get baseUrl() { return testServer.baseUrl; }, get db() { return testDb.db; } });
  });
}
