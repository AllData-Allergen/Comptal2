import React from 'react';
import { useTranslation } from 'react-i18next';
import { SkipForward } from 'lucide-react';
import { PreviewRow } from '../../types/import';
import { formatFrDate } from '../../utils/dateFormats';
import { formatMoney } from '../../utils/amounts';

interface ImportPreviewTableProps {
  rows: PreviewRow[];
  onConfirm?: () => void;
  onCancel?: () => void;
  onIgnore?: () => void;
  confirmLabel?: string;
  ignoreHint?: string;
  busy?: boolean;
}

const ImportPreviewTable: React.FC<ImportPreviewTableProps> = ({
  rows,
  onConfirm,
  onCancel,
  onIgnore,
  confirmLabel,
  ignoreHint,
  busy,
}) => {
  const { t } = useTranslation();
  const shown = rows.slice(0, 50);
  const showCategory = rows.some((r) => Boolean(r.categoryCode));
  const showAccount = rows.some((r) => Boolean(r.accountCode));
  return (
    <div className="ct-card">
      <h2 className="ct-section-title">
        {t('upload.preview')} ({rows.length})
      </h2>
      <div className="overflow-auto" style={{ maxHeight: 420 }}>
        <table className="ct-table">
          <thead className="sticky top-0" style={{ background: 'var(--invoicing-gray-50)' }}>
            <tr>
              <th>{t('upload.colDate')}</th>
              {showAccount && <th>{t('upload.colAccount')}</th>}
              <th>{t('upload.colLabel')}</th>
              {showCategory && <th>{t('upload.colCategory')}</th>}
              <th>{t('upload.colDebit')}</th>
              <th>{t('upload.colCredit')}</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((row, i) => (
              <tr key={`${row.date}-${i}`}>
                <td>{formatFrDate(row.date)}</td>
                {showAccount && <td>{row.accountCode || '—'}</td>}
                <td className="max-w-xs truncate">{row.label}</td>
                {showCategory && <td>{row.categoryCode || '—'}</td>}
                <td style={{ color: row.debit ? 'var(--invoicing-danger)' : undefined }}>
                  {row.debit ? formatMoney(row.debit) : '—'}
                </td>
                <td style={{ color: row.credit ? 'var(--invoicing-success)' : undefined }}>
                  {row.credit ? formatMoney(row.credit) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > 50 && (
        <p className="ct-hint mt-2">{t('upload.previewTruncated', { count: rows.length })}</p>
      )}
      {ignoreHint && <p className="ct-hint mt-2">{ignoreHint}</p>}
      {(onConfirm || onCancel || onIgnore) && (
        <div
          className="flex flex-wrap justify-end gap-3 mt-4 pt-4"
          style={{ borderTop: '1px solid var(--invoicing-gray-200)' }}
        >
          {onCancel && (
            <button className="ct-btn-secondary" onClick={onCancel} disabled={busy}>
              {t('common.cancel')}
            </button>
          )}
          {onIgnore && (
            <button className="ct-btn-secondary" onClick={onIgnore} disabled={busy}>
              <SkipForward size={16} />
              {t('upload.ignoreThisImport')}
            </button>
          )}
          {onConfirm && (
            <button className="ct-btn-primary" onClick={onConfirm} disabled={busy}>
              {confirmLabel ?? t('upload.confirmImport')}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default ImportPreviewTable;
