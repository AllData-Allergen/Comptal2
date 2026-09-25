// Couche SQLite de Comptal2.1 — 1 fichier comptal.db par profil.
// Toutes les requêtes passent par ici (logs de type "data" automatiques).
import Database from '@tauri-apps/plugin-sql';
import i18n from '../i18n/config';
import { Logger, withLog } from './logger';
import { assertSafeProfileId } from '../utils/security';

export const SCHEMA_VERSION = 17;

const SCHEMA_V1: string[] = [
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
  `CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    value_date TEXT,
    debit REAL NOT NULL DEFAULT 0,
    credit REAL NOT NULL DEFAULT 0,
    label TEXT NOT NULL DEFAULT '',
    category_code TEXT,
    import_id INTEGER REFERENCES imports(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_tx_account_date ON transactions(account_id, date)`,
  `CREATE INDEX IF NOT EXISTS idx_tx_date ON transactions(date)`,
  `CREATE INDEX IF NOT EXISTS idx_tx_category ON transactions(category_code)`,
  `CREATE TABLE IF NOT EXISTS autocat_stats (
    word TEXT NOT NULL,
    category_code TEXT NOT NULL,
    count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (word, category_code)
  )`,
];

const SCHEMA_V2: string[] = [
  `CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    initial_balance REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS project_subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('debit','credit')),
    amount REAL NOT NULL,
    periodicity TEXT NOT NULL DEFAULT 'monthly',
    start_date TEXT NOT NULL,
    category_code TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
];

const SCHEMA_V3: string[] = [
  `CREATE TABLE IF NOT EXISTS import_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
    initial_balance REAL,
    column_roles_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT
  )`,
];

const SCHEMA_V4_INDEXES: string[] = [
  `CREATE INDEX IF NOT EXISTS idx_project_subs_project ON project_subscriptions(project_id)`,
  `CREATE INDEX IF NOT EXISTS idx_project_subs_parent ON project_subscriptions(parent_id)`,
];

const SCHEMA_V5: string[] = [
  `CREATE TABLE IF NOT EXISTS invoice_emetteur (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    payload TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS invoice_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    payload TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS pdf_templates (
    id TEXT PRIMARY KEY,
    payload TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS legal_mentions (
    id TEXT PRIMARY KEY,
    payload TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS clients (
    id TEXT PRIMARY KEY,
    code_client TEXT,
    type TEXT NOT NULL,
    archived INTEGER NOT NULL DEFAULT 0,
    payload TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
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
  `CREATE TABLE IF NOT EXISTS postes_catalogue (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL DEFAULT 'facturation',
    payload TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS postes_groupes (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL DEFAULT 'facturation',
    payload TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS secteurs_activite (
    id TEXT PRIMARY KEY,
    payload TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS association_config (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    payload TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS donateurs (
    id TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS donateur_transactions (
    transaction_id TEXT PRIMARY KEY,
    donateur_id TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS dons_manuels (
    id TEXT PRIMARY KEY,
    donateur_id TEXT NOT NULL,
    payload TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS registre_recus (
    id TEXT PRIMARY KEY,
    payload TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_devis_client ON devis(client_id)`,
  `CREATE INDEX IF NOT EXISTS idx_factures_client ON factures(client_id)`,
  `CREATE INDEX IF NOT EXISTS idx_devis_numero ON devis(numero)`,
  `CREATE INDEX IF NOT EXISTS idx_factures_numero ON factures(numero)`,
  `CREATE INDEX IF NOT EXISTS idx_postes_kind ON postes_catalogue(kind)`,
  `CREATE INDEX IF NOT EXISTS idx_groupes_kind ON postes_groupes(kind)`,
  `CREATE TABLE IF NOT EXISTS contact_groups (
    id TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
];

const SCHEMA_V8: string[] = [
  `CREATE TABLE IF NOT EXISTS register_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    payload TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS register_documents (
    id TEXT PRIMARY KEY,
    number TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL CHECK(type IN ('reference','invoice_summary','cashflow_summary')),
    title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'generated' CHECK(status IN ('generated','archived')),
    period_start TEXT NOT NULL,
    period_end TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    snapshot TEXT NOT NULL,
    pdf_path TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS register_items (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL REFERENCES register_documents(id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    amount REAL,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS register_links (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL REFERENCES register_documents(id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    value TEXT NOT NULL DEFAULT '',
    url TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS register_attachments (
    id TEXT PRIMARY KEY,
    document_id TEXT REFERENCES register_documents(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    path TEXT NOT NULL,
    mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_register_documents_created ON register_documents(created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_register_items_document ON register_items(document_id)`,
  `CREATE INDEX IF NOT EXISTS idx_register_links_document ON register_links(document_id)`,
  `CREATE INDEX IF NOT EXISTS idx_register_attachments_document ON register_attachments(document_id)`,
];

const SCHEMA_V9: string[] = [
  `CREATE TABLE IF NOT EXISTS donations (
    id TEXT PRIMARY KEY,
    contact_id TEXT,
    anonymous INTEGER NOT NULL DEFAULT 0 CHECK(anonymous IN (0,1)),
    donor_label TEXT,
    source TEXT NOT NULL CHECK(source IN ('manuel','transaction')),
    transaction_id TEXT UNIQUE,
    nature TEXT NOT NULL CHECK(nature IN ('numeraire','nature','mecenat_competences')),
    payment_method TEXT,
    amount REAL NOT NULL CHECK(amount > 0),
    donation_date TEXT NOT NULL,
    received_date TEXT,
    description TEXT,
    valuation_method TEXT,
    valuation_by_donor INTEGER NOT NULL DEFAULT 0 CHECK(valuation_by_donor IN (0,1)),
    notes TEXT,
    receipt_eligible INTEGER NOT NULL DEFAULT 1 CHECK(receipt_eligible IN (0,1)),
    receipt_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    CHECK((anonymous = 1 AND contact_id IS NULL) OR (anonymous = 0 AND contact_id IS NOT NULL))
  )`,
  `CREATE TABLE IF NOT EXISTS donation_rules (
    id TEXT PRIMARY KEY,
    contact_id TEXT NOT NULL,
    label_contains TEXT NOT NULL DEFAULT '',
    category_code TEXT,
    payment_method TEXT NOT NULL DEFAULT 'virement',
    active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_donations_date ON donations(donation_date DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_donations_contact ON donations(contact_id)`,
  `CREATE INDEX IF NOT EXISTS idx_donations_receipt ON donations(receipt_id)`,
  `CREATE INDEX IF NOT EXISTS idx_donation_rules_contact ON donation_rules(contact_id)`,
];

const SCHEMA_V10: string[] = [
  `CREATE TABLE IF NOT EXISTS color_palettes (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    payload TEXT NOT NULL
  )`,
];

const SCHEMA_V11: string[] = [
  `CREATE TABLE IF NOT EXISTS label_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    word TEXT NOT NULL UNIQUE,
    category_code TEXT,
    tag TEXT,
    active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
];

const SCHEMA_V12: string[] = [
  `CREATE TABLE IF NOT EXISTS dashboard_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    payload TEXT NOT NULL
  )`,
];

const SCHEMA_V13: string[] = [
  `CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`,
];

const SCHEMA_V14: string[] = [
  `CREATE TABLE IF NOT EXISTS category_groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#64748b',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
];

const SCHEMA_V15: string[] = [
  `CREATE TABLE IF NOT EXISTS plugin_state (
    plugin_id TEXT PRIMARY KEY,
    enabled INTEGER NOT NULL DEFAULT 0,
    applied_at TEXT
  )`,
];

const SCHEMA_V16: string[] = [
  `CREATE TABLE IF NOT EXISTS immobilisations (
    id TEXT PRIMARY KEY,
    designation TEXT NOT NULL,
    reference TEXT,
    type_immobilisation TEXT NOT NULL CHECK(type_immobilisation IN (
      'materiel_informatique','materiel_bureau','outillage','vehicule','mobilier','logiciel','autre'
    )),
    valeur_acquisition_ht REAL NOT NULL DEFAULT 0,
    taux_tva REAL NOT NULL DEFAULT 20,
    date_acquisition TEXT NOT NULL,
    date_mise_en_service TEXT NOT NULL,
    duree_annees REAL NOT NULL DEFAULT 5,
    methode TEXT NOT NULL DEFAULT 'lineaire' CHECK(methode IN ('lineaire','degressif','non_amortissable')),
    valeur_residuelle REAL NOT NULL DEFAULT 0,
    statut TEXT NOT NULL DEFAULT 'actif' CHECK(statut IN ('actif','cede','mis_au_rebut')),
    date_cession TEXT,
    valeur_cession REAL,
    fournisseur TEXT,
    facture_ref TEXT,
    notes TEXT,
    faible_valeur INTEGER NOT NULL DEFAULT 0,
    subvention_investissement REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_immo_statut ON immobilisations(statut)`,
  `CREATE INDEX IF NOT EXISTS idx_immo_type ON immobilisations(type_immobilisation)`,
  `CREATE INDEX IF NOT EXISTS idx_immo_mise_en_service ON immobilisations(date_mise_en_service)`,
  `CREATE TABLE IF NOT EXISTS amortissement_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    payload TEXT NOT NULL
  )`,
];

const SCHEMA_V17: string[] = [
  `CREATE TABLE IF NOT EXISTS immobilisation_attachments (
    id TEXT PRIMARY KEY,
    immobilisation_id TEXT NOT NULL REFERENCES immobilisations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    path TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_immo_attachments_immo ON immobilisation_attachments(immobilisation_id)`,
];

let db: Database | null = null;
let currentProfileId: string | null = null;
let transactionQueue: Promise<void> = Promise.resolve();
let transactionActive = false;

function requireDb(): Database {
  if (!db) {
    throw new Error(i18n.t('errors.dbNotOpen'));
  }
  return db;
}

async function addColumnIfMissing(
  database: Database,
  table: string,
  column: string,
  sqlType: string
): Promise<void> {
  const cols = await database.select<Array<{ name: string }>>(`PRAGMA table_info(${table})`);
  if (cols.some((c) => c.name === column)) return;
  await database.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${sqlType}`);
}

async function ensureSchema(database: Database): Promise<void> {
  // CREATE IF NOT EXISTS — répare les bases dont user_version a été avancé sans créer les tables.
  for (const statement of [
    ...SCHEMA_V1,
    ...SCHEMA_V2,
    ...SCHEMA_V3,
    ...SCHEMA_V5,
    ...SCHEMA_V8,
    ...SCHEMA_V9,
    ...SCHEMA_V10,
    ...SCHEMA_V11,
    ...SCHEMA_V12,
    ...SCHEMA_V13,
    ...SCHEMA_V14,
    ...SCHEMA_V15,
    ...SCHEMA_V16,
    ...SCHEMA_V17,
  ]) {
    await database.execute(statement);
  }
  await addColumnIfMissing(database, 'categories', 'group_id', 'INTEGER');
  await database.execute('CREATE INDEX IF NOT EXISTS idx_categories_group ON categories(group_id)');
  await addColumnIfMissing(database, 'projects', 'updated_at', 'TEXT');
  await addColumnIfMissing(database, 'projects', 'widget_layout', 'TEXT');
  await addColumnIfMissing(database, 'project_subscriptions', 'parent_id', 'INTEGER');
  await addColumnIfMissing(database, 'project_subscriptions', 'is_group', 'INTEGER NOT NULL DEFAULT 0');
  await addColumnIfMissing(database, 'project_subscriptions', 'end_date', 'TEXT');
  await addColumnIfMissing(
    database,
    'project_subscriptions',
    'color',
    "TEXT NOT NULL DEFAULT '#94a3b8'"
  );
  await addColumnIfMissing(
    database,
    'project_subscriptions',
    'sort_order',
    'INTEGER NOT NULL DEFAULT 0'
  );
  await addColumnIfMissing(database, 'transactions', 'tag', 'TEXT');
  await addColumnIfMissing(database, 'transactions', 'deleted_at', 'TEXT');
  for (const statement of SCHEMA_V4_INDEXES) {
    await database.execute(statement);
  }
  // V9 : les donateurs deviennent des rôles de Contacts, sans perdre les données V5.
  await database.execute(
    `UPDATE clients
     SET payload = json_set(payload, '$.roles', json_array('client'))
     WHERE json_type(payload, '$.roles') IS NULL`
  );
  await database.execute(
    `INSERT OR IGNORE INTO clients (id, code_client, type, archived, payload, updated_at)
     SELECT id, NULL, COALESCE(json_extract(payload, '$.type'), 'particulier'), 0,
            json_set(payload,
              '$.roles', json_array('donateur'),
              '$.adresseFacturation', json_extract(payload, '$.adresse')),
            updated_at
     FROM donateurs`
  );
  await database.execute(
    `UPDATE clients
     SET payload = json_set(
       payload,
       '$.roles',
       json_insert(COALESCE(json_extract(payload, '$.roles'), json_array()), '$[#]', 'donateur')
     )
     WHERE id IN (SELECT id FROM donateurs)
       AND NOT EXISTS (
         SELECT 1 FROM json_each(clients.payload, '$.roles') WHERE value = 'donateur'
       )`
  );
  await database.execute(
    `INSERT OR IGNORE INTO donations
      (id, contact_id, anonymous, donor_label, source, transaction_id, nature,
       payment_method, amount, donation_date, received_date, description,
       valuation_method, valuation_by_donor, notes, receipt_eligible, receipt_id,
       created_at, updated_at)
     SELECT id,
            CASE WHEN donateur_id = 'ANONYME' THEN NULL ELSE donateur_id END,
            CASE WHEN donateur_id = 'ANONYME' THEN 1 ELSE 0 END,
            json_extract(payload, '$.donorLabel'), 'manuel', NULL,
            COALESCE(json_extract(payload, '$.natureDon'), 'numeraire'),
            json_extract(payload, '$.modeVersement'),
            json_extract(payload, '$.montant'),
            substr(json_extract(payload, '$.date'), 1, 10),
            substr(json_extract(payload, '$.datePerception'), 1, 10),
            json_extract(payload, '$.description'), NULL,
            CASE WHEN json_extract(payload, '$.natureDon') = 'numeraire' THEN 0 ELSE 1 END,
            json_extract(payload, '$.notes'),
            CASE WHEN donateur_id = 'ANONYME' THEN 0 ELSE 1 END,
            NULL,
            COALESCE(json_extract(payload, '$.createdAt'), datetime('now')),
            COALESCE(json_extract(payload, '$.updatedAt'), datetime('now'))
     FROM dons_manuels
     WHERE json_extract(payload, '$.montant') > 0`
  );
  await database.execute(
    `INSERT OR IGNORE INTO donations
      (id, contact_id, anonymous, donor_label, source, transaction_id, nature,
       payment_method, amount, donation_date, received_date, description,
       valuation_method, valuation_by_donor, notes, receipt_eligible, receipt_id,
       created_at, updated_at)
     SELECT 'legacy-tx-' || dt.transaction_id, dt.donateur_id, 0, NULL,
            'transaction', dt.transaction_id, 'numeraire', 'virement',
            t.credit, t.date, t.date, t.label, NULL, 0, NULL, 1, NULL,
            COALESCE(t.created_at, datetime('now')), COALESCE(t.updated_at, t.created_at, datetime('now'))
     FROM donateur_transactions dt
     JOIN transactions t ON CAST(t.id AS TEXT) = dt.transaction_id
     WHERE t.credit > 0`
  );
}

async function migrate(database: Database): Promise<void> {
  const rows = await database.select<Array<{ user_version: number }>>('PRAGMA user_version');
  const version = rows[0]?.user_version ?? 0;
  if (version < SCHEMA_VERSION) {
    Logger.data('Db.migrate', `Migration du schéma v${version} -> v${SCHEMA_VERSION}`);
  }
  await ensureSchema(database);
  if (version !== SCHEMA_VERSION) {
    await database.execute(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  }
}

export const Db = {
  get profileId(): string | null {
    return currentProfileId;
  },

  get isOpen(): boolean {
    return db !== null;
  },

  /** Ouvre (ou crée) la base du profil et applique les migrations. */
  async openForProfile(profileId: string): Promise<void> {
    await withLog('Db.openForProfile', async () => {
      assertSafeProfileId(profileId);
      const sessionInfo = Logger.session;
      if (!sessionInfo) {
        throw new Error('Logger non initialisé');
      }
      if (db) {
        await db.close();
        db = null;
        currentProfileId = null;
      }
      const root = sessionInfo.dataRoot.replace(/\\/g, '/');
      const path = `${root}/profils/${profileId}/comptal.db`;
      let opened: Database | null = null;
      try {
        opened = await Database.load(`sqlite:${path}`);
        await opened.execute('PRAGMA foreign_keys = ON');
        await opened.execute('PRAGMA journal_mode = WAL');
        await opened.execute('PRAGMA busy_timeout = 10000');
        await migrate(opened);
        db = opened;
        currentProfileId = profileId;
        Logger.data('Db.openForProfile', 'Base ouverte');
      } catch (err) {
        await opened?.close().catch(() => undefined);
        db = null;
        currentProfileId = null;
        throw err;
      }
    }, { data: { profileId } });
  },

  async close(): Promise<void> {
    if (db) {
      await db.close();
      db = null;
      currentProfileId = null;
      Logger.data('Db.close', 'Base fermée');
    }
  },

  /** Fusionne le WAL dans comptal.db pour un export ZIP complet et cohérent. */
  async checkpoint(): Promise<void> {
    await withLog('Db.checkpoint', async () => {
      await requireDb().execute('PRAGMA wal_checkpoint(TRUNCATE)');
    });
  },

  /** SELECT avec log (data) et mesure de durée (perf si > 100 ms). */
  async select<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    const startedAt = performance.now();
    try {
      const result = await requireDb().select<T[]>(sql, params);
      const duration = performance.now() - startedAt;
      if (duration > 100) {
        Logger.perf('Db.select', sql.slice(0, 120), duration);
      }
      return result;
    } catch (err) {
      Logger.error('Db.select', err, sql.slice(0, 120));
      throw err;
    }
  },

  /** INSERT/UPDATE/DELETE avec log (data). */
  async execute(
    sql: string,
    params: unknown[] = []
  ): Promise<{ rowsAffected: number; lastInsertId?: number }> {
    const startedAt = performance.now();
    try {
      const result = await requireDb().execute(sql, params);
      const duration = performance.now() - startedAt;
      Logger.data('Db.execute', sql.slice(0, 120), {
        rowsAffected: result.rowsAffected,
        durationMs: Math.round(duration),
      });
      return { rowsAffected: result.rowsAffected, lastInsertId: result.lastInsertId };
    } catch (err) {
      Logger.error('Db.execute', err, sql.slice(0, 120));
      throw err;
    }
  },

  /** Exécute un lot d'instructions dans une transaction SQL (pool SQLite = 1 connexion). */
  async inTransaction(fnName: string, run: () => Promise<void>): Promise<void> {
    if (transactionActive) {
      throw new Error(`Transaction imbriquée refusée (${fnName})`);
    }
    const database = requireDb();
    const task = transactionQueue.then(async () => {
      transactionActive = true;
      try {
        await database.execute('BEGIN IMMEDIATE');
        try {
          await run();
          await database.execute('COMMIT');
        } catch (err) {
          await database.execute('ROLLBACK').catch(() => undefined);
          Logger.error(fnName, err, 'Transaction annulée (ROLLBACK)');
          throw err;
        }
      } finally {
        transactionActive = false;
      }
    });
    transactionQueue = task.catch(() => undefined);
    return task;
  },
};
