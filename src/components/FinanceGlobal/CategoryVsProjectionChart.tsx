import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Chart as ChartJS, ChartOptions } from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { formatMoney } from '../../utils/amounts';
import {
  chartAxisColor,
  chartGridCallback,
  chartTooltipTheme,
} from '../../utils/chartPastel';
import '../../utils/registerCharts';
import { ChartGranularity } from '../../types/projection';
import { periodXTicks } from '../../utils/chartPeriodAxis';
import ScrollablePeriodChart from '../Common/ScrollablePeriodChart';

function createHatchingPattern(
  ctx: CanvasRenderingContext2D,
  baseColor: string,
  isDarkMode: boolean
): CanvasPattern | null {
  const size = 10;
  const patternCanvas = document.createElement('canvas');
  patternCanvas.width = size;
  patternCanvas.height = size;
  const pctx = patternCanvas.getContext('2d');
  if (!pctx) return null;

  pctx.fillStyle = baseColor;
  pctx.fillRect(0, 0, size, size);

  const lineColor = isDarkMode ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.55)';
  pctx.strokeStyle = lineColor;
  pctx.lineWidth = 1.2;
  pctx.beginPath();
  pctx.moveTo(0, 0);
  pctx.lineTo(size, size);
  pctx.moveTo(size / 2, 0);
  pctx.lineTo(size, size / 2);
  pctx.moveTo(0, size / 2);
  pctx.lineTo(size / 2, size);
  pctx.stroke();

  return ctx.createPattern(patternCanvas, 'repeat');
}

interface CategoryVsProjectionChartProps {
  labels: string[];
  reality: number[];
  projection: number[];
  color: string;
  categoryName: string;
  granularity: ChartGranularity;
}

const CategoryVsProjectionChart: React.FC<CategoryVsProjectionChartProps> = ({
  labels,
  reality,
  projection,
  color,
  categoryName,
  granularity,
}) => {
  const { t } = useTranslation();
  const chartRef = useRef<ChartJS<'bar'>>(null);
  const [isDarkMode, setIsDarkMode] = useState(() =>
    document.documentElement.classList.contains('dark')
  );

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDarkMode(document.documentElement.classList.contains('dark'));
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });
    return () => observer.disconnect();
  }, []);

  const calculateYAxisLimits = useCallback((datasets: Array<{ data: number[] }>) => {
    let minValue = 0;
    let maxValue = 0;
    for (const dataset of datasets) {
      for (const value of dataset.data) {
        if (value < minValue) minValue = value;
        if (value > maxValue) maxValue = value;
      }
    }
    const range = Math.max(maxValue - minValue, 1);
    return {
      min: minValue - range * 0.02,
      max: maxValue + range * 0.02,
    };
  }, []);

  const datasets = useMemo(
    () => [
      {
        label: t('financeGlobal.basedOnData'),
        data: reality,
        backgroundColor: color,
        borderColor: 'rgba(0, 0, 0, 0.3)',
        borderWidth: 1,
        barPercentage: 0.9,
        categoryPercentage: 0.7,
      },
      {
        label: t('financeGlobal.projection'),
        data: projection,
        backgroundColor: (context: { chart: ChartJS }) => {
          const ctx = context.chart?.ctx;
          if (!ctx) return color;
          return createHatchingPattern(ctx, color, isDarkMode) || color;
        },
        borderColor: color,
        borderWidth: 1,
        barPercentage: 0.9,
        categoryPercentage: 0.7,
      },
    ],
    [reality, projection, color, isDarkMode, t]
  );

  const yAxisLimits = useMemo(
    () => calculateYAxisLimits(datasets),
    [datasets, calculateYAxisLimits]
  );

  const options: ChartOptions<'bar'> = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          stacked: false,
          grid: { display: false },
          ticks: {
            ...periodXTicks(granularity, chartAxisColor(isDarkMode)),
            font: { size: 11, weight: 'bold' },
          },
        },
        y: {
          stacked: false,
          title: {
            display: true,
            text: categoryName,
            font: { size: 14, weight: 'bold' },
            color: chartAxisColor(isDarkMode),
          },
          min: yAxisLimits.min,
          max: yAxisLimits.max,
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
          labels: {
            padding: 15,
            usePointStyle: true,
            pointStyle: 'rect',
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
    [yAxisLimits, isDarkMode, t, categoryName, granularity]
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
        <Bar ref={chartRef} data={{ labels, datasets }} options={options} />
      </ScrollablePeriodChart>
    </div>
  );
};

export default CategoryVsProjectionChart;
