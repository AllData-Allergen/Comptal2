import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BilanChartData } from '../../services/StatsService';
import { ConfigService } from '../../services/ConfigService';
import { Category, CategoryGroup } from '../../types/models';
import {
  aggregateBilanByGroup,
  CategoryAggregation,
} from '../../utils/categoryAggregate';
import { formatMoney } from '../../utils/amounts';
import { Logger } from '../../services/logger';
import CategoryAggToggle from '../Common/CategoryAggToggle';
import BilanCharts from './BilanCharts';
import FinanceTable, { FinanceTableColumn, FinanceTableRow } from './FinanceTable';

interface BilanTabProps {
  data: BilanChartData | null;
  loading: boolean;
}

const BilanTab: React.FC<BilanTabProps> = ({ data, loading }) => {
  const { t } = useTranslation();
  const [aggregation, setAggregation] = useState<CategoryAggregation>('category');
  const [categories, setCategories] = useState<Category[]>([]);
  const [groups, setGroups] = useState<CategoryGroup[]>([]);

  useEffect(() => {
    void (async () => {
      try {
        const [cats, grps] = await Promise.all([
          ConfigService.listCategories(),
          ConfigService.listCategoryGroups(),
        ]);
        setCategories(cats);
        setGroups(grps);
      } catch (err) {
        Logger.error('BilanTab.loadGroups', err);
      }
    })();
  }, []);

  const viewData = useMemo(() => {
    if (!data) return null;
    return aggregateBilanByGroup(
      data,
      categories,
      groups,
      t('edition.ungroupedCategories'),
      aggregation
    );
  }, [data, categories, groups, aggregation, t]);

  const allCategories = useMemo(() => {
    if (!viewData) return [];
    return Array.from(
      new Set([...viewData.categoriesWithCredits, ...viewData.categoriesWithDebits])
    );
  }, [viewData]);

  const categoryColumnLabel =
    aggregation === 'group' ? t('financeGlobal.group') : t('financeGlobal.category');

  const detailColumns: FinanceTableColumn[] = useMemo(() => {
    if (!viewData) return [];
    return [
      {
        key: 'type',
        label: `${t('financeGlobal.credit')} / ${t('financeGlobal.debit')}`,
        sticky: true,
        width: 90,
      },
      { key: 'cat', label: categoryColumnLabel, sticky: true, width: 200 },
      ...viewData.months.map((m, i) => ({ key: `m-${i}`, label: m, align: 'right' as const })),
    ];
  }, [viewData, t, categoryColumnLabel]);

  const detailRows: FinanceTableRow[] = useMemo(() => {
    if (!viewData) return [];
    const rows: FinanceTableRow[] = [];

    viewData.categoriesWithCredits.forEach((catName, rowIndex) => {
      rows.push({
        id: `c-${catName}`,
        isOdd: rowIndex % 2 !== 0,
        cells: [
          {
            content: t('financeGlobal.credit'),
            text: t('financeGlobal.credit'),
            className: 'bilan-type-credit',
          },
          {
            content: (
              <span className="flex items-center gap-2">
                <span
                  className="finance-color-dot"
                  style={{ backgroundColor: viewData.categoryColors[catName] }}
                />
                {catName}
              </span>
            ),
            text: catName,
          },
          ...(viewData.creditsByCategory[catName] || []).map((val) => ({
            content: val !== 0 ? formatMoney(val) : '-',
            text: val,
            value: val,
            align: 'right' as const,
            className: 'text-positive',
          })),
        ],
      });
    });

    if (viewData.categoriesWithCredits.length > 0 && viewData.categoriesWithDebits.length > 0) {
      rows.push({
        id: 'sep',
        cells: [
          { content: '', text: '' },
          { content: '', text: '' },
          ...viewData.months.map(() => ({ content: '', text: '' })),
        ],
      });
    }

    viewData.categoriesWithDebits.forEach((catName, rowIndex) => {
      rows.push({
        id: `d-${catName}`,
        isOdd: rowIndex % 2 !== 0,
        cells: [
          {
            content: t('financeGlobal.debit'),
            text: t('financeGlobal.debit'),
            className: 'bilan-type-debit',
          },
          {
            content: (
              <span className="flex items-center gap-2">
                <span
                  className="finance-color-dot"
                  style={{ backgroundColor: viewData.categoryColors[catName] }}
                />
                {catName}
              </span>
            ),
            text: catName,
          },
          ...(viewData.debitsByCategory[catName] || []).map((val) => ({
            content: val !== 0 ? formatMoney(val) : '-',
            text: val,
            value: val,
            align: 'right' as const,
            className: 'text-negative',
          })),
        ],
      });
    });

    if (viewData.categoriesWithCredits.length > 0) {
      rows.push({
        id: 'total-credits',
        isTotal: true,
        cells: [
          { content: t('financeGlobal.totalCredits'), text: t('financeGlobal.totalCredits') },
          { content: '', text: '' },
          ...viewData.months.map((_, i) => {
            const total = viewData.categoriesWithCredits.reduce(
              (s, cat) => s + (viewData.creditsByCategory[cat]?.[i] ?? 0),
              0
            );
            return {
              content: total !== 0 ? formatMoney(total) : '-',
              text: total,
              value: total,
              align: 'right' as const,
              className: 'text-positive',
            };
          }),
        ],
      });
    }

    if (viewData.categoriesWithDebits.length > 0) {
      rows.push({
        id: 'total-debits',
        isTotal: true,
        cells: [
          { content: t('financeGlobal.totalDebits'), text: t('financeGlobal.totalDebits') },
          { content: '', text: '' },
          ...viewData.months.map((_, i) => {
            const total = viewData.categoriesWithDebits.reduce(
              (s, cat) => s + (viewData.debitsByCategory[cat]?.[i] ?? 0),
              0
            );
            return {
              content: total !== 0 ? formatMoney(total) : '-',
              text: total,
              value: total,
              align: 'right' as const,
              className: 'text-negative',
            };
          }),
        ],
      });
    }

    return rows;
  }, [viewData, t]);

  const recapColumns: FinanceTableColumn[] = useMemo(() => {
    if (!viewData) return [];
    return [
      { key: 'type', label: '', sticky: true, width: 90 },
      ...allCategories.map((c) => ({ key: c, label: c, align: 'right' as const })),
      { key: 'total', label: t('financeGlobal.total'), align: 'right' as const },
    ];
  }, [viewData, allCategories, t]);

  const recapRows: FinanceTableRow[] = useMemo(() => {
    if (!viewData) return [];
    const creditCells = allCategories.map((catName) => {
      const total = (viewData.creditsByCategory[catName] || []).reduce((a, b) => a + b, 0);
      return {
        content: total !== 0 ? formatMoney(total) : '-',
        text: total,
        value: total,
        align: 'right' as const,
        className: 'text-positive',
      };
    });
    const debitCells = allCategories.map((catName) => {
      const total = (viewData.debitsByCategory[catName] || []).reduce((a, b) => a + b, 0);
      return {
        content: total !== 0 ? formatMoney(total) : '-',
        text: total,
        value: total,
        align: 'right' as const,
        className: 'text-negative',
      };
    });
    const netCells = allCategories.map((catName) => {
      const credits = (viewData.creditsByCategory[catName] || []).reduce((a, b) => a + b, 0);
      const debits = (viewData.debitsByCategory[catName] || []).reduce((a, b) => a + b, 0);
      const net = credits + debits;
      return {
        content: net !== 0 ? formatMoney(net) : '-',
        text: net,
        value: net,
        align: 'right' as const,
        className: net >= 0 ? 'text-positive' : 'text-negative',
      };
    });

    const totalCredits = Object.values(viewData.creditsByCategory).reduce(
      (s, arr) => s + arr.reduce((a, b) => a + b, 0),
      0
    );
    const totalDebits = Object.values(viewData.debitsByCategory).reduce(
      (s, arr) => s + arr.reduce((a, b) => a + b, 0),
      0
    );
    const grandNet = totalCredits + totalDebits;

    return [
      {
        id: 'recap-credit',
        isTotal: true,
        cells: [
          {
            content: t('financeGlobal.credit'),
            text: t('financeGlobal.credit'),
            className: 'bilan-type-credit',
          },
          ...creditCells,
          {
            content: formatMoney(totalCredits),
            text: totalCredits,
            value: totalCredits,
            align: 'right' as const,
            className: 'text-positive',
          },
        ],
      },
      {
        id: 'recap-debit',
        isTotal: true,
        cells: [
          {
            content: t('financeGlobal.debit'),
            text: t('financeGlobal.debit'),
            className: 'bilan-type-debit',
          },
          ...debitCells,
          {
            content: formatMoney(totalDebits),
            text: totalDebits,
            value: totalDebits,
            align: 'right' as const,
            className: 'text-negative',
          },
        ],
      },
      {
        id: 'recap-net',
        isTotal: true,
        cells: [
          { content: t('financeGlobal.total'), text: t('financeGlobal.total') },
          ...netCells,
          {
            content: formatMoney(grandNet),
            text: grandNet,
            value: grandNet,
            align: 'right' as const,
            className: grandNet >= 0 ? 'text-positive' : 'text-negative',
          },
        ],
      },
    ];
  }, [viewData, allCategories, t]);

  if (loading) {
    return (
      <div className="finance-empty">
        <p>{t('financeGlobal.loading')}</p>
      </div>
    );
  }

  if (!viewData || viewData.months.length === 0) {
    return (
      <div className="finance-empty">
        <p>{t('financeGlobal.bilanNoData')}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="finance-global-chart-container" style={{ height: 'auto', minHeight: 360 }}>
        <div className="bilan-agg-toolbar">
          <CategoryAggToggle value={aggregation} onChange={setAggregation} />
        </div>
        <BilanCharts data={viewData} aggregation={aggregation} />
      </div>
      <FinanceTable
        columns={detailColumns}
        rows={detailRows}
        stickyOffsets={[0, 90]}
        className="finance-global-table-bilan"
        exportFileName="finance_bilan_detail"
        exportSheetName={t('finance.tabBilan')}
      />
      <div className="bilan-recap-section">
        <h3>
          {t('financeGlobal.bilanPdfTitle')} — {t('financeGlobal.total')}
        </h3>
        <FinanceTable
          columns={recapColumns}
          rows={recapRows}
          stickyOffsets={[0]}
          className="bilan-recap-table"
          exportFileName="finance_bilan_recap"
          exportSheetName={`${t('finance.tabBilan')} — ${t('financeGlobal.total')}`}
        />
      </div>
    </div>
  );
};

export default BilanTab;
