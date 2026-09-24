// Mises à jour intégrées : tauri-plugin-updater + GitHub Releases.
// Le manifest latest.json est publié avec chaque release GitHub
// (endpoint configuré dans src-tauri/tauri.conf.json).
import { check, Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { withLog, Logger } from './logger';

export interface UpdateProgress {
  downloaded: number;
  total: number | null;
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
