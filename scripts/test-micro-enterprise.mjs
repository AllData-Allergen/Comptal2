import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const root = path.resolve(import.meta.dirname, '..');
const source = fs.readFileSync(path.join(root, 'src/services/db.ts'), 'utf8');

assert.match(source, /SCHEMA_VERSION\s*=\s*18\b/, 'Le schéma doit être en version 18');
const block = source.match(/const SCHEMA_V18:[\s\S]*?=\s*\[([\s\S]*?)\n\];/);
assert.ok(block, 'Le bloc SCHEMA_V18 doit exister');
const statements = [...block[1].matchAll(/`([\s\S]*?)`/g)].map((match) => match[1]);
assert.ok(statements.length >= 7, 'Le schéma micro doit contenir tables, index et triggers');

const db = new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys = ON');
for (const statement of statements) db.exec(statement);

db.prepare('INSERT INTO micro_enterprise_config (id, payload) VALUES (1, ?)').run(
  JSON.stringify({ enabled: true, regimeFiscal: 'micro_bnc', socialRate: 25.6 })
);
db.prepare(
  `INSERT INTO micro_receipts
   (id, sequence, received_date, client_name, description, amount, payment_method,
    source_payment_id, source)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
).run(
  'receipt-1',
  1,
  '2026-10-01',
  'Client test',
  'Automatisation test',
  1000,
  'virement',
  'payment-1',
  'invoice_payment'
);

assert.throws(
  () =>
    db
      .prepare(
        `INSERT INTO micro_receipts
         (id, sequence, received_date, client_name, description, amount, payment_method,
          source_payment_id, source)
         VALUES ('duplicate', 2, '2026-10-01', 'Client', 'Test', 10, 'virement',
                 'payment-1', 'invoice_payment')`
      )
      .run(),
  /UNIQUE/,
  'Un paiement ne doit pas créer deux recettes'
);
assert.throws(
  () => db.prepare("UPDATE micro_receipts SET amount = 999 WHERE id = 'receipt-1'").run(),
  /inaltérable/,
  'Une recette ne doit pas être modifiable'
);
assert.throws(
  () => db.prepare("DELETE FROM micro_receipts WHERE id = 'receipt-1'").run(),
  /inaltérable/,
  'Une recette ne doit pas être supprimable'
);

db.prepare(
  `INSERT INTO micro_receipts
   (id, sequence, received_date, client_name, description, amount, payment_method,
    source_payment_id, source, reverses_id)
   VALUES ('reversal-1', 2, '2026-10-02', 'Client test', 'Contrepassation', -1000,
           'virement', 'reversal:payment-1', 'reversal', 'receipt-1')`
).run();
const total = db.prepare('SELECT SUM(amount) AS total FROM micro_receipts').get().total;
assert.equal(total, 0, 'La contrepassation doit annuler la recette sans effacer l’historique');

const app = fs.readFileSync(path.join(root, 'src/App.tsx'), 'utf8');
assert.match(app, /path="\/micro-entreprise"/, 'La route micro-entreprise doit être enregistrée');

console.log(
  JSON.stringify(
    {
      schemaVersion: 18,
      statements: statements.length,
      immutableLedger: true,
      duplicateProtection: true,
      reversalBalance: total,
      route: '/micro-entreprise',
    },
    null,
    2
  )
);
