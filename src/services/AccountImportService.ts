import { FileStructure, PreviewRow } from '../types/import';
import { Account } from '../types/models';
import { withLog } from './logger';

export interface AccountValueStats {
  raw: string;
  count: number;
}

export interface AccountResolveResult {
  /** Valeur brute du fichier → account id */
  valueToId: Record<string, number>;
  /** Valeur brute → code compte (aperçu) */
  valueToCode: Record<string, string>;
  missing: AccountValueStats[];
  values: AccountValueStats[];
}

/** Préremplit code/nom à la création d'après la valeur CSV. */
export function suggestAccountDraft(raw: string): { code: string; name: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { code: '', name: '' };
  if (/^[A-Za-z0-9_-]{1,12}$/.test(trimmed)) {
    return { code: trimmed.toUpperCase(), name: trimmed };
  }
  const letters = trimmed
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]/g, '')
    .slice(0, 6)
    .toUpperCase();
  return { code: letters || 'CPT', name: trimmed };
}

/** Matching : code (case-insensitive) puis nom exact (case-insensitive). */
export function matchAccount(raw: string, accounts: Account[]): Account | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const upper = trimmed.toUpperCase();
  const byCode = accounts.find((a) => a.code.toUpperCase() === upper);
  if (byCode) return byCode;
  const lower = trimmed.toLowerCase();
  return accounts.find((a) => a.name.trim().toLowerCase() === lower) ?? null;
}

export function collectAccountValues(
  structure: FileStructure,
  accountColumnIndex: number
): AccountValueStats[] {
  const counts = new Map<string, number>();
  const dataRows = structure.rawData.slice(structure.dataStartRowIndex);
  for (const row of dataRows) {
    if (!row || row.length === 0) continue;
    const raw = String(row[accountColumnIndex] ?? '').trim();
    if (!raw) continue;
    counts.set(raw, (counts.get(raw) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([raw, count]) => ({ raw, count }))
    .sort((a, b) => a.raw.localeCompare(b.raw, undefined, { sensitivity: 'base' }));
}

export function resolveAccountMappings(
  values: AccountValueStats[],
  accounts: Account[]
): Omit<AccountResolveResult, 'values'> {
  const valueToId: Record<string, number> = {};
  const valueToCode: Record<string, string> = {};
  const missing: AccountValueStats[] = [];
  for (const item of values) {
    const found = matchAccount(item.raw, accounts);
    if (found) {
      valueToId[item.raw] = found.id;
      valueToCode[item.raw] = found.code;
    } else {
      missing.push(item);
    }
  }
  return { valueToId, valueToCode, missing };
}

export function applyAccountIdsToRows(
  rows: PreviewRow[],
  valueToId: Record<string, number>,
  valueToCode: Record<string, string>
): PreviewRow[] {
  return rows.map((row) => {
    const raw = row.accountRaw?.trim();
    if (!raw) {
      return {
        ...row,
        accountId: row.accountId ?? null,
        accountCode: row.accountCode ?? null,
      };
    }
    const id = valueToId[raw];
    const code = valueToCode[raw];
    return {
      ...row,
      accountId: id ?? null,
      accountCode: code ?? null,
    };
  });
}

export const AccountImportService = {
  suggestAccountDraft,
  matchAccount,
  collectAccountValues,
  resolveAccountMappings,
  applyAccountIdsToRows,

  async analyzeMappedAccounts(
    structure: FileStructure,
    accountColumnIndex: number,
    accounts: Account[]
  ): Promise<AccountResolveResult> {
    return withLog(
      'AccountImportService.analyzeMappedAccounts',
      async () => {
        const values = collectAccountValues(structure, accountColumnIndex);
        const resolved = resolveAccountMappings(values, accounts);
        return { ...resolved, values };
      },
      { data: { columnIndex: accountColumnIndex, accountCount: accounts.length } }
    );
  },
};
