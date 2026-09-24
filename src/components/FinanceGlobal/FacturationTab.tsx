import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Bar, Line } from 'react-chartjs-2';
import { ChartOptions } from 'chart.js';
import { InvoicingInsights } from '../../types/dashboard';
import { formatMoney } from '../../utils/amounts';
import { useTheme } from '../../hooks/useTheme';
import {
  chartAxisColor,
  chartGridColor,
  chartPastelNamed,
  chartTooltipTheme,
} from '../../utils/chartPastel';
import '../../utils/registerCharts';
import FinanceInsightKpis from './FinanceInsightKpis';
import FinanceExcelExportButton from './FinanceExcelExportButton';
import { ChartGranularity } from '../../types/projection';
import { periodXTicks } from '../../utils/chartPeriodAxis';
import ScrollablePeriodChart from '../Common/ScrollablePeriodChart';

interface FacturationTabProps {
  data: InvoicingInsights;
  granularity: ChartGranularity;
}

const AGING_KEYS = ['current', 'd1to30', 'd31to60', 'd61to90', 'd90plus'] as const;
const AGING_PASTELS = ['green', 'blue', 'yellow', 'orange', 'red'] as const;

const FacturationTab: React.FC<FacturationTabProps> = ({ data, granularity }) => {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const axis = chartAxisColor(isDark);
  const grid = chartGridColor(isDark);
  const tooltip = chartTooltipTheme(isDark);
  const invoicedColor = chartPastelNamed('blue');
  const collectedColor = chartPastelNamed('green');

  const lineData = useMemo(
    () => ({
      labels: data.series.labels,
      datasets: [
        {
          label: t('dashboard.invoicing.invoiced'),
          data: data.series.invoiced,
          borderColor: invoicedColor,
          backgroundColor: invoicedColor,
          tension: 0.3,
          pointRadius: 3,
        },
        {
          label: t('dashboard.invoicing.collected'),
          data: data.series.collected,
          borderColor: collectedColor,
          backgroundColor: collectedColor,
          tension: 0.3,
          pointRadius: 3,
        },
      ],
    }),
    [data.series, invoicedColor, collectedColor, t]
  );

  const lineOptions: ChartOptions<'line'> = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { color: axis, boxWidth: 12, font: { size: 11 } } },
        tooltip: {
          ...tooltip,
          callbacks: {
            label(ctx) {
              const value = Number(ctx.parsed.y ?? 0);
              const index = ctx.dataIndex;
              const invoiced = data.series.invoiced[index] ?? 0;
              const collected = data.series.collected[index] ?? 0;
              const rate = invoiced > 0 ? ((collected / invoiced) * 100).toFixed(1) : '0';
              return `${ctx.dataset.label} : ${formatMoney(value)} (${rate} % ${t('financeGlobal.collectedShare')})`;
            },
          },
        },
      },
      scales: {
        x: { ticks: { ...periodXTicks(granularity, axis) }, grid: { color: grid } },
        y: {
          beginAtZero: true,
          ticks: { color: axis, callback: (value) => formatMoney(Number(value)) },
          grid: { color: grid },
        },
      },
    }),
    [axis, grid, tooltip, data.series, t, granularity]
  );

  const agingTotal =
    data.aging.current + data.aging.d1to30 + data.aging.d31to60 + data.aging.d61to90 + data.aging.d90plus;
  const agingData = useMemo(
    () => ({
      labels: AGING_KEYS.map((key) => t(`dashboard.invoicing.aging.${key}`)),
      datasets: [
        {
          data: AGING_KEYS.map((key) => data.aging[key]),
          backgroundColor: AGING_PASTELS.map((name) => chartPastelNamed(name)),
          borderRadius: 4,
        },
      ],
    }),
    [data.aging, t, isDark]
  );

  const agingOptions: ChartOptions<'bar'> = useMemo(
    () => ({
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          ...tooltip,
          callbacks: {
            label(ctx) {
              const value = Number(ctx.parsed.x ?? 0);
              const pct = agingTotal > 0 ? ((value / agingTotal) * 100).toFixed(1) : '0';
              return `${ctx.label} : ${formatMoney(value)} (${pct} %)`;
            },
          },
        },
      },
      scales: {
        x: {
          beginAtZero: true,
          ticks: { color: axis, callback: (value) => formatMoney(Number(value)) },
          grid: { color: grid },
        },
        y: { ticks: { color: axis }, grid: { display: false } },
      },
    }),
    [axis, grid, tooltip, agingTotal]
  );

  const hasSeries =
    data.series.labels.length > 0 &&
    (data.series.invoiced.some((value) => value > 0) || data.series.collected.some((value) => value > 0));

  const exportRows = useMemo(() => {
    const seriesRows = data.series.labels.map((label, i) => [
      label,
      data.series.invoiced[i] ?? 0,
      data.series.collected[i] ?? 0,
    ]);
    const agingRows = AGING_KEYS.map((key) => [
      t(`dashboard.invoicing.aging.${key}`),
      data.aging[key] ?? 0,
    ]);
    return {
      series: seriesRows,
      aging: agingRows,
    };
  }, [data, t]);

  return (
    <div className="finance-insight-tab">
      <FinanceExcelExportButton
        fileName="finance_facturation"
        sheetName={t('financeGlobal.facturationTab')}
        headers={[
          t('financeGlobal.period'),
          t('dashboard.invoicing.invoiced'),
          t('dashboard.invoicing.collected'),
        ]}
        rows={
          exportRows.series.length > 0
            ? exportRows.series
            : exportRows.aging.map(([label, amount]) => [label, amount, ''])
        }
      />
      <FinanceInsightKpis
        items={[
          {
            id: 'invoiced',
            label: t('dashboard.invoicing.invoiced'),
            value: formatMoney(data.invoiced),
          },
          {
            id: 'outstanding',
            label: t('dashboard.invoicing.outstanding'),
            value: formatMoney(data.outstanding),
          },
          {
            id: 'dso',
            label: t('dashboard.invoicing.dso'),
            value: t('financeGlobal.dsoDays', { count: Math.round(data.dsoDays) }),
          },
          {
            id: 'overdue',
            label: t('dashboard.invoicing.overdue'),
            value: String(data.overdueCount),
            hint: formatMoney(data.overdueAmount),
          },
        ]}
      />
      <div className="finance-insight-charts">
        <div className="finance-global-chart-container finance-insight-chart">
          <h3>{t('financeGlobal.invoicedVsCollected')}</h3>
          {hasSeries ? (
            <div className="finance-insight-canvas">
              <ScrollablePeriodChart granularity={granularity} labelCount={data.series.labels.length}>
                <Line data={lineData} options={lineOptions} />
              </ScrollablePeriodChart>
            </div>
          ) : (
            <p className="finance-empty-inline">{t('dashboard.noChartData')}</p>
          )}
        </div>
        <div className="finance-global-chart-container finance-insight-chart">
          <h3>{t('financeGlobal.agingTitle')}</h3>
          {agingTotal > 0 ? (
            <div className="finance-insight-canvas">
              <Bar data={agingData} options={agingOptions} />
            </div>
          ) : (
            <p className="finance-empty-inline">{t('dashboard.noChartData')}</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default FacturationTab;
