import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  AreaChart,
  BarChart3,
  FileText,
  Handshake,
  Landmark,
  LineChart,
  Scale,
  Users,
} from 'lucide-react';
import { FINANCE_TAB_I18N, FinanceTabConfig, FinanceTabId } from '../../types/finance';

export type FinanceTab = FinanceTabId;

interface ChartTabsProps {
  tabs: FinanceTabConfig[];
  active: FinanceTabId;
  onChange: (tab: FinanceTabId) => void;
}

const TAB_ICONS: Record<FinanceTabId, React.ReactNode> = {
  monthly: <LineChart size={16} />,
  balance: <AreaChart size={16} />,
  projection: <BarChart3 size={16} />,
  bilan: <Scale size={16} />,
  facturation: <FileText size={16} />,
  dons: <Handshake size={16} />,
  contacts: <Users size={16} />,
  amortissement: <Landmark size={16} />,
};

const ChartTabs: React.FC<ChartTabsProps> = ({ tabs, active, onChange }) => {
  const { t } = useTranslation();
  const visible = [...tabs].filter((tab) => tab.visible).sort((a, b) => a.order - b.order);

  return (
    <div className="chart-tabs-container">
      <div className="chart-tabs">
        {visible.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`chart-tab ${active === tab.id ? 'active' : ''}`}
            onClick={() => onChange(tab.id)}
          >
            {TAB_ICONS[tab.id]}
            {t(FINANCE_TAB_I18N[tab.id])}
          </button>
        ))}
      </div>
    </div>
  );
};

export default ChartTabs;
