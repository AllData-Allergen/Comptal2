import { Category, CategoryGroup } from '../types/models';
import { BilanChartData, CategorySummary, CategoryTotal } from '../services/StatsService';

export type CategoryAggregation = 'category' | 'group';

export const UNGROUPED_CODE = '__ungrouped__';
export const UNGROUPED_COLOR = '#94a3b8';

export function groupCode(groupId: number): string {
  return `G:${groupId}`;
}

export interface AggregatedCategoryView {
  totals: CategoryTotal[];
  categories: Category[];
}

export interface MonthlyChartView {
  /** Libellés des séries du graphique (en mode groupe : « Nom — Crédit/Débit »). */
  categories: string[];
  categoryColors: Record<string, string>;
  monthlyData: number[][];
  /** Une ligne de résumé par catégorie ou regroupement (net). */
  summaries: CategorySummary[];
  /** Séries nettes alignées sur `summaries` (pour le tableau). */
  summarySeries: number[][];
}

function sumSeries(a: number[] | undefined, b: number[] | undefined): number[] {
  const len = Math.max(a?.length ?? 0, b?.length ?? 0);
  const out = new Array<number>(len).fill(0);
  for (let i = 0; i < len; i++) {
    out[i] = (a?.[i] ?? 0) + (b?.[i] ?? 0);
  }
  return out;
}

function resolveBucket(
  cat: Category | undefined,
  groupsById: Map<number, CategoryGroup>,
  ungroupedLabel: string
): { code: string; name: string; color: string } {
  if (cat?.groupId != null) {
    const group = groupsById.get(cat.groupId);
    if (group) {
      return { code: groupCode(group.id), name: group.name, color: group.color };
    }
  }
  return { code: UNGROUPED_CODE, name: ungroupedLabel, color: UNGROUPED_COLOR };
}

/** Agrège des totaux Dashboard (CategoryTotal) par regroupement. */
export function aggregateCategoryTotals(
  totals: CategoryTotal[],
  categories: Category[],
  groups: CategoryGroup[],
  ungroupedLabel: string,
  mode: CategoryAggregation
): AggregatedCategoryView {
  if (mode === 'category') {
    return { totals, categories };
  }

  const byCode = new Map(categories.map((c) => [c.code, c]));
  const groupsById = new Map(groups.map((g) => [g.id, g]));
  const buckets = new Map<
    string,
    { name: string; color: string; net: number; income: number; expenses: number; txCount: number }
  >();

  for (const item of totals) {
    if (!item.categoryCode || item.categoryCode === 'X' || item.categoryCode === 'Y') continue;
    const cat = byCode.get(item.categoryCode);
    const bucket = resolveBucket(cat, groupsById, ungroupedLabel);
    const prev = buckets.get(bucket.code);
    if (prev) {
      prev.net += item.net;
      prev.income += item.income;
      prev.expenses += item.expenses;
      prev.txCount += item.txCount ?? 0;
    } else {
      buckets.set(bucket.code, {
        name: bucket.name,
        color: bucket.color,
        net: item.net,
        income: item.income,
        expenses: item.expenses,
        txCount: item.txCount ?? 0,
      });
    }
  }

  const aggregatedTotals: CategoryTotal[] = Array.from(buckets.entries())
    .map(([code, b]) => ({
      categoryCode: code,
      net: b.net,
      income: b.income,
      expenses: b.expenses,
      txCount: b.txCount,
    }))
    .sort((a, b) => Math.abs(b.expenses) - Math.abs(a.expenses));

  const displayCategories: Category[] = Array.from(buckets.entries()).map(([code, b], index) => ({
    id: -(index + 1),
    code,
    name: b.name,
    color: b.color,
    groupId: code.startsWith('G:') ? Number(code.slice(2)) : null,
  }));

  return { totals: aggregatedTotals, categories: displayCategories };
}

/** Agrège les séries Bilan (crédits/débits) par regroupement. */
export function aggregateBilanByGroup(
  data: BilanChartData,
  categories: Category[],
  groups: CategoryGroup[],
  ungroupedLabel: string,
  mode: CategoryAggregation
): BilanChartData {
  if (mode === 'category') return data;

  const byName = new Map(categories.map((c) => [c.name, c]));
  const groupsById = new Map(groups.map((g) => [g.id, g]));

  const creditsByKey = new Map<string, number[]>();
  const debitsByKey = new Map<string, number[]>();
  const colors: Record<string, string> = {};

  const allNames = new Set([...data.categoriesWithCredits, ...data.categoriesWithDebits]);

  for (const catName of allNames) {
    const cat = byName.get(catName);
    const bucket = resolveBucket(cat, groupsById, ungroupedLabel);
    colors[bucket.name] = bucket.color;

    if (data.creditsByCategory[catName]) {
      creditsByKey.set(
        bucket.name,
        sumSeries(creditsByKey.get(bucket.name), data.creditsByCategory[catName])
      );
    }
    if (data.debitsByCategory[catName]) {
      debitsByKey.set(
        bucket.name,
        sumSeries(debitsByKey.get(bucket.name), data.debitsByCategory[catName])
      );
    }
  }

  const periodLen = data.months.length;
  const ensureLen = (arr: number[]) => {
    if (arr.length === periodLen) return arr;
    const out = new Array<number>(periodLen).fill(0);
    for (let i = 0; i < periodLen; i++) out[i] = arr[i] ?? 0;
    return out;
  };

  const creditsByCategory: Record<string, number[]> = {};
  const debitsByCategory: Record<string, number[]> = {};
  const categoryColors: Record<string, string> = {};

  for (const [name, series] of creditsByKey) {
    creditsByCategory[name] = ensureLen(series);
    categoryColors[name] = colors[name] ?? UNGROUPED_COLOR;
  }
  for (const [name, series] of debitsByKey) {
    debitsByCategory[name] = ensureLen(series);
    categoryColors[name] = colors[name] ?? UNGROUPED_COLOR;
  }

  const absTotal = (series: number[]) => series.reduce((s, v) => s + Math.abs(v), 0);

  const categoriesWithCredits = Object.keys(creditsByCategory)
    .filter((name) => creditsByCategory[name].some((v) => v > 0))
    .sort((a, b) => absTotal(creditsByCategory[b]) - absTotal(creditsByCategory[a]));

  const categoriesWithDebits = Object.keys(debitsByCategory)
    .filter((name) => debitsByCategory[name].some((v) => v !== 0))
    .sort((a, b) => absTotal(debitsByCategory[b]) - absTotal(debitsByCategory[a]));

  return {
    periodKeys: data.periodKeys,
    months: data.months,
    categoriesWithCredits,
    categoriesWithDebits,
    creditsByCategory,
    debitsByCategory,
    categoryColors,
  };
}

/** Agrège le graphique mensuel (séries empilées + résumés) par regroupement.
 * En mode regroupement, crédits (+) et débits (−) restent des séries distinctes
 * pour ne pas se neutraliser visuellement dans un même groupe.
 */
export function aggregateMonthlyChart(
  categories: string[],
  categoryColors: Record<string, string>,
  monthlyData: number[][],
  incomeData: number[][],
  expensesData: number[][],
  summaries: CategorySummary[],
  categoryConfigs: Category[],
  groups: CategoryGroup[],
  ungroupedLabel: string,
  creditLabel: string,
  debitLabel: string,
  mode: CategoryAggregation
): MonthlyChartView {
  if (mode === 'category') {
    return { categories, categoryColors, monthlyData, summaries, summarySeries: monthlyData };
  }

  const byCode = new Map(categoryConfigs.map((c) => [c.code, c]));
  const groupsById = new Map(groups.map((g) => [g.id, g]));
  const buckets = new Map<
    string,
    {
      name: string;
      color: string;
      income: number[];
      expenses: number[];
      totalAmount: number;
      transactionCount: number;
    }
  >();

  const rowFor = (matrix: number[][], summary: CategorySummary, index: number) =>
    matrix[categories.indexOf(summary.categoryName)] ?? matrix[index] ?? [];

  for (let i = 0; i < summaries.length; i++) {
    const summary = summaries[i];
    // Même périmètre que le mode catégorie / categorySummaries (X déjà exclu en amont).
    if (!summary.categoryCode || summary.categoryCode === 'X') {
      continue;
    }
    const cat = byCode.get(summary.categoryCode);
    const bucket = resolveBucket(cat, groupsById, ungroupedLabel);
    const incomeRow = rowFor(incomeData, summary, i);
    const expenseRow = rowFor(expensesData, summary, i);
    const prev = buckets.get(bucket.code);
    if (prev) {
      prev.income = sumSeries(prev.income, incomeRow);
      prev.expenses = sumSeries(prev.expenses, expenseRow);
      prev.totalAmount += summary.totalAmount;
      prev.transactionCount += summary.transactionCount;
    } else {
      buckets.set(bucket.code, {
        name: bucket.name,
        color: bucket.color,
        income: [...incomeRow],
        expenses: [...expenseRow],
        totalAmount: summary.totalAmount,
        transactionCount: summary.transactionCount,
      });
    }
  }

  const ordered = Array.from(buckets.entries()).sort(
    (a, b) => Math.abs(b[1].totalAmount) - Math.abs(a[1].totalAmount)
  );

  const outCategories: string[] = [];
  const outColors: Record<string, string> = {};
  const outData: number[][] = [];
  const outSummaries: CategorySummary[] = [];
  const outSummarySeries: number[][] = [];

  for (const [code, b] of ordered) {
    const hasCredits = b.income.some((v) => v > 0);
    const hasDebits = b.expenses.some((v) => v > 0);
    const periodLen = Math.max(b.income.length, b.expenses.length);
    const netSeries = Array.from({ length: periodLen }, (_, i) => (b.income[i] ?? 0) - (b.expenses[i] ?? 0));

    if (hasCredits) {
      const creditName = `${b.name} — ${creditLabel}`;
      outCategories.push(creditName);
      outColors[creditName] = b.color;
      outData.push(b.income);
    }
    if (hasDebits) {
      const debitName = `${b.name} — ${debitLabel}`;
      outCategories.push(debitName);
      outColors[debitName] = b.color;
      outData.push(b.expenses.map((v) => -v));
    }

    outSummaries.push({
      categoryCode: code,
      categoryName: b.name,
      color: b.color,
      totalAmount: b.totalAmount,
      transactionCount: b.transactionCount,
    });
    outSummarySeries.push(netSeries);
  }

  return {
    categories: outCategories,
    categoryColors: outColors,
    monthlyData: outData,
    summaries: outSummaries,
    summarySeries: outSummarySeries,
  };
}
