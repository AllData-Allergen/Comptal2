import React, { useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Chart as ChartJS, ChartOptions } from 'chart.js';
import { Line } from 'react-chartjs-2';
import { formatMoney } from '../../utils/amounts';
import { useTheme } from '../../hooks/useTheme';
import { ChartGranularity } from '../../types/projection';
import { chartPointBorder } from '../../utils/dashboardChartTheme';
import {
  chartAxisColor,
  chartGridCallback,
  chartGridColor,
  chartTooltipTheme,
} from '../../utils/chartPastel';
import { periodXTicks } from '../../utils/chartPeriodAxis';
import ScrollablePeriodChart from '../Common/ScrollablePeriodChart';
import '../../utils/registerCharts';

interface BalanceVsProjectionChartProps {
  labels: string[];
  reality: number[];
  projection: number[];
  granularity: ChartGranularity;
}

const REALITY_COLOR = '#2563eb';
const PROJECTION_COLOR = '#d97706';

const BalanceVsProjectionChart: React.FC<BalanceVsProjectionChartProps> = React.memo(
  ({ labels, reality, projection, granularity }) => {
    const { t } = useTranslation();
    const { theme } = useTheme();
    const isDarkMode = theme === 'dark';
    const chartRef = useRef<ChartJS<'line'>>(null);

    const calculateYAxisLimits = useCallback((datasets: Array<{ data: number[] }>) => {
      let minValue = Infinity;
      let maxValue = -Infinity;
      for (const dataset of datasets) {
        for (const value of dataset.data) {
          if (value < minValue) minValue = value;
          if (value > maxValue) maxValue = value;
        }
      }
      if (minValue === Infinity || maxValue === -Infinity) {
        return { min: 0, max: 1000 };
      }
      const range = maxValue - minValue;
      const margin = range * 0.1 || Math.abs(maxValue) * 0.1 || 100;
      return { min: minValue - margin, max: maxValue + margin };
    }, []);

    const datasets = useMemo(
      () => [
        {
          label: t('financeGlobal.basedOnData'),
          data: reality,
          borderColor: REALITY_COLOR,
          backgroundColor: REALITY_COLOR,
          borderWidth: 2,
          fill: false,
          tension: 0.3,
          pointRadius: 3,
          pointHoverRadius: 5,
          pointBackgroundColor: REALITY_COLOR,
          pointBorderColor: chartPointBorder(isDarkMode),
          pointBorderWidth: 2,
        },
        {
          label: t('financeGlobal.projection'),
          data: projection,
          borderColor: PROJECTION_COLOR,
          backgroundColor: PROJECTION_COLOR,
          borderWidth: 2,
          borderDash: [6, 4],
          fill: false,
          tension: 0.3,
          pointRadius: 3,
          pointHoverRadius: 5,
          pointBackgroundColor: PROJECTION_COLOR,
          pointBorderColor: chartPointBorder(isDarkMode),
          pointBorderWidth: 2,
        },
      ],
      [reality, projection, isDarkMode, t]
    );

    const initialLimits = useMemo(
      () => calculateYAxisLimits(datasets),
      [datasets, calculateYAxisLimits]
    );

    const options: ChartOptions<'line'> = useMemo(
      () => ({
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        scales: {
          x: {
            grid: {
              display: true,
              color: chartGridColor(isDarkMode),
            },
            ticks: {
              ...periodXTicks(granularity, chartAxisColor(isDarkMode)),
            },
          },
          y: {
            title: {
              display: true,
              text: t('dashboard.balance'),
              font: { size: 14, weight: 'bold' },
              color: chartAxisColor(isDarkMode),
            },
            min: initialLimits.min,
            max: initialLimits.max,
            grid: {
              color: chartGridCallback(isDarkMode),
              lineWidth: (context) => (context.tick.value === 0 ? 2 : 1),
            },
            ticks: {
              color: chartAxisColor(isDarkMode),
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
              color: chartAxisColor(isDarkMode),
            },
          },
          tooltip: {
            ...chartTooltipTheme(isDarkMode),
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
      [initialLimits, calculateYAxisLimits, isDarkMode, granularity, t]
    );

    if (labels.length === 0) {
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

BalanceVsProjectionChart.displayName = 'BalanceVsProjectionChart';
export default BalanceVsProjectionChart;
