import React from 'react';
import { useTranslation } from 'react-i18next';
import { Category } from '../../types/models';
import { CategoryTotal, KpiStats } from '../../services/StatsService';
import { ChartGranularity } from '../../types/projection';
import { DashboardChartWidgets, DashboardInsights, DonationsByDonorMode } from '../../types/dashboard';
import { CategoryAggregation } from '../../utils/categoryAggregate';
import CategoryAggToggle from '../Common/CategoryAggToggle';
import CategoryExpensesBarChart from './CategoryExpensesBarChart';
import IncomePieChart from './IncomePieChart';
import AccountBalanceLineChart from './AccountBalanceLineChart';
import ChartGranularityZoom from '../Common/ChartGranularityZoom';
import InvoiceVsPaymentChart from './InvoiceVsPaymentChart';
import InvoiceAgingChart from './InvoiceAgingChart';
import DonationsByDonorChart from './DonationsByDonorChart';
import AmortissementDashboardChart from './AmortissementDashboardChart';
import { AmortissementSeries } from '../../types/amortissement';

interface DashboardChartsPanelProps {
  catTotals: CategoryTotal[];
  categories: Category[];
  kpis: KpiStats;
  lineLabels: string[];
  lineSeries: Array<{ label: string; color: string; data: number[] }>;
  granularity: ChartGranularity;
  onGranularityChange: (granularity: ChartGranularity) => void;
  charts: DashboardChartWidgets;
  insights: DashboardInsights;
  donationsByDonorMode: DonationsByDonorMode;
  unlinkedInvoices: number;
  unlinkedDonations: number;
  categoryAggregation: CategoryAggregation;
  onCategoryAggregationChange: (value: CategoryAggregation) => void;
  amortissementSeries: AmortissementSeries | null;
}

const DashboardChartsPanel: React.FC<DashboardChartsPanelProps> = ({
  catTotals,
  categories,
  kpis,
  lineLabels,
  lineSeries,
  granularity,
  onGranularityChange,
  charts,
  insights,
  donationsByDonorMode,
  unlinkedInvoices,
  unlinkedDonations,
  categoryAggregation,
  onCategoryAggregationChange,
  amortissementSeries,
}) => {
  const { t } = useTranslation();
  const showTreasuryRow = charts.expensesByCategory || charts.incomePie;
  const byGroup = categoryAggregation === 'group';

  return (
    <div className="dashboard-charts-section">
      {showTreasuryRow && (
        <div className="dashboard-charts-row-top">
          {charts.expensesByCategory && (
            <div className="chart-container chart-container-bar">
              <div className="chart-container-header">
                <h2>
                  {t(
                    byGroup
                      ? 'dashboard.chart.expensesByGroup'
                      : 'dashboard.chart.expensesByCategory'
                  )}
                </h2>
                <CategoryAggToggle
                  value={categoryAggregation}
                  onChange={onCategoryAggregationChange}
                />
              </div>
              <CategoryExpensesBarChart
                totals={catTotals}
                categories={categories}
                totalExpenses={Math.abs(kpis.expenses)}
              />
            </div>
          )}
          {charts.incomePie && (
            <div className="chart-container chart-container-pie">
              <h2>{t('dashboard.pieIncome')}</h2>
              <IncomePieChart income={kpis.income} expenses={kpis.expenses} />
            </div>
          )}
        </div>
      )}

      {charts.accountBalances && (
        <div className="chart-container chart-container-line full-width">
          <div className="chart-container-header">
            <h2>{t('dashboard.accountBalances')}</h2>
            <ChartGranularityZoom granularity={granularity} onChange={onGranularityChange} />
          </div>
          <AccountBalanceLineChart labels={lineLabels} series={lineSeries} granularity={granularity} />
        </div>
      )}

      {(charts.invoiceVsPayment || charts.invoiceAging) && (
        <div className={`dashboard-charts-row-invoicing${charts.invoiceVsPayment && charts.invoiceAging ? '' : ' is-single'}`}>
          {charts.invoiceVsPayment && (
            <div className="chart-container chart-container-line">
              <div className="chart-container-header">
                <h2>{t('dashboard.chart.invoiceVsPayment')}</h2>
                <ChartGranularityZoom granularity={granularity} onChange={onGranularityChange} />
              </div>
              {unlinkedInvoices > 0 && (
                <p className="dashboard-filter-notice">
                  {t('dashboard.filterNotice.invoices', { count: unlinkedInvoices })}
                </p>
              )}
              <InvoiceVsPaymentChart series={insights.invoicing.series} granularity={granularity} />
            </div>
          )}
          {charts.invoiceAging && (
            <div className="chart-container chart-container-aging">
              <h2>{t('dashboard.chart.invoiceAging')}</h2>
              <InvoiceAgingChart aging={insights.invoicing.aging} />
            </div>
          )}
        </div>
      )}

      {charts.donationsByDonor && (
        <div className="chart-container chart-container-line full-width">
          <div className="chart-container-header">
            <h2>
              {donationsByDonorMode === 'cumulative'
                ? t('dashboard.chart.donationsByDonorCumulative')
                : t('dashboard.chart.donationsByDonor')}
            </h2>
            <ChartGranularityZoom granularity={granularity} onChange={onGranularityChange} />
          </div>
          {unlinkedDonations > 0 && (
            <p className="dashboard-filter-notice">
              {t('dashboard.filterNotice.donations', { count: unlinkedDonations })}
            </p>
          )}
          <DonationsByDonorChart
            labels={insights.association.labels}
            donors={insights.association.donors}
            granularity={granularity}
          />
        </div>
      )}

      {charts.amortissement && (
        <div className="chart-container chart-container-line full-width">
          <div className="chart-container-header">
            <h2>{t('amortissement.chartTitle')}</h2>
            <ChartGranularityZoom granularity={granularity} onChange={onGranularityChange} />
          </div>
          <AmortissementDashboardChart series={amortissementSeries} granularity={granularity} />
        </div>
      )}
    </div>
  );
};

export default DashboardChartsPanel;
