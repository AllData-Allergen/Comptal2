import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import {
  AmortissementSettings,
  DEFAULT_DUREES_PAR_TYPE,
  TYPE_IMMOBILISATION_LIST,
} from '../../types/amortissement';
import { AmortissementService } from '../../services/AmortissementService';
import { Logger } from '../../services/logger';

interface AmortissementSettingsPanelProps {
  settings: AmortissementSettings;
  onSaved: (settings: AmortissementSettings) => void;
}

const AmortissementSettingsPanel: React.FC<AmortissementSettingsPanelProps> = ({ settings, onSaved }) => {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(settings);
  const [busy, setBusy] = useState(false);

  React.useEffect(() => {
    setDraft(settings);
  }, [settings]);

  const save = async () => {
    setBusy(true);
    try {
      const next = await AmortissementService.saveSettings(draft);
      onSaved(next);
      toast.success(t('amortissement.saved'));
    } catch (err) {
      Logger.error('AmortissementSettingsPanel.save', err);
      toast.error(t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  const resetBareme = () => {
    setDraft((prev) => ({ ...prev, dureesParType: { ...DEFAULT_DUREES_PAR_TYPE } }));
  };

  return (
    <div className="ct-card" style={{ padding: '1rem' }}>
      <h2 style={{ marginTop: 0 }}>{t('amortissement.settingsTitle')}</h2>
      <div className="amortissement-settings-grid" style={{ marginBottom: '1rem' }}>
        <div className="amortissement-field">
          <label>{t('amortissement.lowValueThreshold')}</label>
          <input
            type="number"
            min={0}
            value={draft.seuilFaibleValeur}
            onChange={(e) =>
              setDraft((prev) => ({ ...prev, seuilFaibleValeur: Number(e.target.value) || 0 }))
            }
          />
        </div>
        <div className="amortissement-field">
          <label>{t('amortissement.defaultMethod')}</label>
          <select
            value={draft.methodeDefaut}
            onChange={(e) =>
              setDraft((prev) => ({
                ...prev,
                methodeDefaut: e.target.value as AmortissementSettings['methodeDefaut'],
              }))
            }
          >
            <option value="lineaire">{t('amortissement.methods.lineaire')}</option>
            <option value="degressif">{t('amortissement.methods.degressif')}</option>
            <option value="non_amortissable">{t('amortissement.methods.non_amortissable')}</option>
          </select>
        </div>
        <div className="amortissement-field" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            id="prorata"
            type="checkbox"
            checked={draft.prorataMensuel}
            onChange={(e) => setDraft((prev) => ({ ...prev, prorataMensuel: e.target.checked }))}
          />
          <label htmlFor="prorata" style={{ margin: 0 }}>
            {t('amortissement.monthlyProrata')}
          </label>
        </div>
      </div>

      <h3>{t('amortissement.durationSchedule')}</h3>
      <p style={{ fontSize: '0.85rem', color: 'var(--invoicing-gray-600)' }}>
        {t('amortissement.durationScheduleHint')}
      </p>
      <div className="amortissement-settings-grid">
        {TYPE_IMMOBILISATION_LIST.map((type) => (
          <div key={type} className="amortissement-field">
            <label>{t(`amortissement.types.${type}`)}</label>
            <input
              type="number"
              min={1}
              step="0.5"
              value={draft.dureesParType[type]}
              onChange={(e) =>
                setDraft((prev) => ({
                  ...prev,
                  dureesParType: {
                    ...prev.dureesParType,
                    [type]: Number(e.target.value) || 1,
                  },
                }))
              }
            />
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: '1rem' }}>
        <button type="button" className="ct-btn-secondary" onClick={resetBareme}>
          {t('amortissement.resetSchedule')}
        </button>
        <button type="button" className="ct-btn-primary" onClick={() => void save()} disabled={busy}>
          {t('common.save')}
        </button>
      </div>
    </div>
  );
};

export default AmortissementSettingsPanel;
