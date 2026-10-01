import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const root = path.resolve(import.meta.dirname, '..');
const source = fs.readFileSync(path.join(root, 'src/services/db.ts'), 'utf8');
const calculations = await import(
  path.join(root, 'src/services/microEnterpriseCalculations.ts')
);
const invoiceLegal = await import(path.join(root, 'src/services/InvoiceLegalService.ts'));

assert.match(source, /SCHEMA_VERSION\s*=\s*18\b/, 'Le schéma doit être en version 18');
const block = source.match(/const SCHEMA_V18:[\s\S]*?=\s*\[([\s\S]*?)\n\];/);
assert.ok(block, 'Le bloc SCHEMA_V18 doit exister');
const statements = [...block[1].matchAll(/`([\s\S]*?)`/g)].map((match) => match[1]);
assert.ok(statements.length >= 7, 'Le schéma micro doit contenir tables, index et triggers');

const db = new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys = ON');
db.exec('PRAGMA user_version = 17');
for (const statement of statements) db.exec(statement);
db.exec('PRAGMA user_version = 18');
assert.equal(
  db.prepare('PRAGMA user_version').get().user_version,
  18,
  'La migration doit faire évoluer un profil v17 vers v18'
);

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

const config = {
  enabled: true,
  businessStartDate: '2026-01-01',
  fiscalYear: 2026,
  regimeFiscal: 'micro_bnc',
  declarationFrequency: 'quarterly',
  versementLiberatoire: true,
  socialRate: 25.6,
  trainingRate: 0.2,
  incomeTaxRate: 2.2,
  microThreshold: 83600,
  vatBaseThreshold: 37500,
  vatToleranceThreshold: 41250,
  estimatedMonthlyToolsCost: 40,
};
const receipt = (amount, receivedDate = '2026-06-15') => ({
  id: crypto.randomUUID(),
  sequence: 1,
  receivedDate,
  clientName: 'Client test',
  description: 'Prestation',
  amount,
  paymentMethod: 'virement',
  source: 'manual',
  createdAt: `${receivedDate}T12:00:00.000Z`,
});
const summary = calculations.calculateMicroSummary(
  config,
  [receipt(1000), receipt(-100)],
  [receipt(30000), receipt(8000)],
  '2026-06-01',
  '2026-06-30'
);
assert.equal(summary.periodCollected, 900, 'Le CA doit être calculé sur les encaissements nets');
assert.equal(summary.socialContributions, 230.4);
assert.equal(summary.trainingContribution, 1.8);
assert.equal(summary.incomeTaxProvision, 19.8);
assert.equal(summary.totalProvision, 252);
assert.equal(summary.estimatedRemainder, 608);
assert.equal(summary.warningLevel, 100, 'Le seuil TVA dépassé doit produire une alerte à 100 %');

const quarterlyDeadlines = calculations.buildMicroDeadlines(config, new Date(2026, 4, 15));
assert.equal(quarterlyDeadlines[0].date, '2026-07-31');
assert.ok(quarterlyDeadlines.some((item) => item.kind === 'tax'));
assert.ok(quarterlyDeadlines.some((item) => item.kind === 'cfe'));
assert.ok(quarterlyDeadlines.some((item) => item.kind === 'einvoicing'));
const monthlyDeadlines = calculations.buildMicroDeadlines(
  { declarationFrequency: 'monthly' },
  new Date(2026, 0, 15)
);
assert.equal(monthlyDeadlines.find((item) => item.kind === 'urssaf').date, '2026-02-28');

const microIssuer = {
  type: 'auto_entrepreneur',
  denominationSociale: 'Entreprise test',
  regimeTVA: 'franchise',
  siren: '123456789',
  siret: '12345678900012',
};
assert.equal(invoiceLegal.legalIssuerName(microIssuer), 'Entreprise test EI');
assert.deepEqual(
  invoiceLegal.validateMicroInvoice(
    { postes: [{ tauxTVA: 20 }] },
    microIssuer
  ),
  ['Une micro-entreprise en franchise de TVA doit facturer toutes les lignes à 0 % de TVA.']
);

const app = fs.readFileSync(path.join(root, 'src/App.tsx'), 'utf8');
assert.match(app, /path="\/micro-entreprise"/, 'La route micro-entreprise doit être enregistrée');
const exportsSource = fs.readFileSync(path.join(root, 'src/services/ExportService.ts'), 'utf8');
assert.match(exportsSource, /exportMicroReceiptsCsv/, 'L’export CSV du livre doit être disponible');
assert.match(exportsSource, /exportMicroReceiptsExcel/, 'L’export Excel du livre doit être disponible');
const pdfSource = fs.readFileSync(path.join(root, 'src/services/MicroEnterprisePDFService.ts'), 'utf8');
assert.match(pdfSource, /Livre des recettes/, 'L’export PDF du livre doit être disponible');

console.log(
  JSON.stringify(
    {
      schemaVersion: 18,
      migratedFrom: 17,
      statements: statements.length,
      immutableLedger: true,
      duplicateProtection: true,
      reversalBalance: total,
      calculations: {
        collected: summary.periodCollected,
        provision: summary.totalProvision,
        warningLevel: summary.warningLevel,
      },
      deadlines: {
        quarterlyFirst: quarterlyDeadlines[0].date,
        monthlyFirst: monthlyDeadlines.find((item) => item.kind === 'urssaf').date,
      },
      invoiceFranchiseValidation: true,
      exports: ['csv', 'xlsx', 'pdf'],
      route: '/micro-entreprise',
    },
    null,
    2
  )
);
