import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, X } from 'lucide-react';
import { Category } from '../../types/models';
import {
  DEFAULT_COLUMN_WIDTHS,
  FORECAST_COLUMN_CATALOG,
  ForecastColumnId,
} from '../../types/forecast';
import { FlowType, PERIODICITY_VALUES } from '../../types/projection';
import { ForecastGridRow, parseFlowType, parsePeriodicity } from '../../services/ForecastModel';
import { formatMoney, parseAmount } from '../../utils/amounts';
import { formatFrDate } from '../../utils/dateFormats';

const MIN_COL_WIDTH = 64;

export type ForecastCellPatch = Partial<
  Pick<
    ForecastGridRow,
    'name' | 'type' | 'amount' | 'periodicity' | 'startDate' | 'endDate' | 'categoryCode' | 'color' | 'parentId' | 'groupName'
  >
>;

interface ForecastGridProps {
  rows: ForecastGridRow[];
  columns: ForecastColumnId[];
  columnWidths: Partial<Record<ForecastColumnId, number>>;
  categories: Category[];
  selectedRowId: number | null;
  /** Incrémenté pour annuler l’édition en cours sans commit (ex. avant delete). */
  discardEditNonce?: number;
  onSelectRow: (id: number | null, rowIndex: number) => void;
  onPatch: (rowIndex: number, patch: ForecastCellPatch) => void;
  onColumnsChange: (columns: ForecastColumnId[]) => void;
  onColumnWidthsChange: (widths: Partial<Record<ForecastColumnId, number>>) => void;
  onAddLine: (parentId: number | null) => void;
  onAddGroup: (parentId: number | null) => void;
  onFromCategory: (parentId: number | null) => void;
  onFromTransaction: (parentId: number | null) => void;
}

interface EditState {
  row: number;
  col: ForecastColumnId;
  draft: string;
}

interface MenuState {
  x: number;
  y: number;
  rowIndex: number;
}

function parentForRow(row: ForecastGridRow | undefined): number | null {
  if (!row?.id) return row?.parentId ?? null;
  return row.isGroup ? row.id : row.parentId;
}

/** Colonnes dérivées des enfants (non éditables sur une ligne Groupe). */
const GROUP_DERIVED_COLS: ReadonlySet<ForecastColumnId> = new Set([
  'type',
  'amount',
  'periodicity',
  'startDate',
  'endDate',
]);

function isGroupLockedCell(row: ForecastGridRow, col: ForecastColumnId): boolean {
  if (!row.isGroup) return false;
  return col === 'group' || GROUP_DERIVED_COLS.has(col);
}

function colWidth(
  col: ForecastColumnId,
  widths: Partial<Record<ForecastColumnId, number>>
): number {
  return Math.max(MIN_COL_WIDTH, widths[col] ?? DEFAULT_COLUMN_WIDTHS[col]);
}

const ForecastGrid: React.FC<ForecastGridProps> = ({
  rows,
  columns,
  columnWidths,
  categories,
  selectedRowId,
  discardEditNonce = 0,
  onSelectRow,
  onPatch,
  onColumnsChange,
  onColumnWidthsChange,
  onAddLine,
  onAddGroup,
  onFromCategory,
  onFromTransaction,
}) => {
  const { t } = useTranslation();
  const [focused, setFocused] = useState<{ row: number; col: number } | null>(null);
  const [editing, setEdit] = useState<EditState | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [headerMenu, setHeaderMenu] = useState<{ x: number; y: number; col: ForecastColumnId } | null>(
    null
  );
  const [contextMenu, setContextMenu] = useState<MenuState | null>(null);
  const [resizing, setResizing] = useState<{ col: ForecastColumnId; startX: number; startW: number } | null>(
    null
  );
  const skipBlur = useRef(false);
  const widthsRef = useRef(columnWidths);
  widthsRef.current = columnWidths;

  useEffect(() => {
    if (discardEditNonce === 0) return;
    skipBlur.current = true;
    setEdit(null);
    skipBlur.current = false;
  }, [discardEditNonce]);

  const hiddenColumns = useMemo(
    () => FORECAST_COLUMN_CATALOG.filter((c) => !columns.includes(c)),
    [columns]
  );

  const catByCode = useMemo(() => {
    const map = new Map<string, Category>();
    categories.forEach((c) => map.set(c.code, c));
    return map;
  }, [categories]);

  const groupRows = useMemo(
    () => rows.filter((r) => r.isGroup && r.id !== null),
    [rows]
  );

  const comboSuggestions = useMemo(() => {
    const empty: Array<{ key: string; label: string; color?: string }> = [];
    if (!editing) return empty;
    const q = editing.draft.trim().toLowerCase();
    if (editing.col === 'category') {
      const list = q
        ? categories.filter(
            (c) => c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q)
          )
        : categories;
      return list.slice(0, 8).map((c) => ({ key: c.code, label: c.name, color: c.color }));
    }
    if (editing.col === 'group') {
      const currentId = rows[editing.row]?.id;
      const list = groupRows.filter((g) => g.id !== currentId);
      const filtered = q ? list.filter((g) => g.name.toLowerCase().includes(q)) : list;
      return filtered.slice(0, 8).map((g) => ({ key: String(g.id), label: g.name, color: undefined }));
    }
    return empty;
  }, [editing, categories, groupRows, rows]);

  useEffect(() => {
    if (!resizing) return;
    const onMove = (e: MouseEvent) => {
      const next = Math.max(MIN_COL_WIDTH, resizing.startW + (e.clientX - resizing.startX));
      onColumnWidthsChange({ ...widthsRef.current, [resizing.col]: next });
    };
    const onUp = () => setResizing(null);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [resizing, onColumnWidthsChange]);

  useEffect(() => {
    if (!contextMenu && !headerMenu && !pickerOpen) return;
    const close = () => {
      setContextMenu(null);
      setHeaderMenu(null);
      setPickerOpen(false);
    };
    const timer = window.setTimeout(() => window.addEventListener('click', close), 0);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('click', close);
    };
  }, [contextMenu, headerMenu, pickerOpen]);

  const startEdit = useCallback(
    (rowIndex: number, col: ForecastColumnId, row: ForecastGridRow) => {
      if (isGroupLockedCell(row, col)) return;
      let draft = '';
      switch (col) {
        case 'name':
          draft = row.name;
          break;
        case 'type':
          draft = row.type;
          break;
        case 'amount':
          draft = row.amount ? String(row.amount) : '';
          break;
        case 'periodicity':
          draft = row.periodicity;
          break;
        case 'startDate':
          draft = row.startDate;
          break;
        case 'endDate':
          draft = row.endDate;
          break;
        case 'category':
          draft = catByCode.get(row.categoryCode)?.name || row.categoryCode;
          break;
        case 'group':
          draft = row.groupName;
          break;
        case 'color':
          draft = row.color || '#94a3b8';
          break;
      }
      setEdit({ row: rowIndex, col, draft });
    },
    [catByCode]
  );

  const commitEdit = useCallback(
    (nextRow = false, nextCol = 0) => {
      if (!editing) return;
      const row = rows[editing.row];
      if (!row) {
        setEdit(null);
        return;
      }
      const patch: ForecastCellPatch = {};
      switch (editing.col) {
        case 'name':
          patch.name = editing.draft.trim();
          break;
        case 'type':
          patch.type = parseFlowType(editing.draft);
          break;
        case 'amount':
          patch.amount = parseAmount(editing.draft);
          break;
        case 'periodicity':
          patch.periodicity = parsePeriodicity(editing.draft);
          break;
        case 'startDate':
          patch.startDate = editing.draft;
          break;
        case 'endDate':
          patch.endDate = editing.draft;
          break;
        case 'category':
          patch.categoryCode = editing.draft.trim();
          break;
        case 'group':
          patch.groupName = editing.draft.trim();
          break;
        case 'color':
          patch.color = editing.draft || '#94a3b8';
          break;
      }
      skipBlur.current = true;
      onPatch(editing.row, patch);
      const rowIndex = editing.row;
      const colIndex = columns.indexOf(editing.col);
      const colId = editing.col;
      setEdit(null);
      if (nextRow) {
        const nr = Math.min(rows.length - 1, rowIndex + 1);
        setFocused({ row: nr, col: colIndex < 0 ? 0 : colIndex });
        const next = rows[nr];
        if (next && nr !== rowIndex) {
          requestAnimationFrame(() => startEdit(nr, colId, next));
        }
      } else if (nextCol !== 0) {
        const nc = Math.max(0, Math.min(columns.length - 1, colIndex + nextCol));
        setFocused({ row: rowIndex, col: nc });
        const next = rows[rowIndex];
        const nextColId = columns[nc];
        if (next && nextColId) {
          requestAnimationFrame(() => startEdit(rowIndex, nextColId, next));
        }
      }
      skipBlur.current = false;
    },
    [editing, rows, columns, onPatch, startEdit]
  );

  const cancelEdit = useCallback(() => setEdit(null), []);

  const moveFocus = useCallback(
    (rowDelta: number, colDelta: number) => {
      if (!focused) return;
      const row = Math.max(0, Math.min(rows.length - 1, focused.row + rowDelta));
      const col = Math.max(0, Math.min(columns.length - 1, focused.col + colDelta));
      setFocused({ row, col });
      const target = rows[row];
      onSelectRow(target?.id ?? null, row);
    },
    [focused, rows, columns.length, onSelectRow]
  );

  const handleGridKey = (e: React.KeyboardEvent, rowIndex: number, colIndex: number, col: ForecastColumnId) => {
    const row = rows[rowIndex];
    if (!row) return;
    if (editing) {
      if (e.key === 'Escape') {
        e.preventDefault();
        cancelEdit();
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        commitEdit(true);
        return;
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        commitEdit(false, e.shiftKey ? -1 : 1);
        return;
      }
      return;
    }
    if (e.key === 'F2' || e.key === 'Enter') {
      e.preventDefault();
      if (e.key === 'Enter' && col !== 'name' && focused) {
        startEdit(rowIndex, col, row);
        return;
      }
      startEdit(rowIndex, col, row);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      moveFocus(1, 0);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      moveFocus(-1, 0);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      moveFocus(0, 1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      moveFocus(0, -1);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      moveFocus(0, e.shiftKey ? -1 : 1);
    }
  };

  const displayCell = (row: ForecastGridRow, col: ForecastColumnId): React.ReactNode => {
    switch (col) {
      case 'name':
        return (
          <span className="forecast-name" style={{ paddingLeft: row.depth * 16 }}>
            {row.isGroup ? <strong>{row.name || t('previsionnel.newGroup')}</strong> : row.name}
          </span>
        );
      case 'type':
        return t(`previsionnel.flow.${row.type}`);
      case 'amount':
        return row.isGroup || row.amount ? formatMoney(row.amount) : '';
      case 'periodicity':
        if (row.isGroup && row.periodicityMixed) {
          return t('previsionnel.periodicity.various');
        }
        return t(`previsionnel.periodicity.${row.periodicity}`);
      case 'startDate':
        return row.startDate ? formatFrDate(row.startDate) : '';
      case 'endDate':
        return row.endDate ? formatFrDate(row.endDate) : t('previsionnel.unlimited');
      case 'category': {
        const cat = catByCode.get(row.categoryCode);
        if (!cat && !row.categoryCode) return '—';
        return (
          <span className="forecast-cat">
            {cat && <span className="forecast-swatch" style={{ background: cat.color }} />}
            {cat?.name || row.categoryCode}
          </span>
        );
      }
      case 'group':
        return row.groupName || '—';
      case 'color':
        return (
          <span className="forecast-cat">
            <span className="forecast-swatch" style={{ background: row.color }} />
            {row.color}
          </span>
        );
    }
  };

  const editor = () => {
    if (!editing) return null;
    const common = {
      className: 'forecast-editor',
      autoFocus: true,
      onFocus: (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
        if (e.currentTarget instanceof HTMLInputElement) e.currentTarget.select();
      },
      onBlur: () => {
        if (skipBlur.current) return;
        commitEdit();
      },
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
        setEdit({ ...editing, draft: e.target.value }),
      onKeyDown: (e: React.KeyboardEvent) => handleGridKey(e, editing.row, columns.indexOf(editing.col), editing.col),
    };
    const combo = (placeholder: string) => (
      <div className="forecast-combo">
        <input {...common} value={editing.draft} placeholder={placeholder} />
        {comboSuggestions.length > 0 && (
          <ul className="forecast-suggest">
            {comboSuggestions.map((item) => (
              <li key={item.key}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    skipBlur.current = true;
                    if (editing.col === 'category') {
                      onPatch(editing.row, { categoryCode: item.key });
                    } else if (editing.col === 'group') {
                      onPatch(editing.row, { groupName: item.label });
                    }
                    setEdit(null);
                    skipBlur.current = false;
                  }}
                >
                  {item.color && <span className="forecast-swatch" style={{ background: item.color }} />}
                  {item.label}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
    switch (editing.col) {
      case 'name':
        return <input {...common} value={editing.draft} />;
      case 'group':
        return combo(t('previsionnel.noGroup'));
      case 'type':
        return (
          <select {...common} value={editing.draft}>
            {(['debit', 'credit'] as FlowType[]).map((v) => (
              <option key={v} value={v}>
                {t(`previsionnel.flow.${v}`)}
              </option>
            ))}
          </select>
        );
      case 'amount':
        return <input {...common} type="number" step="0.01" value={editing.draft} />;
      case 'periodicity':
        return (
          <select {...common} value={editing.draft}>
            {PERIODICITY_VALUES.map((p) => (
              <option key={p} value={p}>
                {t(`previsionnel.periodicity.${p}`)}
              </option>
            ))}
          </select>
        );
      case 'startDate':
      case 'endDate':
        return <input {...common} type="date" value={editing.draft} />;
      case 'category':
        return combo(t('previsionnel.noCategory'));
      case 'color':
        return <input {...common} type="color" value={editing.draft || '#94a3b8'} />;
    }
  };

  const addColumn = (col: ForecastColumnId) => {
    if (columns.includes(col)) return;
    onColumnsChange([...columns, col]);
    setPickerOpen(false);
  };

  const removeColumn = (col: ForecastColumnId) => {
    if (col === 'name') return;
    onColumnsChange(columns.filter((c) => c !== col));
    setHeaderMenu(null);
  };

  return (
    <div className="forecast-grid-wrap">
      <div className="forecast-grid-scroll">
        <table className="forecast-grid">
          <colgroup>
            {columns.map((col) => (
              <col key={col} style={{ width: colWidth(col, columnWidths) }} />
            ))}
            <col style={{ width: 40 }} />
          </colgroup>
          <thead>
            <tr>
              {columns.map((col) => (
                <th
                  key={col}
                  className={resizing?.col === col ? 'resizing' : ''}
                  style={{ width: colWidth(col, columnWidths) }}
                  onContextMenu={(e) => {
                    if (col === 'name') return;
                    e.preventDefault();
                    setHeaderMenu({ x: e.clientX, y: e.clientY, col });
                  }}
                >
                  <div className="edition-th-inner">
                    <span className="edition-th-label">{t(`previsionnel.columns.${col}`)}</span>
                    {col !== 'name' && (
                      <button
                        type="button"
                        className="forecast-col-remove"
                        title={t('previsionnel.columns.remove')}
                        onClick={(e) => {
                          e.stopPropagation();
                          removeColumn(col);
                        }}
                      >
                        <X size={12} />
                      </button>
                    )}
                    <span
                      className="edition-col-resize-handle"
                      title={t('edition.resizeColumn')}
                      role="separator"
                      aria-orientation="vertical"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setResizing({ col, startX: e.clientX, startW: colWidth(col, columnWidths) });
                      }}
                    />
                  </div>
                </th>
              ))}
              <th className="forecast-add-th">
                <button
                  type="button"
                  className="forecast-add-col"
                  disabled={hiddenColumns.length === 0}
                  title={t('previsionnel.columns.add')}
                  onClick={(e) => {
                    e.stopPropagation();
                    setPickerOpen((v) => !v);
                  }}
                >
                  <Plus size={14} />
                </button>
                {pickerOpen && hiddenColumns.length > 0 && (
                  <ul className="forecast-col-picker" onClick={(e) => e.stopPropagation()}>
                    {hiddenColumns.map((col) => (
                      <li key={col}>
                        <button type="button" onClick={() => addColumn(col)}>
                          {t(`previsionnel.columns.${col}`)}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => {
              const selected = row.id !== null && row.id === selectedRowId;
              const focusedRow = focused?.row === rowIndex;
              return (
                <tr
                  key={row.id ?? `empty-${rowIndex}`}
                  className={`${row.isGroup ? 'group' : ''}${selected ? ' selected' : ''}${focusedRow ? ' focused-row' : ''}`}
                  onClick={() => {
                    onSelectRow(row.id, rowIndex);
                    setFocused((prev) => ({ row: rowIndex, col: prev?.col ?? 0 }));
                  }}
                >
                  {columns.map((col, colIndex) => {
                    const isEdit = editing?.row === rowIndex && editing.col === col;
                    const isFocus = focused?.row === rowIndex && focused.col === colIndex;
                    const locked = isGroupLockedCell(row, col);
                    const colorBg = col === 'color' ? row.color : undefined;
                    const cellClass = [
                      isFocus ? 'focused' : '',
                      isEdit ? 'editing' : '',
                      locked ? 'readonly' : '',
                      row.isGroup && col === 'group' ? 'group-locked' : '',
                    ]
                      .filter(Boolean)
                      .join(' ');
                    return (
                      <td
                        key={col}
                        tabIndex={0}
                        className={cellClass}
                        style={
                          col === 'color'
                            ? { background: `${colorBg}33` }
                            : undefined
                        }
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectRow(row.id, rowIndex);
                          setFocused({ row: rowIndex, col: colIndex });
                          startEdit(rowIndex, col, row);
                        }}
                        onDoubleClick={() => startEdit(rowIndex, col, row)}
                        onContextMenu={(e) => {
                          if (col !== 'name') return;
                          e.preventDefault();
                          onSelectRow(row.id, rowIndex);
                          setContextMenu({ x: e.clientX, y: e.clientY, rowIndex });
                        }}
                        onKeyDown={(e) => handleGridKey(e, rowIndex, colIndex, col)}
                      >
                        {isEdit ? editor() : displayCell(row, col)}
                      </td>
                    );
                  })}
                  <td className="forecast-add-td" />
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {contextMenu && (
        <ul
          className="forecast-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <li>
            <button
              type="button"
              onClick={() => {
                onFromCategory(parentForRow(rows[contextMenu.rowIndex]));
                setContextMenu(null);
              }}
            >
              {t('previsionnel.fromCategory.action')}
            </button>
          </li>
          <li>
            <button
              type="button"
              onClick={() => {
                onFromTransaction(parentForRow(rows[contextMenu.rowIndex]));
                setContextMenu(null);
              }}
            >
              {t('previsionnel.fromTransaction.action')}
            </button>
          </li>
          <li>
            <button
              type="button"
              onClick={() => {
                onAddLine(parentForRow(rows[contextMenu.rowIndex]));
                setContextMenu(null);
              }}
            >
              {t('previsionnel.neutralLine')}
            </button>
          </li>
          <li>
            <button
              type="button"
              onClick={() => {
                onAddGroup(parentForRow(rows[contextMenu.rowIndex]));
                setContextMenu(null);
              }}
            >
              {t('previsionnel.newGroup')}
            </button>
          </li>
        </ul>
      )}

      {headerMenu && (
        <ul
          className="forecast-context-menu"
          style={{ left: headerMenu.x, top: headerMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <li>
            <button type="button" onClick={() => removeColumn(headerMenu.col)}>
              {t('previsionnel.columns.remove')}
            </button>
          </li>
        </ul>
      )}
    </div>
  );
};

export default ForecastGrid;
