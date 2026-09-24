import { isValid } from 'date-fns';
import {
  ColumnMappingConfig,
  FileStructure,
  OverlapWarning,
  PreviewRow,
} from '../types/import';
import { parseDateWithMultipleFormats, toIsoDate } from '../utils/dateFormats';
import { parseAmount, roundMoney } from '../utils/amounts';
import { Db } from './db';
import { withLog } from './logger';
import { ConfigService } from './ConfigService';
import { LabelRuleService } from './LabelRuleService';
import { neutralizeFormula } from '../utils/security';

function cell(row: unknown[], index: number): unknown {
  return row[index];
}

export function transformRows(
  structure: FileStructure,
  mapping: ColumnMappingConfig
): PreviewRow[] {
  const dataRows = structure.rawData.slice(structure.dataStartRowIndex);
  const isSingle = mapping.debitColumnIndex === mapping.creditColumnIndex;
  const result: PreviewRow[] = [];

  for (const row of dataRows) {
    if (!row || row.length === 0) continue;
    const date = parseDateWithMultipleFormats(cell(row, mapping.dateColumnIndex));
    if (!date || !isValid(date)) continue;
    const valueDateRaw =
      mapping.dateValueColumnIndex !== undefined
        ? parseDateWithMultipleFormats(cell(row, mapping.dateValueColumnIndex))
        : date;
    const valueDate = valueDateRaw && isValid(valueDateRaw) ? valueDateRaw : date;
    let debit = 0;
    let credit = 0;
    if (isSingle) {
      const amount = parseAmount(cell(row, mapping.debitColumnIndex));
      if (amount < 0) debit = amount;
      else if (amount > 0) credit = amount;
    } else {
      debit = parseAmount(cell(row, mapping.debitColumnIndex));
      credit = parseAmount(cell(row, mapping.creditColumnIndex));
      if (debit > 0) debit = -debit;
      if (credit < 0) credit = Math.abs(credit);
    }
    result.push({
      date: toIsoDate(date),
      valueDate: toIsoDate(valueDate),
      debit: roundMoney(debit),
      credit: roundMoney(credit),
      label: neutralizeFormula(String(cell(row, mapping.libelleColumnIndex) ?? '').trim()),
      categoryRaw:
        mapping.categoryColumnIndex !== undefined
          ? neutralizeFormula(String(cell(row, mapping.categoryColumnIndex) ?? '').trim()) || null
          : null,
      categoryCode: null,
      accountRaw:
        mapping.accountColumnIndex !== undefined
          ? neutralizeFormula(String(cell(row, mapping.accountColumnIndex) ?? '').trim()) || null
          : null,
      accountId: null,
      accountCode: null,
    });
  }

  result.sort((a, b) => a.date.localeCompare(b.date));
  return result;
}

export const ImportService = {
  transformRows,

  async listByAccount(): Promise<
    Array<{
      account: { id: number; code: string; name: string; color: string; initialBalance: number };
      imports: Array<{
        id: number;
        filename: string;
        accountId: number;
        dateStart: string | null;
        dateEnd: string | null;
        rowCount: number;
        importedAt: string;
      }>;
    }>
  > {
    return withLog('ImportService.listByAccount', async () => {
      const accounts = await Db.select<{
        id: number;
        code: string;
        name: string;
        color: string;
        initial_balance: number;
      }>('SELECT id, code, name, color, initial_balance FROM accounts ORDER BY code');
      const imports = await Db.select<{
        id: number;
        filename: string;
        account_id: number;
        date_start: string | null;
        date_end: string | null;
        row_count: number;
        imported_at: string;
      }>('SELECT id, filename, account_id, date_start, date_end, row_count, imported_at FROM imports ORDER BY imported_at DESC, id DESC');
      const byAccount = new Map<number, typeof imports>();
      for (const imp of imports) {
        const list = byAccount.get(imp.account_id) ?? [];
        list.push(imp);
        byAccount.set(imp.account_id, list);
      }
      return accounts.map((a) => ({
        account: {
          id: a.id,
          code: a.code,
          name: a.name,
          color: a.color,
          initialBalance: a.initial_balance,
        },
        imports: (byAccount.get(a.id) ?? []).map((r) => ({
          id: r.id,
          filename: r.filename,
          accountId: r.account_id,
          dateStart: r.date_start,
          dateEnd: r.date_end,
          rowCount: r.row_count,
          importedAt: r.imported_at,
        })),
      }));
    });
  },

  async deleteImport(importId: number): Promise<void> {
    return withLog('ImportService.deleteImport', async () => {
      await Db.inTransaction('ImportService.deleteImport', async () => {
        await Db.execute(`UPDATE transactions SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE import_id = ?`, [importId]);
        await Db.execute('DELETE FROM imports WHERE id = ?', [importId]);
      });
    }, { data: { importId } });
  },

  async findOverlaps(
    accountId: number,
    dateStart: string,
    dateEnd: string
  ): Promise<OverlapWarning[]> {
    return withLog('ImportService.findOverlaps', async () => {
      const rows = await Db.select<{
        id: number;
        filename: string;
        date_start: string | null;
        date_end: string | null;
      }>(
        `SELECT id, filename, date_start, date_end FROM imports
         WHERE account_id = ?
           AND date_start IS NOT NULL AND date_end IS NOT NULL
           AND date_start <= ? AND date_end >= ?`,
        [accountId, dateEnd, dateStart]
      );
      return rows.map((r) => ({
        importId: r.id,
        filename: r.filename,
        dateStart: r.date_start,
        dateEnd: r.date_end,
      }));
    }, { data: { accountId, dateStart, dateEnd } });
  },

  async importRows(input: {
    accountId: number;
    filename: string;
    rows: PreviewRow[];
    initialBalance?: number;
  }): Promise<{ imported: number; importId: number | null }> {
    return withLog('ImportService.importRows', async () => {
      if (input.rows.length === 0) return { imported: 0, importId: null };

      const byAccount = new Map<number, PreviewRow[]>();
      for (const row of input.rows) {
        const aid = row.accountId ?? input.accountId;
        const list = byAccount.get(aid) ?? [];
        list.push(row);
        byAccount.set(aid, list);
      }

      let totalImported = 0;
      let lastImportId: number | null = null;
      const createdImportIds: number[] = [];

      try {
        for (const [accountId, rows] of byAccount.entries()) {
          const dates = rows.map((r) => r.date).sort();
          let importId: number | null = null;
          await Db.inTransaction('ImportService.importRows', async () => {
            if (input.initialBalance !== undefined && accountId === input.accountId) {
              await ConfigService.updateAccount(accountId, {
                initialBalance: input.initialBalance,
              });
            }
            const importRes = await Db.execute(
              'INSERT INTO imports (filename, account_id, date_start, date_end, row_count) VALUES (?, ?, ?, ?, ?)',
              [input.filename, accountId, dates[0], dates[dates.length - 1], rows.length]
            );
            importId = importRes.lastInsertId ?? null;
            if (importId != null) createdImportIds.push(importId);
            const chunkSize = 100;
            for (let i = 0; i < rows.length; i += chunkSize) {
              const chunk = rows.slice(i, i + chunkSize);
              const placeholders: string[] = [];
              const params: unknown[] = [];
              for (const row of chunk) {
                placeholders.push('(?, ?, ?, ?, ?, ?, ?, ?)');
                params.push(
                  accountId,
                  row.date,
                  row.valueDate,
                  row.debit,
                  row.credit,
                  row.label,
                  row.categoryCode?.trim() || null,
                  importId
                );
              }
              await Db.execute(
                `INSERT INTO transactions (account_id, date, value_date, debit, credit, label, category_code, import_id)
                 VALUES ${placeholders.join(', ')}`,
                params
              );
              totalImported += placeholders.length;
            }
          });
          if (importId != null) {
            await LabelRuleService.apply({ importId });
            lastImportId = importId;
          }
        }
        return { imported: totalImported, importId: lastImportId };
      } catch (err) {
        for (const importId of createdImportIds) {
          await Db.execute('DELETE FROM transactions WHERE import_id = ?', [importId]).catch(
            () => undefined
          );
          await Db.execute('DELETE FROM imports WHERE id = ?', [importId]).catch(() => undefined);
        }
        throw err;
      }
    }, {
      data: {
        accountId: input.accountId,
        filename: input.filename,
        count: input.rows.length,
      },
    });
  },
};
