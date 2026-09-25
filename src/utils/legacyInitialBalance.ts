/**
 * Solde initial d'un compte issu d'un profil Comptal2 :
 * la plus ancienne ligne d'historique (date min), pas le dernier solde connu.
 *
 * Comptal2 stocke « Solde initial » uniquement sur la première ligne de chaque
 * fichier CSV (après tri par date). `solde_compte.json` est une liste datée
 * `{ date, solde }` — on prend l'entrée la plus ancienne en repli.
 */
import { parseAmount, parseAmountOptional, roundMoney } from './amounts';
import { parseDateWithMultipleFormats, toIsoDate } from './dateFormats';

export interface Comptal2HistoryRow {
  Date?: string;
  Compte?: string;
  Solde?: string | number;
  'Solde initial'?: string | number;
  Débit?: string | number;
  Crédit?: string | number;
}

export type SoldeCompteRaw =
  | number
  | string
  | { date?: string; solde?: number | string }
  | Array<{ date?: string; solde?: number | string }>;

export interface AccountRef {
  id: number;
  code: string;
  name: string;
}

export function historyRowDateIso(row: Comptal2HistoryRow): string | null {
  const parsed = parseDateWithMultipleFormats(row.Date);
  return parsed ? toIsoDate(parsed) : null;
}

/** Débit ≤ 0, crédit ≥ 0 — même convention que la migration CSV. */
export function normalizedMovement(row: Comptal2HistoryRow): { debit: number; credit: number } {
  const debitRaw = parseAmount(row['Débit']);
  const creditRaw = parseAmount(row['Crédit']);
  return {
    debit: debitRaw > 0 ? -debitRaw : debitRaw,
    credit: Math.abs(creditRaw),
  };
}

/**
 * Solde avant la ligne : colonne « Solde initial » si présente,
 * sinon Solde − (débit + crédit) de la ligne.
 */
export function initialBalanceFromHistoryRow(row: Comptal2HistoryRow): number | null {
  const fromColumn = parseAmountOptional(row['Solde initial']);
  if (fromColumn !== null) {
    return roundMoney(fromColumn);
  }
  const solde = parseAmountOptional(row.Solde);
  if (solde === null) return null;
  const { debit, credit } = normalizedMovement(row);
  return roundMoney(solde - debit - credit);
}

/** Entrée la plus ancienne de `solde_compte.json` (tableau daté Comptal2). */
export function oldestSoldeCompteEntry(raw: SoldeCompteRaw | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number' || typeof raw === 'string') {
    return parseAmountOptional(raw);
  }
  const entries = Array.isArray(raw) ? raw : [raw];
  const dated: Array<{ date: string; solde: number }> = [];
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue;
    const solde = parseAmountOptional(entry.solde);
    if (solde === null) continue;
    const parsed = parseDateWithMultipleFormats(entry.date);
    if (!parsed) continue;
    dated.push({ date: toIsoDate(parsed), solde: roundMoney(solde) });
  }
  if (dated.length === 0) {
    const only = entries.length === 1 ? parseAmountOptional(entries[0]?.solde) : null;
    return only === null ? null : roundMoney(only);
  }
  dated.sort((a, b) => a.date.localeCompare(b.date));
  return dated[0].solde;
}

/**
 * Solde initial du compte = première ligne historique (date la plus ancienne).
 * Repli : plus ancienne entrée de `solde_compte.json`, sinon 0.
 */
export function resolveInitialBalanceFromHistory(
  rows: Comptal2HistoryRow[],
  soldeCompteRaw?: SoldeCompteRaw | null
): number {
  const dated = rows
    .map((row) => ({ row, date: historyRowDateIso(row) }))
    .filter((item): item is { row: Comptal2HistoryRow; date: string } => item.date !== null);

  if (dated.length > 0) {
    const minDate = dated.reduce((min, item) => (item.date < min ? item.date : min), dated[0].date);
    const oldestRows = dated.filter((item) => item.date === minDate).map((item) => item.row);
    for (const row of oldestRows) {
      const fromColumn = parseAmountOptional(row['Solde initial']);
      if (fromColumn !== null) {
        return roundMoney(fromColumn);
      }
    }
    for (const row of oldestRows) {
      const derived = initialBalanceFromHistoryRow(row);
      if (derived !== null) {
        return derived;
      }
    }
  }

  return oldestSoldeCompteEntry(soldeCompteRaw) ?? 0;
}

/** Préfixe `{CODE}_` du nom de fichier CSV Comptal2, sinon chaîne vide. */
export function accountCodeFromCsvFileName(fileName: string): string {
  const base = fileName.replace(/\\/g, '/').split('/').pop() ?? fileName;
  const prefix = base.split('_')[0]?.trim() ?? '';
  return prefix.toUpperCase();
}

export function resolveCsvAccountCode(
  fileName: string,
  rows: Comptal2HistoryRow[],
  accounts: AccountRef[]
): string | null {
  const byCode = new Map(accounts.map((a) => [a.code.toUpperCase(), a.code]));
  const byName = new Map(accounts.map((a) => [a.name.toUpperCase(), a.code]));
  const prefix = accountCodeFromCsvFileName(fileName);
  if (prefix && byCode.has(prefix)) {
    return byCode.get(prefix) ?? null;
  }
  const compteValue = (rows[0]?.Compte ?? '').trim().toUpperCase();
  if (compteValue) {
    if (byCode.has(compteValue)) return byCode.get(compteValue) ?? null;
    if (byName.has(compteValue)) return byName.get(compteValue) ?? null;
  }
  if (prefix) return prefix;
  return null;
}

export function groupHistoryRowsByAccountCode(
  files: Array<{ fileName: string; rows: Comptal2HistoryRow[] }>,
  accounts: AccountRef[]
): Map<string, Comptal2HistoryRow[]> {
  const grouped = new Map<string, Comptal2HistoryRow[]>();
  for (const file of files) {
    const datedRows = file.rows.filter((row) => historyRowDateIso(row));
    if (datedRows.length === 0) continue;
    const code = resolveCsvAccountCode(file.fileName, datedRows, accounts);
    if (!code) continue;
    const key = code.toUpperCase();
    const list = grouped.get(key) ?? [];
    list.push(...datedRows);
    grouped.set(key, list);
  }
  return grouped;
}
