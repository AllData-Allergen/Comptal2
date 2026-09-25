import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Line } from 'react-chartjs-2';
import { ChartOptions } from 'chart.js';
import { BalanceSeries } from '../../../types/forecast';
import { formatMoney } from '../../../utils/amounts';
import { useTheme } from '../../../hooks/useTheme';
import {
  chartAxisColor,
  chartGridColor,
  chartPastelNamed,
  chartTooltipTheme,
} from '../../../utils/chartPastel';
import '../../../utils/registerCharts';
import { ChartGranularity } from '../../../types/projection';
import { periodXTicks } from '../../../utils/chartPeriodAxis';
import ScrollablePeriodChart from '../../Common/ScrollablePeriodChart';
import PrevisionnelChartFrame from '../PrevisionnelChartFrame';

interface BalanceEvolutionWidgetProps {
  series: BalanceSeries;
  granularity: ChartGranularity;
}

/** Courbe d’évolution du solde projeté sur la période (débits/crédits/net en tooltip). */
const BalanceEvolutionWidget: React.FC<BalanceEvolutionWidgetProps> = ({ series, granularity }) => {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const color = chartAxisColor(isDark);
  const grid = chartGridColor(isDark);
  const tooltip = chartTooltipTheme(isDark);
  const pastel = chartPastelNamed('blue');

  const data = useMemo(
    () => ({
      labels: series.labels,
      datasets: [
        {
          label: t('previsionnel.tooltip.balance'),
          data: series.balances,
          borderColor: pastel,
          backgroundColor: pastel,
          fill: true,
          tension: 0.35,
          pointRadius: 2,
        },
      ],
    }),
    [series, pastel, t]
  );

  const options: ChartOptions<'line'> = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          ...tooltip,
          callbacks: {
            label: (ctx) => {
              const index = ctx.dataIndex;
              const debit = series.debits[index] ?? 0;
              const credit = series.credits[index] ?? 0;
              const net = credit + debit;
              const balance = series.balances[index] ?? Number(ctx.parsed.y ?? 0);
              return [
                `${t('previsionnel.tooltip.debit')} : ${formatMoney(debit)}`,
                `${t('previsionnel.tooltip.credit')} : ${formatMoney(credit)}`,
                `${t('previsionnel.tooltip.net')} : ${formatMoney(net)}`,
                `${t('previsionnel.tooltip.balance')} : ${formatMoney(balance)}`,
              ];
            },
          },
        },
      },
      scales: {
        x: { ticks: { ...periodXTicks(granularity, color) }, grid: { color: grid } },
        y: {
          ticks: { color, callback: (v) => formatMoney(Number(v)) },
          grid: { color: grid },
        },
      },
    }),
    [color, grid, tooltip, series, t, granularity]
  );

  return (
    <PrevisionnelChartFrame>
      <ScrollablePeriodChart granularity={granularity} labelCount={series.labels.length}>
        <Line data={data} options={options} />
      </ScrollablePeriodChart>
    </PrevisionnelChartFrame>
  );
};

export default BalanceEvolutionWidget;
