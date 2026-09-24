import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import { open, save } from '@tauri-apps/plugin-dialog';
import { UserPlus, Check, Pencil, Trash2, Download, Upload as UploadIcon, Lock, Loader2 } from 'lucide-react';
import { ProfileInfo } from '../../types/models';
import { ProfileService } from '../../services/ProfileService';
import { SettingsService } from '../../services/SettingsService';
import { Logger } from '../../services/logger';
import ConfirmModal from '../Common/ConfirmModal';
import { USAGE_MODES, UsageMode, parseUsageMode } from '../../utils/usageMode';

interface ProfilesTabProps {
  onProfileChanged: () => void;
}

const ProfilesTab: React.FC<ProfilesTabProps> = ({ onProfileChanged }) => {
  const { t } = useTranslation();
  const [profiles, setProfiles] = useState<ProfileInfo[]>([]);
  const [activeId, setActiveId] = useState<string | null>(
    SettingsService.current.activeProfileId
  );
  const [newName, setNewName] = useState('');
  const [newUsage, setNewUsage] = useState<UsageMode>('tpe');
  const [newLocked, setNewLocked] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<ProfileInfo | null>(null);
  const [lockTarget, setLockTarget] = useState<ProfileInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  const reload = useCallback(async () => {
    try {
      setProfiles(await ProfileService.list());
      setActiveId(SettingsService.current.activeProfileId);
    } catch (err) {
      Logger.error('ProfilesTab.reload', err);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const run = async (action: () => Promise<void>, successMsg?: string) => {
    setBusy(true);
    try {
      await action();
      await reload();
      if (successMsg) toast.success(successMsg);
    } catch (err) {
      Logger.error('ProfilesTab.run', err);
      toast.error(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  const handleCreate = () =>
    run(async () => {
      if (!newName.trim()) return;
      const locked = newLocked && (newUsage === 'tpe' || newUsage === 'association');
      await ProfileService.create(newName, newUsage, locked);
      setNewName('');
      setNewLocked(false);
    }, t('settings.profiles.created'));

  const handleLock = () =>
    run(async () => {
      if (!lockTarget) return;
      await ProfileService.lockUsageMode(lockTarget.id);
      setLockTarget(null);
    }, t('settings.profiles.locked'));

  const handleActivate = (id: string) =>
    run(async () => {
      const migration = await ProfileService.setActive(id);
      onProfileChanged();
      if (migration && migration.rowsImported > 0) {
        toast.info(
          t('settings.data.migrationDone', {
            rows: migration.rowsImported,
            files: migration.filesImported,
          })
        );
      }
    }, t('settings.profiles.activated'));

  const handleRename = (id: string) =>
    run(async () => {
      await ProfileService.rename(id, renameValue);
      setRenamingId(null);
    });

  const handleDelete = () =>
    run(async () => {
      if (deleteTarget) {
        await ProfileService.remove(deleteTarget.id);
        setDeleteTarget(null);
      }
    }, t('settings.profiles.deleted'));

  const handleExport = async (profile: ProfileInfo) => {
    const dest = await save({
      defaultPath: `${profile.name.replace(/[^\w-]/g, '_')}_comptal21.zip`,
      filters: [{ name: 'ZIP', extensions: ['zip'] }],
    });
    if (!dest) return;
    await run(() => ProfileService.exportZip(profile.id, dest), t('settings.profiles.exported'));
  };

  const handleImport = async () => {
    const zip = await open({
      multiple: false,
      filters: [{ name: 'ZIP', extensions: ['zip'] }],
    });
    if (typeof zip !== 'string') return;
    setIsImporting(true);
    try {
      await run(async () => {
        const { profile, migration } = await ProfileService.importZip(zip);
        await ProfileService.setActive(profile.id);
        onProfileChanged();
        if (migration && migration.rowsImported > 0) {
          toast.info(
            t('settings.data.migrationDone', {
              rows: migration.rowsImported,
              files: migration.filesImported,
            })
          );
        }
      }, t('settings.profiles.imported'));
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <section className="ct-card">
        <h3 className="ct-section-title">{t('settings.profiles.title')}</h3>
        <p className="ct-hint">{t('settings.profiles.hint')}</p>

        <div className="flex flex-col gap-2">
          {profiles.map((profile) => (
            <div
              key={profile.id}
              className="flex items-center gap-3 p-3 rounded-lg border transition-all"
              style={{
                borderColor:
                  profile.id === activeId
                    ? 'var(--invoicing-primary-light)'
                    : 'var(--invoicing-gray-200)',
                backgroundColor:
                  profile.id === activeId ? 'var(--invoicing-primary-lightest)' : 'transparent',
              }}
            >
              {renamingId === profile.id ? (
                <div className="flex items-center gap-2 flex-1">
                  <input
                    className="ct-input flex-1"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void handleRename(profile.id);
                      if (e.key === 'Escape') setRenamingId(null);
                    }}
                    autoFocus
                  />
                  <button className="ct-btn-icon" onClick={() => void handleRename(profile.id)}>
                    <Check size={16} />
                  </button>
                </div>
              ) : (
                <div className="flex-1">
                  <span className="font-medium" style={{ color: 'var(--invoicing-gray-900)' }}>
                    {profile.name}
                  </span>
                  {profile.id === activeId && (
                    <span
                      className="ml-2 text-xs font-semibold px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: 'var(--invoicing-primary)', color: '#fff' }}
                    >
                      {t('settings.profiles.active')}
                    </span>
                  )}
                  <div className="text-xs" style={{ color: 'var(--invoicing-gray-500)' }}>
                    {profile.id}
                  </div>
                  {profile.usageLocked && (
                    <div className="text-xs mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full" style={{ backgroundColor: 'var(--invoicing-gray-200)', color: 'var(--invoicing-gray-800)', border: '1px solid var(--invoicing-gray-400)' }}>
                      <Lock size={12} /> {t('settings.profiles.lockedBadge')}
                    </div>
                  )}
                  <select
                    className="ct-select mt-2 text-sm"
                    value={parseUsageMode(profile.usageMode, 'tpe')}
                    disabled={busy || Boolean(profile.usageLocked)}
                    onChange={(e) =>
                      void run(
                        () => ProfileService.setUsageMode(profile.id, e.target.value as UsageMode),
                        t('settings.profiles.usageUpdated')
                      )
                    }
                  >
                    {USAGE_MODES.map((mode) => (
                      <option key={mode} value={mode}>
                        {t(`settings.profiles.usage.${mode}`)}
                      </option>
                    ))}
                  </select>
                  {!profile.usageLocked && (parseUsageMode(profile.usageMode, 'tpe') === 'tpe' || parseUsageMode(profile.usageMode, 'tpe') === 'association') && (
                    <button className="ct-btn-secondary !py-1 !px-2 text-xs mt-2" disabled={busy} onClick={() => setLockTarget(profile)}>
                      <Lock size={12} /> {t('settings.profiles.lockAction')}
                    </button>
                  )}
                </div>
              )}

              <div className="flex items-center gap-1">
                {profile.id !== activeId && (
                  <button
                    className="ct-btn-secondary !min-h-0 !py-1.5 !px-3 text-sm"
                    disabled={busy}
                    onClick={() => void handleActivate(profile.id)}
                  >
                    {t('settings.profiles.activate')}
                  </button>
                )}
                <button
                  className="ct-btn-icon"
                  title={t('settings.profiles.rename')}
                  onClick={() => {
                    setRenamingId(profile.id);
                    setRenameValue(profile.name);
                  }}
                >
                  <Pencil size={16} />
                </button>
                <button
                  className="ct-btn-icon"
                  title={t('settings.profiles.export')}
                  onClick={() => void handleExport(profile)}
                >
                  <Download size={16} />
                </button>
                {profile.id !== activeId && (
                  <button
                    className="ct-btn-icon hover:!text-red-500"
                    title={t('common.delete')}
                    onClick={() => setDeleteTarget(profile)}
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-3 mt-5 flex-wrap" data-tour="onb-profile-create">
          <input
            className="ct-input flex-1 min-w-[220px]"
            placeholder={t('settings.profiles.newProfileName')}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleCreate();
            }}
          />
          <select
            className="ct-select"
            value={newUsage}
            onChange={(e) => {
              const v = e.target.value as UsageMode;
              setNewUsage(v);
              if (v === 'familiale') setNewLocked(false);
            }}
          >
            {USAGE_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {t(`settings.profiles.usage.${mode}`)}
              </option>
            ))}
          </select>
          {(newUsage === 'tpe' || newUsage === 'association') && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={newLocked} onChange={(e) => setNewLocked(e.target.checked)} />
              {t('settings.profiles.lockAtCreate', { mode: t(`settings.profiles.usage.${newUsage}`) })}
            </label>
          )}
          <button
            className="ct-btn-primary"
            disabled={busy || !newName.trim()}
            onClick={() => void handleCreate()}
          >
            <UserPlus size={16} /> {t('settings.profiles.create')}
          </button>
          <button className="ct-btn-secondary" disabled={busy || isImporting} onClick={() => void handleImport()}>
            {isImporting ? <Loader2 size={16} className="animate-spin" /> : <UploadIcon size={16} />}
            {isImporting ? t('settings.profiles.importing') : t('settings.profiles.import')}
          </button>
        </div>
      </section>

      <ConfirmModal
        isOpen={deleteTarget !== null}
        title={t('settings.profiles.deleteConfirmTitle')}
        message={`${deleteTarget?.name ?? ''} — ${t('settings.profiles.deleteConfirmMessage')}`}
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
      <ConfirmModal
        isOpen={lockTarget !== null}
        title={t('settings.profiles.lockConfirmTitle')}
        message={t('settings.profiles.lockConfirmMessage', { mode: lockTarget ? t(`settings.profiles.usage.${parseUsageMode(lockTarget.usageMode, 'tpe')}`) : '' })}
        confirmLabel={t('settings.profiles.lockConfirmAction')}
        onConfirm={() => void handleLock()}
        onCancel={() => setLockTarget(null)}
      />
    </div>
  );
};

export default ProfilesTab;
