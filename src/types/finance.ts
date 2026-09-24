export type FinanceTabId =
  | 'monthly'
  | 'balance'
  | 'projection'
  | 'bilan'
  | 'facturation'
  | 'dons'
  | 'contacts'
  | 'amortissement';

export interface FinanceTabConfig {
  id: FinanceTabId;
  visible: boolean;
  order: number;
}

export const FINANCE_TAB_CATALOG: FinanceTabId[] = [
  'monthly',
  'balance',
  'projection',
  'bilan',
  'facturation',
  'dons',
  'contacts',
  'amortissement',
];

export const DEFAULT_FINANCE_TABS: FinanceTabConfig[] = FINANCE_TAB_CATALOG.map((id, order) => ({
  id,
  visible: true,
  order,
}));

export const FINANCE_TAB_I18N: Record<FinanceTabId, string> = {
  monthly: 'financeGlobal.monthlyChart',
  balance: 'financeGlobal.balanceChart',
  projection: 'financeGlobal.projectionVsRealityChart',
  bilan: 'financeGlobal.bilanTab',
  facturation: 'financeGlobal.facturationTab',
  dons: 'financeGlobal.donsTab',
  contacts: 'financeGlobal.contactsTab',
  amortissement: 'financeGlobal.amortissementTab',
};

export const FINANCE_CHART_TABS_KEY = 'finance_chart_tabs';

import type { UsageMode } from '../utils/usageMode';

export function financePresetForUsage(mode: UsageMode): FinanceTabConfig[] {
  return FINANCE_TAB_CATALOG.map((id, order) => {
    let visible = true;
    if (mode === 'familiale') {
      if (id === 'facturation' || id === 'dons' || id === 'amortissement') visible = false;
    } else if (mode === 'tpe') {
      if (id === 'dons') visible = false;
    }
    return { id, visible, order };
  });
}

export function isFinanceTabAllowedForMode(tab: FinanceTabId, mode: UsageMode): boolean {
  if (mode === 'familiale' && (tab === 'facturation' || tab === 'dons' || tab === 'amortissement')) {
    return false;
  }
  if (mode === 'tpe' && tab === 'dons') return false;
  return true;
}
