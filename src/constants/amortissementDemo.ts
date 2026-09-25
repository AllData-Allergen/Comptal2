import { Immobilisation } from '../types/amortissement';

const year = () => new Date().getFullYear();

export const DEMO_IMMO_IDS = {
  pcPortable: 'demo-immo-pc-portable',
  photocopieur: 'demo-immo-photocopieur',
  voiture: 'demo-immo-vehicule',
  bureau: 'demo-immo-mobilier',
  logiciel: 'demo-immo-logiciel',
  outillage: 'demo-immo-outillage',
  tablette: 'demo-immo-tablette-fv',
  serveur: 'demo-immo-serveur-cede',
} as const;

/** Date relative à l’année courante (mois 1–12). */
export function demoImmoDate(yearsAgo: number, month: number, day: number): string {
  const y = year() - yearsAgo;
  return `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

type DemoAsset = Pick<
  Immobilisation,
  | 'id'
  | 'designation'
  | 'reference'
  | 'typeImmobilisation'
  | 'valeurAcquisitionHT'
  | 'tauxTVA'
  | 'dateAcquisition'
  | 'dateMiseEnService'
  | 'dureeAnnees'
  | 'methode'
  | 'valeurResiduelle'
  | 'statut'
  | 'fournisseur'
  | 'factureRef'
  | 'notes'
  | 'faibleValeur'
  | 'subventionInvestissement'
> &
  Partial<Pick<Immobilisation, 'dateCession' | 'valeurCession'>>;

export const DEMO_IMMOBILISATIONS: DemoAsset[] = [
  {
    id: DEMO_IMMO_IDS.pcPortable,
    designation: 'PC portable Dell Latitude',
    reference: 'IT-2024-001',
    typeImmobilisation: 'materiel_informatique',
    valeurAcquisitionHT: 1290,
    tauxTVA: 20,
    dateAcquisition: demoImmoDate(2, 3, 12),
    dateMiseEnService: demoImmoDate(2, 3, 15),
    dureeAnnees: 3,
    methode: 'lineaire',
    valeurResiduelle: 0,
    statut: 'actif',
    fournisseur: 'Dell Technologies',
    factureRef: 'FA-DELL-88421',
    notes: 'Poste direction — amortissement linéaire 3 ans',
    faibleValeur: false,
    subventionInvestissement: 0,
  },
  {
    id: DEMO_IMMO_IDS.photocopieur,
    designation: 'Photocopieur multifonction Brother',
    reference: 'BUR-2023-014',
    typeImmobilisation: 'materiel_bureau',
    valeurAcquisitionHT: 2450,
    tauxTVA: 20,
    dateAcquisition: demoImmoDate(3, 6, 1),
    dateMiseEnService: demoImmoDate(3, 6, 5),
    dureeAnnees: 5,
    methode: 'lineaire',
    valeurResiduelle: 100,
    statut: 'actif',
    fournisseur: 'Office Pro',
    factureRef: 'FAC-OP-5521',
    notes: 'Salle impression — valeur résiduelle 100 €',
    faibleValeur: false,
    subventionInvestissement: 500,
  },
  {
    id: DEMO_IMMO_IDS.voiture,
    designation: 'Véhicule utilitaire Renault Kangoo',
    reference: 'VEH-2022-003',
    typeImmobilisation: 'vehicule',
    valeurAcquisitionHT: 18500,
    tauxTVA: 20,
    dateAcquisition: demoImmoDate(4, 1, 20),
    dateMiseEnService: demoImmoDate(4, 2, 1),
    dureeAnnees: 5,
    methode: 'degressif',
    valeurResiduelle: 1500,
    statut: 'actif',
    fournisseur: 'Renault Retail',
    factureRef: 'FAC-REN-12098',
    notes: 'Dégressif CGI 39 A — coeff 1,75',
    faibleValeur: false,
    subventionInvestissement: 0,
  },
  {
    id: DEMO_IMMO_IDS.bureau,
    designation: 'Mobilier open-space (lot)',
    reference: 'MOB-2021-008',
    typeImmobilisation: 'mobilier',
    valeurAcquisitionHT: 6200,
    tauxTVA: 20,
    dateAcquisition: demoImmoDate(5, 9, 10),
    dateMiseEnService: demoImmoDate(5, 9, 15),
    dureeAnnees: 10,
    methode: 'lineaire',
    valeurResiduelle: 0,
    statut: 'actif',
    fournisseur: 'Mobilier Collectivités',
    factureRef: 'FAC-MC-441',
    notes: 'Tables + chaises — durée usuelle 10 ans',
    faibleValeur: false,
    subventionInvestissement: 2000,
  },
  {
    id: DEMO_IMMO_IDS.logiciel,
    designation: 'Licence logicielle comptable (3 ans)',
    reference: 'LOG-2025-002',
    typeImmobilisation: 'logiciel',
    valeurAcquisitionHT: 1890,
    tauxTVA: 20,
    dateAcquisition: demoImmoDate(1, 2, 1),
    dateMiseEnService: demoImmoDate(1, 2, 1),
    dureeAnnees: 3,
    methode: 'lineaire',
    valeurResiduelle: 0,
    statut: 'actif',
    fournisseur: 'SoftCompta SAS',
    factureRef: 'FAC-SC-9912',
    notes: 'Logiciel amortissable sur durée du droit',
    faibleValeur: false,
    subventionInvestissement: 0,
  },
  {
    id: DEMO_IMMO_IDS.outillage,
    designation: 'Outillage atelier (perceuse + scie)',
    reference: 'OUT-2024-011',
    typeImmobilisation: 'outillage',
    valeurAcquisitionHT: 875,
    tauxTVA: 20,
    dateAcquisition: demoImmoDate(1, 11, 8),
    dateMiseEnService: demoImmoDate(1, 11, 10),
    dureeAnnees: 5,
    methode: 'degressif',
    valeurResiduelle: 0,
    statut: 'actif',
    fournisseur: 'Outillage Plus',
    factureRef: 'FAC-OUT-334',
    notes: 'Dégressif — durée 5 ans',
    faibleValeur: false,
    subventionInvestissement: 0,
  },
  {
    id: DEMO_IMMO_IDS.tablette,
    designation: 'Tablette Android (faible valeur)',
    reference: 'IT-2025-FV',
    typeImmobilisation: 'materiel_informatique',
    valeurAcquisitionHT: 349,
    tauxTVA: 20,
    dateAcquisition: demoImmoDate(0, 4, 3),
    dateMiseEnService: demoImmoDate(0, 4, 3),
    dureeAnnees: 3,
    methode: 'non_amortissable',
    valeurResiduelle: 0,
    statut: 'actif',
    fournisseur: 'Electro Market',
    factureRef: 'FAC-EM-778',
    notes: '≤ 500 € HT — passage en charges (tolérance BOFiP)',
    faibleValeur: true,
    subventionInvestissement: 0,
  },
  {
    id: DEMO_IMMO_IDS.serveur,
    designation: 'Serveur NAS Synology (cédé)',
    reference: 'IT-2020-SRV',
    typeImmobilisation: 'materiel_informatique',
    valeurAcquisitionHT: 980,
    tauxTVA: 20,
    dateAcquisition: demoImmoDate(6, 5, 18),
    dateMiseEnService: demoImmoDate(6, 5, 20),
    dureeAnnees: 5,
    methode: 'lineaire',
    valeurResiduelle: 0,
    statut: 'cede',
    dateCession: demoImmoDate(0, 1, 15),
    valeurCession: 120,
    fournisseur: 'Synology Store',
    factureRef: 'FAC-SYN-102',
    notes: 'Cédé après renouvellement du parc',
    faibleValeur: false,
    subventionInvestissement: 0,
  },
];
