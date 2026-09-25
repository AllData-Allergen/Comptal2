import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Bar, Doughnut } from 'react-chartjs-2';
import { ChartOptions } from 'chart.js';
import { ContactInsights } from '../../types/dashboard';
import { useTheme } from '../../hooks/useTheme';
import {
  chartAxisColor,
  chartGridColor,
  chartPastelNamed,
  chartSurfaceColor,
  chartTooltipTheme,
} from '../../utils/chartPastel';
import '../../utils/registerCharts';
import FinanceInsightKpis from './FinanceInsightKpis';
import FinanceExcelExportButton from './FinanceExcelExportButton';

interface ContactsTabProps {
  data: ContactInsights;
}

const ContactsTab: React.FC<ContactsTabProps> = ({ data }) => {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const axis = chartAxisColor(isDark);
  const grid = chartGridColor(isDark);
  const tooltip = chartTooltipTheme(isDark);
  const surface = chartSurfaceColor(isDark);

  const clientsOnly = Math.max(0, data.clients - data.both);
  const donorsOnly = Math.max(0, data.donors - data.both);
  const roleValues = [clientsOnly, donorsOnly, data.both];
  const roleTotal = roleValues.reduce((sum, value) => sum + value, 0);

  const doughnutData = useMemo(() => {
    const labels = [
      t('financeGlobal.clientsOnly'),
      t('financeGlobal.donorsOnly'),
      t('financeGlobal.bothRoles'),
    ];
    const colors = [chartPastelNamed('blue'), chartPastelNamed('teal'), chartPastelNamed('purple')];
    const chartLabels: string[] = [];
    const chartValues: number[] = [];
    const chartColors: string[] = [];
    const sep = roleTotal * 0.015;
    roleValues.forEach((value, index) => {
      if (value <= 0) return;
      chartLabels.push(labels[index]!);
      chartValues.push(value);
      chartColors.push(colors[index]!);
      if (sep > 0) {
        chartLabels.push('');
        chartValues.push(sep);
        chartColors.push(surface);
      }
    });
    return {
      labels: chartLabels,
      datasets: [{ data: chartValues, backgroundColor: chartColors, borderWidth: 0 }],
    };
  }, [roleTotal, roleValues, surface, t, isDark]);

  const doughnutOptions: ChartOptions<'doughnut'> = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      cutout: '58%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: axis, filter: (item) => Boolean(item.text) },
        },
        tooltip: {
          ...tooltip,
          filter: (item) => Boolean(item.label),
          callbacks: {
            label(ctx) {
              const value = Number(ctx.parsed);
              const pct = roleTotal > 0 ? ((value / roleTotal) * 100).toFixed(1) : '0';
              return `${ctx.label} : ${value} (${pct} %)`;
            },
          },
        },
      },
    }),
    [axis, tooltip, roleTotal]
  );

  const incompleteTotal = data.incomplete + data.missingSiren;
  const incompleteData = useMemo(
    () => ({
      labels: [t('dashboard.contacts.incomplete'), t('dashboard.contacts.missingSiren')],
      datasets: [
        {
          data: [data.incomplete, data.missingSiren],
          backgroundColor: [chartPastelNamed('orange'), chartPastelNamed('red')],
          borderRadius: 4,
        },
      ],
    }),
    [data.incomplete, data.missingSiren, t, isDark]
  );

  const incompleteOptions: ChartOptions<'bar'> = useMemo(
    () => ({
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          ...tooltip,
          callbacks: {
            label(ctx) {
              return `${ctx.label} : ${Number(ctx.parsed.x ?? 0)}`;
            },
          },
        },
      },
      scales: {
        x: { beginAtZero: true, ticks: { color: axis, precision: 0 }, grid: { color: grid } },
        y: { ticks: { color: axis }, grid: { display: false } },
      },
    }),
    [axis, grid, tooltip]
  );

  return (
    <div className="finance-insight-tab">
      <FinanceExcelExportButton
        fileName="finance_contacts"
        sheetName={t('financeGlobal.contactsTab')}
        headers={[t('financeGlobal.category'), t('financeGlobal.total')]}
        rows={[
          [t('financeGlobal.clientsOnly'), clientsOnly],
          [t('financeGlobal.donorsOnly'), donorsOnly],
          [t('financeGlobal.bothRoles'), data.both],
          [t('dashboard.contacts.incomplete'), data.incomplete],
          [t('dashboard.contacts.missingSiren'), data.missingSiren],
          [t('dashboard.contacts.total'), data.total],
        ]}
      />
      <FinanceInsightKpis
        items={[
          { id: 'total', label: t('dashboard.contacts.total'), value: String(data.total) },
          { id: 'clients', label: t('financeGlobal.clientsOnly'), value: String(data.clients) },
          { id: 'donors', label: t('dashboard.association.donors'), value: String(data.donors) },
        ]}
      />
      <div className="finance-insight-charts">
        <div className="finance-global-chart-container finance-insight-chart">
          <h3>{t('financeGlobal.contactRoles')}</h3>
          {roleTotal > 0 ? (
            <div className="finance-insight-canvas">
              <Doughnut data={doughnutData} options={doughnutOptions} />
            </div>
          ) : (
            <p className="finance-empty-inline">{t('dashboard.noChartData')}</p>
          )}
        </div>
        <div className="finance-global-chart-container finance-insight-chart">
          <h3>{t('financeGlobal.incompleteContacts')}</h3>
          {incompleteTotal > 0 ? (
            <div className="finance-insight-canvas">
              <Bar data={incompleteData} options={incompleteOptions} />
            </div>
          ) : (
            <p className="finance-empty-inline">{t('dashboard.noChartData')}</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default ContactsTab;
