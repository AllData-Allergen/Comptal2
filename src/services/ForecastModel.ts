import { Category } from '../types/models';
import {
  DEFAULT_SUBSCRIPTION_COLOR,
  FlowType,
  Periodicity,
  PERIODICITY_VALUES,
  Project,
  ProjectSubscription,
  ChartGranularity,
} from '../types/projection';
import {
  BalanceSeries,
  BreakdownDetail,
  BreakdownSlice,
  ForecastComputed,
  ForecastWidgetLayout,
} from '../types/forecast';
import { getPeriodLabel } from '../utils/periodKeys';
import { sanitizeForecastRange } from '../utils/forecastDates';
import { Logger } from './logger';
import {
  aggregateByPeriod,
  calculateProjection,
  calculateStats,
  getAllFlatSubscriptions,
  getAllGroupLines,
} from './ProjectionService';

export const EMPTY_TAIL_ROWS = 4;

export interface ForecastGridRow {
  id: number | null;
  parentId: number | null;
  isGroup: boolean;
  depth: number;
  name: string;
  groupName: string;
  type: FlowType;
  amount: number;
  periodicity: Periodicity;
  /** true si les enfants ont des périodicités différentes (affichage « Divers »). */
  periodicityMixed: boolean;
  startDate: string;
  endDate: string;
  categoryCode: string;
  color: string;
}

export interface GroupDerivedFields {
  amount: number;
  type: FlowType;
  periodicity: Periodicity;
  periodicityMixed: boolean;
  startDate: string;
  endDate: string;
}

/** Montant / type agrégés (signe : débit négatif, crédit positif). */
export function calculateGroupAmount(sub: ProjectSubscription): { amount: number; type: FlowType } {
  const derived = calculateGroupDerived(sub);
  return { amount: derived.amount, type: derived.type };
}

/**
 * Synthèse affichée sur une ligne Groupe à partir des enfants :
 * - montant / type : somme signée (comme Comptal2)
 * - périodicité : valeur commune, sinon « mixed »
 * - début : min des débuts enfants ; fin : max, ou illimité si un enfant l’est
 */
export function calculateGroupDerived(sub: ProjectSubscription): GroupDerivedFields {
  const fallback: GroupDerivedFields = {
    amount: sub.amount,
    type: sub.type,
    periodicity: sub.periodicity,
    periodicityMixed: false,
    startDate: sub.startDate || '',
    endDate: sub.endDate ?? '',
  };
  if (!sub.isGroup || !sub.children || sub.children.length === 0) {
    return fallback;
  }

  let total = 0;
  let periodicity: Periodicity | null = null;
  let periodicityMixed = false;
  let startDate = '';
  let endDate = '';
  let endUnlimited = false;
  let hasChildMeta = false;

  for (const child of sub.children) {
    const childFields = child.isGroup
      ? calculateGroupDerived(child)
      : {
          amount: child.amount,
          type: child.type,
          periodicity: child.periodicity,
          periodicityMixed: false,
          startDate: child.startDate || '',
          endDate: child.endDate ?? '',
        };

    const signed =
      childFields.type === 'debit' ? -Math.abs(childFields.amount) : Math.abs(childFields.amount);
    total += signed;

    if (childFields.periodicityMixed) {
      periodicityMixed = true;
    } else if (periodicity === null) {
      periodicity = childFields.periodicity;
    } else if (periodicity !== childFields.periodicity) {
      periodicityMixed = true;
    }

    if (childFields.startDate) {
      hasChildMeta = true;
      if (!startDate || childFields.startDate < startDate) startDate = childFields.startDate;
    }
    if (!childFields.endDate) {
      hasChildMeta = true;
      endUnlimited = true;
    } else if (!endUnlimited) {
      hasChildMeta = true;
      if (!endDate || childFields.endDate > endDate) endDate = childFields.endDate;
    }
  }

  return {
    amount: Math.abs(total),
    type: total >= 0 ? 'credit' : 'debit',
    periodicity: periodicityMixed || periodicity === null ? fallback.periodicity : periodicity,
    periodicityMixed,
    startDate: hasChildMeta ? startDate : fallback.startDate,
    endDate: hasChildMeta ? (endUnlimited ? '' : endDate) : fallback.endDate,
  };
}

export function treeToGridRows(
  tree: ProjectSubscription[],
  extraEmpty = EMPTY_TAIL_ROWS
): ForecastGridRow[] {
  const rows: ForecastGridRow[] = [];
  const walk = (nodes: ProjectSubscription[], depth: number, parentName: string) => {
    for (const node of nodes) {
      const derived = node.isGroup
        ? calculateGroupDerived(node)
        : {
            amount: node.amount,
            type: node.type,
            periodicity: node.periodicity,
            periodicityMixed: false,
            startDate: node.startDate,
            endDate: node.endDate ?? '',
          };
      rows.push({
        id: node.id,
        parentId: node.parentId,
        isGroup: node.isGroup,
        depth,
        name: node.name,
        groupName: parentName,
        type: derived.type,
        amount: derived.amount,
        periodicity: derived.periodicity,
        periodicityMixed: derived.periodicityMixed,
        startDate: derived.startDate,
        endDate: derived.endDate,
        categoryCode: node.categoryCode ?? '',
        color: node.color || DEFAULT_SUBSCRIPTION_COLOR,
      });
      if (node.children?.length) walk(node.children, depth + 1, node.name);
    }
  };
  walk(tree, 0, '');
  for (let i = 0; i < extraEmpty; i += 1) {
    rows.push({
      id: null,
      parentId: null,
      isGroup: false,
      depth: 0,
      name: '',
      groupName: '',
      type: 'debit',
      amount: 0,
      periodicity: 'monthly',
      periodicityMixed: false,
      startDate: '',
      endDate: '',
      categoryCode: '',
      color: DEFAULT_SUBSCRIPTION_COLOR,
    });
  }
  return rows;
}

export function parsePeriodicity(raw: unknown): Periodicity {
  const value = String(raw ?? '').trim().toLowerCase();
  const aliases: Record<string, Periodicity> = {
    unique: 'unique',
    ponctuel: 'unique',
    daily: 'daily',
    journalier: 'daily',
    weekly: 'weekly',
    hebdomadaire: 'weekly',
    monthly: 'monthly',
    mensuel: 'monthly',
    quarterly: 'quarterly',
    trimestriel: 'quarterly',
    yearly: 'yearly',
    annuel: 'yearly',
  };
  if (PERIODICITY_VALUES.includes(value as Periodicity)) return value as Periodicity;
  return aliases[value] ?? 'monthly';
}

export function parseFlowType(raw: unknown): FlowType {
  const value = String(raw ?? '').trim().toLowerCase();
  if (value === 'credit' || value === 'crédit') return 'credit';
  return 'debit';
}

export function collectDescendantIds(tree: ProjectSubscription[], rootId: number): Set<number> {
  const ids = new Set<number>();
  const find = (nodes: ProjectSubscription[]): ProjectSubscription | null => {
    for (const n of nodes) {
      if (n.id === rootId) return n;
      if (n.children?.length) {
        const found = find(n.children);
        if (found) return found;
      }
    }
    return null;
  };
  const walk = (n: ProjectSubscription) => {
    for (const child of n.children ?? []) {
      ids.add(child.id);
      walk(child);
    }
  };
  const root = find(tree);
  if (root) walk(root);
  return ids;
}

/** Retire un nœud et tout son sous-arbre (optimiste, aligné sur la ref Comptal2). */
export function removeNodeFromTree(
  tree: ProjectSubscription[],
  id: number
): ProjectSubscription[] {
  return tree
    .filter((node) => node.id !== id)
    .map((node) => ({
      ...node,
      children: node.children?.length ? removeNodeFromTree(node.children, id) : [],
    }));
}

export function emptyForecastComputed(initialBalance = 0): ForecastComputed {
  return {
    projectionData: [],
    aggregates: { periods: [], balances: [], debits: [], credits: [], netFlows: [] },
    stats: {
      totalDebits: 0,
      totalCredits: 0,
      netFlow: 0,
      finalBalance: initialBalance,
    },
    balanceSeries: { labels: [], balances: [], debits: [], credits: [] },
    debitCredit: [],
    categories: [],
    lines: [],
    groups: [],
    categoryDetails: {},
    groupDetails: {},
  };
}

export function computeForecast(
  project: Project,
  tree: ProjectSubscription[],
  categories: Category[],
  granularity: ChartGranularity
): ForecastComputed {
  try {
    const range = sanitizeForecastRange(project.startDate, project.endDate, {
      start: project.startDate,
      end: project.endDate,
    });
    if (range.issues.length > 0) {
      Logger.error(
        'ForecastModel.computeForecast',
        new Error(`Dates projet incompatibles: ${range.issues.join(',')}`),
        `start=${String(project.startDate)} end=${String(project.endDate)} → ${range.startDate}..${range.endDate}`
      );
    }

    const projectionData = calculateProjection(tree, {
      startDate: range.startDate,
      endDate: range.endDate,
      initialBalance: project.initialBalance,
    });
    const aggregates = aggregateByPeriod(projectionData, granularity);
    const stats = calculateStats(projectionData, project.initialBalance);
    const balanceSeries: BalanceSeries = {
      labels: aggregates.periods.map((p) => getPeriodLabel(p, granularity)),
      balances: aggregates.balances,
      debits: aggregates.debits,
      credits: aggregates.credits,
    };

    const debitCredit: BreakdownSlice[] = [
      { id: 'debit', label: 'Débits', value: Math.abs(stats.totalDebits), color: '#ef4444' },
      { id: 'credit', label: 'Crédits', value: Math.abs(stats.totalCredits), color: '#10b981' },
    ].filter((s) => s.value > 0);

    const leaves = getAllFlatSubscriptions(tree);
    const byCat = new Map<string, BreakdownSlice>();
    const categoryDetails: Record<string, BreakdownDetail[]> = {};
    for (const leaf of leaves) {
      const code = leaf.categoryCode ?? '—';
      const cat = categories.find((c) => c.code === code);
      const label = cat?.name ?? (code === '—' ? 'Sans catégorie' : code);
      const color = leaf.color || cat?.color || DEFAULT_SUBSCRIPTION_COLOR;
      const signed = leaf.type === 'debit' ? -Math.abs(leaf.amount) : Math.abs(leaf.amount);
      const existing = byCat.get(code);
      if (existing) existing.value += signed;
      else byCat.set(code, { id: code, label, value: signed, color });
      const details = categoryDetails[code] ?? [];
      details.push({ label: leaf.name, value: signed });
      categoryDetails[code] = details;
    }

    const lines: BreakdownSlice[] = leaves
      .filter((l) => l.amount !== 0)
      .map((l) => ({
        id: String(l.id),
        label: l.name,
        value: l.type === 'debit' ? -Math.abs(l.amount) : Math.abs(l.amount),
        color: l.color || DEFAULT_SUBSCRIPTION_COLOR,
      }));

    const groups: BreakdownSlice[] = [];
    const groupDetails: Record<string, BreakdownDetail[]> = {};
    let ungroupedValue = 0;
    const ungroupedDetails: BreakdownDetail[] = [];
    for (const node of tree) {
      if (node.isGroup) {
        const groupLeaves = getAllGroupLines(node);
        const details = groupLeaves.map((leaf) => ({
          label: leaf.name,
          value: leaf.type === 'debit' ? -Math.abs(leaf.amount) : Math.abs(leaf.amount),
        }));
        const value = details.reduce((sum, item) => sum + Math.abs(item.value), 0);
        if (value === 0 && details.length === 0) continue;
        groups.push({
          id: String(node.id),
          label: node.name,
          value,
          color: node.color || DEFAULT_SUBSCRIPTION_COLOR,
        });
        groupDetails[String(node.id)] = details;
      } else {
        const signed = node.type === 'debit' ? -Math.abs(node.amount) : Math.abs(node.amount);
        if (node.amount === 0) continue;
        ungroupedValue += Math.abs(signed);
        ungroupedDetails.push({ label: node.name, value: signed });
      }
    }
    if (ungroupedValue > 0) {
      groups.push({
        id: '__ungrouped',
        label: 'Sans groupe',
        value: ungroupedValue,
        color: DEFAULT_SUBSCRIPTION_COLOR,
      });
      groupDetails.__ungrouped = ungroupedDetails;
    }

    return {
      projectionData,
      aggregates,
      stats,
      balanceSeries,
      debitCredit,
      categories: Array.from(byCat.values()),
      lines,
      groups,
      categoryDetails,
      groupDetails,
    };
  } catch (err) {
    Logger.error('ForecastModel.computeForecast', err);
    return emptyForecastComputed(project.initialBalance);
  }
}

export function cloneLayout(layout: ForecastWidgetLayout): ForecastWidgetLayout {
  return {
    chartGranularity: layout.chartGranularity,
    splitRatio: layout.splitRatio,
    columns: [...layout.columns],
    columnWidths: { ...layout.columnWidths },
    widgets: layout.widgets.map((w) => ({ ...w })),
  };
}
