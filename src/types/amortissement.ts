export type TypeImmobilisation =
  | 'materiel_informatique'
  | 'materiel_bureau'
  | 'outillage'
  | 'vehicule'
  | 'mobilier'
  | 'logiciel'
  | 'autre';

export type MethodeAmortissement = 'lineaire' | 'degressif' | 'non_amortissable';

export type StatutImmobilisation = 'actif' | 'cede' | 'mis_au_rebut';

export const TYPE_IMMOBILISATION_LIST: TypeImmobilisation[] = [
  'materiel_informatique',
  'materiel_bureau',
  'outillage',
  'vehicule',
  'mobilier',
  'logiciel',
  'autre',
];

/** Durées usuelles BOFiP (repères, éditables). */
export const DEFAULT_DUREES_PAR_TYPE: Record<TypeImmobilisation, number> = {
  materiel_informatique: 3,
  materiel_bureau: 5,
  outillage: 5,
  vehicule: 5,
  mobilier: 10,
  logiciel: 3,
  autre: 5,
};

export const DEFAULT_SEUIL_FAIBLE_VALEUR = 500;

export interface Immobilisation {
  id: string;
  designation: string;
  reference?: string;
  typeImmobilisation: TypeImmobilisation;
  valeurAcquisitionHT: number;
  tauxTVA: number;
  dateAcquisition: string;
  dateMiseEnService: string;
  dureeAnnees: number;
  methode: MethodeAmortissement;
  valeurResiduelle: number;
  statut: StatutImmobilisation;
  dateCession?: string;
  valeurCession?: number;
  fournisseur?: string;
  factureRef?: string;
  notes?: string;
  faibleValeur: boolean;
  subventionInvestissement: number;
  createdAt: string;
  updatedAt: string;
}

export interface ImmobilisationAttachment {
  id: string;
  immobilisationId: string;
  name: string;
  path: string;
  mimeType: string;
  createdAt: string;
}

export interface AmortissementSettings {
  dureesParType: Record<TypeImmobilisation, number>;
  seuilFaibleValeur: number;
  prorataMensuel: boolean;
  methodeDefaut: MethodeAmortissement;
}

export const DEFAULT_AMORTISSEMENT_SETTINGS: AmortissementSettings = {
  dureesParType: { ...DEFAULT_DUREES_PAR_TYPE },
  seuilFaibleValeur: DEFAULT_SEUIL_FAIBLE_VALEUR,
  prorataMensuel: true,
  methodeDefaut: 'lineaire',
};

export interface ImmobilisationComputed {
  article: Immobilisation;
  baseAmortissable: number;
  anneesEcoulees: number;
  amortissementAnnuel: number;
  amortissementCumule: number;
  vnc: number;
  dotationExercice: number;
}

export interface AmortissementSeries {
  labels: string[];
  periodKeys: string[];
  brut: number[];
  amortiCumule: number[];
  vnc: number[];
  dotation: number[];
}

export interface AmortissementSummary {
  count: number;
  brut: number;
  amortiCumule: number;
  vnc: number;
  dotationExercice: number;
  faibleValeurCount: number;
}
