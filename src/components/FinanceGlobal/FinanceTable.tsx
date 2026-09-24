import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import { FileSpreadsheet, Loader2 } from 'lucide-react';
import { formatMoney } from '../../utils/amounts';
import { getColorStyle } from '../../utils/financeColorStyle';
import { ExportService } from '../../services/ExportService';
import { Logger } from '../../services/logger';
import { ExcelCellValue } from '../../utils/excelExport';

export interface FinanceTableColumn {
  key: string;
  label: string;
  sticky?: boolean;
  width?: number;
  align?: 'left' | 'right' | 'center';
}

export interface FinanceTableCell {
  content: React.ReactNode;
  /** Valeur numérique (couleur + export Excel). */
  value?: number;
  /** Texte / nombre pour l’export Excel (prioritaire sur value / content string). */
  text?: string | number;
  colorize?: boolean;
  align?: 'left' | 'right' | 'center';
  className?: string;
}

export interface FinanceTableRow {
  id: string;
  cells: FinanceTableCell[];
  isTotal?: boolean;
  isOdd?: boolean;
}

interface FinanceTableProps {
  columns: FinanceTableColumn[];
  rows: FinanceTableRow[];
  stickyOffsets?: number[];
  className?: string;
  /** Nom de fichier suggéré (sans extension) pour l’export Excel. */
  exportFileName?: string;
  /** Nom de feuille Excel (défaut : premier mot du fichier). */
  exportSheetName?: string;
}

function cellExportValue(cell: FinanceTableCell): ExcelCellValue {
  if (cell.text !== undefined && cell.text !== null) return cell.text;
  if (cell.value !== undefined && Number.isFinite(cell.value)) return cell.value;
  if (typeof cell.content === 'string' || typeof cell.content === 'number') return cell.content;
  return '';
}

const FinanceTable: React.FC<FinanceTableProps> = ({
  columns,
  rows,
  stickyOffsets,
  className,
  exportFileName,
  exportSheetName,
}) => {
  const { t } = useTranslation();
  const [exporting, setExporting] = useState(false);

  const offsets =
    stickyOffsets ??
    columns.reduce<number[]>((acc, col, i) => {
      if (!col.sticky) return acc;
      const prev = acc.length > 0 ? acc[acc.length - 1]! + (columns[i - 1]?.width ?? 140) : 0;
      acc.push(prev);
      return acc;
    }, []);

  let stickyIndex = 0;

  const handleExport = async () => {
    if (!exportFileName || exporting) return;
    setExporting(true);
    try {
      const headers = columns.map((c) => c.label);
      const matrix = rows.map((row) => row.cells.map(cellExportValue));
      const ok = await ExportService.exportTableExcel(
        exportFileName,
        exportSheetName ?? exportFileName,
        headers,
        matrix
      );
      if (ok) toast.success(t('financeGlobal.exportedExcel'));
    } catch (err) {
      Logger.error('FinanceTable.exportExcel', err);
      toast.error(t('common.error'));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className={`finance-table-export-wrap ${className ?? ''}`}>
      {exportFileName && (
        <div className="finance-table-export-bar">
          <button
            type="button"
            className="ct-btn-secondary finance-table-export-btn"
            onClick={() => void handleExport()}
            disabled={exporting || rows.length === 0}
            title={t('financeGlobal.exportExcelTitle')}
          >
            {exporting ? <Loader2 size={16} className="animate-spin" /> : <FileSpreadsheet size={16} />}
            {t('financeGlobal.exportExcel')}
          </button>
        </div>
      )}
      <div className="finance-global-table-container">
        <table className="finance-table finance-sticky-table">
          <thead>
            <tr>
              {columns.map((col) => {
                const isSticky = col.sticky;
                const left = isSticky ? offsets[stickyIndex++] : undefined;
                return (
                  <th
                    key={col.key}
                    className={isSticky ? 'sticky-col' : undefined}
                    style={{
                      left,
                      minWidth: col.width ?? (isSticky ? 140 : 90),
                      textAlign: col.align ?? 'left',
                    }}
                  >
                    {col.label}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                className={`${row.isTotal ? 'total-row' : ''} ${row.isOdd ? 'odd-row' : ''}`}
              >
                {row.cells.map((cell, ci) => {
                  const col = columns[ci];
                  const isSticky = col?.sticky;
                  const stickyColIndex = columns
                    .slice(0, ci + 1)
                    .filter((c) => c.sticky).length - 1;
                  const left =
                    isSticky && stickyColIndex >= 0 ? offsets[stickyColIndex] : undefined;
                  const style =
                    cell.colorize && cell.value !== undefined
                      ? getColorStyle(cell.value)
                      : undefined;
                  return (
                    <td
                      key={ci}
                      className={`${isSticky ? 'sticky-col' : ''} ${cell.className ?? ''}`}
                      style={{
                        left,
                        minWidth: col?.width ?? (isSticky ? 140 : 90),
                        textAlign: cell.align ?? col?.align ?? 'left',
                        ...style,
                      }}
                    >
                      {cell.content}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export function formatCellMoney(value: number): React.ReactNode {
  if (value === 0) return '-';
  const cls = value > 0 ? 'text-positive' : 'text-negative';
  return <span className={cls}>{formatMoney(value)}</span>;
}

export default FinanceTable;
