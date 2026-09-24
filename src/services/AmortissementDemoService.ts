import { DEMO_IMMOBILISATIONS, DEMO_IMMO_IDS } from '../constants/amortissementDemo';
import { AmortissementService } from './AmortissementService';
import { withLog } from './logger';

export const AmortissementDemoService = {
  async hasExampleData(): Promise<boolean> {
    const existing = await AmortissementService.getById(DEMO_IMMO_IDS.pcPortable);
    return Boolean(existing);
  },

  async seed(): Promise<{ count: number }> {
    return withLog('AmortissementDemoService.seed', async () => {
      let count = 0;
      for (const asset of DEMO_IMMOBILISATIONS) {
        await AmortissementService.save({
          id: asset.id,
          designation: asset.designation,
          reference: asset.reference,
          typeImmobilisation: asset.typeImmobilisation,
          valeurAcquisitionHT: asset.valeurAcquisitionHT,
          tauxTVA: asset.tauxTVA,
          dateAcquisition: asset.dateAcquisition,
          dateMiseEnService: asset.dateMiseEnService,
          dureeAnnees: asset.dureeAnnees,
          methode: asset.methode,
          valeurResiduelle: asset.valeurResiduelle,
          statut: asset.statut,
          dateCession: asset.dateCession,
          valeurCession: asset.valeurCession,
          fournisseur: asset.fournisseur,
          factureRef: asset.factureRef,
          notes: asset.notes,
          faibleValeur: asset.faibleValeur,
          subventionInvestissement: asset.subventionInvestissement,
        });
        count += 1;
      }
      return { count };
    });
  },
};
