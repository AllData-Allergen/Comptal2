import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Doughnut } from 'react-chartjs-2';
import { ChartOptions } from 'chart.js';
import { BreakdownDetail, BreakdownSlice } from '../../../types/forecast';
import { formatMoney } from '../../../utils/amounts';
import { useTheme } from '../../../hooks/useTheme';
import { chartAxisColor, chartPastel, chartSurfaceColor, chartTooltipTheme } from '../../../utils/chartPastel';
import PrevisionnelChartFrame from '../PrevisionnelChartFrame';
import '../../../utils/registerCharts';

interface GroupBreakdownWidgetProps {
  slices: BreakdownSlice[];
  details?: Record<string, BreakdownDetail[]>;
}

/** Anneau : répartition par groupe du tableau (lignes hors groupe regroupées). */
const GroupBreakdownWidget: React.FC<GroupBreakdownWidgetProps> = ({ slices, details }) => {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const axis = chartAxisColor(isDark);
  const tooltip = chartTooltipTheme(isDark);
  const surface = chartSurfaceColor(isDark);
  const display = useMemo(
    () =>
      slices
        .filter((slice) => slice.value !== 0)
        .map((slice) => ({
          ...slice,
          label: slice.id === '__ungrouped' ? t('previsionnel.noGroup') : slice.label,
          value: Math.abs(slice.value),
        })),
    [slices, t]
  );
  const total = display.reduce((sum, slice) => sum + slice.value, 0);

  const sliceIds = useMemo(() => {
    const ids: string[] = [];
    const sep = total * 0.015;
    display.forEach((slice) => {
      ids.push(slice.id);
      if (sep > 0 && display.length > 1) ids.push('');
    });
    return ids;
  }, [display, total]);

  const data = useMemo(() => {
    const labels: string[] = [];
    const values: number[] = [];
    const colors: string[] = [];
    const sep = total * 0.015;
    display.forEach((slice, index) => {
      labels.push(slice.label);
      values.push(slice.value);
      colors.push(chartPastel(index));
      if (sep > 0 && display.length > 1) {
        labels.push('');
        values.push(sep);
        colors.push(surface);
      }
    });
    return {
      labels,
      datasets: [{ data: values, backgroundColor: colors, borderWidth: 0 }],
    };
  }, [display, surface, total]);

  const options: ChartOptions<'doughnut'> = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      cutout: '58%',
      layout: { padding: 4 },
      plugins: {
        legend: {
          position: 'right',
          labels: { color: axis, boxWidth: 12, font: { size: 11 }, filter: (item) => Boolean(item.text) },
        },
        tooltip: {
          ...tooltip,
          filter: (item) => Boolean(item.label),
          callbacks: {
            label: (ctx) => {
              const value = Number(ctx.parsed);
              const pct = total > 0 ? ((value / total) * 100).toFixed(1) : '0';
              return t('previsionnel.tooltip.percent', {
                value: `${ctx.label}: ${formatMoney(value)}`,
                percentage: pct,
              });
            },
            afterBody: (items) => {
              const index = items[0]?.dataIndex ?? 0;
              const id = sliceIds[index];
              if (!id) return [];
              return (details?.[id] ?? [])
                .slice(0, 8)
                .map((line) => `• ${line.label} : ${formatMoney(line.value)}`);
            },
          },
        },
      },
    }),
    [axis, tooltip, total, t, sliceIds, details]
  );

  if (display.length === 0) return <p className="previsionnel-empty-chart">—</p>;

  return (
    <PrevisionnelChartFrame>
      <Doughnut data={data} options={options} />
    </PrevisionnelChartFrame>
  );
};

export default GroupBreakdownWidget;
