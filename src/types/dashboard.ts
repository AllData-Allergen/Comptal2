import type { RegisterDocumentType } from './register';

export type DonationsByDonorMode = 'period' | 'cumulative';

export interface DashboardChartWidgets {
  expensesByCategory: boolean;
  incomePie: boolean;
  accountBalances: boolean;
  invoiceVsPayment: boolean;
  invoiceAging: boolean;
  donationsByDonor: boolean;
  amortissement: boolean;
}

export interface DashboardSummaryWidgets {
  treasuryKpis: boolean;
  invoicingKpis: boolean;
  associationKpis: boolean;
  contactKpis: boolean;
  legalReminders: boolean;
  miniCards: boolean;
  topCategories: boolean;
}

export interface DashboardSettings {
  widgets: {
    charts: DashboardChartWidgets;
    summary: DashboardSummaryWidgets;
  };
  donationsByDonorMode: DonationsByDonorMode;
}

export interface DashboardSettingsContext {
  invoicingMenu: boolean;
  associationMenu: boolean;
  contactsMenu: boolean;
  registerMenu: boolean;
  amortissementMenu: boolean;
  emetteurType?: string | null;
  hasInvoices: boolean;
  hasDonations: boolean;
  hasImmobilisations: boolean;
}

export type LegalReminderSeverity = 'info' | 'warn' | 'urgent';

export interface LegalReminder {
  id: string;
  severity: LegalReminderSeverity;
  titleKey: string;
  detailKey: string;
  to: string;
  count?: number;
  params?: Record<string, string | number>;
  /** Type système de registre à traduire via `register.types.*` (pas un titre saisi). */
  registerType?: RegisterDocumentType;
}

export interface InvoiceAgingBuckets {
  current: number;
  d1to30: number;
  d31to60: number;
  d61to90: number;
  d90plus: number;
}

export interface InvoicePeriodSeries {
  labels: string[];
  invoiced: number[];
  collected: number[];
  collectionRate: number[];
}

export interface DonorSeries {
  id: string;
  label: string;
  color: string;
  data: number[];
}

export interface InvoicingInsights {
  invoiced: number;
  collected: number;
  outstanding: number;
  dsoDays: number;
  overdueCount: number;
  overdueAmount: number;
  onTimeRate: number;
  unpaidRate: number;
  openQuotesCount: number;
  openQuotesAmount: number;
  oldDraftCount: number;
  unlinkedInvoiceCount: number;
  series: InvoicePeriodSeries;
  aging: InvoiceAgingBuckets;
}

export interface AssociationInsights {
  total: number;
  count: number;
  donorCount: number;
  average: number;
  receiptsPending: number;
  newDonors: number;
  returningDonors: number;
  retentionRate: number | null;
  top3Share: number;
  anonymousShare: number;
  natureShare: number;
  unlinkedDonationCount: number;
  labels: string[];
  donors: DonorSeries[];
}

export interface ContactInsights {
  total: number;
  clients: number;
  donors: number;
  both: number;
  incomplete: number;
  missingSiren: number;
  incompleteDonors: number;
  unused: number;
}

export interface DashboardInsights {
  invoicing: InvoicingInsights;
  association: AssociationInsights;
  contacts: ContactInsights;
  reminders: LegalReminder[];
}
