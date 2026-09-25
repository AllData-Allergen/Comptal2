// Pont typé vers les commandes Rust (src-tauri/src/commands.rs).
// Toute la persistance fichier passe par ici : les chemins sont RELATIFS
// à la racine de données (Comptal2.1/data en dev, %APPDATA% en production).
import { invoke, isTauri } from '@tauri-apps/api/core';

export interface SessionInfo {
  sessionId: string;
  dataRoot: string;
  appVersion: string;
  dev: boolean;
}

export interface FsEntry {
  name: string;
  isDir: boolean;
}

type TauriInternals = { invoke?: (...args: unknown[]) => unknown };

/** True uniquement dans le webview Tauri (pas dans un navigateur Vite isolé). */
export function isTauriAvailable(): boolean {
  if (typeof window === 'undefined') return false;
  const internals = (window as Window & { __TAURI_INTERNALS__?: TauriInternals }).__TAURI_INTERNALS__;
  return isTauri() && typeof internals?.invoke === 'function';
}

function cmd<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauriAvailable()) {
    return Promise.reject(new Error(`Tauri indisponible (${name})`));
  }
  return invoke<T>(name, args);
}

export const tauriBridge = {
  isAvailable: isTauriAvailable,
  getSessionInfo: (): Promise<SessionInfo> => cmd('get_session_info'),

  readTextFile: (rel: string): Promise<string> => cmd('read_text_file', { rel }),
  writeTextFile: (rel: string, content: string): Promise<void> =>
    cmd('write_text_file', { rel, content }),
  appendTextLine: (rel: string, line: string): Promise<void> =>
    cmd('append_text_line', { rel, line }),
  readDir: (rel: string): Promise<FsEntry[]> => cmd('read_dir', { rel }),
  pathExists: (rel: string): Promise<boolean> => cmd('path_exists', { rel }),
  mkdirs: (rel: string): Promise<void> => cmd('mkdirs', { rel }),
  deleteFile: (rel: string): Promise<void> => cmd('delete_file', { rel }),
  deleteDir: (rel: string): Promise<void> => cmd('delete_dir', { rel }),
  copyDir: (srcRel: string, dstRel: string): Promise<void> =>
    cmd('copy_dir', { srcRel, dstRel }),
  renameDir: (srcRel: string, dstRel: string): Promise<void> =>
    cmd('rename_dir', { srcRel, dstRel }),

  writeBinaryFile: (rel: string, data: number[]): Promise<void> =>
    cmd('write_binary_file', { rel, data }),
  resolveDataPath: (rel: string): Promise<string> => cmd('resolve_data_path', { rel }),

  zipDir: (srcRel: string, destAbs: string): Promise<void> =>
    cmd('zip_dir', { srcRel, destAbs }),
  unzipTo: (zipAbs: string, destRel: string): Promise<void> =>
    cmd('unzip_to', { zipAbs, destRel }),

  readExternalTextFile: (abs: string): Promise<string> =>
    cmd('read_external_text_file', { abs }),
  writeExternalTextFile: (abs: string, content: string): Promise<void> =>
    cmd('write_external_text_file', { abs, content }),
  writeExternalBinaryFile: (abs: string, data: number[]): Promise<void> =>
    cmd('write_external_binary_file', { abs, data }),
  readExternalDir: (abs: string): Promise<FsEntry[]> => cmd('read_external_dir', { abs }),
  externalExists: (abs: string): Promise<boolean> => cmd('external_exists', { abs }),

  openPath: (abs: string): Promise<void> => cmd('open_path', { abs }),

  sealProfileMode: (args: { profileId: string; usageMode: string; usageLocked: boolean }): Promise<string> =>
    cmd('seal_profile_mode', { profileId: args.profileId, usageMode: args.usageMode, usageLocked: args.usageLocked }),
  verifyProfileMode: (args: { profileId: string; usageMode: string; usageLocked: boolean; seal: string }): Promise<boolean> =>
    cmd('verify_profile_mode', { profileId: args.profileId, usageMode: args.usageMode, usageLocked: args.usageLocked, seal: args.seal }),
};
