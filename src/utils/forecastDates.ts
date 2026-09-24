import { addYears, isValid, parseISO, startOfDay } from 'date-fns';
import { isIsoDate } from './security';
import { parseDateWithMultipleFormats, toIsoDate } from './dateFormats';

export type ForecastDateIssue =
  | 'empty_start'
  | 'empty_end'
  | 'invalid_start'
  | 'invalid_end'
  | 'start_after_end';

export interface SanitizedForecastRange {
  startDate: string;
  endDate: string;
  issues: ForecastDateIssue[];
  /** Plage sûre pour projection / rendu (jamais de dates invalides). */
  usable: boolean;
}

/** Plage par défaut : aujourd’hui → +1 an (ISO). */
export function defaultForecastRange(from: Date = new Date()): { start: string; end: string } {
  const start = startOfDay(from);
  return { start: toIsoDate(start), end: toIsoDate(addYears(start, 1)) };
}

/**
 * Parse défensif d’une date prévisionnelle (ISO strict, formats bancaires, Date).
 * Retourne null si vide / illisible / calendrier invalide (ex. 2026-02-31).
 */
export function parseForecastIso(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  if (raw instanceof Date) {
    return isValid(raw) ? toIsoDate(startOfDay(raw)) : null;
  }
  const text = String(raw).trim();
  if (!text) return null;
  if (isIsoDate(text)) return text;
  const parsed = parseDateWithMultipleFormats(text);
  if (!parsed || !isValid(parsed)) return null;
  const iso = toIsoDate(startOfDay(parsed));
  return isIsoDate(iso) ? iso : null;
}

/** Convertit une chaîne ISO en Date locale (début de jour), ou null. */
export function forecastIsoToDate(iso: string | null | undefined): Date | null {
  if (!iso || !isIsoDate(iso)) return null;
  const d = startOfDay(parseISO(iso));
  return isValid(d) ? d : null;
}

/**
 * Normalise début/fin projet : parsing, fallback, correction douce si début > fin (échange).
 * Ne jette jamais ; `usable` est true dès qu’on a obtenu une plage ISO cohérente.
 */
export function sanitizeForecastRange(
  startRaw: unknown,
  endRaw: unknown,
  fallback?: { start: string; end: string }
): SanitizedForecastRange {
  const fb = fallback ?? defaultForecastRange();
  const issues: ForecastDateIssue[] = [];

  const startText = startRaw === null || startRaw === undefined ? '' : String(startRaw).trim();
  const endText = endRaw === null || endRaw === undefined ? '' : String(endRaw).trim();

  let startDate = parseForecastIso(startRaw);
  let endDate = parseForecastIso(endRaw);

  if (!startDate) {
    issues.push(startText ? 'invalid_start' : 'empty_start');
    startDate = parseForecastIso(fb.start) ?? defaultForecastRange().start;
  }
  if (!endDate) {
    issues.push(endText ? 'invalid_end' : 'empty_end');
    endDate = parseForecastIso(fb.end) ?? defaultForecastRange().end;
  }

  if (startDate > endDate) {
    issues.push('start_after_end');
    const swap = startDate;
    startDate = endDate;
    endDate = swap;
  }

  return { startDate, endDate, issues, usable: true };
}

/**
 * Date de début de ligne : ISO valide ou null (vide autorisé → null pour laisser le fallback appelant).
 * Chaîne non vide mais illisible → null + issue `invalid_start`.
 */
export function sanitizeLineStartDate(
  raw: unknown,
  fallbackIso?: string | null
): { value: string | null; issue: ForecastDateIssue | null } {
  const text = raw === null || raw === undefined ? '' : String(raw).trim();
  if (!text) {
    const fb = fallbackIso ? parseForecastIso(fallbackIso) : null;
    return { value: fb, issue: null };
  }
  const parsed = parseForecastIso(text);
  if (!parsed) return { value: null, issue: 'invalid_start' };
  return { value: parsed, issue: null };
}

/**
 * Date de fin de ligne : vide → null (illimité) ; invalide → null + issue.
 * Si fin < début (tous deux fournis), issue `start_after_end` et value null (ignore la fin).
 */
export function sanitizeLineEndDate(
  raw: unknown,
  startIso?: string | null
): { value: string | null; issue: ForecastDateIssue | null } {
  const text = raw === null || raw === undefined ? '' : String(raw).trim();
  if (!text) return { value: null, issue: null };
  const parsed = parseForecastIso(text);
  if (!parsed) return { value: null, issue: 'invalid_end' };
  const start = startIso ? parseForecastIso(startIso) : null;
  if (start && parsed < start) return { value: null, issue: 'start_after_end' };
  return { value: parsed, issue: null };
}
