import { differenceInCalendarDays, subDays } from 'date-fns';
import {
  AssociationInsights,
  ContactInsights,
  DashboardInsights,
  DonationsByDonorMode,
  DonorSeries,
  InvoiceAgingBuckets,
  InvoicingInsights,
  LegalReminder,
} from '../types/dashboard';
import { ChartGranularity } from '../types/projection';
import { Client, Devis, Facture } from '../types/invoice';
import { Donation } from '../types/association';
import { clientDisplayName, isDevisCaduc } from '../utils/invoiceFormat';
import { toIsoDate } from '../utils/dateFormats';
import { enumeratePeriodKeys, getPeriodKey, getPeriodLabel } from '../utils/periodKeys';
import { StatsFilters, StatsService } from './StatsService';
import { InvoiceService } from './InvoiceService';
import { PaymentTrackingService } from './PaymentTrackingService';
import { DonationService } from './DonationService';
import { ClientService } from './ClientService';
import { RegisterService } from './RegisterService';
import { Db } from './db';
import { withLog } from './logger';
import { ASSOCIATION_REGISTER_TYPES, RegisterDocumentType } from '../types/register';
import { MicroEnterpriseService } from './MicroEnterpriseService';

const DONOR_PALETTE = [
  '#1e3a8a',
  '#2563eb',
  '#0ea5e9',
  '#14b8a6',
  '#22c55e',
  '#eab308',
  '#f97316',
  '#ef4444',
  '#8b5cf6',
  '#64748b',
];

const DONATION_THRESHOLD = 153000;
const ELECTRONIC_INVOICE_DATE = '2026-09-01';

interface InsightsOptions {
  filters: StatsFilters;
  granularity: ChartGranularity;
  donationsByDonorMode: DonationsByDonorMode;
  include?: {
    invoicing?: boolean;
    association?: boolean;
    contacts?: boolean;
    reminders?: boolean;
    register?: boolean;
  };
}

function inRange(iso: string, start?: string, end?: string): boolean {
  if (start && iso < start) return false;
  if (end && iso > end) return false;
  return true;
}

function matchesSearch(haystack: string, search?: string): boolean {
  if (!search?.trim()) return true;
  return haystack.toLowerCase().includes(search.trim().toLowerCase());
}

function colorFor(id: string, index: number): string {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return DONOR_PALETTE[index % DONOR_PALETTE.length] ?? DONOR_PALETTE[hash % DONOR_PALETTE.length];
}

function contactColor(id: string, clients: Client[], index: number): string {
  const color = clients.find((client) => client.id === id)?.color;
  return color?.trim() || colorFor(id, index);
}

function hasAddress(client: Client): boolean {
  const address = client.adresseFacturation;
  return Boolean(address?.rue?.trim() && address?.ville?.trim());
}

function hasIdentity(client: Client): boolean {
  if (client.type === 'entreprise') return Boolean(client.denominationSociale?.trim());
  return Boolean(client.nom?.trim() || client.prenom?.trim());
}

function isIssuedInvoice(facture: Facture): boolean {
  return !facture.supprime && facture.statut !== 'brouillon' && facture.statut !== 'annulee';
}

function lastPaymentDate(facture: Facture): Date | undefined {
  if (facture.paiements.length === 0) return undefined;
  return facture.paiements.reduce(
    (latest, payment) => (payment.datePaiement > latest ? payment.datePaiement : latest),
    facture.paiements[0].datePaiement
  );
}

function emptyInvoicing(labels: string[]): InvoicingInsights {
  return {
    invoiced: 0,
    collected: 0,
    outstanding: 0,
    dsoDays: 0,
    overdueCount: 0,
    overdueAmount: 0,
    onTimeRate: 0,
    unpaidRate: 0,
    openQuotesCount: 0,
    openQuotesAmount: 0,
    oldDraftCount: 0,
    unlinkedInvoiceCount: 0,
    series: {
      labels,
      invoiced: labels.map(() => 0),
      collected: labels.map(() => 0),
      collectionRate: labels.map(() => 0),
    },
    aging: { current: 0, d1to30: 0, d31to60: 0, d61to90: 0, d90plus: 0 },
  };
}

function emptyAssociation(labels: string[]): AssociationInsights {
  return {
    total: 0,
    count: 0,
    donorCount: 0,
    average: 0,
    receiptsPending: 0,
    newDonors: 0,
    returningDonors: 0,
    retentionRate: null,
    top3Share: 0,
    anonymousShare: 0,
    natureShare: 0,
    unlinkedDonationCount: 0,
    labels,
    donors: [],
  };
}

function buildInvoicing(
  factures: Facture[],
  devis: Devis[],
  clients: Client[],
  txIds: Set<string> | null,
  accountFilterActive: boolean,
  options: InsightsOptions,
  labels: string[],
  periodKeys: string[]
): InvoicingInsights {
  const { filters, granularity } = options;
  const start = filters.dateStart;
  const end = filters.dateEnd;
  const clientName = (id: string) => {
    const client = clients.find((item) => item.id === id);
    return client ? clientDisplayName(client) : '';
  };
  const invoiceMatches = (facture: Facture) => {
    const issued = toIsoDate(facture.dateEmission);
    if (!inRange(issued, start, end)) return false;
    if (
      !matchesSearch(
        `${facture.numero} ${facture.intituleSecondaire ?? ''} ${clientName(facture.clientId)}`,
        filters.search
      )
    ) {
      return false;
    }
    if (!accountFilterActive || !txIds) return true;
    const linked = facture.paiements.some((payment) => payment.transactionId);
    if (!linked) return false;
    return facture.paiements.some(
      (payment) => payment.transactionId && txIds.has(String(payment.transactionId))
    );
  };

  const issued = factures.filter((facture) => isIssuedInvoice(facture) && invoiceMatches(facture));
  const periodDays = start && end
    ? Math.max(1, differenceInCalendarDays(new Date(`${end}T00:00:00`), new Date(`${start}T00:00:00`)) + 1)
    : 1;
  const today = toIsoDate(new Date());

  let invoiced = 0;
  let collected = 0;
  let outstanding = 0;
  let overdueCount = 0;
  let overdueAmount = 0;
  let overdueOutstanding = 0;
  let paidCount = 0;
  let onTimeCount = 0;
  let unlinkedInvoiceCount = 0;
  const invoicedSeries = periodKeys.map(() => 0);
  const collectedSeries = periodKeys.map(() => 0);
  const aging: InvoiceAgingBuckets = {
    current: 0,
    d1to30: 0,
    d31to60: 0,
    d61to90: 0,
    d90plus: 0,
  };

  for (const facture of issued) {
    invoiced += facture.totalTTC;
    const remaining = PaymentTrackingService.getRemainingAmount(facture);
    outstanding += remaining;
    const issuedIso = toIsoDate(facture.dateEmission);
    const issuedKey = getPeriodKey(facture.dateEmission, granularity);
    const issuedIdx = periodKeys.indexOf(issuedKey);
    if (issuedIdx >= 0) invoicedSeries[issuedIdx] += facture.totalTTC;

    const hasLink = facture.paiements.some((payment) => payment.transactionId);
    if (!hasLink) unlinkedInvoiceCount += 1;

    if (remaining > 0.009) {
      const echeance = facture.dateEcheance ? toIsoDate(facture.dateEcheance) : issuedIso;
      if (echeance < today) {
        overdueCount += 1;
        overdueAmount += remaining;
        overdueOutstanding += remaining;
        const daysLate = differenceInCalendarDays(new Date(`${today}T00:00:00`), new Date(`${echeance}T00:00:00`));
        if (daysLate <= 30) aging.d1to30 += remaining;
        else if (daysLate <= 60) aging.d31to60 += remaining;
        else if (daysLate <= 90) aging.d61to90 += remaining;
        else aging.d90plus += remaining;
      } else {
        aging.current += remaining;
      }
    } else {
      paidCount += 1;
      const lastPay = lastPaymentDate(facture);
      if (!facture.dateEcheance || !lastPay || lastPay.getTime() <= facture.dateEcheance.getTime()) {
        onTimeCount += 1;
      }
    }
  }

  for (const facture of factures.filter((item) => isIssuedInvoice(item))) {
    if (
      !matchesSearch(
        `${facture.numero} ${facture.intituleSecondaire ?? ''} ${clientName(facture.clientId)}`,
        filters.search
      )
    ) {
      continue;
    }
    if (accountFilterActive && txIds) {
      const linked = facture.paiements.some((payment) => payment.transactionId);
      if (!linked) continue;
      if (!facture.paiements.some((payment) => payment.transactionId && txIds.has(String(payment.transactionId)))) {
        continue;
      }
    }
    for (const payment of facture.paiements) {
      const payIso = toIsoDate(payment.datePaiement);
      if (!inRange(payIso, start, end)) continue;
      collected += payment.montant;
      const payKey = getPeriodKey(payment.datePaiement, granularity);
      const payIdx = periodKeys.indexOf(payKey);
      if (payIdx >= 0) collectedSeries[payIdx] += payment.montant;
    }
  }

  const openQuotes = devis.filter((quote) => {
    if (quote.supprime || isDevisCaduc(quote) || quote.factureGeneree) return false;
    const issued = toIsoDate(quote.dateEmission);
    if (!inRange(issued, start, end)) return false;
    return matchesSearch(
      `${quote.numero} ${quote.intituleSecondaire ?? ''} ${clientName(quote.clientId)}`,
      filters.search
    );
  });

  const oldDraftCount = factures.filter((facture) => {
    if (facture.supprime || facture.statut !== 'brouillon') return false;
    const issued = toIsoDate(facture.dateEmission);
    if (!inRange(issued, start, end)) return false;
    return differenceInCalendarDays(new Date(`${today}T00:00:00`), facture.dateEmission) > 30;
  }).length;

  return {
    invoiced,
    collected,
    outstanding,
    dsoDays: invoiced > 0 ? (outstanding / invoiced) * periodDays : 0,
    overdueCount,
    overdueAmount,
    onTimeRate: paidCount > 0 ? (onTimeCount / paidCount) * 100 : 0,
    unpaidRate: outstanding > 0 ? (overdueOutstanding / outstanding) * 100 : 0,
    openQuotesCount: openQuotes.length,
    openQuotesAmount: openQuotes.reduce((sum, quote) => sum + quote.totalTTC, 0),
    oldDraftCount,
    unlinkedInvoiceCount: accountFilterActive ? unlinkedInvoiceCount : 0,
    series: {
      labels,
      invoiced: invoicedSeries,
      collected: collectedSeries,
      collectionRate: invoicedSeries.map((value, index) =>
        value > 0 ? (collectedSeries[index] / value) * 100 : 0
      ),
    },
    aging,
  };
}

function buildAssociation(
  donations: Donation[],
  clients: Client[],
  txIds: Set<string> | null,
  accountOrCategoryFilter: boolean,
  options: InsightsOptions,
  labels: string[],
  periodKeys: string[]
): AssociationInsights {
  const { filters, granularity, donationsByDonorMode } = options;
  const start = filters.dateStart;
  const end = filters.dateEnd;
  const donorName = (donation: Donation) => {
    if (donation.anonymous) return 'Anonymes';
    const client = donation.contactId
      ? clients.find((item) => item.id === donation.contactId)
      : undefined;
    return donation.donorLabel?.trim() || (client ? clientDisplayName(client) : 'Donateur');
  };

  const matches = (donation: Donation) => {
    if (!inRange(donation.date, start, end)) return false;
    if (!matchesSearch(`${donorName(donation)} ${donation.description ?? ''}`, filters.search)) {
      return false;
    }
    if (!accountOrCategoryFilter || !txIds) return true;
    if (!donation.transactionId) return false;
    return txIds.has(String(donation.transactionId));
  };

  const periodDonations = donations.filter(matches);
  const totalsByDonor = new Map<string, { label: string; total: number }>();
  for (const donation of periodDonations) {
    const id = donation.anonymous ? 'anonymous' : donation.contactId ?? `label:${donation.donorLabel ?? 'inconnu'}`;
    const current = totalsByDonor.get(id) ?? { label: donorName(donation), total: 0 };
    current.total += donation.montant;
    totalsByDonor.set(id, current);
  }

  const ranked = [...totalsByDonor.entries()].sort((a, b) => b[1].total - a[1].total);
  const top = ranked.filter(([id]) => id !== 'anonymous').slice(0, 8);
  const topIds = new Set(top.map(([id]) => id));
  const donorSeries: DonorSeries[] = top.map(([id, info], index) => ({
    id,
    label: info.label,
    color: contactColor(id, clients, index),
    data: periodKeys.map(() => 0),
  }));
  const others: DonorSeries = {
    id: 'others',
    label: 'Autres',
    color: colorFor('others', 8),
    data: periodKeys.map(() => 0),
  };
  const anonymous: DonorSeries = {
    id: 'anonymous',
    label: 'Anonymes',
    color: colorFor('anonymous', 9),
    data: periodKeys.map(() => 0),
  };

  for (const donation of periodDonations) {
    const key = getPeriodKey(new Date(`${donation.date}T00:00:00`), granularity);
    const idx = periodKeys.indexOf(key);
    if (idx < 0) continue;
    const id = donation.anonymous ? 'anonymous' : donation.contactId ?? `label:${donation.donorLabel ?? 'inconnu'}`;
    if (id === 'anonymous') anonymous.data[idx] += donation.montant;
    else if (topIds.has(id)) {
      const series = donorSeries.find((item) => item.id === id);
      if (series) series.data[idx] += donation.montant;
    } else {
      others.data[idx] += donation.montant;
    }
  }

  const maybeCumulative = (series: DonorSeries): DonorSeries => {
    if (donationsByDonorMode !== 'cumulative') return series;
    let running = 0;
    return {
      ...series,
      data: series.data.map((value) => {
        running += value;
        return running;
      }),
    };
  };

  const donors = [
    ...donorSeries.map(maybeCumulative),
    ...(others.data.some((value) => value > 0) ? [maybeCumulative(others)] : []),
    ...(anonymous.data.some((value) => value > 0) ? [maybeCumulative(anonymous)] : []),
  ];

  const namedDonors = periodDonations.filter((donation) => donation.contactId && !donation.anonymous);
  const donorIds = new Set(namedDonors.map((donation) => donation.contactId as string));
  const previousDonors = new Set(
    donations
      .filter((donation) => donation.contactId && !donation.anonymous && start && donation.date < start)
      .map((donation) => donation.contactId as string)
  );
  let newDonors = 0;
  let returningDonors = 0;
  for (const id of donorIds) {
    if (previousDonors.has(id)) returningDonors += 1;
    else newDonors += 1;
  }

  let retentionRate: number | null = null;
  if (start && end) {
    const days = Math.max(1, differenceInCalendarDays(new Date(`${end}T00:00:00`), new Date(`${start}T00:00:00`)) + 1);
    const prevEnd = toIsoDate(subDays(new Date(`${start}T00:00:00`), 1));
    const prevStart = toIsoDate(subDays(new Date(`${start}T00:00:00`), days));
    const previousPeriodDonors = new Set(
      donations
        .filter((donation) => donation.contactId && !donation.anonymous && inRange(donation.date, prevStart, prevEnd))
        .map((donation) => donation.contactId as string)
    );
    if (previousPeriodDonors.size > 0) {
      let retained = 0;
      for (const id of previousPeriodDonors) {
        if (donorIds.has(id)) retained += 1;
      }
      retentionRate = (retained / previousPeriodDonors.size) * 100;
    }
  }

  const total = periodDonations.reduce((sum, donation) => sum + donation.montant, 0);
  const top3 = ranked.slice(0, 3).reduce((sum, [, info]) => sum + info.total, 0);
  const anonymousTotal = periodDonations
    .filter((donation) => donation.anonymous)
    .reduce((sum, donation) => sum + donation.montant, 0);
  const natureTotal = periodDonations
    .filter((donation) => donation.natureDon !== 'numeraire')
    .reduce((sum, donation) => sum + donation.montant, 0);

  return {
    total,
    count: periodDonations.length,
    donorCount: donorIds.size + (periodDonations.some((donation) => donation.anonymous) ? 1 : 0),
    average: periodDonations.length > 0 ? total / periodDonations.length : 0,
    receiptsPending: periodDonations.filter(
      (donation) => donation.receiptEligible && !donation.receiptId && !donation.anonymous
    ).length,
    newDonors,
    returningDonors,
    retentionRate,
    top3Share: total > 0 ? (top3 / total) * 100 : 0,
    anonymousShare: total > 0 ? (anonymousTotal / total) * 100 : 0,
    natureShare: total > 0 ? (natureTotal / total) * 100 : 0,
    unlinkedDonationCount: accountOrCategoryFilter
      ? periodDonations.filter((donation) => !donation.transactionId).length
      : 0,
    labels,
    donors,
  };
}

function buildContacts(
  clients: Client[],
  devis: Devis[],
  factures: Facture[],
  donations: Donation[],
  filters: StatsFilters
): ContactInsights {
  const start = filters.dateStart;
  const end = filters.dateEnd;
  const visible = clients.filter((client) => {
    if (client.archived) return false;
    return matchesSearch(
      `${clientDisplayName(client)} ${client.email ?? ''} ${client.telephone ?? ''}`,
      filters.search
    );
  });
  const usedIds = new Set<string>();
  for (const quote of devis) {
    if (quote.supprime) continue;
    if (!inRange(toIsoDate(quote.dateEmission), start, end)) continue;
    usedIds.add(quote.clientId);
  }
  for (const facture of factures) {
    if (facture.supprime) continue;
    if (!inRange(toIsoDate(facture.dateEmission), start, end)) continue;
    usedIds.add(facture.clientId);
  }
  for (const donation of donations) {
    if (!donation.contactId || !inRange(donation.date, start, end)) continue;
    usedIds.add(donation.contactId);
  }

  const roleOf = (client: Client) => client.roles ?? [];
  return {
    total: visible.length,
    clients: visible.filter((client) => roleOf(client).includes('client')).length,
    donors: visible.filter((client) => roleOf(client).includes('donateur')).length,
    both: visible.filter((client) => roleOf(client).includes('client') && roleOf(client).includes('donateur')).length,
    incomplete: visible.filter((client) => !client.email?.trim() || !hasAddress(client)).length,
    missingSiren: visible.filter(
      (client) =>
        client.type === 'entreprise' &&
        roleOf(client).includes('client') &&
        !client.siren?.trim() &&
        !client.siret?.trim()
    ).length,
    incompleteDonors: visible.filter(
      (client) => roleOf(client).includes('donateur') && (!hasIdentity(client) || !hasAddress(client))
    ).length,
    unused: visible.filter((client) => !usedIds.has(client.id)).length,
  };
}

function reminderItem(
  id: string,
  severity: LegalReminder['severity'],
  itemKey: string,
  to: string,
  options?: {
    detailSuffix?: string;
    count?: number;
    params?: Record<string, string | number>;
    registerType?: RegisterDocumentType;
  }
): LegalReminder {
  const detailKey = options?.detailSuffix
    ? `dashboard.reminders.items.${itemKey}.${options.detailSuffix}`
    : `dashboard.reminders.items.${itemKey}.detail`;
  return {
    id,
    severity,
    titleKey: `dashboard.reminders.items.${itemKey}.title`,
    detailKey,
    to,
    count: options?.count,
    params: options?.params,
    registerType: options?.registerType,
  };
}

function buildReminders(
  invoicing: InvoicingInsights,
  association: AssociationInsights,
  contacts: ContactInsights,
  donations: Donation[],
  registerKinds: RegisterDocumentType[],
  enabledTypes: RegisterDocumentType[],
  mentionsAllOff: boolean,
  dateEnd?: string
): LegalReminder[] {
  const reminders: LegalReminder[] = [];
  const year = (dateEnd ?? toIsoDate(new Date())).slice(0, 4);
  const today = toIsoDate(new Date());

  if (association.receiptsPending > 0) {
    reminders.push(
      reminderItem('receipts-pending', 'urgent', 'receiptsPending', '/dons', {
        count: association.receiptsPending,
        params: { count: association.receiptsPending },
      })
    );
  }

  const hasKind = (type: RegisterDocumentType) =>
    registerKinds.some((kind) => kind === type);
  if (enabledTypes.includes('donation_journal') && !hasKind('donation_journal')) {
    reminders.push(
      reminderItem('register-donation-journal', 'warn', 'donationJournalMissing', '/registre', {
        params: { year },
      })
    );
  }
  if (enabledTypes.includes('tax_receipt_register') && !hasKind('tax_receipt_register')) {
    reminders.push(
      reminderItem('register-tax-receipts', 'warn', 'taxReceiptRegisterMissing', '/registre', {
        params: { year },
      })
    );
  }
  if (enabledTypes.includes('annual_donation_statement') && !hasKind('annual_donation_statement')) {
    const deadlineYear = Number(year) + 1;
    const afterDeadline = today >= `${deadlineYear}-05-03`;
    reminders.push(
      reminderItem(
        'register-annual-statement',
        afterDeadline ? 'urgent' : today >= `${deadlineYear}-01-01` ? 'warn' : 'info',
        'annualStatement',
        '/registre',
        {
          detailSuffix: afterDeadline ? 'detailLate' : 'detailPrepare',
          params: { year },
        }
      )
    );
  }

  if (contacts.incompleteDonors > 0) {
    reminders.push(
      reminderItem('incomplete-donors', 'warn', 'incompleteDonors', '/clients', {
        count: contacts.incompleteDonors,
        params: { count: contacts.incompleteDonors },
      })
    );
  }

  const yearDonations = donations.filter(
    (donation) => donation.date.startsWith(year) && donation.receiptEligible && !donation.anonymous
  );
  const yearTotal = yearDonations.reduce((sum, donation) => sum + donation.montant, 0);
  if (yearTotal >= DONATION_THRESHOLD * 0.8) {
    const reached = yearTotal >= DONATION_THRESHOLD;
    reminders.push(
      reminderItem(
        'donation-threshold',
        reached ? 'urgent' : 'warn',
        'donationThreshold',
        '/dons',
        {
          detailSuffix: reached ? 'detailReached' : 'detailApproaching',
          params: { year, amount: yearTotal },
        }
      )
    );
  }

  if (invoicing.overdueCount > 0) {
    reminders.push(
      reminderItem('overdue-invoices', 'urgent', 'overdueInvoices', '/facturation', {
        count: invoicing.overdueCount,
        params: { count: invoicing.overdueCount, amount: invoicing.overdueAmount },
      })
    );
  }
  if (invoicing.oldDraftCount > 0) {
    reminders.push(
      reminderItem('old-drafts', 'info', 'oldDrafts', '/facturation', {
        count: invoicing.oldDraftCount,
        params: { count: invoicing.oldDraftCount },
      })
    );
  }
  if (mentionsAllOff) {
    reminders.push(reminderItem('legal-mentions', 'warn', 'legalMentions', '/parametre'));
  }
  if (contacts.missingSiren > 0) {
    reminders.push(
      reminderItem('missing-siren', 'info', 'missingSiren', '/clients', {
        count: contacts.missingSiren,
        params: { count: contacts.missingSiren },
      })
    );
  }
  if ((dateEnd ?? today) >= '2026-01-01' || today >= ELECTRONIC_INVOICE_DATE) {
    reminders.push(reminderItem('e-invoicing', 'info', 'eInvoicing', '/facturation'));
  }

  for (const type of enabledTypes) {
    if (ASSOCIATION_REGISTER_TYPES.includes(type)) continue;
    if (!hasKind(type)) {
      reminders.push(
        reminderItem(`register-missing-${type}`, 'info', 'registerMissing', '/registre', {
          params: { year },
          registerType: type,
        })
      );
    }
  }

  return reminders;
}

export const DashboardInsightsService = {
  async load(options: InsightsOptions): Promise<DashboardInsights> {
    return withLog('DashboardInsightsService.load', async () => {
      const { filters, granularity } = options;
      const include = {
        invoicing: options.include?.invoicing ?? true,
        association: options.include?.association ?? true,
        contacts: options.include?.contacts ?? true,
        reminders: options.include?.reminders ?? true,
        register: options.include?.register ?? true,
      };
      const periodKeys = filters.dateStart && filters.dateEnd
        ? enumeratePeriodKeys(filters.dateStart, filters.dateEnd, granularity)
        : [];
      const labels = periodKeys.map((key) => getPeriodLabel(key, granularity));
      const emptyAccounts = filters.accountIds !== undefined && filters.accountIds.length === 0;
      const emptyCategories = filters.categoryCodes !== undefined && filters.categoryCodes.length === 0;
      if (emptyAccounts || emptyCategories) {
        return {
          invoicing: emptyInvoicing(labels),
          association: emptyAssociation(labels),
          contacts: EMPTY_DASHBOARD_INSIGHTS.contacts,
          reminders: [],
          micro: null,
        };
      }
      const accountFilterActive = filters.accountIds !== undefined;
      const categoryFilterActive = filters.categoryCodes !== undefined;
      const needClients = include.invoicing || include.association || include.contacts || include.reminders;
      const needInvoices = include.invoicing || include.contacts || include.reminders;
      const needDonations = include.association || include.contacts || include.reminders;
      const needRegister = include.reminders && include.register;
      const needTxIds = accountFilterActive || categoryFilterActive;

      const [factures, devis, donations, clients, registerDocs, registerSettings, mentionRows, linkTxIds] =
        await Promise.all([
          needInvoices ? InvoiceService.loadFactures() : Promise.resolve([]),
          needInvoices ? InvoiceService.loadDevis() : Promise.resolve([]),
          needDonations ? DonationService.list() : Promise.resolve([]),
          needClients ? ClientService.loadClientsLite() : Promise.resolve([]),
          needRegister ? RegisterService.listDocuments() : Promise.resolve([]),
          needRegister ? RegisterService.loadSettings() : Promise.resolve(null),
          needRegister ? Db.select<{ payload: string }>('SELECT payload FROM legal_mentions').catch(() => []) : Promise.resolve([]),
          needTxIds
            ? StatsService.listTransactionIds({
                accountIds: filters.accountIds,
                categoryCodes: filters.categoryCodes,
              })
            : Promise.resolve([] as string[]),
        ]);

      const txIds = needTxIds ? new Set(linkTxIds) : null;
      const invoicing = include.invoicing || include.reminders
        ? buildInvoicing(
            factures,
            devis,
            clients,
            txIds,
            accountFilterActive,
            options,
            labels,
            periodKeys
          )
        : emptyInvoicing(labels);
      const association = include.association || include.reminders
        ? buildAssociation(
            donations,
            clients,
            txIds,
            accountFilterActive || categoryFilterActive,
            options,
            labels,
            periodKeys
          )
        : emptyAssociation(labels);
      const contacts = include.contacts || include.reminders
        ? buildContacts(clients, devis, factures, donations, filters)
        : EMPTY_DASHBOARD_INSIGHTS.contacts;
      const micro = (await MicroEnterpriseService.isEnabled().catch(() => false))
        ? await MicroEnterpriseService.summary(filters.dateStart, filters.dateEnd).catch(() => null)
        : null;
      if (!include.reminders) {
        return { invoicing, association, contacts, reminders: [], micro };
      }
      const year = (filters.dateEnd ?? toIsoDate(new Date())).slice(0, 4);
      const yearKinds = registerDocs
        .filter((doc) => doc.periodStart <= `${year}-12-31` && doc.periodEnd >= `${year}-01-01`)
        .map((doc) => RegisterService.documentKind(doc));
      const missingPdf = registerDocs.filter((doc) => !doc.pdfPath).length;
      const mentionsAllOff =
        mentionRows.length > 0 &&
        mentionRows.every((row) => {
          try {
            return !(JSON.parse(row.payload) as { enabled?: boolean }).enabled;
          } catch {
            return false;
          }
        });
      const reminders = buildReminders(
        invoicing,
        association,
        contacts,
        donations,
        include.register ? yearKinds : [],
        include.register && registerSettings ? RegisterService.enabledTypes(registerSettings) : [],
        mentionsAllOff,
        filters.dateEnd
      );
      if (include.register && missingPdf > 0) {
        reminders.push(
          reminderItem('register-missing-pdf', 'info', 'missingPdf', '/registre', {
            count: missingPdf,
            params: { count: missingPdf },
          })
        );
      }

      return { invoicing, association, contacts, reminders, micro };
    });
  },
};

export const EMPTY_DASHBOARD_INSIGHTS: DashboardInsights = {
  invoicing: emptyInvoicing([]),
  association: emptyAssociation([]),
  contacts: {
    total: 0,
    clients: 0,
    donors: 0,
    both: 0,
    incomplete: 0,
    missingSiren: 0,
    incompleteDonors: 0,
    unused: 0,
  },
  reminders: [],
  micro: null,
};
