import { RegisterDocumentType } from '../types/register';

export const REGISTER_TYPE_META: Record<
  RegisterDocumentType,
  { title: string; shortTitle: string; description: string; group: 'association' | 'general' }
> = {
  donation_journal: {
    title: 'Journal chronologique des dons',
    shortTitle: 'Journal des dons',
    description: 'Fige les dons numéraires, en nature, en compétences et anonymes.',
    group: 'association',
  },
  tax_receipt_register: {
    title: 'Registre des reçus fiscaux',
    shortTitle: 'Registre des reçus',
    description: 'Liste les reçus émis, leur montant et les annulations conservées.',
    group: 'association',
  },
  annual_donation_statement: {
    title: 'État annuel des reçus fiscaux',
    shortTitle: 'État annuel',
    description: 'Synthétise le nombre de reçus et le montant déclaré pour l’exercice.',
    group: 'association',
  },
  reference: {
    title: 'Document de référence',
    shortTitle: 'Référence',
    description: 'Créez un rapport libre à compléter avec vos éléments et justificatifs.',
    group: 'general',
  },
  invoice_summary: {
    title: 'Bilan des factures',
    shortTitle: 'Factures',
    description: 'Figez les montants facturés, encaissés et restant à encaisser.',
    group: 'general',
  },
  cashflow_summary: {
    title: 'Bilan dépenses / crédits',
    shortTitle: 'Dépenses / crédits',
    description: 'Regroupez les mouvements bancaires par catégorie sur une période.',
    group: 'general',
  },
  amortissement_register: {
    title: 'État des amortissements',
    shortTitle: 'Amortissements',
    description: 'Fige le registre des immobilisations : brut, amorti, dotation de période et VNC.',
    group: 'general',
  },
};
