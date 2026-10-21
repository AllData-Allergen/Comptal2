/**
 * Logique facturation alignee sur Comptal2.1/src/services/InvoiceService.ts
 * (calculateLineHT / calculateTotals) et types/invoice.ts. Le payload stocke
 * dans les tables devis/factures est l'objet Devis/Facture de l'app (camelCase),
 * pour que l'application puisse relire les documents crees par l'agent.
 */
import type { DatabaseSync } from 'node:sqlite';
import { HttpError } from './http.ts';
import { roundMoney, validateIsoDate } from './validate.ts';

export interface PosteInput {
  type?: unknown;
  designation?: unknown;
  tauxTVA?: unknown;
  prixUnitaireHT?: unknown;
  quantite?: unknown;
  tauxHoraire?: unknown;
  heuresEstimees?: unknown;
  nombreIntervenants?: unknown;
  remise?: unknown;
  marge?: unknown;
  fraisTransport?: unknown;
  fraisDeplacement?: unknown;
  [key: string]: unknown;
}

function num(value: unknown, field: string): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) throw new HttpError(422, `${field} doit etre un nombre`);
  return n;
}

/** Copie de InvoiceService.calculateLineHT. */
export function calculateLineHT(poste: PosteInput): number {
  if (poste.type === 'materiel') {
    let total = num(poste.prixUnitaireHT, 'prixUnitaireHT') * num(poste.quantite, 'quantite');
    if (poste.remise) total *= 1 - num(poste.remise, 'remise') / 100;
    if (poste.marge) total *= 1 + num(poste.marge, 'marge') / 100;
    if (poste.fraisTransport) total += num(poste.fraisTransport, 'fraisTransport');
    return total;
  }
  let total =
    num(poste.tauxHoraire, 'tauxHoraire') *
    num(poste.heuresEstimees, 'heuresEstimees') *
    num(poste.nombreIntervenants, 'nombreIntervenants');
  if (poste.marge) total *= 1 + num(poste.marge, 'marge') / 100;
  if (poste.fraisDeplacement) total += num(poste.fraisDeplacement, 'fraisDeplacement');
  return total;
}

/** Copie de InvoiceService.calculateTotals. */
export function calculateTotals(postes: PosteInput[]): {
  totalHT: number;
  totalTVA: Record<number, number>;
  totalTTC: number;
} {
  const totals = { totalHT: 0, totalTVA: {} as Record<number, number>, totalTTC: 0 };
  postes.forEach((poste) => {
    const lineHT = calculateLineHT(poste);
    const tvaRate = poste.tauxTVA ? num(poste.tauxTVA, 'tauxTVA') : 0;
    const lineTVA = (lineHT * tvaRate) / 100;
    totals.totalHT += lineHT;
    totals.totalTVA[tvaRate] = (totals.totalTVA[tvaRate] || 0) + lineTVA;
    totals.totalTTC += lineHT + lineTVA;
  });
  return totals;
}

const DEVIS_STATUTS = ['brouillon', 'envoye', 'accepte', 'refuse', 'expire', 'caduc'];
const FACTURE_STATUTS = ['brouillon', 'envoyee', 'payee_partiellement', 'payee', 'en_retard', 'annulee'];

function newEntityId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function requireStringField(body: Record<string, unknown>, field: string): string {
  const value = body[field];
  if (typeof value !== 'string' || !value.trim()) {
    throw new HttpError(422, `${field} est requis (chaine non vide)`);
  }
  return value.trim();
}

function optionalIsoDate(body: Record<string, unknown>, field: string, fallback: string): string {
  const value = body[field];
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value !== 'string') throw new HttpError(422, `${field} doit etre une date ISO (YYYY-MM-DD)`);
  validateIsoDate(value, field);
  return value;
}

function validatePostes(body: Record<string, unknown>): PosteInput[] {
  const postes = body.postes;
  if (postes !== undefined && !Array.isArray(postes)) {
    throw new HttpError(422, 'postes doit etre un tableau');
  }
  return (postes ?? []) as PosteInput[];
}

function checkStatut(body: Record<string, unknown>, allowed: string[], field: string): string {
  const statut = body.statut;
  if (statut === undefined || statut === null || statut === '') return 'brouillon';
  if (typeof statut !== 'string' || !allowed.includes(statut)) {
    throw new HttpError(422, `${field} invalide (autorisés : ${allowed.join(', ')})`);
  }
  return statut;
}

/** Normalise un corps POST /devis en objet Devis de l'app + colonnes de la table. */
export function normalizeDevisInput(body: Record<string, unknown>): {
  columns: { id: string; client_id: string; numero: string; statut: string; payload: string };
  document: Record<string, unknown>;
} {
  const clientId = requireStringField(body, 'clientId');
  const numero = requireStringField(body, 'numero');
  const postes = validatePostes(body);
  const statut = checkStatut(body, DEVIS_STATUTS, 'statut');
  const today = new Date().toISOString().slice(0, 10);
  const dateEmission = optionalIsoDate(body, 'dateEmission', today);
  const dateValidite = optionalIsoDate(body, 'dateValidite', today);
  const now = new Date().toISOString();
  const totals = calculateTotals(postes);
  const document: Record<string, unknown> = {
    ...body,
    documentType: 'devis',
    id: typeof body.id === 'string' && body.id.trim() ? body.id.trim() : newEntityId('devis'),
    clientId,
    numero,
    statut,
    dateEmission,
    dateValidite,
    postes,
    totalHT: roundMoney(totals.totalHT),
    totalTVA: Object.fromEntries(
      Object.entries(totals.totalTVA).map(([rate, amount]) => [Number(rate), roundMoney(amount)])
    ),
    totalTTC: roundMoney(totals.totalTTC),
    createdAt: typeof body.createdAt === 'string' ? body.createdAt : now,
    updatedAt: now,
  };
  return {
    columns: {
      id: document.id as string,
      client_id: clientId,
      numero,
      statut,
      payload: JSON.stringify(document),
    },
    document,
  };
}

/** Normalise un corps POST /factures en objet Facture de l'app + colonnes de la table. */
export function normalizeFactureInput(body: Record<string, unknown>): {
  columns: { id: string; client_id: string; numero: string; statut: string; devis_origine: string | null; payload: string };
  document: Record<string, unknown>;
} {
  const clientId = requireStringField(body, 'clientId');
  const numero = requireStringField(body, 'numero');
  const postes = validatePostes(body);
  const statut = checkStatut(body, FACTURE_STATUTS, 'statut');
  const devisOrigine =
    body.devisOrigine === undefined || body.devisOrigine === null || body.devisOrigine === ''
      ? null
      : requireStringField({ devisOrigine: body.devisOrigine }, 'devisOrigine');
  const today = new Date().toISOString().slice(0, 10);
  const dateEmission = optionalIsoDate(body, 'dateEmission', today);
  const now = new Date().toISOString();
  const totals = calculateTotals(postes);
  const document: Record<string, unknown> = {
    ...body,
    documentType: 'facture',
    id: typeof body.id === 'string' && body.id.trim() ? body.id.trim() : newEntityId('facture'),
    clientId,
    numero,
    statut,
    devisOrigine: devisOrigine ?? undefined,
    dateEmission,
    postes,
    totalHT: roundMoney(totals.totalHT),
    totalTVA: Object.fromEntries(
      Object.entries(totals.totalTVA).map(([rate, amount]) => [Number(rate), roundMoney(amount)])
    ),
    totalTTC: roundMoney(totals.totalTTC),
    createdAt: typeof body.createdAt === 'string' ? body.createdAt : now,
    updatedAt: now,
  };
  return {
    columns: {
      id: document.id as string,
      client_id: clientId,
      numero,
      statut,
      devis_origine: devisOrigine,
      payload: JSON.stringify(document),
    },
    document,
  };
}

// ---------------------------------------------------------------------------
// PATCH : fusion du payload existant + totaux recalcules. Pour les factures,
// les champs geles apres emission sont proteges (aligne
// InvoiceLegalService.invoiceCoreChanged) ; la caducite/annulation passe par
// le statut.
// ---------------------------------------------------------------------------

const DOC_CONTROLLED_FIELDS = new Set([
  'documentType',
  'id',
  'clientId',
  'numero',
  'statut',
  'dateEmission',
  'dateValidite',
  'dateEcheance',
  'devisOrigine',
  'postes',
  'totalHT',
  'totalTVA',
  'totalTTC',
  'createdAt',
  'updatedAt',
]);

function dayStampString(value: unknown): string {
  return typeof value === 'string' ? value.slice(0, 10) : '';
}

/** Copie de InvoiceLegalService.invoiceCoreChanged (payload JSON : dates en strings). */
export function invoiceCoreChanged(
  previous: Record<string, unknown>,
  next: Record<string, unknown>
): boolean {
  return (
    previous.numero !== next.numero ||
    previous.clientId !== next.clientId ||
    dayStampString(previous.dateEmission) !== dayStampString(next.dateEmission) ||
    dayStampString(previous.dateEcheance) !== dayStampString(next.dateEcheance) ||
    previous.intituleSecondaire !== next.intituleSecondaire ||
    previous.devisOrigine !== next.devisOrigine ||
    Boolean(previous.isAvoir) !== Boolean(next.isAvoir) ||
    previous.factureOrigine !== next.factureOrigine ||
    JSON.stringify(previous.postes ?? null) !== JSON.stringify(next.postes ?? null) ||
    JSON.stringify(previous.vendeur ?? null) !== JSON.stringify(next.vendeur ?? null)
  );
}

function existingPostes(document: Record<string, unknown>): PosteInput[] {
  const postes = document.postes;
  return Array.isArray(postes) ? (postes as PosteInput[]) : [];
}

/** Fusionne les champs libres du body (les champs calcules/controles sont exclus). */
function mergeDocBody(document: Record<string, unknown>, body: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(body)) {
    if (!DOC_CONTROLLED_FIELDS.has(key)) document[key] = value;
  }
}

function patchStringField(document: Record<string, unknown>, body: Record<string, unknown>, field: string): void {
  if (field in body) document[field] = requireStringField(body, field);
}

function patchStatut(document: Record<string, unknown>, body: Record<string, unknown>, allowed: string[]): void {
  if ('statut' in body) {
    const statut = body.statut;
    if (typeof statut !== 'string' || !allowed.includes(statut)) {
      throw new HttpError(422, `statut invalide (autorisés : ${allowed.join(', ')})`);
    }
    document.statut = statut;
  }
}

function patchIsoDateField(document: Record<string, unknown>, body: Record<string, unknown>, field: string): void {
  if (field in body) {
    const value = body[field];
    if (value === null || value === '') return; // null = garder l'existant
    if (typeof value !== 'string') throw new HttpError(422, `${field} doit etre une date ISO (YYYY-MM-DD)`);
    validateIsoDate(value, field);
    document[field] = value;
  }
}

function applyTotals(document: Record<string, unknown>, postes: PosteInput[]): void {
  const totals = calculateTotals(postes);
  document.totalHT = roundMoney(totals.totalHT);
  document.totalTVA = Object.fromEntries(
    Object.entries(totals.totalTVA).map(([rate, amount]) => [Number(rate), roundMoney(amount)])
  );
  document.totalTTC = roundMoney(totals.totalTTC);
}

/** PATCH /devis/{id} : payload fusionne, totaux recalcules, statut valide. */
export function normalizeDevisPatchInput(
  existing: Record<string, unknown>,
  body: Record<string, unknown>
): {
  columns: { id: string; client_id: string; numero: string; statut: string; payload: string };
  document: Record<string, unknown>;
} {
  const document: Record<string, unknown> = { ...existing };
  mergeDocBody(document, body);
  patchStringField(document, body, 'clientId');
  patchStringField(document, body, 'numero');
  patchStatut(document, body, DEVIS_STATUTS);
  patchIsoDateField(document, body, 'dateEmission');
  patchIsoDateField(document, body, 'dateValidite');
  if ('postes' in body) document.postes = validatePostes(body);
  const postes = existingPostes(document);
  document.postes = postes;
  applyTotals(document, postes);
  document.documentType = 'devis';
  document.updatedAt = new Date().toISOString();
  return {
    columns: {
      id: String(existing.id),
      client_id: String(document.clientId ?? ''),
      numero: String(document.numero ?? ''),
      statut: String(document.statut ?? 'brouillon'),
      payload: JSON.stringify(document),
    },
    document,
  };
}

/** PATCH /factures/{id} : payload fusionne, totaux recalcules, champs geles si emise. */
export function normalizeFacturePatchInput(
  existing: Record<string, unknown>,
  body: Record<string, unknown>
): {
  columns: { id: string; client_id: string; numero: string; statut: string; devis_origine: string | null; payload: string };
  document: Record<string, unknown>;
} {
  const document: Record<string, unknown> = { ...existing };
  mergeDocBody(document, body);
  patchStringField(document, body, 'clientId');
  patchStringField(document, body, 'numero');
  patchStatut(document, body, FACTURE_STATUTS);
  patchIsoDateField(document, body, 'dateEmission');
  patchIsoDateField(document, body, 'dateEcheance');
  if ('devisOrigine' in body) {
    if (body.devisOrigine === null || body.devisOrigine === '') {
      document.devisOrigine = undefined;
    } else {
      document.devisOrigine = requireStringField({ devisOrigine: body.devisOrigine }, 'devisOrigine');
    }
  }
  if ('postes' in body) document.postes = validatePostes(body);
  const postes = existingPostes(document);
  document.postes = postes;
  applyTotals(document, postes);
  document.documentType = 'facture';
  document.updatedAt = new Date().toISOString();

  // Champs geles apres emission (aligne InvoiceLegalService.invoiceCoreChanged).
  if (existing.statut !== 'brouillon' && invoiceCoreChanged(existing, document)) {
    throw new HttpError(
      422,
      'Facture emise : champs geles non modifiables (numero, clientId, dates, postes, vendeur, devisOrigine...). Seuls le statut et les champs libres sont modifiables.'
    );
  }
  return {
    columns: {
      id: String(existing.id),
      client_id: String(document.clientId ?? ''),
      numero: String(document.numero ?? ''),
      statut: String(document.statut ?? 'brouillon'),
      devis_origine: typeof document.devisOrigine === 'string' ? document.devisOrigine : null,
      payload: JSON.stringify(document),
    },
    document,
  };
}

// ---------------------------------------------------------------------------
// Avoirs : aligne InvoiceService.createAvoir + InvoiceLegalService.invertPosteForAvoir.
// ---------------------------------------------------------------------------

/** Copie de InvoiceLegalService.invertPosteForAvoir. */
export function invertPosteForAvoir(poste: PosteInput): PosteInput {
  if (poste.type === 'materiel') {
    return { ...poste, quantite: -Math.abs(num(poste.quantite, 'quantite')) };
  }
  return { ...poste, heuresEstimees: -Math.abs(num(poste.heuresEstimees, 'heuresEstimees')) };
}

interface InvoiceSettingsPayload {
  prefixeFacture?: unknown;
  formatNumero?: unknown;
  prochainNumeroFacture?: unknown;
}

/** Copie de InvoiceService.formatNumero. */
function formatNumero(format: string, prefix: string, year: number, seq: number): string {
  return format
    .replace('{PREFIX}', prefix)
    .replace('{YEAR}', String(year))
    .replace(/\{SEQ:(\d+)\}/, (_, size: string) => String(seq).padStart(Number(size), '0'));
}

/**
 * Genere le prochain numero de facture (utilise aussi pour les avoirs, comme
 * l'app) : lit invoice_settings (singleton id=1), saute les numeros deja pris,
 * persiste seq+1. Defauts alignes EmetteurService.defaultInvoiceSettings.
 */
export function buildNextNumeroFacture(db: DatabaseSync, persist = true): string {
  const row = db.prepare('SELECT payload FROM invoice_settings WHERE id = 1').get() as
    | { payload: string }
    | undefined;
  const settings: InvoiceSettingsPayload = row ? (JSON.parse(row.payload) as InvoiceSettingsPayload) : {};
  const prefix = typeof settings.prefixeFacture === 'string' && settings.prefixeFacture ? settings.prefixeFacture : 'FAC';
  const format =
    typeof settings.formatNumero === 'string' && settings.formatNumero
      ? settings.formatNumero
      : '{PREFIX}-{YEAR}-{SEQ:4}';
  const year = new Date().getFullYear();
  const taken = new Set(
    (db.prepare('SELECT numero FROM factures').all() as { numero: string }[]).map((r) => r.numero)
  );
  let seq = typeof settings.prochainNumeroFacture === 'number' ? settings.prochainNumeroFacture : 1;
  let formatted = formatNumero(format, prefix, year, seq);
  while (taken.has(formatted)) {
    seq += 1;
    formatted = formatNumero(format, prefix, year, seq);
  }
  if (persist) {
    if (row) {
      db.prepare('UPDATE invoice_settings SET payload = ? WHERE id = 1').run(
        JSON.stringify({ ...settings, prochainNumeroFacture: seq + 1 })
      );
    } else {
      db.prepare('INSERT INTO invoice_settings (id, payload) VALUES (1, ?)').run(
        JSON.stringify({ ...settings, prochainNumeroFacture: seq + 1 })
      );
    }
  }
  return formatted;
}

/** POST /factures/{id}/avoir : construit l'avoir depuis la facture origine. */
export function normalizeAvoirInput(
  origin: Record<string, unknown>,
  body: Record<string, unknown>
): {
  columns: { id: string; client_id: string; numero: string; statut: string; devis_origine: string | null; payload: string };
  document: Record<string, unknown>;
} {
  const originPostes = Array.isArray(origin.postes) ? (origin.postes as PosteInput[]) : [];
  const postes = originPostes.map((poste) => ({ ...invertPosteForAvoir(poste), id: newEntityId('poste') }));
  const totals = calculateTotals(postes);
  const now = new Date().toISOString();
  const numero = typeof body.numero === 'string' && body.numero.trim() ? body.numero.trim() : undefined;
  const document: Record<string, unknown> = {
    ...origin,
    id: newEntityId('fac'),
    documentType: 'facture',
    ...(numero !== undefined ? { numero } : {}),
    isAvoir: true,
    factureOrigine: origin.id,
    factureOrigineNumero: origin.numero,
    postes,
    totalHT: roundMoney(totals.totalHT),
    totalTVA: Object.fromEntries(
      Object.entries(totals.totalTVA).map(([rate, amount]) => [Number(rate), roundMoney(amount)])
    ),
    totalTTC: roundMoney(totals.totalTTC),
    paiements: [],
    statut: 'envoyee',
    attachment: undefined,
    dateEmission: now.slice(0, 10),
    createdAt: now,
    updatedAt: now,
  };
  return {
    columns: {
      id: document.id as string,
      client_id: String(document.clientId ?? ''),
      numero: String(document.numero ?? ''),
      statut: 'envoyee',
      devis_origine: typeof document.devisOrigine === 'string' ? document.devisOrigine : null,
      payload: JSON.stringify(document),
    },
    document,
  };
}
