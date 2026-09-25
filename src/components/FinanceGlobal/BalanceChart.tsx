import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Chart as ChartJS, ChartOptions } from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { AccountSummary } from '../../services/StatsService';
import { formatMoney } from '../../utils/amounts';
import {
  chartAxisColor,
  chartGridCallback,
  chartTooltipTheme,
} from '../../utils/chartPastel';
import FinanceTable, { formatCellMoney, FinanceTableColumn, FinanceTableRow } from './FinanceTable';
import '../../utils/registerCharts';
import { ChartGranularity } from '../../types/projection';
import { periodXTicks } from '../../utils/chartPeriodAxis';
import ScrollablePeriodChart from '../Common/ScrollablePeriodChart';

type MixedDataset = {
  label: string;
  data: number[];
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
  type?: 'bar' | 'line';
  order?: number;
  stack?: string;
  fill?: boolean;
  tension?: number;
  pointRadius?: number;
  pointHoverRadius?: number;
};

interface BalanceChartProps {
  periodLabels: string[];
  accounts: string[];
  accountColors: Record<string, string>;
  monthlyData: number[][];
  summaries: AccountSummary[];
  granularity: ChartGranularity;
}

const BalanceChart: React.FC<BalanceChartProps> = ({
  periodLabels,
  accounts,
  accountColors,
  monthlyData,
  summaries,
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
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

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
    const posMargin = maxPositive * 0.1;
    const negMargin = Math.abs(minNegative) * 0.1;
    return { min: minNegative - negMargin, max: maxPositive + posMargin };
  }, []);

  const barDatasets: MixedDataset[] = useMemo(
    () =>
      accounts.map((account, index) => ({
        label: account,
        data: monthlyData[index] ?? [],
        backgroundColor: accountColors[account] || '#808080',
        borderColor: 'rgba(0, 0, 0, 0.3)',
        borderWidth: 1,
        stack: 'stack',
        order: 2,
        type: 'bar' as const,
      })),
    [accounts, monthlyData, accountColors]
  );

  const totalSoldes = useMemo(
    () =>
      periodLabels.map((_, monthIndex) =>
        monthlyData.reduce((total, dataset) => total + (dataset[monthIndex] || 0), 0)
      ),
    [monthlyData, periodLabels]
  );

  const trendData = useMemo(() => {
    const n = totalSoldes.length;
    if (n === 0) return { trendData: [] as number[], coefficient: 0 };
    let sumX = 0,
      sumY = 0,
      sumXY = 0,
      sumX2 = 0;
    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += totalSoldes[i];
      sumXY += i * totalSoldes[i];
      sumX2 += i * i;
    }
    const denom = n * sumX2 - sumX * sumX;
    const a = denom !== 0 ? (n * sumXY - sumX * sumY) / denom : 0;
    const b = (sumY - a * sumX) / n;
    return {
      trendData: Array.from({ length: n }, (_, i) => a * i + b),
      coefficient: a,
    };
  }, [totalSoldes]);

  const trendDataset: MixedDataset = useMemo(
    () => ({
      label: t('chart.trendLine', { coefficient: trendData.coefficient.toFixed(2) }),
      data: trendData.trendData,
      type: 'line' as const,
      fill: false,
      borderColor: isDarkMode ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.7)',
      borderWidth: 2,
      pointRadius: 0,
      pointHoverRadius: 0,
      tension: 0,
      order: 1,
      stack: 'trend',
    }),
    [trendData, isDarkMode, t]
  );

  const initialLimits = useMemo(
    () => calculateYAxisLimits([...barDatasets, trendDataset]),
    [barDatasets, trendDataset, calculateYAxisLimits]
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
          title: {
            display: true,
            text: t('financeGlobal.currentBalance'),
            color: chartAxisColor(isDarkMode),
          },
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
          labels: { color: chartAxisColor(isDarkMode) },
        },
        tooltip: {
          ...chartTooltipTheme(isDarkMode),
          callbacks: {
            label(ctx) {
              const label = ctx.dataset.label || '';
              if (ctx.parsed.y !== null) return `${label}: ${formatMoney(ctx.parsed.y)}`;
              return label;
            },
          },
        },
      },
    }),
    [initialLimits, isDarkMode, t, granularity]
  );

  const tableColumns: FinanceTableColumn[] = useMemo(
    () => [
      { key: 'code', label: t('financeGlobal.abbreviation'), sticky: true, width: 80 },
      { key: 'name', label: t('financeGlobal.fullName'), sticky: true, width: 200 },
      { key: 'avg', label: t('financeGlobal.average'), sticky: true, width: 110, align: 'right' },
      { key: 'bal', label: t('financeGlobal.currentBalance'), sticky: true, width: 120, align: 'right' },
      ...periodLabels.map((label, i) => ({
        key: `p-${i}`,
        label,
        align: 'right' as const,
      })),
    ],
    [periodLabels, t]
  );

  const tableRows: FinanceTableRow[] = useMemo(() => {
    const rows: FinanceTableRow[] = summaries.map((acc, rowIndex) => {
      const label = acc.accountName;
      const dataRow = monthlyData[accounts.indexOf(label)] ?? [];
      const avg =
        dataRow.length > 0 ? dataRow.reduce((a, b) => a + b, 0) / dataRow.length : acc.balance;
      return {
        id: String(acc.accountId),
        isOdd: rowIndex % 2 !== 0,
        cells: [
          { content: acc.accountCode, text: acc.accountCode },
          {
            content: (
              <span className="flex items-center gap-2">
                <span className="finance-color-dot" style={{ backgroundColor: acc.color }} />
                {acc.accountName}
              </span>
            ),
            text: acc.accountName,
          },
          { content: formatCellMoney(avg), value: avg, text: avg, align: 'right' },
          {
            content: formatCellMoney(acc.balance),
            value: acc.balance,
            text: acc.balance,
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

    if (periodLabels.length > 0 && monthlyData.length > 0) {
      const totals = periodLabels.map((_, i) =>
        monthlyData.reduce((s, row) => s + (row[i] ?? 0), 0)
      );
      rows.push({
        id: 'total',
        isTotal: true,
        cells: [
          { content: t('financeGlobal.total'), text: t('financeGlobal.total') },
          { content: '', text: '' },
          { content: '', text: '' },
          {
            content: formatCellMoney(totals[totals.length - 1] ?? 0),
            value: totals[totals.length - 1] ?? 0,
            text: totals[totals.length - 1] ?? 0,
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
  }, [summaries, monthlyData, accounts, periodLabels, t]);

  return (
    <div className="finance-chart-table-layout">
      <div className="finance-global-chart-container chart-container-with-toolbar finance-chart-pane">
        <div className="chart active">
          <ScrollablePeriodChart granularity={granularity} labelCount={periodLabels.length}>
            <Bar
              ref={chartRef}
              data={{ labels: periodLabels, datasets: [...barDatasets, trendDataset] as never }}
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
        exportFileName="finance_solde"
        exportSheetName={t('finance.tabBalance')}
      />
    </div>
  );
};

export default BalanceChart;
