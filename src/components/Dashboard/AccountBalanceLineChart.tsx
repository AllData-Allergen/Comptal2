import React, { useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Chart as ChartJS, ChartOptions } from 'chart.js';
import { Line } from 'react-chartjs-2';
import { formatMoney } from '../../utils/amounts';
import { useTheme } from '../../hooks/useTheme';
import { ChartGranularity } from '../../types/projection';
import {
  chartPointBorder,
  dashboardChartTheme,
  dashboardTooltipOptions,
} from '../../utils/dashboardChartTheme';
import { chartGridCallback } from '../../utils/chartPastel';
import { periodXTicks } from '../../utils/chartPeriodAxis';
import ScrollablePeriodChart from '../Common/ScrollablePeriodChart';
import '../../utils/registerCharts';

interface Series {
  label: string;
  color: string;
  data: number[];
}

interface AccountBalanceLineChartProps {
  labels: string[];
  series: Series[];
  granularity: ChartGranularity;
}

const AccountBalanceLineChart: React.FC<AccountBalanceLineChartProps> = React.memo(
  ({ labels, series, granularity }) => {
    const { t } = useTranslation();
    const { theme } = useTheme();
    const isDarkMode = theme === 'dark';
    const colors = dashboardChartTheme(isDarkMode);
    const chartRef = useRef<ChartJS<'line'>>(null);

    const calculateYAxisLimits = useCallback((datasets: Array<{ data: number[] }>) => {
      if (datasets.length === 0 || !datasets[0]?.data) {
        return { min: 0, max: 1000 };
      }
      let minValue = Infinity;
      let maxValue = -Infinity;
      datasets.forEach((dataset) => {
        dataset.data.forEach((value) => {
          if (value !== null && value !== undefined) {
            if (value < minValue) minValue = value;
            if (value > maxValue) maxValue = value;
          }
        });
      });
      if (minValue === Infinity || maxValue === -Infinity) {
        return { min: 0, max: 1000 };
      }
      const range = maxValue - minValue;
      const margin = range * 0.1 || Math.abs(maxValue) * 0.1 || 100;
      return { min: minValue - margin, max: maxValue + margin };
    }, []);

    const datasets = useMemo(
      () =>
        series.map((s) => ({
          label: s.label,
          data: s.data,
          borderColor: s.color,
          backgroundColor: s.color,
          borderWidth: 2,
          fill: false,
          tension: 0.4,
          pointRadius: 3,
          pointHoverRadius: 5,
          pointBackgroundColor: s.color,
          pointBorderColor: chartPointBorder(isDarkMode),
          pointBorderWidth: 2,
        })),
      [series, isDarkMode]
    );

    const initialLimits = useMemo(
      () => calculateYAxisLimits(datasets),
      [datasets, calculateYAxisLimits]
    );

    const options: ChartOptions<'line'> = useMemo(
      () => ({
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false,
        },
        scales: {
          x: {
            grid: {
              display: true,
              color: colors.grid,
            },
            ticks: {
              ...periodXTicks(granularity, colors.text),
            },
          },
          y: {
            title: {
              display: true,
              text: t('dashboard.balance'),
              font: { size: 14, weight: 'bold' },
              color: colors.text,
            },
            min: initialLimits.min,
            max: initialLimits.max,
            grid: {
              color: chartGridCallback(isDarkMode),
              lineWidth: (context) => (context.tick.value === 0 ? 2 : 1),
            },
            ticks: {
              color: colors.text,
              callback(value) {
                return formatMoney(value as number);
              },
            },
          },
        },
        plugins: {
          legend: {
            position: 'bottom',
            onClick(e, legendItem, legend) {
              ChartJS.defaults.plugins.legend.onClick.call(this, e, legendItem, legend);
              const chart = legend.chart;
              if (!chart) return;
              const visibleDatasets = chart.data.datasets.filter(
                (_, index) => !chart.getDatasetMeta(index).hidden
              ) as Array<{ data: number[] }>;
              const newLimits = calculateYAxisLimits(visibleDatasets);
              if (chart.options.scales && chart.options.scales.y) {
                chart.options.scales.y.min = newLimits.min;
                chart.options.scales.y.max = newLimits.max;
              }
              chart.update();
            },
            labels: {
              padding: 15,
              usePointStyle: true,
              pointStyle: 'circle',
              font: { size: 11 },
              color: colors.text,
            },
          },
          tooltip: {
            ...dashboardTooltipOptions(colors),
            padding: 10,
            callbacks: {
              label(context) {
                const label = context.dataset.label || '';
                if (context.parsed.y !== null) {
                  return `${label}: ${formatMoney(context.parsed.y)}`;
                }
                return label;
              },
            },
          },
        },
      }),
      [initialLimits, calculateYAxisLimits, isDarkMode, colors, granularity, t]
    );

    if (labels.length === 0 || series.length === 0) {
      return (
        <div className="chart-empty">
          <p>{t('dashboard.noChartData')}</p>
        </div>
      );
    }

    return (
      <div className="chart-canvas-wrap" style={{ width: '100%', height: '100%' }}>
        <ScrollablePeriodChart granularity={granularity} labelCount={labels.length}>
          <Line ref={chartRef} data={{ labels, datasets }} options={options} />
        </ScrollablePeriodChart>
      </div>
    );
  }
);

AccountBalanceLineChart.displayName = 'AccountBalanceLineChart';
export default AccountBalanceLineChart;
