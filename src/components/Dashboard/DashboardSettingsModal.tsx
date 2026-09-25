import React from 'react';
import { useTranslation } from 'react-i18next';
import Modal from '../Common/Modal';
import {
  DashboardChartWidgets,
  DashboardSettings,
  DashboardSummaryWidgets,
  DonationsByDonorMode,
} from '../../types/dashboard';

interface DashboardSettingsModalProps {
  isOpen: boolean;
  settings: DashboardSettings;
  onChange: (settings: DashboardSettings) => void;
  onClose: () => void;
  onSave: () => void;
  saving: boolean;
}

const CHART_KEYS: Array<keyof DashboardChartWidgets> = [
  'expensesByCategory',
  'incomePie',
  'accountBalances',
  'invoiceVsPayment',
  'invoiceAging',
  'donationsByDonor',
  'amortissement',
];

const SUMMARY_KEYS: Array<keyof DashboardSummaryWidgets> = [
  'treasuryKpis',
  'invoicingKpis',
  'associationKpis',
  'contactKpis',
  'legalReminders',
  'miniCards',
  'topCategories',
];

const DashboardSettingsModal: React.FC<DashboardSettingsModalProps> = ({
  isOpen,
  settings,
  onChange,
  onClose,
  onSave,
  saving,
}) => {
  const { t } = useTranslation();

  const toggleChart = (key: keyof DashboardChartWidgets) => {
    onChange({
      ...settings,
      widgets: {
        ...settings.widgets,
        charts: { ...settings.widgets.charts, [key]: !settings.widgets.charts[key] },
      },
    });
  };

  const toggleSummary = (key: keyof DashboardSummaryWidgets) => {
    onChange({
      ...settings,
      widgets: {
        ...settings.widgets,
        summary: { ...settings.widgets.summary, [key]: !settings.widgets.summary[key] },
      },
    });
  };

  return (
    <Modal
      isOpen={isOpen}
      title={t('dashboard.settings.title')}
      onClose={onClose}
      maxWidth="640px"
      footer={(
        <>
          <button type="button" className="ct-btn-secondary" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="button" className="ct-btn-primary" onClick={onSave} disabled={saving}>
            {saving ? t('dashboard.settings.saving') : t('common.save')}
          </button>
        </>
      )}
    >
      <div className="dashboard-settings-grid">
        <section>
          <h3>{t('dashboard.settings.charts')}</h3>
          {CHART_KEYS.map((key) => (
            <label key={key} className={settings.widgets.charts[key] ? 'is-on' : ''}>
              <input
                type="checkbox"
                checked={settings.widgets.charts[key]}
                onChange={() => toggleChart(key)}
              />
              <span>{t(`dashboard.settings.widget.${key}`)}</span>
            </label>
          ))}
        </section>
        <section>
          <h3>{t('dashboard.settings.summary')}</h3>
          {SUMMARY_KEYS.map((key) => (
            <label key={key} className={settings.widgets.summary[key] ? 'is-on' : ''}>
              <input
                type="checkbox"
                checked={settings.widgets.summary[key]}
                onChange={() => toggleSummary(key)}
              />
              <span>{t(`dashboard.settings.widget.${key}`)}</span>
            </label>
          ))}
        </section>
      </div>
      <label className="dashboard-settings-mode">
        <span>{t('dashboard.settings.donationsMode')}</span>
        <select
          value={settings.donationsByDonorMode}
          onChange={(event) =>
            onChange({
              ...settings,
              donationsByDonorMode: event.target.value as DonationsByDonorMode,
            })
          }
        >
          <option value="cumulative">{t('dashboard.settings.modeCumulative')}</option>
          <option value="period">{t('dashboard.settings.modePeriod')}</option>
        </select>
      </label>
    </Modal>
  );
};

export default DashboardSettingsModal;
