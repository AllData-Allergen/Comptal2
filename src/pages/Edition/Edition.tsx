import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import { Account, Category, TransactionRow } from '../../types/models';
import { ConfigService } from '../../services/ConfigService';
import { EditionService, DuplicateGroup } from '../../services/EditionService';
import { AutoCategorisationService } from '../../services/AutoCategorisationService';
import { Logger } from '../../services/logger';
import { useEditionHistory } from '../../hooks/useEditionHistory';
import { buildUpdateHistoryAction } from '../../utils/editionHistory';
import EditionToolbar from '../../components/Edition/EditionToolbar';
import TransactionTable from '../../components/Edition/TransactionTable';
import AutoCatReviewModal, { SuggestionItem } from '../../components/Edition/AutoCatReviewModal';
import DuplicatesModal from '../../components/Edition/DuplicatesModal';
import RoutineLabelModal from '../../components/Edition/RoutineLabelModal';
import CategoryPanel from '../../components/Edition/CategoryPanel';
import ConfirmModal from '../../components/Common/ConfirmModal';
import { toIsoDate } from '../../utils/dateFormats';
import { LabelRuleService } from '../../services/LabelRuleService';

type SortCol =
  | 'date'
  | 'value_date'
  | 'label'
  | 'debit'
  | 'credit'
  | 'category_code'
  | 'account_id';

function shouldHandleEditionShortcut(e: KeyboardEvent): boolean {
  const el = e.target;
  if (!(el instanceof HTMLElement)) return true;
  if (el.closest('.edition-toolbar-search')) return false;
  if (el.closest('.edition-category-panel input, .edition-category-panel textarea')) return false;
  if (el.closest('.edition-cell-input') && document.activeElement === el) return false;
  return true;
}

const EditionPage: React.FC = () => {
  const { t } = useTranslation();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [rows, setRows] = useState<TransactionRow[]>([]);
  const [total, setTotal] = useState(0);
  const [totalAll, setTotalAll] = useState(0);
  const [selectedAccounts, setSelectedAccounts] = useState<number[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [uncategorizedOnly, setUncategorizedOnly] = useState(true);
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');
  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [sortBy, setSortBy] = useState<SortCol>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc' | null>('desc');
  const [categoryPanelCollapsed, setCategoryPanelCollapsed] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [suggestions, setSuggestions] = useState<SuggestionItem[] | null>(null);
  const [dupGroups, setDupGroups] = useState<DuplicateGroup[] | null>(null);
  const [tableKey, setTableKey] = useState(0);
  const [routineModal, setRoutineModal] = useState<{
    row: TransactionRow | null;
    word: string;
  } | null>(null);
  const [autocatPending, setAutocatPending] = useState<{ count: number; ids: number[] } | null>(null);
  const pinnedRowIdsRef = useRef<Set<number>>(new Set());

  const addPinnedRows = useCallback((ids: number[]) => {
    const next = new Set(pinnedRowIdsRef.current);
    ids.forEach((id) => next.add(id));
    pinnedRowIdsRef.current = next;
  }, []);

  const clearPinnedRows = useCallback(() => {
    pinnedRowIdsRef.current = new Set();
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setSearchDebounced(search), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  const baseFilters = useCallback(
    () => ({
      accountIds: selectedAccounts.length === 0
        ? undefined
        : (selectedAccounts.length === 1 && selectedAccounts[0] === ('*' as unknown as number))
          ? []
          : selectedAccounts,
      categoryCodes:
        selectedCategories.length === 0
          ? undefined
          : (selectedCategories.length === 1 && selectedCategories[0] === '*')
            ? []
            : selectedCategories,
      dateStart: dateStart || undefined,
      dateEnd: dateEnd || undefined,
      search: searchDebounced || undefined,
    }),
    [
      selectedAccounts,
      accounts.length,
      selectedCategories,
      categories.length,
      dateStart,
      dateEnd,
      searchDebounced,
    ]
  );

  const filters = useCallback(
    () => ({
      ...baseFilters(),
      uncategorizedOnly,
      sortBy,
      sortDir,
    }),
    [baseFilters, uncategorizedOnly, sortBy, sortDir]
  );

  const reloadMeta = useCallback(async () => {
    try {
      const [acc, cat] = await Promise.all([
        ConfigService.listAccounts(),
        ConfigService.listCategories(),
      ]);
      setAccounts(acc);
      setCategories(cat);
    } catch (err) {
      Logger.error('Edition.reloadMeta', err);
    }
  }, []);

  const reloadRows = useCallback(async () => {
    try {
      const f = filters();
      const [list, count, dbCount] = await Promise.all([
        EditionService.list(f),
        EditionService.count(f),
        EditionService.count({}),
      ]);
      let merged = list;
      if (uncategorizedOnly && pinnedRowIdsRef.current.size > 0) {
        if (count === 0) {
          clearPinnedRows();
        } else {
          const pinned = await Promise.all(
            Array.from(pinnedRowIdsRef.current).map((id) => EditionService.getById(id))
          );
          const pinnedRows = pinned.filter((r): r is TransactionRow => r !== null);
          const existingIds = new Set(list.map((r) => r.id));
          merged = [...pinnedRows.filter((r) => !existingIds.has(r.id)), ...list];
        }
      }
      setRows(merged);
      setTotal(count);
      setTotalAll(dbCount);
    } catch (err) {
      Logger.error('Edition.reloadRows', err);
    }
  }, [filters, baseFilters, uncategorizedOnly, clearPinnedRows]);

  const reloadAfterHistory = useCallback(async () => {
    await reloadRows();
    setTableKey((k) => k + 1);
  }, [reloadRows]);

  const history = useEditionHistory(reloadAfterHistory);

  useEffect(() => {
    clearPinnedRows();
  }, [selectedAccounts, selectedCategories, uncategorizedOnly, dateStart, dateEnd, searchDebounced, clearPinnedRows]);

  useEffect(() => {
    void reloadMeta();
  }, [reloadMeta]);

  useEffect(() => {
    void reloadRows();
  }, [reloadRows]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!shouldHandleEditionShortcut(e)) return;
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;

      if (e.key === 'z' && !e.shiftKey) {
        if (!history.canUndo) return;
        e.preventDefault();
        void history.undo().catch(() => toast.error(t('common.error')));
        return;
      }

      if (e.key === 'y' || (e.key === 'z' && e.shiftKey) || (e.key === 'Z' && e.shiftKey)) {
        if (!history.canRedo) return;
        e.preventDefault();
        void history.redo().catch(() => toast.error(t('common.error')));
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [history, t]);

  const handleUpdate = async (id: number, fields: Partial<TransactionRow>) => {
    try {
      const prev = rows.find((r) => r.id === id);
      const action = buildUpdateHistoryAction(id, prev, fields);
      if (!action) return;

      await EditionService.update(id, fields);
      if (fields.categoryCode && prev) {
        await AutoCategorisationService.learn(prev.label, fields.categoryCode);
      }
      if (fields.label !== undefined) {
        await LabelRuleService.apply({ ids: [id] });
      }
      history.push(action);
      if (uncategorizedOnly && fields.categoryCode && prev && !prev.categoryCode) {
        addPinnedRows([id]);
      }
      await reloadRows();
    } catch (err) {
      Logger.error('Edition.handleUpdate', err);
      toast.error(t('common.error'));
    }
  };

  const handleSort = (col: SortCol, dir?: 'asc' | 'desc') => {
    if (dir) {
      setSortBy(col);
      setSortDir(dir);
      return;
    }
    if (sortBy === col) {
      setSortDir((d) => {
        if (d === 'asc') return 'desc';
        if (d === 'desc') return null;
        return 'asc';
      });
    } else {
      setSortBy(col);
      setSortDir(col === 'date' ? 'desc' : 'asc');
    }
  };

  const runAutocat = async () => {
    try {
      const uncategorized = await EditionService.listUncategorized(baseFilters());
      const ids = uncategorized.map((row) => row.id);
      const count = ids.length === 0 ? 0 : await LabelRuleService.preview({ ids });
      if (count === 0) {
        await reloadRows();
        const stats = await AutoCategorisationService.loadStats();
        const still = await EditionService.listUncategorized(baseFilters());
        const items: SuggestionItem[] = [];
        for (const row of still) {
          const suggestion = AutoCategorisationService.suggest(row.label, stats);
          if (suggestion.category) {
            items.push({
              id: row.id,
              date: row.date,
              label: row.label,
              category: suggestion.category,
              confidence: suggestion.confidence,
            });
          }
        }
        setSuggestions(items);
        return;
      }
      setAutocatPending({ count, ids });
    } catch (err) {
      Logger.error('Edition.runAutocat', err);
      toast.error(t('common.error'));
    }
  };

  const confirmAutocat = async () => {
    if (!autocatPending) return;
    const { ids } = autocatPending;
    setAutocatPending(null);
    try {
      const changes = await LabelRuleService.applyChanges({ ids });
      if (changes.length > 0) {
        history.push({ kind: 'bulkUpdate', items: changes });
      }
      await reloadRows();
      const stats = await AutoCategorisationService.loadStats();
      const uncategorized = await EditionService.listUncategorized(baseFilters());
      const items: SuggestionItem[] = [];
      for (const row of uncategorized) {
        const suggestion = AutoCategorisationService.suggest(row.label, stats);
        if (suggestion.category) {
          items.push({
            id: row.id,
            date: row.date,
            label: row.label,
            category: suggestion.category,
            confidence: suggestion.confidence,
          });
        }
      }
      setSuggestions(items);
    } catch (err) {
      Logger.error('Edition.runAutocat', err);
      toast.error(t('common.error'));
    }
  };

  const applySuggestions = async (selected: SuggestionItem[]) => {
    try {
      const items = selected
        .map((s) => {
          const prev = rows.find((r) => r.id === s.id);
          return {
            id: s.id,
            before: { categoryCode: prev?.categoryCode ?? null },
            after: { categoryCode: s.category },
          };
        })
        .filter((item) => item.before.categoryCode !== item.after.categoryCode);

      await EditionService.applyCategories(
        selected.map((s) => ({ id: s.id, categoryCode: s.category }))
      );
      if (items.length > 0) {
        history.push({ kind: 'bulkUpdate', items });
      }
      for (const s of selected) {
        await AutoCategorisationService.learn(s.label, s.category);
      }
      setSuggestions(null);
      await reloadRows();
      toast.success(t('common.success'));
    } catch (err) {
      Logger.error('Edition.applySuggestions', err);
      toast.error(t('common.error'));
    }
  };

  const insertRow = async (ref?: TransactionRow) => {
    if (accounts.length === 0) {
      toast.error(t('upload.needAccount'));
      return;
    }
    try {
      const newId = await EditionService.insert({
        accountId: ref?.accountId ?? selectedAccounts[0] ?? accounts[0].id,
        date: ref?.date ?? toIsoDate(new Date()),
        label: '',
      });
      const row = await EditionService.getById(newId);
      if (row) {
        history.push({ kind: 'insert', row });
      }
      await reloadRows();
    } catch (err) {
      Logger.error('Edition.insertRow', err);
      toast.error(t('common.error'));
    }
  };

  const handleInsertRelative = (refRowId: number, _position: 'above' | 'below') => {
    const ref = rows.find((r) => r.id === refRowId);
    if (!ref) return;
    void insertRow(ref);
  };

  const handleBulkDelete = async (ids: number[]) => {
    try {
      const snapshots = (
        await Promise.all(ids.map((id) => EditionService.getById(id)))
      ).filter((r): r is TransactionRow => r !== null);
      await EditionService.deleteIds(ids);
      if (snapshots.length > 0) {
        history.push({ kind: 'bulkDelete', rows: snapshots });
      }
      await reloadRows();
    } catch (err) {
      Logger.error('Edition.handleBulkDelete', err);
      toast.error(t('common.error'));
    }
  };

  const handleBulkCategorize = async (ids: number[], code: string) => {
    try {
      const items = ids
        .map((id) => {
          const prev = rows.find((r) => r.id === id);
          return {
            id,
            before: { categoryCode: prev?.categoryCode ?? null },
            after: { categoryCode: code },
          };
        })
        .filter((item) => item.before.categoryCode !== item.after.categoryCode);

      await EditionService.applyCategories(ids.map((id) => ({ id, categoryCode: code })));
      if (items.length > 0) {
        history.push({ kind: 'bulkUpdate', items });
      }
      for (const id of ids) {
        const prev = rows.find((r) => r.id === id);
        if (prev) await AutoCategorisationService.learn(prev.label, code);
      }
      if (uncategorizedOnly) {
        addPinnedRows(ids);
      }
      await reloadRows();
      toast.success(t('common.success'));
    } catch (err) {
      Logger.error('Edition.handleBulkCategorize', err);
      toast.error(t('common.error'));
    }
  };

  const handleDuplicate = async (row: TransactionRow) => {
    try {
      const newId = await EditionService.insert({
        accountId: row.accountId,
        date: row.date,
        debit: row.debit,
        credit: row.credit,
        label: row.label,
        categoryCode: row.categoryCode,
      });
      const newRow = await EditionService.getById(newId);
      if (newRow) {
        history.push({ kind: 'insert', row: newRow });
      }
      await reloadRows();
    } catch (err) {
      Logger.error('Edition.handleDuplicate', err);
      toast.error(t('common.error'));
    }
  };

  const showEmptyUpload = totalAll === 0;
  const showAllCategorized = uncategorizedOnly && rows.length === 0 && totalAll > 0;
  const showNoResults = !showEmptyUpload && !showAllCategorized && rows.length === 0 && totalAll > 0;

  return (
    <div className="edition-page">
      <header className="edition-page-header">
        <h1>{t('edition.title')}</h1>
        <p>{t('edition.subtitle')}</p>
      </header>

      <EditionToolbar
        accounts={accounts}
        categories={categories}
        selectedAccounts={selectedAccounts}
        selectedCategories={selectedCategories}
        uncategorizedOnly={uncategorizedOnly}
        dateStart={dateStart}
        dateEnd={dateEnd}
        search={search}
        canUndo={history.canUndo}
        canRedo={history.canRedo}
        onUndo={() => void history.undo().catch(() => toast.error(t('common.error')))}
        onRedo={() => void history.redo().catch(() => toast.error(t('common.error')))}
        onAddRow={() => void insertRow()}
        onAutocat={() => void runAutocat()}
        onRoutineLabel={() => setRoutineModal({ row: null, word: '' })}
        onDuplicates={async () => setDupGroups(await EditionService.findDuplicates())}
        onAccounts={setSelectedAccounts}
        onCategories={setSelectedCategories}
        onUncategorized={setUncategorizedOnly}
        onDates={(s, e) => {
          setDateStart(s);
          setDateEnd(e);
        }}
        onSearch={setSearch}
      />

      <div className="edition-workspace">
        <div className="edition-table-zone" data-tour="onb-edition-table">
          <TransactionTable
            key={tableKey}
            rows={rows}
            accounts={accounts}
            categories={categories}
            total={total}
            totalInDb={totalAll}
            onUpdate={(id, fields) => void handleUpdate(id, fields)}
            onDelete={setDeleteId}
            onBulkDelete={(ids) => void handleBulkDelete(ids)}
            onBulkCategorize={(ids, code) => void handleBulkCategorize(ids, code)}
            onDuplicate={handleDuplicate}
            onInsertRelative={(refRowId, position) => handleInsertRelative(refRowId, position)}
            onRoutineLabel={(rowId, selectedText) => {
              const row = rows.find((r) => r.id === rowId);
              if (row) setRoutineModal({ row, word: selectedText ?? '' });
            }}
            sortBy={sortBy}
            sortDir={sortDir}
            onSort={handleSort}
            showEmptyUpload={showEmptyUpload}
            showAllCategorized={showAllCategorized}
            showNoResults={showNoResults}
          />
        </div>
        <CategoryPanel
          categories={categories}
          collapsed={categoryPanelCollapsed}
          onToggleCollapse={() => setCategoryPanelCollapsed((v) => !v)}
          onCategoriesChange={() => void reloadMeta().then(() => reloadRows())}
          rulesVersion={tableKey}
          onAddRoutine={() => setRoutineModal({ row: null, word: '' })}
        />
      </div>

      <ConfirmModal
        isOpen={Boolean(autocatPending)}
        title={t('edition.autocat')}
        message={t('edition.autocatConfirm', { count: autocatPending?.count ?? 0 })}
        danger={false}
        onCancel={() => setAutocatPending(null)}
        onConfirm={() => void confirmAutocat()}
      />
      <ConfirmModal
        isOpen={deleteId !== null}
        title={t('common.delete')}
        message={t('edition.deleteConfirm')}
        onCancel={() => setDeleteId(null)}
        onConfirm={async () => {
          if (deleteId === null) return;
          const row = rows.find((r) => r.id === deleteId) ?? (await EditionService.getById(deleteId));
          if (!row) {
            setDeleteId(null);
            return;
          }
          await EditionService.remove(deleteId);
          history.push({ kind: 'delete', row });
          setDeleteId(null);
          await reloadRows();
        }}
      />
      <AutoCatReviewModal
        isOpen={suggestions !== null}
        items={suggestions ?? []}
        onClose={() => setSuggestions(null)}
        onApply={(selected) => void applySuggestions(selected)}
      />
      <RoutineLabelModal
        isOpen={routineModal !== null}
        row={routineModal?.row ?? null}
        initialWord={routineModal?.word ?? ''}
        categories={categories}
        onClose={() => setRoutineModal(null)}
        onSaved={async (applied) => {
          setRoutineModal(null);
          setTableKey((k) => k + 1);
          await reloadRows();
          toast.success(t('edition.routineLabelApplied', { count: applied }));
        }}
      />
      <DuplicatesModal
        isOpen={dupGroups !== null}
        groups={dupGroups ?? []}
        onClose={() => setDupGroups(null)}
        onDelete={async (ids) => {
          const snapshots = (
            await Promise.all(ids.map((id) => EditionService.getById(id)))
          ).filter((r): r is TransactionRow => r !== null);
          await EditionService.deleteIds(ids);
          if (snapshots.length > 0) {
            history.push({ kind: 'bulkDelete', rows: snapshots });
          }
          setDupGroups(null);
          await reloadRows();
        }}
      />
    </div>
  );
};

export default EditionPage;
