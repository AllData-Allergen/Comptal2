import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { toast } from 'react-toastify';
import { Category } from '../../types/models';
import { ChartGranularity } from '../../types/projection';
import { PeriodPoint } from '../../services/StatsService';
import { ProjectService } from '../../services/ProjectService';
import { ProjectionService } from '../../services/ProjectionService';
import { Logger } from '../../services/logger';
import {
  filterPeriodKeysInRange,
  getPeriodLabel,
  sortPeriodKeys,
} from '../../utils/periodKeys';
import { formatMoney } from '../../utils/amounts';
import ProjectionVsRealityChart from './ProjectionVsRealityChart';
import BalanceVsProjectionChart from './BalanceVsProjectionChart';
import CategoryVsProjectionChart from './CategoryVsProjectionChart';
import FinanceTable, { FinanceTableColumn, FinanceTableRow } from './FinanceTable';

export type ProjectionViewMode = 'balance' | 'category' | 'all';

export interface ProjectionVsRealityData {
  monthLabels: string[];
  unifiedKeys: string[];
  categories: string[];
  categoryColors: Record<string, string>;
  realityByCategory: number[][];
  projectionByCategory: Record<string, number[]>;
  realityTotals: number[];
  projectionTotals: number[];
  balanceReality: number[];
  balanceProjection: number[];
}

export interface BalancePoint {
  period: string;
  accountId: number;
  balance: number;
}

interface ProjectionVsRealityProps {
  realityPoints: PeriodPoint[];
  balancePoints: BalancePoint[];
  categories: Category[];
  granularity: ChartGranularity;
  dateStart: string;
  dateEnd: string;
}

function alignedSeries(
  keys: string[],
  map: Map<string, number>,
  carry: boolean
): number[] {
  let last = 0;
  let has = false;
  return keys.map((key) => {
    if (map.has(key)) {
      last = map.get(key)!;
      has = true;
      return last;
    }
    return carry && has ? last : 0;
  });
}

const ProjectionVsReality: React.FC<ProjectionVsRealityProps> = ({
  realityPoints,
  balancePoints,
  categories,
  granularity,
  dateStart,
  dateEnd,
}) => {
  const { t } = useTranslation();
  const [projects, setProjects] = useState<{ id: number; name: string }[]>([]);
  const [projectId, setProjectId] = useState<number | ''>('');
  const [data, setData] = useState<ProjectionVsRealityData | null>(null);
  const [newProjectName, setNewProjectName] = useState('');
  const [viewMode, setViewMode] = useState<ProjectionViewMode>('balance');
  const [selectedCategory, setSelectedCategory] = useState('');

  useEffect(() => {
    void ProjectService.list()
      .then((list) => {
        setProjects(list);
        if (list.length && projectId === '') setProjectId(list[0].id);
      })
      .catch((err) => Logger.error('ProjectionVsReality.projects', err));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (projectId === '') {
      setData(null);
      return;
    }
    void (async () => {
      try {
        const project = (await ProjectService.list()).find((p) => p.id === projectId);
        if (!project) {
          setData(null);
          return;
        }
        const subs = await ProjectService.listSubscriptions(projectId);
        const byCode = new Map(categories.map((c) => [c.code, c]));

        const realityKeys = sortPeriodKeys(
          Array.from(new Set(realityPoints.map((p) => p.period))),
          granularity
        );
        const projected = ProjectionService.calculateByCategory(
          project,
          subs,
          granularity,
          project.startDate,
          project.endDate
        );
        const projectionKeys = sortPeriodKeys(
          Array.from(new Set(projected.map((p) => p.period))),
          granularity
        );
        const daily = ProjectionService.calculateProjection(subs, {
          startDate: project.startDate,
          endDate: project.endDate,
          initialBalance: project.initialBalance,
        });
        const agg = ProjectionService.aggregateByPeriod(daily, granularity);
        const balanceKeys = sortPeriodKeys(
          Array.from(new Set(balancePoints.map((p) => p.period))),
          granularity
        );
        const unifiedKeys = filterPeriodKeysInRange(
          Array.from(new Set([...realityKeys, ...projectionKeys, ...balanceKeys, ...agg.periods])),
          granularity,
          dateStart,
          dateEnd
        );

        const categoryNamesSet = new Set<string>();
        for (const pt of realityPoints) {
          if (pt.categoryCode) {
            categoryNamesSet.add(byCode.get(pt.categoryCode)?.name ?? pt.categoryCode);
          }
        }
        for (const pt of projected) {
          categoryNamesSet.add(byCode.get(pt.categoryCode)?.name ?? pt.categoryCode);
        }
        const catList = Array.from(categoryNamesSet);
        const categoryColors: Record<string, string> = {};
        for (const name of catList) {
          const code = categories.find((c) => c.name === name)?.code;
          categoryColors[name] = (code ? byCode.get(code)?.color : undefined) ?? '#808080';
        }

        const realityByCategory = catList.map((catName) => {
          const code = categories.find((c) => c.name === catName)?.code;
          return unifiedKeys.map((key) => {
            const hit = realityPoints.find((p) => p.period === key && p.categoryCode === code);
            return hit?.net ?? 0;
          });
        });

        const projectionByCategory: Record<string, number[]> = {};
        for (const name of catList) {
          const code = categories.find((c) => c.name === name)?.code ?? name;
          projectionByCategory[name] = unifiedKeys.map((key) => {
            const hits = projected.filter((p) => p.period === key && p.categoryCode === code);
            return hits.reduce((s, h) => s + h.net, 0);
          });
        }

        const realityTotals = unifiedKeys.map((_, ki) =>
          realityByCategory.reduce((s, row) => s + (row[ki] ?? 0), 0)
        );
        const projectionTotals = unifiedKeys.map((_, ki) => {
          let sum = 0;
          for (const arr of Object.values(projectionByCategory)) sum += arr[ki] ?? 0;
          return sum;
        });

        const realityBalanceMap = new Map<string, number>();
        for (const pt of balancePoints) {
          realityBalanceMap.set(pt.period, (realityBalanceMap.get(pt.period) ?? 0) + pt.balance);
        }
        const projectionBalanceMap = new Map<string, number>();
        agg.periods.forEach((period, index) => {
          projectionBalanceMap.set(period, agg.balances[index] ?? 0);
        });

        setData({
          monthLabels: unifiedKeys.map((k) => getPeriodLabel(k, granularity)),
          unifiedKeys,
          categories: catList,
          categoryColors,
          realityByCategory,
          projectionByCategory,
          realityTotals,
          projectionTotals,
          balanceReality: alignedSeries(unifiedKeys, realityBalanceMap, true),
          balanceProjection: alignedSeries(unifiedKeys, projectionBalanceMap, true),
        });
      } catch (err) {
        Logger.error('ProjectionVsReality.compute', err);
        setData(null);
      }
    })();
  }, [projectId, realityPoints, balancePoints, categories, granularity, dateStart, dateEnd]);

  useEffect(() => {
    if (!data || data.categories.length === 0) {
      setSelectedCategory('');
      return;
    }
    if (!data.categories.includes(selectedCategory)) {
      setSelectedCategory(data.categories[0] ?? '');
    }
  }, [data, selectedCategory]);

  const createProject = async () => {
    if (!newProjectName.trim()) return;
    try {
      const id = await ProjectService.create({
        name: newProjectName.trim(),
        startDate: dateStart,
        endDate: dateEnd,
        initialBalance: 0,
      });
      setNewProjectName('');
      const list = await ProjectService.list();
      setProjects(list);
      setProjectId(id);
    } catch (err) {
      Logger.error('ProjectionVsReality.create', err);
      toast.error(t('common.error'));
    }
  };

  const selectedCatIndex = data ? data.categories.indexOf(selectedCategory) : -1;

  const tableColumns: FinanceTableColumn[] = useMemo(() => {
    if (!data) return [];
    if (viewMode === 'balance' || viewMode === 'category') {
      return [
        { key: 'period', label: t('financeGlobal.period'), sticky: true, width: 120 },
        { key: 'data', label: t('financeGlobal.basedOnData'), align: 'right' },
        { key: 'proj', label: t('financeGlobal.basedOnProject'), align: 'right' },
      ];
    }
    const cols: FinanceTableColumn[] = [
      { key: 'period', label: t('financeGlobal.period'), sticky: true, width: 120 },
    ];
    for (const cat of data.categories) {
      cols.push(
        { key: `${cat}-data`, label: `${cat} (${t('financeGlobal.basedOnData')})`, align: 'right' },
        { key: `${cat}-proj`, label: `${cat} (${t('financeGlobal.basedOnProject')})`, align: 'right' }
      );
    }
    cols.push(
      { key: 'total-data', label: `${t('financeGlobal.total')} (${t('financeGlobal.basedOnData')})`, align: 'right' },
      { key: 'total-proj', label: `${t('financeGlobal.total')} (${t('financeGlobal.basedOnProject')})`, align: 'right' }
    );
    return cols;
  }, [data, t, viewMode]);

  const tableRows: FinanceTableRow[] = useMemo(() => {
    if (!data) return [];
    if (viewMode === 'balance') {
      return data.monthLabels.map((label, monthIndex) => {
        const reality = data.balanceReality[monthIndex] ?? 0;
        const projection = data.balanceProjection[monthIndex] ?? 0;
        return {
          id: String(monthIndex),
          isOdd: monthIndex % 2 !== 0,
          cells: [
            { content: label, text: label },
            {
              content: reality !== 0 ? formatMoney(reality) : '-',
              value: reality,
              text: reality,
              colorize: true,
              align: 'right' as const,
            },
            {
              content: projection !== 0 ? formatMoney(projection) : '-',
              value: projection,
              text: projection,
              colorize: true,
              align: 'right' as const,
            },
          ],
        };
      });
    }
    if (viewMode === 'category') {
      return data.monthLabels.map((label, monthIndex) => {
        const reality =
          selectedCatIndex >= 0 ? (data.realityByCategory[selectedCatIndex]?.[monthIndex] ?? 0) : 0;
        const projection = data.projectionByCategory[selectedCategory]?.[monthIndex] ?? 0;
        return {
          id: String(monthIndex),
          isOdd: monthIndex % 2 !== 0,
          cells: [
            { content: label, text: label },
            {
              content: reality !== 0 ? formatMoney(reality) : '-',
              value: reality,
              text: reality,
              colorize: true,
              align: 'right' as const,
            },
            {
              content: projection !== 0 ? formatMoney(projection) : '-',
              value: projection,
              text: projection,
              colorize: true,
              align: 'right' as const,
            },
          ],
        };
      });
    }
    return data.monthLabels.map((label, monthIndex) => ({
      id: String(monthIndex),
      isOdd: monthIndex % 2 !== 0,
      cells: [
        { content: label, text: label },
        ...data.categories.flatMap((catName, catIndex) => {
          const reality = data.realityByCategory[catIndex]?.[monthIndex] ?? 0;
          const projection = data.projectionByCategory[catName]?.[monthIndex] ?? 0;
          return [
            {
              content: reality !== 0 ? formatMoney(reality) : '-',
              value: reality,
              text: reality,
              colorize: true,
              align: 'right' as const,
            },
            {
              content: projection !== 0 ? formatMoney(projection) : '-',
              value: projection,
              text: projection,
              colorize: true,
              align: 'right' as const,
            },
          ];
        }),
        {
          content:
            (data.realityTotals[monthIndex] ?? 0) !== 0
              ? formatMoney(data.realityTotals[monthIndex] ?? 0)
              : '-',
          value: data.realityTotals[monthIndex] ?? 0,
          text: data.realityTotals[monthIndex] ?? 0,
          colorize: true,
          align: 'right' as const,
        },
        {
          content:
            (data.projectionTotals[monthIndex] ?? 0) !== 0
              ? formatMoney(data.projectionTotals[monthIndex] ?? 0)
              : '-',
          value: data.projectionTotals[monthIndex] ?? 0,
          text: data.projectionTotals[monthIndex] ?? 0,
          colorize: true,
          align: 'right' as const,
        },
      ],
    }));
  }, [data, viewMode, selectedCategory, selectedCatIndex]);

  const chart = () => {
    if (!data) return null;
    if (viewMode === 'balance') {
      return (
        <BalanceVsProjectionChart
          labels={data.monthLabels}
          reality={data.balanceReality}
          projection={data.balanceProjection}
          granularity={granularity}
        />
      );
    }
    if (viewMode === 'category') {
      return (
        <CategoryVsProjectionChart
          labels={data.monthLabels}
          reality={
            selectedCatIndex >= 0 ? (data.realityByCategory[selectedCatIndex] ?? []) : []
          }
          projection={data.projectionByCategory[selectedCategory] ?? []}
          color={data.categoryColors[selectedCategory] ?? '#808080'}
          categoryName={selectedCategory || t('financeGlobal.category')}
          granularity={granularity}
        />
      );
    }
    return (
      <ProjectionVsRealityChart
        monthLabels={data.monthLabels}
        categories={data.categories}
        categoryColors={data.categoryColors}
        realityByCategory={data.realityByCategory}
        projectionByCategory={data.projectionByCategory}
        granularity={granularity}
      />
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="projection-vs-reality-selector">
        <div className="projection-view-controls">
          <div>
            <label className="block text-sm font-medium mb-2">{t('financeGlobal.selectProject')}</label>
            <div className="flex flex-wrap gap-3 items-center">
              <select
                className="ct-select min-w-[200px]"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value ? Number(e.target.value) : '')}
                disabled={projects.length === 0}
              >
                {projects.length === 0 ? (
                  <option value="">{t('financeGlobal.noProjectsAvailable')}</option>
                ) : (
                  projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))
                )}
              </select>
              {projects.length === 0 && (
                <>
                  <input
                    className="ct-input"
                    placeholder={t('finance.newProject')}
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                  />
                  <button type="button" className="ct-btn-secondary" onClick={() => void createProject()}>
                    <Plus size={16} /> {t('common.add')}
                  </button>
                </>
              )}
            </div>
          </div>
          {projects.length > 0 && (
            <div>
              <label className="block text-sm font-medium mb-2">{t('financeGlobal.projectionView')}</label>
              <div className="flex flex-wrap gap-3 items-center">
                <select
                  className="ct-select min-w-[200px]"
                  value={viewMode}
                  onChange={(e) => setViewMode(e.target.value as ProjectionViewMode)}
                >
                  <option value="balance">{t('financeGlobal.projectionViewBalance')}</option>
                  <option value="category">{t('financeGlobal.projectionViewCategory')}</option>
                  <option value="all">{t('financeGlobal.projectionViewAll')}</option>
                </select>
                {viewMode === 'category' && (
                  <select
                    className="ct-select min-w-[180px]"
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    aria-label={t('financeGlobal.category')}
                  >
                    {(data?.categories ?? []).map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>
          )}
        </div>
        {projects.length === 0 && (
          <p className="finance-projection-banner mt-3 mb-0">
            {t('financeGlobal.noProjectHint')}{' '}
            <Link to="/previsionnel" className="text-primary underline">
              {t('previsionnel.manageForecasts')}
            </Link>
          </p>
        )}
        {projects.length > 0 && (
          <p className="mt-3 mb-0 text-sm" style={{ color: 'var(--invoicing-gray-500)' }}>
            <Link to="/previsionnel" className="text-primary underline">
              {t('previsionnel.manageForecasts')}
            </Link>
          </p>
        )}
      </div>

      {!projectId || projects.length === 0 ? (
        <div className="finance-empty">
          <p>{t('financeGlobal.noProjectSelected')}</p>
        </div>
      ) : data && data.monthLabels.length > 0 ? (
        <>
          <div className="finance-global-chart-container chart-container-with-toolbar">
            <div className="chart active">{chart()}</div>
          </div>
          <FinanceTable
            columns={tableColumns}
            rows={tableRows}
            stickyOffsets={[0]}
            exportFileName="finance_projection"
            exportSheetName={t('finance.tabProjection')}
          />
        </>
      ) : (
        <div className="finance-empty">
          <p>{t('previsionnel.emptySubscriptions')}</p>
          <p className="mt-2">
            <Link to="/previsionnel" className="text-primary underline">
              {t('previsionnel.manageForecasts')}
            </Link>
          </p>
        </div>
      )}
    </div>
  );
};

export default ProjectionVsReality;
