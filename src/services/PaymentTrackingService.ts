import { Facture, Paiement } from '../types/invoice';
import i18n from '../i18n/config';
import { labelContainsDocumentNumero, newEntityId } from '../utils/invoiceFormat';
import { InvoiceService } from './InvoiceService';
import { StatsService, TransactionListRow } from './StatsService';
import { withLog } from './logger';
import { ConfigService } from './ConfigService';
import { EditionService } from './EditionService';
import { EmetteurService } from './EmetteurService';
import { MicroEnterpriseService } from './MicroEnterpriseService';

export type PaymentMatchReason = 'label' | 'amount' | 'both';

export interface PaymentMatch {
  transaction: TransactionListRow;
  reason: PaymentMatchReason;
  score: number;
}

function creditAmount(tx: TransactionListRow): number {
  return Math.abs(tx.credit || 0);
}

function amountClose(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.05;
}

function rankMatch(facture: Facture, tx: TransactionListRow, remaining: number): PaymentMatch | null {
  const amount = creditAmount(tx);
  if (amount <= 0) return null;
  const byLabel = labelContainsDocumentNumero(tx.label || '', facture.numero);
  const byAmount = amountClose(amount, facture.totalTTC) || amountClose(amount, remaining);
  if (!byLabel && !byAmount) return null;
  const reason: PaymentMatchReason = byLabel && byAmount ? 'both' : byLabel ? 'label' : 'amount';
  const score = (byLabel ? 100 : 0) + (byAmount ? 40 : 0) + (reason === 'both' ? 20 : 0);
  return { transaction: tx, reason, score };
}

export const PaymentTrackingService = {
  getPaymentStatus(facture: Facture): { paidAmount: number; totalTTC: number; percent: number } {
    const paidAmount = facture.paiements.reduce((sum, paiement) => sum + paiement.montant, 0);
    const totalTTC = facture.totalTTC;
    const percent = totalTTC > 0 ? Math.min(100, (paidAmount / totalTTC) * 100) : 0;
    return { paidAmount, totalTTC, percent };
  },

  getRemainingAmount(facture: Facture): number {
    const { paidAmount, totalTTC } = this.getPaymentStatus(facture);
    return Math.max(0, totalTTC - paidAmount);
  },

  computeFactureStatus(facture: Facture): Facture['statut'] {
    const remaining = this.getRemainingAmount(facture);
    if (remaining <= 0.009) return 'payee';
    if (facture.paiements.length > 0) return 'payee_partiellement';
    if (facture.dateEcheance && facture.dateEcheance.getTime() < Date.now()) return 'en_retard';
    return facture.statut === 'brouillon' ? 'brouillon' : 'envoyee';
  },

  async linkTransactionToInvoice(transactionId: number, factureId: string): Promise<Facture> {
    return withLog('PaymentTrackingService.linkTransactionToInvoice', async () => {
      const factures = await InvoiceService.loadFactures();
      const facture = factures.find((item) => item.id === factureId);
      if (!facture) throw new Error(i18n.t('errors.invoiceNotFound'));
      if (facture.paiements.some((p) => p.transactionId === String(transactionId))) return facture;

      const txs = await StatsService.listAllTransactions({});
      const transaction = txs.find((item) => item.id === transactionId);
      if (!transaction) throw new Error(i18n.t('errors.transactionNotFound'));

      const montantRaw = creditAmount(transaction);
      if (!Number.isFinite(montantRaw) || montantRaw <= 0) throw new Error(i18n.t('errors.onlyCreditsLinkable'));
      const remaining = this.getRemainingAmount(facture);
      const montant = Math.min(montantRaw, remaining);
      if (montant <= 0) throw new Error(i18n.t('errors.paymentExceedsRemaining'));
      const paiement: Paiement = {
        id: newEntityId('pay'),
        factureId,
        montant,
        datePaiement: new Date(transaction.date),
        modePaiement: 'virement',
        transactionId: String(transaction.id),
        reference: transaction.label,
      };
      facture.paiements = [...facture.paiements, paiement];
      facture.statut = this.computeFactureStatus(facture);
      await InvoiceService.upsertFacture(facture);
      await MicroEnterpriseService.recordInvoicePayment(facture, paiement);
      return facture;
    });
  },

  async addManualPaiement(
    factureId: string,
    params: { montant: number; datePaiement: Date; modePaiement: 'especes' | 'cheque'; reference?: string }
  ): Promise<Facture> {
    return withLog('PaymentTrackingService.addManualPaiement', async () => {
      const factures = await InvoiceService.loadFactures();
      const facture = factures.find((item) => item.id === factureId);
      if (!facture) throw new Error(i18n.t('errors.invoiceNotFound'));
      if (!Number.isFinite(params.montant) || params.montant <= 0) {
        throw new Error(i18n.t('errors.invalidAmount'));
      }
      const remaining = this.getRemainingAmount(facture);
      const montant = Math.min(params.montant, remaining);
      if (montant <= 0) throw new Error(i18n.t('errors.paymentExceedsRemaining'));
      const accountId = await resolveTreasuryAccountId();
      const modeLabel =
        params.modePaiement === 'especes'
          ? i18n.t('facturation.pay.modeEspeces')
          : i18n.t('facturation.pay.modeCheque');
      const txId = await EditionService.insert({
        accountId,
        date: params.datePaiement.toISOString().slice(0, 10),
        credit: montant,
        debit: 0,
        label: i18n.t('facturation.pay.treasuryFollowupLabel', {
          mode: modeLabel,
          numero: facture.numero,
        }),
      });
      const paiement: Paiement = {
        id: newEntityId('pay'),
        factureId,
        montant,
        datePaiement: params.datePaiement,
        modePaiement: params.modePaiement,
        reference: params.reference,
        transactionId: txId ? String(txId) : undefined,
        notes: i18n.t('facturation.pay.notCashRegister'),
      };
      facture.paiements = [...facture.paiements, paiement];
      facture.statut = this.computeFactureStatus(facture);
      await InvoiceService.upsertFacture(facture);
      await MicroEnterpriseService.recordInvoicePayment(facture, paiement);
      return facture;
    });
  },

  async unlinkPaiement(paiementId: string, factureId: string): Promise<Facture> {
    return withLog('PaymentTrackingService.unlinkPaiement', async () => {
      const factures = await InvoiceService.loadFactures();
      const facture = factures.find((item) => item.id === factureId);
      if (!facture) throw new Error(i18n.t('errors.invoiceNotFound'));
      const paiement = facture.paiements.find((item) => item.id === paiementId);
      facture.paiements = facture.paiements.filter((p) => p.id !== paiementId);
      facture.statut = this.computeFactureStatus(facture);
      await InvoiceService.upsertFacture(facture);
      if (paiement) await MicroEnterpriseService.reverseInvoicePayment(paiement);
      return facture;
    });
  },

  async searchMatchingTransactions(facture: Facture): Promise<TransactionListRow[]> {
    const matches = await this.findPaymentMatches(facture);
    return matches.map((m) => m.transaction);
  },

  async findPaymentMatches(facture: Facture): Promise<PaymentMatch[]> {
    return withLog('PaymentTrackingService.findPaymentMatches', async () => {
      const remaining = this.getRemainingAmount(facture);
      const linked = new Set(facture.paiements.map((p) => p.transactionId).filter(Boolean) as string[]);
      const txs = await StatsService.listAllTransactions({});
      return txs
        .filter((tx) => !linked.has(String(tx.id)))
        .map((tx) => rankMatch(facture, tx, remaining))
        .filter((item): item is PaymentMatch => Boolean(item))
        .sort((a, b) => b.score - a.score || b.transaction.date.localeCompare(a.transaction.date));
    }, { data: { factureId: facture.id, numero: facture.numero } });
  },

  /** Correspondances où le libellé contient le numéro de facture (reconnaissance auto). */
  async findLabelMatches(facture: Facture): Promise<PaymentMatch[]> {
    const matches = await this.findPaymentMatches(facture);
    return matches.filter((m) => m.reason === 'label' || m.reason === 'both');
  },

  async autoLinkLabelMatches(factureId: string): Promise<{ facture: Facture; linked: number }> {
    return withLog('PaymentTrackingService.autoLinkLabelMatches', async () => {
      const factures = await InvoiceService.loadFactures();
      let facture = factures.find((item) => item.id === factureId);
      if (!facture) throw new Error(i18n.t('errors.invoiceNotFound'));
      const matches = await this.findLabelMatches(facture);
      let linked = 0;
      for (const match of matches) {
        const already = facture.paiements.some((p) => p.transactionId === String(match.transaction.id));
        if (already) continue;
        if (this.getRemainingAmount(facture) <= 0) break;
        facture = await this.linkTransactionToInvoice(match.transaction.id, facture.id);
        linked += 1;
      }
      return { facture, linked };
    }, { data: { factureId } });
  },
};

async function resolveTreasuryAccountId(): Promise<number> {
  const accounts = await ConfigService.listAccounts();
  if (accounts.length === 0) {
    throw new Error(i18n.t('errors.noAccountForCashPayment'));
  }
  const emetteur = await EmetteurService.loadEmetteurExtended();
  const preferred =
    emetteur?.linkedAccounts?.find((item) => item.isPrimary)?.accountCode ??
    emetteur?.linkedAccounts?.[0]?.accountCode;
  const match = preferred ? accounts.find((account) => account.code === preferred) : undefined;
  return match?.id ?? accounts[0].id;
}
