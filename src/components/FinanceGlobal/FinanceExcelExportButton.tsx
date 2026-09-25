import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import { FileSpreadsheet, Loader2 } from 'lucide-react';
import { ExportService } from '../../services/ExportService';
import { Logger } from '../../services/logger';
import { ExcelCellValue } from '../../utils/excelExport';

interface FinanceExcelExportButtonProps {
  fileName: string;
  sheetName?: string;
  headers: string[];
  rows: ExcelCellValue[][];
  disabled?: boolean;
  className?: string;
}

/** Bouton d’export Excel pour les onglets Finance sans FinanceTable. */
const FinanceExcelExportButton: React.FC<FinanceExcelExportButtonProps> = ({
  fileName,
  sheetName,
  headers,
  rows,
  disabled,
  className,
}) => {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);

  const handleClick = async () => {
    if (busy || disabled || rows.length === 0) return;
    setBusy(true);
    try {
      const ok = await ExportService.exportTableExcel(
        fileName,
        sheetName ?? fileName,
        headers,
        rows
      );
      if (ok) toast.success(t('financeGlobal.exportedExcel'));
    } catch (err) {
      Logger.error('FinanceExcelExportButton.export', err);
      toast.error(t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`finance-table-export-bar ${className ?? ''}`}>
      <button
        type="button"
        className="ct-btn-secondary finance-table-export-btn"
        onClick={() => void handleClick()}
        disabled={busy || disabled || rows.length === 0}
        title={t('financeGlobal.exportExcelTitle')}
      >
        {busy ? <Loader2 size={16} className="animate-spin" /> : <FileSpreadsheet size={16} />}
        {t('financeGlobal.exportExcel')}
      </button>
    </div>
  );
};

export default FinanceExcelExportButton;
