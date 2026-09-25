import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import { open } from '@tauri-apps/plugin-dialog';
import { FolderOpen, DatabaseZap, AlertTriangle, FolderSearch, PlayCircle, Tags, Trash2, FileSpreadsheet, Loader2 } from 'lucide-react';
import { tauriBridge } from '../../services/tauri';
import { Logger } from '../../services/logger';
import { Db } from '../../services/db';
import { AutoCategorisationService } from '../../services/AutoCategorisationService';
import { LabelRuleService } from '../../services/LabelRuleService';
import { LabelRule } from '../../types/labelRule';
import { EditionService } from '../../services/EditionService';
import { ExportService } from '../../services/ExportService';
import {
  MigrationService,
  MigrationAnalysis,
  MigrationResult,
} from '../../services/MigrationService';
import ConfirmModal from '../Common/ConfirmModal';

const DataTab: React.FC = () => {
  const { t } = useTranslation();
  const dataRoot = Logger.session?.dataRoot ?? '';

  const [migrationSource, setMigrationSource] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<MigrationAnalysis | null>(null);
  const [migrating, setMigrating] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');
  const [result, setResult] = useState<MigrationResult | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [labelRules, setLabelRules] = useState<LabelRule[]>([]);
  const [excelBusy, setExcelBusy] = useState(false);

  const handleOpenDataFolder = async () => {
    try {
      await tauriBridge.openPath(dataRoot);
    } catch (err) {
      Logger.error('DataTab.handleOpenDataFolder', err);
      toast.error(t('common.error'));
    }
  };

  const handlePickSource = async () => {
    const dir = await open({ directory: true, multiple: false });
    if (typeof dir !== 'string') return;
    setMigrationSource(dir);
    setResult(null);
    try {
      const a = await MigrationService.analyze(dir);
      setAnalysis(a);
      if (!a.valid) {
        toast.warn(`${t('settings.data.migrationInvalid')} — ${a.reason ?? ''}`);
      }
    } catch (err) {
      Logger.error('DataTab.handlePickSource', err);
      toast.error(t('common.error'));
    }
  };

  const handleMigrate = async () => {
    if (!migrationSource) return;
    setMigrating(true);
    setResult(null);
    try {
      const r = await MigrationService.migrate(migrationSource, setProgressMsg);
      setResult(r);
      toast.success(
        t('settings.data.migrationDone', { rows: r.rowsImported, files: r.filesImported })
      );
    } catch (err) {
      Logger.error('DataTab.handleMigrate', err);
      toast.error(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setMigrating(false);
      setProgressMsg('');
    }
  };

  const reloadLabelRules = async () => {
    try {
      setLabelRules(await LabelRuleService.list());
    } catch (err) {
      Logger.error('DataTab.reloadLabelRules', err);
    }
  };

  useEffect(() => {
    void reloadLabelRules();
  }, []);

  const handleDeleteRule = async (id: number) => {
    try {
      await LabelRuleService.remove(id);
      await reloadLabelRules();
      toast.success(t('common.success'));
    } catch (err) {
      Logger.error('DataTab.handleDeleteRule', err);
      toast.error(t('common.error'));
    }
  };

  const handleClearTransactions = async () => {
    try {
      await EditionService.archiveAll();
      setConfirmClear(false);
      toast.success(t('settings.data.cleared'));
    } catch (err) {
      Logger.error('DataTab.handleClearTransactions', err);
      toast.error(t('common.error'));
    }
  };

  const handleAccountantExport = async () => {
    try {
      await ExportService.exportAccountantCsv({});
      toast.success(t('dashboard.exported'));
    } catch (err) {
      Logger.error('DataTab.exportAccountant', err);
      toast.error(t('common.error'));
    }
  };

  const handleCumulativeExcelExport = async () => {
    if (excelBusy) return;
    setExcelBusy(true);
    try {
      const ok = await ExportService.exportCumulativeExcel();
      if (ok) toast.success(t('settings.data.exportedExcel'));
    } catch (err) {
      Logger.error('DataTab.exportCumulativeExcel', err);
      toast.error(t('common.error'));
    } finally {
      setExcelBusy(false);
    }
  };

  const handleRebuildAutocat = async () => {
    try {
      const count = await AutoCategorisationService.rebuildFromTransactions();
      toast.success(t('settings.data.autocatRebuilt', { count }));
    } catch (err) {
      Logger.error('DataTab.handleRebuildAutocat', err);
      toast.error(t('common.error'));
    }
  };

  const handleResetAutocat = async () => {
    try {
      await Db.execute('DELETE FROM autocat_stats');
      toast.success(t('settings.data.autocatReset'));
    } catch (err) {
      Logger.error('DataTab.handleResetAutocat', err);
      toast.error(t('common.error'));
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Emplacement */}
      <section className="ct-card">
        <h3 className="ct-section-title flex items-center gap-2">
          <FolderOpen size={20} /> {t('settings.data.location')}
        </h3>
        <p className="ct-hint">{t('legal.privacyRetention')}</p>
        <div className="flex items-center gap-3 flex-wrap">
          <code
            className="text-sm px-3 py-2 rounded-lg"
            style={{
              backgroundColor: 'var(--invoicing-gray-100)',
              color: 'var(--invoicing-gray-700)',
            }}
          >
            {dataRoot}
          </code>
          <button className="ct-btn-secondary" onClick={() => void handleOpenDataFolder()}>
            {t('settings.data.openFolder')}
          </button>
          <button className="ct-btn-secondary" onClick={() => void handleAccountantExport()}>
            <FileSpreadsheet size={16} /> {t('settings.data.exportAccountant')}
          </button>
          <button
            className="ct-btn-primary"
            onClick={() => void handleCumulativeExcelExport()}
            disabled={excelBusy}
            title={t('settings.data.exportCumulativeHint')}
          >
            {excelBusy ? <Loader2 size={16} className="animate-spin" /> : <FileSpreadsheet size={16} />}
            {t('settings.data.exportCumulative')}
          </button>
        </div>
      </section>

      {/* Migration Comptal2 */}
      <section className="ct-card">
        <h3 className="ct-section-title flex items-center gap-2">
          <DatabaseZap size={20} /> {t('settings.data.migration')}
        </h3>
        <p className="ct-hint">{t('settings.data.migrationHint')}</p>

        <div className="flex flex-col gap-3">
          <div className="flex gap-3 flex-wrap items-center">
            <button
              className="ct-btn-secondary"
              disabled={migrating}
              onClick={() => void handlePickSource()}
            >
              <FolderSearch size={16} /> {t('settings.data.migrationPick')}
            </button>
            {migrationSource && (
              <code className="text-xs" style={{ color: 'var(--invoicing-gray-600)' }}>
                {migrationSource}
              </code>
            )}
          </div>

          {analysis?.valid && (
            <div
              className="text-sm rounded-lg p-3"
              style={{
                backgroundColor: 'var(--invoicing-primary-lightest)',
                color: 'var(--invoicing-gray-800)',
              }}
            >
              {analysis.accountCount} compte(s) · {analysis.categoryCount} catégorie(s) ·{' '}
              {analysis.csvFileCount} fichier(s) CSV
            </div>
          )}

          {analysis?.valid && (
            <div>
              <button
                className="ct-btn-primary"
                disabled={migrating}
                onClick={() => void handleMigrate()}
              >
                <PlayCircle size={16} />{' '}
                {migrating ? progressMsg || t('common.loading') : t('settings.data.migrationRun')}
              </button>
            </div>
          )}

          {result && (
            <div
              className="text-sm rounded-lg p-3"
              style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)', color: 'var(--invoicing-success)' }}
            >
              {t('settings.data.migrationDone', {
                rows: result.rowsImported,
                files: result.filesImported,
              })}
            </div>
          )}
        </div>
      </section>

      <section className="ct-card">
        <h3 className="ct-section-title flex items-center gap-2">
          <Tags size={20} /> {t('settings.data.labelRules')}
        </h3>
        <p className="ct-hint">{t('settings.data.labelRulesHint')}</p>
        {labelRules.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--invoicing-gray-500)' }}>
            {t('settings.data.labelRulesEmpty')}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="text-left py-1">{t('edition.routineLabelWord')}</th>
                <th className="text-left py-1">{t('settings.tabs.categories')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {labelRules.map((rule) => (
                <tr key={rule.id}>
                  <td className="py-1">{rule.word}</td>
                  <td className="py-1">{rule.categoryCode ?? '—'}</td>
                  <td className="py-1 text-right">
                    <button
                      type="button"
                      className="ct-btn-icon"
                      title={t('common.delete')}
                      onClick={() => void handleDeleteRule(rule.id)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Zone dangereuse */}
      <section
        className="ct-card"
        style={{ borderColor: 'var(--invoicing-danger)' }}
      >
        <h3 className="ct-section-title flex items-center gap-2" style={{ color: 'var(--invoicing-danger)' }}>
          <AlertTriangle size={20} /> {t('settings.data.dangerZone')}
        </h3>
        <div className="flex gap-3 flex-wrap">
          <button className="ct-btn-danger" onClick={() => setConfirmClear(true)}>
            {t('settings.data.clearTransactions')}
          </button>
          <button className="ct-btn-secondary" onClick={() => void handleRebuildAutocat()}>
            {t('settings.data.rebuildAutocat')}
          </button>
          <button className="ct-btn-secondary" onClick={() => void handleResetAutocat()}>
            {t('settings.data.resetAutocat')}
          </button>
        </div>
      </section>

      <ConfirmModal
        isOpen={confirmClear}
        title={t('settings.data.clearTransactionsConfirmTitle')}
        message={t('settings.data.clearTransactionsConfirmMessage')}
        onConfirm={() => void handleClearTransactions()}
        onCancel={() => setConfirmClear(false)}
      />
    </div>
  );
};

export default DataTab;
