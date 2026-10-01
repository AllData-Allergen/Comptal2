import { Db } from './db';

const JSON_STORE_TABLES = new Set([
  'color_palettes',
  'invoice_emetteur',
  'invoice_settings',
  'association_config',
  'micro_enterprise_config',
]);

function assertJsonTable(table: string): string {
  if (!JSON_STORE_TABLES.has(table)) {
    throw new Error('Table JSON non autorisée');
  }
  return table;
}

export async function loadSingletonJson<T>(table: string): Promise<T | null> {
  const safe = assertJsonTable(table);
  const rows = await Db.select<{ payload: string }>(`SELECT payload FROM ${safe} WHERE id = 1`);
  if (!rows[0]) return null;
  return JSON.parse(rows[0].payload) as T;
}

export async function saveSingletonJson(table: string, payload: unknown): Promise<void> {
  const safe = assertJsonTable(table);
  const json = JSON.stringify(payload);
  await Db.execute(`INSERT INTO ${safe} (id, payload) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET payload = excluded.payload`, [
    json,
  ]);
}

export async function loadAllJson<T>(table: string): Promise<Array<{ id: string; payload: T }>> {
  const safe = assertJsonTable(table);
  const rows = await Db.select<{ id: string; payload: string }>(`SELECT id, payload FROM ${safe}`);
  return rows.map((r) => ({ id: r.id, payload: JSON.parse(r.payload) as T }));
}

export async function upsertJsonRow(table: string, id: string, payload: unknown, extraSql?: string, extraParams?: unknown[]): Promise<void> {
  assertJsonTable(table);
  const json = JSON.stringify(payload);
  if (extraSql) {
    await Db.execute(extraSql, extraParams);
    return;
  }
  const safe = assertJsonTable(table);
  await Db.execute(
    `INSERT INTO ${safe} (id, payload) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET payload = excluded.payload`,
    [id, json]
  );
}

export async function deleteJsonRow(table: string, id: string): Promise<void> {
  const safe = assertJsonTable(table);
  await Db.execute(`DELETE FROM ${safe} WHERE id = ?`, [id]);
}

export async function replaceAllJson(
  table: string,
  rows: Array<{ id: string; payload: unknown; extra?: Record<string, unknown> }>
): Promise<void> {
  const safe = assertJsonTable(table);
  await Db.execute(`DELETE FROM ${safe}`);
  for (const row of rows) {
    await Db.execute(`INSERT INTO ${safe} (id, payload) VALUES (?, ?)`, [row.id, JSON.stringify(row.payload)]);
  }
}
