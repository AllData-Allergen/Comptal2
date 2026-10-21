// Import CSV de transactions — aligne ImportService.transformRows + utils
// dateFormats / amounts / security de l'app (semantique identique).
import { HttpError } from './http.ts';

// ---------------------------------------------------------------------------
// Montants (aligne utils/amounts.ts)
// ---------------------------------------------------------------------------

/** Parse un montant FR/EN (espaces, virgule, euro). Chaine vide / invalide -> null. */
export function parseAmountOptional(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  const cleaned = trimmed.replace(/[\s\u00a0€]/g, '').replace(',', '.');
  if (!cleaned) return null;
  const value = parseFloat(cleaned);
  return Number.isFinite(value) ? value : null;
}

/** Parse un montant FR/EN. Chaine vide -> 0. */
export function parseAmount(raw: unknown): number {
  return parseAmountOptional(raw) ?? 0;
}

/** Neutralise une formule spreadsheet (=, +, -, @, tab en debut). */
export function neutralizeFormula(value: string): string {
  const text = String(value ?? '');
  if (/^[=+\-@\t]/.test(text)) {
    return `'${text}`;
  }
  return text;
}

// ---------------------------------------------------------------------------
// Dates (aligne utils/dateFormats.ts)
// ---------------------------------------------------------------------------

const EXCEL_SERIAL_MIN = 30000;
const EXCEL_SERIAL_MAX = 100000;

function excelSerialToIso(serial: number): string | null {
  if (serial < 1 || serial > EXCEL_SERIAL_MAX) return null;
  const ms = (serial - 25569) * 86400 * 1000;
  const date = new Date(ms);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function normalizeDate(raw: string): string {
  let s = raw.trim();
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1).trim();
  return s.replace(/[\u00A0\u202F\u2007]/g, ' ').replace(/\s+/g, ' ').trim();
}

function extractDatePart(s: string): string {
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const ymd = s.match(/^(\d{4}[./-]\d{1,2}[./-]\d{1,2})(?:\s|[Tt]|$)/);
  if (ymd?.[1]) return ymd[1];
  const dmy = s.match(/^(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})(?:\s|$)/);
  if (dmy?.[1]) return dmy[1];
  return s;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function buildIso(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  const yy = String(year).padStart(4, '0');
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/** Parse une date bancaire (ISO, serie Excel, dd/MM/yyyy, ...) -> 'yyyy-MM-dd' ou null. */
export function parseDateToIso(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) return null;
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === 'number') return excelSerialToIso(value);

  const strValue = normalizeDate(String(value));
  if (!strValue) return null;

  const cleaned = strValue.replace(/\s/g, '').replace(',', '.');
  if (/^-?\d+(\.\d+)?$/.test(cleaned)) {
    const num = parseFloat(cleaned);
    if (num >= EXCEL_SERIAL_MIN && num <= EXCEL_SERIAL_MAX) {
      const fromSerial = excelSerialToIso(num);
      if (fromSerial) return fromSerial;
    }
  }

  if (/^\d{4}-\d{2}-\d{2}/.test(strValue)) {
    const iso = buildIso(
      Number(strValue.slice(0, 4)),
      Number(strValue.slice(5, 7)),
      Number(strValue.slice(8, 10))
    );
    if (iso) return iso;
  }

  const dateText = extractDatePart(strValue);
  const parsed = parseDateText(dateText);
  if (parsed) return parsed;

  const native = new Date(strValue);
  return Number.isFinite(native.getTime()) ? native.toISOString().slice(0, 10) : null;
}

/**
 * Parse un texte de date selon les formats de DATE_FORMATS de l'app
 * (ordre identique : dd/MM/yyyy avant MM/dd/yyyy, yy < 69 -> 2000s).
 */
function parseDateText(text: string): string | null {
  const m = text.match(
    /^(\d{1,4})([./-])(\d{1,4})\2(\d{2,4})$/
  );
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[3]);
    const c = Number(m[4]);
    const sep = m[2];
    // Ordre de l'app : dd/MM/yyyy, d/M/yyyy, yyyy/MM/dd, MM/dd/yyyy, dd/MM/yy, d/M/yy, ...
    const candidates: Array<[number, number, number]> = [];
    if (a > 31) candidates.push([a, b, c]); // yyyy/M/d
    else {
      candidates.push([c > 31 ? c : expandYear(c), b, a]); // d/M/yyyy ou d/M/yy
      if (c > 31) candidates.push([c, a, b]); // MM/dd/yyyy (fallback)
      else candidates.push([expandYear(c), a, b]); // MM/dd/yy (fallback)
    }
    for (const [year, month, day] of candidates) {
      const iso = buildIso(year, month, day);
      if (iso) return iso;
    }
    return null;
  }
  // ddMMyyyy / yyyyMMdd
  const compact = text.match(/^(\d{8})$/);
  if (compact) {
    const digits = compact[1];
    if (!digits) return null;
    const dmy = buildIso(Number(digits.slice(4, 8)), Number(digits.slice(2, 4)), Number(digits.slice(0, 2)));
    if (dmy) return dmy;
    const ymd = buildIso(Number(digits.slice(0, 4)), Number(digits.slice(4, 6)), Number(digits.slice(6, 8)));
    if (ymd) return ymd;
  }
  return null;
}

function expandYear(yy: number): number {
  return yy < 69 ? 2000 + yy : 1900 + yy;
}

// ---------------------------------------------------------------------------
// CSV (delimiteur auto ou parametre, quotes, CRLF, BOM)
// ---------------------------------------------------------------------------

const DELIMITERS = [';', ',', '\t', '|'] as const;

/** Parse un CSV en lignes de cellules (quotes "", CRLF, BOM retires). */
export function parseCsv(text: string, delimiter?: string): string[][] {
  let data = text;
  if (data.charCodeAt(0) === 0xfeff) data = data.slice(1);
  const sep = delimiter ?? detectDelimiter(data);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < data.length; i++) {
    const ch = data[i];
    if (inQuotes) {
      if (ch === '"') {
        if (data[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === sep) {
      row.push(cell);
      cell = '';
    } else if (ch === '\r') {
      if (data[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }
  row.push(cell);
  rows.push(row);
  return rows;
}

function detectDelimiter(data: string): string {
  const firstLine = data.split(/\r?\n/, 1)[0] ?? '';
  let best = ',';
  let bestCount = -1;
  for (const d of DELIMITERS) {
    const count = firstLine.split(d).length - 1;
    if (count > bestCount) {
      best = d;
      bestCount = count;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Transform (aligne ImportService.transformRows)
// ---------------------------------------------------------------------------

export interface ImportMapping {
  dateColumnIndex: number;
  dateValueColumnIndex?: number;
  libelleColumnIndex: number;
  debitColumnIndex: number;
  creditColumnIndex: number;
  categoryColumnIndex?: number;
  accountColumnIndex?: number;
}

export interface PreviewRow {
  date: string;
  valueDate: string;
  debit: number;
  credit: number;
  label: string;
  categoryRaw: string | null;
  accountRaw: string | null;
}

function cell(row: unknown[], index: number): unknown {
  return row[index];
}

/** Transforme les lignes CSV brutes en rows pretes a inserer (semantique app). */
export function transformRows(rows: unknown[][], mapping: ImportMapping): PreviewRow[] {
  const isSingle = mapping.debitColumnIndex === mapping.creditColumnIndex;
  const result: PreviewRow[] = [];

  for (const row of rows) {
    if (!row || row.length === 0) continue;
    const date = parseDateToIso(cell(row, mapping.dateColumnIndex));
    if (!date) continue;
    const valueDateRaw =
      mapping.dateValueColumnIndex !== undefined
        ? parseDateToIso(cell(row, mapping.dateValueColumnIndex))
        : date;
    const valueDate = valueDateRaw ?? date;
    let debit = 0;
    let credit = 0;
    if (isSingle) {
      const amount = parseAmount(cell(row, mapping.debitColumnIndex));
      if (amount < 0) debit = amount;
      else if (amount > 0) credit = amount;
    } else {
      debit = parseAmount(cell(row, mapping.debitColumnIndex));
      credit = parseAmount(cell(row, mapping.creditColumnIndex));
      if (debit > 0) debit = -debit;
      if (credit < 0) credit = Math.abs(credit);
    }
    result.push({
      date,
      valueDate,
      debit: Math.round(debit * 100) / 100,
      credit: Math.round(credit * 100) / 100,
      label: neutralizeFormula(String(cell(row, mapping.libelleColumnIndex) ?? '').trim()),
      categoryRaw:
        mapping.categoryColumnIndex !== undefined
          ? neutralizeFormula(String(cell(row, mapping.categoryColumnIndex) ?? '').trim()) || null
          : null,
      accountRaw:
        mapping.accountColumnIndex !== undefined
          ? neutralizeFormula(String(cell(row, mapping.accountColumnIndex) ?? '').trim()) || null
          : null,
    });
  }

  result.sort((a, b) => a.date.localeCompare(b.date));
  return result;
}

/** Valide le mapping d'import (indices >= 0, date + libelle + montant requis). */
export function parseMapping(raw: unknown): ImportMapping {
  if (typeof raw !== 'object' || raw === null) {
    throw new HttpError(422, "Champ 'mapping' requis (objet)");
  }
  const m = raw as Record<string, unknown>;
  const intField = (field: string): number => {
    if (!(field in m) || m[field] === undefined) {
      throw new HttpError(422, `Champ 'mapping.${field}' requis (entier >= 0)`);
    }
    const value = m[field];
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
      throw new HttpError(422, `Champ 'mapping.${field}' doit etre un entier >= 0`);
    }
    return value;
  };
  const intFieldOpt = (field: string): number | undefined => {
    if (!(field in m) || m[field] === undefined) return undefined;
    const value = m[field];
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
      throw new HttpError(422, `Champ 'mapping.${field}' doit etre un entier >= 0`);
    }
    return value;
  };
  return {
    dateColumnIndex: intField('dateColumnIndex'),
    dateValueColumnIndex: intFieldOpt('dateValueColumnIndex'),
    libelleColumnIndex: intField('libelleColumnIndex'),
    debitColumnIndex: intField('debitColumnIndex'),
    creditColumnIndex: intField('creditColumnIndex'),
    categoryColumnIndex: intFieldOpt('categoryColumnIndex'),
    accountColumnIndex: intFieldOpt('accountColumnIndex'),
  };
}
