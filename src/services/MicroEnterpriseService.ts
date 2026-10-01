import { addMonths, endOfMonth, format, isAfter, parseISO } from 'date-fns';
import { Facture, Paiement } from '../types/invoice';
import {
  MicroDeadline,
  MicroEnterpriseConfig,
  MicroEnterpriseSummary,
  MicroReceipt,
  MicroReceiptInput,
} from '../types/microEnterprise';
import { clientDisplayName, newEntityId } from '../utils/invoiceFormat';
import { roundMoney } from '../utils/amounts';
import { ClientService } from './ClientService';
import { Db } from './db';
import { InvoiceService } from './InvoiceService';
import { loadSingletonJson, saveSingletonJson } from './jsonStore';
import { withLog } from './logger';
import { ProjectService } from './ProjectService';

interface ReceiptRow {
  id: string;
  sequence: number;
  received_date: string;
  client_name: string;
  description: string;
  amount: number;
  payment_method: MicroReceipt['paymentMethod'];
  invoice_id: string | null;
  invoice_number: string | null;
  transaction_id: string | null;
  source_payment_id: string | null;
  reference: string | null;
  source: MicroReceipt['source'];
  reverses_id: string | null;
  created_at: string;
}

const CATEGORY_PRESET = [
  ['RECETTES_PRO', 'Recettes professionnelles', '#16a34a'],
  ['COTISATIONS', 'Cotisations sociales', '#dc2626'],
  ['CFP', 'Contribution formation professionnelle', '#ea580c'],
  ['CFE', 'Cotisation foncière des entreprises', '#7c3aed'],
  ['OUTILS', 'Outils et abonnements', '#2563eb'],
] as const;

function currentIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function defaultMicroEnterpriseConfig(now = new Date()): MicroEnterpriseConfig {
  return {
    enabled: true,
    businessStartDate: now.toISOString().slice(0, 10),
    fiscalYear: now.getFullYear(),
    regimeFiscal: 'micro_bnc',
    declarationFrequency: 'quarterly',
    versementLiberatoire: false,
    socialRate: 25.6,
    trainingRate: 0.2,
    incomeTaxRate: 2.2,
    microThreshold: 83600,
    vatBaseThreshold: 37500,
    vatToleranceThreshold: 41250,
    estimatedMonthlyToolsCost: 40,
  };
}

function reviveConfig(raw: Partial<MicroEnterpriseConfig> | null): MicroEnterpriseConfig {
  const defaults = defaultMicroEnterpriseConfig();
  if (!raw) return defaults;
  return {
    ...defaults,
    ...raw,
    enabled: raw.enabled ?? true,
    regimeFiscal: raw.regimeFiscal === 'micro_bic' ? 'micro_bic' : 'micro_bnc',
    declarationFrequency: raw.declarationFrequency === 'monthly' ? 'monthly' : 'quarterly',
  };
}

function mapReceipt(row: ReceiptRow): MicroReceipt {
  return {
    id: row.id,
    sequence: row.sequence,
    receivedDate: row.received_date,
    clientName: row.client_name,
    description: row.description,
    amount: row.amount,
    paymentMethod: row.payment_method,
    invoiceId: row.invoice_id ?? undefined,
    invoiceNumber: row.invoice_number ?? undefined,
    transactionId: row.transaction_id ?? undefined,
    sourcePaymentId: row.source_payment_id ?? undefined,
    reference: row.reference ?? undefined,
    source: row.source,
    reversesId: row.reverses_id ?? undefined,
    createdAt: row.created_at,
  };
}

async function nextSequence(): Promise<number> {
  const rows = await Db.select<{ sequence: number | null }>(
    'SELECT MAX(sequence) AS sequence FROM micro_receipts'
  );
  return (rows[0]?.sequence ?? 0) + 1;
}

async function appendReceipt(params: {
  id?: string;
  receivedDate: string;
  clientName: string;
  description: string;
  amount: number;
  paymentMethod: MicroReceipt['paymentMethod'];
  invoiceId?: string;
  invoiceNumber?: string;
  transactionId?: string;
  sourcePaymentId?: string;
  reference?: string;
  source: MicroReceipt['source'];
  reversesId?: string;
}): Promise<MicroReceipt> {
  if (!params.receivedDate || !/^\d{4}-\d{2}-\d{2}$/.test(params.receivedDate)) {
    throw new Error("La date d'encaissement est invalide.");
  }
  if (!params.clientName.trim()) throw new Error('Le client est obligatoire.');
  if (!params.description.trim()) throw new Error('La nature de la recette est obligatoire.');
  if (!Number.isFinite(params.amount) || params.amount === 0) {
    throw new Error('Le montant doit être différent de zéro.');
  }
  let created: MicroReceipt | null = null;
  await Db.inTransaction('MicroEnterpriseService.appendReceipt', async () => {
    if (params.sourcePaymentId) {
      const duplicate = await Db.select<ReceiptRow>(
        'SELECT * FROM micro_receipts WHERE source_payment_id = ?',
        [params.sourcePaymentId]
      );
      if (duplicate[0]) {
        created = mapReceipt(duplicate[0]);
        return;
      }
    }
    const sequence = await nextSequence();
    const id = params.id ?? newEntityId('micro-rec');
    const createdAt = new Date().toISOString();
    await Db.execute(
      `INSERT INTO micro_receipts
       (id, sequence, received_date, client_name, description, amount, payment_method,
        invoice_id, invoice_number, transaction_id, source_payment_id, reference,
        source, reverses_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        sequence,
        params.receivedDate,
        params.clientName.trim(),
        params.description.trim(),
        roundMoney(params.amount),
        params.paymentMethod,
        params.invoiceId ?? null,
        params.invoiceNumber ?? null,
        params.transactionId ?? null,
        params.sourcePaymentId ?? null,
        params.reference?.trim() || null,
        params.source,
        params.reversesId ?? null,
        createdAt,
      ]
    );
    created = {
      id,
      sequence,
      receivedDate: params.receivedDate,
      clientName: params.clientName.trim(),
      description: params.description.trim(),
      amount: roundMoney(params.amount),
      paymentMethod: params.paymentMethod,
      invoiceId: params.invoiceId,
      invoiceNumber: params.invoiceNumber,
      transactionId: params.transactionId,
      sourcePaymentId: params.sourcePaymentId,
      reference: params.reference?.trim() || undefined,
      source: params.source,
      reversesId: params.reversesId,
      createdAt,
    };
  });
  if (!created) throw new Error("Impossible d'ajouter la recette.");
  return created;
}

async function paymentClientAndDescription(facture: Facture): Promise<{
  clientName: string;
  description: string;
}> {
  const client = await ClientService.getClientById(facture.clientId);
  const clientName = client ? clientDisplayName(client) : facture.clientId || 'Client non renseigné';
  const description =
    facture.postes
      .map((poste) => poste.designation.trim())
      .filter(Boolean)
      .join(', ') || `Encaissement facture ${facture.numero}`;
  return { clientName, description };
}

function contributionRate(config: MicroEnterpriseConfig): number {
  return config.socialRate + config.trainingRate + (config.versementLiberatoire ? config.incomeTaxRate : 0);
}

function progress(value: number, threshold: number): number {
  return threshold > 0 ? (value / threshold) * 100 : 0;
}

function warningLevel(value: number): 0 | 75 | 90 | 100 {
  if (value >= 100) return 100;
  if (value >= 90) return 90;
  if (value >= 75) return 75;
  return 0;
}

export const MicroEnterpriseService = {
  async loadConfig(): Promise<MicroEnterpriseConfig | null> {
    const raw = await loadSingletonJson<Partial<MicroEnterpriseConfig>>('micro_enterprise_config');
    return raw ? reviveConfig(raw) : null;
  },

  async loadConfigSafe(): Promise<MicroEnterpriseConfig> {
    return reviveConfig(await loadSingletonJson<Partial<MicroEnterpriseConfig>>('micro_enterprise_config'));
  },

  async saveConfig(config: MicroEnterpriseConfig): Promise<void> {
    await saveSingletonJson('micro_enterprise_config', reviveConfig(config));
  },

  async initializeProfile(): Promise<MicroEnterpriseConfig> {
    return withLog('MicroEnterpriseService.initializeProfile', async () => {
      const existing = await this.loadConfig();
      const config = existing ? { ...existing, enabled: true } : defaultMicroEnterpriseConfig();
      await this.saveConfig(config);
      for (const [code, name, color] of CATEGORY_PRESET) {
        await Db.execute(
          'INSERT OR IGNORE INTO categories (code, name, color) VALUES (?, ?, ?)',
          [code, name, color]
        );
      }
      return config;
    });
  },

  async isEnabled(): Promise<boolean> {
    return Boolean((await this.loadConfig())?.enabled);
  },

  async listReceipts(start?: string, end?: string): Promise<MicroReceipt[]> {
    const where: string[] = [];
    const params: unknown[] = [];
    if (start) {
      where.push('received_date >= ?');
      params.push(start);
    }
    if (end) {
      where.push('received_date <= ?');
      params.push(end);
    }
    const rows = await Db.select<ReceiptRow>(
      `SELECT * FROM micro_receipts ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY received_date ASC, sequence ASC`,
      params
    );
    return rows.map(mapReceipt);
  },

  async addManualReceipt(input: MicroReceiptInput): Promise<MicroReceipt> {
    return withLog('MicroEnterpriseService.addManualReceipt', () =>
      appendReceipt({ ...input, source: 'manual' })
    );
  },

  async recordInvoicePayment(facture: Facture, paiement: Paiement): Promise<MicroReceipt | null> {
    if (!(await this.isEnabled())) return null;
    const { clientName, description } = await paymentClientAndDescription(facture);
    return appendReceipt({
      receivedDate: paiement.datePaiement.toISOString().slice(0, 10),
      clientName,
      description,
      amount: paiement.montant,
      paymentMethod: paiement.modePaiement,
      invoiceId: facture.id,
      invoiceNumber: facture.numero,
      transactionId: paiement.transactionId,
      sourcePaymentId: paiement.id,
      reference: paiement.reference,
      source: 'invoice_payment',
    });
  },

  async reverseInvoicePayment(paiement: Paiement): Promise<MicroReceipt | null> {
    if (!(await this.isEnabled())) return null;
    const originalRows = await Db.select<ReceiptRow>(
      'SELECT * FROM micro_receipts WHERE source_payment_id = ?',
      [paiement.id]
    );
    const original = originalRows[0] ? mapReceipt(originalRows[0]) : null;
    if (!original) return null;
    return appendReceipt({
      receivedDate: currentIsoDate(),
      clientName: original.clientName,
      description: `Contrepassation de la recette n° ${original.sequence} — ${original.description}`,
      amount: -Math.abs(original.amount),
      paymentMethod: original.paymentMethod,
      invoiceId: original.invoiceId,
      invoiceNumber: original.invoiceNumber,
      transactionId: original.transactionId,
      sourcePaymentId: `reversal:${paiement.id}`,
      reference: original.reference,
      source: 'reversal',
      reversesId: original.id,
    });
  },

  async reverseReceipt(receiptId: string, reason = 'Correction manuelle'): Promise<MicroReceipt> {
    const rows = await Db.select<ReceiptRow>('SELECT * FROM micro_receipts WHERE id = ?', [receiptId]);
    const original = rows[0] ? mapReceipt(rows[0]) : null;
    if (!original) throw new Error('Recette introuvable.');
    if (original.source === 'reversal') throw new Error('Une contrepassation ne peut pas être contrepassée.');
    return appendReceipt({
      receivedDate: currentIsoDate(),
      clientName: original.clientName,
      description: `${reason.trim() || 'Correction'} — recette n° ${original.sequence} — ${original.description}`,
      amount: -Math.abs(original.amount),
      paymentMethod: original.paymentMethod,
      invoiceId: original.invoiceId,
      invoiceNumber: original.invoiceNumber,
      transactionId: original.transactionId,
      sourcePaymentId: `manual-reversal:${original.id}`,
      reference: original.reference,
      source: 'reversal',
      reversesId: original.id,
    });
  },

  async backfillInvoicePayments(): Promise<number> {
    return withLog('MicroEnterpriseService.backfillInvoicePayments', async () => {
      if (!(await this.isEnabled())) return 0;
      const factures = await InvoiceService.loadFactures();
      const knownRows = await Db.select<{ source_payment_id: string }>(
        'SELECT source_payment_id FROM micro_receipts WHERE source_payment_id IS NOT NULL'
      );
      const known = new Set(knownRows.map((row) => row.source_payment_id));
      let count = 0;
      for (const facture of factures) {
        if (facture.supprime || facture.statut === 'annulee') continue;
        for (const paiement of facture.paiements) {
          if (known.has(paiement.id)) continue;
          await this.recordInvoicePayment(facture, paiement);
          known.add(paiement.id);
          count += 1;
        }
      }
      return count;
    });
  },

  async summary(periodStart?: string, periodEnd?: string): Promise<MicroEnterpriseSummary> {
    const config = await this.loadConfigSafe();
    const end = periodEnd || currentIsoDate();
    const start = periodStart || `${end.slice(0, 4)}-01-01`;
    const year = end.slice(0, 4);
    const [periodReceipts, yearReceipts] = await Promise.all([
      this.listReceipts(start, end),
      this.listReceipts(`${year}-01-01`, `${year}-12-31`),
    ]);
    const periodCollected = roundMoney(periodReceipts.reduce((sum, item) => sum + item.amount, 0));
    const yearCollected = roundMoney(yearReceipts.reduce((sum, item) => sum + item.amount, 0));
    const socialContributions = roundMoney(periodCollected * (config.socialRate / 100));
    const trainingContribution = roundMoney(periodCollected * (config.trainingRate / 100));
    const incomeTaxProvision = config.versementLiberatoire
      ? roundMoney(periodCollected * (config.incomeTaxRate / 100))
      : 0;
    const totalProvision = roundMoney(periodCollected * (contributionRate(config) / 100));
    const months = Math.max(
      1,
      (Number(end.slice(0, 4)) - Number(start.slice(0, 4))) * 12 +
        Number(end.slice(5, 7)) -
        Number(start.slice(5, 7)) +
        1
    );
    const toolsCost = roundMoney(config.estimatedMonthlyToolsCost * months);
    const microThresholdProgress = progress(yearCollected, config.microThreshold);
    const vatBaseProgress = progress(yearCollected, config.vatBaseThreshold);
    const vatToleranceProgress = progress(yearCollected, config.vatToleranceThreshold);
    return {
      periodStart: start,
      periodEnd: end,
      periodCollected,
      yearCollected,
      socialContributions,
      trainingContribution,
      incomeTaxProvision,
      totalProvision,
      toolsCost,
      estimatedRemainder: roundMoney(periodCollected - totalProvision - toolsCost),
      microThresholdProgress,
      vatBaseProgress,
      vatToleranceProgress,
      warningLevel: warningLevel(Math.max(microThresholdProgress, vatBaseProgress)),
    };
  },

  async upcomingDeadlines(from = new Date()): Promise<MicroDeadline[]> {
    const config = await this.loadConfigSafe();
    const deadlines: MicroDeadline[] = [];
    const fromIso = format(from, 'yyyy-MM-dd');
    if (config.declarationFrequency === 'monthly') {
      for (let offset = 0; offset < 12; offset += 1) {
        const period = addMonths(from, offset);
        const due = endOfMonth(addMonths(period, 1));
        deadlines.push({
          id: `urssaf-${format(period, 'yyyy-MM')}`,
          date: format(due, 'yyyy-MM-dd'),
          label: `Déclaration URSSAF — ${format(period, 'MM/yyyy')}`,
          detail: "Déclarer le chiffre d'affaires encaissé, même s'il est nul.",
          kind: 'urssaf',
        });
      }
    } else {
      const year = from.getFullYear();
      for (const [date, label] of [
        [`${year}-04-30`, '1er trimestre'],
        [`${year}-07-31`, '2e trimestre'],
        [`${year}-10-31`, '3e trimestre'],
        [`${year + 1}-01-31`, '4e trimestre'],
        [`${year + 1}-04-30`, '1er trimestre'],
      ]) {
        if (date >= fromIso) {
          deadlines.push({
            id: `urssaf-${date}`,
            date,
            label: `Déclaration URSSAF — ${label}`,
            detail: "Déclarer le chiffre d'affaires encaissé, même s'il est nul.",
            kind: 'urssaf',
          });
        }
      }
    }
    const taxYear = from.getFullYear() + 1;
    deadlines.push(
      {
        id: `tax-${taxYear}`,
        date: `${taxYear}-05-31`,
        label: 'Déclaration 2042-C-PRO',
        detail: "Date indicative : vérifier l'échéance affichée sur impots.gouv.fr.",
        kind: 'tax',
      },
      {
        id: `cfe-${from.getFullYear()}`,
        date: `${from.getFullYear()}-12-31`,
        label: 'Déclaration initiale CFE 1447-C-SD',
        detail: "À déposer avant la fin de l'année de création.",
        kind: 'cfe',
      },
      {
        id: 'einvoicing-2027',
        date: '2027-09-01',
        label: 'Facturation électronique B2B',
        detail: "Prévoir une plateforme agréée ; le PDF seul n'est pas une facture électronique réglementaire.",
        kind: 'einvoicing',
      }
    );
    return deadlines
      .filter((item) => !isAfter(parseISO(fromIso), parseISO(item.date)))
      .sort((a, b) => a.date.localeCompare(b.date));
  },

  async createForecastProvision(): Promise<number> {
    return withLog('MicroEnterpriseService.createForecastProvision', async () => {
      const config = await this.loadConfigSafe();
      const name = `Micro-entreprise ${config.fiscalYear}`;
      const existing = (await ProjectService.list()).find((project) => project.name === name);
      if (existing) return existing.id;
      const startDate = `${config.fiscalYear}-01-01`;
      const endDate = `${config.fiscalYear}-12-31`;
      const summary = await this.summary(startDate, endDate);
      const elapsedMonths = Math.max(1, new Date().getMonth() + 1);
      const estimatedMonthlyCa = summary.yearCollected / elapsedMonths;
      const amount = roundMoney(estimatedMonthlyCa * (contributionRate(config) / 100));
      const projectId = await ProjectService.create({
        name,
        startDate,
        endDate,
        initialBalance: 0,
      });
      await ProjectService.addSubscription({
        projectId,
        name: 'Provision cotisations micro-entreprise',
        type: 'debit',
        amount,
        periodicity: 'monthly',
        startDate,
        endDate,
        categoryCode: 'COTISATIONS',
        color: '#dc2626',
        parentId: null,
        isGroup: false,
        sortOrder: 0,
      });
      return projectId;
    });
  },
};
