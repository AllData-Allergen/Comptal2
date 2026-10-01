import type { Emetteur } from './invoice';

export type MicroDeclarationFrequency = 'monthly' | 'quarterly';
export type MicroPaymentMethod = 'virement' | 'cheque' | 'especes' | 'cb' | 'prelevement' | 'autre';
export type MicroReceiptSource = 'invoice_payment' | 'manual' | 'reversal';

export interface MicroEnterpriseConfig {
  enabled: boolean;
  businessStartDate: string;
  fiscalYear: number;
  regimeFiscal: Extract<NonNullable<Emetteur['regimeFiscal']>, 'micro_bic' | 'micro_bnc'>;
  declarationFrequency: MicroDeclarationFrequency;
  versementLiberatoire: boolean;
  socialRate: number;
  trainingRate: number;
  incomeTaxRate: number;
  microThreshold: number;
  vatBaseThreshold: number;
  vatToleranceThreshold: number;
  estimatedMonthlyToolsCost: number;
}

export interface MicroReceipt {
  id: string;
  sequence: number;
  receivedDate: string;
  clientName: string;
  description: string;
  amount: number;
  paymentMethod: MicroPaymentMethod;
  invoiceId?: string;
  invoiceNumber?: string;
  transactionId?: string;
  sourcePaymentId?: string;
  reference?: string;
  source: MicroReceiptSource;
  reversesId?: string;
  createdAt: string;
}

export interface MicroReceiptInput {
  receivedDate: string;
  clientName: string;
  description: string;
  amount: number;
  paymentMethod: MicroPaymentMethod;
  transactionId?: string;
  reference?: string;
}

export interface MicroEnterpriseSummary {
  periodStart: string;
  periodEnd: string;
  periodCollected: number;
  yearCollected: number;
  socialContributions: number;
  trainingContribution: number;
  incomeTaxProvision: number;
  totalProvision: number;
  toolsCost: number;
  estimatedRemainder: number;
  microThresholdProgress: number;
  vatBaseProgress: number;
  vatToleranceProgress: number;
  warningLevel: 0 | 75 | 90 | 100;
}

export interface MicroDeadline {
  id: string;
  date: string;
  label: string;
  detail: string;
  kind: 'urssaf' | 'tax' | 'cfe' | 'einvoicing';
}
