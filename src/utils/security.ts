import i18n from '../i18n/config';

export const PROFILE_ID_RE = /^[A-Za-z0-9_-]+$/;
export const PLUGIN_ID_RE = /^[a-z0-9][a-z0-9._-]{1,63}$/;
export const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;
export const MAX_IMPORT_BYTES = 20 * 1024 * 1024;
export const MAX_IMPORT_SHEETS = 25;
export const MAX_IMPORT_ROWS = 80_000;
export const MAX_TEMPLATE_ROLE_KEYS = 50;
export const MAX_PROJECTION_DAYS = 5 * 366;

export function assertSafeProfileId(id: string): string {
  if (!PROFILE_ID_RE.test(id)) {
    throw new Error(i18n.t('errors.invalidProfileId'));
  }
  return id;
}

export function assertSafePluginId(id: string): string {
  if (!PLUGIN_ID_RE.test(id)) {
    throw new Error(i18n.t('errors.invalidPluginId'));
  }
  return id;
}

export function escapeLike(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isIsoDate(value: string): boolean {
  const match = ISO_DATE_RE.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const dt = new Date(Date.UTC(year, month - 1, day));
  return (
    dt.getUTCFullYear() === year && dt.getUTCMonth() === month - 1 && dt.getUTCDate() === day
  );
}

export function assertIsoDate(value: string): string {
  if (!isIsoDate(value)) {
    throw new Error(i18n.t('errors.invalidDate'));
  }
  return value;
}

export function daysInclusive(start: string, end: string): number {
  const startMs = Date.parse(`${start}T00:00:00Z`);
  const endMs = Date.parse(`${end}T00:00:00Z`);
  return Math.floor((endMs - startMs) / 86_400_000) + 1;
}

export function neutralizeFormula(value: string): string {
  const text = String(value ?? '');
  if (/^[=+\-@\t]/.test(text)) {
    return `'${text}`;
  }
  return text;
}

export function csvQuote(value: string): string {
  const safe = neutralizeFormula(value);
  return `"${safe.replace(/"/g, '""')}"`;
}

export function usablePdfImage(value?: string | null): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (/^data:image\/png;base64,/i.test(trimmed)) return trimmed;
  if (/^data:image\/jpe?g;base64,/i.test(trimmed)) return trimmed;
  if (/^data:image\/webp;base64,/i.test(trimmed)) return trimmed;
  return undefined;
}

export function detectAllowedUserFile(bytes: Uint8Array): { mime: string } | null {
  if (bytes.length >= 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
    return { mime: 'application/pdf' };
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return { mime: 'image/png' };
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { mime: 'image/jpeg' };
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return { mime: 'image/webp' };
  }
  // Outlook .msg (OLE Compound File)
  if (
    bytes.length >= 4 &&
    bytes[0] === 0xd0 &&
    bytes[1] === 0xcf &&
    bytes[2] === 0x11 &&
    bytes[3] === 0xe0
  ) {
    return { mime: 'application/vnd.ms-outlook' };
  }
  // .eml / message RFC822 — en-têtes texte courants
  if (looksLikeEmailMessage(bytes)) {
    return { mime: 'message/rfc822' };
  }
  return null;
}

function looksLikeEmailMessage(bytes: Uint8Array): boolean {
  const sampleLen = Math.min(bytes.length, 512);
  if (sampleLen < 8) return false;
  let text = '';
  for (let i = 0; i < sampleLen; i += 1) {
    const b = bytes[i]!;
    if (b === 0) return false;
    if (b < 9 || (b > 13 && b < 32)) return false;
    text += String.fromCharCode(b);
  }
  const head = text.toLowerCase();
  return (
    head.startsWith('from:') ||
    head.startsWith('received:') ||
    head.startsWith('return-path:') ||
    head.startsWith('mime-version:') ||
    head.startsWith('date:') ||
    head.startsWith('subject:') ||
    head.includes('\nfrom:') ||
    head.includes('\nreceived:')
  );
}

export function assertProfileRel(rel: string, profileId: string): string {
  assertSafeProfileId(profileId);
  const normalized = rel.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\/+/, '');
  const parts = normalized.split('/');
  if (!normalized || parts.some((part) => part === '' || part === '.' || part === '..')) {
    throw new Error(i18n.t('errors.unsafePath'));
  }
  const prefix = `profils/${profileId}/`;
  if (!normalized.startsWith(prefix) || normalized.length <= prefix.length) {
    throw new Error(i18n.t('errors.unsafePath'));
  }
  return normalized;
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export function isLightEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}
