import { TransactionRow } from '../types/models';
import { Db } from './db';
import { withLog } from './logger';
import i18n from '../i18n/config';
import { assertIsoDate, escapeLike, isIsoDate } from '../utils/security';
import { roundMoney } from '../utils/amounts';
import { parseDateWithMultipleFormats, toIsoDate } from '../utils/dateFormats';
import { sqlTxActive } from '../utils/sqlTx';

export interface EditionFilters {
  accountIds?: number[];
  categoryCodes?: string[];
  uncategorizedOnly?: boolean;
  dateStart?: string;
  dateEnd?: string;
  search?: string;
  sortBy?: 'date' | 'label' | 'debit' | 'credit' | 'category_code' | 'account_id' | 'value_date' | 'tag';
  sortDir?: 'asc' | 'desc' | null;
  limit?: number;
  offset?: number;
}

interface TxSqlRow {
  id: number;
  account_id: number;
  account_code: string;
  date: string;
  value_date: string | null;
  debit: number;
  credit: number;
  label: string;
  category_code: string | null;
  tag: string | null;
  import_id: number | null;
}

function normalizePersistDate(value: string): string {
  if (isIsoDate(value)) return value;
  const parsed = parseDateWithMultipleFormats(value);
  if (!parsed) {
    throw new Error(i18n.t('errors.invalidDate'));
  }
  const iso = toIsoDate(parsed);
  return assertIsoDate(iso);
}

function persistMoney(value: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(i18n.t('errors.invalidAmount'));
  }
  return roundMoney(value);
}

function mapRow(r: TxSqlRow): TransactionRow {
  return {
    id: r.id,
    accountId: r.account_id,
    accountCode: r.account_code,
    date: r.date,
    valueDate: r.value_date,
    debit: r.debit,
    credit: r.credit,
    label: r.label,
    categoryCode: r.category_code,
    tag: r.tag,
    importId: r.import_id,
  };
}

function buildWhere(filters: EditionFilters): { sql: string; params: unknown[] } {
  const clauses: string[] = [sqlTxActive('t')];
  const params: unknown[] = [];
  if (filters.accountIds && filters.accountIds.length > 0 && !(filters.accountIds.length === 1 && filters.accountIds[0] === ('*' as unknown as number))) {
    clauses.push(`t.account_id IN (${filters.accountIds.map(() => '?').join(',')})`);
    params.push(...filters.accountIds);
  } else if (filters.accountIds && filters.accountIds.length === 1 && filters.accountIds[0] === ('*' as unknown as number)) {
    clauses.push('1 = 0');
  }
  if (filters.uncategorizedOnly) {
    clauses.push("(t.category_code IS NULL OR t.category_code = '')");
  } else if (filters.categoryCodes && filters.categoryCodes.length > 0 && !(filters.categoryCodes.length === 1 && filters.categoryCodes[0] === '*')) {
    clauses.push(`t.category_code IN (${filters.categoryCodes.map(() => '?').join(',')})`);
    params.push(...filters.categoryCodes);
  } else if (filters.categoryCodes && filters.categoryCodes.length === 1 && filters.categoryCodes[0] === '*') {
    clauses.push('1 = 0');
  }
  if (filters.dateStart) {
    clauses.push('t.date >= ?');
    params.push(filters.dateStart);
  }
  if (filters.dateEnd) {
    clauses.push('t.date <= ?');
    params.push(filters.dateEnd);
  }
  if (filters.search && filters.search.trim()) {
    clauses.push('t.label LIKE ? ESCAPE \'\\\' COLLATE NOCASE');
    params.push(`%${escapeLike(filters.search.trim())}%`);
  }
  return {
    sql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '',
    params,
  };
}

const SORT_COLUMNS = new Set([
  'date',
  'value_date',
  'label',
  'debit',
  'credit',
  'category_code',
  'account_id',
  'tag',
]);

export interface DuplicateGroup {
  accountId: number;
  date: string;
  debit: number;
  credit: number;
  label: string;
  ids: number[];
}

export const EditionService = {
  async count(filters: EditionFilters): Promise<number> {
    return withLog('EditionService.count', async () => {
      const { sql, params } = buildWhere(filters);
      const rows = await Db.select<{ n: number }>(
        `SELECT COUNT(*) AS n FROM transactions t ${sql}`,
        params
      );
      return rows[0]?.n ?? 0;
    });
  },

  async getById(id: number): Promise<TransactionRow | null> {
    return withLog('EditionService.getById', async () => {
      const rows = await Db.select<TxSqlRow>(
        `SELECT t.id, t.account_id, a.code AS account_code, t.date, t.value_date,
                t.debit, t.credit, t.label, t.category_code, t.tag, t.import_id
         FROM transactions t
         JOIN accounts a ON a.id = t.account_id
         WHERE t.id = ?`,
        [id]
      );
      return rows[0] ? mapRow(rows[0]) : null;
    }, { data: { id } });
  },

  async restore(row: TransactionRow): Promise<void> {
    return withLog('EditionService.restore', async () => {
      const existing = await Db.select<{ id: number }>('SELECT id FROM transactions WHERE id = ?', [row.id]);
      if (existing[0]) {
        await Db.execute('UPDATE transactions SET deleted_at = NULL, updated_at = datetime(\'now\') WHERE id = ?', [
          row.id,
        ]);
        return;
      }
      await Db.execute(
        `INSERT INTO transactions
           (id, account_id, date, value_date, debit, credit, label, category_code, import_id, tag)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          row.id,
          row.accountId,
          row.date,
          row.valueDate,
          row.debit,
          row.credit,
          row.label,
          row.categoryCode,
          row.importId,
          row.tag ?? null,
        ]
      );
    }, { data: { id: row.id } });
  },

  async list(filters: EditionFilters): Promise<TransactionRow[]> {
    return withLog('EditionService.list', async () => {
      const { sql, params } = buildWhere(filters);
      const sortBy =
        filters.sortBy && SORT_COLUMNS.has(filters.sortBy) && filters.sortDir
          ? filters.sortBy
          : 'date';
      const sortDir = filters.sortDir === 'asc' ? 'ASC' : 'DESC';
      const orderClause =
        filters.sortDir
          ? `ORDER BY t.${sortBy} ${sortDir}, t.id ${sortDir}`
          : 'ORDER BY t.date DESC, t.id DESC';
      const hasLimit = filters.limit !== undefined;
      const limitClause = hasLimit ? 'LIMIT ? OFFSET ?' : '';
      const queryParams = hasLimit
        ? [...params, filters.limit, filters.offset ?? 0]
        : params;
      const rows = await Db.select<TxSqlRow>(
        `SELECT t.id, t.account_id, a.code AS account_code, t.date, t.value_date,
                t.debit, t.credit, t.label, t.category_code, t.tag, t.import_id
         FROM transactions t
         JOIN accounts a ON a.id = t.account_id
         ${sql}
         ${orderClause}
         ${limitClause}`,
        queryParams
      );
      return rows.map(mapRow);
    }, { data: { limit: filters.limit, offset: filters.offset } });
  },

  async update(
    id: number,
    fields: Partial<
      Pick<
        TransactionRow,
        'date' | 'valueDate' | 'debit' | 'credit' | 'label' | 'categoryCode' | 'accountId' | 'tag'
      >
    >
  ): Promise<void> {
    return withLog('EditionService.update', async () => {
      const sets: string[] = ['updated_at = datetime(\'now\')'];
      const params: unknown[] = [];
      if (fields.accountId !== undefined) {
        sets.push('account_id = ?');
        params.push(fields.accountId);
      }
      if (fields.date !== undefined) {
        sets.push('date = ?');
        params.push(normalizePersistDate(fields.date));
      }
      if (fields.valueDate !== undefined) {
        sets.push('value_date = ?');
        params.push(fields.valueDate ? normalizePersistDate(fields.valueDate) : null);
      }
      if (fields.debit !== undefined) {
        sets.push('debit = ?');
        params.push(persistMoney(fields.debit));
      }
      if (fields.credit !== undefined) {
        sets.push('credit = ?');
        params.push(persistMoney(fields.credit));
      }
      if (fields.label !== undefined) {
        sets.push('label = ?');
        params.push(fields.label);
      }
      if (fields.categoryCode !== undefined) {
        sets.push('category_code = ?');
        params.push(fields.categoryCode);
      }
      if (fields.tag !== undefined) {
        sets.push('tag = ?');
        params.push(fields.tag);
      }
      params.push(id);
      await Db.execute(`UPDATE transactions SET ${sets.join(', ')} WHERE id = ?`, params);
    }, { data: { id } });
  },

  async insert(row: {
    accountId: number;
    date: string;
    debit?: number;
    credit?: number;
    label?: string;
    categoryCode?: string | null;
  }): Promise<number> {
    return withLog('EditionService.insert', async () => {
      const date = normalizePersistDate(row.date);
      const res = await Db.execute(
        `INSERT INTO transactions (account_id, date, value_date, debit, credit, label, category_code)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          row.accountId,
          date,
          date,
          persistMoney(row.debit ?? 0),
          persistMoney(row.credit ?? 0),
          row.label ?? '',
          row.categoryCode ?? null,
        ]
      );
      return res.lastInsertId ?? 0;
    });
  },

  async remove(id: number): Promise<void> {
    return withLog('EditionService.remove', async () => {
      await Db.execute(
        `UPDATE transactions SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`,
        [id]
      );
    }, { data: { id } });
  },

  async applyCategories(updates: Array<{ id: number; categoryCode: string }>): Promise<void> {
    return withLog('EditionService.applyCategories', async () => {
      await Db.inTransaction('EditionService.applyCategories', async () => {
        for (const u of updates) {
          await Db.execute(
            `UPDATE transactions SET category_code = ?, updated_at = datetime('now') WHERE id = ?`,
            [u.categoryCode, u.id]
          );
        }
      });
    }, { data: { count: updates.length } });
  },

  async findDuplicates(): Promise<DuplicateGroup[]> {
    return withLog('EditionService.findDuplicates', async () => {
      const groups = await Db.select<{
        account_id: number;
        date: string;
        debit: number;
        credit: number;
        label: string;
        ids: string;
      }>(
        `SELECT account_id, date, debit, credit, label,
                GROUP_CONCAT(id) AS ids
         FROM transactions
         WHERE ${sqlTxActive()}
         GROUP BY account_id, date, debit, credit, label
         HAVING COUNT(*) > 1`
      );
      return groups.map((g) => ({
        accountId: g.account_id,
        date: g.date,
        debit: g.debit,
        credit: g.credit,
        label: g.label,
        ids: g.ids.split(',').map(Number),
      }));
    });
  },

  async deleteIds(ids: number[]): Promise<void> {
    if (ids.length === 0) return;
    return withLog('EditionService.deleteIds', async () => {
      await Db.execute(
        `UPDATE transactions SET deleted_at = datetime('now'), updated_at = datetime('now')
         WHERE id IN (${ids.map(() => '?').join(',')})`,
        ids
      );
    }, { data: { count: ids.length } });
  },

  async archiveAll(): Promise<void> {
    return withLog('EditionService.archiveAll', async () => {
      await Db.execute(
        `UPDATE transactions SET deleted_at = datetime('now'), updated_at = datetime('now')
         WHERE ${sqlTxActive()}`
      );
      await Db.execute('DELETE FROM imports');
    });
  },
  async listUncategorized(
    filters: Omit<EditionFilters, 'limit' | 'offset' | 'uncategorizedOnly'>
  ): Promise<TransactionRow[]> {
    return withLog('EditionService.listUncategorized', async () => {
      const { sql, params } = buildWhere({ ...filters, uncategorizedOnly: true });
      const rows = await Db.select<TxSqlRow>(
        `SELECT t.id, t.account_id, a.code AS account_code, t.date, t.value_date,
                t.debit, t.credit, t.label, t.category_code, t.tag, t.import_id
         FROM transactions t
         JOIN accounts a ON a.id = t.account_id
         ${sql}
         ORDER BY t.date DESC, t.id DESC`,
        params
      );
      return rows.map(mapRow);
    });
  },
};
