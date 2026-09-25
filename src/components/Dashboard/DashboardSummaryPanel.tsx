import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowDownCircle,
  ArrowUpCircle,
  BarChart3,
  Coins,
  FileText,
  Handshake,
  Landmark,
  PiggyBank,
  Receipt,
  TrendingDown,
  Users,
  Wallet,
} from 'lucide-react';
import { Account, Category } from '../../types/models';
import { AccountBalance, CategoryTotal, KpiStats } from '../../services/StatsService';
import { DashboardInsights, DashboardSummaryWidgets } from '../../types/dashboard';
import { CategoryAggregation } from '../../utils/categoryAggregate';
import { formatMoney } from '../../utils/amounts';
import { formatFrDate } from '../../utils/dateFormats';
import CategoryAggToggle from '../Common/CategoryAggToggle';
import MiniAccountCards from './MiniAccountCards';
import MiniCategoryCards from './MiniCategoryCards';
import TopCategoriesList from './TopCategoriesList';
import DashboardLegalReminders from './DashboardLegalReminders';

interface DashboardSummaryPanelProps {
  kpis: KpiStats;
  accBalances: AccountBalance[];
  accounts: Account[];
  catTotals: CategoryTotal[];
  categories: Category[];
  months: number;
  dateStart: string;
  dateEnd: string;
  insights: DashboardInsights;
  summary: DashboardSummaryWidgets;
  categoryAggregation: CategoryAggregation;
  onCategoryAggregationChange: (value: CategoryAggregation) => void;
}

const DashboardSummaryPanel: React.FC<DashboardSummaryPanelProps> = ({
  kpis,
  accBalances,
  accounts,
  catTotals,
  categories,
  months,
  dateStart,
  dateEnd,
  insights,
  summary,
  categoryAggregation,
  onCategoryAggregationChange,
}) => {
  const { t } = useTranslation();
  const from = formatFrDate(dateStart);
  const to = formatFrDate(dateEnd);
  const inv = insights.invoicing;
  const asso = insights.association;
  const contacts = insights.contacts;

  const totalWealth = useMemo(
    () => accBalances.reduce((sum, a) => sum + a.balance, 0),
    [accBalances]
  );
  const savingsRate = kpis.income > 0 ? (kpis.net / kpis.income) * 100 : 0;
  const avgMonthlyExpenses = kpis.expenses / Math.max(months, 1);

  const defaultExplain = useMemo(
    () =>
      t('dashboard.explain.expenses', {
        from,
        to,
        amount: formatMoney(kpis.expenses),
      }),
    [t, from, to, kpis.expenses]
  );

  const [explain, setExplain] = useState(defaultExplain);

  useEffect(() => {
    setExplain(defaultExplain);
  }, [defaultExplain]);

  return (
    <>
      {summary.legalReminders && <DashboardLegalReminders reminders={insights.reminders} />}

      {summary.treasuryKpis && (
        <>
          <div className="main-cards">
            <button
              type="button"
              className="stat-card stat-card-balance"
              onMouseEnter={() =>
                setExplain(t('dashboard.explain.net', { from, to, amount: formatMoney(kpis.net) }))
              }
              onFocus={() =>
                setExplain(t('dashboard.explain.net', { from, to, amount: formatMoney(kpis.net) }))
              }
            >
              <div className="stat-card-body">
                <h5 className="stat-card-title">
                  <Wallet size={16} />
                  {t('dashboard.net')}
                </h5>
                <p className="stat-card-value">{formatMoney(kpis.net)}</p>
              </div>
            </button>
            <button
              type="button"
              className="stat-card stat-card-expenses"
              onMouseEnter={() =>
                setExplain(t('dashboard.explain.expenses', { from, to, amount: formatMoney(kpis.expenses) }))
              }
              onFocus={() =>
                setExplain(t('dashboard.explain.expenses', { from, to, amount: formatMoney(kpis.expenses) }))
              }
            >
              <div className="stat-card-body">
                <h5 className="stat-card-title">
                  <TrendingDown size={16} />
                  {t('dashboard.expenses')}
                </h5>
                <p className="stat-card-value">{formatMoney(kpis.expenses)}</p>
              </div>
            </button>
            <button
              type="button"
              className="stat-card stat-card-income"
              onMouseEnter={() =>
                setExplain(t('dashboard.explain.income', { from, to, amount: formatMoney(kpis.income) }))
              }
              onFocus={() =>
                setExplain(t('dashboard.explain.income', { from, to, amount: formatMoney(kpis.income) }))
              }
            >
              <div className="stat-card-body">
                <h5 className="stat-card-title">
                  <Coins size={16} />
                  {t('dashboard.income')}
                </h5>
                <p className="stat-card-value">{formatMoney(kpis.income)}</p>
              </div>
            </button>
          </div>

          <div className="dashboard-explain-panel" role="status">
            <p>{explain}</p>
            <p className="dashboard-explain-meta">
              {t('dashboard.tooltip.txCount', { count: kpis.count })}
            </p>
          </div>

          <div className="dashboard-secondary-kpis">
            <button
              type="button"
              className="secondary-kpi-card"
              onMouseEnter={() =>
                setExplain(t('dashboard.explain.accountTotal', { date: to, amount: formatMoney(totalWealth) }))
              }
            >
              <span className="secondary-kpi-label">
                <Landmark size={14} /> {t('dashboard.summary.wealth')}
              </span>
              <div className="secondary-kpi-value">{formatMoney(totalWealth)}</div>
            </button>
            <button
              type="button"
              className="secondary-kpi-card"
              onMouseEnter={() => setExplain(t('dashboard.tooltip.savingsRate'))}
            >
              <span className="secondary-kpi-label">
                <PiggyBank size={14} /> {t('dashboard.summary.savingsRate')}
              </span>
              <div className={`secondary-kpi-value ${savingsRate >= 0 ? 'positive' : 'negative'}`}>
                {savingsRate.toFixed(1)} %
              </div>
            </button>
            <button
              type="button"
              className="secondary-kpi-card"
              onMouseEnter={() => setExplain(t('dashboard.tooltip.avgMonthlyExpenses'))}
            >
              <span className="secondary-kpi-label">
                <BarChart3 size={14} /> {t('dashboard.summary.avgMonthlyExpenses')}
              </span>
              <div className="secondary-kpi-value">{formatMoney(avgMonthlyExpenses)}</div>
            </button>
            <button
              type="button"
              className="secondary-kpi-card"
              onMouseEnter={() => setExplain(t('dashboard.tooltip.largestExpense'))}
            >
              <span className="secondary-kpi-label">{t('dashboard.summary.largestExpense')}</span>
              <div className="secondary-kpi-value">
                <ArrowDownCircle size={14} style={{ display: 'inline', marginRight: 4 }} />
                {formatMoney(kpis.largestExpense)}
              </div>
            </button>
            <button
              type="button"
              className="secondary-kpi-card"
              onMouseEnter={() => setExplain(t('dashboard.tooltip.largestIncome'))}
            >
              <span className="secondary-kpi-label">{t('dashboard.summary.largestIncome')}</span>
              <div className="secondary-kpi-value">
                <ArrowUpCircle size={14} style={{ display: 'inline', marginRight: 4 }} />
                {formatMoney(kpis.largestIncome)}
              </div>
            </button>
            <button
              type="button"
              className="secondary-kpi-card"
              onMouseEnter={() => setExplain(t('dashboard.tooltip.avgTransaction'))}
            >
              <span className="secondary-kpi-label">
                <Receipt size={14} /> {t('dashboard.summary.avgTransaction')}
              </span>
              <div className="secondary-kpi-value">{formatMoney(kpis.avgAmount)}</div>
            </button>
          </div>
        </>
      )}

      {summary.invoicingKpis && (
        <section className="dashboard-mini-section">
          <p className="dashboard-mini-section-title">{t('dashboard.invoicing.section')}</p>
          <div className="dashboard-secondary-kpis">
            <button type="button" className="secondary-kpi-card" onMouseEnter={() => setExplain(t('dashboard.explain.invoiced', { from, to, amount: formatMoney(inv.invoiced) }))}>
              <span className="secondary-kpi-label"><FileText size={14} /> {t('dashboard.invoicing.invoiced')}</span>
              <div className="secondary-kpi-value">{formatMoney(inv.invoiced)}</div>
            </button>
            <button type="button" className="secondary-kpi-card" onMouseEnter={() => setExplain(t('dashboard.explain.collected', { from, to, amount: formatMoney(inv.collected) }))}>
              <span className="secondary-kpi-label">{t('dashboard.invoicing.collected')}</span>
              <div className="secondary-kpi-value">{formatMoney(inv.collected)}</div>
            </button>
            <button type="button" className="secondary-kpi-card" onMouseEnter={() => setExplain(t('dashboard.explain.outstanding', { amount: formatMoney(inv.outstanding) }))}>
              <span className="secondary-kpi-label">{t('dashboard.invoicing.outstanding')}</span>
              <div className="secondary-kpi-value">{formatMoney(inv.outstanding)}</div>
            </button>
            <button type="button" className="secondary-kpi-card" onMouseEnter={() => setExplain(t('dashboard.explain.dso', { days: Math.round(inv.dsoDays) }))}>
              <span className="secondary-kpi-label">{t('dashboard.invoicing.dso')}</span>
              <div className="secondary-kpi-value">{Math.round(inv.dsoDays)} j</div>
            </button>
            <button type="button" className="secondary-kpi-card" onMouseEnter={() => setExplain(t('dashboard.explain.overdue', { count: inv.overdueCount, amount: formatMoney(inv.overdueAmount) }))}>
              <span className="secondary-kpi-label">{t('dashboard.invoicing.overdue')}</span>
              <div className="secondary-kpi-value">{inv.overdueCount} · {formatMoney(inv.overdueAmount)}</div>
            </button>
            <button type="button" className="secondary-kpi-card" onMouseEnter={() => setExplain(t('dashboard.explain.onTime', { rate: inv.onTimeRate.toFixed(1) }))}>
              <span className="secondary-kpi-label">{t('dashboard.invoicing.onTime')}</span>
              <div className="secondary-kpi-value">{inv.onTimeRate.toFixed(1)} %</div>
            </button>
            <button type="button" className="secondary-kpi-card" onMouseEnter={() => setExplain(t('dashboard.explain.unpaid', { rate: inv.unpaidRate.toFixed(1) }))}>
              <span className="secondary-kpi-label">{t('dashboard.invoicing.unpaid')}</span>
              <div className="secondary-kpi-value">{inv.unpaidRate.toFixed(1)} %</div>
            </button>
            <button type="button" className="secondary-kpi-card" onMouseEnter={() => setExplain(t('dashboard.explain.openQuotes', { count: inv.openQuotesCount, amount: formatMoney(inv.openQuotesAmount) }))}>
              <span className="secondary-kpi-label">{t('dashboard.invoicing.openQuotes')}</span>
              <div className="secondary-kpi-value">{inv.openQuotesCount} · {formatMoney(inv.openQuotesAmount)}</div>
            </button>
          </div>
        </section>
      )}

      {summary.associationKpis && (
        <section className="dashboard-mini-section">
          <p className="dashboard-mini-section-title">{t('dashboard.association.section')}</p>
          <div className="dashboard-secondary-kpis">
            <button type="button" className="secondary-kpi-card" onMouseEnter={() => setExplain(t('dashboard.explain.donationsTotal', { from, to, amount: formatMoney(asso.total), count: asso.count }))}>
              <span className="secondary-kpi-label"><Handshake size={14} /> {t('dashboard.association.total')}</span>
              <div className="secondary-kpi-value">{formatMoney(asso.total)}</div>
            </button>
            <button type="button" className="secondary-kpi-card" onMouseEnter={() => setExplain(t('dashboard.explain.donors', { count: asso.donorCount }))}>
              <span className="secondary-kpi-label">{t('dashboard.association.donors')}</span>
              <div className="secondary-kpi-value">{asso.donorCount}</div>
            </button>
            <button type="button" className="secondary-kpi-card" onMouseEnter={() => setExplain(t('dashboard.explain.donationAverage', { amount: formatMoney(asso.average) }))}>
              <span className="secondary-kpi-label">{t('dashboard.association.average')}</span>
              <div className="secondary-kpi-value">{formatMoney(asso.average)}</div>
            </button>
            <button type="button" className="secondary-kpi-card" onMouseEnter={() => setExplain(t('dashboard.explain.receiptsPending', { count: asso.receiptsPending }))}>
              <span className="secondary-kpi-label">{t('dashboard.association.receiptsPending')}</span>
              <div className="secondary-kpi-value">{asso.receiptsPending}</div>
            </button>
            <button type="button" className="secondary-kpi-card" onMouseEnter={() => setExplain(t('dashboard.explain.newReturning', { neu: asso.newDonors, returning: asso.returningDonors }))}>
              <span className="secondary-kpi-label">{t('dashboard.association.newReturning')}</span>
              <div className="secondary-kpi-value">{asso.newDonors} / {asso.returningDonors}</div>
            </button>
            <button type="button" className="secondary-kpi-card" onMouseEnter={() => setExplain(t('dashboard.explain.retention', { rate: asso.retentionRate == null ? '—' : `${asso.retentionRate.toFixed(1)} %` }))}>
              <span className="secondary-kpi-label">{t('dashboard.association.retention')}</span>
              <div className="secondary-kpi-value">{asso.retentionRate == null ? '—' : `${asso.retentionRate.toFixed(1)} %`}</div>
            </button>
            <button type="button" className="secondary-kpi-card" onMouseEnter={() => setExplain(t('dashboard.explain.top3', { rate: asso.top3Share.toFixed(1) }))}>
              <span className="secondary-kpi-label">{t('dashboard.association.top3')}</span>
              <div className="secondary-kpi-value">{asso.top3Share.toFixed(1)} %</div>
            </button>
            <button type="button" className="secondary-kpi-card" onMouseEnter={() => setExplain(t('dashboard.explain.anonymousNature', { anonymous: asso.anonymousShare.toFixed(1), nature: asso.natureShare.toFixed(1) }))}>
              <span className="secondary-kpi-label">{t('dashboard.association.mix')}</span>
              <div className="secondary-kpi-value">{asso.anonymousShare.toFixed(0)} % / {asso.natureShare.toFixed(0)} %</div>
            </button>
          </div>
        </section>
      )}

      {summary.contactKpis && (
        <section className="dashboard-mini-section">
          <p className="dashboard-mini-section-title">{t('dashboard.contacts.section')}</p>
          <div className="dashboard-secondary-kpis">
            <button type="button" className="secondary-kpi-card" onMouseEnter={() => setExplain(t('dashboard.explain.contacts', { total: contacts.total, clients: contacts.clients, donors: contacts.donors }))}>
              <span className="secondary-kpi-label"><Users size={14} /> {t('dashboard.contacts.total')}</span>
              <div className="secondary-kpi-value">{contacts.total}</div>
            </button>
            <button type="button" className="secondary-kpi-card" onMouseEnter={() => setExplain(t('dashboard.explain.incomplete', { count: contacts.incomplete }))}>
              <span className="secondary-kpi-label">{t('dashboard.contacts.incomplete')}</span>
              <div className="secondary-kpi-value">{contacts.incomplete}</div>
            </button>
            <button type="button" className="secondary-kpi-card" onMouseEnter={() => setExplain(t('dashboard.explain.missingSiren', { count: contacts.missingSiren }))}>
              <span className="secondary-kpi-label">{t('dashboard.contacts.missingSiren')}</span>
              <div className="secondary-kpi-value">{contacts.missingSiren}</div>
            </button>
            <button type="button" className="secondary-kpi-card" onMouseEnter={() => setExplain(t('dashboard.explain.incompleteDonors', { count: contacts.incompleteDonors }))}>
              <span className="secondary-kpi-label">{t('dashboard.contacts.incompleteDonors')}</span>
              <div className="secondary-kpi-value">{contacts.incompleteDonors}</div>
            </button>
            <button type="button" className="secondary-kpi-card" onMouseEnter={() => setExplain(t('dashboard.explain.unused', { count: contacts.unused }))}>
              <span className="secondary-kpi-label">{t('dashboard.contacts.unused')}</span>
              <div className="secondary-kpi-value">{contacts.unused}</div>
            </button>
          </div>
        </section>
      )}

      {summary.miniCards && (
        <>
          <section className="dashboard-mini-section">
            <div className="dashboard-mini-section-header">
              <p className="dashboard-mini-section-title">
                {t(
                  categoryAggregation === 'group'
                    ? 'dashboard.groupAverages'
                    : 'dashboard.categoryAverages'
                )}
              </p>
              <CategoryAggToggle
                value={categoryAggregation}
                onChange={onCategoryAggregationChange}
              />
            </div>
            <MiniCategoryCards
              totals={catTotals}
              categories={categories}
              months={months}
              totalExpenses={kpis.expenses}
              dateStart={dateStart}
              dateEnd={dateEnd}
              onExplain={setExplain}
            />
          </section>
          <section className="dashboard-mini-section">
            <p className="dashboard-mini-section-title">{t('dashboard.accountBalancesSection')}</p>
            <MiniAccountCards
              accounts={accBalances}
              accountConfigs={accounts}
              dateEnd={dateEnd}
              onExplain={setExplain}
            />
          </section>
        </>
      )}

      {summary.topCategories && (
        <section className="dashboard-mini-section">
          <div className="dashboard-mini-section-header">
            <p className="dashboard-mini-section-title">
              {t(
                categoryAggregation === 'group'
                  ? 'dashboard.summary.topExpensesByGroup'
                  : 'dashboard.summary.topExpenses'
              )}
            </p>
            {!summary.miniCards && (
              <CategoryAggToggle
                value={categoryAggregation}
                onChange={onCategoryAggregationChange}
              />
            )}
          </div>
          <TopCategoriesList
            totals={catTotals}
            categories={categories}
            totalExpenses={Math.abs(kpis.expenses)}
          />
        </section>
      )}
    </>
  );
};

export default DashboardSummaryPanel;
