// Gestion des profils : 1 profil = 1 dossier data/profils/{id}/ contenant
// info.json, manifest.json, comptal.db et attachments/ (PDF, pièces jointes).
import { ProfileInfo } from '../types/models';
import i18n from '../i18n/config';
import { tauriBridge } from './tauri';
import { Logger, withLog } from './logger';
import { Db, SCHEMA_VERSION } from './db';
import { SettingsService } from './SettingsService';
import { MigrationResult, MigrationService } from './MigrationService';
import { assertSafeProfileId, isPlainObject } from '../utils/security';
import { menuPresetForUsage, parseUsageMode, UsageMode } from '../utils/usageMode';

const PROFILES_DIR = 'profils';
export const PROFILE_FORMAT = 'comptal21-profile';
export const PROFILE_FORMAT_VERSION = 1;

export interface ProfileManifest {
  format: typeof PROFILE_FORMAT;
  formatVersion: number;
  schemaVersion: number;
  exportedAt: string;
  profileName: string;
  sourceProfileId?: string;
  usageMode?: UsageMode;
  usageLocked?: boolean;
  modeSeal?: string | null;
}

export interface ProfileImportResult {
  profile: ProfileInfo;
  migration: MigrationResult | null;
}

function newProfileId(): string {
  return `profile_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

async function readInfo(id: string): Promise<ProfileInfo | null> {
  try {
    assertSafeProfileId(id);
    const content = await tauriBridge.readTextFile(`${PROFILES_DIR}/${id}/info.json`);
    const parsed = JSON.parse(content) as Partial<ProfileInfo>;
    return {
      id,
      name: parsed.name ?? id,
      createdAt: parsed.createdAt ?? new Date().toISOString(),
      usageMode: parseUsageMode(parsed.usageMode, 'tpe'),
      usageLocked: Boolean(parsed.usageLocked),
      lockedAt: (parsed.lockedAt as string | null) ?? null,
    };
  } catch {
    return null;
  }
}

async function readManifest(id: string): Promise<ProfileManifest | null> {
  try {
    const content = await tauriBridge.readTextFile(`${PROFILES_DIR}/${id}/manifest.json`);
    return JSON.parse(content) as ProfileManifest;
  } catch {
    return null;
  }
}

function parseProfileManifest(raw: unknown): ProfileManifest {
  if (!isPlainObject(raw)) throw new Error('Manifeste de profil invalide');
  if (raw.format !== PROFILE_FORMAT || raw.formatVersion !== PROFILE_FORMAT_VERSION) {
    throw new Error('Format de manifeste de profil non pris en charge');
  }
  if (!Number.isInteger(raw.schemaVersion) || Number(raw.schemaVersion) < 0 || Number(raw.schemaVersion) > SCHEMA_VERSION) {
    throw new Error('Version de schéma du profil non prise en charge');
  }
  if (
    typeof raw.exportedAt !== 'string' ||
    !Number.isFinite(Date.parse(raw.exportedAt)) ||
    typeof raw.profileName !== 'string' ||
    !raw.profileName.trim() ||
    raw.profileName.length > 200
  ) {
    throw new Error('Métadonnées du manifeste de profil invalides');
  }
  if (raw.sourceProfileId !== undefined) {
    if (typeof raw.sourceProfileId !== 'string') throw new Error('Identifiant source invalide');
    assertSafeProfileId(raw.sourceProfileId);
  }
  if (raw.usageMode !== undefined && !['familiale', 'tpe', 'association'].includes(String(raw.usageMode))) {
    throw new Error('Mode d’utilisation du manifeste invalide');
  }
  if (raw.usageLocked !== undefined && typeof raw.usageLocked !== 'boolean') {
    throw new Error('État de verrouillage du manifeste invalide');
  }
  if (
    raw.modeSeal !== undefined &&
    raw.modeSeal !== null &&
    (typeof raw.modeSeal !== 'string' || !/^[a-f0-9]{64}$/i.test(raw.modeSeal))
  ) {
    throw new Error('Sceau du manifeste invalide');
  }
  if (raw.usageLocked && (!raw.sourceProfileId || !raw.modeSeal)) {
    throw new Error(i18n.t('errors.profileSealMissing'));
  }
  return raw as unknown as ProfileManifest;
}

function canLockMode(mode: UsageMode): boolean {
  return mode === 'association' || mode === 'tpe';
}

async function verifyLockedSeal(id: string, info: ProfileInfo): Promise<void> {
  if (!info.usageLocked) return;
  if (!canLockMode(parseUsageMode(info.usageMode, 'tpe'))) {
    throw new Error(i18n.t('errors.profileLockedModeInvalid'));
  }
  const manifest = await readManifest(id);
  const seal = manifest?.modeSeal ?? null;
  if (!seal) {
    throw new Error(i18n.t('errors.profileSealMissing'));
  }
  const ok = await tauriBridge.verifyProfileMode({
    profileId: id,
    usageMode: parseUsageMode(info.usageMode, 'tpe'),
    usageLocked: true,
    seal,
  });
  if (!ok) {
    throw new Error(i18n.t('errors.profileSealInvalid'));
  }
}

async function writeInfo(info: ProfileInfo): Promise<void> {
  assertSafeProfileId(info.id);
  await tauriBridge.writeTextFile(
    `${PROFILES_DIR}/${info.id}/info.json`,
    JSON.stringify(info, null, 2)
  );
}

async function writeManifest(id: string, name: string, info?: ProfileInfo | null): Promise<void> {
  assertSafeProfileId(id);
  const mode = parseUsageMode(info?.usageMode, 'tpe');
  const locked = Boolean(info?.usageLocked && canLockMode(mode));
  let seal: string | null = null;
  if (locked) {
    try {
      seal = await tauriBridge.sealProfileMode({ profileId: id, usageMode: mode, usageLocked: true });
    } catch {
      seal = null;
    }
  }
  const manifest: ProfileManifest = {
    format: PROFILE_FORMAT,
    formatVersion: PROFILE_FORMAT_VERSION,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    profileName: name,
    sourceProfileId: id,
    usageMode: mode,
    usageLocked: locked,
    modeSeal: seal,
  };
  await tauriBridge.writeTextFile(
    `${PROFILES_DIR}/${id}/manifest.json`,
    JSON.stringify(manifest, null, 2)
  );
}

async function prepareFolder(id: string): Promise<void> {
  assertSafeProfileId(id);
  await tauriBridge.mkdirs(`${PROFILES_DIR}/${id}`);
  await tauriBridge.mkdirs(`${PROFILES_DIR}/${id}/attachments`);
}

export const ProfileService = {
  /** Liste tous les profils existants. */
  async list(): Promise<ProfileInfo[]> {
    return withLog('ProfileService.list', async () => {
      const entries = await tauriBridge.readDir(PROFILES_DIR);
      const profiles: ProfileInfo[] = [];
      for (const entry of entries) {
        if (!entry.isDir) continue;
        try {
          assertSafeProfileId(entry.name);
        } catch {
          continue;
        }
        const info = await readInfo(entry.name);
        if (info) {
          profiles.push(info);
        }
      }
      profiles.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      return profiles;
    });
  },

  /** Crée un profil vide et retourne ses métadonnées. */
  async create(name: string, usageMode: UsageMode = 'tpe', usageLocked = false): Promise<ProfileInfo> {
    return withLog(
      'ProfileService.create',
      async () => {
        const locked = Boolean(usageLocked && canLockMode(usageMode));
        const info: ProfileInfo = {
          id: newProfileId(),
          name: name.trim() || 'Sans nom',
          createdAt: new Date().toISOString(),
          usageMode,
          usageLocked: locked,
          lockedAt: locked ? new Date().toISOString() : null,
        };
        await prepareFolder(info.id);
        await writeInfo(info);
        await writeManifest(info.id, info.name, info);
        return info;
      },
      { data: { name, usageMode, usageLocked } }
    );
  },

  async lockUsageMode(id: string): Promise<void> {
    return withLog('ProfileService.lockUsageMode', async () => {
      assertSafeProfileId(id);
      const info = await readInfo(id);
      if (!info) throw new Error(i18n.t('errors.profileNotFound', { id }));
      if (info.usageLocked) return;
      if (!canLockMode(parseUsageMode(info.usageMode, 'tpe'))) {
        throw new Error(i18n.t('errors.profileLockNotAllowed'));
      }
      const next: ProfileInfo = { ...info, usageLocked: true, lockedAt: new Date().toISOString() };
      await writeInfo(next);
      await writeManifest(id, next.name, next);
    }, { data: { id } });
  },

  async rename(id: string, name: string): Promise<void> {
    return withLog('ProfileService.rename', async () => {
      assertSafeProfileId(id);
      const info = await readInfo(id);
      if (!info) {
        throw new Error(i18n.t('errors.profileNotFound', { id }));
      }
      await writeInfo({ ...info, name: name.trim() || info.name });
    });
  },

  /** Supprime un profil (dossier + base). Interdit sur le profil actif. */
  async remove(id: string): Promise<void> {
    return withLog('ProfileService.remove', async () => {
      assertSafeProfileId(id);
      if (SettingsService.current.activeProfileId === id) {
        throw new Error(i18n.t('errors.cannotDeleteActiveProfile'));
      }
      await tauriBridge.deleteDir(`${PROFILES_DIR}/${id}`);
    }, { data: { id } });
  },

  /** Active un profil : ouvre sa base, migre un éventuel legacy Comptal2, mémorise le choix. */
  async setUsageMode(id: string, usageMode: UsageMode): Promise<void> {
    return withLog('ProfileService.setUsageMode', async () => {
      assertSafeProfileId(id);
      const info = await readInfo(id);
      if (!info) {
        throw new Error(i18n.t('errors.profileNotFound', { id }));
      }
      if (info.usageLocked) {
        throw new Error(i18n.t('errors.profileLockedCannotChange'));
      }
      await writeInfo({ ...info, usageMode, usageLocked: false, lockedAt: null });
      await writeManifest(id, info.name, { ...info, usageMode, usageLocked: false, lockedAt: null });
      if (SettingsService.current.activeProfileId === id) {
        await SettingsService.save({ menuVisibility: menuPresetForUsage(usageMode) });
      }
    }, { data: { id, usageMode } });
  },

  async setActive(id: string): Promise<MigrationResult | null> {
    return withLog('ProfileService.setActive', async () => {
      assertSafeProfileId(id);
      const infoPre = await readInfo(id);
      if (infoPre?.usageLocked) {
        await verifyLockedSeal(id, infoPre);
      }
      await Db.openForProfile(id);
      const migration = await MigrationService.migrateLegacyProfileIfNeeded(id);
      const info = await readInfo(id);
      if (info?.usageLocked) {
        await verifyLockedSeal(id, info);
      }
      const usageMode = parseUsageMode(info?.usageMode, 'tpe');
      // Enforce menus for locked profiles (tpe/association ne peuvent pas masquer leurs modules)
      let visibility = menuPresetForUsage(usageMode);
      if (info?.usageLocked) {
        if (usageMode === 'tpe') visibility = { ...visibility, invoicing: true };
        if (usageMode === 'association') visibility = { ...visibility, invoicing: true, association: true, register: true };
      }
      await SettingsService.save({
        activeProfileId: id,
        menuVisibility: visibility,
      });
      return migration;
    }, { data: { id } });
  },

  /**
   * Démarrage : garantit qu'un profil actif valide existe et ouvre sa base.
   * Crée un profil "Principal" au tout premier lancement.
   */
  async ensureInitialized(): Promise<ProfileInfo> {
    return withLog('ProfileService.ensureInitialized', async () => {
      const settings = await SettingsService.load();
      let profiles = await this.list();

      if (profiles.length === 0) {
        Logger.info('ProfileService.ensureInitialized', 'Aucun profil, création de "Principal"');
        const created = await this.create('Principal');
        profiles = [created];
      }

      let active =
        profiles.find((p) => p.id === settings.activeProfileId) ?? profiles[0];
      if (active.usageLocked) {
        try {
          await verifyLockedSeal(active.id, active);
        } catch (err) {
          Logger.error('ProfileService.ensureInitialized', err);
          // Fallback vers un profil non verrouillé corrompu
          const fallback = profiles.find((p) => !p.usageLocked) ?? active;
          active = fallback;
        }
      }

      const usageMode = parseUsageMode(active.usageMode, 'tpe');
      let visibility = menuPresetForUsage(usageMode);
      if (active.usageLocked) {
        if (usageMode === 'tpe') visibility = { ...visibility, invoicing: true };
        if (usageMode === 'association') visibility = { ...visibility, invoicing: true, association: true, register: true };
      }
      if (settings.activeProfileId !== active.id) {
        await SettingsService.save({
          activeProfileId: active.id,
          menuVisibility: visibility,
        });
      } else {
        const needsFix = (usageMode === 'familiale' && settings.menuVisibility.register) ||
          (active.usageLocked && (
            (usageMode === 'tpe' && !settings.menuVisibility.invoicing) ||
            (usageMode === 'association' && (!settings.menuVisibility.invoicing || !settings.menuVisibility.association || !settings.menuVisibility.register))
          ));
        if (needsFix) {
          await SettingsService.save({
            menuVisibility: { ...settings.menuVisibility, ...visibility },
          });
        }
      }
      await Db.openForProfile(active.id);
      await MigrationService.migrateLegacyProfileIfNeeded(active.id);
      return active;
    });
  },

  /**
   * Exporte un profil complet (SQLite, pièces jointes, PDF) vers un ZIP.
   * Le ZIP est le format d’échange : base binaire + fichiers, identifié par manifest.json.
   */
  async exportZip(id: string, destAbs: string): Promise<void> {
    return withLog('ProfileService.exportZip', async () => {
      assertSafeProfileId(id);
      const previous = Db.profileId;
      try {
        if (previous !== id) {
          await Db.openForProfile(id);
        }
        await Db.checkpoint();
        const info = await readInfo(id);
        if (info?.usageLocked) await verifyLockedSeal(id, info);
        await writeManifest(id, info?.name ?? id, info);
        await tauriBridge.zipDir(`${PROFILES_DIR}/${id}`, destAbs);
      } finally {
        if (previous !== id) {
          if (previous) {
            await Db.openForProfile(previous);
          } else {
            await Db.close();
          }
        }
      }
    }, { data: { id } });
  },

  /** Importe un profil depuis un ZIP exporté (Comptal2 ou Comptal2.1). */
  async importZip(zipAbs: string): Promise<ProfileImportResult> {
    return withLog('ProfileService.importZip', async () => {
      const id = newProfileId();
      const stagingId = `_import_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      const previous = Db.profileId;
      assertSafeProfileId(id);
      assertSafeProfileId(stagingId);
      try {
        await tauriBridge.unzipTo(zipAbs, `${PROFILES_DIR}/${stagingId}`);
        const manifestRel = `${PROFILES_DIR}/${stagingId}/manifest.json`;
        const hasManifest = await tauriBridge.pathExists(manifestRel);
        if (!hasManifest) throw new Error('Archive de profil invalide : manifest.json manquant');
        const manifestContent = await tauriBridge.readTextFile(manifestRel);
        const manifest = parseProfileManifest(JSON.parse(manifestContent) as unknown);
        const existing = await readInfo(stagingId);
        let usageLocked = Boolean(
          existing?.usageLocked && canLockMode(parseUsageMode(existing?.usageMode, 'tpe'))
        );
        if (manifest?.usageLocked) usageLocked = true;
        const info: ProfileInfo = {
          id,
          name: existing ? `${existing.name} (importé)` : 'Profil importé',
          createdAt: new Date().toISOString(),
          usageMode: parseUsageMode(existing?.usageMode ?? manifest?.usageMode, 'tpe'),
          usageLocked,
          lockedAt: usageLocked
            ? (existing?.lockedAt ?? manifest?.exportedAt ?? new Date().toISOString())
            : null,
        };
        if (info.usageLocked) {
          const seal = manifest?.modeSeal ?? null;
          const sourceProfileId = manifest?.sourceProfileId;
          if (!seal || !sourceProfileId) {
            throw new Error(i18n.t('errors.profileSealMissing'));
          }
          const ok = await tauriBridge.verifyProfileMode({
            profileId: sourceProfileId,
            usageMode: info.usageMode!,
            usageLocked: true,
            seal,
          });
          if (!ok) throw new Error(i18n.t('errors.profileSealInvalid'));
        }
        await tauriBridge.renameDir(`${PROFILES_DIR}/${stagingId}`, `${PROFILES_DIR}/${id}`);
        await tauriBridge.mkdirs(`${PROFILES_DIR}/${id}/attachments`);
        await writeInfo(info);
        // Le sceau validé avec l'identifiant source est régénéré pour le nouvel identifiant.
        await writeManifest(id, info.name, info);
        await Db.openForProfile(id);
        const migration = await MigrationService.migrateLegacyProfileIfNeeded(id);
        if (migration) {
          Logger.info('ProfileService.importZip', 'Migration Comptal2 intégrée à l\'import', migration);
        }
        return { profile: info, migration };
      } catch (err) {
        await Db.close().catch(() => undefined);
        await tauriBridge.deleteDir(`${PROFILES_DIR}/${id}`).catch(() => undefined);
        if (previous) await Db.openForProfile(previous);
        throw err;
      } finally {
        await tauriBridge.deleteDir(`${PROFILES_DIR}/${stagingId}`).catch(() => undefined);
      }
    }, { data: { imported: true } });
  },
};
