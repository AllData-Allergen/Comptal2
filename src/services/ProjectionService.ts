import {
  addDays,
  addMonths,
  addQuarters,
  addWeeks,
  addYears,
  eachDayOfInterval,
  endOfMonth,
  isAfter,
  isBefore,
  isSameDay,
  isValid,
  startOfDay,
} from 'date-fns';
import {
  ChartGranularity,
  Periodicity,
  PERIODICITY_VALUES,
  Project,
  ProjectSubscription,
} from '../types/projection';
import {
  PeriodAggregate,
  ProjectionData,
  ProjectionStats,
} from '../types/forecast';
import { forecastIsoToDate, parseForecastIso } from '../utils/forecastDates';
import { getPeriodKey } from '../utils/periodKeys';
import { MAX_PROJECTION_DAYS } from '../utils/security';
import { Logger, withLog } from './logger';

function nextDate(date: Date, periodicity: Periodicity): Date {
  switch (periodicity) {
    case 'daily':
      return addDays(date, 1);
    case 'weekly':
      return addWeeks(date, 1);
    case 'monthly':
      return addMonths(date, 1);
    case 'quarterly':
      return addQuarters(date, 1);
    case 'yearly':
      return addYears(date, 1);
    case 'unique':
      return addYears(date, 100);
    default:
      return addYears(date, 100);
  }
}

function periodKeyLegacy(date: Date, granularity: ChartGranularity): string {
  return getPeriodKey(date, granularity);
}

/** Début de jour valide, ou null si parsing cassé / date invalide (anti-crash). */
function toStart(value: string | Date | null | undefined): Date | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) {
    if (!isValid(value)) return null;
    const d = startOfDay(value);
    return isValid(d) ? d : null;
  }
  const iso = parseForecastIso(value);
  if (!iso) return null;
  return forecastIsoToDate(iso);
}

export function getAllFlatSubscriptions(
  subscriptions: ProjectSubscription[]
): ProjectSubscription[] {
  const flat: ProjectSubscription[] = [];
  for (const sub of subscriptions) {
    if (sub.isGroup && sub.children && sub.children.length > 0) {
      flat.push(...getAllFlatSubscriptions(sub.children));
    } else if (!sub.isGroup) {
      flat.push(sub);
    }
  }
  return flat;
}

export function getAllGroupLines(group: ProjectSubscription): ProjectSubscription[] {
  if (!group.isGroup || !group.children || group.children.length === 0) return [];
  const lines: ProjectSubscription[] = [];
  for (const child of group.children) {
    if (child.isGroup && child.children && child.children.length > 0) {
      lines.push(...getAllGroupLines(child));
    } else if (!child.isGroup) {
      lines.push(child);
    }
  }
  return lines;
}

export function applySubscriptionToDate(subscription: ProjectSubscription, date: Date): number {
  const checkDate = startOfDay(date);
  if (!isValid(checkDate)) return 0;
  const start = toStart(subscription.startDate);
  if (!start) return 0;
  if (isBefore(checkDate, start)) return 0;
  if (subscription.endDate) {
    const end = toStart(subscription.endDate);
    if (end && isAfter(checkDate, end)) return 0;
  }

  if (!(PERIODICITY_VALUES as readonly string[]).includes(subscription.periodicity)) return 0;

  switch (subscription.periodicity) {
    case 'unique':
      if (!isSameDay(checkDate, start)) return 0;
      break;
    case 'daily':
      break;
    case 'weekly': {
      const diff = Math.round((checkDate.getTime() - start.getTime()) / 86400000);
      if (diff % 7 !== 0) return 0;
      break;
    }
    case 'monthly': {
      const lastDay = endOfMonth(checkDate).getDate();
      if (checkDate.getDate() !== Math.min(start.getDate(), lastDay)) return 0;
      const months =
        (checkDate.getFullYear() - start.getFullYear()) * 12 + (checkDate.getMonth() - start.getMonth());
      if (months < 0) return 0;
      break;
    }
    case 'quarterly': {
      const months =
        (checkDate.getFullYear() - start.getFullYear()) * 12 + (checkDate.getMonth() - start.getMonth());
      if (months < 0 || months % 3 !== 0) return 0;
      const lastDay = endOfMonth(checkDate).getDate();
      if (checkDate.getDate() !== Math.min(start.getDate(), lastDay)) return 0;
      break;
    }
    case 'yearly': {
      if (checkDate.getMonth() !== start.getMonth()) return 0;
      const lastDay = endOfMonth(checkDate).getDate();
      if (checkDate.getDate() !== Math.min(start.getDate(), lastDay)) return 0;
      break;
    }
  }

  return subscription.amount;
}

export function calculateProjection(
  subscriptions: ProjectSubscription[],
  config: { startDate: string | Date; endDate: string | Date; initialBalance: number }
): ProjectionData[] {
  const results: ProjectionData[] = [];
  const startDate = toStart(config.startDate);
  let endDate = toStart(config.endDate);
  if (!startDate || !endDate) {
    Logger.error(
      'ProjectionService.calculateProjection',
      new Error('Plage de dates invalide'),
      `start=${String(config.startDate)} end=${String(config.endDate)}`
    );
    return results;
  }
  if (isAfter(startDate, endDate)) return results;
  const maxEnd = addDays(startDate, MAX_PROJECTION_DAYS - 1);
  if (isAfter(endDate, maxEnd)) endDate = maxEnd;

  const flatSubscriptions = getAllFlatSubscriptions(subscriptions);
  let dates: Date[];
  try {
    dates = eachDayOfInterval({ start: startDate, end: endDate });
  } catch (err) {
    Logger.error('ProjectionService.calculateProjection', err, 'eachDayOfInterval');
    return results;
  }
  let currentBalance = config.initialBalance;
  let cumulativeImpact = 0;

  for (const date of dates) {
    let totalDebits = 0;
    let totalCredits = 0;
    for (const subscription of flatSubscriptions) {
      const amount = applySubscriptionToDate(subscription, date);
      if (amount === 0) continue;
      if (subscription.type === 'debit') {
        totalDebits -= Math.abs(amount);
      } else {
        totalCredits += Math.abs(amount);
      }
    }
    const netFlow = totalCredits + totalDebits;
    currentBalance += netFlow;
    cumulativeImpact += netFlow;
    results.push({
      date: new Date(date),
      balance: currentBalance,
      totalDebits,
      totalCredits,
      netFlow,
      cumulativeImpact,
    });
  }
  return results;
}

export function aggregateByPeriod(
  projectionData: ProjectionData[],
  granularity: ChartGranularity
): PeriodAggregate {
  const periodData = new Map<
    string,
    { balance: number; debits: number; credits: number; netFlow: number }
  >();

  for (const data of projectionData) {
    const key = getPeriodKey(data.date, granularity);
    const existing = periodData.get(key);
    if (!existing) {
      periodData.set(key, {
        balance: data.balance,
        debits: data.totalDebits,
        credits: data.totalCredits,
        netFlow: data.netFlow,
      });
    } else {
      existing.balance = data.balance;
      existing.debits += data.totalDebits;
      existing.credits += data.totalCredits;
      existing.netFlow += data.netFlow;
    }
  }

  const periods = Array.from(periodData.keys()).sort();
  return {
    periods,
    balances: periods.map((p) => periodData.get(p)!.balance),
    debits: periods.map((p) => periodData.get(p)!.debits),
    credits: periods.map((p) => periodData.get(p)!.credits),
    netFlows: periods.map((p) => periodData.get(p)!.netFlow),
  };
}

export function calculateStats(
  projectionData: ProjectionData[],
  initialBalance: number
): ProjectionStats {
  if (projectionData.length === 0) {
    return {
      totalDebits: 0,
      totalCredits: 0,
      netFlow: 0,
      finalBalance: initialBalance,
    };
  }
  const totalDebits = projectionData.reduce((sum, d) => sum + d.totalDebits, 0);
  const totalCredits = projectionData.reduce((sum, d) => sum + d.totalCredits, 0);
  const last = projectionData[projectionData.length - 1]!;
  return {
    totalDebits,
    totalCredits,
    netFlow: totalCredits + totalDebits,
    finalBalance: last.balance,
  };
}

export interface ProjectedCategoryPoint {
  period: string;
  categoryCode: string;
  net: number;
}

export const ProjectionService = {
  getAllFlatSubscriptions,
  getAllGroupLines,
  applySubscriptionToDate,
  calculateProjection,
  aggregateByPeriod,
  calculateStats,

  /** Agrège les abonnements d'un projet par période et catégorie. */
  calculateByCategory(
    project: Project,
    subscriptions: ProjectSubscription[],
    granularity: ChartGranularity,
    rangeStart?: string,
    rangeEnd?: string
  ): ProjectedCategoryPoint[] {
    const start = toStart(rangeStart ?? project.startDate);
    let end = toStart(rangeEnd ?? project.endDate);
    if (!start || !end) {
      Logger.error(
        'ProjectionService.calculateByCategory',
        new Error('Plage de dates invalide'),
        `start=${String(rangeStart ?? project.startDate)} end=${String(rangeEnd ?? project.endDate)}`
      );
      return [];
    }
    if (isAfter(start, end)) return [];
    const maxEnd = addDays(start, MAX_PROJECTION_DAYS - 1);
    if (isAfter(end, maxEnd)) end = maxEnd;
    const totals = new Map<string, number>();
    const leaves = getAllFlatSubscriptions(subscriptions);

    for (const sub of leaves) {
      const subStart = toStart(sub.startDate);
      if (!subStart) continue;
      if (isAfter(start, subStart) && sub.periodicity === 'unique') continue;

      let current = subStart;
      const subEnd = sub.endDate ? toStart(sub.endDate) : null;
      const hardEnd = subEnd && !isAfter(subEnd, end) ? subEnd : end;
      if (isAfter(current, hardEnd)) continue;
      let guard = 0;
      while (!isAfter(current, hardEnd) && guard < 4000) {
        guard += 1;
        if (!isValid(current)) break;
        if (!isAfter(start, current) && !isAfter(current, end)) {
          const amount = applySubscriptionToDate(sub, current);
          if (amount !== 0) {
            const cat = sub.categoryCode ?? '—';
            const key = `${periodKeyLegacy(current, granularity)}|${cat}`;
            const signed = sub.type === 'debit' ? -Math.abs(amount) : Math.abs(amount);
            totals.set(key, (totals.get(key) ?? 0) + signed);
          }
        }
        if (sub.periodicity === 'unique') break;
        current = nextDate(current, sub.periodicity);
      }
    }

    return Array.from(totals.entries()).map(([key, net]) => {
      const [period, categoryCode] = key.split('|');
      return { period, categoryCode, net };
    });
  },

  async calculateLogged(
    project: Project,
    subscriptions: ProjectSubscription[],
    granularity: ChartGranularity,
    rangeStart?: string,
    rangeEnd?: string
  ): Promise<ProjectedCategoryPoint[]> {
    return withLog('ProjectionService.calculateByCategory', async () =>
      this.calculateByCategory(project, subscriptions, granularity, rangeStart, rangeEnd)
    );
  },
};
