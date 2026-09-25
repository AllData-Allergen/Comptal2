export type RegisterDocumentType =
  | 'reference'
  | 'invoice_summary'
  | 'cashflow_summary'
  | 'donation_journal'
  | 'tax_receipt_register'
  | 'annual_donation_statement'
  | 'amortissement_register';

export const ALL_REGISTER_DOCUMENT_TYPES: RegisterDocumentType[] = [
  'donation_journal',
  'tax_receipt_register',
  'annual_donation_statement',
  'reference',
  'invoice_summary',
  'cashflow_summary',
  'amortissement_register',
];

export const ASSOCIATION_REGISTER_TYPES: RegisterDocumentType[] = [
  'donation_journal',
  'tax_receipt_register',
  'annual_donation_statement',
];

export const GENERAL_REGISTER_TYPES: RegisterDocumentType[] = [
  'reference',
  'invoice_summary',
  'cashflow_summary',
  'amortissement_register',
];

export interface RegisterSettings {
  prefix: string;
  nextSequence: number;
  numberFormat: string;
  defaultTitle: string;
  defaultNotes: string;
  pdfFormat: 'A4' | 'Letter';
  pdfOrientation: 'portrait' | 'landscape';
  includeOrganization: boolean;
  accentColor: string;
  /** Types proposés dans la page Registre. Vide ou absent = tous. */
  enabledTypes: RegisterDocumentType[];
}

export interface RegisterItem {
  id: string;
  documentId: string;
  label: string;
  description: string;
  amount: number | null;
  createdAt: string;
}

export interface RegisterLink {
  id: string;
  documentId: string;
  label: string;
  value: string;
  url: string;
  createdAt: string;
}

export interface RegisterAttachment {
  id: string;
  documentId: string | null;
  name: string;
  path: string;
  mimeType: string;
  createdAt: string;
}

export interface RegisterSnapshotRow {
  label: string;
  detail?: string;
  extra?: string;
  status?: string;
  debit?: number;
  credit?: number;
  amount?: number;
  /** Dotation d’amortissement sur la période (type amortissement_register). */
  periodCharge?: number;
  /** Clé i18n d’un libellé système (pas une donnée saisie). */
  labelKey?: string;
  detailKey?: string;
  extraKey?: string;
  count?: number;
}

export interface RegisterSnapshot {
  registerType?: RegisterDocumentType;
  periodStart: string;
  periodEnd: string;
  rows: RegisterSnapshotRow[];
  totals: {
    invoiced?: number;
    paid?: number;
    outstanding?: number;
    expenses?: number;
    credits?: number;
    balance?: number;
    donations?: number;
    donationCount?: number;
    receipts?: number;
    receiptCount?: number;
    cancelledReceipts?: number;
    anonymous?: number;
    particuliers?: number;
    entreprises?: number;
    particuliersAmount?: number;
    entreprisesAmount?: number;
    natureNumeraire?: number;
    natureInKind?: number;
    natureSkills?: number;
    immoBrut?: number;
    immoAmorti?: number;
    immoVnc?: number;
    immoDotation?: number;
    immoCount?: number;
  };
}

export interface RegisterDocument {
  id: string;
  number: string;
  type: RegisterDocumentType;
  title: string;
  status: 'generated' | 'archived';
  periodStart: string;
  periodEnd: string;
  notes: string;
  snapshot: RegisterSnapshot;
  pdfPath: string | null;
  createdAt: string;
  updatedAt: string;
  items: RegisterItem[];
  links: RegisterLink[];
  attachments: RegisterAttachment[];
}

export interface GenerateRegisterDocumentInput {
  type: RegisterDocumentType;
  title: string;
  periodStart: string;
  periodEnd: string;
  notes?: string;
}
