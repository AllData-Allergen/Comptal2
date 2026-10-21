// Suivi des paiements de factures (aligne PaymentTrackingService de l'app).
// Le payload JSON stocke les dates en strings ISO ; les montants sont arrondis
// a 2 decimales. Toute ecriture passe par withTransaction + writeAudit et
// recalcule le statut de la facture (computeFactureStatus).
import type { DatabaseSync } from 'node:sqlite';
import { HttpError, readJsonBody, sendJson } from './http.ts';
import { writeAudit, withTransaction } from './db.ts';
import { getDocRow, isDryRun, respondDryRun } from './handlers.ts';
import type { DocRow } from './handlers.ts';
import { boolQuery, requireNumber, requireString, roundMoney, validateIsoDate, optionalString } from './validate.ts';
import type { RouteContext } from './routes.ts';

// ---------------------------------------------------------------------------
// Logique pure (copie alignee de l'app, dates en strings)
// ---------------------------------------------------------------------------

interface PaiementLike {
  id?: unknown;
  montant?: unknown;
  datePaiement?: unknown;
  modePaiement?: unknown;
  transactionId?: unknown;
  reference?: unknown;
  notes?: unknown;
}

function paiementsOf(document: Record<string, unknown>): PaiementLike[] {
  return Array.isArray(document.paiements) ? (document.paiements as PaiementLike[]) : [];
}

function paiementMontant(p: PaiementLike): number {
  return typeof p.montant === 'number' && Number.isFinite(p.montant) ? p.montant : 0;
}

export function computePaymentStatus(document: Record<string, unknown>): {
  paidAmount: number;
  totalTTC: number;
  percent: number;
  remaining: number;
} {
  const paidAmount = roundMoney(paiementsOf(document).reduce((sum, p) => sum + paiementMontant(p), 0));
  const totalTTC = typeof document.totalTTC === 'number' ? document.totalTTC : 0;
  const percent = totalTTC > 0 ? Math.min(100, (paidAmount / totalTTC) * 100) : 0;
  return {
    paidAmount,
    totalTTC,
    percent: roundMoney(percent),
    remaining: roundMoney(Math.max(0, totalTTC - paidAmount)),
  };
}

/** Copie de PaymentTrackingService.computeFactureStatus (payload JSON). */
export function computeFactureStatus(document: Record<string, unknown>): string {
  if (computePaymentStatus(document).remaining <= 0.009) return 'payee';
  if (paiementsOf(document).length > 0) return 'payee_partiellement';
  const echeance = typeof document.dateEcheance === 'string' ? document.dateEcheance.slice(0, 10) : '';
  if (echeance && echeance < new Date().toISOString().slice(0, 10)) return 'en_retard';
  return document.statut === 'brouillon' ? 'brouillon' : 'envoyee';
}

/** Copie de normalizeInvoiceToken (invoiceFormat.ts). */
export function normalizeInvoiceToken(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/** Copie de labelContainsDocumentNumero : le libelle contient-il le numero ? */
export function labelContainsNumero(label: string, numero: string): boolean {
  const nLabel = normalizeInvoiceToken(label);
  const nNum = normalizeInvoiceToken(numero);
  if (!nLabel || !nNum || nNum.length < 4) return false;
  return nLabel.includes(nNum);
}

export interface PaymentMatch {
  transaction: Record<string, unknown>;
  reason: 'label' | 'amount' | 'both';
  score: number;
}

function rankMatch(
  document: Record<string, unknown>,
  tx: Record<string, unknown>,
  remaining: number
): PaymentMatch | null {
  const credit = Math.abs(typeof tx.credit === 'number' ? tx.credit : 0);
  if (credit <= 0) return null;
  const totalTTC = typeof document.totalTTC === 'number' ? document.totalTTC : 0;
  const numero = typeof document.numero === 'string' ? document.numero : '';
  const label = typeof tx.label === 'string' ? tx.label : '';
  const byLabel = labelContainsNumero(label, numero);
  const byAmount = Math.abs(credit - totalTTC) < 0.05 || Math.abs(credit - remaining) < 0.05;
  if (!byLabel && !byAmount) return null;
  const reason: PaymentMatch['reason'] = byLabel && byAmount ? 'both' : byLabel ? 'label' : 'amount';
  const score = (byLabel ? 100 : 0) + (byAmount ? 40 : 0) + (reason === 'both' ? 20 : 0);
  return { transaction: tx, reason, score };
}

// ---------------------------------------------------------------------------
// Helpers internes
// ---------------------------------------------------------------------------

function newEntityId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getFactureOr404(ctx: RouteContext): { row: DocRow; document: Record<string, unknown> } {
  const id = ctx.params['id'] ?? '';
  const row = getDocRow(ctx.db, 'factures', id);
  if (!row || row.supprime !== 0) throw new HttpError(404, `Facture ${id} introuvable`);
  return { row, document: JSON.parse(row.payload) as Record<string, unknown> };
}

function listActiveTransactions(db: DatabaseSync): Record<string, unknown>[] {
  return db
    .prepare(
      `SELECT t.*, a.code AS account_code FROM transactions t
       LEFT JOIN accounts a ON a.id = t.account_id
       WHERE t.deleted_at IS NULL ORDER BY t.date DESC, t.id DESC`
    )
    .all() as unknown as Record<string, unknown>[];
}

/** Persiste la facture modifiee (statut recalcule) + audit. A appeler dans withTransaction. */
function saveFacture(
  ctx: RouteContext,
  id: string,
  before: Record<string, unknown>,
  document: Record<string, unknown>,
  action: string
): void {
  document.updatedAt = new Date().toISOString();
  document.statut = computeFactureStatus(document);
  ctx.db
    .prepare('UPDATE factures SET statut = ?, payload = ?, updated_at = ? WHERE id = ?')
    .run(document.statut as string, JSON.stringify(document), document.updatedAt as string, id);
  writeAudit(ctx.db, { actor: ctx.actor, action, entity: 'facture', entityId: id, before, after: document });
}

function findMatchesFor(db: DatabaseSync, document: Record<string, unknown>): PaymentMatch[] {
  const { remaining } = computePaymentStatus(document);
  const linked = new Set(
    paiementsOf(document)
      .map((p) => (typeof p.transactionId === 'string' ? p.transactionId : ''))
      .filter(Boolean)
  );
  return listActiveTransactions(db)
    .filter((tx) => !linked.has(String(tx['id'])))
    .map((tx) => rankMatch(document, tx, remaining))
    .filter((m): m is PaymentMatch => m !== null)
    .sort(
      (a, b) =>
        b.score - a.score || String(b.transaction['date']).localeCompare(String(a.transaction['date']))
    );
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/** GET /factures/{id}/payment-status — aligne getPaymentStatus + getRemainingAmount. */
export function getFacturePaymentStatus(ctx: RouteContext): void {
  const { document } = getFactureOr404(ctx);
  const status = computePaymentStatus(document);
  sendJson(ctx.res, 200, { ...status, statut_calcule: computeFactureStatus(document) });
}

/** GET /factures/{id}/paiements/matches — aligne findPaymentMatches (lecture seule). */
export function listFacturePaymentMatches(ctx: RouteContext): void {
  const { document } = getFactureOr404(ctx);
  const matches = findMatchesFor(ctx.db, document);
  sendJson(ctx.res, 200, {
    items: matches.map((m) => ({
      transaction: m.transaction,
      reason: m.reason,
      score: m.score,
    })),
    total: matches.length,
  });
}

/** POST /factures/{id}/paiements/link — aligne linkTransactionToInvoice. */
export async function linkTransactionToFacture(ctx: RouteContext): Promise<void> {
  const { document } = getFactureOr404(ctx);
  const body = await readJsonBody(ctx.req);
  const transactionId = requireNumber(body, 'transaction_id', { min: 1 });
  const before = JSON.parse(JSON.stringify(document)) as Record<string, unknown>;

  const paiements = paiementsOf(document);
  if (paiements.some((p) => String(p.transactionId) === String(transactionId))) {
    // Deja lie : idempotent (aligne l'app), aucune ecriture.
    sendJson(ctx.res, 200, { id: document.id, facture: document, linked: false });
    return;
  }
  const tx = ctx.db
    .prepare('SELECT * FROM transactions WHERE id = ? AND deleted_at IS NULL')
    .get(transactionId) as Record<string, unknown> | undefined;
  if (!tx) throw new HttpError(404, `Transaction ${transactionId} introuvable`);
  const montantRaw = roundMoney(Math.abs(typeof tx['credit'] === 'number' ? (tx['credit'] as number) : 0));
  if (montantRaw <= 0) {
    throw new HttpError(422, 'Seuls les credits (encaissements) peuvent etre lies a une facture');
  }
  const remaining = computePaymentStatus(document).remaining;
  if (remaining <= 0) throw new HttpError(422, 'Facture deja soldée : aucun paiement restant a lier');
  const montant = Math.min(montantRaw, remaining);
  const paiement = {
    id: newEntityId('pay'),
    factureId: document.id,
    montant,
    datePaiement: String(tx['date'] ?? ''),
    modePaiement: 'virement',
    transactionId: String(transactionId),
    reference: typeof tx['label'] === 'string' ? tx['label'] : undefined,
  };
  const after = JSON.parse(JSON.stringify(document)) as Record<string, unknown>;
  after.paiements = [...paiements, paiement];

  if (isDryRun(ctx, body)) {
    respondDryRun(ctx, { action: 'link_paiement', entity: 'facture', entityId: String(document.id), before, after });
    return;
  }
  withTransaction(ctx.db, () => saveFacture(ctx, String(document.id), before, after, 'link_paiement'));
  sendJson(ctx.res, 200, { id: document.id, facture: after, linked: true, paiement_id: paiement.id });
}

/** POST /factures/{id}/paiements/auto-link — aligne autoLinkLabelMatches. */
export async function autoLinkFacturePaiements(ctx: RouteContext): Promise<void> {
  const { document } = getFactureOr404(ctx);
  const body = await readJsonBody(ctx.req);
  const before = JSON.parse(JSON.stringify(document)) as Record<string, unknown>;
  const matches = findMatchesFor(ctx.db, document).filter(
    (m) => m.reason === 'label' || m.reason === 'both'
  );

  const after = JSON.parse(JSON.stringify(document)) as Record<string, unknown>;
  after.paiements = [...paiementsOf(document)];
  let linked = 0;
  for (const match of matches) {
    const txId = String(match.transaction['id']);
    if (paiementsOf(after).some((p) => String(p.transactionId) === txId)) continue;
    if (computePaymentStatus(after).remaining <= 0) break;
    const montantRaw = roundMoney(Math.abs(typeof match.transaction['credit'] === 'number' ? (match.transaction['credit'] as number) : 0));
    const montant = Math.min(montantRaw, computePaymentStatus(after).remaining);
    after.paiements = [
      ...(after.paiements as PaiementLike[]),
      {
        id: newEntityId('pay'),
        factureId: after.id,
        montant,
        datePaiement: String(match.transaction['date'] ?? ''),
        modePaiement: 'virement',
        transactionId: txId,
        reference: typeof match.transaction['label'] === 'string' ? match.transaction['label'] : undefined,
      },
    ];
    linked += 1;
  }

  if (isDryRun(ctx, body)) {
    respondDryRun(ctx, {
      action: 'auto_link_paiements',
      entity: 'facture',
      entityId: String(document.id),
      before,
      after: { facture: after, linked },
    });
    return;
  }
  if (linked > 0) {
    withTransaction(ctx.db, () => saveFacture(ctx, String(document.id), before, after, 'auto_link_paiements'));
  }
  sendJson(ctx.res, 200, { id: document.id, facture: linked > 0 ? after : document, linked });
}

/** POST /factures/{id}/paiements — aligne addManualPaiement (especes/cheque).
 * L'app choisit le compte de tresorerie via EmetteurService ; l'agent-api n'a
 * pas l'emetteur, donc l'agent fournit account_id explicitement. La transaction
 * de tresorerie correspondante est creee (credit = montant). */
export async function addManualPaiement(ctx: RouteContext): Promise<void> {
  const { document } = getFactureOr404(ctx);
  const body = await readJsonBody(ctx.req);
  const montant = roundMoney(requireNumber(body, 'montant', { min: 0.01 }));
  const date = validateIsoDate(requireString(body, 'date', { max: 10 }), 'date');
  const mode = requireString(body, 'mode', { max: 16 });
  if (mode !== 'especes' && mode !== 'cheque') {
    throw new HttpError(422, "Champ 'mode' doit etre 'especes' ou 'cheque'");
  }
  const accountId = requireNumber(body, 'account_id', { min: 1 });
  const reference = optionalString(body, 'reference', { max: 500 });
  const before = JSON.parse(JSON.stringify(document)) as Record<string, unknown>;

  const remaining = computePaymentStatus(document).remaining;
  if (remaining <= 0) throw new HttpError(422, 'Facture deja soldée : aucun paiement restant');
  const montantApplique = Math.min(montant, remaining);

  const numero = typeof document.numero === 'string' ? document.numero : '';
  const modeLabel = mode === 'especes' ? 'Espèces' : 'Chèque';
  const txLabel = `Paiement ${modeLabel} ${numero} — suivi de trésorerie, pas une caisse`;
  const after = JSON.parse(JSON.stringify(document)) as Record<string, unknown>;
  const paiement: Record<string, unknown> = {
    id: newEntityId('pay'),
    factureId: document.id,
    montant: montantApplique,
    datePaiement: date,
    modePaiement: mode,
    reference: reference ?? undefined,
    notes: 'Suivi de tresorerie : pas un encaissement bancaire reel',
  };
  if (isDryRun(ctx, body)) {
    const afterDry = JSON.parse(JSON.stringify(document)) as Record<string, unknown>;
    afterDry.paiements = [...paiementsOf(document), { ...paiement, transactionId: '(nouvelle transaction)' }];
    respondDryRun(ctx, {
      action: 'paiement_manuel',
      entity: 'facture',
      entityId: String(document.id),
      before,
      after: { facture: afterDry, transaction: { account_id: accountId, date, credit: montantApplique, label: txLabel } },
    });
    return;
  }
  withTransaction(ctx.db, () => {
    const result = ctx.db
      .prepare(
        `INSERT INTO transactions (account_id, date, value_date, debit, credit, label, category_code)
         VALUES (?, ?, ?, 0, ?, ?, NULL)`
      )
      .run(accountId, date, date, montantApplique, txLabel);
    paiement.transactionId = String(Number(result.lastInsertRowid));
    after.paiements = [...paiementsOf(document), paiement];
    saveFacture(ctx, String(document.id), before, after, 'paiement_manuel');
  });
  sendJson(ctx.res, 201, { id: document.id, facture: after, paiement_id: paiement.id });
}

/** DELETE /factures/{id}/paiements/{paiementId} — aligne unlinkPaiement. */
export async function unlinkPaiement(ctx: RouteContext): Promise<void> {
  const { document } = getFactureOr404(ctx);
  const paiementId = ctx.params['paiementId'] ?? '';
  const body = await readJsonBody(ctx.req).catch(() => ({}) as Record<string, unknown>);
  if (!boolQuery(ctx.query, 'confirm') && body['confirm'] !== true) {
    throw new HttpError(400, 'Retrait de paiement : ajouter ?confirm=true');
  }
  const before = JSON.parse(JSON.stringify(document)) as Record<string, unknown>;
  const restants = paiementsOf(document).filter((p) => p.id !== paiementId);
  if (restants.length === paiementsOf(document).length) {
    throw new HttpError(404, `Paiement ${paiementId} introuvable sur la facture ${document.id}`);
  }
  const after = JSON.parse(JSON.stringify(document)) as Record<string, unknown>;
  after.paiements = restants;
  if (isDryRun(ctx, body)) {
    respondDryRun(ctx, { action: 'unlink_paiement', entity: 'facture', entityId: String(document.id), before, after });
    return;
  }
  withTransaction(ctx.db, () => saveFacture(ctx, String(document.id), before, after, 'unlink_paiement'));
  sendJson(ctx.res, 200, { id: document.id, facture: after });
}
