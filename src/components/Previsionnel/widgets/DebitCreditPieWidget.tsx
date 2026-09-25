import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pie } from 'react-chartjs-2';
import { ChartOptions } from 'chart.js';
import { BreakdownSlice } from '../../../types/forecast';
import { formatMoney } from '../../../utils/amounts';
import { useTheme } from '../../../hooks/useTheme';
import { chartAxisColor, chartPastelNamed, chartSurfaceColor, chartTooltipTheme } from '../../../utils/chartPastel';
import PrevisionnelChartFrame from '../PrevisionnelChartFrame';
import '../../../utils/registerCharts';

interface DebitCreditPieWidgetProps {
  slices: BreakdownSlice[];
}

/** Camembert de la répartition globale débits vs crédits sur toute la période projetée. */
const DebitCreditPieWidget: React.FC<DebitCreditPieWidgetProps> = ({ slices }) => {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const axis = chartAxisColor(isDark);
  const tooltip = chartTooltipTheme(isDark);
  const debitColor = chartPastelNamed('red');
  const creditColor = chartPastelNamed('green');

  const colored = useMemo(
    () =>
      slices.map((slice) => ({
        ...slice,
        label: slice.id === 'debit' ? t('previsionnel.flow.debit') : t('previsionnel.flow.credit'),
        color: slice.id === 'debit' ? debitColor : creditColor,
      })),
    [slices, debitColor, creditColor, t]
  );
  const total = colored.reduce((sum, slice) => sum + slice.value, 0);

  const data = useMemo(
    () => ({
      labels: colored.map((s) => s.label),
      datasets: [
        {
          data: colored.map((s) => s.value),
          backgroundColor: colored.map((s) => s.color),
          borderColor: chartSurfaceColor(isDark),
          borderWidth: 1,
        },
      ],
    }),
    [colored, isDark]
  );

  const options: ChartOptions<'pie'> = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: 4 },
      plugins: {
        legend: {
          position: 'right',
          labels: { color: axis, boxWidth: 12, font: { size: 11 } },
        },
        tooltip: {
          ...tooltip,
          callbacks: {
            label: (ctx) => {
              const value = Number(ctx.parsed);
              const pct = total > 0 ? ((value / total) * 100).toFixed(1) : '0';
              return t('previsionnel.tooltip.percent', {
                value: `${ctx.label}: ${formatMoney(value)}`,
                percentage: pct,
              });
            },
          },
        },
      },
    }),
    [axis, tooltip, total, t]
  );

  if (slices.length === 0) return <p className="previsionnel-empty-chart">—</p>;

  return (
    <PrevisionnelChartFrame>
      <Pie data={data} options={options} />
    </PrevisionnelChartFrame>
  );
};

export default DebitCreditPieWidget;
