import { Db } from './db';
import { withLog } from './logger';
import { ChartGranularity } from '../types/projection';
import { ConfigService } from './ConfigService';
import { filterPeriodKeysInRange, getPeriodLabel, enumeratePeriodKeys } from '../utils/periodKeys';
import i18n from '../i18n/config';
import { daysInclusive, escapeLike, isIsoDate } from '../utils/security';
import { sqlTxActive } from '../utils/sqlTx';

export interface StatsFilters {
  accountIds?: number[];
  categoryCodes?: string[];
  dateStart?: string;
  dateEnd?: string;
  search?: string;
  excludeCategories?: string[];
}

export interface KpiStats {
  income: number;
  expenses: number;
  net: number;
  count: number;
  largestIncome: number;
  largestExpense: number;
  avgAmount: number;
}

export interface CategoryTotal {
  categoryCode: string | null;
  net: number;
  income: number;
  expenses: number;
  txCount?: number;
}

export type TransactionListRow = {
  id: number;
  date: string;
  label: string;
  debit: number;
  credit: number;
  categoryCode: string | null;
  accountCode: string;
};

export type TransactionSortKey = 'date' | 'label' | 'debit' | 'credit' | 'accountCode' | 'categoryCode';
export type SortDirection = 'asc' | 'desc';

export interface AccountBalance {
  accountId: number;
  code: string;
  name: string;
  color: string;
  balance: number;
}

export interface PeriodPoint {
  period: string;
  categoryCode?: string | null;
  accountId?: number;
  net: number;
  income: number;
  expenses: number;
  balance?: number;
}

export interface CategorySummary {
  categoryCode: string;
  categoryName: string;
  color: string;
  totalAmount: number;
  transactionCount: number;
}

export interface AccountSummary {
  accountId: number;
  accountCode: string;
  accountName: string;
  color: string;
  balance: number;
  transactionCount: number;
}

export interface BilanChartData {
  periodKeys: string[];
  months: string[];
  categoriesWithCredits: string[];
  categoriesWithDebits: string[];
  creditsByCategory: Record<string, number[]>;
  debitsByCategory: Record<string, number[]>;
  categoryColors: Record<string, string>;
}

export interface PeriodRange {
  start: string;
  end: string;
}

export interface DistinctPeriods {
  weeks: PeriodRange[];
  months: PeriodRange[];
  years: PeriodRange[];
}

function where(filters: StatsFilters, alias = 't'): { sql: string; params: unknown[] } {
  const clauses: string[] = [sqlTxActive(alias)];
  const params: unknown[] = [];
  if (filters.accountIds !== undefined) {
    if (filters.accountIds.length === 0) {
      clauses.push('1=0');
    } else {
      clauses.push(`${alias}.account_id IN (${filters.accountIds.map(() => '?').join(',')})`);
      params.push(...filters.accountIds);
    }
  }
  if (filters.categoryCodes !== undefined) {
    if (filters.categoryCodes.length === 0) {
      clauses.push('1=0');
    } else {
      clauses.push(`${alias}.category_code IN (${filters.categoryCodes.map(() => '?').join(',')})`);
      params.push(...filters.categoryCodes);
    }
  }
  if (filters.excludeCategories && filters.excludeCategories.length > 0) {
    clauses.push(
      `(${alias}.category_code IS NULL OR ${alias}.category_code NOT IN (${filters.excludeCategories.map(() => '?').join(',')}))`
    );
    params.push(...filters.excludeCategories);
  }
  if (filters.dateStart) {
    clauses.push(`${alias}.date >= ?`);
    params.push(filters.dateStart);
  }
  if (filters.dateEnd) {
    clauses.push(`${alias}.date <= ?`);
    params.push(filters.dateEnd);
  }
  if (filters.search && filters.search.trim()) {
    clauses.push(`${alias}.label LIKE ? ESCAPE '\\' COLLATE NOCASE`);
    params.push(`%${escapeLike(filters.search.trim())}%`);
  }
  return { sql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
}

/** Semaine ISO (année-semaine du jeudi), alignée sur `getPeriodKey(..., 'week')`. */
export function isoYearWeekExpr(column: string): string {
  const thursday = `date(${column}, '-3 days', 'weekday 4')`;
  return `printf('%s-W%02d', strftime('%Y', ${thursday}), (CAST(strftime('%j', ${thursday}) AS INTEGER) - 1) / 7 + 1)`;
}

export function strftimeExpr(granularity: ChartGranularity, column = 't.date'): string {
  switch (granularity) {
    case 'day':
      return `date(${column})`;
    case 'week':
      return isoYearWeekExpr(column);
    case 'month':
      return `strftime('%Y-%m', ${column})`;
    case 'quarter':
      return `strftime('%Y', ${column}) || '-Q' || ((CAST(strftime('%m', ${column}) AS INTEGER) + 2) / 3)`;
    case 'semester':
      return `strftime('%Y', ${column}) || '-S' || CASE WHEN CAST(strftime('%m', ${column}) AS INTEGER) <= 6 THEN 1 ELSE 2 END`;
    case 'year':
      return `strftime('%Y', ${column})`;
  }
}

export function autoGranularity(dateStart?: string, dateEnd?: string): ChartGranularity {
  if (!dateStart || !dateEnd) return 'month';
  const days =
    (new Date(dateEnd).getTime() - new Date(dateStart).getTime()) / (1000 * 60 * 60 * 24);
  if (days < 30) return 'day';
  if (days < 120) return 'week';
  return 'month';
}

export const StatsService = {
  async dateBounds(): Promise<{ min: string | null; max: string | null }> {
    const rows = await Db.select<{ min: string | null; max: string | null }>(
      'SELECT MIN(date) AS min, MAX(date) AS max FROM transactions WHERE ' + sqlTxActive()
    );
    return rows[0] ?? { min: null, max: null };
  },

  async distinctPeriods(): Promise<DistinctPeriods> {
    return withLog('StatsService.distinctPeriods', async () => {
      const weekRows = await Db.select<{ weekStart: string }>(
        `SELECT DISTINCT date(date, '-' || ((CAST(strftime('%w', date) AS INTEGER) + 6) % 7) || ' days') AS weekStart
         FROM transactions
         WHERE date IS NOT NULL AND date != '' AND ${sqlTxActive()}
         ORDER BY weekStart DESC`
      );
      const monthRows = await Db.select<{ ym: string }>(
        `SELECT DISTINCT strftime('%Y-%m', date) AS ym
         FROM transactions
         WHERE date IS NOT NULL AND date != '' AND ${sqlTxActive()}
         ORDER BY ym DESC`
      );
      const yearRows = await Db.select<{ y: string }>(
        `SELECT DISTINCT strftime('%Y', date) AS y
         FROM transactions
         WHERE date IS NOT NULL AND date != '' AND ${sqlTxActive()}
         ORDER BY y DESC`
      );

      const lastDayOfMonth = (ym: string): string => {
        const [y, m] = ym.split('-').map(Number);
        const last = new Date(y, m, 0);
        const dd = String(last.getDate()).padStart(2, '0');
        return `${ym}-${dd}`;
      };
      const addSixDays = (iso: string): string => {
        const d = new Date(`${iso}T00:00:00`);
        d.setDate(d.getDate() + 6);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
      };

      return {
        weeks: weekRows
          .filter((r) => r.weekStart)
          .map((r) => ({ start: r.weekStart, end: addSixDays(r.weekStart) })),
        months: monthRows
          .filter((r) => r.ym)
          .map((r) => ({ start: `${r.ym}-01`, end: lastDayOfMonth(r.ym) })),
        years: yearRows
          .filter((r) => r.y)
          .map((r) => ({ start: `${r.y}-01-01`, end: `${r.y}-12-31` })),
      };
    });
  },

  async kpis(filters: StatsFilters): Promise<KpiStats> {
    return withLog('StatsService.kpis', async () => {
      const { sql, params } = where(filters);
      const rows = await Db.select<{
        income: number;
        expenses: number;
        n: number;
        largestIncome: number;
        largestExpense: number;
        avgAmount: number;
      }>(
        `SELECT
           COALESCE(SUM(t.credit), 0) AS income,
           COALESCE(SUM(-t.debit), 0) AS expenses,
           COUNT(*) AS n,
           COALESCE(MAX(t.credit), 0) AS largestIncome,
           COALESCE(MAX(CASE WHEN t.debit < 0 THEN -t.debit ELSE NULL END), 0) AS largestExpense,
           COALESCE(AVG(ABS(t.debit) + ABS(t.credit)), 0) AS avgAmount
         FROM transactions t ${sql}`,
        params
      );
      const income = rows[0]?.income ?? 0;
      const expenses = rows[0]?.expenses ?? 0;
      return {
        income,
        expenses,
        net: income - expenses,
        count: rows[0]?.n ?? 0,
        largestIncome: rows[0]?.largestIncome ?? 0,
        largestExpense: rows[0]?.largestExpense ?? 0,
        avgAmount: rows[0]?.avgAmount ?? 0,
      };
    });
  },

  async categoryTotals(filters: StatsFilters): Promise<CategoryTotal[]> {
    return withLog('StatsService.categoryTotals', async () => {
      const { sql, params } = where(filters);
      return Db.select<CategoryTotal>(
        `SELECT t.category_code AS categoryCode,
                COALESCE(SUM(t.debit + t.credit), 0) AS net,
                COALESCE(SUM(t.credit), 0) AS income,
                COALESCE(SUM(-t.debit), 0) AS expenses,
                COUNT(*) AS txCount
         FROM transactions t ${sql}
         GROUP BY t.category_code
         ORDER BY ABS(SUM(t.debit + t.credit)) DESC`,
        params
      );
    });
  },

  async categorySummaries(filters: StatsFilters): Promise<CategorySummary[]> {
    return withLog('StatsService.categorySummaries', async () => {
      const { sql, params } = where(filters);
      const rows = await Db.select<{
        categoryCode: string | null;
        categoryName: string | null;
        color: string | null;
        totalAmount: number;
        transactionCount: number;
      }>(
        `SELECT t.category_code AS categoryCode,
                c.name AS categoryName,
                c.color,
                COALESCE(SUM(t.debit + t.credit), 0) AS totalAmount,
                COUNT(*) AS transactionCount
         FROM transactions t
         LEFT JOIN categories c ON c.code = t.category_code
         ${sql}
         GROUP BY t.category_code
         ORDER BY ABS(SUM(t.debit + t.credit)) DESC`,
        params
      );
      return rows
        .filter((r) => r.categoryCode && r.categoryCode !== 'X')
        .map((r) => ({
          categoryCode: r.categoryCode!,
          categoryName: r.categoryName ?? r.categoryCode!,
          color: r.color ?? '#94a3b8',
          totalAmount: r.totalAmount,
          transactionCount: r.transactionCount,
        }));
    });
  },

  async accountSummaries(filters: StatsFilters): Promise<AccountSummary[]> {
    return withLog('StatsService.accountSummaries', async () => {
      const balances = await this.accountBalancesAt(filters.dateEnd, filters.accountIds);
      if (balances.length === 0) return [];

      const { sql, params } = where(filters);
      const counts = await Db.select<{ accountId: number; transactionCount: number }>(
        `SELECT t.account_id AS accountId, COUNT(*) AS transactionCount
         FROM transactions t ${sql}
         GROUP BY t.account_id`,
        params
      );
      const countMap = new Map(counts.map((c) => [c.accountId, c.transactionCount]));

      return balances.map((b) => ({
        accountId: b.accountId,
        accountCode: b.code,
        accountName: b.name,
        color: b.color,
        balance: b.balance,
        transactionCount: countMap.get(b.accountId) ?? 0,
      }));
    });
  },

  async bilanByPeriod(
    filters: StatsFilters,
    granularity: ChartGranularity
  ): Promise<BilanChartData> {
    return withLog('StatsService.bilanByPeriod', async () => {
      const bilanFilters: StatsFilters = {
        ...filters,
        excludeCategories: [...(filters.excludeCategories ?? []), 'X'],
      };
      const { sql, params } = where(bilanFilters);
      const period = strftimeExpr(granularity);

      const rows = await Db.select<{
        period: string;
        categoryCode: string | null;
        income: number;
        expenses: number;
      }>(
        `SELECT ${period} AS period,
                t.category_code AS categoryCode,
                COALESCE(SUM(t.credit), 0) AS income,
                COALESCE(SUM(-t.debit), 0) AS expenses
         FROM transactions t ${sql}
         GROUP BY period, t.category_code
         ORDER BY period`,
        params
      );

      const categories = await ConfigService.listCategories();
      const byCode = new Map(categories.map((c) => [c.code, c]));

      const periodSet = new Set<string>();
      const creditsMap = new Map<string, Map<string, number>>();
      const debitsMap = new Map<string, Map<string, number>>();

      for (const row of rows) {
        if (!row.categoryCode) continue;
        periodSet.add(row.period);
        const catName = byCode.get(row.categoryCode)?.name ?? row.categoryCode;

        if (row.income > 0) {
          if (!creditsMap.has(catName)) creditsMap.set(catName, new Map());
          const m = creditsMap.get(catName)!;
          m.set(row.period, (m.get(row.period) ?? 0) + row.income);
        }
        if (row.expenses > 0) {
          if (!debitsMap.has(catName)) debitsMap.set(catName, new Map());
          const m = debitsMap.get(catName)!;
          m.set(row.period, (m.get(row.period) ?? 0) - row.expenses);
        }
      }

      const periodKeys = filterPeriodKeysInRange(
        Array.from(periodSet),
        granularity,
        filters.dateStart,
        filters.dateEnd
      );
      const months = periodKeys.map((k) => getPeriodLabel(k, granularity));

      const allNames = new Set([...creditsMap.keys(), ...debitsMap.keys()]);
      const categoriesWithCredits = Array.from(allNames).filter((name) => {
        const m = creditsMap.get(name);
        return m && Array.from(m.values()).some((v) => v > 0);
      });
      const categoriesWithDebits = Array.from(allNames).filter((name) => {
        const m = debitsMap.get(name);
        return m && Array.from(m.values()).some((v) => v < 0);
      });

      const creditsByCategory: Record<string, number[]> = {};
      const debitsByCategory: Record<string, number[]> = {};
      const categoryColors: Record<string, string> = {};

      for (const name of allNames) {
        const code = categories.find((c) => c.name === name)?.code;
        categoryColors[name] = (code ? byCode.get(code)?.color : undefined) ?? '#808080';
        const cMap = creditsMap.get(name) ?? new Map();
        creditsByCategory[name] = periodKeys.map((k) => cMap.get(k) ?? 0);
        const dMap = debitsMap.get(name) ?? new Map();
        debitsByCategory[name] = periodKeys.map((k) => dMap.get(k) ?? 0);
      }

      return {
        periodKeys,
        months,
        categoriesWithCredits,
        categoriesWithDebits,
        creditsByCategory,
        debitsByCategory,
        categoryColors,
      };
    });
  },

  async accountBalancesAt(dateEnd?: string, accountIds?: number[]): Promise<AccountBalance[]> {
    return withLog('StatsService.accountBalancesAt', async () => {
      if (accountIds !== undefined && accountIds.length === 0) return [];
      const joinDate = dateEnd ? 'AND t.date <= ?' : '';
      const accSql =
        accountIds && accountIds.length > 0
          ? `WHERE a.id IN (${accountIds.map(() => '?').join(',')})`
          : '';
      const params: unknown[] = [];
      if (dateEnd) params.push(dateEnd);
      if (accountIds && accountIds.length > 0) params.push(...accountIds);
      return Db.select<AccountBalance>(
        `SELECT a.id AS accountId, a.code, a.name, a.color,
                a.initial_balance + COALESCE(SUM(t.debit + t.credit), 0) AS balance
         FROM accounts a
         LEFT JOIN transactions t ON t.account_id = a.id ${joinDate}
         ${accSql}
         GROUP BY a.id
         ORDER BY a.code`,
        params
      );
    });
  },

  async balancesOverPeriod(
    dateStart: string,
    dateEnd: string,
    granularity: ChartGranularity,
    accountIds?: number[]
  ): Promise<Array<{ period: string; accountId: number; code: string; color: string; balance: number }>> {
    return withLog('StatsService.balancesOverPeriod', async () => {
      if (!isIsoDate(dateStart) || !isIsoDate(dateEnd) || dateStart > dateEnd) {
        throw new Error(i18n.t('errors.invalidDateRange'));
      }
      const days = daysInclusive(dateStart, dateEnd);
      const maxDays =
        granularity === 'day' ? 400 : granularity === 'week' ? 800 : 4000;
      if (days > maxDays) {
        throw new Error(i18n.t('errors.periodTooLong'));
      }
      if (accountIds !== undefined && accountIds.length === 0) return [];
      const periodNetExpr = strftimeExpr(granularity);
      const accSql =
        accountIds && accountIds.length > 0
          ? `AND a.id IN (${accountIds.map(() => '?').join(',')})`
          : '';
      const accParams = accountIds && accountIds.length > 0 ? accountIds : [];

      const accounts = await Db.select<{ accountId: number; code: string; color: string }>(
        `SELECT a.id AS accountId, a.code, a.color
         FROM accounts a
         WHERE 1=1 ${accSql}
         ORDER BY a.code`,
        accParams
      );
      if (accounts.length === 0) return [];

      const starts = await Db.select<{ accountId: number; startBalance: number }>(
        `SELECT a.id AS accountId,
                a.initial_balance + COALESCE(SUM(t.debit + t.credit), 0) AS startBalance
         FROM accounts a
         LEFT JOIN transactions t ON t.account_id = a.id AND t.date < ?
         WHERE 1=1 ${accSql}
         GROUP BY a.id`,
        [dateStart, ...accParams]
      );
      const startMap = new Map(starts.map((s) => [s.accountId, s.startBalance]));

      const allPeriods = enumeratePeriodKeys(dateStart, dateEnd, granularity);

      const nets = await Db.select<{
        period: string;
        accountId: number;
        net: number;
      }>(
        `SELECT ${periodNetExpr} AS period, a.id AS accountId,
                COALESCE(SUM(t.debit + t.credit), 0) AS net
         FROM accounts a
         JOIN transactions t ON t.account_id = a.id
         WHERE t.date BETWEEN ? AND ? ${accSql}
         GROUP BY period, a.id`,
        [dateStart, dateEnd, ...accParams]
      );

      const netMap = new Map<string, Map<number, number>>();
      for (const row of nets) {
        if (!netMap.has(row.period)) netMap.set(row.period, new Map());
        netMap.get(row.period)!.set(row.accountId, row.net);
      }

      const out: Array<{
        period: string;
        accountId: number;
        code: string;
        color: string;
        balance: number;
      }> = [];

      for (const acc of accounts) {
        let running = startMap.get(acc.accountId) ?? 0;
        for (const period of allPeriods) {
          running += netMap.get(period)?.get(acc.accountId) ?? 0;
          out.push({
            period,
            accountId: acc.accountId,
            code: acc.code,
            color: acc.color,
            balance: running,
          });
        }
      }
      return out;
    });
  },

  async categoryByPeriod(
    filters: StatsFilters,
    granularity: ChartGranularity
  ): Promise<PeriodPoint[]> {
    return withLog('StatsService.categoryByPeriod', async () => {
      const { sql, params } = where(filters);
      const period = strftimeExpr(granularity);
      return Db.select<PeriodPoint>(
        `SELECT ${period} AS period, t.category_code AS categoryCode,
                COALESCE(SUM(t.debit + t.credit), 0) AS net,
                COALESCE(SUM(t.credit), 0) AS income,
                COALESCE(SUM(-t.debit), 0) AS expenses
         FROM transactions t ${sql}
         GROUP BY period, t.category_code
         ORDER BY period`,
        params
      );
    });
  },

  async accountByPeriod(
    filters: StatsFilters,
    granularity: ChartGranularity
  ): Promise<PeriodPoint[]> {
    return withLog('StatsService.accountByPeriod', async () => {
      const { sql, params } = where(filters);
      const period = strftimeExpr(granularity);
      return Db.select<PeriodPoint>(
        `SELECT ${period} AS period, t.account_id AS accountId,
                COALESCE(SUM(t.debit + t.credit), 0) AS net,
                COALESCE(SUM(t.credit), 0) AS income,
                COALESCE(SUM(-t.debit), 0) AS expenses
         FROM transactions t ${sql}
         GROUP BY period, t.account_id
         ORDER BY period`,
        params
      );
    });
  },

  async listTransactions(
    filters: StatsFilters,
    limit = 100,
    offset = 0,
    sortKey: TransactionSortKey = 'date',
    sortDir: SortDirection = 'desc'
  ): Promise<TransactionListRow[]> {
    return withLog('StatsService.listTransactions', async () => {
      const { sql, params } = where(filters);
      const colMap: Record<TransactionSortKey, string> = {
        date: 't.date',
        label: 't.label',
        debit: 't.debit',
        credit: 't.credit',
        accountCode: 'a.code',
        categoryCode: 't.category_code',
      };
      const col = colMap[sortKey];
      const dir = sortDir === 'asc' ? 'ASC' : 'DESC';
      return Db.select(
        `SELECT t.id, t.date, t.label, t.debit, t.credit, t.category_code AS categoryCode, a.code AS accountCode
         FROM transactions t
         JOIN accounts a ON a.id = t.account_id
         ${sql}
         ORDER BY ${col} ${dir}, t.id DESC
         LIMIT ? OFFSET ?`,
        [...params, limit, offset]
      );
    });
  },

  async listAllTransactions(
    filters: StatsFilters,
    sortKey: TransactionSortKey = 'date',
    sortDir: SortDirection = 'desc'
  ): Promise<TransactionListRow[]> {
    return withLog('StatsService.listAllTransactions', async () => {
      const { sql, params } = where(filters);
      const colMap: Record<TransactionSortKey, string> = {
        date: 't.date',
        label: 't.label',
        debit: 't.debit',
        credit: 't.credit',
        accountCode: 'a.code',
        categoryCode: 't.category_code',
      };
      const col = colMap[sortKey];
      const dir = sortDir === 'asc' ? 'ASC' : 'DESC';
      return Db.select(
        `SELECT t.id, t.date, t.label, t.debit, t.credit, t.category_code AS categoryCode, a.code AS accountCode
         FROM transactions t
         JOIN accounts a ON a.id = t.account_id
         ${sql}
         ORDER BY ${col} ${dir}, t.id DESC`,
        params
      );
    });
  },

  async listTransactionIds(filters: StatsFilters): Promise<string[]> {
    return withLog('StatsService.listTransactionIds', async () => {
      const { sql, params } = where(filters);
      const rows = await Db.select<{ id: number }>(`SELECT t.id FROM transactions t ${sql}`, params);
      return rows.map((row) => String(row.id));
    });
  },
};
