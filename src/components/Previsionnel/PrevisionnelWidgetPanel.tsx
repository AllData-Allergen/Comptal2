import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronUp, Settings2 } from 'lucide-react';
import { ForecastComputed, ForecastWidgetLayout, ForecastWidgetType } from '../../types/forecast';
import { ChartGranularity } from '../../types/projection';
import PrevisionnelWidget from './PrevisionnelWidget';
import StatsSummaryWidget from './widgets/StatsSummaryWidget';
import BalanceEvolutionWidget from './widgets/BalanceEvolutionWidget';
import DebitCreditPieWidget from './widgets/DebitCreditPieWidget';
import CategoryBreakdownWidget from './widgets/CategoryBreakdownWidget';
import LineBreakdownWidget from './widgets/LineBreakdownWidget';
import CashFlowWidget from './widgets/CashFlowWidget';
import GroupBreakdownWidget from './widgets/GroupBreakdownWidget';

interface PrevisionnelWidgetPanelProps {
  layout: ForecastWidgetLayout;
  computed: ForecastComputed | null;
  customizeOpen: boolean;
  splitNonce?: number;
  onToggleCustomize: () => void;
  onChangeLayout: (layout: ForecastWidgetLayout) => void;
}

const WIDGET_LABELS: Record<ForecastWidgetType, string> = {
  stats: 'previsionnel.widgets.stats',
  balance: 'previsionnel.widgets.balance',
  debitCredit: 'previsionnel.widgets.debitCredit',
  category: 'previsionnel.widgets.category',
  lines: 'previsionnel.widgets.lines',
  cashflow: 'previsionnel.widgets.cashflow',
  groupBreakdown: 'previsionnel.widgets.groupBreakdown',
};

const WIDGET_DESCRIPTIONS: Record<ForecastWidgetType, string> = {
  stats: 'previsionnel.widgets.desc.stats',
  balance: 'previsionnel.widgets.desc.balance',
  debitCredit: 'previsionnel.widgets.desc.debitCredit',
  category: 'previsionnel.widgets.desc.category',
  lines: 'previsionnel.widgets.desc.lines',
  cashflow: 'previsionnel.widgets.desc.cashflow',
  groupBreakdown: 'previsionnel.widgets.desc.groupBreakdown',
};

const PrevisionnelWidgetPanel: React.FC<PrevisionnelWidgetPanelProps> = ({
  layout,
  computed,
  customizeOpen,
  splitNonce = 0,
  onToggleCustomize,
  onChangeLayout,
}) => {
  const { t } = useTranslation();
  const scrollRef = useRef<HTMLDivElement>(null);
  const ordered = [...layout.widgets].sort((a, b) => a.order - b.order);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      window.dispatchEvent(new Event('resize'));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [splitNonce]);

  const move = (id: string, dir: -1 | 1) => {
    const list = [...ordered];
    const idx = list.findIndex((w) => w.id === id);
    const next = idx + dir;
    if (idx < 0 || next < 0 || next >= list.length) return;
    const tmp = list[idx]!;
    list[idx] = list[next]!;
    list[next] = tmp;
    onChangeLayout({
      ...layout,
      widgets: list.map((w, i) => ({ ...w, order: i })),
    });
  };

  const toggle = (id: string, enabled: boolean) => {
    onChangeLayout({
      ...layout,
      widgets: layout.widgets.map((w) => (w.id === id ? { ...w, enabled } : w)),
    });
  };

  const setGranularity = (chartGranularity: ChartGranularity) => {
    onChangeLayout({ ...layout, chartGranularity });
  };

  const renderWidget = (type: ForecastWidgetType) => {
    if (!computed) return <p className="previsionnel-empty-chart">{t('previsionnel.noData')}</p>;
    switch (type) {
      case 'stats':
        return <StatsSummaryWidget stats={computed.stats} />;
      case 'balance':
        return <BalanceEvolutionWidget series={computed.balanceSeries} granularity={layout.chartGranularity} />;
      case 'debitCredit':
        return <DebitCreditPieWidget slices={computed.debitCredit} />;
      case 'category':
        return (
          <CategoryBreakdownWidget
            slices={computed.categories}
            details={computed.categoryDetails}
          />
        );
      case 'lines':
        return <LineBreakdownWidget slices={computed.lines} />;
      case 'cashflow':
        return (
          <CashFlowWidget
            aggregates={computed.aggregates}
            granularity={layout.chartGranularity}
          />
        );
      case 'groupBreakdown':
        return (
          <GroupBreakdownWidget slices={computed.groups} details={computed.groupDetails} />
        );
    }
  };

  return (
    <aside className="previsionnel-widgets">
      <div className="previsionnel-widgets-toolbar">
        <h2>{t('previsionnel.chartsTitle')}</h2>
        <button type="button" className="ct-btn-secondary previsionnel-sm-btn" onClick={onToggleCustomize}>
          <Settings2 size={14} />
          {t('previsionnel.customize')}
        </button>
      </div>

      {customizeOpen && (
        <div className="previsionnel-customize">
          <label className="previsionnel-field">
            <span>{t('previsionnel.granularity')}</span>
            <select
              className="ct-select"
              value={layout.chartGranularity}
              onChange={(e) => setGranularity(e.target.value as ChartGranularity)}
            >
              {(['day', 'week', 'month', 'quarter', 'semester', 'year'] as ChartGranularity[]).map((g) => (
                <option key={g} value={g}>
                  {t(`finance.gran.${g}`)}
                </option>
              ))}
            </select>
          </label>
          <ul className="previsionnel-widget-list">
            {ordered.map((w, i) => (
              <li key={w.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={w.enabled}
                    onChange={(e) => toggle(w.id, e.target.checked)}
                  />
                  <span className="previsionnel-widget-list-meta">
                    <strong>{t(WIDGET_LABELS[w.type])}</strong>
                    <span>{t(WIDGET_DESCRIPTIONS[w.type])}</span>
                  </span>
                </label>
                <span className="previsionnel-reorder">
                  <button type="button" disabled={i === 0} onClick={() => move(w.id, -1)}>
                    <ChevronUp size={14} />
                  </button>
                  <button type="button" disabled={i === ordered.length - 1} onClick={() => move(w.id, 1)}>
                    <ChevronDown size={14} />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="previsionnel-widgets-scroll" ref={scrollRef}>
        {ordered
          .filter((w) => w.enabled)
          .map((w) => (
            <PrevisionnelWidget
              key={`${w.id}-${splitNonce}`}
              title={t(WIDGET_LABELS[w.type])}
              description={t(WIDGET_DESCRIPTIONS[w.type])}
              widgetType={w.type}
              onRemove={() => toggle(w.id, false)}
            >
              {renderWidget(w.type)}
            </PrevisionnelWidget>
          ))}
      </div>
    </aside>
  );
};

export default PrevisionnelWidgetPanel;
