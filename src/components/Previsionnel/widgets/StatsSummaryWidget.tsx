import React from 'react';
import { useTranslation } from 'react-i18next';
import { ProjectionStats } from '../../../types/forecast';
import { formatMoney } from '../../../utils/amounts';

interface StatsSummaryWidgetProps {
  stats: ProjectionStats;
}

/** Cartes KPI : totaux débits / crédits / flux net / solde final. */
const StatsSummaryWidget: React.FC<StatsSummaryWidgetProps> = ({ stats }) => {
  const { t } = useTranslation();
  const items = [
    { key: 'debits', label: t('previsionnel.stats.debits'), value: stats.totalDebits, tone: 'debit' },
    { key: 'credits', label: t('previsionnel.stats.credits'), value: stats.totalCredits, tone: 'credit' },
    { key: 'net', label: t('previsionnel.stats.netFlow'), value: stats.netFlow, tone: stats.netFlow >= 0 ? 'credit' : 'debit' },
    { key: 'final', label: t('previsionnel.stats.finalBalance'), value: stats.finalBalance, tone: stats.finalBalance >= 0 ? 'credit' : 'debit' },
  ];

  return (
    <div className="previsionnel-stats-grid">
      {items.map((item) => (
        <div key={item.key} className="previsionnel-stat-card">
          <span>{item.label}</span>
          <strong className={`previsionnel-stat-${item.tone}`}>{formatMoney(item.value)}</strong>
        </div>
      ))}
    </div>
  );
};

export default StatsSummaryWidget;
