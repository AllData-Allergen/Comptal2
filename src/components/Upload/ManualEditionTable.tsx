import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2, Funnel } from 'lucide-react';
import { Account } from '../../types/models';
import { DEFAULT_EDITION_COLUMN_WIDTHS, EditionColumnKey } from '../../types/editionUi';
import { parseDateWithMultipleFormats, toIsoDate } from '../../utils/dateFormats';
import { parseAmount, roundMoney } from '../../utils/amounts';
import { PreviewRow } from '../../types/import';
import { EditionUiService } from '../../services/EditionUiService';
import { Db } from '../../services/db';
import EditionColumnFilter from '../Edition/EditionColumnFilter';

type ManualCol = 'date' | 'label' | 'debit' | 'credit' | 'solde';
const COLS: ManualCol[] = ['date', 'label', 'debit', 'credit', 'solde'];
const MIN_COL_WIDTH = 60;

interface ManualRow {
  tmpId: string;
  date: string;
  label: string;
  debit: string;
  credit: string;
}

function newTmpId() {
  return Math.random().toString(36).slice(2, 9);
}

function uniqueColumnValues(rows: ManualRow[], col: ManualCol): string[] {
  const set = new Set<string>();
  for (const r of rows) {
    let v = '';
    if (col === 'date') v = r.date;
    else if (col === 'label') v = r.label;
    else if (col === 'debit') v = r.debit;
    else if (col === 'credit') v = r.credit;
    else if (col === 'solde') v = '';
    set.add(v);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'fr', { numeric: true }));
}

interface Props {
  accounts: Account[];
  onReady: (rows: PreviewRow[], accountId: number) => void;
  onCancel?: () => void;
}

const ManualEditionTable: React.FC<Props> = ({ accounts, onReady, onCancel }) => {
  const { t } = useTranslation();
  const [selectedAccountId, setSelectedAccountId] = useState<number | ''>(accounts[0]?.id ?? '');
  const [rows, setRows] = useState<ManualRow[]>(() => [{ tmpId: newTmpId(), date: '', label: '', debit: '', credit: '' }]);
  const [columnWidths, setColumnWidths] = useState<Record<EditionColumnKey, number>>({ ...DEFAULT_EDITION_COLUMN_WIDTHS, label: 320, debit: 110, credit: 110, category_code: 120 });
  const [resizingColumn, setResizingColumn] = useState<EditionColumnKey | null>(null);
  const [resizeStartX, setResizeStartX] = useState(0);
  const [resizeStartWidth, setResizeStartWidth] = useState(0);
  const [sortBy, setSortBy] = useState<ManualCol>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc' | null>('asc');
  const [filterColumn, setFilterColumn] = useState<ManualCol | null>(null);
  const [filterSearch, setFilterSearch] = useState('');
  const [filterSelections, setFilterSelections] = useState<Partial<Record<ManualCol, Set<string>>>>({});
  const [filterPosition, setFilterPosition] = useState({ top: 0, left: 0 });
  const filterHeaderRef = useRef<HTMLTableCellElement | null>(null);

  // multi selection
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set());
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ r: number; c: number } | null>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; tmpId: string; rowIdx: number } | null>(null);
  const [clipboardCells, setClipboardCells] = useState<string[][] | null>(null);

  useEffect(() => {
    if (accounts.length && selectedAccountId === '') setSelectedAccountId(accounts[0].id);
  }, [accounts, selectedAccountId]);

  useEffect(() => {
    const pid = Db.profileId;
    if (!pid) return;
    EditionUiService.loadColumnWidths(pid).then((w) => setColumnWidths((prev) => ({ ...prev, ...w })));
  }, []);

  const selectedAccount = useMemo(() => accounts.find((a) => a.id === selectedAccountId), [accounts, selectedAccountId]);

  // solde calcul automatique trié par date
  const computed = useMemo(() => {
    const withIdx = rows.map((r, idx) => ({ r, idx }));
    const parsed = withIdx.map(({ r, idx }) => {
      const d = parseDateWithMultipleFormats(r.date);
      return { r, idx, iso: d ? toIsoDate(d) : null, ts: d ? d.getTime() : Number.MAX_SAFE_INTEGER };
    });
    const sorted = [...parsed].sort((a, b) => a.ts - b.ts || a.idx - b.idx);
    const initial = selectedAccount?.initialBalance ?? 0;
    let running = roundMoney(initial);
    const soldeByTmpId = new Map<string, number>();
    // running before first row is initial, after each row add net
    for (const item of sorted) {
      const debit = item.r.debit.trim() ? (() => { let v = parseAmount(item.r.debit); if (v > 0) v = -v; return v; })() : 0;
      const credit = item.r.credit.trim() ? Math.abs(parseAmount(item.r.credit)) : 0;
      running = roundMoney(running + debit + credit);
      soldeByTmpId.set(item.r.tmpId, running);
    }
    return { soldeByTmpId, initial };
  }, [rows, selectedAccount]);

  const displayRows = useMemo(() => {
    let list = [...rows];
    // filter
    const active = Object.entries(filterSelections) as Array<[ManualCol, Set<string>]>;
    if (active.length) {
      list = list.filter((r) =>
        active.every(([col, sel]) => {
          let v = '';
          if (col === 'date') v = r.date;
          else if (col === 'label') v = r.label;
          else if (col === 'debit') v = r.debit;
          else if (col === 'credit') v = r.credit;
          else return true;
          return sel.has(v);
        })
      );
    }
    // sort (only date meaningful for now, but allow all)
    if (sortBy && sortDir) {
      list = [...list].sort((a, b) => {
        let av: string = '', bv: string = '';
        if (sortBy === 'date') { av = a.date; bv = b.date; }
        else if (sortBy === 'label') { av = a.label; bv = b.label; }
        else if (sortBy === 'debit') { av = a.debit; bv = b.debit; }
        else if (sortBy === 'credit') { av = a.credit; bv = b.credit; }
        else if (sortBy === 'solde') {
          av = String(computed.soldeByTmpId.get(a.tmpId) ?? '');
          bv = String(computed.soldeByTmpId.get(b.tmpId) ?? '');
        }
        const cmp = av.localeCompare(bv, 'fr', { numeric: true });
        return sortDir === 'asc' ? cmp : -cmp;
      });
    }
    return list;
  }, [rows, filterSelections, sortBy, sortDir, computed]);

  const uniqueValues = useMemo(() => {
    if (!filterColumn) return [];
    return uniqueColumnValues(rows, filterColumn);
  }, [rows, filterColumn]);

  const handleResizeStart = (e: React.MouseEvent, colKey: EditionColumnKey) => {
    e.preventDefault(); e.stopPropagation();
    setResizingColumn(colKey); setResizeStartX(e.clientX); setResizeStartWidth(columnWidths[colKey] ?? 120);
  };
  useEffect(() => {
    if (!resizingColumn) return;
    const onMove = (e: MouseEvent) => {
      const diff = e.clientX - resizeStartX;
      const nw = Math.max(MIN_COL_WIDTH, resizeStartWidth + diff);
      setColumnWidths((prev) => ({ ...prev, [resizingColumn]: nw }));
    };
    const onUp = () => setResizingColumn(null);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
  }, [resizingColumn, resizeStartX, resizeStartWidth]);

  const placeFilterPanel = useCallback((anchor: HTMLElement) => {
    const rect = anchor.getBoundingClientRect();
    const w = 240, h = 300;
    let left = rect.left;
    if (left + w > window.innerWidth - 8) left = Math.max(8, window.innerWidth - w - 8);
    let top = rect.bottom + 2;
    if (top + h > window.innerHeight - 8) top = Math.max(8, rect.top - h);
    setFilterPosition({ top, left });
  }, []);
  useEffect(() => {
    if (!filterColumn) return;
    const upd = () => { if (filterHeaderRef.current) placeFilterPanel(filterHeaderRef.current); };
    upd();
    window.addEventListener('resize', upd);
    return () => window.removeEventListener('resize', upd);
  }, [filterColumn, placeFilterPanel]);

  const openFilter = (col: ManualCol, th: HTMLElement) => {
    setFilterColumn((prev) => (prev === col ? null : col));
    setFilterSearch('');
    placeFilterPanel(th);
  };
  const toggleFilterValue = (val: string) => {
    if (!filterColumn) return;
    const all = uniqueValues;
    setFilterSelections((prev) => {
      const cur = prev[filterColumn];
      const next = new Set(cur ?? all);
      if (next.has(val)) next.delete(val); else next.add(val);
      const nm = { ...prev };
      if (next.size === all.length) delete nm[filterColumn];
      else nm[filterColumn] = next;
      return nm;
    });
  };
  const selectAllFilter = (checked: boolean) => {
    if (!filterColumn) return;
    setFilterSelections((prev) => {
      const nm = { ...prev };
      if (checked) delete nm[filterColumn!];
      else nm[filterColumn!] = new Set();
      return nm;
    });
  };
  const applyVisibleFilter = (keep: string[]) => {
    if (!filterColumn) return;
    const all = uniqueValues;
    setFilterSelections((prev) => {
      const nm = { ...prev };
      const ks = new Set(keep);
      if (ks.size === all.length) delete nm[filterColumn!];
      else nm[filterColumn!] = ks;
      return nm;
    });
  };

  // selection helpers
  const colIndex = (col: ManualCol) => COLS.indexOf(col);
  const handleCellMouseDown = (r: number, c: number, e: React.MouseEvent) => {
    const key = `${r}-${c}`;
    if (e.ctrlKey || e.metaKey) {
      setSelectedCells((prev) => {
        const n = new Set(prev);
        if (n.has(key)) n.delete(key); else n.add(key);
        return n;
      });
      setDragStart({ r, c });
      setIsDragging(false);
    } else {
      setSelectedCells(new Set([key]));
      setDragStart({ r, c });
      setIsDragging(true);
    }
  };
  const handleCellMouseEnter = (r: number, c: number) => {
    if (!isDragging || !dragStart) return;
    const r1 = Math.min(dragStart.r, r), r2 = Math.max(dragStart.r, r);
    const c1 = Math.min(dragStart.c, c), c2 = Math.max(dragStart.c, c);
    const next = new Set<string>();
    for (let rr = r1; rr <= r2; rr++) for (let cc = c1; cc <= c2; cc++) next.add(`${rr}-${cc}`);
    setSelectedCells(next);
  };
  const handleMouseUp = () => { setIsDragging(false); };
  useEffect(() => {
    document.addEventListener('mouseup', handleMouseUp);
    return () => document.removeEventListener('mouseup', handleMouseUp);
  }, []);
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c' && selectedCells.size) {
        e.preventDefault();
        const rowsArr: string[][] = [];
        const coords = Array.from(selectedCells).map((k) => { const [r, c] = k.split('-').map(Number); return { r, c, k }; });
        const minR = Math.min(...coords.map((x) => x.r)), maxR = Math.max(...coords.map((x) => x.r));
        const minC = Math.min(...coords.map((x) => x.c)), maxC = Math.max(...coords.map((x) => x.c));
        for (let r = minR; r <= maxR; r++) {
          const row: string[] = [];
          for (let c = minC; c <= maxC; c++) {
            if (!selectedCells.has(`${r}-${c}`)) { row.push(''); continue; }
            const manualRow = displayRows[r];
            if (!manualRow) { row.push(''); continue; }
            const col = COLS[c];
            let v = '';
            if (col === 'date') v = manualRow.date;
            else if (col === 'label') v = manualRow.label;
            else if (col === 'debit') v = manualRow.debit;
            else if (col === 'credit') v = manualRow.credit;
            else if (col === 'solde') v = String(computed.soldeByTmpId.get(manualRow.tmpId) ?? '');
            row.push(v);
          }
          rowsArr.push(row);
        }
        setClipboardCells(rowsArr);
        const text = rowsArr.map((r) => r.join('\t')).join('\n');
        navigator.clipboard?.writeText(text).catch(() => undefined);
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v' && selectedCells.size) {
        // paste from clipboardCells if available, else read clipboard
        const doPaste = async () => {
          let data: string[][] | null = clipboardCells;
          if (!data) {
            try { const txt = await navigator.clipboard.readText(); data = txt.split('\n').map((l) => l.split('\t')); } catch { return; }
          }
          if (!data || data.length === 0) return;
          const coords = Array.from(selectedCells).map((k) => { const [r, c] = k.split('-').map(Number); return { r, c }; });
          const startR = Math.min(...coords.map((x) => x.r));
          const startC = Math.min(...coords.map((x) => x.c));
          setRows((prev) => {
            const next = [...prev];
            for (let dr = 0; dr < data.length; dr++) {
              for (let dc = 0; dc < data[0].length; dc++) {
                const targetR = startR + dr;
                const targetC = startC + dc;
                const manualRow = displayRows[targetR];
                if (!manualRow) continue;
                const col = COLS[targetC];
                if (!col || col === 'solde') continue;
                const idx = next.findIndex((x) => x.tmpId === manualRow.tmpId);
                if (idx === -1) continue;
                const val = (data as string[][])[dr][dc] ?? '';
                (next[idx] as unknown as Record<string, string>)[col] = val;
              }
            }
            return next;
          });
        };
        void doPaste();
      }
      if (e.key === 'Delete' && selectedCells.size) {
        e.preventDefault();
        // efface contenu des cellules sélectionnées (hors solde)
        setRows((prev) => {
          const next = [...prev];
          for (const k of selectedCells) {
            const [r, c] = k.split('-').map(Number);
            const manualRow = displayRows[r];
            if (!manualRow) continue;
            const col = COLS[c];
            if (!col || col === 'solde') continue;
            const idx = next.findIndex((x) => x.tmpId === manualRow.tmpId);
            if (idx === -1) continue;
            (next[idx] as unknown as Record<string, string>)[col] = '';
          }
          return next;
        });
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedCells, displayRows, clipboardCells, computed]);
  useEffect(() => {
    const close = () => setContextMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, []);

  const updateRow = (tmpId: string, field: keyof ManualRow, val: string) => {
    setRows((prev) => prev.map((r) => (r.tmpId === tmpId ? { ...r, [field]: val } : r)));
  };
  const addRow = () => setRows((prev) => [...prev, { tmpId: newTmpId(), date: '', label: '', debit: '', credit: '' }]);
  const insertRowAt = (idx: number, above: boolean) => {
    const pos = above ? idx : idx + 1;
    setRows((prev) => {
      const copy = [...prev];
      // map displayRows idx to actual rows order: we insert based on displayRows order to keep visuel cohérent
      const targetTmpId = displayRows[idx]?.tmpId;
      const realIdx = targetTmpId ? prev.findIndex((r) => r.tmpId === targetTmpId) : pos;
      const insertAt = realIdx === -1 ? pos : above ? realIdx : realIdx + 1;
      copy.splice(insertAt, 0, { tmpId: newTmpId(), date: '', label: '', debit: '', credit: '' });
      return copy;
    });
  };
  const duplicateRow = (tmpId: string) => {
    setRows((prev) => {
      const idx = prev.findIndex((r) => r.tmpId === tmpId);
      if (idx === -1) return prev;
      const copy = [...prev];
      copy.splice(idx + 1, 0, { ...prev[idx], tmpId: newTmpId() });
      return copy;
    });
  };
  const deleteRow = (tmpId: string) => setRows((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r.tmpId !== tmpId)));
  const deleteSelected = () => {
    if (selectedCells.size === 0) return;
    const rowsToDelete = new Set<number>();
    for (const k of selectedCells) {
      const r = Number(k.split('-')[0]);
      rowsToDelete.add(r);
    }
    if (rowsToDelete.size === 0) return;
    const tmpIdsToDelete = Array.from(rowsToDelete).map((idx) => displayRows[idx]?.tmpId).filter(Boolean) as string[];
    if (tmpIdsToDelete.length === 0) return;
    setRows((prev) => {
      if (prev.length <= tmpIdsToDelete.length) return prev; // keep at least one
      return prev.filter((r) => !tmpIdsToDelete.includes(r.tmpId));
    });
    setSelectedCells(new Set());
  };

  const handleBuild = () => {
    if (selectedAccountId === '') return;
    const out: PreviewRow[] = [];
    for (const r of rows) {
      const d = parseDateWithMultipleFormats(r.date);
      if (!d) continue;
      let debit = r.debit.trim() ? parseAmount(r.debit) : 0;
      let credit = r.credit.trim() ? parseAmount(r.credit) : 0;
      if (debit > 0) debit = -debit;
      if (credit < 0) credit = Math.abs(credit);
      out.push({ date: toIsoDate(d), valueDate: toIsoDate(d), debit: roundMoney(debit), credit: roundMoney(credit), label: r.label.trim() });
    }
    out.sort((a, b) => a.date.localeCompare(b.date));
    onReady(out, Number(selectedAccountId));
  };

  const sortIndicator = (col: ManualCol) => sortBy === col && sortDir ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '';

  const header = (col: ManualCol, colKey: EditionColumnKey, label: string) => (
    <th
      key={colKey}
      className={`sortable${resizingColumn === colKey ? ' resizing' : ''}${filterSelections[col] ? ' filtered' : ''}${filterColumn === col ? ' filter-open' : ''}`}
      style={{ width: columnWidths[colKey] }}
      ref={filterColumn === col ? filterHeaderRef : undefined}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('.edition-col-resize-handle')) return;
        openFilter(col, e.currentTarget);
      }}
    >
      <div className="edition-th-inner">
        <span className="edition-th-label" onClick={(e) => { e.stopPropagation(); if (sortBy === col) setSortDir((d) => d === 'asc' ? 'desc' : d === 'desc' ? null : 'asc'); else { setSortBy(col); setSortDir('asc'); } }}>
          {label}{sortIndicator(col)}
        </span>
        {filterSelections[col] && <Funnel size={12} className="edition-th-filter-icon" />}
        <span className="edition-col-resize-handle" onMouseDown={(e) => handleResizeStart(e, colKey)} role="separator" />
      </div>
    </th>
  );

  const isSelected = (r: number, c: number) => selectedCells.has(`${r}-${c}`);
  // compute outer border for selection rectangle
  const selectionBounds = useMemo(() => {
    if (selectedCells.size === 0) return null;
    const coords = Array.from(selectedCells).map((k) => { const [r, c] = k.split('-').map(Number); return { r, c }; });
    const rs = coords.map((x) => x.r), cs = coords.map((x) => x.c);
    return { minR: Math.min(...rs), maxR: Math.max(...rs), minC: Math.min(...cs), maxC: Math.max(...cs) };
  }, [selectedCells]);

  return (
    <div className="upload-page-manual-wrap flex flex-col gap-3 min-h-0 flex-1">
      <div className="edition-toolbar">
        <div className="edition-toolbar-row">
          <label className="ct-label flex items-center gap-2">
            {t('upload.account')}
            <select className="ct-select" value={selectedAccountId} onChange={(e) => setSelectedAccountId(Number(e.target.value))}>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
            </select>
          </label>
          <span className="text-xs" style={{ color: 'var(--invoicing-gray-500)' }}>
            {t('settings.accounts.initialBalance')}: {selectedAccount ? `${computed.initial.toFixed(2)} €` : '—'}
          </span>
          <div className="ml-auto flex gap-2">
            <button type="button" className="edition-toolbar-btn" onClick={addRow}><Plus size={14} /> {t('upload.addLine')}</button>
          </div>
        </div>
      </div>

      <div className="edition-excel-scroller flex-1 min-h-[200px]" style={{ minHeight: 0 }}>
        <table ref={tableRef} className="edition-excel-table" style={{ tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: columnWidths.date }} />
            <col style={{ width: columnWidths.label }} />
            <col style={{ width: columnWidths.debit }} />
            <col style={{ width: columnWidths.credit }} />
            <col style={{ width: columnWidths.category_code }} />
          </colgroup>
          <thead>
            <tr>
              {header('date', 'date', t('upload.colDate'))}
              {header('label', 'label', t('upload.colLabel'))}
              {header('debit', 'debit', t('upload.colDebit'))}
              {header('credit', 'credit', t('upload.colCredit'))}
              {header('solde', 'category_code', 'Solde')}
              <th style={{ width: 40 }}><div className="edition-th-inner"><span className="edition-th-label" /></div></th>
            </tr>
          </thead>
          <tbody>
            {displayRows.map((r, rowIdx) => {
              const solde = computed.soldeByTmpId.get(r.tmpId);
              return (
                <tr
                  key={r.tmpId}
                  style={{ height: 36 }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setContextMenu({ x: e.clientX, y: e.clientY, tmpId: r.tmpId, rowIdx });
                  }}
                >
                  {(['date', 'label', 'debit', 'credit', 'solde'] as ManualCol[]).map((col) => {
                    const cIdx = colIndex(col);
                    const sel = isSelected(rowIdx, cIdx);
                    const isOuterTop = selectionBounds && rowIdx === selectionBounds.minR && cIdx >= selectionBounds.minC && cIdx <= selectionBounds.maxC;
                    const isOuterBottom = selectionBounds && rowIdx === selectionBounds.maxR && cIdx >= selectionBounds.minC && cIdx <= selectionBounds.maxC;
                    const isOuterLeft = selectionBounds && cIdx === selectionBounds.minC && rowIdx >= selectionBounds.minR && rowIdx <= selectionBounds.maxR;
                    const isOuterRight = selectionBounds && cIdx === selectionBounds.maxC && rowIdx >= selectionBounds.minR && rowIdx <= selectionBounds.maxR;
                    const borderStyle: React.CSSProperties = sel ? {
                      boxShadow: `${isOuterTop ? 'inset 0 2px 0 var(--invoicing-primary)' : ''}${isOuterTop && isOuterBottom ? ',' : ''}${isOuterBottom ? 'inset 0 -2px 0 var(--invoicing-primary)' : ''}${(isOuterTop || isOuterBottom) && (isOuterLeft || isOuterRight) ? ',' : ''}${isOuterLeft ? 'inset 2px 0 0 var(--invoicing-primary)' : ''}${isOuterLeft && isOuterRight ? ',' : ''}${isOuterRight ? 'inset -2px 0 0 var(--invoicing-primary)' : ''}`,
                      background: 'rgba(37,99,235,0.08)',
                    } : {};
                    if (col === 'solde') {
                      return (
                        <td
                          key={col}
                          className="amount"
                          style={borderStyle}
                          onMouseDown={(e) => handleCellMouseDown(rowIdx, cIdx, e)}
                          onMouseEnter={() => handleCellMouseEnter(rowIdx, cIdx)}
                        >
                          <span className="edition-cell-input" style={{ display: 'block', textAlign: 'right', padding: '4px 6px', background: 'var(--invoicing-gray-50)', color: 'var(--invoicing-gray-700)' }}>
                            {solde !== undefined ? solde.toFixed(2) : '—'}
                          </span>
                        </td>
                      );
                    }
                    const val = col === 'date' ? r.date : col === 'label' ? r.label : col === 'debit' ? r.debit : r.credit;
                    return (
                      <td key={col} style={borderStyle} onMouseDown={(e) => handleCellMouseDown(rowIdx, cIdx, e)} onMouseEnter={() => handleCellMouseEnter(rowIdx, cIdx)}>
                        <input
                          className="edition-cell-input"
                          style={col === 'debit' || col === 'credit' ? { textAlign: 'right' } : undefined}
                          value={val}
                          placeholder={col === 'date' ? 'jj/mm/aaaa' : col === 'label' ? t('upload.colLabel') : ''}
                          onChange={(e) => updateRow(r.tmpId, col as keyof ManualRow, e.target.value)}
                        />
                      </td>
                    );
                  })}
                  <td>
                    <button type="button" className="ct-btn-icon" onClick={() => deleteRow(r.tmpId)} title={t('common.delete')}><Trash2 size={14} /></button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex gap-3 justify-end">
        {onCancel && <button type="button" className="ct-btn-secondary" onClick={onCancel}>{t('common.cancel')}</button>}
        <button type="button" className="ct-btn-primary" onClick={handleBuild}>{t('upload.toPreview')}</button>
      </div>

      {filterColumn !== null && (
        <EditionColumnFilter
          values={uniqueValues}
          selected={filterSelections[filterColumn] ?? null}
          search={filterSearch}
          onSearch={setFilterSearch}
          onToggle={toggleFilterValue}
          onSelectAll={selectAllFilter}
          onApplyVisible={applyVisibleFilter}
          onSortAsc={() => { setSortBy(filterColumn); setSortDir('asc'); }}
          onSortDesc={() => { setSortBy(filterColumn); setSortDir('desc'); }}
          position={filterPosition}
          onClose={() => { setFilterColumn(null); setFilterSearch(''); }}
        />
      )}
      {contextMenu && (
        <div className="edition-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }} onClick={(e) => e.stopPropagation()}>
          <button type="button" onClick={() => { insertRowAt(contextMenu.rowIdx, true); setContextMenu(null); }}>{t('edition.insertAbove')}</button>
          <button type="button" onClick={() => { insertRowAt(contextMenu.rowIdx, false); setContextMenu(null); }}>{t('edition.insertBelow')}</button>
          <button type="button" onClick={() => { duplicateRow(contextMenu.tmpId); setContextMenu(null); }}>{t('common.duplicate')}</button>
          <button type="button" onClick={() => { deleteRow(contextMenu.tmpId); setContextMenu(null); }}>{t('common.delete')}</button>
          <button
            type="button"
            onClick={() => {
              const row = displayRows[contextMenu.rowIdx];
              if (!row) return;
              navigator.clipboard?.writeText([row.date, row.label, row.debit, row.credit].join('\t')).catch(() => undefined);
              setContextMenu(null);
            }}
          >
            {t('common.copy')}
          </button>
          <button type="button" onClick={() => { void navigator.clipboard?.readText().then((txt) => {
            if (!txt) return;
            const parts = txt.split('\t');
            if (parts.length < 4) return;
            setRows((prev) => prev.map((x) => x.tmpId === contextMenu.tmpId ? { ...x, date: parts[0] ?? x.date, label: parts[1] ?? x.label, debit: parts[2] ?? x.debit, credit: parts[3] ?? x.credit } : x));
          }); setContextMenu(null); }}>{t('common.paste')}</button>
          {selectedCells.size > 1 && (
            <button type="button" onClick={() => { deleteSelected(); setContextMenu(null); }}>{t('common.deleteSelection')}</button>
          )}
        </div>
      )}
    </div>
  );
};

export default ManualEditionTable;
