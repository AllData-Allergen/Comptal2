import React, { useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, ChartOptions } from 'chart.js';
import { formatMoney } from '../../utils/amounts';
import { useTheme } from '../../hooks/useTheme';
import { DonorSeries } from '../../types/dashboard';
import { ChartGranularity } from '../../types/projection';
import { dashboardChartTheme, dashboardTooltipOptions } from '../../utils/dashboardChartTheme';
import { periodXTicks } from '../../utils/chartPeriodAxis';
import ScrollablePeriodChart from '../Common/ScrollablePeriodChart';
import '../../utils/registerCharts';

interface DonationsByDonorChartProps {
  labels: string[];
  donors: DonorSeries[];
  granularity: ChartGranularity;
}

const DonationsByDonorChart: React.FC<DonationsByDonorChartProps> = ({ labels, donors, granularity }) => {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const isDarkMode = theme === 'dark';
  const colors = dashboardChartTheme(isDarkMode);
  const chartRef = useRef<ChartJS<'bar'>>(null);

  const hasData = donors.some((donor) => donor.data.some((value) => value > 0));

  const chartData = useMemo(
    () => ({
      labels,
      datasets: donors.map((donor) => ({
        label: donor.label,
        data: donor.data,
        backgroundColor: donor.color,
        stack: 'dons',
        borderWidth: 0,
      })),
    }),
    [labels, donors]
  );

  const options: ChartOptions<'bar'> = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: colors.text, boxWidth: 12, font: { size: 11 } },
          onClick(event, legendItem, legend) {
            ChartJS.defaults.plugins.legend.onClick?.call(this, event, legendItem, legend);
          },
        },
        tooltip: {
          ...dashboardTooltipOptions(colors),
          callbacks: {
            label(context) {
              return `${context.dataset.label} : ${formatMoney(Number(context.parsed.y ?? 0))}`;
            },
          },
        },
      },
      scales: {
        x: {
          stacked: true,
          ticks: { ...periodXTicks(granularity, colors.text) },
          grid: { color: colors.grid },
        },
        y: {
          stacked: true,
          beginAtZero: true,
          ticks: { color: colors.text, callback: (value) => formatMoney(Number(value)) },
          grid: { color: colors.grid },
        },
      },
    }),
    [colors, granularity]
  );

  if (!hasData) {
    return <div className="chart-empty"><p>{t('dashboard.noChartData')}</p></div>;
  }

  return (
    <div className="chart-canvas-wrap">
      <ScrollablePeriodChart granularity={granularity} labelCount={labels.length}>
        <Bar ref={chartRef} data={chartData} options={options} />
      </ScrollablePeriodChart>
    </div>
  );
};

export default DonationsByDonorChart;
