import {
  ALL_REGISTER_DOCUMENT_TYPES,
  GenerateRegisterDocumentInput,
  RegisterAttachment,
  RegisterDocument,
  RegisterDocumentType,
  RegisterItem,
  RegisterLink,
  RegisterSettings,
  RegisterSnapshot,
} from '../types/register';
import i18n from '../i18n/config';
import { AttachmentService } from './AttachmentService';
import {
  AmortissementService,
  calculateAmortissementCumule,
} from './AmortissementService';
import { Db } from './db';
import { withLog } from './logger';
import { sqlTxActive } from '../utils/sqlTx';
import { RegisterPDFService } from './RegisterPDFService';

const DEFAULT_SETTINGS: RegisterSettings = {
  prefix: 'REG',
  nextSequence: 1,
  numberFormat: '{PREFIX}-{YEAR}-{SEQ:4}',
  defaultTitle: '',
  defaultNotes: '',
  pdfFormat: 'A4',
  pdfOrientation: 'portrait',
  includeOrganization: true,
  accentColor: '#1e3a8a',
  enabledTypes: [...ALL_REGISTER_DOCUMENT_TYPES],
};

const id = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

function formatNumber(settings: RegisterSettings, date: Date): string {
  return settings.numberFormat
    .replace('{PREFIX}', settings.prefix)
    .replace('{YEAR}', String(date.getFullYear()))
    .replace(/\{SEQ:(\d+)\}/, (_, size) =>
      String(settings.nextSequence).padStart(Number(size), '0')
    );
}

function normalizeEnabledTypes(value?: RegisterDocumentType[]): RegisterDocumentType[] {
  const allowed = new Set(ALL_REGISTER_DOCUMENT_TYPES);
  const selected = (value ?? []).filter((type) => allowed.has(type));
  return selected.length > 0 ? selected : [...ALL_REGISTER_DOCUMENT_TYPES];
}

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

async function invoiceSnapshot(start: string, end: string): Promise<RegisterSnapshot> {
  const rows = await Db.select<{ numero: string; payload: string }>(
    `SELECT numero, payload FROM factures
     WHERE supprime = 0 AND json_extract(payload, '$.dateEmission') >= ?
       AND json_extract(payload, '$.dateEmission') <= ?
     ORDER BY json_extract(payload, '$.dateEmission')`,
    [`${start}T00:00:00.000Z`, `${end}T23:59:59.999Z`]
  );
  let invoiced = 0;
  let paid = 0;
  const snapshotRows = rows.map((row) => {
    const payload = parseJson<Record<string, unknown>>(row.payload, {});
    const total = Number(payload.totalTTC ?? 0);
    const payments = Array.isArray(payload.paiements)
      ? payload.paiements.reduce(
          (sum, payment) => sum + Number((payment as { montant?: number }).montant ?? 0),
          0
        )
      : 0;
    invoiced += total;
    paid += payments;
    return {
      label: row.numero,
      detail: String(payload.intituleSecondaire ?? payload.statut ?? ''),
      amount: total,
      credit: payments,
    };
  });
  return {
    periodStart: start,
    periodEnd: end,
    rows: snapshotRows,
    totals: { invoiced, paid, outstanding: invoiced - paid },
  };
}

async function cashflowSnapshot(start: string, end: string): Promise<RegisterSnapshot> {
  const rows = await Db.select<{
    category: string;
    expenses: number;
    credits: number;
  }>(
    `SELECT COALESCE(c.name, t.category_code, '') AS category,
            ABS(SUM(CASE WHEN t.debit < 0 THEN t.debit ELSE 0 END)) AS expenses,
            SUM(CASE WHEN t.credit > 0 THEN t.credit ELSE 0 END) AS credits
     FROM transactions t
     LEFT JOIN categories c ON c.code = t.category_code
     WHERE t.date BETWEEN ? AND ? AND ${sqlTxActive('t')}
     GROUP BY COALESCE(c.name, t.category_code, '')
     ORDER BY category`,
    [start, end]
  );
  const expenses = rows.reduce((sum, row) => sum + Number(row.expenses || 0), 0);
  const credits = rows.reduce((sum, row) => sum + Number(row.credits || 0), 0);
  return {
    periodStart: start,
    periodEnd: end,
    rows: rows.map((row) => ({
      label: row.category || '__uncategorized__',
      debit: Number(row.expenses || 0),
      credit: Number(row.credits || 0),
    })),
    totals: { expenses, credits, balance: credits - expenses },
  };
}

function tr(key: string, options?: Record<string, unknown>): string {
  return String(i18n.t(key, options));
}

function donorFromContact(
  anonymous: number,
  donorLabel: string | null,
  payload: string | null
): { name: string; type: string } {
  if (anonymous) return { name: donorLabel || tr('register.anonymousDonor'), type: 'anonyme' };
  const contact = parseJson<Record<string, unknown>>(payload ?? '{}', {});
  const name = String(
    contact.denominationSociale
    || `${contact.prenom ?? ''} ${contact.nom ?? ''}`.trim()
    || tr('register.unknownContact')
  );
  return { name, type: String(contact.type ?? 'particulier') };
}

async function donationSnapshot(start: string, end: string): Promise<RegisterSnapshot> {
  const rows = await Db.select<{
    donation_date: string; amount: number; nature: string; anonymous: number;
    donor_label: string | null; contact_payload: string | null; description: string | null;
    payment_method: string | null;
  }>(
    `SELECT d.donation_date, d.amount, d.nature, d.anonymous, d.donor_label,
            c.payload contact_payload, d.description, d.payment_method
     FROM donations d LEFT JOIN clients c ON c.id = d.contact_id
     WHERE d.donation_date BETWEEN ? AND ? ORDER BY d.donation_date, d.created_at`,
    [start, end]
  );
  const mapped = rows.map((row) => {
    const donor = donorFromContact(row.anonymous, row.donor_label, row.contact_payload);
    return {
      label: String(row.donation_date).slice(0, 10),
      detail: donor.name,
      extra: JSON.stringify({
        nature: row.nature,
        payment: row.payment_method ?? '',
        description: row.description ?? '',
      }),
      extraKey: 'register.donationExtra',
      amount: Number(row.amount),
      status: row.anonymous ? 'anonymous' : donor.type === 'entreprise' ? 'company' : 'individual',
    };
  });
  return {
    registerType: 'donation_journal',
    periodStart: start,
    periodEnd: end,
    rows: mapped,
    totals: {
      donations: mapped.reduce((sum, row) => sum + Number(row.amount), 0),
      donationCount: mapped.length,
      anonymous: rows.filter((row) => row.anonymous).reduce((sum, row) => sum + Number(row.amount), 0),
      natureNumeraire: rows.filter((row) => row.nature === 'numeraire').reduce((sum, row) => sum + Number(row.amount), 0),
      natureInKind: rows.filter((row) => row.nature === 'nature').reduce((sum, row) => sum + Number(row.amount), 0),
      natureSkills: rows.filter((row) => row.nature === 'mecenat_competences').reduce((sum, row) => sum + Number(row.amount), 0),
    },
  };
}

async function receiptSnapshot(start: string, end: string): Promise<RegisterSnapshot> {
  const rows = await Db.select<{ payload: string }>('SELECT payload FROM registre_recus');
  const receipts = rows
    .map((row) => parseJson<Record<string, unknown>>(row.payload, {}))
    .filter((receipt) => {
      const date = String(receipt.dateEmission ?? '').slice(0, 10);
      return date >= start && date <= end;
    })
    .sort((a, b) => String(a.numero).localeCompare(String(b.numero)));
  const active = receipts.filter((receipt) => !receipt.annule);
  return {
    registerType: 'tax_receipt_register',
    periodStart: start,
    periodEnd: end,
    rows: receipts.map((receipt) => ({
      label: String(receipt.numero),
      detail: String(receipt.donateurLabel ?? tr('register.donorFallback')),
      extra: JSON.stringify({
        date: String(receipt.dateEmission ?? '').slice(0, 10) || '—',
        nature: receipt.natureDon ? String(receipt.natureDon) : '',
      }),
      extraKey: 'register.issuedLine',
      amount: Number(receipt.montant ?? 0),
      status: receipt.annule ? 'cancelled' : 'active',
    })),
    totals: {
      receipts: active.reduce((sum, receipt) => sum + Number(receipt.montant ?? 0), 0),
      receiptCount: active.length,
      cancelledReceipts: receipts.length - active.length,
    },
  };
}

async function annualSnapshot(start: string, end: string): Promise<RegisterSnapshot> {
  const [donations, receipts] = await Promise.all([
    donationSnapshot(start, end),
    receiptSnapshot(start, end),
  ]);
  const donationRows = await Db.select<{
    amount: number; anonymous: number; nature: string; contact_id: string | null; contact_payload: string | null;
  }>(
    `SELECT d.amount, d.anonymous, d.nature, d.contact_id, c.payload contact_payload
     FROM donations d LEFT JOIN clients c ON c.id = d.contact_id
     WHERE d.donation_date BETWEEN ? AND ?`,
    [start, end]
  );
  const particulierIds = new Set<string>();
  const entrepriseIds = new Set<string>();
  let particuliersAmount = 0;
  let entreprisesAmount = 0;
  for (const row of donationRows.filter((item) => !item.anonymous)) {
    const type = String(parseJson<Record<string, unknown>>(row.contact_payload ?? '{}', {}).type ?? 'particulier');
    const id = row.contact_id || 'unknown';
    if (type === 'entreprise') {
      entrepriseIds.add(id);
      entreprisesAmount += Number(row.amount);
    } else {
      particulierIds.add(id);
      particuliersAmount += Number(row.amount);
    }
  }
  const particuliers = particulierIds.size;
  const entreprises = entrepriseIds.size;
  return {
    registerType: 'annual_donation_statement',
    periodStart: start,
    periodEnd: end,
    rows: [
      {
        label: tr('register.snapshot.particuliersCgi'),
        labelKey: 'register.snapshot.particuliersCgi',
        detail: tr('register.snapshot.donorCount', { count: particuliers }),
        detailKey: 'register.snapshot.donorCount',
        count: particuliers,
        amount: particuliersAmount,
      },
      {
        label: tr('register.snapshot.entreprisesCgi'),
        labelKey: 'register.snapshot.entreprisesCgi',
        detail: tr('register.snapshot.donorCount', { count: entreprises }),
        detailKey: 'register.snapshot.donorCount',
        count: entreprises,
        amount: entreprisesAmount,
      },
      {
        label: tr('register.snapshot.anonymousDonations'),
        labelKey: 'register.snapshot.anonymousDonations',
        detail: tr('register.snapshot.noTaxReceipt'),
        detailKey: 'register.snapshot.noTaxReceipt',
        amount: donations.totals.anonymous ?? 0,
      },
      {
        label: tr('register.snapshot.cash'),
        labelKey: 'register.snapshot.cash',
        extra: tr('register.snapshot.cashExtra'),
        extraKey: 'register.snapshot.cashExtra',
        amount: donations.totals.natureNumeraire ?? 0,
      },
      {
        label: tr('register.snapshot.inKind'),
        labelKey: 'register.snapshot.inKind',
        extra: tr('register.snapshot.inKindExtra'),
        extraKey: 'register.snapshot.inKindExtra',
        amount: donations.totals.natureInKind ?? 0,
      },
      {
        label: tr('register.snapshot.skills'),
        labelKey: 'register.snapshot.skills',
        extra: tr('register.snapshot.skillsExtra'),
        extraKey: 'register.snapshot.skillsExtra',
        amount: donations.totals.natureSkills ?? 0,
      },
      {
        label: tr('register.snapshot.activeReceipts'),
        labelKey: 'register.snapshot.activeReceipts',
        detail: tr('register.snapshot.receiptCount', { count: receipts.totals.receiptCount ?? 0 }),
        detailKey: 'register.snapshot.receiptCount',
        count: receipts.totals.receiptCount ?? 0,
        amount: receipts.totals.receipts ?? 0,
      },
      {
        label: tr('register.snapshot.cancelledReceipts'),
        labelKey: 'register.snapshot.cancelledReceipts',
        detail: tr('register.snapshot.receiptCount', { count: receipts.totals.cancelledReceipts ?? 0 }),
        detailKey: 'register.snapshot.receiptCount',
        count: receipts.totals.cancelledReceipts ?? 0,
        amount: 0,
      },
    ],
    totals: {
      donations: donations.totals.donations,
      donationCount: donations.totals.donationCount,
      anonymous: donations.totals.anonymous,
      receipts: receipts.totals.receipts,
      receiptCount: receipts.totals.receiptCount,
      cancelledReceipts: receipts.totals.cancelledReceipts,
      particuliers,
      entreprises,
      particuliersAmount,
      entreprisesAmount,
      natureNumeraire: donations.totals.natureNumeraire,
      natureInKind: donations.totals.natureInKind,
      natureSkills: donations.totals.natureSkills,
    },
  };
}

async function amortissementSnapshot(start: string, end: string): Promise<RegisterSnapshot> {
  const settings = await AmortissementService.getSettings();
  const articles = await AmortissementService.list();
  const endDate = new Date(`${end}T23:59:59`);
  const startMinus = new Date(new Date(`${start}T00:00:00`).getTime() - 1);

  const mapped = articles
    .filter((article) => {
      const mes = article.dateMiseEnService || article.dateAcquisition;
      if (mes > end) return false;
      if (article.statut === 'cede' || article.statut === 'mis_au_rebut') {
        if (article.dateCession && article.dateCession < start) return false;
      }
      return true;
    })
    .map((article) => {
      const amortiFin = calculateAmortissementCumule(article, endDate, settings);
      const amortiDebut = calculateAmortissementCumule(article, startMinus, settings);
      const periodCharge = Math.max(0, Math.round((amortiFin - amortiDebut) * 100) / 100);
      const vnc = Math.max(0, Math.round((article.valeurAcquisitionHT - amortiFin) * 100) / 100);
      const typeLabel = i18n.t(`amortissement.types.${article.typeImmobilisation}`, {
        defaultValue: article.typeImmobilisation,
      });
      const methodLabel = i18n.t(`amortissement.methods.${article.methode}`, {
        defaultValue: article.methode,
      });
      return {
        label: article.designation,
        detail: [
          typeLabel,
          article.reference,
          article.dateMiseEnService
            ? `${i18n.t('amortissement.serviceDate', { defaultValue: 'MES' })} ${article.dateMiseEnService}`
            : '',
        ]
          .filter(Boolean)
          .join(' · '),
        extra: `${methodLabel} · ${article.dureeAnnees} ${i18n.t('amortissement.years', { defaultValue: 'ans' })}`,
        status: article.statut,
        credit: article.valeurAcquisitionHT,
        debit: Math.round(amortiFin * 100) / 100,
        periodCharge,
        amount: vnc,
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label, i18n.language));

  return {
    registerType: 'amortissement_register',
    periodStart: start,
    periodEnd: end,
    rows: mapped,
    totals: {
      immoCount: mapped.length,
      immoBrut: mapped.reduce((sum, row) => sum + Number(row.credit ?? 0), 0),
      immoAmorti: mapped.reduce((sum, row) => sum + Number(row.debit ?? 0), 0),
      immoDotation: mapped.reduce((sum, row) => sum + Number(row.periodCharge ?? 0), 0),
      immoVnc: mapped.reduce((sum, row) => sum + Number(row.amount ?? 0), 0),
    },
  };
}

async function buildSnapshot(
  type: RegisterDocumentType,
  start: string,
  end: string
): Promise<RegisterSnapshot> {
  if (type === 'invoice_summary') return invoiceSnapshot(start, end);
  if (type === 'cashflow_summary') return cashflowSnapshot(start, end);
  if (type === 'donation_journal') return donationSnapshot(start, end);
  if (type === 'tax_receipt_register') return receiptSnapshot(start, end);
  if (type === 'annual_donation_statement') return annualSnapshot(start, end);
  if (type === 'amortissement_register') return amortissementSnapshot(start, end);
  return { periodStart: start, periodEnd: end, rows: [], totals: {}, registerType: type };
}

async function children<T>(
  table: string,
  documentId: string,
  mapper: (row: Record<string, unknown>) => T
): Promise<T[]> {
  const rows = await Db.select<Record<string, unknown>>(
    `SELECT * FROM ${table} WHERE document_id = ? ORDER BY created_at`,
    [documentId]
  );
  return rows.map(mapper);
}

async function hydrate(row: Record<string, unknown>): Promise<RegisterDocument> {
  const documentId = String(row.id);
  const [items, links, attachments] = await Promise.all([
    children<RegisterItem>('register_items', documentId, (item) => ({
      id: String(item.id),
      documentId,
      label: String(item.label),
      description: String(item.description ?? ''),
      amount: item.amount == null ? null : Number(item.amount),
      createdAt: String(item.created_at),
    })),
    children<RegisterLink>('register_links', documentId, (link) => ({
      id: String(link.id),
      documentId,
      label: String(link.label),
      value: String(link.value ?? ''),
      url: String(link.url ?? ''),
      createdAt: String(link.created_at),
    })),
    children<RegisterAttachment>('register_attachments', documentId, (attachment) => ({
      id: String(attachment.id),
      documentId,
      name: String(attachment.name),
      path: String(attachment.path),
      mimeType: String(attachment.mime_type),
      createdAt: String(attachment.created_at),
    })),
  ]);
  const snapshot = parseJson<RegisterSnapshot>(String(row.snapshot), {
    periodStart: String(row.period_start),
    periodEnd: String(row.period_end),
    rows: [],
    totals: {},
  });
  return {
    id: documentId,
    number: String(row.number),
    type: snapshot.registerType ?? String(row.type) as RegisterDocumentType,
    title: String(row.title),
    status: String(row.status) as RegisterDocument['status'],
    periodStart: String(row.period_start),
    periodEnd: String(row.period_end),
    notes: String(row.notes ?? ''),
    snapshot,
    pdfPath: row.pdf_path ? String(row.pdf_path) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    items,
    links,
    attachments,
  };
}

export const RegisterService = {
  defaults: DEFAULT_SETTINGS,

  previewNumber(settings: RegisterSettings, date = new Date()): string {
    return formatNumber(settings, date);
  },

  seqSize(format: string): number {
    const match = format.match(/\{SEQ:(\d+)\}/);
    return match ? Number(match[1]) : 4;
  },

  withSeqSize(format: string, size: number): string {
    if (/\{SEQ:\d+\}/.test(format)) return format.replace(/\{SEQ:\d+\}/, `{SEQ:${size}}`);
    return `${format}{SEQ:${size}}`;
  },

  enabledTypes(settings: RegisterSettings): RegisterDocumentType[] {
    return normalizeEnabledTypes(settings.enabledTypes);
  },

  async loadSettings(): Promise<RegisterSettings> {
    return withLog('RegisterService.loadSettings', async () => {
      const rows = await Db.select<{ payload: string }>(
        'SELECT payload FROM register_settings WHERE id = 1'
      );
      const merged = { ...DEFAULT_SETTINGS, ...parseJson(rows[0]?.payload ?? '{}', {}) };
      return { ...merged, enabledTypes: normalizeEnabledTypes(merged.enabledTypes) };
    });
  },

  async saveSettings(settings: RegisterSettings): Promise<void> {
    return withLog('RegisterService.saveSettings', async () => {
      await Db.execute(
        `INSERT INTO register_settings (id, payload) VALUES (1, ?)
         ON CONFLICT(id) DO UPDATE SET payload = excluded.payload`,
        [JSON.stringify({ ...settings, enabledTypes: this.enabledTypes(settings) })]
      );
    });
  },

  async toggleEnabledType(type: RegisterDocumentType): Promise<RegisterDocumentType[]> {
    return withLog('RegisterService.toggleEnabledType', async () => {
      const settings = await this.loadSettings();
      const current = this.enabledTypes(settings);
      const next = current.includes(type)
        ? current.filter((item) => item !== type)
        : [...current, type];
      if (next.length === 0) {
        throw new Error('EMPTY_TYPES');
      }
      await this.saveSettings({ ...settings, enabledTypes: next });
      return next;
    }, { data: { type } });
  },

  async listDocuments(): Promise<RegisterDocument[]> {
    return withLog('RegisterService.listDocuments', async () => {
      const rows = await Db.select<Record<string, unknown>>(
        'SELECT * FROM register_documents ORDER BY created_at DESC'
      );
      return Promise.all(rows.map(hydrate));
    });
  },

  async generate(input: GenerateRegisterDocumentInput): Promise<RegisterDocument> {
    return withLog('RegisterService.generate', async () => {
      const now = new Date();
      const settings = await this.loadSettings();
      const documentId = id('regdoc');
      const number = formatNumber(settings, now);
      const snapshot = await buildSnapshot(input.type, input.periodStart, input.periodEnd);
      const storageType = ['reference', 'invoice_summary', 'cashflow_summary'].includes(input.type)
        ? input.type
        : 'reference';
      // amortissement_register & types association : stockés en `reference`, type réel dans snapshot.registerType
      await Db.inTransaction('RegisterService.generate', async () => {
        await Db.execute(
          `INSERT INTO register_documents
           (id, number, type, title, status, period_start, period_end, notes, snapshot, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'generated', ?, ?, ?, ?, ?, ?)`,
          [
            documentId,
            number,
            storageType,
            input.title,
            input.periodStart,
            input.periodEnd,
            input.notes ?? settings.defaultNotes,
            JSON.stringify(snapshot),
            now.toISOString(),
            now.toISOString(),
          ]
        );
        await this.saveSettings({ ...settings, nextSequence: settings.nextSequence + 1 });
      });
      const rows = await Db.select<Record<string, unknown>>(
        'SELECT * FROM register_documents WHERE id = ?',
        [documentId]
      );
      return hydrate(rows[0]);
    });
  },

  async setPdfPath(documentId: string, pdfPath: string): Promise<void> {
    await Db.execute(
      "UPDATE register_documents SET pdf_path = ?, updated_at = datetime('now') WHERE id = ?",
      [pdfPath, documentId]
    );
  },

  documentKind(document: RegisterDocument): RegisterDocumentType {
    return document.snapshot.registerType ?? document.type;
  },

  async deleteDocument(documentId: string): Promise<void> {
    return withLog('RegisterService.deleteDocument', async () => {
      await Db.execute('DELETE FROM register_attachments WHERE document_id = ?', [documentId]);
      await Db.execute('DELETE FROM register_items WHERE document_id = ?', [documentId]);
      await Db.execute('DELETE FROM register_links WHERE document_id = ?', [documentId]);
      await Db.execute('DELETE FROM register_documents WHERE id = ?', [documentId]);
    });
  },

  async addItem(
    documentId: string,
    item: Pick<RegisterItem, 'label' | 'description' | 'amount'>
  ): Promise<void> {
    await Db.execute(
      `INSERT INTO register_items (id, document_id, label, description, amount, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id('item'), documentId, item.label, item.description, item.amount, new Date().toISOString()]
    );
  },

  async addLink(
    documentId: string,
    link: Pick<RegisterLink, 'label' | 'value' | 'url'>
  ): Promise<void> {
    await Db.execute(
      `INSERT INTO register_links (id, document_id, label, value, url, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id('link'), documentId, link.label, link.value, link.url, new Date().toISOString()]
    );
  },

  async addAttachment(documentId: string | null, file: File): Promise<void> {
    const saved = await AttachmentService.saveUserFile(file);
    try {
      await Db.execute(
        `INSERT INTO register_attachments
         (id, document_id, name, path, mime_type, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
        [id('attachment'), documentId, saved.name, saved.rel, saved.mimeType, new Date().toISOString()]
      );
    } catch (err) {
      await AttachmentService.deleteRel(saved.rel).catch(() => undefined);
      throw err;
    }
  },

  async listRegisterAttachments(): Promise<RegisterAttachment[]> {
    const rows = await Db.select<Record<string, unknown>>(
      'SELECT * FROM register_attachments WHERE document_id IS NULL ORDER BY created_at DESC'
    );
    return rows.map((attachment) => ({
      id: String(attachment.id),
      documentId: null,
      name: String(attachment.name),
      path: String(attachment.path),
      mimeType: String(attachment.mime_type),
      createdAt: String(attachment.created_at),
    }));
  },

  async openAttachment(path: string): Promise<void> {
    await AttachmentService.openRel(path);
  },

  async openDocumentPdf(document: RegisterDocument): Promise<string> {
    return withLog('RegisterService.openDocumentPdf', async () => {
      let path = document.pdfPath;
      if (!path) {
        const settings = await this.loadSettings();
        path = await RegisterPDFService.generate(document, settings);
        await this.setPdfPath(document.id, path);
      }
      await AttachmentService.openRel(path);
      return path;
    });
  },
};
