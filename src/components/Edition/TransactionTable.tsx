import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import { Funnel, Trash2, Copy, Tag } from 'lucide-react';
import { Account, Category, TransactionRow } from '../../types/models';
import {
  DEFAULT_EDITION_COLUMN_WIDTHS,
  EditionColumnKey,
} from '../../types/editionUi';
import { parseAmount } from '../../utils/amounts';
import { Db } from '../../services/db';
import { EditionUiService } from '../../services/EditionUiService';
import EditionTablePlaceholder from './EditionTablePlaceholder';
import EditionColumnFilter from './EditionColumnFilter';
import { CategorySwatch } from '../Common/CategoryX';
import { isTransferCategory } from '../../utils/categories';

type SortCol =
  | 'date'
  | 'value_date'
  | 'label'
  | 'debit'
  | 'credit'
  | 'category_code'
  | 'account_id';

interface TransactionTableProps {
  rows: TransactionRow[];
  accounts: Account[];
  categories: Category[];
  total: number;
  totalInDb?: number;
  onUpdate: (id: number, fields: Partial<TransactionRow>) => void;
  onDelete: (id: number) => void;
  onBulkDelete: (ids: number[]) => void;
  onBulkCategorize: (ids: number[], code: string) => void;
  onDuplicate: (row: TransactionRow) => Promise<void> | void;
  onInsertRelative: (refRowId: number, position: 'above' | 'below') => void;
  onRoutineLabel: (rowId: number, selectedText?: string) => void;
  sortBy: string;
  sortDir: 'asc' | 'desc' | null;
  onSort: (col: SortCol, dir?: 'asc' | 'desc') => void;
  showEmptyUpload?: boolean;
  showAllCategorized?: boolean;
  showNoResults?: boolean;
}

const ROW_HEIGHT = 36;
const VIRTUALIZATION_THRESHOLD = 500;
const OVERSCAN = 20;
const MIN_COL_WIDTH = 50;
const COL_COUNT = 8;

const COLS: SortCol[] = [
  'date',
  'value_date',
  'account_id',
  'label',
  'debit',
  'credit',
  'category_code',
];

const COLUMN_KEYS: EditionColumnKey[] = [
  'date',
  'value_date',
  'account_id',
  'label',
  'debit',
  'credit',
  'category_code',
  'actions',
];

interface ContextMenuState {
  x: number;
  y: number;
  rowId: number;
  selectedText: string;
}

const CATEGORY_COL = 6;

function columnValue(row: TransactionRow, col: SortCol, accounts: Account[]): string {
  switch (col) {
    case 'date':
      return row.date;
    case 'value_date':
      return row.valueDate ?? '';
    case 'account_id':
      return accounts.find((a) => a.id === row.accountId)?.code ?? row.accountCode ?? String(row.accountId);
    case 'label':
      return row.label;
    case 'debit':
      return row.debit ? String(row.debit) : '';
    case 'credit':
      return row.credit ? String(row.credit) : '';
    case 'category_code':
      return row.categoryCode ?? '';
  }
}

function uniqueColumnValues(
  rows: TransactionRow[],
  col: SortCol,
  accounts: Account[]
): string[] {
  const set = new Set<string>();
  for (const row of rows) set.add(columnValue(row, col, accounts));
  return Array.from(set).sort((a, b) => {
    if (a === '') return 1;
    if (b === '') return -1;
    return a.localeCompare(b, 'fr', { numeric: true, sensitivity: 'base' });
  });
}

const TransactionTable: React.FC<TransactionTableProps> = ({
  rows,
  accounts,
  categories,
  total,
  totalInDb,
  onUpdate,
  onDelete,
  onBulkDelete,
  onBulkCategorize,
  onDuplicate,
  onInsertRelative,
  onRoutineLabel,
  sortBy,
  sortDir,
  onSort,
  showEmptyUpload,
  showAllCategorized,
  showNoResults,
}) => {
  const { t } = useTranslation();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const cellRefs = useRef<Map<string, HTMLElement>>(new Map());
  const skipBlurRef = useRef(false);
  const saveWidthsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const filterHeaderRef = useRef<HTMLTableCellElement | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [focusedCell, setFocusedCell] = useState<{ row: number; col: number } | null>(null);
  const [catQuery, setCatQuery] = useState<{ rowId: number; query: string } | null>(null);
  const [columnWidths, setColumnWidths] = useState<Record<EditionColumnKey, number>>(
    DEFAULT_EDITION_COLUMN_WIDTHS
  );
  const [resizingColumn, setResizingColumn] = useState<EditionColumnKey | null>(null);
  const [resizeStartX, setResizeStartX] = useState(0);
  const [resizeStartWidth, setResizeStartWidth] = useState(0);
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 60 });
  const [filterColumn, setFilterColumn] = useState<SortCol | null>(null);
  const [filterSearch, setFilterSearch] = useState('');
  const [filterPosition, setFilterPosition] = useState({ top: 0, left: 0 });
  const [filterSelections, setFilterSelections] = useState<Partial<Record<SortCol, Set<string>>>>(
    {}
  );
  const [selectedRowIds, setSelectedRowIds] = useState<Set<number>>(new Set());
  const [lastClickedIndex, setLastClickedIndex] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartIndex, setDragStartIndex] = useState<number | null>(null);
  const [bulkCatOpen, setBulkCatOpen] = useState(false);

  const displayRows = useMemo(() => {
    const active = Object.entries(filterSelections) as Array<[SortCol, Set<string>]>;
    if (active.length === 0) return rows;
    return rows.filter((row) =>
      active.every(([col, selected]) => selected.has(columnValue(row, col, accounts)))
    );
  }, [rows, filterSelections, accounts]);

  const uniqueValues = useMemo(() => {
    if (!filterColumn) return [];
    const others = (Object.entries(filterSelections) as Array<[SortCol, Set<string>]>).filter(
      ([col]) => col !== filterColumn
    );
    const source =
      others.length === 0
        ? rows
        : rows.filter((row) =>
            others.every(([col, selected]) => selected.has(columnValue(row, col, accounts)))
          );
    return uniqueColumnValues(source, filterColumn, accounts);
  }, [rows, filterColumn, filterSelections, accounts]);

  const shouldVirtualize = displayRows.length >= VIRTUALIZATION_THRESHOLD;

  useEffect(() => {
    const profileId = Db.profileId;
    if (!profileId) return;
    EditionUiService.loadColumnWidths(profileId).then(setColumnWidths);
  }, []);

  const scheduleSaveColumnWidths = useCallback((widths: Record<EditionColumnKey, number>) => {
    const profileId = Db.profileId;
    if (!profileId) return;
    if (saveWidthsTimeoutRef.current) clearTimeout(saveWidthsTimeoutRef.current);
    saveWidthsTimeoutRef.current = setTimeout(() => {
      EditionUiService.saveColumnWidths(profileId, widths).catch(() => undefined);
    }, 400);
  }, []);

  useEffect(() => {
    if (resizingColumn === null) return;

    const handleMouseMove = (e: MouseEvent) => {
      const diff = e.clientX - resizeStartX;
      const newWidth = Math.max(MIN_COL_WIDTH, resizeStartWidth + diff);
      setColumnWidths((prev) => {
        const next = { ...prev, [resizingColumn]: newWidth };
        return next;
      });
    };

    const handleMouseUp = () => {
      setResizingColumn(null);
      setColumnWidths((prev) => {
        scheduleSaveColumnWidths(prev);
        return prev;
      });
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizingColumn, resizeStartX, resizeStartWidth, scheduleSaveColumnWidths]);

  useEffect(() => {
    return () => {
      if (saveWidthsTimeoutRef.current) clearTimeout(saveWidthsTimeoutRef.current);
    };
  }, []);

  const updateVisibleRange = useCallback(
    (scrollTop: number, clientHeight: number) => {
      const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
      const visibleCount = Math.ceil(clientHeight / ROW_HEIGHT) + OVERSCAN * 2;
      const end = Math.min(displayRows.length, start + visibleCount);
      setVisibleRange((prev) =>
        prev.start === start && prev.end === end ? prev : { start, end }
      );
    },
    [displayRows.length]
  );

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || !shouldVirtualize) {
      setVisibleRange({ start: 0, end: displayRows.length });
      return;
    }

    let rafId = 0;
    const onScroll = () => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        updateVisibleRange(scroller.scrollTop, scroller.clientHeight);
      });
    };

    updateVisibleRange(scroller.scrollTop, scroller.clientHeight);
    scroller.addEventListener('scroll', onScroll, { passive: true });
    const resizeObserver = new ResizeObserver(() => {
      updateVisibleRange(scroller.scrollTop, scroller.clientHeight);
    });
    resizeObserver.observe(scroller);

    return () => {
      scroller.removeEventListener('scroll', onScroll);
      resizeObserver.disconnect();
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [shouldVirtualize, displayRows.length, updateVisibleRange]);

  const visibleRows = useMemo(() => {
    if (!shouldVirtualize) {
      return displayRows.map((row, rowIndex) => ({ row, rowIndex }));
    }
    return displayRows
      .slice(visibleRange.start, visibleRange.end)
      .map((row, index) => ({ row, rowIndex: visibleRange.start + index }));
  }, [displayRows, shouldVirtualize, visibleRange]);

  const { topSpacer, bottomSpacer } = useMemo(() => {
    if (!shouldVirtualize) return { topSpacer: 0, bottomSpacer: 0 };
    const totalHeight = displayRows.length * ROW_HEIGHT;
    const top = visibleRange.start * ROW_HEIGHT;
    const visibleHeight = visibleRows.length * ROW_HEIGHT;
    return {
      topSpacer: top,
      bottomSpacer: Math.max(0, totalHeight - top - visibleHeight),
    };
  }, [shouldVirtualize, displayRows.length, visibleRange.start, visibleRows.length]);

  const selectRange = useCallback(
    (fromIndex: number, toIndex: number, additive: boolean) => {
      const min = Math.min(fromIndex, toIndex);
      const max = Math.max(fromIndex, toIndex);
      const ids = new Set<number>();
      for (let i = min; i <= max; i++) {
        const row = displayRows[i];
        if (row) ids.add(row.id);
      }
      setSelectedRowIds((prev) => {
        if (additive) {
          const next = new Set(prev);
          ids.forEach((id) => next.add(id));
          return next;
        }
        return ids;
      });
    },
    [displayRows]
  );

  const handleRowMouseDown = useCallback(
    (rowIndex: number, e: React.MouseEvent) => {
      if (e.button !== 0) return;
      const row = displayRows[rowIndex];
      if (!row) return;
      const target = e.target as HTMLElement;
      const onFormControl = Boolean(target.closest('input, select, textarea, button'));
      if (e.shiftKey && lastClickedIndex !== null) {
        e.preventDefault();
        selectRange(lastClickedIndex, rowIndex, e.ctrlKey || e.metaKey);
        setLastClickedIndex(rowIndex);
        return;
      }
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        setSelectedRowIds((prev) => {
          const next = new Set(prev);
          if (next.has(row.id)) next.delete(row.id);
          else next.add(row.id);
          return next;
        });
        setLastClickedIndex(rowIndex);
        return;
      }
      setSelectedRowIds(new Set([row.id]));
      setLastClickedIndex(rowIndex);
      if (!onFormControl) {
        setIsDragging(true);
        setDragStartIndex(rowIndex);
      }
    },
    [displayRows, lastClickedIndex, selectRange]
  );

  const handleRowMouseEnter = useCallback(
    (rowIndex: number) => {
      if (!isDragging || dragStartIndex === null) return;
      selectRange(dragStartIndex, rowIndex, false);
    },
    [isDragging, dragStartIndex, selectRange]
  );

  const stopDragging = useCallback(() => {
    setIsDragging(false);
    setDragStartIndex(null);
  }, []);

  useEffect(() => {
    if (!isDragging) return;
    const onMouseUp = () => stopDragging();
    document.addEventListener('mouseup', onMouseUp);
    return () => document.removeEventListener('mouseup', onMouseUp);
  }, [isDragging, stopDragging]);

  const contextRowIds = useMemo(() => {
    if (!contextMenu) return [];
    const clicked = displayRows.find((r) => r.id === contextMenu.rowId);
    if (!clicked) return [contextMenu.rowId];
    if (selectedRowIds.has(contextMenu.rowId)) {
      return Array.from(selectedRowIds);
    }
    return [contextMenu.rowId];
  }, [contextMenu, displayRows, selectedRowIds]);

  const isMultiSelection = contextRowIds.length > 1;

  const handleBulkDelete = () => {
    if (contextRowIds.length === 0) return;
    onBulkDelete(contextRowIds);
    setContextMenu(null);
    setSelectedRowIds(new Set());
  };

  const handleBulkCategorize = (code: string) => {
    if (contextRowIds.length === 0) return;
    onBulkCategorize(contextRowIds, code);
    setContextMenu(null);
    setBulkCatOpen(false);
    setSelectedRowIds(new Set());
  };

  const handleDuplicate = async () => {
    if (contextRowIds.length === 0) return;
    const targets = rows.filter((r) => contextRowIds.includes(r.id));
    for (const row of targets) {
      await onDuplicate(row);
    }
    setContextMenu(null);
    setSelectedRowIds(new Set());
  };

  useEffect(() => {
    const close = () => {
      setContextMenu(null);
      setBulkCatOpen(false);
    };
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, []);

  const catSuggestions = useMemo(() => {
    if (!catQuery) return [];
    const q = catQuery.query.toLowerCase();
    return categories
      .filter(
        (c) =>
          c.code.toLowerCase().includes(q) ||
          c.name.toLowerCase().includes(q)
      )
      .slice(0, 10);
  }, [catQuery, categories]);

  const resolveCategoryCode = useCallback(
    (raw: string): string | null => {
      const trimmed = raw.trim();
      if (!trimmed) return null;
      const q = trimmed.toLowerCase();
      const exact = categories.find((c) => c.code.toLowerCase() === q);
      if (exact) return exact.code;
      const partial = categories.filter(
        (c) => c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q)
      );
      if (partial.length === 1) return partial[0].code;
      return null;
    },
    [categories]
  );

  const setCellRef = (row: number, col: number, el: HTMLElement | null) => {
    const key = `${row}-${col}`;
    if (el) cellRefs.current.set(key, el);
    else cellRefs.current.delete(key);
  };

  const focusCell = useCallback(
    (row: number, col: number) => {
      const scroller = scrollerRef.current;
      if (scroller) {
        const targetTop = row * ROW_HEIGHT;
        const maxScroll = scroller.scrollHeight - scroller.clientHeight;
        scroller.scrollTop = Math.min(Math.max(0, targetTop - ROW_HEIGHT * 2), maxScroll);
        if (shouldVirtualize) {
          updateVisibleRange(scroller.scrollTop, scroller.clientHeight);
        }
      }
      setFocusedCell({ row, col });
      requestAnimationFrame(() => {
        const el = cellRefs.current.get(`${row}-${col}`);
        el?.focus();
        if (el instanceof HTMLInputElement) el.select();
      });
    },
    [shouldVirtualize, updateVisibleRange]
  );

  useEffect(() => {
    if (!focusedCell) return;
    const el = cellRefs.current.get(`${focusedCell.row}-${focusedCell.col}`);
    if (document.activeElement !== el) {
      el?.focus();
    }
  }, [focusedCell, visibleRows]);

  const sortIndicator = (col: SortCol) => {
    if (sortBy !== col || !sortDir) return '';
    return sortDir === 'asc' ? ' ↑' : ' ↓';
  };

  const handleResizeStart = (e: React.MouseEvent, colKey: EditionColumnKey) => {
    e.preventDefault();
    e.stopPropagation();
    setResizingColumn(colKey);
    setResizeStartX(e.clientX);
    setResizeStartWidth(columnWidths[colKey]);
  };

  const closeColumnFilter = useCallback(() => {
    setFilterColumn(null);
    setFilterSearch('');
  }, []);

  const placeFilterPanel = useCallback((anchor: HTMLElement) => {
    const rect = anchor.getBoundingClientRect();
    const panelWidth = 240;
    const panelHeight = 300;
    let left = rect.left;
    if (left + panelWidth > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - panelWidth - 8);
    }
    let top = rect.bottom + 2;
    if (top + panelHeight > window.innerHeight - 8) {
      top = Math.max(8, rect.top - panelHeight);
    }
    setFilterPosition({ top, left });
  }, []);

  useEffect(() => {
    if (!filterColumn) return;
    const update = () => {
      if (filterHeaderRef.current) placeFilterPanel(filterHeaderRef.current);
    };
    update();
    const scroller = scrollerRef.current;
    scroller?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    return () => {
      scroller?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [filterColumn, placeFilterPanel]);

  const openColumnFilter = (col: SortCol, th: HTMLElement) => {
    setFilterColumn((prev) => {
      if (prev === col) {
        setFilterSearch('');
        return null;
      }
      setFilterSearch('');
      return col;
    });
    placeFilterPanel(th);
  };

  const toggleFilterValue = useCallback(
    (value: string) => {
      if (!filterColumn) return;
      const allUniques = uniqueValues;
      setFilterSelections((prev) => {
        const current = prev[filterColumn];
        const next = new Set(current ?? allUniques);
        if (next.has(value)) next.delete(value);
        else next.add(value);
        const nextMap = { ...prev };
        if (next.size === allUniques.length) delete nextMap[filterColumn];
        else nextMap[filterColumn] = next;
        return nextMap;
      });
    },
    [filterColumn, uniqueValues]
  );

  const selectAllFilter = useCallback(
    (checked: boolean) => {
      if (!filterColumn) return;
      setFilterSelections((prev) => {
        const next = { ...prev };
        if (checked) delete next[filterColumn];
        else next[filterColumn] = new Set();
        return next;
      });
    },
    [filterColumn]
  );

  const applyVisibleFilter = useCallback(
    (keep: string[]) => {
      if (!filterColumn) return;
      const allUniques = uniqueValues;
      setFilterSelections((prev) => {
        const nextMap = { ...prev };
        const keepSet = new Set(keep);
        if (keepSet.size === allUniques.length) delete nextMap[filterColumn];
        else nextMap[filterColumn] = keepSet;
        return nextMap;
      });
    },
    [filterColumn, uniqueValues]
  );

  const header = (col: SortCol, colKey: EditionColumnKey, label: string) => (
    <th
      key={colKey}
      className={`sortable${resizingColumn === colKey ? ' resizing' : ''}${
        filterSelections[col] ? ' filtered' : ''
      }${filterColumn === col ? ' filter-open' : ''}`}
      style={{ width: columnWidths[colKey] }}
      ref={filterColumn === col ? filterHeaderRef : undefined}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('.edition-col-resize-handle')) return;
        openColumnFilter(col, e.currentTarget);
      }}
    >
      <div className="edition-th-inner">
        <span className="edition-th-label">
          {label}
          {sortIndicator(col)}
        </span>
        {filterSelections[col] && (
          <Funnel size={12} className="edition-th-filter-icon" aria-hidden />
        )}
        <span
          className="edition-col-resize-handle"
          title={t('edition.resizeColumn')}
          tabIndex={0}
          onMouseDown={(e) => handleResizeStart(e, colKey)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') e.preventDefault();
          }}
          role="separator"
          aria-orientation="vertical"
          aria-label={t('edition.resizeColumn')}
        />
      </div>
    </th>
  );

  const moveFocus = useCallback(
    (rowDelta: number, colDelta: number) => {
      if (!focusedCell) return;
      const newRow = Math.max(0, Math.min(displayRows.length - 1, focusedCell.row + rowDelta));
      const newCol = Math.max(0, Math.min(COLS.length - 1, focusedCell.col + colDelta));
      focusCell(newRow, newCol);
    },
    [focusedCell, displayRows.length, focusCell]
  );

  const commitCategory = (
    row: TransactionRow,
    raw: string,
    input: HTMLInputElement
  ): boolean => {
    const trimmed = raw.trim();
    if (!trimmed) {
      if (row.categoryCode) onUpdate(row.id, { categoryCode: null });
      input.value = '';
      setCatQuery(null);
      return true;
    }
    const code = resolveCategoryCode(raw);
    if (!code) {
      toast.warn(t('edition.categoryInvalid'));
      return false;
    }
    if (code !== row.categoryCode) {
      onUpdate(row.id, { categoryCode: code });
    }
    input.value = code;
    setCatQuery(null);
    return true;
  };

  const handleCategoryKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    row: TransactionRow,
    rowIndex: number
  ) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      skipBlurRef.current = true;
      const input = e.currentTarget;
      if (!commitCategory(row, input.value, input)) {
        skipBlurRef.current = false;
        return;
      }
      const nextRow = rowIndex + 1;
      if (nextRow < displayRows.length) {
        focusCell(nextRow, CATEGORY_COL);
      } else {
        input.blur();
      }
      skipBlurRef.current = false;
      return;
    }
    handleKeyDown(e, rowIndex, CATEGORY_COL);
  };

  const handleKeyDown = (e: React.KeyboardEvent, rowIndex: number, colIndex: number) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      moveFocus(1, 0);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      moveFocus(-1, 0);
    } else if (e.key === 'ArrowRight' && e.currentTarget instanceof HTMLInputElement) {
      const el = e.currentTarget;
      if (el.selectionStart === el.value.length) {
        e.preventDefault();
        moveFocus(0, 1);
      }
    } else if (e.key === 'ArrowLeft' && e.currentTarget instanceof HTMLInputElement) {
      const el = e.currentTarget;
      if (el.selectionStart === 0) {
        e.preventDefault();
        moveFocus(0, -1);
      }
    } else if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault();
      moveFocus(0, 1);
    } else if (e.key === 'Tab' && e.shiftKey) {
      e.preventDefault();
      moveFocus(0, -1);
    } else if (e.key === 'Enter' && colIndex !== CATEGORY_COL) {
      e.preventDefault();
      moveFocus(1, 0);
    }
    if (colIndex !== CATEGORY_COL) {
      setFocusedCell({ row: rowIndex, col: colIndex });
    }
  };

  const renderRow = (row: TransactionRow, rowIndex: number) => {
    const isFocusedRow = focusedCell?.row === rowIndex;
    const isSelected = selectedRowIds.has(row.id);
    return (
      <tr
        key={row.id}
        style={{ height: ROW_HEIGHT }}
        className={isSelected ? 'edition-row-selected' : ''}
        onMouseDown={(e) => handleRowMouseDown(rowIndex, e)}
        onMouseEnter={() => handleRowMouseEnter(rowIndex)}
        onContextMenu={(e) => {
          e.preventDefault();
          let selectedText = '';
          const target = e.target;
          if (target instanceof HTMLInputElement) {
            const start = target.selectionStart ?? 0;
            const end = target.selectionEnd ?? 0;
            if (end > start) selectedText = target.value.slice(start, end).trim();
          }
          setContextMenu({ x: e.clientX, y: e.clientY, rowId: row.id, selectedText });
        }}
      >
        <td className={isFocusedRow && focusedCell?.col === 0 ? 'edition-cell-focus' : ''}>
          <input
            className="edition-cell-input"
            defaultValue={row.date}
            ref={(el) => setCellRef(rowIndex, 0, el)}
            onFocus={() => setFocusedCell({ row: rowIndex, col: 0 })}
            onKeyDown={(e) => handleKeyDown(e, rowIndex, 0)}
            onBlur={(e) => {
              if (e.target.value !== row.date) onUpdate(row.id, { date: e.target.value });
            }}
          />
        </td>
        <td className={isFocusedRow && focusedCell?.col === 1 ? 'edition-cell-focus' : ''}>
          <input
            className="edition-cell-input"
            defaultValue={row.valueDate ?? row.date}
            ref={(el) => setCellRef(rowIndex, 1, el)}
            onFocus={() => setFocusedCell({ row: rowIndex, col: 1 })}
            onKeyDown={(e) => handleKeyDown(e, rowIndex, 1)}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v && v !== row.valueDate) onUpdate(row.id, { valueDate: v });
            }}
          />
        </td>
        <td className={isFocusedRow && focusedCell?.col === 2 ? 'edition-cell-focus' : ''}>
          <select
            className="edition-cell-input"
            value={row.accountId}
            ref={(el) => setCellRef(rowIndex, 2, el)}
            onFocus={() => setFocusedCell({ row: rowIndex, col: 2 })}
            onKeyDown={(e) => handleKeyDown(e, rowIndex, 2)}
            onChange={(e) => onUpdate(row.id, { accountId: Number(e.target.value) })}
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.code}</option>
            ))}
          </select>
        </td>
        <td className={isFocusedRow && focusedCell?.col === 3 ? 'edition-cell-focus' : ''}>
          <input
            className="edition-cell-input"
            defaultValue={row.label}
            ref={(el) => setCellRef(rowIndex, 3, el)}
            onFocus={() => setFocusedCell({ row: rowIndex, col: 3 })}
            onKeyDown={(e) => handleKeyDown(e, rowIndex, 3)}
            onBlur={(e) => {
              if (e.target.value !== row.label) onUpdate(row.id, { label: e.target.value });
            }}
          />
        </td>
        <td className={`amount${isFocusedRow && focusedCell?.col === 4 ? ' edition-cell-focus' : ''}`}>
          <input
            className="edition-cell-input"
            style={{ textAlign: 'right' }}
            defaultValue={row.debit || ''}
            ref={(el) => setCellRef(rowIndex, 4, el)}
            onFocus={() => setFocusedCell({ row: rowIndex, col: 4 })}
            onKeyDown={(e) => handleKeyDown(e, rowIndex, 4)}
            onBlur={(e) => {
              let debit = parseAmount(e.target.value);
              if (debit > 0) debit = -debit;
              if (debit !== row.debit) onUpdate(row.id, { debit });
            }}
          />
        </td>
        <td className={`amount${isFocusedRow && focusedCell?.col === 5 ? ' edition-cell-focus' : ''}`}>
          <input
            className="edition-cell-input"
            style={{ textAlign: 'right' }}
            defaultValue={row.credit || ''}
            ref={(el) => setCellRef(rowIndex, 5, el)}
            onFocus={() => setFocusedCell({ row: rowIndex, col: 5 })}
            onKeyDown={(e) => handleKeyDown(e, rowIndex, 5)}
            onBlur={(e) => {
              const credit = Math.abs(parseAmount(e.target.value));
              if (credit !== row.credit) onUpdate(row.id, { credit });
            }}
          />
        </td>
        <td
          className={isFocusedRow && focusedCell?.col === CATEGORY_COL ? 'edition-cell-focus' : ''}
          style={{ position: 'relative' }}
        >
          <input
            className="edition-cell-input"
            defaultValue={row.categoryCode ?? ''}
            ref={(el) => setCellRef(rowIndex, CATEGORY_COL, el)}
            onFocus={() => setFocusedCell({ row: rowIndex, col: CATEGORY_COL })}
            onKeyDown={(e) => handleCategoryKeyDown(e, row, rowIndex)}
            onChange={(e) => setCatQuery({ rowId: row.id, query: e.target.value })}
            onBlur={(e) => {
              if (skipBlurRef.current) return;
              setCatQuery(null);
              const raw = e.target.value.trim();
              if (!raw) {
                if (row.categoryCode) onUpdate(row.id, { categoryCode: null });
                return;
              }
              const code = resolveCategoryCode(raw);
              if (!code) return;
              if (code !== row.categoryCode) {
                e.target.value = code;
                onUpdate(row.id, { categoryCode: code });
              }
            }}
          />
          {catQuery?.rowId === row.id && catSuggestions.length > 0 && (
            <div className="edition-cat-suggestions">
              {catSuggestions.map((c) => (
                <div
                  key={c.code}
                  className="edition-cat-suggestion-item"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onUpdate(row.id, { categoryCode: c.code });
                    setCatQuery(null);
                  }}
                >
                  <CategorySwatch code={c.code} color={c.color} className="edition-category-dot" />
                  {c.code} — {isTransferCategory(c.code) ? t('common.categoryXName') : c.name}
                </div>
              ))}
            </div>
          )}
        </td>
        <td>
          <button
            type="button"
            className="ct-btn-icon"
            onClick={() => onDelete(row.id)}
            title={t('common.delete')}
          >
            <Trash2 size={16} />
          </button>
        </td>
      </tr>
    );
  };

  if (showEmptyUpload) {
    return <EditionTablePlaceholder variant="empty" />;
  }

  if (showAllCategorized) {
    return <EditionTablePlaceholder variant="allCategorized" />;
  }

  if (showNoResults) {
    return <EditionTablePlaceholder variant="noResults" />;
  }

  return (
    <>
      <div
        ref={scrollerRef}
        className={`edition-excel-scroller${isDragging ? ' edition-dragging' : ''}`}
      >
        <table className="edition-excel-table">
          <colgroup>
            {COLUMN_KEYS.map((colKey) => (
              <col key={colKey} style={{ width: columnWidths[colKey] }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {header('date', 'date', t('upload.colDate'))}
              {header('value_date', 'value_date', t('edition.valueDate'))}
              {header('account_id', 'account_id', t('upload.account'))}
              {header('label', 'label', t('upload.colLabel'))}
              {header('debit', 'debit', t('upload.colDebit'))}
              {header('credit', 'credit', t('upload.colCredit'))}
              {header('category_code', 'category_code', t('settings.tabs.categories'))}
              <th
                className={resizingColumn === 'actions' ? 'resizing' : ''}
                style={{ width: columnWidths.actions }}
              >
                <div className="edition-th-inner">
                  <span className="edition-th-label" />
                  <span
                    className="edition-col-resize-handle"
                    title={t('edition.resizeColumn')}
                    tabIndex={0}
                    onMouseDown={(e) => handleResizeStart(e, 'actions')}
                    role="separator"
                    aria-orientation="vertical"
                    aria-label={t('edition.resizeColumn')}
                  />
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {shouldVirtualize && topSpacer > 0 && (
              <tr style={{ height: topSpacer, visibility: 'hidden' }} aria-hidden>
                <td colSpan={COL_COUNT} style={{ padding: 0, border: 'none' }} />
              </tr>
            )}
            {visibleRows.map(({ row, rowIndex }) => renderRow(row, rowIndex))}
            {shouldVirtualize && bottomSpacer > 0 && (
              <tr style={{ height: bottomSpacer, visibility: 'hidden' }} aria-hidden>
                <td colSpan={COL_COUNT} style={{ padding: 0, border: 'none' }} />
              </tr>
            )}
            {displayRows.length === 0 && (
              <tr>
                <td colSpan={COL_COUNT} className="edition-excel-empty-filter">
                  {t('edition.noResults')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="edition-footer">
        <span>
          {displayRows.length !== rows.length
            ? t('edition.rowCountFiltered', {
                shown: displayRows.length,
                total: rows.length,
              })
            : totalInDb !== undefined && totalInDb !== total
              ? t('edition.rowCountFiltered', { shown: total, total: totalInDb })
              : t('edition.rowCountTotal', { total })}
        </span>
      </div>
      {contextMenu && (
        <div
          className="edition-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {isMultiSelection && (
            <div className="edition-context-menu-count">
              {t('edition.selectedCount', { count: contextRowIds.length })}
            </div>
          )}
          {!isMultiSelection && (
            <>
              <button
                type="button"
                onClick={() => {
                  onInsertRelative(contextMenu.rowId, 'above');
                  setContextMenu(null);
                }}
              >
                {t('edition.insertAbove')}
              </button>
              <button
                type="button"
                onClick={() => {
                  onInsertRelative(contextMenu.rowId, 'below');
                  setContextMenu(null);
                }}
              >
                {t('edition.insertBelow')}
              </button>
              <button
                type="button"
                onClick={() => {
                  onRoutineLabel(contextMenu.rowId, contextMenu.selectedText);
                  setContextMenu(null);
                }}
              >
                {t('edition.routineLabel')}
              </button>
            </>
          )}
          <button type="button" onClick={handleDuplicate}>
            <Copy size={14} /> {t('edition.duplicate')}
          </button>
          <button
            type="button"
            onClick={() => {
              setBulkCatOpen((v) => !v);
            }}
          >
            <Tag size={14} /> {t('edition.categorize')}
          </button>
          {bulkCatOpen && (
            <div className="edition-context-menu-cats">
              {categories.map((c) => (
                <button
                  key={c.code}
                  type="button"
                  onClick={() => handleBulkCategorize(c.code)}
                >
                  <CategorySwatch code={c.code} color={c.color} className="edition-category-dot" />
                  {c.code} — {isTransferCategory(c.code) ? t('common.categoryXName') : c.name}
                </button>
              ))}
            </div>
          )}
          <button
            type="button"
            className="edition-context-menu-danger"
            onClick={handleBulkDelete}
          >
            <Trash2 size={14} /> {isMultiSelection ? t('edition.bulkDelete', { count: contextRowIds.length }) : t('common.delete')}
          </button>
        </div>
      )}
      {filterColumn !== null && (
        <EditionColumnFilter
          values={uniqueValues}
          selected={filterSelections[filterColumn] ?? null}
          search={filterSearch}
          onSearch={setFilterSearch}
          onToggle={toggleFilterValue}
          onSelectAll={selectAllFilter}
          onApplyVisible={applyVisibleFilter}
          onSortAsc={() => onSort(filterColumn, 'asc')}
          onSortDesc={() => onSort(filterColumn, 'desc')}
          position={filterPosition}
          onClose={closeColumnFilter}
        />
      )}
    </>
  );
};

export default TransactionTable;
