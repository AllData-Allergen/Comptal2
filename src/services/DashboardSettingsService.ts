import {
  DashboardSettings,
  DashboardSettingsContext,
} from '../types/dashboard';
import { Db } from './db';
import { withLog } from './logger';

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function defaultDashboardSettings(context: DashboardSettingsContext): DashboardSettings {
  const invoicing =
    context.invoicingMenu &&
    (context.hasInvoices ||
      context.emetteurType === 'entreprise' ||
      context.emetteurType === 'auto_entrepreneur');
  const association =
    context.associationMenu &&
    (context.hasDonations || context.emetteurType === 'association');
  const contacts = context.contactsMenu;
  const legal = context.registerMenu || invoicing || association;
  const amortissement = context.amortissementMenu && context.hasImmobilisations;

  return {
    donationsByDonorMode: 'cumulative',
    widgets: {
      charts: {
        expensesByCategory: true,
        incomePie: true,
        accountBalances: true,
        invoiceVsPayment: invoicing,
        invoiceAging: invoicing,
        donationsByDonor: association,
        amortissement,
      },
      summary: {
        treasuryKpis: true,
        invoicingKpis: invoicing,
        associationKpis: association,
        contactKpis: contacts,
        legalReminders: legal,
        miniCards: true,
        topCategories: true,
      },
    },
  };
}

function asBool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function mergeSettings(base: DashboardSettings, stored: unknown): DashboardSettings {
  const src = stored && typeof stored === 'object' && !Array.isArray(stored)
    ? (stored as Record<string, unknown>)
    : {};
  const widgets = src.widgets && typeof src.widgets === 'object' && !Array.isArray(src.widgets)
    ? (src.widgets as Record<string, unknown>)
    : {};
  const chartsIn = widgets.charts && typeof widgets.charts === 'object' && !Array.isArray(widgets.charts)
    ? (widgets.charts as Record<string, unknown>)
    : {};
  const summaryIn = widgets.summary && typeof widgets.summary === 'object' && !Array.isArray(widgets.summary)
    ? (widgets.summary as Record<string, unknown>)
    : {};
  const mode = src.donationsByDonorMode;
  return {
    donationsByDonorMode: mode === 'period' || mode === 'cumulative' ? mode : base.donationsByDonorMode,
    widgets: {
      charts: {
        expensesByCategory: asBool(chartsIn.expensesByCategory, base.widgets.charts.expensesByCategory),
        incomePie: asBool(chartsIn.incomePie, base.widgets.charts.incomePie),
        accountBalances: asBool(chartsIn.accountBalances, base.widgets.charts.accountBalances),
        invoiceVsPayment: asBool(chartsIn.invoiceVsPayment, base.widgets.charts.invoiceVsPayment),
        invoiceAging: asBool(chartsIn.invoiceAging, base.widgets.charts.invoiceAging),
        donationsByDonor: asBool(chartsIn.donationsByDonor, base.widgets.charts.donationsByDonor),
        amortissement: asBool(chartsIn.amortissement, base.widgets.charts.amortissement),
      },
      summary: {
        treasuryKpis: asBool(summaryIn.treasuryKpis, base.widgets.summary.treasuryKpis),
        invoicingKpis: asBool(summaryIn.invoicingKpis, base.widgets.summary.invoicingKpis),
        associationKpis: asBool(summaryIn.associationKpis, base.widgets.summary.associationKpis),
        contactKpis: asBool(summaryIn.contactKpis, base.widgets.summary.contactKpis),
        legalReminders: asBool(summaryIn.legalReminders, base.widgets.summary.legalReminders),
        miniCards: asBool(summaryIn.miniCards, base.widgets.summary.miniCards),
        topCategories: asBool(summaryIn.topCategories, base.widgets.summary.topCategories),
      },
    },
  };
}

async function ensureTable(): Promise<void> {
  await Db.execute(
    `CREATE TABLE IF NOT EXISTS dashboard_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      payload TEXT NOT NULL
    )`
  );
}

export const DashboardSettingsService = {
  defaults: defaultDashboardSettings,

  async load(context: Omit<DashboardSettingsContext, 'hasInvoices' | 'hasDonations' | 'hasImmobilisations'>): Promise<DashboardSettings> {
    return withLog('DashboardSettingsService.load', async () => {
      await ensureTable();
      let hasInvoices = false;
      let hasDonations = false;
      let hasImmobilisations = false;
      try {
        const invoiceRows = await Db.select<{ id: string }>('SELECT id FROM factures LIMIT 1');
        hasInvoices = invoiceRows.length > 0;
      } catch {
        hasInvoices = false;
      }
      try {
        const donationRows = await Db.select<{ id: string }>('SELECT id FROM donations LIMIT 1');
        hasDonations = donationRows.length > 0;
      } catch {
        hasDonations = false;
      }
      try {
        const immoRows = await Db.select<{ id: string }>('SELECT id FROM immobilisations LIMIT 1');
        hasImmobilisations = immoRows.length > 0;
      } catch {
        hasImmobilisations = false;
      }
      const defaults = defaultDashboardSettings({
        ...context,
        hasInvoices,
        hasDonations,
        hasImmobilisations,
      });
      const rows = await Db.select<{ payload: string }>(
        'SELECT payload FROM dashboard_settings WHERE id = 1'
      );
      if (!rows[0]?.payload) return defaults;
      return mergeSettings(defaults, parseJson(rows[0].payload, {}));
    });
  },

  async save(settings: DashboardSettings): Promise<void> {
    return withLog('DashboardSettingsService.save', async () => {
      await ensureTable();
      await Db.execute(
        `INSERT INTO dashboard_settings (id, payload) VALUES (1, ?)
         ON CONFLICT(id) DO UPDATE SET payload = excluded.payload`,
        [JSON.stringify(settings)]
      );
    });
  },
};
