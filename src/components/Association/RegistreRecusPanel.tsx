import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Ban, Eye, FileText, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import { ReceiptEntry } from '../../types/association';
import { AttachmentService } from '../../services/AttachmentService';
import { Logger } from '../../services/logger';
import { RegistreRecusService } from '../../services/RegistreRecusService';
import { formatMoney } from '../../utils/invoiceFormat';
import { registerDateLocale } from '../../utils/registerI18n';
import ConfirmModal from '../Common/ConfirmModal';

const formatDate = (iso: string | undefined, locale: string) => {
  if (!iso) return '—';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString(locale);
};

type Filter = 'tous' | 'actifs' | 'annules';

interface RegistreRecusPanelProps {
  isVisible?: boolean;
  start?: string;
  end?: string;
}

const RegistreRecusPanel: React.FC<RegistreRecusPanelProps> = ({ isVisible = true, start, end }) => {
  const { t, i18n } = useTranslation();
  const dateLocale = registerDateLocale(i18n.language);
  const natureLabel = (nature?: string) => {
    if (!nature) return '—';
    if (nature === 'numeraire') return t('association.numeraire');
    if (nature === 'nature') return t('association.natureDon');
    if (nature === 'mecenat_competences') return t('association.mecenat');
    return nature;
  };
  const modeLabel = (mode?: string) => {
    if (!mode) return '—';
    return t(`association.mode.${mode}`, { defaultValue: mode });
  };
  const [entries, setEntries] = useState<ReceiptEntry[]>([]);
  const [filter, setFilter] = useState<Filter>('actifs');
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    setEntries(await RegistreRecusService.loadRegistre());
  }, []);

  useEffect(() => {
    if (!isVisible) return;
    void reload().catch((err) => Logger.error('RegistreRecusPanel.load', err));
  }, [isVisible, reload]);

  const inPeriod = useMemo(() => {
    if (!start && !end) return entries;
    return entries.filter((entry) => {
      const date = String(entry.dateEmission ?? entry.date ?? '').slice(0, 10);
      if (start && date < start) return false;
      if (end && date > end) return false;
      return true;
    });
  }, [entries, start, end]);

  const filtered = useMemo(() => {
    if (filter === 'actifs') return inPeriod.filter((entry) => !entry.annule);
    if (filter === 'annules') return inPeriod.filter((entry) => entry.annule);
    return inPeriod;
  }, [inPeriod, filter]);

  const stats = useMemo(() => {
    const actifs = inPeriod.filter((entry) => !entry.annule);
    return {
      actifs: actifs.length,
      total: actifs.reduce((sum, entry) => sum + entry.montant, 0),
      annules: inPeriod.length - actifs.length,
    };
  }, [inPeriod]);

  const openPdf = async (entry: ReceiptEntry) => {
    if (!entry.pdfPath) {
      toast.error(t('association.noPdfArchived'));
      return;
    }
    try {
      await AttachmentService.openRel(entry.pdfPath);
    } catch (error) {
      Logger.error('RegistreRecusPanel.openPdf', error);
      toast.error(t('common.openPdfFail'));
    }
  };

  const confirmCancel = async () => {
    if (!cancelId) return;
    setBusy(true);
    try {
      await RegistreRecusService.annulerRecu(cancelId);
      setCancelId(null);
      toast.success(t('association.cancelledKept'));
      await reload();
    } catch (error) {
      Logger.error('RegistreRecusPanel.annuler', error);
      toast.error(t('association.cancelFail'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="donation-card">
      <div className="donation-section-head">
        <div>
          <h2>{t('association.receiptRegisterTitle')}</h2>
          <p>{t('association.receiptRegisterHint')}</p>
        </div>
        <div className="donation-row-actions">
          <div className="donation-receipt-filters">
            {(['tous', 'actifs', 'annules'] as const).map((value) => (
              <button
                key={value}
                type="button"
                className={filter === value ? 'active' : ''}
                onClick={() => setFilter(value)}
              >
                {value === 'tous' ? t('association.filterAll') : value === 'actifs' ? t('association.filterActive') : t('association.filterCancelled')}
              </button>
            ))}
          </div>
          <button type="button" className="ct-btn-secondary" onClick={() => void reload()} title={t('common.refresh')}>
            <RefreshCw size={15} />
          </button>
        </div>
      </div>
      <div className="donation-kpis" style={{ margin: '12px 16px 0', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
        <div><span>{t('association.kpiActive')}</span><strong>{stats.actifs}</strong></div>
        <div><span>{t('association.kpiActiveAmount')}</span><strong>{formatMoney(stats.total)}</strong></div>
        <div><span>{t('association.kpiCancelledKept')}</span><strong>{stats.annules}</strong></div>
      </div>
      <div className="donation-table-wrap">
        <table className="donation-table">
          <thead>
            <tr>
              <th>{t('association.colNumber')}</th>
              <th>{t('association.donor')}</th>
              <th>{t('association.nature')}</th>
              <th>{t('previsionnel.fromTransaction.mode')}</th>
              <th>{t('association.colIssueDate')}</th>
              <th>{t('association.montant')}</th>
              <th>{t('common.status')}</th>
              <th>{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((entry) => (
              <tr key={entry.id} className={entry.annule ? 'is-cancelled' : ''}>
                <td><strong>{entry.numero}</strong></td>
                <td>{entry.donateurLabel}</td>
                <td>{natureLabel(entry.natureDon)}</td>
                <td>{modeLabel(entry.modeVersement)}</td>
                <td>{formatDate(entry.dateEmission, dateLocale)}</td>
                <td className="amount">{formatMoney(entry.montant)}</td>
                <td>
                  {entry.annule
                    ? (
                      <span className="donation-status danger">
                        <Ban size={13} /> {entry.dateAnnulation
                          ? t('association.cancelledOn', { date: formatDate(entry.dateAnnulation, dateLocale) })
                          : t('association.annule')}
                      </span>
                    )
                    : <span className="donation-status success">{t('association.statusActive')}</span>}
                </td>
                <td>
                  <div className="donation-row-actions">
                    <button type="button" className="ct-btn-secondary" disabled={!entry.pdfPath} onClick={() => void openPdf(entry)}>
                      <Eye size={14} /> {t('common.pdf')}
                    </button>
                    {!entry.annule && (
                      <button type="button" className="ct-btn-danger" disabled={busy} onClick={() => setCancelId(entry.id)}>
                        {t('association.annuler')}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="donation-empty">
                  <FileText size={28} style={{ margin: '0 auto 8px', display: 'block' }} />
                  {filter === 'annules' ? t('association.emptyCancelled') : t('association.emptyIssued')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <ConfirmModal
        isOpen={Boolean(cancelId)}
        title={t('association.cancelReceiptTitle')}
        message={t('association.cancelReceiptMessage')}
        onCancel={() => setCancelId(null)}
        onConfirm={() => void confirmCancel()}
      />
    </section>
  );
};

export default RegistreRecusPanel;
