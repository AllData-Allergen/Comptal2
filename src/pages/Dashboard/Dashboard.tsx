import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import {
  Building2,
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  FileDown,
  Loader2,
  Settings,
  Tags,
} from 'lucide-react';
import { differenceInMonths, format, parseISO, subYears } from 'date-fns';
import { Account, Category, CategoryGroup } from '../../types/models';
import { ConfigService } from '../../services/ConfigService';
import {
  AccountBalance,
  autoGranularity,
  CategoryTotal,
  DistinctPeriods,
  KpiStats,
  StatsFilters,
  StatsService,
} from '../../services/StatsService';
import { ExportService } from '../../services/ExportService';
import { Logger } from '../../services/logger';
import { AmortissementService } from '../../services/AmortissementService';
import { AmortissementSeries } from '../../types/amortissement';
import { toIsoDate } from '../../utils/dateFormats';
import { getPeriodLabel, sortPeriodKeys } from '../../utils/periodKeys';
import {
  aggregateCategoryTotals,
  CategoryAggregation,
} from '../../utils/categoryAggregate';
import { ChartGranularity } from '../../types/projection';
import FilterBox from '../../components/Dashboard/FilterBox';
import SearchBar from '../../components/Dashboard/SearchBar';
import PeriodFilterButtons from '../../components/Dashboard/PeriodFilterButtons';
import DashboardViewTabs, { DashboardViewTab } from '../../components/Dashboard/DashboardViewTabs';
import DashboardChartsPanel from '../../components/Dashboard/DashboardChartsPanel';
import DashboardSummaryPanel from '../../components/Dashboard/DashboardSummaryPanel';
import DashboardSettingsModal from '../../components/Dashboard/DashboardSettingsModal';
import { SettingsService } from '../../services/SettingsService';
import { EmetteurService } from '../../services/EmetteurService';
import {
  DashboardSettingsService,
  defaultDashboardSettings,
} from '../../services/DashboardSettingsService';
import {
  DashboardInsightsService,
  EMPTY_DASHBOARD_INSIGHTS,
} from '../../services/DashboardInsightsService';
import { DashboardInsights, DashboardSettings } from '../../types/dashboard';

const EMPTY_PERIODS: DistinctPeriods = { weeks: [], months: [], years: [] };

const DashboardPage: React.FC = () => {
  const { t } = useTranslation();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryGroups, setCategoryGroups] = useState<CategoryGroup[]>([]);
  const [categoryAggregation, setCategoryAggregation] =
    useState<CategoryAggregation>('category');
  const [bounds, setBounds] = useState({ min: '', max: '' });
  const [periods, setPeriods] = useState<DistinctPeriods>(EMPTY_PERIODS);
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');
  const [selectedAccounts, setSelectedAccounts] = useState<Set<string>>(new Set());
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<DashboardViewTab>('summary');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isAccountFilterCollapsed, setIsAccountFilterCollapsed] = useState(false);
  const [isCategoryFilterCollapsed, setIsCategoryFilterCollapsed] = useState(false);
  const [isPeriodFilterCollapsed, setIsPeriodFilterCollapsed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isFiltering, setIsFiltering] = useState(false);
  const [metaLoaded, setMetaLoaded] = useState(false);
  const [hasAnyTransactions, setHasAnyTransactions] = useState(true);
  const [kpis, setKpis] = useState<KpiStats>({
    income: 0,
    expenses: 0,
    net: 0,
    count: 0,
    largestIncome: 0,
    largestExpense: 0,
    avgAmount: 0,
  });
  const [catTotals, setCatTotals] = useState<CategoryTotal[]>([]);
  const [accBalances, setAccBalances] = useState<AccountBalance[]>([]);
  const [lineLabels, setLineLabels] = useState<string[]>([]);
  const [lineSeries, setLineSeries] = useState<Array<{ label: string; color: string; data: number[] }>>([]);
  const [granularity, setGranularity] = useState<ChartGranularity>('month');
  const [exportBusy, setExportBusy] = useState(false);
  const [dashSettings, setDashSettings] = useState<DashboardSettings>(() =>
    defaultDashboardSettings({
      invoicingMenu: true,
      associationMenu: true,
      contactsMenu: true,
      registerMenu: true,
      amortissementMenu: true,
      hasInvoices: false,
      hasDonations: false,
      hasImmobilisations: false,
    })
  );
  const [settingsDraft, setSettingsDraft] = useState<DashboardSettings>(dashSettings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [insights, setInsights] = useState<DashboardInsights>(EMPTY_DASHBOARD_INSIGHTS);
  const [amortissementSeries, setAmortissementSeries] = useState<AmortissementSeries | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [acc, cat, groups, dates, distinct, appSettings, emetteur] = await Promise.all([
          ConfigService.listAccounts(),
          ConfigService.listCategories(),
          ConfigService.listCategoryGroups(),
          StatsService.dateBounds(),
          StatsService.distinctPeriods(),
          SettingsService.load(),
          EmetteurService.loadEmetteurExtended(),
        ]);
        const loadedSettings = await DashboardSettingsService.load({
          invoicingMenu: appSettings.menuVisibility.invoicing,
          associationMenu: appSettings.menuVisibility.association,
          contactsMenu: appSettings.menuVisibility.clients,
          registerMenu: appSettings.menuVisibility.register,
          amortissementMenu: appSettings.menuVisibility.amortissement,
          emetteurType: emetteur?.type,
        });
        setDashSettings(loadedSettings);
        setSettingsDraft(loadedSettings);
        setAccounts(acc);
        setCategories(cat);
        setCategoryGroups(groups);
        setSelectedAccounts(new Set(acc.map((a) => String(a.id))));
        setSelectedCategories(new Set(cat.map((c) => c.code)));
        setPeriods(distinct);
        const min = dates.min ?? toIsoDate(subYears(new Date(), 1));
        const max = dates.max ?? toIsoDate(new Date());
        setBounds({ min, max });
        setHasAnyTransactions(!!dates.min && !!dates.max);
        setDateStart(min);
        setDateEnd(max);
        setGranularity(autoGranularity(min, max));
        setMetaLoaded(true);
      } catch (err) {
        Logger.error('Dashboard.meta', err);
        toast.error(t('common.error'));
      }
    })();
  }, [t]);

  const handlePeriodChange = (start: string, end: string) => {
    setDateStart(start);
    setDateEnd(end);
  };

  const accountIds = useMemo(() => {
    if (accounts.length === 0) return undefined;
    if (selectedAccounts.size === accounts.length) return undefined;
    return Array.from(selectedAccounts).map(Number);
  }, [selectedAccounts, accounts]);

  const categoryCodes = useMemo(() => {
    if (categories.length === 0) return undefined;
    if (selectedCategories.size === categories.length) return undefined;
    return Array.from(selectedCategories);
  }, [selectedCategories, categories]);

  const filters: StatsFilters = useMemo(
    () => ({
      accountIds,
      categoryCodes,
      dateStart,
      dateEnd,
      search: search || undefined,
      excludeCategories: ['X'],
    }),
    [accountIds, categoryCodes, dateStart, dateEnd, search]
  );

  const load = useCallback(async () => {
    if (!dateStart || !dateEnd || !metaLoaded) return;
    setIsFiltering(true);
    try {
      const chartFilters = { ...filters, excludeCategories: ['X', 'Y'] as string[] };
      const [kpi, cats, bals, seriesRows, insightsResult, amortSeries] = await Promise.all([
        StatsService.kpis(filters),
        StatsService.categoryTotals(chartFilters),
        StatsService.accountBalancesAt(dateEnd, accountIds),
        StatsService.balancesOverPeriod(dateStart, dateEnd, granularity, accountIds),
        DashboardInsightsService.load({
          filters,
          granularity,
          donationsByDonorMode: dashSettings.donationsByDonorMode,
          include: {
            invoicing:
              dashSettings.widgets.charts.invoiceVsPayment ||
              dashSettings.widgets.charts.invoiceAging ||
              dashSettings.widgets.summary.invoicingKpis ||
              dashSettings.widgets.summary.legalReminders,
            association:
              dashSettings.widgets.charts.donationsByDonor ||
              dashSettings.widgets.summary.associationKpis ||
              dashSettings.widgets.summary.legalReminders,
            contacts:
              dashSettings.widgets.summary.contactKpis ||
              dashSettings.widgets.summary.legalReminders,
            reminders: dashSettings.widgets.summary.legalReminders,
            register: SettingsService.current.menuVisibility.register,
          },
        }).catch((error) => {
          Logger.error('Dashboard.insights', error);
          return EMPTY_DASHBOARD_INSIGHTS;
        }),
        dashSettings.widgets.charts.amortissement
          ? AmortissementService.buildAmortissementSeries(granularity, dateStart, dateEnd).catch(
              (error) => {
                Logger.error('Dashboard.amortissement', error);
                return null;
              }
            )
          : Promise.resolve(null),
      ]);
      setKpis(kpi);
      setCatTotals(cats);
      setAccBalances(bals);
      setInsights(insightsResult);
      setAmortissementSeries(amortSeries);

      const periodKeys = sortPeriodKeys(
        Array.from(new Set(seriesRows.map((r) => r.period))),
        granularity
      );
      const byAcc = new Map<number, { label: string; color: string; data: number[] }>();
      for (const row of seriesRows) {
        if (!byAcc.has(row.accountId)) {
          byAcc.set(row.accountId, {
            label: row.code,
            color: row.color,
            data: periodKeys.map(() => 0),
          });
        }
      }
      for (const row of seriesRows) {
        const idx = periodKeys.indexOf(row.period);
        const s = byAcc.get(row.accountId);
        if (s && idx >= 0) s.data[idx] = row.balance;
      }
      setLineLabels(periodKeys.map((k) => getPeriodLabel(k, granularity)));
      setLineSeries(Array.from(byAcc.values()));
    } catch (err) {
      Logger.error('Dashboard.load', err);
      toast.error(t('common.error'));
    } finally {
      setIsFiltering(false);
      setIsLoading(false);
    }
  }, [filters, accountIds, dateStart, dateEnd, metaLoaded, granularity, dashSettings, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const months = useMemo(() => {
    if (!dateStart || !dateEnd) return 1;
    return Math.max(1, differenceInMonths(parseISO(dateEnd), parseISO(dateStart)) + 1);
  }, [dateStart, dateEnd]);

  const aggregatedCategories = useMemo(
    () =>
      aggregateCategoryTotals(
        catTotals,
        categories,
        categoryGroups,
        t('edition.ungroupedCategories'),
        categoryAggregation
      ),
    [catTotals, categories, categoryGroups, categoryAggregation, t]
  );

  const handleExport = async () => {
    setExportBusy(true);
    try {
      await ExportService.exportTransactionsCsv(filters);
      toast.success(t('dashboard.exported'));
    } catch (err) {
      Logger.error('Dashboard.export', err);
      toast.error(t('common.error'));
    } finally {
      setExportBusy(false);
    }
  };

  const openSettings = () => {
    setSettingsDraft(dashSettings);
    setSettingsOpen(true);
  };

  const saveSettings = async () => {
    setSettingsSaving(true);
    try {
      await DashboardSettingsService.save(settingsDraft);
      setDashSettings(settingsDraft);
      setSettingsOpen(false);
      toast.success(t('dashboard.settings.saved'));
    } catch (err) {
      Logger.error('Dashboard.saveSettings', err);
      toast.error(t('common.error'));
    } finally {
      setSettingsSaving(false);
    }
  };

  const toggleAccount = (id: string) => {
    setSelectedAccounts((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllAccounts = () => {
    setSelectedAccounts((prev) =>
      prev.size === accounts.length ? new Set() : new Set(accounts.map((a) => String(a.id)))
    );
  };

  const toggleCategory = (code: string) => {
    setSelectedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const toggleAllCategories = () => {
    setSelectedCategories((prev) =>
      prev.size === categories.length ? new Set() : new Set(categories.map((c) => c.code))
    );
  };

  const accountFilterItems = accounts.map((a) => ({
    id: String(a.id),
    label: a.code,
    color: a.color,
    checked: selectedAccounts.has(String(a.id)),
  }));

  const categoryFilterItems = categories.map((c) => ({
    id: c.code,
    label: `${c.code} — ${c.name}`,
    color: c.color,
    checked: selectedCategories.has(c.code),
  }));

  if (isLoading && !metaLoaded) {
    return (
      <div className="dashboard-loading">
        <Loader2 size={32} className="dashboard-loading-spinner" />
        <p>{t('dashboard.loading')}</p>
      </div>
    );
  }

  if (metaLoaded && !hasAnyTransactions) {
    return (
      <div className="dashboard-empty">
        <h1
          className="text-2xl font-bold"
          style={{ color: 'var(--invoicing-gray-900)' }}
          data-tour="onb-dashboard-header"
        >
          {t('pages.dashboard')}
        </h1>
        <p>{t('dashboard.noData')}</p>
        <Link to="/upload" className="ct-btn-primary">
          {t('dashboard.importCta')}
        </Link>
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      <aside className={`dashboard-sidebar ${isSidebarCollapsed ? 'collapsed' : ''}`}>
        <div className="sidebar-header">
          {!isSidebarCollapsed && <h3>{t('dashboard.filters')}</h3>}
          <button
            type="button"
            className="sidebar-collapse-button"
            onClick={() => setIsSidebarCollapsed((v) => !v)}
            title={
              isSidebarCollapsed
                ? t('dashboard.expandSidebar')
                : `${t('dashboard.collapseSidebar')} — ${selectedAccounts.size}/${accounts.length} ${t('dashboard.accounts')}, ${selectedCategories.size}/${categories.length} ${t('dashboard.categories')}`
            }
          >
            {isSidebarCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
        </div>

        {isSidebarCollapsed && (
          <div className="sidebar-collapsed-badges">
            <span
              className="sidebar-mini-badge"
              title={`${t('dashboard.accounts')}: ${selectedAccounts.size}/${accounts.length}`}
            >
              <Building2 size={16} aria-hidden />
              <span className="sidebar-mini-badge-value">{selectedAccounts.size}</span>
            </span>
            <span
              className="sidebar-mini-badge"
              title={`${t('dashboard.categories')}: ${selectedCategories.size}/${categories.length}`}
            >
              <Tags size={16} aria-hidden />
              <span className="sidebar-mini-badge-value">{selectedCategories.size}</span>
            </span>
            {dateStart && dateEnd && (
              <span
                className="sidebar-mini-badge"
                title={`${t('dashboard.periodLabel')}: ${format(parseISO(dateStart), 'dd/MM/yyyy')} → ${format(parseISO(dateEnd), 'dd/MM/yyyy')}`}
              >
                <Calendar size={16} aria-hidden />
              </span>
            )}
          </div>
        )}

        {!isSidebarCollapsed && (
          <div className="sidebar-filter-stack">
            <div
              className={`sidebar-filter-section sidebar-filter-section-grow${isAccountFilterCollapsed ? ' is-collapsed' : ''}`}
            >
              <div
                className="filter-section-header"
                onClick={() => setIsAccountFilterCollapsed((v) => !v)}
              >
                <h5>
                  <Building2 size={16} />
                  {t('dashboard.accounts')}
                  <span className="filter-section-count">{selectedAccounts.size}</span>
                </h5>
                {isAccountFilterCollapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
              </div>
              {!isAccountFilterCollapsed && (
                <div className="filter-section-body">
                  <FilterBox
                    items={accountFilterItems}
                    onToggle={toggleAccount}
                    onToggleAll={toggleAllAccounts}
                  />
                </div>
              )}
            </div>

            <div
              className={`sidebar-filter-section sidebar-filter-section-grow${isCategoryFilterCollapsed ? ' is-collapsed' : ''}`}
            >
              <div
                className="filter-section-header"
                onClick={() => setIsCategoryFilterCollapsed((v) => !v)}
              >
                <h5>
                  <Tags size={16} />
                  {t('dashboard.categories')}
                  <span className="filter-section-count">{selectedCategories.size}</span>
                </h5>
                {isCategoryFilterCollapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
              </div>
              {!isCategoryFilterCollapsed && (
                <div className="filter-section-body">
                  <FilterBox
                    items={categoryFilterItems}
                    onToggle={toggleCategory}
                    onToggleAll={toggleAllCategories}
                  />
                </div>
              )}
            </div>

            <div
              className={`sidebar-filter-section sidebar-filter-section-period${isPeriodFilterCollapsed ? ' is-collapsed' : ''}`}
            >
              <div
                className="filter-section-header"
                onClick={() => setIsPeriodFilterCollapsed((v) => !v)}
              >
                <h5>
                  <Calendar size={16} />
                  {t('dashboard.periodLabel')}
                </h5>
                {isPeriodFilterCollapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
              </div>
              {!isPeriodFilterCollapsed && (
                <div className="filter-section-body">
                  <PeriodFilterButtons
                    minDate={bounds.min}
                    maxDate={bounds.max}
                    start={dateStart}
                    end={dateEnd}
                    weeks={periods.weeks}
                    months={periods.months}
                    years={periods.years}
                    onPeriodChange={handlePeriodChange}
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </aside>

      <main className="dashboard-main-content">
        <div className="dashboard-header" data-tour="onb-dashboard-header">
          <h1>{t('pages.dashboard')}</h1>
          <div className="dashboard-header-actions">
            <button
              type="button"
              className="export-button"
              onClick={openSettings}
              title={t('dashboard.settings.title')}
            >
              <Settings size={20} />
            </button>
            <button
              type="button"
              className="export-button"
              onClick={() => void handleExport()}
              disabled={exportBusy}
              title={t('dashboard.exportTitle')}
            >
              {exportBusy ? <Loader2 size={20} className="dashboard-loading-spinner" /> : <FileDown size={20} />}
            </button>
          </div>
        </div>

        <div className="dashboard-main-scroll">
          <div className="dashboard-search-section">
            {dateStart && dateEnd && (
              <div className="date-range-display-badge">
                <span className="date-chip">{format(parseISO(dateStart), 'dd/MM/yyyy')}</span>
                <span className="date-range-arrow">→</span>
                <span className="date-chip">{format(parseISO(dateEnd), 'dd/MM/yyyy')}</span>
              </div>
            )}
            <div className="search-bar-wrapper">
              <SearchBar value={search} onChange={setSearch} />
            </div>
          </div>

          <DashboardViewTabs active={activeTab} onChange={setActiveTab} />

          <div className="filtering-overlay">
          {isFiltering && (
            <div className="filtering-indicator" aria-busy="true">
              <Loader2 size={24} className="dashboard-loading-spinner" />
              <span>{t('dashboard.filtering')}</span>
            </div>
          )}

          <div className={`dashboard-tab-panel ${activeTab === 'charts' ? 'active' : ''}`}>
            <DashboardChartsPanel
              catTotals={aggregatedCategories.totals}
              categories={aggregatedCategories.categories}
              kpis={kpis}
              lineLabels={lineLabels}
              lineSeries={lineSeries}
              granularity={granularity}
              onGranularityChange={setGranularity}
              charts={dashSettings.widgets.charts}
              insights={insights}
              donationsByDonorMode={dashSettings.donationsByDonorMode}
              unlinkedInvoices={insights.invoicing.unlinkedInvoiceCount}
              unlinkedDonations={insights.association.unlinkedDonationCount}
              categoryAggregation={categoryAggregation}
              onCategoryAggregationChange={setCategoryAggregation}
              amortissementSeries={amortissementSeries}
            />
          </div>

          <div className={`dashboard-tab-panel ${activeTab === 'summary' ? 'active' : ''}`}>
            <DashboardSummaryPanel
              kpis={kpis}
              accBalances={accBalances}
              accounts={accounts}
              catTotals={aggregatedCategories.totals}
              categories={aggregatedCategories.categories}
              months={months}
              dateStart={dateStart}
              dateEnd={dateEnd}
              insights={insights}
              summary={dashSettings.widgets.summary}
              categoryAggregation={categoryAggregation}
              onCategoryAggregationChange={setCategoryAggregation}
            />
          </div>
          </div>
        </div>
      </main>
      <DashboardSettingsModal
        isOpen={settingsOpen}
        settings={settingsDraft}
        onChange={setSettingsDraft}
        onClose={() => setSettingsOpen(false)}
        onSave={() => void saveSettings()}
        saving={settingsSaving}
      />
    </div>
  );
};

export default DashboardPage;
