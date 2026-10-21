// Validation des entrees de l'API agent — stricte, avant toute ecriture.
import { HttpError } from './http.ts';

export function requireString(
  body: Record<string, unknown>,
  field: string,
  opts: { max?: number; min?: number } = {}
): string {
  const value = body[field];
  if (typeof value !== 'string') {
    throw new HttpError(422, `Champ '${field}' requis (chaine)`);
  }
  const trimmed = value.trim();
  const min = opts.min ?? 1;
  if (trimmed.length < min || trimmed.length > (opts.max ?? 2000)) {
    throw new HttpError(422, `Champ '${field}' : longueur invalide (1..${opts.max ?? 2000})`);
  }
  return trimmed;
}

export function optionalString(
  body: Record<string, unknown>,
  field: string,
  opts: { max?: number } = {}
): string | undefined {
  if (!(field in body)) return undefined;
  const value = body[field];
  if (value === null) return null as unknown as string;
  if (typeof value !== 'string') {
    throw new HttpError(422, `Champ '${field}' doit etre une chaine`);
  }
  if (value.length > (opts.max ?? 2000)) {
    throw new HttpError(422, `Champ '${field}' trop long (max ${opts.max ?? 2000})`);
  }
  return value;
}

export function requireNumber(
  body: Record<string, unknown>,
  field: string,
  opts: { min?: number; max?: number } = {}
): number {
  const value = body[field];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new HttpError(422, `Champ '${field}' requis (nombre fini)`);
  }
  if (opts.min !== undefined && value < opts.min) {
    throw new HttpError(422, `Champ '${field}' doit etre >= ${opts.min}`);
  }
  if (opts.max !== undefined && value > opts.max) {
    throw new HttpError(422, `Champ '${field}' doit etre <= ${opts.max}`);
  }
  return value;
}

export function optionalNumber(
  body: Record<string, unknown>,
  field: string,
  opts: { min?: number; max?: number } = {}
): number | undefined {
  if (!(field in body)) return undefined;
  if (body[field] === null) return null as unknown as number;
  return requireNumber(body, field, opts);
}

/** Arrondi monetaire 2 decimales (aligne sur persistMoney de l'app). */
export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Date ISO stricte YYYY-MM-DD (aligne sur normalizePersistDate de l'app). */
export function validateIsoDate(value: string, field: string): string {
  if (!ISO_DATE.test(value)) {
    throw new HttpError(422, `Champ '${field}' doit etre une date ISO YYYY-MM-DD`);
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new HttpError(422, `Champ '${field}' : date invalide (${value})`);
  }
  return value;
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export function validateHexColor(value: string, field: string): string {
  if (!HEX_COLOR.test(value)) {
    throw new HttpError(422, `Champ '${field}' doit etre une couleur hex #RRGGBB`);
  }
  return value;
}

export function requireIdParam(params: Record<string, string>, name: string): number {
  const raw = params[name];
  const id = Number.parseInt(raw ?? '', 10);
  if (!Number.isInteger(id) || id < 1) {
    throw new HttpError(400, `Parametre '${name}' invalide`);
  }
  return id;
}

export function intQuery(
  query: URLSearchParams,
  name: string,
  opts: { def: number; min: number; max: number }
): number {
  const raw = query.get(name);
  if (raw === null || raw === '') return opts.def;
  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value < opts.min || value > opts.max) {
    throw new HttpError(400, `Parametre '${name}' invalide (${opts.min}..${opts.max})`);
  }
  return value;
}

export function boolQuery(query: URLSearchParams, name: string): boolean {
  const raw = query.get(name);
  return raw === 'true' || raw === '1';
}

/** Liste de chaines depuis un parametre CSV (ex. category_codes=ALIM,LOIS). Vide = absent. */
export function csvQuery(query: URLSearchParams, name: string, opts: { maxItems: number; maxLen: number }): string[] {
  const raw = query.get(name);
  if (raw === null || raw.trim() === '') return [];
  const items = raw
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item !== '');
  if (items.length > opts.maxItems) {
    throw new HttpError(400, `Parametre '${name}' : trop d'elements (max ${opts.maxItems})`);
  }
  for (const item of items) {
    if (item.length > opts.maxLen) {
      throw new HttpError(400, `Parametre '${name}' : element trop long (max ${opts.maxLen})`);
    }
  }
  return items;
}

/** Liste d'entiers depuis un parametre CSV (ex. account_ids=1,2). Vide = absent. */
export function csvIntQuery(query: URLSearchParams, name: string, opts: { maxItems: number; min: number; max: number }): number[] {
  const raw = query.get(name);
  if (raw === null || raw.trim() === '') return [];
  const items: number[] = [];
  for (const part of raw.split(',')) {
    const value = Number.parseInt(part.trim(), 10);
    if (!Number.isInteger(value) || value < opts.min || value > opts.max) {
      throw new HttpError(400, `Parametre '${name}' invalide (entiers ${opts.min}..${opts.max})`);
    }
    items.push(value);
  }
  if (items.length > opts.maxItems) {
    throw new HttpError(400, `Parametre '${name}' : trop d'elements (max ${opts.maxItems})`);
  }
  return items;
}
