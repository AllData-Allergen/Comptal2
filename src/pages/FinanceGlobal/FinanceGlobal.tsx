import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import { Loader2, Upload, SearchX } from 'lucide-react';
import { Account, Category } from '../../types/models';
import { ChartGranularity } from '../../types/projection';
import { DEFAULT_FINANCE_TABS, FinanceTabConfig, FinanceTabId, financePresetForUsage, isFinanceTabAllowedForMode } from '../../types/finance';
import { DashboardInsights } from '../../types/dashboard';
import { ConfigService } from '../../services/ConfigService';
import { ProfileService } from '../../services/ProfileService';
import { SettingsService } from '../../services/SettingsService';
import { parseUsageMode } from '../../utils/usageMode';
import {
  autoGranularity,
  AccountSummary,
  BilanChartData,
  CategorySummary,
  DistinctPeriods,
  PeriodPoint,
  StatsFilters,
  StatsService,
} from '../../services/StatsService';
import { FinanceSettingsService } from '../../services/FinanceSettingsService';
import {
  DashboardInsightsService,
  EMPTY_DASHBOARD_INSIGHTS,
} from '../../services/DashboardInsightsService';
import { Logger } from '../../services/logger';
import { toIsoDate } from '../../utils/dateFormats';
import { getPeriodLabel, sortPeriodKeys } from '../../utils/periodKeys';
import ChartTabs from '../../components/FinanceGlobal/ChartTabs';
import FinanceToolbar from '../../components/FinanceGlobal/FinanceToolbar';
import FinanceChartConfigModal from '../../components/FinanceGlobal/FinanceChartConfigModal';
import MonthlyChart from '../../components/FinanceGlobal/MonthlyChart';
import BalanceChart from '../../components/FinanceGlobal/BalanceChart';
import ProjectionVsReality from '../../components/FinanceGlobal/ProjectionVsReality';
import BilanTab from '../../components/FinanceGlobal/BilanTab';
import FacturationTab from '../../components/FinanceGlobal/FacturationTab';
import DonsTab from '../../components/FinanceGlobal/DonsTab';
import ContactsTab from '../../components/FinanceGlobal/ContactsTab';
import AmortissementChart from '../../components/FinanceGlobal/AmortissementChart';
import { AmortissementService } from '../../services/AmortissementService';
import { AmortissementSeries } from '../../types/amortissement';

const EMPTY_PERIODS: DistinctPeriods = { weeks: [], months: [], years: [] };

const FinanceGlobalPage: React.FC = () => {
  const { t } = useTranslation();
  const [tab, setTab] = useState<FinanceTabId>('monthly');
  const [tabConfig, setTabConfig] = useState<FinanceTabConfig[]>(DEFAULT_FINANCE_TABS);
  const [tabDraft, setTabDraft] = useState<FinanceTabConfig[]>(DEFAULT_FINANCE_TABS);
  const [configOpen, setConfigOpen] = useState(false);
  const [configSaving, setConfigSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [bounds, setBounds] = useState({ min: '', max: '' });
  const [periods, setPeriods] = useState<DistinctPeriods>(EMPTY_PERIODS);
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');
  const [granularity, setGranularity] = useState<ChartGranularity>('month');
  const [selectedAccountIds, setSelectedAccountIds] = useState<Set<number>>(new Set());
  const [selectedCategoryCodes, setSelectedCategoryCodes] = useState<Set<string>>(new Set());
  const [hasAnyData, setHasAnyData] = useState(true);

  const [monthlyPoints, setMonthlyPoints] = useState<PeriodPoint[]>([]);
  const [balancePoints, setBalancePoints] = useState<
    Array<{ period: string; accountId: number; code: string; color: string; balance: number }>
  >([]);
  const [categorySummaries, setCategorySummaries] = useState<CategorySummary[]>([]);
  const [accountSummaries, setAccountSummaries] = useState<AccountSummary[]>([]);
  const [realityPoints, setRealityPoints] = useState<PeriodPoint[]>([]);
  const [bilanData, setBilanData] = useState<BilanChartData | null>(null);
  const [bilanLoading, setBilanLoading] = useState(false);
  const [insights, setInsights] = useState<DashboardInsights>(EMPTY_DASHBOARD_INSIGHTS);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [amortissementSeries, setAmortissementSeries] = useState<AmortissementSeries | null>(null);
  const [amortissementLoading, setAmortissementLoading] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const [acc, cat, dates, kpis, distinct, savedTabs] = await Promise.all([
          ConfigService.listAccounts(),
          ConfigService.listCategories(),
          StatsService.dateBounds(),
          StatsService.kpis({ excludeCategories: ['X'] }),
          StatsService.distinctPeriods(),
          FinanceSettingsService.load(),
        ]);
        // Adapte les graphiques visibles au mode du profil (familiale/tpe/association) en gardant la sélection possible
        let adaptedTabs = savedTabs;
        try {
          const profiles = await ProfileService.list();
          const activeId = SettingsService.current.activeProfileId;
          const active = profiles.find((p) => p.id === activeId);
          const mode = parseUsageMode(active?.usageMode, 'tpe');
          const preset = financePresetForUsage(mode);
          const isDefault = savedTabs.length === preset.length && savedTabs.every((t) => t.visible);
          if (isDefault) {
            adaptedTabs = preset;
          } else {
            adaptedTabs = savedTabs.map((tab) => ({
              ...tab,
              visible: tab.visible && isFinanceTabAllowedForMode(tab.id, mode),
            }));
          }
          void FinanceSettingsService.save(adaptedTabs).catch(() => undefined);
        } catch {
          // ignore mode adaptation
        }
        setTabConfig(adaptedTabs);
        setTabDraft(adaptedTabs);
        const firstVisible = adaptedTabs.find((item) => item.visible);
        if (firstVisible) setTab(firstVisible.id);
        setAccounts(acc);
        setCategories(cat);
        setSelectedAccountIds(new Set(acc.map((a) => a.id)));
        setSelectedCategoryCodes(new Set(cat.filter((c) => c.code !== 'X').map((c) => c.code)));
        setPeriods(distinct);
        const min = dates.min ?? toIsoDate(new Date());
        const max = dates.max ?? toIsoDate(new Date());
        setBounds({ min, max });
        setDateStart(min);
        setDateEnd(max);
        setGranularity(autoGranularity(min, max));
        setHasAnyData(kpis.count > 0);
      } catch (err) {
        Logger.error('Finance.meta', err);
      }
    })();
  }, []);

  const buildFilters = useCallback((): StatsFilters => {
    const validCats = categories.filter((c) => c.code !== 'X');
    const accountIds =
      selectedAccountIds.size === accounts.length
        ? undefined
        : Array.from(selectedAccountIds);
    const categoryCodes =
      selectedCategoryCodes.size === validCats.length
        ? undefined
        : Array.from(selectedCategoryCodes);
    return {
      dateStart,
      dateEnd,
      excludeCategories: ['X'],
      accountIds,
      categoryCodes,
    };
  }, [
    accounts.length,
    categories,
    dateEnd,
    dateStart,
    selectedAccountIds,
    selectedCategoryCodes,
  ]);

  const loadMain = useCallback(async () => {
    if (!dateStart || !dateEnd) return;
    setIsLoading(true);
    const filters = buildFilters();
    try {
      const [catPeriod, bals, catSum, accSum] = await Promise.all([
        StatsService.categoryByPeriod(filters, granularity),
        StatsService.balancesOverPeriod(
          dateStart,
          dateEnd,
          granularity,
          filters.accountIds
        ),
        StatsService.categorySummaries(filters),
        StatsService.accountSummaries(filters),
      ]);
      setMonthlyPoints(catPeriod);
      setBalancePoints(bals);
      setCategorySummaries(catSum);
      setAccountSummaries(accSum);
    } catch (err) {
      Logger.error('Finance.load', err);
    } finally {
      setIsLoading(false);
    }
  }, [buildFilters, dateEnd, dateStart, granularity]);

  useEffect(() => {
    void loadMain();
  }, [loadMain]);

  useEffect(() => {
    if (tab !== 'projection') return;
    const filters = buildFilters();
    void StatsService.categoryByPeriod(
      { ...filters, dateStart: undefined, dateEnd: undefined },
      granularity
    )
      .then(setRealityPoints)
      .catch((err) => Logger.error('Finance.reality', err));
  }, [tab, buildFilters, granularity]);

  useEffect(() => {
    if (tab !== 'bilan') {
      setBilanData(null);
      return;
    }
    setBilanLoading(true);
    void StatsService.bilanByPeriod(buildFilters(), granularity)
      .then(setBilanData)
      .catch((err) => {
        Logger.error('Finance.bilan', err);
        setBilanData(null);
      })
      .finally(() => setBilanLoading(false));
  }, [tab, buildFilters, granularity]);

  useEffect(() => {
    if (tab !== 'facturation' && tab !== 'dons' && tab !== 'contacts') return;
    if (!dateStart || !dateEnd) return;
    setInsightsLoading(true);
    void DashboardInsightsService.load({
      filters: buildFilters(),
      granularity,
      donationsByDonorMode: 'period',
      include: {
        invoicing: tab === 'facturation',
        association: tab === 'dons',
        contacts: tab === 'contacts',
        reminders: false,
      },
    })
      .then(setInsights)
      .catch((err) => Logger.error('Finance.insights', err))
      .finally(() => setInsightsLoading(false));
  }, [tab, buildFilters, granularity, dateStart, dateEnd]);

  useEffect(() => {
    if (tab !== 'amortissement') return;
    if (!dateStart || !dateEnd) return;
    setAmortissementLoading(true);
    void AmortissementService.buildAmortissementSeries(granularity, dateStart, dateEnd)
      .then(setAmortissementSeries)
      .catch((err) => {
        Logger.error('Finance.amortissement', err);
        setAmortissementSeries(null);
      })
      .finally(() => setAmortissementLoading(false));
  }, [tab, granularity, dateStart, dateEnd]);

  const visibleTabs = useMemo(
    () => tabConfig.filter((item) => item.visible).sort((a, b) => a.order - b.order),
    [tabConfig]
  );

  const filteredEmpty = useMemo(
    () =>
      !isLoading &&
      hasAnyData &&
      categorySummaries.length === 0 &&
      accountSummaries.length === 0 &&
      monthlyPoints.length === 0 &&
      balancePoints.length === 0,
    [isLoading, hasAnyData, categorySummaries, accountSummaries, monthlyPoints, balancePoints]
  );

  useEffect(() => {
    if (visibleTabs.length === 0) return;
    if (!visibleTabs.some((item) => item.id === tab)) setTab(visibleTabs[0]!.id);
  }, [visibleTabs, tab]);

  const saveTabConfig = async () => {
    setConfigSaving(true);
    try {
      await FinanceSettingsService.save(tabDraft);
      setTabConfig(tabDraft);
      setConfigOpen(false);
      toast.success(t('financeGlobal.saved'));
    } catch (err) {
      Logger.error('Finance.saveTabs', err);
      toast.error(t('common.error'));
    } finally {
      setConfigSaving(false);
    }
  };

  const monthlyChartData = useMemo(() => {
    const periodKeys = sortPeriodKeys(
      Array.from(new Set(monthlyPoints.map((p) => p.period))),
      granularity
    );
    const periodLabels = periodKeys.map((k) => getPeriodLabel(k, granularity));
    const catNames = categorySummaries.map((c) => c.categoryName);
    const categoryColors = Object.fromEntries(
      categorySummaries.map((c) => [c.categoryName, c.color])
    );
    const monthlyData = categorySummaries.map((cat) =>
      periodKeys.map((period) => {
        const hit = monthlyPoints.find(
          (p) => p.period === period && p.categoryCode === cat.categoryCode
        );
        return hit?.net ?? 0;
      })
    );
    const incomeData = categorySummaries.map((cat) =>
      periodKeys.map((period) => {
        const hit = monthlyPoints.find(
          (p) => p.period === period && p.categoryCode === cat.categoryCode
        );
        return hit?.income ?? 0;
      })
    );
    const expensesData = categorySummaries.map((cat) =>
      periodKeys.map((period) => {
        const hit = monthlyPoints.find(
          (p) => p.period === period && p.categoryCode === cat.categoryCode
        );
        return hit?.expenses ?? 0;
      })
    );
    return {
      periodLabels,
      periodKeys,
      catNames,
      categoryColors,
      monthlyData,
      incomeData,
      expensesData,
    };
  }, [monthlyPoints, categorySummaries, granularity]);

  const balanceChartData = useMemo(() => {
    const periodKeys = sortPeriodKeys(
      Array.from(new Set(balancePoints.map((p) => p.period))),
      granularity
    );
    const periodLabels = periodKeys.map((k) => getPeriodLabel(k, granularity));
    const accNames = accountSummaries.map((a) => a.accountName);
    const accountColors = Object.fromEntries(
      accountSummaries.map((a) => [a.accountName, a.color])
    );
    const monthlyData = accountSummaries.map((acc) =>
      periodKeys.map((period) => {
        const hit = balancePoints.find(
          (p) => p.period === period && p.accountId === acc.accountId
        );
        return hit?.balance ?? 0;
      })
    );
    return { periodLabels, accNames, accountColors, monthlyData };
  }, [balancePoints, accountSummaries, granularity]);

  const toggleAccount = (id: number) => {
    setSelectedAccountIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllAccounts = () => {
    setSelectedAccountIds((prev) =>
      prev.size === accounts.length ? new Set() : new Set(accounts.map((a) => a.id))
    );
  };

  const toggleCategory = (code: string) => {
    setSelectedCategoryCodes((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const toggleAllCategories = () => {
    const valid = categories.filter((c) => c.code !== 'X');
    setSelectedCategoryCodes((prev) =>
      prev.size === valid.length ? new Set() : new Set(valid.map((c) => c.code))
    );
  };

  if (isLoading && !hasAnyData) {
    return (
      <div className="finance-global-page finance-global-page--plain">
        <h1 data-tour="page-intro-anchor">{t('financeGlobal.title')}</h1>
        <div className="finance-loading">
          <Loader2 size={32} className="animate-spin" />
          <p>{t('financeGlobal.loading')}</p>
        </div>
      </div>
    );
  }

  if (!hasAnyData) {
    return (
      <div className="finance-global-page finance-global-page--plain">
        <h1 data-tour="page-intro-anchor">{t('financeGlobal.title')}</h1>
        <div className="finance-empty">
          <p>{t('financeGlobal.noDataMessage')}</p>
          <Link to="/upload" className="ct-btn-primary inline-flex items-center gap-2">
            <Upload size={18} />
            {t('financeGlobal.importData')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="finance-global-page">
      <div className="finance-global-main">
        <h1 className="text-3xl font-bold" data-tour="page-intro-anchor">{t('financeGlobal.title')}</h1>

        <ChartTabs tabs={tabConfig} active={tab} onChange={setTab} />

        {isLoading ||
        (insightsLoading && (tab === 'facturation' || tab === 'dons' || tab === 'contacts')) ||
        (amortissementLoading && tab === 'amortissement') ? (
          <div className="finance-loading">
            <Loader2 size={28} className="animate-spin" />
          </div>
        ) : filteredEmpty && tab !== 'amortissement' ? (
          <div className="finance-empty-inline">
            <SearchX size={48} strokeWidth={1.5} style={{ color: 'var(--invoicing-gray-400)' }} />
            <h3 style={{ margin: '8px 0 4px', color: 'var(--invoicing-gray-700)' }}>
              {t('edition.noResultsTitle')}
            </h3>
            <p style={{ color: 'var(--invoicing-gray-500)', margin: 0 }}>
              {t('edition.noResults')}
            </p>
          </div>
        ) : (
          <>
            {tab === 'monthly' &&
              monthlyChartData.periodLabels.length > 0 &&
              categorySummaries.length > 0 && (
                <MonthlyChart
                  periodLabels={monthlyChartData.periodLabels}
                  categories={monthlyChartData.catNames}
                  categoryColors={monthlyChartData.categoryColors}
                  monthlyData={monthlyChartData.monthlyData}
                  incomeData={monthlyChartData.incomeData}
                  expensesData={monthlyChartData.expensesData}
                  summaries={categorySummaries}
                  categoryConfigs={categories}
                  granularity={granularity}
                />
              )}

            {tab === 'balance' &&
              balanceChartData.periodLabels.length > 0 &&
              accountSummaries.length > 0 && (
                <BalanceChart
                  periodLabels={balanceChartData.periodLabels}
                  accounts={balanceChartData.accNames}
                  accountColors={balanceChartData.accountColors}
                  monthlyData={balanceChartData.monthlyData}
                  summaries={accountSummaries}
                  granularity={granularity}
                />
              )}

            {tab === 'projection' && (
              <ProjectionVsReality
                realityPoints={realityPoints}
                balancePoints={balancePoints}
                categories={categories}
                granularity={granularity}
                dateStart={dateStart}
                dateEnd={dateEnd}
              />
            )}

            {tab === 'bilan' && <BilanTab data={bilanData} loading={bilanLoading} />}
            {tab === 'facturation' && (
              <FacturationTab data={insights.invoicing} granularity={granularity} />
            )}
            {tab === 'dons' && <DonsTab data={insights.association} granularity={granularity} />}
            {tab === 'contacts' && <ContactsTab data={insights.contacts} />}
            {tab === 'amortissement' && (
              <AmortissementChart series={amortissementSeries} granularity={granularity} />
            )}
          </>
        )}
      </div>

      <FinanceToolbar
        granularity={granularity}
        onGranularityChange={setGranularity}
        bounds={bounds}
        dateStart={dateStart}
        dateEnd={dateEnd}
        onDateChange={(s, e) => {
          setDateStart(s);
          setDateEnd(e);
        }}
        periods={periods}
        accounts={accounts}
        categories={categories}
        selectedAccountIds={selectedAccountIds}
        selectedCategoryCodes={selectedCategoryCodes}
        onToggleAccount={toggleAccount}
        onToggleAllAccounts={toggleAllAccounts}
        onToggleCategory={toggleCategory}
        onToggleAllCategories={toggleAllCategories}
        onConfigureCharts={() => {
          setTabDraft(tabConfig);
          setConfigOpen(true);
        }}
      />

      <FinanceChartConfigModal
        isOpen={configOpen}
        tabs={tabDraft}
        onChange={setTabDraft}
        onClose={() => setConfigOpen(false)}
        onSave={() => void saveTabConfig()}
        saving={configSaving}
      />
    </div>
  );
};

export default FinanceGlobalPage;
