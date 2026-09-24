import React, { useMemo } from 'react';
import { Bar } from 'react-chartjs-2';
import { ChartOptions } from 'chart.js';
import { BreakdownDetail, BreakdownSlice } from '../../../types/forecast';
import { formatMoney } from '../../../utils/amounts';
import { useTheme } from '../../../hooks/useTheme';
import {
  chartAxisColor,
  chartGridColor,
  chartPastel,
  chartTooltipTheme,
} from '../../../utils/chartPastel';
import PrevisionnelChartFrame from '../PrevisionnelChartFrame';
import '../../../utils/registerCharts';

interface CategoryBreakdownWidgetProps {
  slices: BreakdownSlice[];
  details?: Record<string, BreakdownDetail[]>;
}

/** Barres horizontales : impact net cumulé par catégorie (détail des lignes en tooltip). */
const CategoryBreakdownWidget: React.FC<CategoryBreakdownWidgetProps> = ({ slices, details }) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const axis = chartAxisColor(isDark);
  const grid = chartGridColor(isDark);
  const tooltip = chartTooltipTheme(isDark);
  const sorted = useMemo(
    () => [...slices].sort((a, b) => Math.abs(b.value) - Math.abs(a.value)),
    [slices]
  );

  const data = useMemo(
    () => ({
      labels: sorted.map((s) => s.label),
      datasets: [
        {
          data: sorted.map((s) => s.value),
          backgroundColor: sorted.map((_, index) => chartPastel(index)),
          borderRadius: 4,
        },
      ],
    }),
    [sorted]
  );

  const options: ChartOptions<'bar'> = useMemo(
    () => ({
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          ...tooltip,
          callbacks: {
            label: (ctx) => formatMoney(Number(ctx.parsed.x ?? 0)),
            afterBody: (items) => {
              const index = items[0]?.dataIndex ?? 0;
              const slice = sorted[index];
              if (!slice) return [];
              const lines = (details?.[slice.id] ?? []).slice(0, 8);
              return lines.map((line) => `• ${line.label} : ${formatMoney(line.value)}`);
            },
          },
        },
      },
      scales: {
        x: {
          ticks: {
            color: axis,
            callback: (v) => formatMoney(Number(v)),
          },
          grid: { color: grid },
        },
        y: {
          ticks: { color: axis },
          grid: { display: false },
        },
      },
    }),
    [axis, grid, tooltip, sorted, details]
  );

  if (sorted.length === 0) return <p className="previsionnel-empty-chart">—</p>;

  return (
    <PrevisionnelChartFrame autoHeightPx={Math.max(220, sorted.length * 28)}>
      <Bar data={data} options={options} />
    </PrevisionnelChartFrame>
  );
};

export default CategoryBreakdownWidget;
