import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), 'fixture-profil');
mkdirSync(root, { recursive: true });
const dbPath = join(root, 'comptal.db');
if (existsSync(dbPath)) unlinkSync(dbPath);

const db = new DatabaseSync(dbPath);
db.exec(`
CREATE TABLE accounts (
  id INTEGER PRIMARY KEY, code TEXT, name TEXT, color TEXT,
  initial_balance REAL, created_at TEXT
);
CREATE TABLE transactions (
  id INTEGER PRIMARY KEY, account_id INTEGER, date TEXT, value_date TEXT,
  debit REAL, credit REAL, label TEXT, category_code TEXT, import_id INTEGER,
  created_at TEXT, updated_at TEXT, deleted_at TEXT
);
CREATE TABLE clients (
  id TEXT PRIMARY KEY, code_client TEXT, type TEXT, archived INTEGER,
  payload TEXT, updated_at TEXT
);
CREATE TABLE devis (
  id TEXT PRIMARY KEY, client_id TEXT, numero TEXT, statut TEXT,
  supprime INTEGER, payload TEXT, updated_at TEXT
);
CREATE TABLE factures (
  id TEXT PRIMARY KEY, client_id TEXT, numero TEXT, statut TEXT,
  devis_origine TEXT, supprime INTEGER, payload TEXT, updated_at TEXT
);
INSERT INTO accounts VALUES (1,'C1','Compte demo','#4a90e2',0,datetime('now'));
INSERT INTO clients VALUES (
  'cli1','CL-001','entreprise',0,
  '{"id":"cli1","nom":"Acme SARL","type":"entreprise"}',
  datetime('now')
);
INSERT INTO transactions VALUES (
  10,1,'2026-09-01',NULL,0,1200,'VIR ACME FACT-2026-001','',NULL,datetime('now'),NULL,NULL
);
INSERT INTO transactions VALUES (
  11,1,'2026-09-02',NULL,0,500,'VIR DIVERS','',NULL,datetime('now'),NULL,NULL
);
`);

const facturePayload = {
  id: 'fac1',
  numero: 'FACT-2026-001',
  clientId: 'cli1',
  totalTTC: 1200,
  totalHT: 1000,
  totalTVA: {},
  statut: 'envoyee',
  paiements: [],
  documentType: 'facture',
  dateEmission: '2026-08-20T00:00:00.000Z',
  postes: [],
  vendeur: {
    denominationSociale: 'Demo',
    formeJuridique: 'SAS',
    adresse: {},
    siren: '',
    siret: '',
    numeroTVA: '',
  },
  createdAt: '2026-08-20T00:00:00.000Z',
  updatedAt: '2026-08-20T00:00:00.000Z',
};

db.prepare(
  `INSERT INTO factures VALUES (?,?,?,?,?,?,?,?)`
).run(
  'fac1',
  'cli1',
  'FACT-2026-001',
  'envoyee',
  null,
  0,
  JSON.stringify(facturePayload),
  new Date().toISOString()
);

db.prepare(`INSERT INTO devis VALUES (?,?,?,?,?,?,?)`).run(
  'dev1',
  'cli1',
  'DEV-2026-001',
  'accepte',
  0,
  JSON.stringify({
    id: 'dev1',
    numero: 'DEV-2026-001',
    clientId: 'cli1',
    totalTTC: 1200,
    statut: 'accepte',
    documentType: 'devis',
  }),
  new Date().toISOString()
);

writeFileSync(
  join(root, 'info.json'),
  JSON.stringify({ id: 'fixture-profil', name: 'Fixture Agent API', mode: 'tpe' }, null, 2)
);
db.close();
console.log('fixture ok', dbPath);
