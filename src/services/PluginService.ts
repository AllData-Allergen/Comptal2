import { open } from '@tauri-apps/plugin-dialog';
import i18n from '../i18n/config';
import { MentionLegale } from '../types/invoice';
import {
  EXPORT_CSV_FIELDS,
  ExportCsvField,
  InstalledPlugin,
  PLUGIN_FORMAT,
  PLUGIN_FORMAT_VERSION,
  PLUGIN_HOOKS,
  PLUGIN_TYPES,
  PluginCategoryPack,
  PluginExportMapper,
  PluginHook,
  PluginImportMapper,
  PluginManifest,
  PluginMentionPack,
  PluginPayloads,
  PluginType,
} from '../types/plugin';
import { ColumnRolesByHeader, ColumnRole } from '../types/import';
import { assertSafePluginId, isPlainObject } from '../utils/security';
import { ConfigService } from './ConfigService';
import { Db } from './db';
import { ImportTemplateService } from './ImportTemplateService';
import { LegalMentionsService } from './LegalMentionsService';
import { Logger, withLog } from './logger';
import { tauriBridge } from './tauri';

const PLUGINS_DIR = 'plugins';
const ALLOWED_PLUGIN_FILES = new Set(['.json', '.txt', '.md']);
const ALLOWED_NAMES = new Set(['manifest.json', 'license', 'license.txt', 'readme', 'readme.md', 'readme.txt']);

interface PluginStateRow {
  plugin_id: string;
  enabled: number;
  applied_at: string | null;
}

function isPluginType(value: unknown): value is PluginType {
  return typeof value === 'string' && (PLUGIN_TYPES as readonly string[]).includes(value);
}

function parseHooks(raw: unknown): PluginHook[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is PluginHook => typeof item === 'string' && (PLUGIN_HOOKS as readonly string[]).includes(item));
}

function parseManifest(raw: unknown): PluginManifest {
  if (!isPlainObject(raw)) {
    throw new Error(i18n.t('errors.pluginManifestInvalid'));
  }
  const id = assertSafePluginId(String(raw.id ?? ''));
  if (!isPluginType(raw.type)) {
    throw new Error(i18n.t('errors.pluginTypeInvalid'));
  }
  const format = raw.format === PLUGIN_FORMAT ? PLUGIN_FORMAT : PLUGIN_FORMAT;
  if (raw.format && raw.format !== PLUGIN_FORMAT) {
    throw new Error(i18n.t('errors.pluginFormatInvalid'));
  }
  return {
    format,
    formatVersion: typeof raw.formatVersion === 'number' ? raw.formatVersion : PLUGIN_FORMAT_VERSION,
    id,
    name: String(raw.name ?? id).trim() || id,
    version: String(raw.version ?? '1.0.0'),
    type: raw.type,
    hooks: parseHooks(raw.hooks),
    description: typeof raw.description === 'string' ? raw.description : undefined,
    author: typeof raw.author === 'string' ? raw.author : undefined,
    comptalMin: typeof raw.comptalMin === 'string' ? raw.comptalMin : undefined,
  };
}

function isAllowedPluginFile(name: string): boolean {
  const lower = name.toLowerCase().replace(/\\/g, '/').split('/').pop() ?? name;
  if (ALLOWED_NAMES.has(lower)) return true;
  const dot = lower.lastIndexOf('.');
  if (dot < 0) return false;
  return ALLOWED_PLUGIN_FILES.has(lower.slice(dot));
}

function rejectUnsafeRel(rel: string): void {
  const normalized = rel.replace(/\\/g, '/');
  if (normalized.includes('..') || normalized.startsWith('/') || /^[a-z]:/i.test(normalized)) {
    throw new Error(i18n.t('errors.unsafePath'));
  }
}

async function readJsonFile(rel: string): Promise<unknown> {
  rejectUnsafeRel(rel);
  const text = await tauriBridge.readTextFile(rel);
  return JSON.parse(text) as unknown;
}

async function findManifestRel(rootRel: string, depth = 0): Promise<string | null> {
  rejectUnsafeRel(rootRel);
  const direct = `${rootRel}/manifest.json`;
  if (await tauriBridge.pathExists(direct)) return direct;
  if (depth >= 2) return null;
  const entries = await tauriBridge.readDir(rootRel);
  for (const entry of entries) {
    if (!entry.isDir) continue;
    if (entry.name.startsWith('.') || entry.name === '__MACOSX') continue;
    const nested = await findManifestRel(`${rootRel}/${entry.name}`, depth + 1);
    if (nested) return nested;
  }
  return null;
}

async function assertPluginTreeSafe(dirRel: string): Promise<void> {
  const entries = await tauriBridge.readDir(dirRel);
  for (const entry of entries) {
    const child = `${dirRel}/${entry.name}`;
    rejectUnsafeRel(child);
    if (entry.isDir) {
      if (entry.name === '__MACOSX' || entry.name.startsWith('.')) continue;
      await assertPluginTreeSafe(child);
      continue;
    }
    if (!isAllowedPluginFile(entry.name)) {
      throw new Error(i18n.t('errors.pluginFileRejected', { name: entry.name }));
    }
  }
}

async function loadPayloads(dirRel: string, type: PluginType): Promise<PluginPayloads> {
  const payloads: PluginPayloads = {};
  const tryRead = async (name: string): Promise<unknown | null> => {
    const rel = `${dirRel}/${name}`;
    if (!(await tauriBridge.pathExists(rel))) return null;
    return readJsonFile(rel);
  };
  if (type === 'category_pack') {
    const raw = (await tryRead('categories.json')) ?? (await tryRead('payload.json'));
    if (raw && isPlainObject(raw) && Array.isArray(raw.categories)) {
      payloads.categoryPack = raw as unknown as PluginCategoryPack;
    }
  }
  if (type === 'mention_pack') {
    const raw = (await tryRead('mentions.json')) ?? (await tryRead('payload.json'));
    if (raw && isPlainObject(raw) && Array.isArray(raw.mentions)) {
      payloads.mentionPack = raw as unknown as PluginMentionPack;
    }
  }
  if (type === 'export_mapper') {
    const raw = (await tryRead('export.json')) ?? (await tryRead('payload.json'));
    if (raw && isPlainObject(raw) && Array.isArray(raw.columns)) {
      payloads.exportMapper = raw as unknown as PluginExportMapper;
    }
  }
  if (type === 'import_mapper') {
    const raw = (await tryRead('import.json')) ?? (await tryRead('payload.json'));
    if (raw && isPlainObject(raw)) {
      payloads.importMapper = raw as unknown as PluginImportMapper;
    }
  }
  return payloads;
}

async function listState(): Promise<Map<string, PluginStateRow>> {
  const rows = await Db.select<PluginStateRow>('SELECT plugin_id, enabled, applied_at FROM plugin_state');
  return new Map(rows.map((row) => [row.plugin_id, row]));
}

async function setState(pluginId: string, enabled: boolean, appliedAt?: string): Promise<void> {
  await Db.execute(
    `INSERT INTO plugin_state (plugin_id, enabled, applied_at) VALUES (?, ?, ?)
     ON CONFLICT(plugin_id) DO UPDATE SET enabled = excluded.enabled, applied_at = excluded.applied_at`,
    [pluginId, enabled ? 1 : 0, appliedAt ?? null]
  );
}

function asExportField(value: string): ExportCsvField | null {
  return (EXPORT_CSV_FIELDS as readonly string[]).includes(value) ? (value as ExportCsvField) : null;
}

export const PluginService = {
  async listInstalled(): Promise<InstalledPlugin[]> {
    return withLog('PluginService.listInstalled', async () => {
      await tauriBridge.mkdirs(PLUGINS_DIR);
      const entries = await tauriBridge.readDir(PLUGINS_DIR);
      const state = Db.isOpen ? await listState() : new Map<string, PluginStateRow>();
      const plugins: InstalledPlugin[] = [];
      for (const entry of entries) {
        if (!entry.isDir || entry.name.startsWith('_') || entry.name.startsWith('.')) continue;
        const relDir = `${PLUGINS_DIR}/${entry.name}`;
        try {
          const raw = await readJsonFile(`${relDir}/manifest.json`);
          const manifest = parseManifest(raw);
          if (manifest.id !== entry.name) {
            Logger.warn('PluginService.listInstalled', 'id dossier ≠ manifest.id', {
              dir: entry.name,
              id: manifest.id,
            });
          }
          const row = state.get(manifest.id);
          plugins.push({
            manifest,
            enabled: row?.enabled === 1,
            appliedAt: row?.applied_at ?? undefined,
            relDir,
          });
        } catch (err) {
          Logger.warn('PluginService.listInstalled', 'Mod ignoré', { dir: entry.name, err: String(err) });
        }
      }
      plugins.sort((a, b) => a.manifest.name.localeCompare(b.manifest.name, 'fr'));
      return plugins;
    });
  },

  async importZip(): Promise<PluginManifest | null> {
    return withLog('PluginService.importZip', async () => {
      const zipAbs = await open({
        multiple: false,
        filters: [{ name: 'ZIP', extensions: ['zip'] }],
      });
      if (typeof zipAbs !== 'string') return null;
      await tauriBridge.mkdirs(PLUGINS_DIR);
      const staging = `${PLUGINS_DIR}/_staging_${Date.now()}`;
      await tauriBridge.unzipTo(zipAbs, staging);
      try {
        const manifestRel = await findManifestRel(staging);
        if (!manifestRel) throw new Error(i18n.t('errors.pluginManifestMissing'));
        const pluginRoot = manifestRel.replace(/\/manifest\.json$/i, '');
        await assertPluginTreeSafe(pluginRoot);
        const manifest = parseManifest(await readJsonFile(manifestRel));
        const dest = `${PLUGINS_DIR}/${manifest.id}`;
        if (await tauriBridge.pathExists(dest)) {
          await tauriBridge.deleteDir(dest);
        }
        await tauriBridge.copyDir(pluginRoot, dest);
        await assertPluginTreeSafe(dest);
        Logger.info('PluginService.importZip', 'Mod importé', { id: manifest.id, type: manifest.type });
        return manifest;
      } finally {
        await tauriBridge.deleteDir(staging).catch(() => undefined);
      }
    });
  },

  async remove(pluginId: string): Promise<void> {
    return withLog('PluginService.remove', async () => {
      const id = assertSafePluginId(pluginId);
      await tauriBridge.deleteDir(`${PLUGINS_DIR}/${id}`);
      if (Db.isOpen) {
        await Db.execute('DELETE FROM plugin_state WHERE plugin_id = ?', [id]);
      }
    }, { data: { pluginId } });
  },

  async setEnabled(pluginId: string, enabled: boolean): Promise<void> {
    return withLog('PluginService.setEnabled', async () => {
      const id = assertSafePluginId(pluginId);
      if (!Db.isOpen) throw new Error(i18n.t('errors.dbNotOpen'));
      let appliedAt: string | undefined;
      if (enabled) {
        appliedAt = await this.apply(id);
      }
      await setState(id, enabled, appliedAt);
    }, { data: { pluginId, enabled } });
  },

  async apply(pluginId: string): Promise<string> {
    return withLog('PluginService.apply', async () => {
      const id = assertSafePluginId(pluginId);
      const relDir = `${PLUGINS_DIR}/${id}`;
      const manifest = parseManifest(await readJsonFile(`${relDir}/manifest.json`));
      const payloads = await loadPayloads(relDir, manifest.type);
      if (manifest.type === 'category_pack' && payloads.categoryPack) {
        await applyCategoryPack(payloads.categoryPack);
      }
      if (manifest.type === 'mention_pack' && payloads.mentionPack) {
        await applyMentionPack(payloads.mentionPack);
      }
      if (manifest.type === 'import_mapper' && payloads.importMapper) {
        await applyImportMapper(manifest, payloads.importMapper);
      }
      const appliedAt = new Date().toISOString();
      await setState(id, true, appliedAt);
      return appliedAt;
    }, { data: { pluginId } });
  },

  async loadPayloads(pluginId: string): Promise<{ manifest: PluginManifest; payloads: PluginPayloads }> {
    const id = assertSafePluginId(pluginId);
    const relDir = `${PLUGINS_DIR}/${id}`;
    const manifest = parseManifest(await readJsonFile(`${relDir}/manifest.json`));
    const payloads = await loadPayloads(relDir, manifest.type);
    return { manifest, payloads };
  },

  async getActiveExportMapper(): Promise<PluginExportMapper | null> {
    return withLog('PluginService.getActiveExportMapper', async () => {
      if (!Db.isOpen) return null;
      const plugins = await this.listInstalled();
      const active = plugins.find((p) => p.enabled && p.manifest.type === 'export_mapper');
      if (!active) return null;
      const { payloads } = await this.loadPayloads(active.manifest.id);
      const mapper = payloads.exportMapper;
      if (!mapper?.columns?.length) return null;
      const columns = mapper.columns
        .map((col) => {
          const field = asExportField(String(col.field));
          if (!field || !col.header) return null;
          return { header: col.header, field };
        })
        .filter((col): col is { header: string; field: ExportCsvField } => Boolean(col));
      if (columns.length === 0) return null;
      return { delimiter: mapper.delimiter === ',' || mapper.delimiter === '\t' ? mapper.delimiter : ';', columns };
    });
  },
};

async function applyCategoryPack(pack: PluginCategoryPack): Promise<void> {
  const existingGroups = await ConfigService.listCategoryGroups();
  const groupIds = new Map(existingGroups.map((g) => [g.name.toLowerCase(), g.id]));
  for (const group of pack.groups ?? []) {
    const name = group.name.trim();
    if (!name || groupIds.has(name.toLowerCase())) continue;
    const id = await ConfigService.createCategoryGroup({ name, color: group.color || '#64748b' });
    groupIds.set(name.toLowerCase(), id);
  }
  const existing = await ConfigService.listCategories();
  const known = new Set(existing.map((c) => c.code.toUpperCase()));
  for (const category of pack.categories ?? []) {
    const code = category.code.trim().toUpperCase();
    if (!code || known.has(code)) continue;
    const groupId = category.group ? groupIds.get(category.group.toLowerCase()) ?? null : null;
    await ConfigService.createCategory({
      code,
      name: category.name.trim() || code,
      color: category.color || '#94a3b8',
      groupId,
    });
    known.add(code);
  }
}

async function applyMentionPack(pack: PluginMentionPack): Promise<void> {
  const current = await LegalMentionsService.loadMentions();
  const byId = new Map(current.map((m) => [m.id, m]));
  for (const item of pack.mentions ?? []) {
    const id = item.id?.trim() || `plugin-${item.label.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}`;
    const mention: MentionLegale = {
      id,
      type: 'custom',
      label: item.label,
      content: item.content,
      category: item.category ?? 'autre',
      enabled: true,
    };
    byId.set(id, mention);
  }
  await LegalMentionsService.saveMentions(Array.from(byId.values()));
}

async function applyImportMapper(manifest: PluginManifest, mapper: PluginImportMapper): Promise<void> {
  const templates = await ImportTemplateService.list();
  const name = (mapper.name || manifest.name).trim();
  if (templates.some((t) => t.name === name)) return;
  const allowed = new Set<ColumnRole>([
    'date',
    'dateValue',
    'libelle',
    'debit',
    'credit',
    'debitCredit',
    'balance',
    'category',
    'account',
    'ignore',
  ]);
  const columnRoles: ColumnRolesByHeader = {};
  for (const [key, value] of Object.entries(mapper.columnRoles ?? {})) {
    if (typeof value === 'string' && allowed.has(value as ColumnRole)) {
      columnRoles[key] = value as ColumnRole;
    }
  }
  await ImportTemplateService.create({
    name,
    accountId: null,
    initialBalance: null,
    columnRoles,
  });
}
