export type TypeEmetteur = 'entreprise' | 'association' | 'auto_entrepreneur' | 'particulier';

export interface Adresse {
  rue: string;
  codePostal: string;
  ville: string;
  pays: string;
}

export const EMPTY_ADRESSE: Adresse = { rue: '', codePostal: '', ville: '', pays: 'France' };

export interface Emetteur {
  id: string;
  type: TypeEmetteur;
  denominationSociale: string;
  formeJuridique?: string;
  siren?: string;
  siret: string;
  numeroTVA?: string;
  rna?: string;
  codeNAF?: string;
  rcs?: string;
  rm?: string;
  capitalSocial?: number;
  adresse: Adresse;
  telephone?: string;
  email?: string;
  siteWeb?: string;
  logo?: string;
  couleurPrincipale?: string;
  coordonneesBancaires?: {
    titulaire: string;
    iban: string;
    bic: string;
    banque?: string;
  };
  regimeTVA: 'franchise' | 'reel_simplifie' | 'reel_normal' | 'mini_reel';
  regimeFiscal?: 'micro_bic' | 'micro_bnc' | 'reel_simplifie' | 'reel_normal' | 'is';
  mentionFranchiseTVA?: string;
  mediateurConsommation?: string;
  assurancePro?: {
    compagnie: string;
    numeroPolice: string;
    couvertureGeographique?: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface InvoiceSettings {
  emetteur: Emetteur;
  prefixeDevis: string;
  prefixeFacture: string;
  formatNumero: string;
  prochainNumeroDevis: number;
  prochainNumeroFacture: number;
  tauxTVADefaut: number;
  delaiPaiementDefaut: number;
  conditionsPaiementDefaut: string;
  mentionsPenalitesRetard: string;
  mentionIndemniteRecouvrement: string;
  mentionsParticulieres?: string;
  coordonneesBancairesFacture?: {
    titulaire: string;
    iban: string;
    bic: string;
  };
}

export type TypeClient = 'particulier' | 'entreprise';
export type ContactRole = 'client' | 'donateur';

export interface ClientDetailField {
  id: string;
  label: string;
  value: string;
}

export interface ContactGroupe {
  id: string;
  nom: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Client {
  id: string;
  codeClient?: string;
  type: TypeClient;
  /** Couleur du contact, utilisée notamment dans les graphiques du Dashboard. */
  color?: string;
  /** Un même contact peut être client, donateur, ou cumuler les deux rôles. */
  roles?: ContactRole[];
  email?: string;
  telephone?: string;
  adresseFacturation: Adresse;
  adresseLivraison?: Adresse;
  notes?: string;
  groupeId?: string;
  extraDetails?: ClientDetailField[];
  coordonneesBancaires?: {
    titulaire: string;
    iban: string;
    bic: string;
    banque?: string;
  };
  createdAt: Date;
  updatedAt: Date;
  civilite?: 'M.' | 'Mme' | 'Mlle';
  nom?: string;
  prenom?: string;
  denominationSociale?: string;
  formeJuridique?: string;
  siren?: string;
  siret?: string;
  numeroTVA?: string;
  codeNAF?: string;
  capitalSocial?: number;
  archived?: boolean;
}

export type TypePoste = 'materiel' | 'travail';

export interface PosteMateriel {
  id: string;
  type: 'materiel';
  designation: string;
  reference?: string;
  numeroArticle?: string;
  numeroLot?: string;
  description?: string;
  prixUnitaireHT: number;
  tauxTVA: number;
  quantite: number;
  unite: string;
  remise?: number;
  fraisTransport?: number;
  marge?: number;
  articleRefId?: string;
  fournisseur?: string;
  factureRef?: string;
  articlesLies?: { articleId: string; quantiteParUtilisation: number }[];
}

export interface PosteTravail {
  id: string;
  type: 'travail';
  designation: string;
  description?: string;
  tauxHoraire: number;
  heuresEstimees: number;
  nombreIntervenants: number;
  tauxTVA: number;
  marge?: number;
  fraisDeplacement?: number;
  taches?: string[];
  secteursIds?: string[];
}

export type PosteFacture = PosteMateriel | PosteTravail;

export interface PosteGroupe {
  id: string;
  type: 'groupe';
  nom: string;
  description?: string;
  postes: PosteFacture[];
  createdAt: Date;
  updatedAt: Date;
}

export interface SecteurActivite {
  id: string;
  nom: string;
  ordre: number;
}

export interface Paiement {
  id: string;
  factureId: string;
  montant: number;
  datePaiement: Date;
  modePaiement: 'virement' | 'cheque' | 'especes' | 'cb' | 'prelevement';
  transactionId?: string;
  reference?: string;
  notes?: string;
}

export interface DocumentBase {
  id: string;
  numero: string;
  intituleSecondaire?: string;
  clientId: string;
  dateEmission: Date;
  dateEcheance?: Date;
  postes: PosteFacture[];
  vendeur: {
    type?: TypeEmetteur;
    denominationSociale: string;
    formeJuridique: string;
    adresse: Adresse;
    siren: string;
    siret: string;
    numeroTVA: string;
    capitalSocial?: number;
    rcs?: string;
    email?: string;
    telephone?: string;
    regimeTVA?: Emetteur['regimeTVA'];
    mentionFranchiseTVA?: string;
    mediateurConsommation?: string;
    logo?: string;
    coordonneesBancaires?: {
      titulaire: string;
      iban: string;
      bic: string;
      banque?: string;
    };
  };
  totalHT: number;
  totalTVA: Record<number, number>;
  totalTTC: number;
  conditionsPaiement?: string;
  mentionsLegales?: string;
  notes?: string;
  statut:
    | 'brouillon'
    | 'envoye'
    | 'accepte'
    | 'refuse'
    | 'expire'
    | 'envoyee'
    | 'payee_partiellement'
    | 'payee'
    | 'en_retard'
    | 'annulee'
    | 'caduc';
  createdAt: Date;
  updatedAt: Date;
}

export interface DevisCaducite {
  signedBy: string;
  signedAt: Date;
  reason?: string;
}

export type DevisAttachmentMode = 'link' | 'copy';

export interface DevisAttachment {
  mode: DevisAttachmentMode;
  path: string;
  name: string;
  mimeType?: string;
}

export interface Devis extends DocumentBase {
  documentType: 'devis';
  dateValidite: Date;
  factureGeneree?: string;
  attachment?: DevisAttachment;
  /** Scans / PDF signés par le client, distincts du PDF généré. */
  clientAttachments?: DevisAttachment[];
  /** Conservé pour d’anciens profils ; les devis ne sont plus supprimés. */
  supprime?: boolean;
  caduc?: boolean;
  caducite?: DevisCaducite;
}

export interface FactureAttachment {
  mode: 'link' | 'copy';
  path: string;
  name: string;
  mimeType?: string;
}

export interface Facture extends DocumentBase {
  documentType: 'facture';
  devisOrigine?: string;
  dateLivraison?: Date;
  numeroCommande?: string;
  paiements: Paiement[];
  statut: 'brouillon' | 'envoyee' | 'payee_partiellement' | 'payee' | 'en_retard' | 'annulee';
  supprime?: boolean;
  attachment?: FactureAttachment;
  /** Facture d’avoir (correction d’une facture émise, nouveau numéro). */
  isAvoir?: boolean;
  factureOrigine?: string;
  factureOrigineNumero?: string;
}

export type PDFFormat = 'A4' | 'Letter';
export type PDFOrientation = 'portrait' | 'landscape';
export type LogoPosition = 'left' | 'right' | 'center';
export type MentionLegaleCategory = 'tva' | 'penalites' | 'assurance' | 'juridique' | 'autre';
export type MentionLegaleType = 'predefined' | 'custom';

export interface PDFTypography {
  headerFont: string;
  bodyFont: string;
  fontSize: { title: number; header: number; body: number; footer: number };
}

export interface PDFColors {
  primary: string;
  secondary: string;
  accent: string;
  text: string;
  border: string;
}

export interface PDFMargins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface PDFLogoSize {
  width: number;
  height: number;
}

export interface PDFLayout {
  margins: PDFMargins;
  headerHeight: number;
  footerHeight: number;
  logoPosition: LogoPosition;
  logoSize: PDFLogoSize;
}

export interface PDFTemplate {
  id: string;
  name: string;
  description?: string;
  format: PDFFormat;
  orientation: PDFOrientation;
  typography: PDFTypography;
  colors: PDFColors;
  layout: PDFLayout;
  isDefault?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface MentionLegale {
  id: string;
  type: MentionLegaleType;
  label: string;
  content: string;
  category: MentionLegaleCategory;
  required?: boolean;
  enabled?: boolean;
}

export interface EmetteurAccountLink {
  accountCode: string;
  accountName: string;
  isPrimary: boolean;
  color?: string;
}

export type MentionPlaceholderValues = Record<string, Record<string, string>>;

export interface EmetteurExtended extends Emetteur {
  linkedAccounts?: EmetteurAccountLink[];
  pdfTemplateDevis?: string;
  pdfTemplateFacture?: string;
  selectedMentionsLegales?: string[];
  customMentionsLegales?: MentionLegale[];
  mentionPlaceholderValues?: MentionPlaceholderValues;
}

export interface InvoiceSettingsWithoutEmetteur {
  prefixeDevis: string;
  prefixeFacture: string;
  formatNumero: string;
  prochainNumeroDevis: number;
  prochainNumeroFacture: number;
  tauxTVADefaut: number;
  delaiPaiementDefaut: number;
  conditionsPaiementDefaut: string;
  mentionsPenalitesRetard: string;
  mentionIndemniteRecouvrement: string;
  mentionsParticulieres?: string;
  coordonneesBancairesFacture?: {
    titulaire: string;
    iban: string;
    bic: string;
  };
}
