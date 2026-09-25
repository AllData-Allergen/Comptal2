import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import { Plus, Trash2 } from 'lucide-react';
import { PosteFacture, PosteGroupe, PosteMateriel, PosteTravail, SecteurActivite } from '../../types/invoice';
import { PosteAssociationService, PosteService } from '../../services/PosteService';
import { SecteurService } from '../../services/SecteurService';
import { newEntityId } from '../../utils/invoiceFormat';
import { Logger } from '../../services/logger';
import ConfirmModal from '../Common/ConfirmModal';
import HoursInput from './HoursInput';

interface PostesPanelProps {
  kind: 'facturation' | 'association';
}

const emptyMateriel = (): PosteMateriel => ({
  id: newEntityId('poste'),
  type: 'materiel',
  designation: '',
  prixUnitaireHT: 0,
  tauxTVA: 20,
  quantite: 1,
  unite: 'unite',
});

const emptyTravail = (): PosteTravail => ({
  id: newEntityId('poste'),
  type: 'travail',
  designation: '',
  tauxHoraire: 0,
  heuresEstimees: 1,
  nombreIntervenants: 1,
  tauxTVA: 20,
});

const PostesPanel: React.FC<PostesPanelProps> = ({ kind }) => {
  const { t } = useTranslation();
  const store = kind === 'association' ? PosteAssociationService : PosteService;
  const [postes, setPostes] = useState<PosteFacture[]>([]);
  const [groupes, setGroupes] = useState<PosteGroupe[]>([]);
  const [secteurs, setSecteurs] = useState<SecteurActivite[]>([]);
  const [editing, setEditing] = useState<PosteFacture | null>(null);
  const [groupeNom, setGroupeNom] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [secteurNom, setSecteurNom] = useState('');

  const reload = useCallback(async () => {
    setPostes(await store.loadPostes());
    setGroupes(await store.loadPostesGroupes());
    if (kind === 'facturation') setSecteurs(await SecteurService.loadSecteurs());
  }, [kind, store]);

  useEffect(() => {
    void reload().catch((err) => Logger.error('PostesPanel.load', err));
  }, [reload]);

  const savePoste = async () => {
    if (!editing || !editing.designation.trim()) return;
    const exists = postes.some((p) => p.id === editing.id);
    try {
      if (exists) await store.updatePoste(editing.id, editing);
      else await store.addPoste(editing);
      setEditing(null);
      await reload();
      window.dispatchEvent(new Event('postes-updated'));
      toast.success(t('common.save'));
    } catch (err) {
      Logger.error('PostesPanel.save', err);
      toast.error(t('common.error'));
    }
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    await store.deletePoste(deleteId);
    setDeleteId(null);
    await reload();
  };

  const addGroupe = async () => {
    if (!groupeNom.trim()) return;
    await store.savePosteGroupe({
      id: newEntityId('grp'),
      type: 'groupe',
      nom: groupeNom.trim(),
      postes: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    setGroupeNom('');
    await reload();
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="inv-toolbar">
        <button type="button" className="ct-btn-primary" onClick={() => setEditing(emptyMateriel())}>
          <Plus size={16} /> {t('facturation.posteMateriel')}
        </button>
        <button type="button" className="ct-btn-secondary" onClick={() => setEditing(emptyTravail())}>
          <Plus size={16} /> {t('facturation.posteTravail')}
        </button>
      </div>

      {editing && (
        <div className="ct-card">
          <h3 className="org-section-title">{editing.type === 'materiel' ? t('facturation.posteMateriel') : t('facturation.posteTravail')}</h3>
          <div className="org-grid">
            <label className="org-field full">
              <span>{t('facturation.designation')}</span>
              <input
                value={editing.designation}
                onChange={(e) => setEditing({ ...editing, designation: e.target.value })}
              />
            </label>
            {editing.type === 'materiel' ? (
              <>
                <label className="org-field">
                  <span>{t('facturation.prixHT')}</span>
                  <input
                    type="number"
                    value={editing.prixUnitaireHT}
                    onChange={(e) => setEditing({ ...editing, prixUnitaireHT: Number(e.target.value) })}
                  />
                </label>
                <label className="org-field">
                  <span>{t('facturation.qty')}</span>
                  <input
                    type="number"
                    value={editing.quantite}
                    onChange={(e) => setEditing({ ...editing, quantite: Number(e.target.value) })}
                  />
                </label>
                <label className="org-field">
                  <span>{t('facturation.unite')}</span>
                  <select
                    value={editing.unite}
                    onChange={(e) => setEditing({ ...editing, unite: e.target.value })}
                  >
                    <option value="unite">{t('facturation.units.unit')}</option>
                    <option value="h">{t('facturation.units.hour')}</option>
                    <option value="forfait">{t('facturation.units.flatRate')}</option>
                    <option value="m2">{t('facturation.units.squareMeter')}</option>
                    <option value="kg">{t('facturation.units.kilogram')}</option>
                  </select>
                </label>
              </>
            ) : (
              <>
                <label className="org-field">
                  <span>{t('facturation.tauxHoraire')}</span>
                  <input
                    type="number"
                    value={editing.tauxHoraire}
                    onChange={(e) => setEditing({ ...editing, tauxHoraire: Number(e.target.value) })}
                  />
                </label>
                <label className="org-field">
                  <span>{t('facturation.heures')}</span>
                  <HoursInput
                    value={editing.heuresEstimees}
                    onChange={(heuresEstimees) => setEditing({ ...editing, heuresEstimees })}
                  />
                </label>
                <label className="org-field">
                  <span>{t('facturation.intervenants')}</span>
                  <input
                    type="number"
                    value={editing.nombreIntervenants}
                    onChange={(e) =>
                      setEditing({ ...editing, nombreIntervenants: Number(e.target.value) })
                    }
                  />
                </label>
              </>
            )}
            <label className="org-field">
              <span>{t('facturation.vatRate')}</span>
              <input
                type="number"
                value={editing.tauxTVA}
                onChange={(e) => setEditing({ ...editing, tauxTVA: Number(e.target.value) })}
              />
            </label>
          </div>
          <div className="flex gap-2 mt-3">
            <button type="button" className="ct-btn-primary" onClick={() => void savePoste()}>
              {t('common.save')}
            </button>
            <button type="button" className="ct-btn-secondary" onClick={() => setEditing(null)}>
              {t('common.cancel')}
            </button>
          </div>
        </div>
      )}

      <div className="inv-list">
        {postes.length === 0 && <div className="inv-empty">{t('facturation.noPostes')}</div>}
        {postes.map((poste) => (
          <div key={poste.id} className="inv-poste-card flex justify-between gap-3">
            <div>
              <div className="inv-row-title">{poste.designation}</div>
              <div className="inv-row-meta" style={{ marginLeft: 0 }}>
                {t(`facturation.posteTypes.${poste.type}`)} · {t('facturation.vatRate')} {poste.tauxTVA}%
              </div>
            </div>
            <div className="flex gap-2">
              <button type="button" className="ct-btn-secondary" onClick={() => setEditing(poste)}>
                {t('common.edit')}
              </button>
              <button type="button" className="ct-btn-danger" onClick={() => setDeleteId(poste.id)}>
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="ct-card">
        <h3 className="org-section-title">{t('facturation.groupes')}</h3>
        <div className="flex gap-2 mb-3">
          <input
            className="inv-search flex-1"
            value={groupeNom}
            onChange={(e) => setGroupeNom(e.target.value)}
            placeholder={t('facturation.groupeNom')}
          />
          <button type="button" className="ct-btn-secondary" onClick={() => void addGroupe()}>
            {t('common.add')}
          </button>
        </div>
        {groupes.map((g) => (
          <div key={g.id} className="inv-poste-card mb-2 flex justify-between">
            <span>{g.nom}</span>
            <button
              type="button"
              className="ct-btn-danger"
              onClick={() => void store.deletePosteGroupe(g.id).then(reload)}
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>

      {kind === 'facturation' && (
        <div className="ct-card">
          <h3 className="org-section-title">{t('facturation.secteurs')}</h3>
          <div className="flex gap-2 mb-3">
            <input
              className="inv-search flex-1"
              value={secteurNom}
              onChange={(e) => setSecteurNom(e.target.value)}
              placeholder={t('facturation.secteurNom')}
            />
            <button
              type="button"
              className="ct-btn-secondary"
              onClick={() => {
                if (!secteurNom.trim()) return;
                void SecteurService.addSecteur(secteurNom.trim()).then(() => {
                  setSecteurNom('');
                  return reload();
                });
              }}
            >
              {t('common.add')}
            </button>
          </div>
          {secteurs.map((s) => (
            <div key={s.id} className="flex justify-between py-1 text-sm">
              <span>{s.nom}</span>
              <button
                type="button"
                className="ct-btn-danger"
                onClick={() => void SecteurService.deleteSecteur(s.id).then(reload)}
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      <ConfirmModal
        isOpen={Boolean(deleteId)}
        title={t('common.delete')}
        message={t('facturation.deletePoste')}
        onCancel={() => setDeleteId(null)}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
};

export default PostesPanel;
