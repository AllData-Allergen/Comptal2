import React, { useRef, useMemo, useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight } from 'lucide-react';
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

/** Crée un motif hachuré diagonal (même couleur que les data, lignes claires pour distinguer) */
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

const ITEMS_PER_PAGE = 8;

interface ProjectionVsRealityChartProps {
  monthLabels: string[];
  categories: string[];
  categoryColors: Record<string, string>;
  realityByCategory: number[][];
  projectionByCategory: Record<string, number[]>;
  categoryLabels?: Record<string, string>;
  granularity: ChartGranularity;
}

const ProjectionVsRealityChart: React.FC<ProjectionVsRealityChartProps> = ({
  monthLabels,
  categories,
  categoryColors,
  realityByCategory,
  projectionByCategory,
  categoryLabels = {},
  granularity,
}) => {
  const { t } = useTranslation();
  const chartRef = useRef<ChartJS<'bar'>>(null);
  const [isDarkMode, setIsDarkMode] = useState(() =>
    document.documentElement.classList.contains('dark')
  );
  const [legendPage, setLegendPage] = useState(0);
  const [hiddenDatasets, setHiddenDatasets] = useState<Set<number>>(new Set());

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

  useEffect(() => {
    setLegendPage(0);
  }, [categories]);

  // Même logique que MonthlyBarChart : positifs/négatifs par valeur
  const calculateYAxisLimits = useCallback((datasets: { data: number[]; stack?: string }[]) => {
    const numMonths = datasets[0]?.data.length || 0;
    const monthlyTotals: { positive: number; negative: number }[] = [];

    for (let monthIndex = 0; monthIndex < numMonths; monthIndex++) {
      let positiveSum = 0;
      let negativeSum = 0;

      datasets.forEach((dataset) => {
        const value = dataset.data[monthIndex];
        if (value > 0) {
          positiveSum += value;
        } else {
          negativeSum += value;
        }
      });

      monthlyTotals.push({ positive: positiveSum, negative: negativeSum });
    }

    const maxPositive = Math.max(...monthlyTotals.map((t) => t.positive));
    const minNegative = Math.min(...monthlyTotals.map((t) => t.negative));
    const range = Math.max(maxPositive - minNegative, 1);
    const topMargin = range * 0.02;
    const bottomMargin = range * 0.02;

    return {
      min: minNegative - bottomMargin,
      max: maxPositive + topMargin,
    };
  }, []);

  const barDatasets = useMemo(() => {
    const ds: {
      label: string;
      data: number[];
      backgroundColor: string | ((ctx: any) => CanvasPattern | string);
      borderColor: string;
      borderWidth: number;
      stack: string;
      barPercentage?: number;
      categoryPercentage?: number;
    }[] = [];

    categories.forEach((catName, index) => {
      ds.push({
        label: categoryLabels[catName] ?? catName,
        data: realityByCategory[index] ?? [],
        backgroundColor: categoryColors[catName] || '#808080',
        borderColor: 'rgba(0, 0, 0, 0.3)',
        borderWidth: 1,
        stack: 'Stack 0',
        barPercentage: 0.98,
        categoryPercentage: 0.98,
      });
    });

    categories.forEach((catName) => {
      const baseColor = categoryColors[catName] || '#808080';
      ds.push({
        label: `${categoryLabels[catName] ?? catName} (${t('financeGlobal.projection')})`,
        data: projectionByCategory[catName] ?? [],
        backgroundColor: (context: any) => {
          const chart = context.chart;
          if (!chart?.ctx) return baseColor;
          return createHatchingPattern(chart.ctx, baseColor, isDarkMode) || baseColor;
        },
        borderColor: baseColor,
        borderWidth: 1,
        stack: 'Stack 1',
        barPercentage: 0.98,
        categoryPercentage: 0.98,
      });
    });

    return ds;
  }, [categories, categoryColors, categoryLabels, isDarkMode, realityByCategory, projectionByCategory, t]);

  const visibleDatasets = useMemo(
    () => barDatasets.filter((_, i) => !hiddenDatasets.has(i)),
    [barDatasets, hiddenDatasets]
  );

  const yAxisLimits = useMemo(
    () => calculateYAxisLimits(visibleDatasets),
    [visibleDatasets, calculateYAxisLimits]
  );

  const chartDataWithHidden = useMemo(
    () =>
      barDatasets.map((ds, i) => ({
        ...ds,
        hidden: hiddenDatasets.has(i),
      })),
    [barDatasets, hiddenDatasets]
  );

  const totalPages = Math.max(1, Math.ceil(categories.length / ITEMS_PER_PAGE));
  const paginatedCategories = useMemo(() => {
    const start = legendPage * ITEMS_PER_PAGE;
    return categories.slice(start, start + ITEMS_PER_PAGE);
  }, [categories, legendPage]);

  const handleLegendClick = useCallback(
    (datasetIndex: number) => {
      setHiddenDatasets((prev) => {
        const next = new Set(prev);
        if (next.has(datasetIndex)) {
          next.delete(datasetIndex);
        } else {
          next.add(datasetIndex);
        }
        return next;
      });
    },
    []
  );

  const textColor = chartAxisColor(isDarkMode);
  const mutedColor = isDarkMode ? '#94a3b8' : '#64748b';
  const borderColor = isDarkMode ? 'rgba(255, 255, 255, 0.16)' : 'rgba(0, 0, 0, 0.08)';

  const options: ChartOptions<'bar'> = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          stacked: true,
          grid: {
            display: false,
          },
          ticks: {
            ...periodXTicks(granularity, chartAxisColor(isDarkMode)),
            font: {
              size: 11,
              weight: 'bold',
            },
          },
        },
        y: {
          stacked: true,
          position: 'left',
          title: {
            display: true,
            text: t('dashboard.expensesByCategory'),
            font: {
              size: 14,
              weight: 'bold',
            },
            color: chartAxisColor(isDarkMode),
          },
          min: yAxisLimits.min,
          max: yAxisLimits.max,
          grid: {
            color: chartGridCallback(isDarkMode),
            lineWidth: (context: { tick: { value: number } }) => (context.tick.value === 0 ? 2 : 1),
          },
          ticks: {
            color: chartAxisColor(isDarkMode),
            callback: function (value) {
              return formatMoney(value as number);
            },
          },
        },
      },
      plugins: {
        legend: {
          display: false,
        },
        tooltip: {
          ...chartTooltipTheme(isDarkMode),
          titleFont: {
            size: 13,
            weight: 'bold',
          },
          bodyFont: {
            size: 12,
          },
          padding: 10,
          callbacks: {
            label: function (context: any) {
              const label = context.dataset.label || '';
              if (context.parsed.y !== null) {
                return `${label}: ${formatMoney(Math.abs(context.parsed.y))}`;
              }
              return label;
            },
          },
        },
      },
    }),
    [yAxisLimits, isDarkMode, t, granularity]
  );

  return (
    <div style={{ display: 'flex', width: '100%', height: '100%', gap: 16 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <ScrollablePeriodChart granularity={granularity} labelCount={monthLabels.length}>
          <Bar
            ref={chartRef}
            data={{
              labels: monthLabels,
              datasets: chartDataWithHidden,
            }}
            options={options}
          />
        </ScrollablePeriodChart>
      </div>

      <div
        style={{
          width: 230,
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          borderLeft: `1px solid ${borderColor}`,
          paddingLeft: 16,
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 12,
            fontSize: 11,
            fontWeight: 600,
            color: textColor,
            marginBottom: 8,
          }}
        >
          <span>{t('financeGlobal.basedOnData')}</span>
          <span>{t('financeGlobal.projection')}</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px', flex: 1 }}>
          {paginatedCategories.map((catName, idx) => {
            const globalIndex = legendPage * ITEMS_PER_PAGE + idx;
            const realityIndex = globalIndex;
            const projectionIndex = categories.length + globalIndex;
            const isRealityHidden = hiddenDatasets.has(realityIndex);
            const isProjectionHidden = hiddenDatasets.has(projectionIndex);
            const label = (categoryLabels[catName] ?? catName).replace('_NO_CAT_', t('financeGlobal.uncategorized'));
            const realityColor = categoryColors[catName] || '#808080';
            const projectionBaseColor = categoryColors[catName] || '#808080';
            const hatchingOverlay = isDarkMode
              ? 'repeating-linear-gradient(-45deg, transparent, transparent 1px, rgba(255,255,255,0.4) 1px, rgba(255,255,255,0.4) 2px)'
              : 'repeating-linear-gradient(-45deg, transparent, transparent 1px, rgba(255,255,255,0.55) 1px, rgba(255,255,255,0.55) 2px)';

            return (
              <React.Fragment key={globalIndex}>
                <button
                  type="button"
                  onClick={() => handleLegendClick(realityIndex)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '4px 0',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                    opacity: isRealityHidden ? 0.5 : 1,
                  }}
                  title={label}
                >
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      backgroundColor: realityColor,
                      flexShrink: 0,
                    }}
                  />
                  <span
                    style={{
                      fontSize: 10,
                      color: isRealityHidden ? mutedColor : textColor,
                      textDecoration: isRealityHidden ? 'line-through' : 'none',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {label}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => handleLegendClick(projectionIndex)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '4px 0',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                    opacity: isProjectionHidden ? 0.5 : 1,
                  }}
                  title={label}
                >
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      backgroundColor: projectionBaseColor,
                      backgroundImage: hatchingOverlay,
                      flexShrink: 0,
                    }}
                  />
                  <span
                    style={{
                      fontSize: 10,
                      color: isProjectionHidden ? mutedColor : textColor,
                      textDecoration: isProjectionHidden ? 'line-through' : 'none',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {label}
                  </span>
                </button>
              </React.Fragment>
            );
          })}
        </div>

        {totalPages > 1 && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              marginTop: 12,
              paddingTop: 8,
              borderTop: `1px solid ${borderColor}`,
            }}
          >
            <button
              type="button"
              onClick={() => setLegendPage((p) => Math.max(0, p - 1))}
              disabled={legendPage === 0}
              style={{
                padding: 4,
                background: 'none',
                border: 'none',
                cursor: legendPage === 0 ? 'not-allowed' : 'pointer',
                color: legendPage === 0 ? mutedColor : textColor,
              }}
              aria-label={t('financeGlobal.previous')}
            >
              <ChevronLeft size={16} />
            </button>
            <span style={{ fontSize: 11, color: textColor }}>
              {legendPage + 1} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setLegendPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={legendPage >= totalPages - 1}
              style={{
                padding: 4,
                background: 'none',
                border: 'none',
                cursor: legendPage >= totalPages - 1 ? 'not-allowed' : 'pointer',
                color: legendPage >= totalPages - 1 ? mutedColor : textColor,
              }}
              aria-label={t('financeGlobal.next')}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProjectionVsRealityChart;
