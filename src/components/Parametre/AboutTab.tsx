import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Info, RefreshCw, DownloadCloud, Shield } from 'lucide-react';
import { Update } from '@tauri-apps/plugin-updater';
import { Logger } from '../../services/logger';
import { UpdateService, UpdateProgress } from '../../services/UpdateService';

type UpdateState =
  | { phase: 'idle' }
  | { phase: 'checking' }
  | { phase: 'upToDate' }
  | { phase: 'available'; update: Update }
  | { phase: 'downloading'; percent: number }
  | { phase: 'installing' }
  | { phase: 'error' };

const AboutTab: React.FC = () => {
  const { t } = useTranslation();
  const version = Logger.session?.appVersion ?? '2.1.2';
  const [state, setState] = useState<UpdateState>({ phase: 'idle' });

  const handleCheck = async () => {
    setState({ phase: 'checking' });
    try {
      const update = await UpdateService.checkForUpdate();
      setState(update ? { phase: 'available', update } : { phase: 'upToDate' });
    } catch (err) {
      Logger.error('AboutTab.handleCheck', err);
      setState({ phase: 'error' });
    }
  };

  const handleInstall = async (update: Update) => {
    setState({ phase: 'downloading', percent: 0 });
    try {
      await UpdateService.downloadInstallAndRelaunch(update, (p: UpdateProgress) => {
        if (p.total && p.total > 0) {
          const percent = Math.min(100, Math.round((p.downloaded / p.total) * 100));
          if (percent >= 100) {
            setState({ phase: 'installing' });
          } else {
            setState({ phase: 'downloading', percent });
          }
        }
      });
      setState({ phase: 'installing' });
    } catch (err) {
      Logger.error('AboutTab.handleInstall', err);
      setState({ phase: 'error' });
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <section className="ct-card">
        <h3 className="ct-section-title flex items-center gap-2">
          <Info size={20} /> {t('settings.about.title')}
        </h3>
        <div className="flex flex-col gap-2 text-sm" style={{ color: 'var(--invoicing-gray-700)' }}>
          <div>
            <span className="font-semibold">Comptal2.1</span> — {t('legal.productTagline')}
          </div>
          <div>
            {t('settings.about.version')} : <span className="font-mono">{version}</span>
          </div>
          <div>Tauri 2 · React 18 · SQLite</div>
          <p className="ct-hint mt-2">{t('legal.scopeLead')}</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>{t('legal.scopeItemTreasury')}</li>
            <li>{t('legal.scopeItemComplement')}</li>
            <li>{t('legal.scopeItemNotFec')}</li>
            <li>{t('legal.scopeItemNotCash')}</li>
            <li>{t('legal.scopeItemNotPa')}</li>
          </ul>
        </div>
      </section>

      <section className="ct-card">
        <h3 className="ct-section-title flex items-center gap-2">
          <Shield size={20} /> {t('legal.privacyTitle')}
        </h3>
        <div className="flex flex-col gap-2 text-sm" style={{ color: 'var(--invoicing-gray-700)' }}>
          <p>{t('legal.privacyController')}</p>
          <p>{t('legal.privacyRetention')}</p>
          <p>{t('legal.privacyZip')}</p>
          <p>{t('legal.privacyUpdates')}</p>
        </div>
      </section>

      <section className="ct-card">
        <h3 className="ct-section-title flex items-center gap-2">
          <DownloadCloud size={20} /> {t('settings.about.updates')}
        </h3>

        <div className="flex flex-col gap-4">
          <div>
            <button
              className="ct-btn-primary"
              disabled={state.phase === 'checking' || state.phase === 'downloading'}
              onClick={() => void handleCheck()}
            >
              <RefreshCw size={16} className={state.phase === 'checking' ? 'animate-spin' : ''} />
              {state.phase === 'checking'
                ? t('settings.about.checking')
                : t('settings.about.checkUpdates')}
            </button>
          </div>

          {state.phase === 'upToDate' && (
            <p className="text-sm" style={{ color: 'var(--invoicing-success)' }}>
              {t('settings.about.upToDate')}
            </p>
          )}

          {state.phase === 'error' && (
            <p className="text-sm" style={{ color: 'var(--invoicing-warning)' }}>
              {t('settings.about.updateError')}
            </p>
          )}

          {state.phase === 'available' && (
            <div className="flex flex-col gap-3">
              <p className="text-sm font-medium" style={{ color: 'var(--invoicing-gray-800)' }}>
                {t('settings.about.updateAvailable', { version: state.update.version })}
              </p>
              <div>
                <button className="ct-btn-primary" onClick={() => void handleInstall(state.update)}>
                  <DownloadCloud size={16} /> {t('settings.about.download')}
                </button>
              </div>
            </div>
          )}

          {state.phase === 'downloading' && (
            <div className="flex flex-col gap-2">
              <p className="text-sm" style={{ color: 'var(--invoicing-gray-700)' }}>
                {t('settings.about.downloading', { percent: state.percent })}
              </p>
              <div
                className="w-full h-2 rounded-full overflow-hidden"
                style={{ backgroundColor: 'var(--invoicing-gray-200)' }}
              >
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${state.percent}%`,
                    backgroundColor: 'var(--invoicing-primary)',
                  }}
                />
              </div>
            </div>
          )}

          {state.phase === 'installing' && (
            <p className="text-sm" style={{ color: 'var(--invoicing-gray-700)' }}>
              {t('settings.about.installing')}
            </p>
          )}
        </div>
      </section>
    </div>
  );
};

export default AboutTab;
