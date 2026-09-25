/**
 * Vérifie que le solde initial d'un profil Comptal2 vient de la
 * plus ancienne ligne d'historique (pas du dernier solde connu).
 *
 * Usage : node --experimental-strip-types scripts/test-legacy-initial-balance.ts
 */
import Papa from 'papaparse';
import {
  groupHistoryRowsByAccountCode,
  oldestSoldeCompteEntry,
  resolveInitialBalanceFromHistory,
  type Comptal2HistoryRow,
} from '../src/utils/legacyInitialBalance';

let failed = 0;

function assertEqual(actual: unknown, expected: unknown, label: string): void {
  const ok = Object.is(actual, expected) || actual === expected;
  if (!ok) {
    failed += 1;
    console.error(`FAIL ${label}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
    return;
  }
  console.log(`ok   ${label}`);
}

function row(
  date: string,
  extras: Partial<Comptal2HistoryRow> = {}
): Comptal2HistoryRow {
  return { Date: date, ...extras };
}

// 1. Colonne Solde initial de la date la plus ancienne, même si le fichier est du plus récent au plus ancien
{
  const rows = [
    row('31/12/2024', { 'Solde initial': '', Solde: 5000, Débit: 0, Crédit: 10 }),
    row('01/01/2023', { 'Solde initial': 1200.5, Solde: 1210.5, Débit: 0, Crédit: 10 }),
    row('15/06/2023', { 'Solde initial': '', Solde: 2000, Débit: -50, Crédit: 0 }),
  ];
  assertEqual(resolveInitialBalanceFromHistory(rows), 1200.5, 'Solde initial de la plus ancienne date');
}

// 2. Plusieurs fichiers : le Solde initial d'un import récent ne doit pas gagner
{
  const rows = [
    row('01/01/2025', { 'Solde initial': 9999, Solde: 10000, Débit: 0, Crédit: 1 }),
    row('03/03/2020', { 'Solde initial': 250, Solde: 240, Débit: -10, Crédit: 0 }),
  ];
  assertEqual(
    resolveInitialBalanceFromHistory(rows, [{ date: '01/01/2025', solde: '9999' }]),
    250,
    'plus ancienne ligne, pas le dernier solde_compte'
  );
}

// 3. Sans colonne Solde initial : dériver depuis Solde − mouvement
{
  const rows = [
    row('02/02/2022', { Solde: 80, Débit: -20, Crédit: 0 }),
    row('03/02/2022', { Solde: 100, Débit: 0, Crédit: 20 }),
  ];
  assertEqual(resolveInitialBalanceFromHistory(rows), 100, 'dérivé Solde − débit (débit négatif)');
}

{
  const rows = [row('02/02/2022', { Solde: 150, Débit: 0, Crédit: 50 })];
  assertEqual(resolveInitialBalanceFromHistory(rows), 100, 'dérivé Solde − crédit');
}

{
  const rows = [row('02/02/2022', { Solde: 80, Débit: 20, Crédit: 0 })];
  assertEqual(resolveInitialBalanceFromHistory(rows), 100, 'dérivé avec débit positif dans le CSV');
}

// 4. 0 est un solde initial valide
{
  const rows = [row('01/01/2021', { 'Solde initial': 0, Solde: -10, Débit: -10, Crédit: 0 })];
  assertEqual(resolveInitialBalanceFromHistory(rows, 999), 0, 'zéro conservé, pas le repli solde_compte');
}

// 5. Repli solde_compte.json : entrée la plus ancienne du tableau
{
  const raw = [
    { date: '15/06/2024', solde: '3000' },
    { date: '01/01/2020', solde: '111.11' },
    { date: '01/01/2023', solde: '2000' },
  ];
  assertEqual(oldestSoldeCompteEntry(raw), 111.11, 'solde_compte plus ancienne date');
  assertEqual(resolveInitialBalanceFromHistory([], raw), 111.11, 'repli sans CSV');
}

// 6. Format objet unique / nombre
{
  assertEqual(oldestSoldeCompteEntry({ date: '01/01/2019', solde: '42' }), 42, 'objet unique daté');
  assertEqual(oldestSoldeCompteEntry(75), 75, 'nombre brut');
}

// 7. Groupement multi-comptes par préfixe de fichier
{
  const grouped = groupHistoryRowsByAccountCode(
    [
      {
        fileName: 'CCAL_01.01.2024_31.01.2024.csv',
        rows: [row('15/01/2024', { 'Solde initial': 10, Compte: 'Caisse' })],
      },
      {
        fileName: 'CCAL_01.01.2023_31.12.2023.csv',
        rows: [row('01/01/2023', { 'Solde initial': 40, Compte: 'Caisse' })],
      },
      {
        fileName: 'LIVRET_01.01.2023_31.12.2023.csv',
        rows: [row('01/06/2023', { 'Solde initial': 800, Compte: 'Livret A' })],
      },
    ],
    [
      { id: 1, code: 'CCAL', name: 'Caisse' },
      { id: 2, code: 'LIVRET', name: 'Livret A' },
    ]
  );
  assertEqual(
    resolveInitialBalanceFromHistory(grouped.get('CCAL') ?? []),
    40,
    'CCAL : plus ancienne des deux fichiers'
  );
  assertEqual(
    resolveInitialBalanceFromHistory(grouped.get('LIVRET') ?? []),
    800,
    'LIVRET indépendant'
  );
}

// 8. CSV Comptal2 réel (Papa) : fichier récent d'abord, plus ancienne ligne ensuite
{
  const recent = Papa.parse<Comptal2HistoryRow>(
    [
      'Source;Compte;Date;Date de valeur;Débit;Crédit;Libellé;Solde;catégorie;Solde initial;Index',
      'CCAL_01.01.2025_31.01.2025.csv;Caisse;05/01/2025;05/01/2025;0;100;Salaire;5100;;5000;20250105,5100',
    ].join('\n'),
    { header: true, delimiter: ';', skipEmptyLines: true }
  );
  const oldest = Papa.parse<Comptal2HistoryRow>(
    [
      'Source;Compte;Date;Date de valeur;Débit;Crédit;Libellé;Solde;catégorie;Solde initial;Index',
      'CCAL_01.01.2020_31.12.2020.csv;Caisse;10/02/2020;10/02/2020;-25;0;Frais;1475;;1500;20200210,1475',
      'CCAL_01.01.2020_31.12.2020.csv;Caisse;11/02/2020;11/02/2020;0;50;Vente;1525;;;20200211,1525',
    ].join('\n'),
    { header: true, delimiter: ';', skipEmptyLines: true }
  );
  const grouped = groupHistoryRowsByAccountCode(
    [
      { fileName: 'CCAL_01.01.2025_31.01.2025.csv', rows: recent.data },
      { fileName: 'CCAL_01.01.2020_31.12.2020.csv', rows: oldest.data },
    ],
    [{ id: 1, code: 'CCAL', name: 'Caisse' }]
  );
  assertEqual(
    resolveInitialBalanceFromHistory(grouped.get('CCAL') ?? [], [
      { date: '05/01/2025', solde: '5000' },
      { date: '10/02/2020', solde: '1500' },
    ]),
    1500,
    'CSV Papa : Solde initial de 2020, pas 2025'
  );
}

// 9. Sur un seul fichier, le solde final = solde initial + mouvements
{
  const parsed = Papa.parse<Comptal2HistoryRow>(
    [
      'Source;Compte;Date;Débit;Crédit;Solde;Solde initial',
      'CCAL.csv;Caisse;10/02/2020;-25;0;1475;1500',
      'CCAL.csv;Caisse;11/02/2020;0;50;1525;',
      'CCAL.csv;Caisse;12/02/2020;-100;0;1425;',
    ].join('\n'),
    { header: true, delimiter: ';', skipEmptyLines: true }
  );
  const initial = resolveInitialBalanceFromHistory(parsed.data);
  assertEqual(initial, 1500, 'fichier unique : Solde initial première ligne');
  let running = initial;
  for (const r of parsed.data) {
    const debitRaw = Number(String(r.Débit ?? '0').replace(',', '.')) || 0;
    const creditRaw = Number(String(r.Crédit ?? '0').replace(',', '.')) || 0;
    const debit = debitRaw > 0 ? -debitRaw : debitRaw;
    const credit = Math.abs(creditRaw);
    running = Math.round((running + debit + credit) * 100) / 100;
  }
  assertEqual(running, 1425, 'fichier unique : solde final cohérent');
}

if (failed > 0) {
  console.error(`\n${failed} assertion(s) en échec`);
  process.exit(1);
}
console.log('\nTous les cas passent');
