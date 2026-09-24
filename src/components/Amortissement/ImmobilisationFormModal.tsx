import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import Modal from '../Common/Modal';
import {
  Immobilisation,
  MethodeAmortissement,
  StatutImmobilisation,
  TYPE_IMMOBILISATION_LIST,
  TypeImmobilisation,
} from '../../types/amortissement';
import { AmortissementService } from '../../services/AmortissementService';
import { Logger } from '../../services/logger';

interface ImmobilisationFormModalProps {
  isOpen: boolean;
  initial: Immobilisation | null;
  onClose: () => void;
  onSaved: () => void;
}

const TODAY = new Date().toISOString().slice(0, 10);
const NOTES_MAX = 2000;

const ImmobilisationFormModal: React.FC<ImmobilisationFormModalProps> = ({
  isOpen,
  initial,
  onClose,
  onSaved,
}) => {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [designation, setDesignation] = useState('');
  const [reference, setReference] = useState('');
  const [typeImmobilisation, setTypeImmobilisation] = useState<TypeImmobilisation>('materiel_informatique');
  const [valeurAcquisitionHT, setValeurAcquisitionHT] = useState('0');
  const [tauxTVA, setTauxTVA] = useState('20');
  const [dateAcquisition, setDateAcquisition] = useState(TODAY);
  const [dateMiseEnService, setDateMiseEnService] = useState(TODAY);
  const [dureeAnnees, setDureeAnnees] = useState('3');
  const [methode, setMethode] = useState<MethodeAmortissement>('lineaire');
  const [valeurResiduelle, setValeurResiduelle] = useState('0');
  const [statut, setStatut] = useState<StatutImmobilisation>('actif');
  const [dateCession, setDateCession] = useState('');
  const [valeurCession, setValeurCession] = useState('');
  const [fournisseur, setFournisseur] = useState('');
  const [factureRef, setFactureRef] = useState('');
  const [notes, setNotes] = useState('');
  const [faibleValeur, setFaibleValeur] = useState(false);
  const [subvention, setSubvention] = useState('0');

  useEffect(() => {
    if (!isOpen) return;
    void (async () => {
      const settings = await AmortissementService.getSettings();
      if (initial) {
        setDesignation(initial.designation);
        setReference(initial.reference ?? '');
        setTypeImmobilisation(initial.typeImmobilisation);
        setValeurAcquisitionHT(String(initial.valeurAcquisitionHT));
        setTauxTVA(String(initial.tauxTVA));
        setDateAcquisition(initial.dateAcquisition);
        setDateMiseEnService(initial.dateMiseEnService);
        setDureeAnnees(String(initial.dureeAnnees));
        setMethode(initial.methode);
        setValeurResiduelle(String(initial.valeurResiduelle));
        setStatut(initial.statut);
        setDateCession(initial.dateCession ?? '');
        setValeurCession(initial.valeurCession != null ? String(initial.valeurCession) : '');
        setFournisseur(initial.fournisseur ?? '');
        setFactureRef(initial.factureRef ?? '');
        setNotes(initial.notes ?? '');
        setFaibleValeur(initial.faibleValeur);
        setSubvention(String(initial.subventionInvestissement));
      } else {
        setDesignation('');
        setReference('');
        setTypeImmobilisation('materiel_informatique');
        setValeurAcquisitionHT('0');
        setTauxTVA('20');
        setDateAcquisition(TODAY);
        setDateMiseEnService(TODAY);
        setDureeAnnees(String(settings.dureesParType.materiel_informatique));
        setMethode(settings.methodeDefaut);
        setValeurResiduelle('0');
        setStatut('actif');
        setDateCession('');
        setValeurCession('');
        setFournisseur('');
        setFactureRef('');
        setNotes('');
        setFaibleValeur(false);
        setSubvention('0');
      }
    })();
  }, [initial, isOpen]);

  const handleTypeChange = async (type: TypeImmobilisation) => {
    setTypeImmobilisation(type);
    if (!initial) {
      const settings = await AmortissementService.getSettings();
      setDureeAnnees(String(settings.dureesParType[type]));
    }
  };

  const handleSave = async () => {
    setBusy(true);
    try {
      await AmortissementService.save({
        id: initial?.id,
        designation,
        reference: reference || undefined,
        typeImmobilisation,
        valeurAcquisitionHT: Number(valeurAcquisitionHT) || 0,
        tauxTVA: Number(tauxTVA) || 0,
        dateAcquisition,
        dateMiseEnService,
        dureeAnnees: Number(dureeAnnees) || 1,
        methode,
        valeurResiduelle: Number(valeurResiduelle) || 0,
        statut,
        dateCession: dateCession || undefined,
        valeurCession: valeurCession !== '' ? Number(valeurCession) : undefined,
        fournisseur: fournisseur || undefined,
        factureRef: factureRef || undefined,
        notes: notes.trim() || undefined,
        faibleValeur,
        subventionInvestissement: Number(subvention) || 0,
      });
      onSaved();
      onClose();
    } catch (err) {
      Logger.error('ImmobilisationFormModal.save', err);
      toast.error(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  const notesLen = notes.length;

  return (
    <Modal
      isOpen={isOpen}
      title={initial ? t('amortissement.editAsset') : t('amortissement.addAsset')}
      onClose={onClose}
      maxWidth="880px"
      footer={(
        <>
          <button type="button" className="ct-btn-secondary" onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </button>
          <button type="button" className="ct-btn-primary" onClick={() => void handleSave()} disabled={busy}>
            {t('common.save')}
          </button>
        </>
      )}
    >
      <div className="amortissement-form">
        <section className="amortissement-form-section">
          <h3 className="amortissement-form-section-title">{t('amortissement.form.identity')}</h3>
          <div className="amortissement-form-grid">
            <div className="amortissement-field full">
              <label htmlFor="immo-designation">{t('amortissement.designation')}</label>
              <input
                id="immo-designation"
                value={designation}
                onChange={(e) => setDesignation(e.target.value)}
                autoFocus
              />
            </div>
            <div className="amortissement-field">
              <label htmlFor="immo-ref">{t('amortissement.reference')}</label>
              <input id="immo-ref" value={reference} onChange={(e) => setReference(e.target.value)} />
            </div>
            <div className="amortissement-field">
              <label htmlFor="immo-type">{t('amortissement.type')}</label>
              <select
                id="immo-type"
                value={typeImmobilisation}
                onChange={(e) => void handleTypeChange(e.target.value as TypeImmobilisation)}
              >
                {TYPE_IMMOBILISATION_LIST.map((type) => (
                  <option key={type} value={type}>
                    {t(`amortissement.types.${type}`)}
                  </option>
                ))}
              </select>
            </div>
            <div className="amortissement-field">
              <label htmlFor="immo-supplier">{t('amortissement.supplier')}</label>
              <input id="immo-supplier" value={fournisseur} onChange={(e) => setFournisseur(e.target.value)} />
            </div>
            <div className="amortissement-field">
              <label htmlFor="immo-invoice">{t('amortissement.invoiceRef')}</label>
              <input id="immo-invoice" value={factureRef} onChange={(e) => setFactureRef(e.target.value)} />
            </div>
          </div>
        </section>

        <section className="amortissement-form-section">
          <h3 className="amortissement-form-section-title">{t('amortissement.form.values')}</h3>
          <div className="amortissement-form-grid">
            <div className="amortissement-field">
              <label htmlFor="immo-ht">{t('amortissement.amountHT')}</label>
              <input
                id="immo-ht"
                type="number"
                min={0}
                step="0.01"
                value={valeurAcquisitionHT}
                onChange={(e) => setValeurAcquisitionHT(e.target.value)}
              />
            </div>
            <div className="amortissement-field">
              <label htmlFor="immo-tva">{t('amortissement.vatRate')}</label>
              <input
                id="immo-tva"
                type="number"
                min={0}
                step="0.1"
                value={tauxTVA}
                onChange={(e) => setTauxTVA(e.target.value)}
              />
            </div>
            <div className="amortissement-field">
              <label htmlFor="immo-acq">{t('amortissement.acquisitionDate')}</label>
              <input
                id="immo-acq"
                type="date"
                value={dateAcquisition}
                onChange={(e) => {
                  setDateAcquisition(e.target.value);
                  if (!initial) setDateMiseEnService(e.target.value);
                }}
              />
            </div>
            <div className="amortissement-field">
              <label htmlFor="immo-mes">{t('amortissement.serviceDate')}</label>
              <input
                id="immo-mes"
                type="date"
                value={dateMiseEnService}
                onChange={(e) => setDateMiseEnService(e.target.value)}
              />
            </div>
            <div className="amortissement-field">
              <label htmlFor="immo-grant">{t('amortissement.grant')}</label>
              <input
                id="immo-grant"
                type="number"
                min={0}
                step="0.01"
                value={subvention}
                onChange={(e) => setSubvention(e.target.value)}
              />
            </div>
            <div className="amortissement-field amortissement-field-check">
              <input
                id="faible-valeur"
                type="checkbox"
                checked={faibleValeur}
                onChange={(e) => {
                  setFaibleValeur(e.target.checked);
                  if (e.target.checked) setMethode('non_amortissable');
                }}
              />
              <label htmlFor="faible-valeur">{t('amortissement.lowValue')}</label>
            </div>
          </div>
        </section>

        <section className="amortissement-form-section">
          <h3 className="amortissement-form-section-title">{t('amortissement.form.depreciation')}</h3>
          <div className="amortissement-form-grid">
            <div className="amortissement-field">
              <label htmlFor="immo-duree">{t('amortissement.duration')}</label>
              <input
                id="immo-duree"
                type="number"
                min={1}
                step="0.5"
                value={dureeAnnees}
                onChange={(e) => setDureeAnnees(e.target.value)}
                disabled={faibleValeur}
              />
            </div>
            <div className="amortissement-field">
              <label htmlFor="immo-methode">{t('amortissement.method')}</label>
              <select
                id="immo-methode"
                value={methode}
                onChange={(e) => setMethode(e.target.value as MethodeAmortissement)}
                disabled={faibleValeur}
              >
                <option value="lineaire">{t('amortissement.methods.lineaire')}</option>
                <option value="degressif">{t('amortissement.methods.degressif')}</option>
                <option value="non_amortissable">{t('amortissement.methods.non_amortissable')}</option>
              </select>
            </div>
            <div className="amortissement-field">
              <label htmlFor="immo-vr">{t('amortissement.residualValue')}</label>
              <input
                id="immo-vr"
                type="number"
                min={0}
                step="0.01"
                value={valeurResiduelle}
                onChange={(e) => setValeurResiduelle(e.target.value)}
                disabled={faibleValeur}
              />
            </div>
            <div className="amortissement-field">
              <label htmlFor="immo-statut">{t('amortissement.status')}</label>
              <select
                id="immo-statut"
                value={statut}
                onChange={(e) => setStatut(e.target.value as StatutImmobilisation)}
              >
                <option value="actif">{t('amortissement.statuses.actif')}</option>
                <option value="cede">{t('amortissement.statuses.cede')}</option>
                <option value="mis_au_rebut">{t('amortissement.statuses.mis_au_rebut')}</option>
              </select>
            </div>
            {statut !== 'actif' && (
              <>
                <div className="amortissement-field">
                  <label htmlFor="immo-cession-date">{t('amortissement.cessionDate')}</label>
                  <input
                    id="immo-cession-date"
                    type="date"
                    value={dateCession}
                    onChange={(e) => setDateCession(e.target.value)}
                  />
                </div>
                <div className="amortissement-field">
                  <label htmlFor="immo-cession-val">{t('amortissement.cessionValue')}</label>
                  <input
                    id="immo-cession-val"
                    type="number"
                    min={0}
                    step="0.01"
                    value={valeurCession}
                    onChange={(e) => setValeurCession(e.target.value)}
                  />
                </div>
              </>
            )}
          </div>
        </section>

        <section className="amortissement-form-section amortissement-form-notes">
          <div className="amortissement-notes-head">
            <h3 className="amortissement-form-section-title">{t('amortissement.notes')}</h3>
            <span className={`amortissement-notes-count${notesLen > NOTES_MAX ? ' is-over' : ''}`}>
              {notesLen}/{NOTES_MAX}
            </span>
          </div>
          <p className="amortissement-notes-hint">{t('amortissement.notesHint')}</p>
          <textarea
            className="amortissement-notes-textarea"
            value={notes}
            maxLength={NOTES_MAX}
            rows={6}
            placeholder={t('amortissement.notesPlaceholder')}
            onChange={(e) => setNotes(e.target.value)}
          />
        </section>
      </div>
    </Modal>
  );
};

export default ImmobilisationFormModal;
