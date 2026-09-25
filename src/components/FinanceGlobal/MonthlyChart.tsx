import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Chart as ChartJS, ChartOptions } from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { CategorySummary } from '../../services/StatsService';
import { ConfigService } from '../../services/ConfigService';
import { Category, CategoryGroup } from '../../types/models';
import {
  aggregateMonthlyChart,
  CategoryAggregation,
  UNGROUPED_CODE,
} from '../../utils/categoryAggregate';
import { formatMoney } from '../../utils/amounts';
import {
  chartAxisColor,
  chartGridCallback,
  chartTooltipTheme,
} from '../../utils/chartPastel';
import { Logger } from '../../services/logger';
import CategoryAggToggle from '../Common/CategoryAggToggle';
import FinanceTable, { formatCellMoney, FinanceTableColumn, FinanceTableRow } from './FinanceTable';
import '../../utils/registerCharts';
import { ChartGranularity } from '../../types/projection';
import { periodXTicks } from '../../utils/chartPeriodAxis';
import ScrollablePeriodChart from '../Common/ScrollablePeriodChart';

type MixedDataset = {
  label: string;
  data: number[];
  backgroundColor?: string | string[];
  borderColor?: string | string[];
  borderWidth?: number;
  type?: 'bar' | 'line';
  order?: number;
  barPercentage?: number;
  categoryPercentage?: number;
  pointRadius?: number;
  pointHoverRadius?: number;
  fill?: boolean;
  tension?: number;
};

interface MonthlyChartProps {
  periodLabels: string[];
  categories: string[];
  categoryColors: Record<string, string>;
  monthlyData: number[][];
  incomeData: number[][];
  expensesData: number[][];
  summaries: CategorySummary[];
  categoryConfigs: Category[];
  granularity: ChartGranularity;
}

const MonthlyChart: React.FC<MonthlyChartProps> = ({
  periodLabels,
  categories,
  categoryColors,
  monthlyData,
  incomeData,
  expensesData,
  summaries,
  categoryConfigs,
  granularity,
}) => {
  const { t } = useTranslation();
  const chartRef = useRef<ChartJS<'bar'>>(null);
  const [isDarkMode, setIsDarkMode] = useState(() =>
    document.documentElement.classList.contains('dark')
  );
  const [aggregation, setAggregation] = useState<CategoryAggregation>('category');
  const [groups, setGroups] = useState<CategoryGroup[]>([]);

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDarkMode(document.documentElement.classList.contains('dark'));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        setGroups(await ConfigService.listCategoryGroups());
      } catch (err) {
        Logger.error('MonthlyChart.loadGroups', err);
      }
    })();
  }, []);

  const view = useMemo(
    () =>
      aggregateMonthlyChart(
        categories,
        categoryColors,
        monthlyData,
        incomeData,
        expensesData,
        summaries,
        categoryConfigs,
        groups,
        t('edition.ungroupedCategories'),
        t('financeGlobal.credit'),
        t('financeGlobal.debit'),
        aggregation
      ),
    [
      categories,
      categoryColors,
      monthlyData,
      incomeData,
      expensesData,
      summaries,
      categoryConfigs,
      groups,
      aggregation,
      t,
    ]
  );

  const calculateYAxisLimits = useCallback((datasets: MixedDataset[]) => {
    const numMonths = datasets[0]?.data.length || 0;
    const monthlyTotals: { positive: number; negative: number }[] = [];
    for (let monthIndex = 0; monthIndex < numMonths; monthIndex++) {
      let positiveSum = 0;
      let negativeSum = 0;
      datasets.forEach((dataset) => {
        if (dataset.type === 'line') return;
        const value = dataset.data[monthIndex];
        if (value > 0) positiveSum += value;
        else negativeSum += value;
      });
      monthlyTotals.push({ positive: positiveSum, negative: negativeSum });
    }
    const maxPositive = Math.max(...monthlyTotals.map((x) => x.positive), 0);
    const minNegative = Math.min(...monthlyTotals.map((x) => x.negative), 0);
    const range = maxPositive - minNegative || 1;
    return { min: minNegative - range * 0.02, max: maxPositive + range * 0.02 };
  }, []);

  const periodTotals = useMemo(
    () =>
      periodLabels.map((_, monthIndex) =>
        view.monthlyData.reduce((total, cat) => total + (cat[monthIndex] || 0), 0)
      ),
    [view.monthlyData, periodLabels]
  );

  const barDatasets: MixedDataset[] = useMemo(
    () =>
      view.categories.map((category, index) => ({
        label: category,
        data: view.monthlyData[index] ?? [],
        backgroundColor: view.categoryColors[category] || '#808080',
        borderColor: 'rgba(0, 0, 0, 0.3)',
        borderWidth: 1,
        type: 'bar' as const,
        order: 1,
        barPercentage: 0.98,
        categoryPercentage: 0.98,
      })),
    [view.categories, view.monthlyData, view.categoryColors]
  );

  const lineDataset: MixedDataset = useMemo(
    () => ({
      label: t('financeGlobal.total'),
      data: periodTotals,
      backgroundColor: periodTotals.map((v) =>
        v >= 0 ? 'rgba(40, 167, 69, 0.6)' : 'rgba(220, 53, 69, 0.6)'
      ),
      borderColor: periodTotals.map((v) =>
        v >= 0 ? 'rgba(40, 167, 69, 0.8)' : 'rgba(220, 53, 69, 0.8)'
      ),
      borderWidth: 2,
      type: 'line' as const,
      pointRadius: 6,
      pointHoverRadius: 8,
      fill: false,
      order: 0,
      tension: 0.4,
    }),
    [periodTotals, t]
  );

  const initialLimits = useMemo(
    () => calculateYAxisLimits([...barDatasets, lineDataset]),
    [barDatasets, lineDataset, calculateYAxisLimits]
  );

  const options: ChartOptions<'bar'> = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          stacked: true,
          grid: { display: false },
          ticks: {
            ...periodXTicks(granularity, chartAxisColor(isDarkMode)),
          },
        },
        y: {
          stacked: true,
          min: initialLimits.min,
          max: initialLimits.max,
          ticks: {
            color: chartAxisColor(isDarkMode),
            callback: (value) => formatMoney(value as number),
          },
          grid: {
            color: chartGridCallback(isDarkMode),
            lineWidth: (ctx) => (ctx.tick.value === 0 ? 2 : 1),
          },
        },
      },
      plugins: {
        legend: {
          position: 'bottom',
          onClick(e, legendItem, legend) {
            ChartJS.defaults.plugins.legend.onClick?.call(this, e, legendItem, legend);
            const chart = legend.chart;
            if (!chart) return;
            const visible = chart.data.datasets.filter((_, i) => !chart.getDatasetMeta(i).hidden);
            const limits = calculateYAxisLimits(visible as MixedDataset[]);
            if (chart.options.scales?.y) {
              chart.options.scales.y.min = limits.min;
              chart.options.scales.y.max = limits.max;
            }
            chart.update();
          },
          labels: { color: chartAxisColor(isDarkMode) },
        },
        tooltip: {
          ...chartTooltipTheme(isDarkMode),
          callbacks: {
            label(ctx) {
              const label = ctx.dataset.label || '';
              if (ctx.parsed.y !== null) return `${label}: ${formatMoney(Math.abs(ctx.parsed.y))}`;
              return label;
            },
          },
        },
      },
    }),
    [initialLimits, calculateYAxisLimits, isDarkMode, granularity]
  );

  const abbrLabel =
    aggregation === 'group' ? t('financeGlobal.group') : t('financeGlobal.abbreviation');

  const tableColumns: FinanceTableColumn[] = useMemo(
    () => [
      { key: 'code', label: abbrLabel, sticky: true, width: 80 },
      { key: 'name', label: t('financeGlobal.fullName'), sticky: true, width: 200 },
      { key: 'avg', label: t('financeGlobal.average'), sticky: true, width: 110, align: 'right' },
      { key: 'sum', label: t('financeGlobal.sum'), sticky: true, width: 110, align: 'right' },
      ...periodLabels.map((label, i) => ({
        key: `p-${i}`,
        label,
        align: 'right' as const,
      })),
    ],
    [periodLabels, t, abbrLabel]
  );

  const tableRows: FinanceTableRow[] = useMemo(() => {
    const rows: FinanceTableRow[] = view.summaries.map((cat, rowIndex) => {
      const dataRow = view.summarySeries[rowIndex] ?? [];
      const avg = cat.transactionCount > 0 ? cat.totalAmount / cat.transactionCount : 0;
      const codeLabel =
        aggregation === 'group'
          ? cat.categoryCode === UNGROUPED_CODE
            ? '—'
            : cat.categoryName.slice(0, 3).toUpperCase()
          : cat.categoryCode;
      return {
        id: cat.categoryCode,
        isOdd: rowIndex % 2 !== 0,
        cells: [
          { content: codeLabel, text: codeLabel },
          {
            content: (
              <span className="flex items-center gap-2">
                <span className="finance-color-dot" style={{ backgroundColor: cat.color }} />
                {cat.categoryName}
              </span>
            ),
            text: cat.categoryName,
          },
          { content: formatCellMoney(avg), value: avg, text: avg, align: 'right' },
          {
            content: formatCellMoney(cat.totalAmount),
            value: cat.totalAmount,
            text: cat.totalAmount,
            align: 'right',
          },
          ...dataRow.map((v) => ({
            content: formatCellMoney(v),
            value: v,
            text: v,
            colorize: true,
            align: 'right' as const,
          })),
        ],
      };
    });

    if (periodLabels.length > 0 && view.summarySeries.length > 0) {
      const totals = periodLabels.map((_, i) =>
        view.summarySeries.reduce((s, row) => s + (row[i] ?? 0), 0)
      );
      // Même total que la somme des lignes (totalAmount), pour Catégorie et Regroupement.
      const grandTotal = view.summaries.reduce((s, cat) => s + cat.totalAmount, 0);
      rows.push({
        id: 'total',
        isTotal: true,
        cells: [
          { content: t('financeGlobal.total'), text: t('financeGlobal.total'), align: 'left' },
          { content: '', text: '' },
          { content: '', text: '' },
          {
            content: formatCellMoney(grandTotal),
            value: grandTotal,
            text: grandTotal,
            align: 'right',
          },
          ...totals.map((v) => ({
            content: formatCellMoney(v),
            value: v,
            text: v,
            colorize: true,
            align: 'right' as const,
          })),
        ],
      });
    }
    return rows;
  }, [view, periodLabels, t, aggregation]);

  return (
    <div className="finance-chart-table-layout">
      <div className="finance-global-chart-container chart-container-with-toolbar finance-chart-pane">
        <div className="bilan-agg-toolbar">
          <CategoryAggToggle value={aggregation} onChange={setAggregation} />
        </div>
        <div className="chart active">
          <ScrollablePeriodChart granularity={granularity} labelCount={periodLabels.length}>
            <Bar
              ref={chartRef}
              data={{ labels: periodLabels, datasets: [...barDatasets, lineDataset] as never }}
              options={options}
            />
          </ScrollablePeriodChart>
        </div>
      </div>
      <FinanceTable
        columns={tableColumns}
        rows={tableRows}
        stickyOffsets={[0, 80, 280, 390]}
        className="finance-table-pane"
        exportFileName="finance_mensuel"
        exportSheetName={t('finance.tabMonthly')}
      />
    </div>
  );
};

export default MonthlyChart;
