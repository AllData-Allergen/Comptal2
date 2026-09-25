// Mises à jour intégrées : tauri-plugin-updater + GitHub Releases.
// Le manifest latest.json est publié avec chaque release GitHub
// (endpoint configuré dans src-tauri/tauri.conf.json).
import { check, Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { withLog, Logger } from './logger';

export const UPDATER_MANIFEST_URL =
  'https://github.com/AllData-Allergen/Comptal2/releases/latest/download/latest.json';

export interface UpdateProgress {
  downloaded: number;
  total: number | null;
}

export type UpdateCheckFailureReason = 'offline' | 'no_release' | 'unknown';

function errorText(err: unknown): string {
  if (err instanceof Error) return `${err.message}\n${err.stack ?? ''}`;
  return String(err);
}

/** Classe l'échec de `check()` pour afficher un message UI explicite. */
export function classifyUpdateCheckError(err: unknown): UpdateCheckFailureReason {
  const text = errorText(err).toLowerCase();

  const offlineHints = [
    'network',
    'connection',
    'connect',
    'timed out',
    'timeout',
    'dns',
    'offline',
    'unreachable',
    'failed to fetch',
    'error sending request',
    'could not resolve',
  ];
  if (offlineHints.some((h) => text.includes(h))) {
    return 'offline';
  }

  const noReleaseHints = [
    '404',
    'not found',
    'latest.json',
    'no release',
    'release not found',
    'releasenotfound',
  ];
  if (noReleaseHints.some((h) => text.includes(h))) {
    return 'no_release';
  }

  return 'unknown';
}

export const UpdateService = {
  /**
   * Vérifie si une mise à jour est disponible.
   * Retourne null si l'application est à jour.
   * Lève une erreur si la vérification échoue (hors-ligne, dev, endpoint invalide).
   */
  async checkForUpdate(): Promise<Update | null> {
    return withLog('UpdateService.checkForUpdate', async () => {
      const update = await check();
      if (update) {
        Logger.info(
          'UpdateService.checkForUpdate',
          `Mise à jour disponible: v${update.version}`,
          { currentVersion: update.currentVersion }
        );
      }
      return update;
    });
  },

  /** Télécharge et installe la mise à jour, puis relance l'application. */
  async downloadInstallAndRelaunch(
    update: Update,
    onProgress?: (progress: UpdateProgress) => void
  ): Promise<void> {
    return withLog(
      'UpdateService.downloadInstallAndRelaunch',
      async () => {
        let downloaded = 0;
        let total: number | null = null;
        await update.downloadAndInstall((event) => {
          switch (event.event) {
            case 'Started':
              total = event.data.contentLength ?? null;
              onProgress?.({ downloaded: 0, total });
              break;
            case 'Progress':
              downloaded += event.data.chunkLength;
              onProgress?.({ downloaded, total });
              break;
            case 'Finished':
              onProgress?.({ downloaded: total ?? downloaded, total });
              break;
          }
        });
        await relaunch();
      },
      { data: { version: update.version } }
    );
  },
};
