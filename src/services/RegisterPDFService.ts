import pdfMake from 'pdfmake/build/pdfmake';
import type { Alignment, Content, TableCell, TDocumentDefinitions } from 'pdfmake/interfaces';
import i18n from '../i18n/config';
import { AssociationConfig } from '../types/association';
import { RegisterDocument, RegisterSettings, RegisterSnapshotRow } from '../types/register';
import { formatMoney } from '../utils/invoiceFormat';
import { montantEnLettres } from '../utils/montantEnLettres';
import { withExampleAssociation } from '../constants/associationDemo';
import {
  formatRegisterDate,
  registerRowDetail,
  registerRowExtra,
  registerRowLabel,
  registerStatusLabel,
  registerTypeTitle,
} from '../utils/registerI18n';
import { AssociationConfigService } from './AssociationConfigService';
import { AttachmentService } from './AttachmentService';
import { EmetteurService } from './EmetteurService';
import { withLog } from './logger';

let fontsLoaded = false;

async function loadFonts() {
  if (fontsLoaded) return;
  const module = await import('pdfmake/build/vfs_fonts');
  const source = module.default as unknown as {
    vfs?: unknown;
    pdfMake?: { vfs?: unknown };
  };
  const vfs = source?.vfs ?? source?.pdfMake?.vfs;
  if (vfs) {
    Object.defineProperty(pdfMake, 'vfs', { value: vfs, writable: true, configurable: true });
  }
  fontsLoaded = true;
}

function tr(key: string, options?: Record<string, unknown>): string {
  return String(i18n.t(key, options));
}

function typeLabel(type: RegisterDocument['type']): string {
  return registerTypeTitle(type);
}

function resolvedType(document: RegisterDocument): RegisterDocument['type'] {
  return document.snapshot.registerType ?? document.type;
}

function totalsContent(document: RegisterDocument): Content[] {
  const totals = document.snapshot.totals;
  const labels: Array<[keyof typeof totals, string]> = [
    ['invoiced', tr('register.totals.invoiced')],
    ['paid', tr('register.totals.paid')],
    ['outstanding', tr('register.totals.outstanding')],
    ['expenses', tr('register.totals.expenses')],
    ['credits', tr('register.totals.credits')],
    ['balance', tr('register.totals.balance')],
    ['donations', tr('register.totals.donations')],
    ['donationCount', tr('register.totals.donationCount')],
    ['anonymous', tr('register.totals.anonymous')],
    ['receipts', tr('register.totals.receipts')],
    ['receiptCount', tr('register.totals.receiptCount')],
    ['cancelledReceipts', tr('register.totals.cancelledReceipts')],
    ['particuliers', tr('register.totals.particuliers')],
    ['entreprises', tr('register.totals.entreprises')],
    ['natureNumeraire', tr('register.totals.natureNumeraire')],
    ['natureInKind', tr('register.totals.natureInKind')],
    ['natureSkills', tr('register.totals.natureSkills')],
    ['immoCount', tr('register.totals.immoCount')],
    ['immoBrut', tr('register.totals.immoBrut')],
    ['immoAmorti', tr('register.totals.immoAmorti')],
    ['immoDotation', tr('register.totals.immoDotation')],
    ['immoVnc', tr('register.totals.immoVnc')],
  ];
  const countKeys = new Set([
    'donationCount',
    'receiptCount',
    'cancelledReceipts',
    'particuliers',
    'entreprises',
    'immoCount',
  ]);
  return labels
    .filter(([key]) => totals[key] != null)
    .map(([key, label]) => ({
      columns: [
        { text: label, bold: true },
        {
          text: countKeys.has(String(key)) ? String(totals[key]) : formatMoney(Number(totals[key])),
          alignment: 'right',
        },
      ],
      margin: [0, 2, 0, 2],
    }));
}

function headerCells(texts: string[], color: string) {
  return texts.map((text, index) => ({
    text,
    bold: true,
    color: '#ffffff',
    fillColor: color,
    alignment: (index >= texts.length - 1 ? 'right' : 'left') as Alignment,
  }));
}

function snapshotTable(document: RegisterDocument, color: string): Content | null {
  if (document.snapshot.rows.length === 0) return null;
  const type = resolvedType(document);
  if (type === 'donation_journal') {
    return {
      table: {
        headerRows: 1,
        widths: ['auto', '*', '*', 'auto', 'auto'],
        body: [
          headerCells([
            tr('common.date'),
            tr('register.colDonor'),
            tr('register.colNatureDetail'),
            tr('common.status'),
            tr('common.amount'),
          ], color),
          ...document.snapshot.rows.map((row) => [
            registerRowLabel(row),
            registerRowDetail(row),
            registerRowExtra(row),
            registerStatusLabel(row.status),
            { text: formatMoney(Number(row.amount ?? 0)), alignment: 'right' as Alignment },
          ]),
        ] as TableCell[][],
      },
      layout: 'lightHorizontalLines',
      margin: [0, 12, 0, 14],
    };
  }
  if (type === 'tax_receipt_register') {
    return {
      table: {
        headerRows: 1,
        widths: ['auto', '*', '*', 'auto', 'auto'],
        body: [
          headerCells([
            tr('register.colNumberShort'),
            tr('register.colDonor'),
            tr('register.colDetail'),
            tr('common.status'),
            tr('common.amount'),
          ], color),
          ...document.snapshot.rows.map((row) => [
            registerRowLabel(row),
            registerRowDetail(row),
            registerRowExtra(row),
            registerStatusLabel(row.status),
            { text: formatMoney(Number(row.amount ?? 0)), alignment: 'right' as Alignment },
          ]),
        ] as TableCell[][],
      },
      layout: 'lightHorizontalLines',
      margin: [0, 12, 0, 14],
    };
  }
  if (type === 'annual_donation_statement') {
    return {
      table: {
        headerRows: 1,
        widths: ['*', '*', 'auto'],
        body: [
          headerCells([tr('register.colIndicator'), tr('register.colDetail'), tr('common.amount')], color),
          ...document.snapshot.rows.map((row) => [
            registerRowLabel(row),
            [registerRowDetail(row), registerRowExtra(row)].filter(Boolean).join(' — '),
            { text: formatMoney(Number(row.amount ?? 0)), alignment: 'right' as Alignment },
          ]),
        ] as TableCell[][],
      },
      layout: 'lightHorizontalLines',
      margin: [0, 12, 0, 14],
    };
  }
  if (type === 'amortissement_register') {
    return {
      table: {
        headerRows: 1,
        widths: ['*', '*', 'auto', 'auto', 'auto', 'auto', 'auto'],
        body: [
          headerCells([
            tr('register.colLabel'),
            tr('register.colDetail'),
            tr('common.status'),
            tr('register.colImmoBrut'),
            tr('register.colImmoAmorti'),
            tr('register.colImmoDotation'),
            tr('register.colImmoVnc'),
          ], color),
          ...document.snapshot.rows.map((row) => [
            {
              stack: [
                { text: registerRowLabel(row), bold: true },
                ...(registerRowExtra(row)
                  ? [{ text: registerRowExtra(row), fontSize: 8, color: '#64748b' }]
                  : []),
              ],
            },
            registerRowDetail(row) || '—',
            registerStatusLabel(row.status) || '—',
            { text: formatMoney(Number(row.credit ?? 0)), alignment: 'right' as Alignment },
            { text: formatMoney(Number(row.debit ?? 0)), alignment: 'right' as Alignment },
            { text: formatMoney(Number(row.periodCharge ?? 0)), alignment: 'right' as Alignment },
            { text: formatMoney(Number(row.amount ?? 0)), alignment: 'right' as Alignment },
          ]),
        ] as TableCell[][],
      },
      layout: 'lightHorizontalLines',
      margin: [0, 12, 0, 14],
    };
  }
  return {
    table: {
      headerRows: 1,
      widths: ['*', '*', 'auto', 'auto'],
      body: [
        headerCells([
          tr('register.colLabel'),
          tr('register.colDetail'),
          tr('register.colDebit'),
          tr('register.colCredit'),
        ], color),
        ...document.snapshot.rows.map((row: RegisterSnapshotRow) => [
          registerRowLabel(row),
          registerRowDetail(row),
          row.debit != null || row.amount != null
            ? formatMoney(Number(row.debit ?? row.amount))
            : '—',
          row.credit != null ? formatMoney(row.credit) : '—',
        ]),
      ] as TableCell[][],
    },
    layout: 'lightHorizontalLines',
    margin: [0, 12, 0, 14],
  };
}

function associationHeader(config: AssociationConfig, color: string): Content[] {
  return [
    { text: config.denominationSociale || tr('org.typeAsso'), fontSize: 15, bold: true, color },
    {
      text: [
        config.formeJuridique,
        config.rna ? `RNA ${config.rna}` : '',
        config.siret ? `SIRET ${config.siret}` : '',
        config.adresse ? `${config.adresse.rue}, ${config.adresse.codePostal} ${config.adresse.ville}` : '',
      ]
        .filter(Boolean)
        .join(' — '),
      color: '#64748b',
      margin: [0, 0, 0, 6],
    },
    config.objetSocial
      ? { text: config.objetSocial, color: '#64748b', fontSize: 8, margin: [0, 0, 0, 12] }
      : { text: '', margin: [0, 0, 0, 12] },
  ];
}

type PdfDoc = ReturnType<typeof pdfMake.createPdf> & {
  getBlob?: (cb?: (blob: Blob) => void, err?: (e: unknown) => void) => unknown;
  getDataUrl?: (cb?: (url: string) => void, err?: (e: unknown) => void) => unknown;
};

async function callPdfMethod<T>(pdf: PdfDoc, method: 'getBlob' | 'getDataUrl'): Promise<T> {
  const fn = pdf[method];
  if (typeof fn !== 'function') throw new Error(tr('register.pdf.pdfMakeUnavailable', { method }));
  const result = Reflect.apply(fn, pdf, []);
  if (result != null && typeof (result as Promise<T>).then === 'function') {
    return result as Promise<T>;
  }
  return new Promise<T>((resolve, reject) => {
    Reflect.apply(fn, pdf, [resolve, reject]);
  });
}

async function toBytes(definition: TDocumentDefinitions): Promise<Uint8Array> {
  await loadFonts();
  const blob = await callPdfMethod<Blob>(pdfMake.createPdf(definition) as PdfDoc, 'getBlob');
  return new Uint8Array(await blob.arrayBuffer());
}

async function toDataUrl(definition: TDocumentDefinitions): Promise<string> {
  await loadFonts();
  return callPdfMethod<string>(pdfMake.createPdf(definition) as PdfDoc, 'getDataUrl');
}

async function buildDefinition(
  document: RegisterDocument,
  settings: RegisterSettings
): Promise<TDocumentDefinitions> {
  const type = resolvedType(document);
  const isAssociation = type === 'donation_journal'
    || type === 'tax_receipt_register'
    || type === 'annual_donation_statement';
  const organization = await EmetteurService.loadEmetteurExtended();
  const association = isAssociation
    ? (document.id === 'preview'
      ? withExampleAssociation(await AssociationConfigService.getOrCreateConfig())
      : await AssociationConfigService.getOrCreateConfig())
    : null;
  const content: Content[] = [];
  if (settings.includeOrganization) {
    if (association?.denominationSociale) {
      content.push(...associationHeader(association, settings.accentColor));
    } else if (organization) {
      content.push(
        { text: organization.denominationSociale, fontSize: 15, bold: true, color: settings.accentColor },
        {
          text: [
            organization.siret ? `SIRET ${organization.siret}` : '',
            organization.adresse
              ? `${organization.adresse.rue}, ${organization.adresse.codePostal} ${organization.adresse.ville}`
              : '',
          ]
            .filter(Boolean)
            .join(' — '),
          color: '#64748b',
          margin: [0, 0, 0, 18],
        }
      );
    }
  }
  content.push(
    { text: document.title, fontSize: 20, bold: true, color: settings.accentColor },
    { text: `${typeLabel(type)} · ${document.number}`, margin: [0, 3, 0, 3] },
    {
      text: tr('register.pdf.period', {
        start: formatRegisterDate(document.periodStart),
        end: formatRegisterDate(document.periodEnd),
      }),
      color: '#64748b',
      margin: [0, 0, 0, 12],
    }
  );
  const table = snapshotTable(document, settings.accentColor);
  if (table) content.push(table);
  content.push(...totalsContent(document));
  const moneyTotal = document.snapshot.totals.donations
    ?? document.snapshot.totals.receipts
    ?? document.snapshot.totals.invoiced;
  if (moneyTotal != null && moneyTotal > 0) {
    content.push({
      text: tr('register.pdf.amountInWords', { text: montantEnLettres(moneyTotal) }),
      italics: true,
      margin: [0, 8, 0, 0],
    });
  }
  if (isAssociation) {
    content.push({
      text: tr('register.pdf.disclaimer'),
      fontSize: 8,
      color: '#64748b',
      margin: [0, 14, 0, 0],
    });
  }
  if (document.notes) {
    content.push({ text: tr('common.notes'), fontSize: 12, bold: true, margin: [0, 16, 0, 5] });
    content.push({ text: document.notes });
  }
  if (document.items.length > 0) {
    content.push({ text: tr('register.pdf.addedItems'), fontSize: 12, bold: true, margin: [0, 16, 0, 5] });
    content.push({
      ul: document.items.map((item) =>
        `${item.label}${item.amount == null ? '' : ` — ${formatMoney(item.amount)}`}${item.description ? ` : ${item.description}` : ''}`
      ),
    });
  }
  if (document.links.length > 0) {
    content.push({ text: tr('register.linkedInfo'), fontSize: 12, bold: true, margin: [0, 16, 0, 5] });
    content.push({
      ul: document.links.map((link) =>
        `${link.label}${link.value ? ` : ${link.value}` : ''}${link.url ? ` — ${link.url}` : ''}`
      ),
    });
  }
  if (document.attachments.length > 0) {
    content.push({
      text: tr('register.pdf.attachmentsLine', {
        names: document.attachments.map((item) => item.name).join(', '),
      }),
      fontSize: 9,
      color: '#64748b',
      margin: [0, 18, 0, 0],
    });
  }
  return {
    pageSize: settings.pdfFormat === 'Letter' ? 'LETTER' : 'A4',
    pageOrientation: type === 'amortissement_register' ? 'landscape' : settings.pdfOrientation,
    pageMargins: [40, 40, 40, 40],
    content,
    defaultStyle: { fontSize: 9, color: '#0f172a' },
    info: { title: `${document.number} - ${document.title}` },
    footer: (current, pages) => ({
      text: tr('register.pdf.pageFooter', {
        number: document.number,
        type: typeLabel(type),
        current,
        pages,
      }),
      alignment: 'center',
      fontSize: 8,
      color: '#94a3b8',
    }),
  };
}

function samplePreviewDocument(
  type: RegisterDocument['type'],
  settings: RegisterSettings
): RegisterDocument {
  const year = String(new Date().getFullYear());
  const today = new Date().toISOString();
  const periodStart = `${year}-01-01`;
  const periodEnd = today.slice(0, 10);
  const base = {
    id: 'preview',
    number: `${settings.prefix}-${year}-${tr('register.pdf.previewTag')}`,
    type,
    title: typeLabel(type),
    status: 'generated' as const,
    periodStart,
    periodEnd,
    notes: tr('register.pdf.previewNotes'),
    pdfPath: null,
    createdAt: today,
    updatedAt: today,
    items: [],
    links: [],
    attachments: [],
  };
  if (type === 'donation_journal') {
    return {
      ...base,
      snapshot: {
        registerType: type,
        periodStart,
        periodEnd,
        rows: [
          { label: `${year}-01-15`, detail: 'Paul Martin', extra: tr('register.pdf.previewMonthlyGift'), amount: 120, status: 'individual' },
          { label: `${year}-04-22`, detail: 'Paul Martin', extra: tr('register.pdf.previewInKindGift'), amount: 250, status: 'individual' },
          { label: `${year}-06-03`, detail: 'Atelier Solaire', extra: tr('register.pdf.previewCorporateGift'), amount: 1500, status: 'company' },
          { label: `${year}-09-01`, detail: tr('register.anonymousDonor'), extra: tr('register.pdf.previewCashGift'), amount: 45, status: 'anonymous' },
        ],
        totals: { donations: 1915, donationCount: 4, anonymous: 45, natureNumeraire: 1665, natureInKind: 250 },
      },
    };
  }
  if (type === 'tax_receipt_register') {
    return {
      ...base,
      snapshot: {
        registerType: type,
        periodStart,
        periodEnd,
        rows: [
          { label: `RECU-${year}-0001`, detail: 'Paul Martin', extra: tr('register.pdf.previewIssuedCash', { date: '16/01' }), amount: 120, status: 'cancelled' },
          { label: `RECU-${year}-0002`, detail: 'Atelier Solaire', extra: tr('register.pdf.previewIssuedCash', { date: '04/06' }), amount: 1500, status: 'active' },
        ],
        totals: { receipts: 1500, receiptCount: 1, cancelledReceipts: 1 },
      },
    };
  }
  if (type === 'invoice_summary') {
    return {
      ...base,
      snapshot: {
        registerType: type,
        periodStart,
        periodEnd,
        rows: [
          { label: `F-${year}-001`, detail: tr('register.pdf.previewAnnualService'), amount: 2400, credit: 1200 },
          { label: `F-${year}-002`, detail: tr('register.pdf.previewSupport'), amount: 860, credit: 860 },
        ],
        totals: { invoiced: 3260, paid: 2060, outstanding: 1200 },
      },
    };
  }
  if (type === 'cashflow_summary') {
    return {
      ...base,
      snapshot: {
        registerType: type,
        periodStart,
        periodEnd,
        rows: [
          { label: tr('register.pdf.previewSupplies'), debit: 420, credit: 0 },
          { label: tr('register.pdf.previewDues'), debit: 0, credit: 1800 },
        ],
        totals: { expenses: 420, credits: 1800, balance: 1380 },
      },
    };
  }
  if (type === 'amortissement_register') {
    return {
      ...base,
      snapshot: {
        registerType: type,
        periodStart,
        periodEnd,
        rows: [
          {
            label: tr('register.pdf.previewLaptop'),
            detail: tr('register.pdf.previewLaptopDetail'),
            extra: tr('register.pdf.previewLinear3y'),
            status: 'actif',
            credit: 1200,
            debit: 800,
            periodCharge: 400,
            amount: 400,
          },
          {
            label: tr('register.pdf.previewVehicle'),
            detail: tr('register.pdf.previewVehicleDetail'),
            extra: tr('register.pdf.previewLinear5y'),
            status: 'actif',
            credit: 18000,
            debit: 7200,
            periodCharge: 3600,
            amount: 10800,
          },
        ],
        totals: {
          immoCount: 2,
          immoBrut: 19200,
          immoAmorti: 8000,
          immoDotation: 4000,
          immoVnc: 11200,
        },
      },
    };
  }
  if (type === 'reference') {
    return {
      ...base,
      snapshot: {
        registerType: type,
        periodStart,
        periodEnd,
        rows: [{ label: tr('register.pdf.previewInternalNote'), detail: tr('register.pdf.previewFreeDoc') }],
        totals: {},
      },
    };
  }
  return {
    ...base,
    snapshot: {
      registerType: 'annual_donation_statement',
      periodStart,
      periodEnd,
      rows: [
        {
          label: tr('register.snapshot.particuliersCgi'),
          labelKey: 'register.snapshot.particuliersCgi',
          detail: tr('register.snapshot.donorCount', { count: 2 }),
          detailKey: 'register.snapshot.donorCount',
          count: 2,
          amount: 450,
        },
        {
          label: tr('register.snapshot.entreprisesCgi'),
          labelKey: 'register.snapshot.entreprisesCgi',
          detail: tr('register.snapshot.donorCount', { count: 1 }),
          detailKey: 'register.snapshot.donorCount',
          count: 1,
          amount: 2300,
        },
        {
          label: tr('register.snapshot.anonymousDonations'),
          labelKey: 'register.snapshot.anonymousDonations',
          detail: tr('register.snapshot.noTaxReceipt'),
          detailKey: 'register.snapshot.noTaxReceipt',
          amount: 45,
        },
        {
          label: tr('register.snapshot.activeReceipts'),
          labelKey: 'register.snapshot.activeReceipts',
          detail: tr('register.snapshot.receiptCount', { count: 1 }),
          detailKey: 'register.snapshot.receiptCount',
          count: 1,
          amount: 1500,
        },
      ],
      totals: { donations: 2795, donationCount: 6, receipts: 1500, receiptCount: 1, cancelledReceipts: 1 },
    },
  };
}

export const RegisterPDFService = {
  async generate(document: RegisterDocument, settings: RegisterSettings): Promise<string> {
    return withLog('RegisterPDFService.generate', async () => {
      const bytes = await toBytes(await buildDefinition(document, settings));
      const saved = await AttachmentService.savePdfBytes(`${document.number}.pdf`, bytes);
      return saved.rel;
    });
  },

  async generatePreviewDataUrl(
    settings: RegisterSettings,
    type: RegisterDocument['type'] = 'donation_journal'
  ): Promise<string> {
    return withLog('RegisterPDFService.generatePreviewDataUrl', async () => {
      return toDataUrl(await buildDefinition(samplePreviewDocument(type, settings), settings));
    });
  },
};
