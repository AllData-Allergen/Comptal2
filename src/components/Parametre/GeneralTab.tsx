import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import { Monitor, Languages, Palette, Eye } from 'lucide-react';
import {
  AppLanguage,
  AppSettings,
  isAppLanguage,
  LANGUAGE_OPTIONS,
  MenuVisibility,
  WINDOW_PRESETS,
  WindowMode,
} from '../../types/settings';
import { SettingsService } from '../../services/SettingsService';
import { WindowService } from '../../services/WindowService';
import { applyThemeToDocument } from '../../hooks/useTheme';
import { Logger } from '../../services/logger';
import i18n from '../../i18n/config';
import { ProfileService } from '../../services/ProfileService';
import { parseUsageMode, UsageMode } from '../../utils/usageMode';

const MENU_LABELS: Array<{ key: keyof MenuVisibility; labelKey: string }> = [
  { key: 'dashboard', labelKey: 'navigation.dashboard' },
  { key: 'upload', labelKey: 'navigation.import' },
  { key: 'edition', labelKey: 'navigation.edition' },
  { key: 'financeGlobal', labelKey: 'navigation.financeGlobal' },
  { key: 'projectManagement', labelKey: 'navigation.projectManagement' },
  { key: 'invoicing', labelKey: 'navigation.invoicing' },
  { key: 'clients', labelKey: 'navigation.clients' },
  { key: 'association', labelKey: 'navigation.association' },
  { key: 'register', labelKey: 'navigation.register' },
  { key: 'amortissement', labelKey: 'navigation.amortissement' },
];

const GeneralTab: React.FC = () => {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<AppSettings>(SettingsService.current);
  const [usageMode, setUsageMode] = useState<UsageMode>('tpe');

  useEffect(() => {
    const refreshUsage = async () => {
      const profiles = await ProfileService.list();
      const active = profiles.find((profile) => profile.id === SettingsService.current.activeProfileId);
      setUsageMode(parseUsageMode(active?.usageMode, 'tpe'));
    };
    void refreshUsage();
    return SettingsService.subscribe(() => {
      void refreshUsage();
    });
  }, []);

  const menuLabels = MENU_LABELS.filter(
    ({ key }) => usageMode !== 'familiale' || key !== 'register'
  );
  const [locked, setLocked] = useState(false);
  useEffect(() => {
    void ProfileService.list().then((pls) => {
      const active = pls.find((p) => p.id === SettingsService.current.activeProfileId);
      setLocked(Boolean(active?.usageLocked && (active.usageMode === 'tpe' || active.usageMode === 'association')));
    }).catch(() => undefined);
  }, [settings.activeProfileId]);
  const isLockedKey = (key: keyof MenuVisibility) => {
    if (!locked) return false;
    if (usageMode === 'tpe') return key === 'invoicing';
    if (usageMode === 'association') return key === 'invoicing' || key === 'association' || key === 'register';
    return false;
  };

  const update = async (partial: Partial<AppSettings>) => {
    try {
      const next = await SettingsService.save(partial);
      setSettings(next);
    } catch (err) {
      Logger.error('GeneralTab.update', err);
      toast.error(t('common.error'));
    }
  };

  const handleLanguage = async (language: AppLanguage) => {
    await update({ language });
    await i18n.changeLanguage(language);
    document.documentElement.lang = language;
  };

  const handleTheme = async (theme: 'light' | 'dark') => {
    applyThemeToDocument(theme);
    await update({ theme });
  };

  const handleWindowMode = (mode: WindowMode) => {
    void update({ window: { ...settings.window, mode } });
  };

  const applyWindow = async () => {
    try {
      await WindowService.apply(settings.window);
      toast.success(t('settings.general.windowApplied'));
    } catch (err) {
      Logger.error('GeneralTab.applyWindow', err);
      toast.error(t('common.error'));
    }
  };

  const currentPreset = WINDOW_PRESETS.find(
    (p) => p.width === settings.window.width && p.height === settings.window.height
  );

  return (
    <div className="flex flex-col gap-6">
      {/* Langue */}
      <section className="ct-card" data-tour="onb-language">
        <h3 className="ct-section-title flex items-center gap-2">
          <Languages size={20} /> {t('settings.general.language')}
        </h3>
        <select
          className="ct-select w-64"
          value={settings.language}
          onChange={(e) => {
            if (isAppLanguage(e.target.value)) void handleLanguage(e.target.value);
          }}
        >
          {LANGUAGE_OPTIONS.map((option) => (
            <option key={option.code} value={option.code}>
              {option.label}
            </option>
          ))}
        </select>
      </section>

      {/* Thème */}
      <section className="ct-card">
        <h3 className="ct-section-title flex items-center gap-2">
          <Palette size={20} /> {t('settings.general.theme')}
        </h3>
        <div className="flex gap-3">
          <button
            className={settings.theme === 'light' ? 'ct-btn-primary' : 'ct-btn-secondary'}
            onClick={() => void handleTheme('light')}
          >
            {t('settings.general.themeLight')}
          </button>
          <button
            className={settings.theme === 'dark' ? 'ct-btn-primary' : 'ct-btn-secondary'}
            onClick={() => void handleTheme('dark')}
          >
            {t('settings.general.themeDark')}
          </button>
        </div>
      </section>

      {/* Cadrage de la fenêtre */}
      <section className="ct-card" data-tour="onb-window-mode">
        <h3 className="ct-section-title flex items-center gap-2">
          <Monitor size={20} /> {t('settings.general.windowMode')}
        </h3>
        <div className="flex flex-col gap-4">
          <div className="flex gap-3 flex-wrap">
            <button
              className={settings.window.mode === 'preset' ? 'ct-btn-primary' : 'ct-btn-secondary'}
              onClick={() => handleWindowMode('preset')}
            >
              {t('settings.general.windowPreset')}
            </button>
            <button
              className={settings.window.mode === 'custom' ? 'ct-btn-primary' : 'ct-btn-secondary'}
              onClick={() => handleWindowMode('custom')}
            >
              {t('settings.general.windowCustom')}
            </button>
            <button
              className={
                settings.window.mode === 'fullscreen' ? 'ct-btn-primary' : 'ct-btn-secondary'
              }
              onClick={() => handleWindowMode('fullscreen')}
            >
              {t('settings.general.windowFullscreen')}
            </button>
          </div>

          {settings.window.mode === 'preset' && (
            <select
              className="ct-select w-72"
              value={currentPreset ? `${currentPreset.width}x${currentPreset.height}` : 'custom'}
              onChange={(e) => {
                const [w, h] = e.target.value.split('x').map(Number);
                void update({ window: { ...settings.window, width: w, height: h } });
              }}
            >
              {WINDOW_PRESETS.map((p) => (
                <option key={p.label} value={`${p.width}x${p.height}`}>
                  {p.label}
                </option>
              ))}
            </select>
          )}

          {settings.window.mode === 'custom' && (
            <div className="flex gap-4 items-end flex-wrap">
              <div>
                <label className="ct-label">{t('settings.general.windowWidth')}</label>
                <input
                  type="number"
                  min={1024}
                  max={7680}
                  className="ct-input w-32"
                  value={settings.window.width}
                  onChange={(e) =>
                    void update({
                      window: { ...settings.window, width: Number(e.target.value) || 1024 },
                    })
                  }
                />
              </div>
              <div>
                <label className="ct-label">{t('settings.general.windowHeight')}</label>
                <input
                  type="number"
                  min={768}
                  max={4320}
                  className="ct-input w-32"
                  value={settings.window.height}
                  onChange={(e) =>
                    void update({
                      window: { ...settings.window, height: Number(e.target.value) || 768 },
                    })
                  }
                />
              </div>
            </div>
          )}

          <div>
            <button className="ct-btn-primary" onClick={() => void applyWindow()}>
              {t('settings.general.windowApply')}
            </button>
          </div>
        </div>
      </section>

      {/* Visibilité des menus */}
      <section className="ct-card">
        <h3 className="ct-section-title flex items-center gap-2">
          <Eye size={20} /> {t('settings.general.menuVisibility')}
        </h3>
        <p className="ct-hint">{t('settings.general.menuVisibilityHint')}</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {menuLabels.map(({ key, labelKey }) => (
            <label
              key={key}
              className="flex items-center gap-2 cursor-pointer text-sm"
              style={{ color: 'var(--invoicing-gray-700)' }}
            >
              <input
                type="checkbox"
                className="w-4 h-4 accent-blue-600"
                checked={settings.menuVisibility[key]}
                disabled={isLockedKey(key)}
                onChange={(e) =>
                  void update({
                    menuVisibility: { ...settings.menuVisibility, [key]: e.target.checked },
                  })
                }
              />
              {t(labelKey)}
            </label>
          ))}
        </div>
      </section>
    </div>
  );
};

export default GeneralTab;
