import i18n from '../i18n/config';
import { RegisterDocumentType, RegisterSnapshotRow } from '../types/register';
import { REGISTER_TYPE_META } from '../constants/registerTypes';

const STATUS_KEYS: Record<string, string> = {
  cancelled: 'association.annule',
  Annulé: 'association.annule',
  active: 'register.status.active',
  Actif: 'register.status.active',
  actif: 'amortissement.statuses.actif',
  cede: 'amortissement.statuses.cede',
  mis_au_rebut: 'amortissement.statuses.mis_au_rebut',
  anonymous: 'register.status.anonymous',
  Anonyme: 'register.status.anonymous',
  company: 'register.status.company',
  Entreprise: 'register.status.company',
  individual: 'register.status.individual',
  Particulier: 'register.status.individual',
};

const LEGACY_LABEL_KEYS: Record<string, string> = {
  'Particuliers (art. 200 CGI)': 'register.snapshot.particuliersCgi',
  'Entreprises (art. 238 bis CGI)': 'register.snapshot.entreprisesCgi',
  'Dons anonymes (non nominatifs)': 'register.snapshot.anonymousDonations',
  Numéraire: 'register.snapshot.cash',
  'Dons en nature': 'register.snapshot.inKind',
  'Mécénat de compétences': 'register.snapshot.skills',
  'Reçus fiscaux actifs': 'register.snapshot.activeReceipts',
  'Reçus annulés (conservés)': 'register.snapshot.cancelledReceipts',
};

const LEGACY_DETAIL_KEYS: Record<string, string> = {
  'Sans reçu fiscal': 'register.snapshot.noTaxReceipt',
  'Contact inconnu': 'register.unknownContact',
  'Don anonyme': 'register.anonymousDonor',
  Donateur: 'register.donorFallback',
};

const LEGACY_EXTRA_KEYS: Record<string, string> = {
  'Espèces, chèque, virement, carte': 'register.snapshot.cashExtra',
  'Valorisation communiquée par le donateur': 'register.snapshot.inKindExtra',
  'Mise à disposition de personnel': 'register.snapshot.skillsExtra',
};

const NATURE_PHRASES: Array<[string, string]> = [
  ['Mécénat de compétences', 'register.nature.skills'],
  ['Don en nature', 'register.nature.inKind'],
  ['Numéraire', 'register.nature.numeraire'],
];

function tr(key: string, options?: Record<string, unknown>): string {
  return String(i18n.t(key, options));
}

export function registerDateLocale(lang = i18n.language): string {
  if (lang.startsWith('en')) return 'en-GB';
  if (lang.startsWith('de')) return 'de-DE';
  return 'fr-FR';
}

export function formatRegisterDate(value: string, lang = i18n.language): string {
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
    return new Date(value).toLocaleDateString(registerDateLocale(lang));
  }
  return value;
}

export function registerTypeTitle(type: RegisterDocumentType): string {
  return tr(`register.types.${type}.title`, { defaultValue: REGISTER_TYPE_META[type].title });
}

export function registerTypeDescription(type: RegisterDocumentType): string {
  return tr(`register.types.${type}.description`, { defaultValue: REGISTER_TYPE_META[type].description });
}

export function registerTypeShortTitle(type: RegisterDocumentType): string {
  return tr(`register.types.${type}.shortTitle`, { defaultValue: REGISTER_TYPE_META[type].shortTitle });
}

export function registerStatusLabel(status?: string): string {
  if (!status) return '';
  const key = STATUS_KEYS[status];
  return key ? tr(key) : status;
}

function registerNatureLabel(nature: string): string {
  if (nature === 'nature') return tr('register.nature.inKind');
  if (nature === 'mecenat_competences') return tr('register.nature.skills');
  if (nature === 'numeraire' || !nature) return tr('register.nature.numeraire');
  return tr('register.nature.numeraire');
}

function parseExtraPayload(extra: string): Record<string, string> | null {
  if (!extra.startsWith('{')) return null;
  try {
    const parsed = JSON.parse(extra) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') return null;
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (value != null) out[key] = String(value);
    }
    return out;
  } catch {
    return null;
  }
}

function replaceNaturePhrases(value: string): string {
  let next = value;
  for (const [phrase, key] of NATURE_PHRASES) {
    if (next.includes(phrase)) next = next.split(phrase).join(tr(key));
  }
  return next;
}

export function registerRowLabel(row: RegisterSnapshotRow): string {
  if (row.labelKey) return tr(row.labelKey, { count: row.count });
  if (row.label === '__uncategorized__' || row.label === 'Non catégorisé') {
    return tr('register.uncategorized');
  }
  const mapped = LEGACY_LABEL_KEYS[row.label];
  if (mapped) return tr(mapped, { count: row.count });
  return formatRegisterDate(row.label);
}

export function registerRowDetail(row: RegisterSnapshotRow): string {
  if (row.detailKey) return tr(row.detailKey, { count: row.count });
  const detail = row.detail ?? '';
  if (!detail) return '';
  const mapped = LEGACY_DETAIL_KEYS[detail];
  if (mapped) return tr(mapped);
  const donors = /^(\d+) donateur\(s\)$/.exec(detail);
  if (donors) return tr('register.snapshot.donorCount', { count: Number(donors[1]) });
  const receipts = /^(\d+) reçu\(s\)$/.exec(detail);
  if (receipts) return tr('register.snapshot.receiptCount', { count: Number(receipts[1]) });
  return detail;
}

export function registerRowExtra(row: RegisterSnapshotRow): string {
  const extra = row.extra ?? '';
  if (row.extraKey === 'register.issuedLine') {
    const payload = parseExtraPayload(extra) ?? {};
    const nature = payload.nature ? ` · ${registerNatureLabel(payload.nature)}` : '';
    return `${tr('register.issuedPrefix')} ${formatRegisterDate(payload.date || '—')}${nature}`;
  }
  if (row.extraKey === 'register.donationExtra') {
    const payload = parseExtraPayload(extra) ?? {};
    const nature = registerNatureLabel(payload.nature || 'numeraire');
    const payment = payload.payment ? ` · ${payload.payment}` : '';
    const description = payload.description ? ` — ${payload.description}` : '';
    return `${nature}${payment}${description}`;
  }
  if (row.extraKey) return tr(row.extraKey);
  if (!extra) return '';
  const mapped = LEGACY_EXTRA_KEYS[extra];
  if (mapped) return tr(mapped);
  if (extra.startsWith('Émission ') || extra.startsWith('Issued ') || extra.startsWith('Ausstellung ')) {
    const cut = extra.indexOf(' ') + 1;
    return `${tr('register.issuedPrefix')} ${replaceNaturePhrases(extra.slice(cut))}`;
  }
  return replaceNaturePhrases(extra);
}
