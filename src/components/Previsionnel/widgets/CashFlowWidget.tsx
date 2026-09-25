import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Bar } from 'react-chartjs-2';
import { ChartData, ChartOptions } from 'chart.js';
import { PeriodAggregate } from '../../../types/forecast';
import { formatMoney } from '../../../utils/amounts';
import { useTheme } from '../../../hooks/useTheme';
import {
  chartAxisColor,
  chartGridColor,
  chartPastelNamed,
  chartTooltipTheme,
} from '../../../utils/chartPastel';
import { getPeriodLabel } from '../../../utils/periodKeys';
import { ChartGranularity } from '../../../types/projection';
import { periodXTicks } from '../../../utils/chartPeriodAxis';
import ScrollablePeriodChart from '../../Common/ScrollablePeriodChart';
import PrevisionnelChartFrame from '../PrevisionnelChartFrame';
import '../../../utils/registerCharts';

interface CashFlowWidgetProps {
  aggregates: PeriodAggregate;
  granularity: ChartGranularity;
}

/** Barres débits/crédits + courbe du flux net, agrégés selon la granularité choisie. */
const CashFlowWidget: React.FC<CashFlowWidgetProps> = ({ aggregates, granularity }) => {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const axis = chartAxisColor(isDark);
  const grid = chartGridColor(isDark);
  const tooltip = chartTooltipTheme(isDark);
  const debitColor = chartPastelNamed('red');
  const creditColor = chartPastelNamed('green');
  const netColor = chartPastelNamed('blue');

  const labels = useMemo(
    () => aggregates.periods.map((period) => getPeriodLabel(period, granularity)),
    [aggregates.periods, granularity]
  );

  const data = useMemo(
    () =>
      ({
        labels,
        datasets: [
          {
            type: 'bar' as const,
            label: t('previsionnel.tooltip.debit'),
            data: aggregates.debits.map((value) => Math.abs(value)),
            backgroundColor: debitColor,
            borderRadius: 4,
            order: 2,
          },
          {
            type: 'bar' as const,
            label: t('previsionnel.tooltip.credit'),
            data: aggregates.credits,
            backgroundColor: creditColor,
            borderRadius: 4,
            order: 2,
          },
          {
            type: 'line' as const,
            label: t('previsionnel.tooltip.net'),
            data: aggregates.netFlows,
            borderColor: netColor,
            backgroundColor: netColor,
            tension: 0.3,
            pointRadius: 3,
            order: 1,
          },
        ],
      }) as ChartData<'bar'>,
    [labels, aggregates, debitColor, creditColor, netColor, t]
  );

  const options: ChartOptions<'bar'> = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { color: axis, boxWidth: 12, font: { size: 11 } } },
        tooltip: {
          ...tooltip,
          callbacks: {
            label: (ctx) => `${ctx.dataset.label} : ${formatMoney(Number(ctx.parsed.y ?? 0))}`,
          },
        },
      },
      scales: {
        x: { ticks: { ...periodXTicks(granularity, axis) }, grid: { color: grid } },
        y: {
          ticks: { color: axis, callback: (value) => formatMoney(Number(value)) },
          grid: { color: grid },
        },
      },
    }),
    [axis, grid, tooltip, granularity]
  );

  if (aggregates.periods.length === 0) return <p className="previsionnel-empty-chart">—</p>;

  return (
    <PrevisionnelChartFrame>
      <ScrollablePeriodChart granularity={granularity} labelCount={labels.length}>
        <Bar data={data} options={options} />
      </ScrollablePeriodChart>
    </PrevisionnelChartFrame>
  );
};

export default CashFlowWidget;
