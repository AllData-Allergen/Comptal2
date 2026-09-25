import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Doughnut } from 'react-chartjs-2';
import { ChartOptions } from 'chart.js';
import { BreakdownSlice } from '../../../types/forecast';
import { formatMoney } from '../../../utils/amounts';
import { useTheme } from '../../../hooks/useTheme';
import { chartAxisColor, chartPastel, chartSurfaceColor, chartTooltipTheme } from '../../../utils/chartPastel';
import PrevisionnelChartFrame from '../PrevisionnelChartFrame';
import '../../../utils/registerCharts';

interface LineBreakdownWidgetProps {
  slices: BreakdownSlice[];
}

/** Anneau : part relative de chaque ligne (feuilles) dans le volume absolu projeté. */
const LineBreakdownWidget: React.FC<LineBreakdownWidgetProps> = ({ slices }) => {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const axis = chartAxisColor(isDark);
  const tooltip = chartTooltipTheme(isDark);
  const display = useMemo(
    () => slices.filter((s) => s.value !== 0).map((s) => ({ ...s, value: Math.abs(s.value) })),
    [slices]
  );
  const total = display.reduce((sum, slice) => sum + slice.value, 0);

  const data = useMemo(
    () => ({
      labels: display.map((s) => s.label),
      datasets: [
        {
          data: display.map((s) => s.value),
          backgroundColor: display.map((_, index) => chartPastel(index)),
          borderColor: chartSurfaceColor(isDark),
          borderWidth: 1,
        },
      ],
    }),
    [display, isDark]
  );

  const options: ChartOptions<'doughnut'> = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      cutout: '58%',
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

  if (display.length === 0) return <p className="previsionnel-empty-chart">—</p>;

  return (
    <PrevisionnelChartFrame>
      <Doughnut data={data} options={options} />
    </PrevisionnelChartFrame>
  );
};

export default LineBreakdownWidget;
