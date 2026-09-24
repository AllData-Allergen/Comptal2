import React, { useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Chart as ChartJS, ChartOptions } from 'chart.js';
import { Line } from 'react-chartjs-2';
import { AmortissementSeries } from '../../types/amortissement';
import { ChartGranularity } from '../../types/projection';
import { formatMoney } from '../../utils/amounts';
import { useTheme } from '../../hooks/useTheme';
import {
  chartPointBorder,
  dashboardChartTheme,
  dashboardTooltipOptions,
} from '../../utils/dashboardChartTheme';
import { chartGridCallback } from '../../utils/chartPastel';
import { periodXTicks } from '../../utils/chartPeriodAxis';
import ScrollablePeriodChart from '../Common/ScrollablePeriodChart';
import FinanceExcelExportButton from '../FinanceGlobal/FinanceExcelExportButton';
import '../../utils/registerCharts';

interface AmortissementChartViewProps {
  series: AmortissementSeries | null;
  granularity: ChartGranularity;
  /** Affiche le bouton d’export Excel (Finance globale). */
  showExcelExport?: boolean;
}

const AmortissementChartView: React.FC<AmortissementChartViewProps> = ({
  series,
  granularity,
  showExcelExport = false,
}) => {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const isDarkMode = theme === 'dark';
  const colors = dashboardChartTheme(isDarkMode);
  const chartRef = useRef<ChartJS<'line'>>(null);

  const data = useMemo(() => {
    if (!series || series.labels.length === 0) {
      return { labels: [] as string[], datasets: [] };
    }
    return {
      labels: series.labels,
      datasets: [
        {
          label: t('amortissement.chartVnc'),
          data: series.vnc,
          borderColor: '#2563eb',
          backgroundColor: '#2563eb',
          borderWidth: 2,
          fill: false,
          tension: 0.35,
          pointRadius: 3,
          pointHoverRadius: 5,
          pointBackgroundColor: '#2563eb',
          pointBorderColor: chartPointBorder(isDarkMode),
          pointBorderWidth: 2,
        },
        {
          label: t('amortissement.chartAmorti'),
          data: series.amortiCumule,
          borderColor: '#f59e0b',
          backgroundColor: '#f59e0b',
          borderWidth: 2,
          fill: false,
          tension: 0.35,
          pointRadius: 3,
          pointHoverRadius: 5,
          pointBackgroundColor: '#f59e0b',
          pointBorderColor: chartPointBorder(isDarkMode),
          pointBorderWidth: 2,
        },
        {
          label: t('amortissement.chartBrut'),
          data: series.brut,
          borderColor: '#94a3b8',
          backgroundColor: '#94a3b8',
          borderWidth: 1.5,
          borderDash: [6, 4],
          fill: false,
          tension: 0.2,
          pointRadius: 0,
          pointHoverRadius: 3,
        },
      ],
    };
  }, [series, t, isDarkMode]);

  const options = useMemo<ChartOptions<'line'>>(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: colors.text, boxWidth: 12, usePointStyle: true },
        },
        tooltip: {
          ...dashboardTooltipOptions(colors),
          callbacks: {
            label: (ctx) => `${ctx.dataset.label}: ${formatMoney(Number(ctx.parsed.y) || 0)}`,
          },
        },
      },
      scales: {
        x: {
          ticks: periodXTicks(granularity, colors.text),
          grid: { color: chartGridCallback(isDarkMode) },
        },
        y: {
          ticks: {
            color: colors.text,
            callback: (value) => formatMoney(Number(value)),
          },
          grid: { color: chartGridCallback(isDarkMode) },
        },
      },
    }),
    [colors, granularity, isDarkMode]
  );

  if (!series || series.labels.length === 0) {
    return (
      <p style={{ padding: '1rem', color: 'var(--invoicing-gray-600)', margin: 0 }}>
        {t('amortissement.chartEmpty')}
      </p>
    );
  }

  const exportRows = series.labels.map((label, i) => [
    label,
    series.brut[i] ?? 0,
    series.amortiCumule[i] ?? 0,
    series.vnc[i] ?? 0,
    series.dotation[i] ?? 0,
  ]);

  const chart = (
    <ScrollablePeriodChart granularity={granularity} labelCount={series.labels.length}>
      <Line ref={chartRef} data={data} options={options} />
    </ScrollablePeriodChart>
  );

  if (!showExcelExport) return chart;

  return (
    <div className="finance-amortissement-export">
      <FinanceExcelExportButton
        fileName="finance_amortissement"
        sheetName={t('financeGlobal.amortissementTab')}
        headers={[
          t('financeGlobal.period'),
          t('amortissement.chartBrut'),
          t('amortissement.chartAmorti'),
          t('amortissement.chartVnc'),
          t('amortissement.depreciationPerYear'),
        ]}
        rows={exportRows}
      />
      {chart}
    </div>
  );
};

export default AmortissementChartView;
