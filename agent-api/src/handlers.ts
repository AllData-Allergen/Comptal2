// Handlers CRUD (transactions, comptes, categories) + journal d'audit + dry_run.
// Semantique alignee sur EditionService / ConfigService de l'app :
// - dates ISO YYYY-MM-DD, montants arrondis a 2 decimales,
// - suppression de transaction = soft delete (deleted_at),
// - suppression de compte = DELETE dur avec cascade transactions (exige ?confirm=true),
// - categorie X (transferts inter-comptes) protegee.
import type { DatabaseSync } from 'node:sqlite';
import { HttpError, readJsonBody, sendJson } from './http.ts';
import { writeAudit, withTransaction } from './db.ts';
import { parseCsv, parseMapping, transformRows } from './import.ts';
import {
  normalizeDevisInput,
  normalizeFactureInput,
  normalizeDevisPatchInput,
  normalizeFacturePatchInput,
  normalizeAvoirInput,
  buildNextNumeroFacture,
} from './invoice.ts';
import {
  boolQuery,
  csvIntQuery,
  csvQuery,
  intQuery,
  optionalNumber,
  optionalString,
  requireNumber,
  requireString,
  requireIdParam,
  roundMoney,
  validateHexColor,
  validateIsoDate,
} from './validate.ts';
import type { RouteContext } from './routes.ts';

const TRANSFER_CODE = 'X';
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 1000;

interface TxRow {
  id: number;
  account_id: number;
  date: string;
  value_date: string | null;
  debit: number;
  credit: number;
  label: string;
  category_code: string | null;
  tag: string | null;
  import_id: number | null;
  created_at: string;
  updated_at: string | null;
  deleted_at: string | null;
  account_code?: string | null;
}

interface AccountRow {
  id: number;
  code: string;
  name: string;
  color: string;
  initial_balance: number;
  created_at: string;
}

interface CategoryRow {
  id: number;
  code: string;
  name: string;
  color: string;
  group_id: number | null;
  created_at: string;
}

function getTxRow(db: DatabaseSync, id: number): TxRow | undefined {
  return db.prepare('SELECT * FROM transactions WHERE id = ?').get(id) as TxRow | undefined;
}

function getAccountRow(db: DatabaseSync, id: number): AccountRow | undefined {
  return db.prepare('SELECT * FROM accounts WHERE id = ?').get(id) as AccountRow | undefined;
}

function getCategoryRow(db: DatabaseSync, id: number): CategoryRow | undefined {
  return db.prepare('SELECT * FROM categories WHERE id = ?').get(id) as CategoryRow | undefined;
}

function accountExists(db: DatabaseSync, id: number): boolean {
  return db.prepare('SELECT 1 FROM accounts WHERE id = ?').get(id) !== undefined;
}

function categoryCodeExists(db: DatabaseSync, code: string): boolean {
  return db.prepare('SELECT 1 FROM categories WHERE code = ?').get(code) !== undefined;
}

export function isDryRun(ctx: RouteContext, body: Record<string, unknown>): boolean {
  if (body.dry_run === true) return true;
  if (body.dry_run === false || body.dry_run === undefined) return boolQuery(ctx.query, 'dry_run');
  throw new HttpError(422, "Champ 'dry_run' doit etre un booleen");
}

/** Reponse d'ecriture : dry_run -> diff prevu sans ecriture ; sinon ecriture + audit. */
export function respondDryRun(
  ctx: RouteContext,
  diff: { action: string; entity: string; entityId: string | number | null; before: unknown; after: unknown }
): void {
  sendJson(ctx.res, 200, { dry_run: true, ...diff });
}

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------

export async function listTransactions(ctx: RouteContext): Promise<void> {
  const accountId = ctx.query.get('account_id');
  let accountIdNum: number | null = null;
  if (accountId !== null && accountId !== '') {
    accountIdNum = Number.parseInt(accountId, 10);
    if (!Number.isInteger(accountIdNum) || accountIdNum < 1) {
      throw new HttpError(400, "Parametre 'account_id' invalide");
    }
  }
  const includeDeleted = boolQuery(ctx.query, 'include_deleted');
  const limit = intQuery(ctx.query, 'limit', { def: DEFAULT_LIMIT, min: 1, max: MAX_LIMIT });
  const offset = intQuery(ctx.query, 'offset', { def: 0, min: 0, max: 10_000_000 });

  const whereDeleted = includeDeleted ? '' : ' AND t.deleted_at IS NULL';
  const whereAccount = accountIdNum !== null ? ' AND t.account_id = ?' : '';
  const params: number[] = [];
  if (accountIdNum !== null) params.push(accountIdNum);

  const totalRows = db_selectTotal(ctx.db, whereDeleted, whereAccount, params);
  const rows = ctx.db
    .prepare(
      `SELECT t.*, a.code AS account_code FROM transactions t
       LEFT JOIN accounts a ON a.id = t.account_id
       WHERE 1=1${whereDeleted}${whereAccount}
       ORDER BY t.date DESC, t.id DESC LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset) as unknown as TxRow[];
  sendJson(ctx.res, 200, { items: rows, total: totalRows, limit, offset });
}

function db_selectTotal(
  db: DatabaseSync,
  whereDeleted: string,
  whereAccount: string,
  params: number[]
): number {
  const row = db
    .prepare(`SELECT COUNT(*) AS n FROM transactions t WHERE 1=1${whereDeleted}${whereAccount}`)
    .get(...params) as { n: number } | undefined;
  return row?.n ?? 0;
}

export async function getTransaction(ctx: RouteContext): Promise<void> {
  const id = requireIdParam(ctx.params, 'id');
  // Cohérent avec la liste : une transaction soft-supprimée est invisible (404).
  const row = ctx.db
    .prepare(
      `SELECT t.*, a.code AS account_code FROM transactions t
       LEFT JOIN accounts a ON a.id = t.account_id
       WHERE t.id = ? AND t.deleted_at IS NULL`
    )
    .get(id) as TxRow | undefined;
  if (!row) throw new HttpError(404, `Transaction ${id} introuvable`);
  sendJson(ctx.res, 200, row);
}

interface TxInput {
  accountId: number;
  date: string;
  valueDate: string | null;
  debit: number;
  credit: number;
  label: string;
  categoryCode: string | null;
}

/** Champs acceptes dans le corps d'une transaction (POST et PATCH). dry_run est
 * traite separement par isDryRun() et fait donc partie de la liste blanche. */
const TX_ALLOWED_FIELDS = [
  'account_id',
  'date',
  'value_date',
  'debit',
  'credit',
  'label',
  'category_code',
  'dry_run',
] as const;

function assertNoUnknownTxFields(body: Record<string, unknown>): void {
  const allowed = TX_ALLOWED_FIELDS as readonly string[];
  const unknown = Object.keys(body).filter((k) => !allowed.includes(k));
  if (unknown.length > 0) {
    throw new HttpError(
      422,
      `Champ(s) inconnu(s) : ${unknown.join(', ')} (champs acceptes : ${TX_ALLOWED_FIELDS.join(', ')})`
    );
  }
}

function parseTxInput(body: Record<string, unknown>, partial: boolean): Partial<TxInput> {
  // Rejet strict des champs inconnus (issue cycle 4 : ils etaient silencieusement ignores,
  // ce qui pouvait masquer une erreur de l'agent, ex. 'montant' au lieu de 'debit').
  assertNoUnknownTxFields(body);
  const input: Partial<TxInput> = {};
  if (!partial || 'account_id' in body) {
    input.accountId = requireNumber(body, 'account_id', { min: 1 }) | 0;
    if (!Number.isInteger(input.accountId)) {
      throw new HttpError(422, "Champ 'account_id' doit etre un entier");
    }
  }
  if (!partial || 'date' in body) {
    input.date = validateIsoDate(requireString(body, 'date', { max: 10 }), 'date');
  }
  if ('value_date' in body) {
    const raw = optionalString(body, 'value_date', { max: 10 });
    input.valueDate = raw === undefined || raw === null ? null : validateIsoDate(raw, 'value_date');
  }
  if ('debit' in body) {
    // Convention app (ImportService) : une depense est stockee avec un debit NEGATIF.
    // Un debit positif saisi (montant de la depense, sens naturel) est normalise en negatif.
    const raw = roundMoney(requireNumber(body, 'debit'));
    input.debit = raw > 0 ? -raw : raw;
  }
  if ('credit' in body) {
    // Un credit (revenu) est toujours stocke positif ; un credit negatif saisi est normalise.
    const raw = roundMoney(requireNumber(body, 'credit'));
    input.credit = raw < 0 ? -raw : raw;
  }
  if ('label' in body) {
    const raw = optionalString(body, 'label', { max: 2000 });
    input.label = raw ?? '';
  }
  if ('category_code' in body) {
    const raw = optionalString(body, 'category_code', { max: 64 });
    input.categoryCode = raw === undefined || raw === null ? null : raw.trim().toUpperCase();
  }
  return input;
}

/**
 * Cohérence débit/crédit sur les valeurs normalisées : exactement un mouvement non nul.
 * Convention app : dépense = debit NEGATIF, revenu = credit positif.
 */
function assertDebitCredit(debit: number, credit: number): void {
  if (Math.abs(debit) > 0 && Math.abs(credit) > 0) {
    throw new HttpError(422, 'debit et credit ne peuvent pas etre tous deux non nuls (mouvement unique)');
  }
  if (debit === 0 && credit === 0) {
    throw new HttpError(422, 'debit ou credit doit etre non nul');
  }
}

function assertTxInput(ctx: RouteContext, input: Partial<TxInput>): void {
  if (input.accountId !== undefined && !accountExists(ctx.db, input.accountId)) {
    throw new HttpError(422, `Compte ${input.accountId} introuvable`);
  }
  if (
    input.categoryCode !== undefined &&
    input.categoryCode !== null &&
    !categoryCodeExists(ctx.db, input.categoryCode)
  ) {
    throw new HttpError(422, `Categorie '${input.categoryCode}' introuvable`);
  }
}

export async function createTransaction(ctx: RouteContext): Promise<void> {
  const body = await readJsonBody(ctx.req);
  const input = parseTxInput(body, false) as TxInput;
  assertTxInput(ctx, input);
  assertDebitCredit(input.debit ?? 0, input.credit ?? 0);
  const afterPreview = {
    account_id: input.accountId,
    date: input.date,
    value_date: input.valueDate ?? input.date,
    debit: input.debit ?? 0,
    credit: input.credit ?? 0,
    label: input.label ?? '',
    category_code: input.categoryCode ?? null,
  };
  if (isDryRun(ctx, body)) {
    respondDryRun(ctx, { action: 'create', entity: 'transaction', entityId: null, before: null, after: afterPreview });
    return;
  }
  const id = withTransaction(ctx.db, () => {
    const result = ctx.db
      .prepare(
        `INSERT INTO transactions (account_id, date, value_date, debit, credit, label, category_code)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        input.accountId,
        input.date,
        input.valueDate ?? input.date,
        input.debit ?? 0,
        input.credit ?? 0,
        input.label ?? '',
        input.categoryCode ?? null
      );
    const newId = Number(result.lastInsertRowid);
    const row = getTxRow(ctx.db, newId);
    if (!row) throw new HttpError(500, 'Transaction non relue apres insertion');
    writeAudit(ctx.db, {
      actor: ctx.actor,
      action: 'create',
      entity: 'transaction',
      entityId: newId,
      before: null,
      after: row,
    });
    return newId;
  });
  sendJson(ctx.res, 201, { id, transaction: getTxRow(ctx.db, id) });
}

export async function updateTransaction(ctx: RouteContext): Promise<void> {
  const id = requireIdParam(ctx.params, 'id');
  const body = await readJsonBody(ctx.req);
  const before = getTxRow(ctx.db, id);
  if (!before || before.deleted_at !== null) {
    throw new HttpError(404, `Transaction ${id} introuvable`);
  }
  const input = parseTxInput(body, true);
  assertTxInput(ctx, input);
  const after: TxRow = { ...before };
  if (input.accountId !== undefined) after.account_id = input.accountId;
  if (input.date !== undefined) after.date = input.date;
  if (input.valueDate !== undefined) after.value_date = input.valueDate;
  if (input.debit !== undefined) after.debit = input.debit;
  if (input.credit !== undefined) after.credit = input.credit;
  if (input.label !== undefined) after.label = input.label;
  if (input.categoryCode !== undefined) after.category_code = input.categoryCode;
  if ('tag' in body) {
    const raw = optionalString(body, 'tag', { max: 200 });
    after.tag = raw === undefined || raw === null ? null : raw;
  }
  // Cohérence débit/crédit sur le résultat final fusionné (before + patch).
  assertDebitCredit(after.debit, after.credit);
  if (isDryRun(ctx, body)) {
    respondDryRun(ctx, { action: 'update', entity: 'transaction', entityId: id, before, after });
    return;
  }
  withTransaction(ctx.db, () => {
    ctx.db
      .prepare(
        `UPDATE transactions SET account_id = ?, date = ?, value_date = ?, debit = ?, credit = ?,
         label = ?, category_code = ?, tag = ?, updated_at = datetime('now') WHERE id = ?`
      )
      .run(
        after.account_id,
        after.date,
        after.value_date,
        after.debit,
        after.credit,
        after.label,
        after.category_code,
        after.tag,
        id
      );
    const row = getTxRow(ctx.db, id);
    if (!row) throw new HttpError(500, 'Transaction non relue apres mise a jour');
    writeAudit(ctx.db, {
      actor: ctx.actor,
      action: 'update',
      entity: 'transaction',
      entityId: id,
      before,
      after: row,
    });
  });
  sendJson(ctx.res, 200, { transaction: getTxRow(ctx.db, id) });
}

export async function deleteTransaction(ctx: RouteContext): Promise<void> {
  const id = requireIdParam(ctx.params, 'id');
  const body = await readJsonBody(ctx.req);
  const before = getTxRow(ctx.db, id);
  if (!before || before.deleted_at !== null) {
    throw new HttpError(404, `Transaction ${id} introuvable`);
  }
  if (isDryRun(ctx, body)) {
    respondDryRun(ctx, { action: 'delete', entity: 'transaction', entityId: id, before, after: null });
    return;
  }
  withTransaction(ctx.db, () => {
    ctx.db
      .prepare(
        `UPDATE transactions SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`
      )
      .run(id);
    writeAudit(ctx.db, {
      actor: ctx.actor,
      action: 'delete',
      entity: 'transaction',
      entityId: id,
      before,
      after: null,
    });
  });
  sendJson(ctx.res, 200, { ok: true, deleted: 'soft' });
}

// ---------------------------------------------------------------------------
// Regles de libelles (label_rules) — aligne LabelRuleService de l'app
// ---------------------------------------------------------------------------

const MIN_SEQUENCE_LENGTH = 4;

interface LabelRuleRow {
  id: number;
  word: string;
  category_code: string | null;
  tag: string | null;
  active: number;
  created_at: string;
}

interface LabelRuleDocument {
  id: number;
  word: string;
  categoryCode: string | null;
  tag: string | null;
  active: boolean;
  createdAt: string;
}

function mapLabelRule(row: LabelRuleRow): LabelRuleDocument {
  return {
    id: row.id,
    word: row.word,
    categoryCode: row.category_code,
    tag: row.tag,
    active: row.active === 1,
    createdAt: row.created_at,
  };
}

/** Conserve la suite de caracteres (espaces internes inclus), en majuscules (aligne l'app). */
function normalizeSequence(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').toUpperCase();
}

function getLabelRuleRow(db: DatabaseSync, id: number): LabelRuleRow | undefined {
  return db
    .prepare('SELECT id, word, category_code, tag, active, created_at FROM label_rules WHERE id = ?')
    .get(id) as unknown as LabelRuleRow | undefined;
}

export async function listLabelRules(ctx: RouteContext): Promise<void> {
  const rows = ctx.db
    .prepare('SELECT id, word, category_code, tag, active, created_at FROM label_rules ORDER BY word')
    .all() as unknown as LabelRuleRow[];
  sendJson(ctx.res, 200, { items: rows.map(mapLabelRule), total: rows.length });
}

/** POST /label-rules : creation ou mise a jour par mot (upsert, aligne LabelRuleService.upsert). */
export async function createLabelRule(ctx: RouteContext): Promise<void> {
  const body = await readJsonBody(ctx.req);
  const wordRaw = requireString(body, 'word', { max: 200 });
  const word = normalizeSequence(wordRaw);
  if (word.length < MIN_SEQUENCE_LENGTH) {
    throw new HttpError(422, `Champ 'word' : sequence de ${MIN_SEQUENCE_LENGTH} caracteres minimum`);
  }
  const categoryCode = requireString(body, 'categoryCode', { max: 20 }).trim();
  if (!categoryCode) throw new HttpError(422, "Champ 'categoryCode' requis");
  if (!categoryCodeExists(ctx.db, categoryCode)) {
    throw new HttpError(422, `Champ 'categoryCode' : categorie '${categoryCode}' introuvable`);
  }
  const tag = optionalString(body, 'tag', { max: 100 }) ?? null;

  const existing = ctx.db.prepare('SELECT id FROM label_rules WHERE word = ?').get(word) as
    | { id: number }
    | undefined;
  if (isDryRun(ctx, body)) {
    respondDryRun(ctx, {
      action: existing ? 'update' : 'create',
      entity: 'label_rule',
      entityId: existing?.id ?? word,
      before: existing ? getLabelRuleRow(ctx.db, existing.id) ?? null : null,
      after: { word, categoryCode, tag, active: true },
    });
    return;
  }
  let resultRow: LabelRuleRow | undefined;
  withTransaction(ctx.db, () => {
    ctx.db
      .prepare(
        `INSERT INTO label_rules (word, category_code, tag, active, created_at)
         VALUES (?, ?, ?, 1, datetime('now'))
         ON CONFLICT(word) DO UPDATE SET
           category_code = excluded.category_code,
           tag = excluded.tag,
           active = 1`
      )
      .run(word, categoryCode, tag);
    resultRow = ctx.db
      .prepare('SELECT id, word, category_code, tag, active, created_at FROM label_rules WHERE word = ?')
      .get(word) as unknown as LabelRuleRow;
    writeAudit(ctx.db, {
      actor: ctx.actor,
      action: existing ? 'update' : 'create',
      entity: 'label_rule',
      entityId: resultRow.id,
      before: existing ? getLabelRuleRow(ctx.db, existing.id) ?? null : null,
      after: mapLabelRule(resultRow),
    });
  });
  if (!resultRow) throw new HttpError(500, 'Regle de libelle non retrouvee apres upsert');
  sendJson(ctx.res, existing ? 200 : 201, { id: resultRow.id, rule: mapLabelRule(resultRow) });
}

/** PATCH /label-rules/{id} : categoryCode, tag (null = supprime), active. */
export async function updateLabelRule(ctx: RouteContext): Promise<void> {
  const id = requireIdParam(ctx.params, 'id');
  const before = getLabelRuleRow(ctx.db, id);
  if (!before) throw new HttpError(404, `Regle de libelle ${id} introuvable`);
  const body = await readJsonBody(ctx.req);

  let categoryCode = before.category_code;
  if ('categoryCode' in body) {
    const code = requireString(body, 'categoryCode', { max: 20 }).trim();
    if (!code) throw new HttpError(422, "Champ 'categoryCode' requis");
    if (!categoryCodeExists(ctx.db, code)) {
      throw new HttpError(422, `Champ 'categoryCode' : categorie '${code}' introuvable`);
    }
    categoryCode = code;
  }
  let tag = before.tag;
  if ('tag' in body) {
    tag = body.tag === null ? null : optionalString(body, 'tag', { max: 100 }) ?? null;
  }
  let active = before.active;
  if ('active' in body) {
    if (typeof body.active !== 'boolean') throw new HttpError(422, "Champ 'active' doit etre un booleen");
    active = body.active ? 1 : 0;
  }

  const after: LabelRuleDocument = {
    id: before.id,
    word: before.word,
    categoryCode,
    tag,
    active: active === 1,
    createdAt: before.created_at,
  };
  if (isDryRun(ctx, body)) {
    respondDryRun(ctx, { action: 'update', entity: 'label_rule', entityId: id, before: mapLabelRule(before), after });
    return;
  }
  withTransaction(ctx.db, () => {
    ctx.db
      .prepare('UPDATE label_rules SET category_code = ?, tag = ?, active = ? WHERE id = ?')
      .run(categoryCode, tag, active, id);
    writeAudit(ctx.db, {
      actor: ctx.actor,
      action: 'update',
      entity: 'label_rule',
      entityId: id,
      before: mapLabelRule(before),
      after,
    });
  });
  sendJson(ctx.res, 200, { id, rule: after });
}

/** DELETE /label-rules/{id} : suppression definitive (aucune cascade, aligne LabelRuleService.remove). */
export async function deleteLabelRule(ctx: RouteContext): Promise<void> {
  const id = requireIdParam(ctx.params, 'id');
  const before = getLabelRuleRow(ctx.db, id);
  if (!before) throw new HttpError(404, `Regle de libelle ${id} introuvable`);
  const body = await readJsonBody(ctx.req);
  if (isDryRun(ctx, body)) {
    respondDryRun(ctx, { action: 'delete', entity: 'label_rule', entityId: id, before: mapLabelRule(before), after: null });
    return;
  }
  withTransaction(ctx.db, () => {
    ctx.db.prepare('DELETE FROM label_rules WHERE id = ?').run(id);
    writeAudit(ctx.db, {
      actor: ctx.actor,
      action: 'delete',
      entity: 'label_rule',
      entityId: id,
      before: mapLabelRule(before),
      after: null,
    });
  });
  sendJson(ctx.res, 200, { ok: true, deleted: 'hard' });
}

// ---------------------------------------------------------------------------
// Application des regles de libelles (aligne LabelRuleService.applyChanges)
// ---------------------------------------------------------------------------

function isWordChar(char: string | undefined): boolean {
  return Boolean(char && /[A-Z0-9]/.test(char));
}

function labelContainsSequence(label: string, sequence: string): boolean {
  if (!sequence) return false;
  const hay = label.toUpperCase();
  const needle = sequence.toUpperCase();
  let from = 0;
  while (from <= hay.length - needle.length) {
    const idx = hay.indexOf(needle, from);
    if (idx < 0) return false;
    const before = idx === 0 || !isWordChar(hay[idx - 1]);
    const after = idx + needle.length >= hay.length || !isWordChar(hay[idx + needle.length]);
    if (before && after) return true;
    from = idx + 1;
  }
  return false;
}

interface LabelApplyChange {
  id: number;
  before: { categoryCode: string | null };
  after: { categoryCode: string };
}

/**
 * Collecte les changements prevus par les regles actives (aligne LabelRuleService.collectChanges) :
 * seules les transactions actives sans categorie sont candidates, mot le plus long prioritaire.
 */
function collectLabelRuleChanges(
  db: DatabaseSync,
  options: { ids?: number[]; importId?: number }
): LabelApplyChange[] {
  const ruleRows = db
    .prepare('SELECT id, word, category_code, tag, active, created_at FROM label_rules ORDER BY word')
    .all() as unknown as LabelRuleRow[];
  const rules = ruleRows
    .map(mapLabelRule)
    .filter((rule) => rule.active && rule.categoryCode)
    .slice()
    .sort((a, b) => b.word.length - a.word.length || a.word.localeCompare(b.word));
  if (rules.length === 0) return [];

  const clauses: string[] = [];
  const params: (number | string)[] = [];
  if (options.ids && options.ids.length > 0) {
    clauses.push(`id IN (${options.ids.map(() => '?').join(',')})`);
    params.push(...options.ids);
  }
  if (options.importId != null) {
    clauses.push('import_id = ?');
    params.push(options.importId);
  }
  const where = clauses.length
    ? `WHERE ${clauses.join(' AND ')} AND ${sqlTxActive('t')}`
    : `WHERE ${sqlTxActive('t')}`;
  const rows = db
    .prepare(`SELECT t.id, t.label, t.category_code FROM transactions t ${where}`)
    .all(...params) as unknown as { id: number; label: string; category_code: string | null }[];

  const planned: LabelApplyChange[] = [];
  for (const row of rows) {
    let matched: LabelRuleDocument | null = null;
    for (const rule of rules) {
      if (labelContainsSequence(row.label, rule.word)) {
        matched = rule;
        break;
      }
    }
    if (!matched?.categoryCode) continue;
    if (row.category_code) continue;
    planned.push({
      id: row.id,
      before: { categoryCode: row.category_code },
      after: { categoryCode: matched.categoryCode },
    });
  }
  return planned;
}

/** POST /label-rules/apply : applique les regles actives aux transactions sans categorie (dry_run = apercu). */
export async function applyLabelRules(ctx: RouteContext): Promise<void> {
  const body = await readJsonBody(ctx.req);
  let ids: number[] | undefined;
  if (body.ids !== undefined) {
    if (!Array.isArray(body.ids) || body.ids.some((v) => typeof v !== 'number' || !Number.isInteger(v) || (v as number) < 1)) {
      throw new HttpError(422, "Champ 'ids' doit etre un tableau d'entiers positifs");
    }
    ids = body.ids as number[];
  }
  let importId: number | undefined;
  if (body.import_id !== undefined && body.import_id !== null) {
    if (typeof body.import_id !== 'number' || !Number.isInteger(body.import_id) || body.import_id < 1) {
      throw new HttpError(422, "Champ 'import_id' doit etre un entier positif");
    }
    importId = body.import_id;
  }
  const planned = collectLabelRuleChanges(ctx.db, { ids, importId });
  if (isDryRun(ctx, body)) {
    sendJson(ctx.res, 200, { dry_run: true, action: 'apply', entity: 'transaction', changes: planned, count: planned.length });
    return;
  }
  if (planned.length > 0) {
    withTransaction(ctx.db, () => {
      for (const change of planned) {
        ctx.db
          .prepare(`UPDATE transactions SET category_code = ?, updated_at = datetime('now') WHERE id = ?`)
          .run(change.after.categoryCode, change.id);
      }
      writeAudit(ctx.db, {
        actor: ctx.actor,
        action: 'update',
        entity: 'transaction',
        entityId: null,
        before: null,
        after: { operation: 'apply_label_rules', ids: planned.map((c) => c.id), changes: planned },
      });
    });
  }
  sendJson(ctx.res, 200, { applied: planned.length, changes: planned });
}

export async function listAccounts(ctx: RouteContext): Promise<void> {
  const rows = ctx.db.prepare('SELECT * FROM accounts ORDER BY code').all() as unknown as AccountRow[];
  sendJson(ctx.res, 200, { items: rows, total: rows.length });
}

export async function getAccount(ctx: RouteContext): Promise<void> {
  const id = requireIdParam(ctx.params, 'id');
  const row = getAccountRow(ctx.db, id);
  if (!row) throw new HttpError(404, `Compte ${id} introuvable`);
  sendJson(ctx.res, 200, row);
}

export async function createAccount(ctx: RouteContext): Promise<void> {
  const body = await readJsonBody(ctx.req);
  const code = requireString(body, 'code', { max: 64 });
  const name = requireString(body, 'name', { max: 200 });
  const colorRaw = optionalString(body, 'color', { max: 9 });
  const color = colorRaw === undefined || colorRaw === null ? '#4a90e2' : validateHexColor(colorRaw, 'color');
  const initialBalance = optionalNumber(body, 'initial_balance');
  const afterPreview = { code, name, color, initial_balance: initialBalance ?? 0 };
  if (isDryRun(ctx, body)) {
    respondDryRun(ctx, { action: 'create', entity: 'account', entityId: null, before: null, after: afterPreview });
    return;
  }
  const id = withTransaction(ctx.db, () => {
    const result = ctx.db
      .prepare('INSERT INTO accounts (code, name, color, initial_balance) VALUES (?, ?, ?, ?)')
      .run(code, name, color, initialBalance ?? 0);
    const newId = Number(result.lastInsertRowid);
    writeAudit(ctx.db, {
      actor: ctx.actor,
      action: 'create',
      entity: 'account',
      entityId: newId,
      before: null,
      after: getAccountRow(ctx.db, newId),
    });
    return newId;
  });
  sendJson(ctx.res, 201, { id, account: getAccountRow(ctx.db, id) });
}

export async function updateAccount(ctx: RouteContext): Promise<void> {
  const id = requireIdParam(ctx.params, 'id');
  const body = await readJsonBody(ctx.req);
  const before = getAccountRow(ctx.db, id);
  if (!before) throw new HttpError(404, `Compte ${id} introuvable`);
  const after: AccountRow = { ...before };
  if ('code' in body) after.code = requireString(body, 'code', { max: 64 });
  if ('name' in body) after.name = requireString(body, 'name', { max: 200 });
  if ('color' in body) {
    const raw = optionalString(body, 'color', { max: 9 });
    after.color = raw === undefined || raw === null ? before.color : validateHexColor(raw, 'color');
  }
  if ('initial_balance' in body) {
    const raw = optionalNumber(body, 'initial_balance');
    after.initial_balance = raw === undefined || raw === null ? before.initial_balance : raw;
  }
  if (isDryRun(ctx, body)) {
    respondDryRun(ctx, { action: 'update', entity: 'account', entityId: id, before, after });
    return;
  }
  withTransaction(ctx.db, () => {
    ctx.db
      .prepare('UPDATE accounts SET code = ?, name = ?, color = ?, initial_balance = ? WHERE id = ?')
      .run(after.code, after.name, after.color, after.initial_balance, id);
    writeAudit(ctx.db, {
      actor: ctx.actor,
      action: 'update',
      entity: 'account',
      entityId: id,
      before,
      after: getAccountRow(ctx.db, id),
    });
  });
  sendJson(ctx.res, 200, { account: getAccountRow(ctx.db, id) });
}

export async function deleteAccount(ctx: RouteContext): Promise<void> {
  const id = requireIdParam(ctx.params, 'id');
  const body = await readJsonBody(ctx.req);
  const before = getAccountRow(ctx.db, id);
  if (!before) throw new HttpError(404, `Compte ${id} introuvable`);
  if (!boolQuery(ctx.query, 'confirm') && body.confirm !== true) {
    throw new HttpError(400, "Suppression destructive (cascade transactions) : ajouter ?confirm=true");
  }
  if (isDryRun(ctx, body)) {
    respondDryRun(ctx, { action: 'delete', entity: 'account', entityId: id, before, after: null });
    return;
  }
  withTransaction(ctx.db, () => {
    ctx.db.prepare('DELETE FROM accounts WHERE id = ?').run(id);
    writeAudit(ctx.db, {
      actor: ctx.actor,
      action: 'delete',
      entity: 'account',
      entityId: id,
      before: { ...before, cascade: 'transactions supprimees (FK ON DELETE CASCADE)' },
      after: null,
    });
  });
  sendJson(ctx.res, 200, { ok: true, deleted: 'hard', cascade: 'transactions' });
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export async function listCategories(ctx: RouteContext): Promise<void> {
  const rows = ctx.db.prepare('SELECT * FROM categories ORDER BY code').all() as unknown as CategoryRow[];
  sendJson(ctx.res, 200, { items: rows, total: rows.length });
}

export async function getCategory(ctx: RouteContext): Promise<void> {
  const id = requireIdParam(ctx.params, 'id');
  const row = getCategoryRow(ctx.db, id);
  if (!row) throw new HttpError(404, `Categorie ${id} introuvable`);
  sendJson(ctx.res, 200, row);
}

export async function createCategory(ctx: RouteContext): Promise<void> {
  const body = await readJsonBody(ctx.req);
  const code = requireString(body, 'code', { max: 64 }).toUpperCase();
  const name = requireString(body, 'name', { max: 200 });
  const colorRaw = optionalString(body, 'color', { max: 9 });
  let color = colorRaw === undefined || colorRaw === null ? '#94a3b8' : validateHexColor(colorRaw, 'color');
  if (code === TRANSFER_CODE) color = '#ffffff';
  const groupId = optionalNumber(body, 'group_id');
  const afterPreview = { code, name, color, group_id: groupId ?? null };
  if (isDryRun(ctx, body)) {
    respondDryRun(ctx, { action: 'create', entity: 'category', entityId: null, before: null, after: afterPreview });
    return;
  }
  const id = withTransaction(ctx.db, () => {
    const result = ctx.db
      .prepare('INSERT INTO categories (code, name, color, group_id) VALUES (?, ?, ?, ?)')
      .run(code, name, color, groupId ?? null);
    const newId = Number(result.lastInsertRowid);
    writeAudit(ctx.db, {
      actor: ctx.actor,
      action: 'create',
      entity: 'category',
      entityId: newId,
      before: null,
      after: getCategoryRow(ctx.db, newId),
    });
    return newId;
  });
  sendJson(ctx.res, 201, { id, category: getCategoryRow(ctx.db, id) });
}

export async function updateCategory(ctx: RouteContext): Promise<void> {
  const id = requireIdParam(ctx.params, 'id');
  const body = await readJsonBody(ctx.req);
  const before = getCategoryRow(ctx.db, id);
  if (!before) throw new HttpError(404, `Categorie ${id} introuvable`);
  const transferLocked = before.code === TRANSFER_CODE;
  if (transferLocked && ('code' in body || 'name' in body || 'color' in body)) {
    throw new HttpError(422, "Categorie 'X' (transferts) protegee : seul group_id est modifiable");
  }
  const after: CategoryRow = { ...before };
  let newCode: string | undefined;
  if ('code' in body) {
    newCode = requireString(body, 'code', { max: 64 }).toUpperCase();
    if (newCode === TRANSFER_CODE) {
      throw new HttpError(422, "Le code 'X' (transferts) est reserve");
    }
    after.code = newCode;
  }
  if ('name' in body) after.name = requireString(body, 'name', { max: 200 });
  if ('color' in body) {
    const raw = optionalString(body, 'color', { max: 9 });
    after.color = raw === undefined || raw === null ? before.color : validateHexColor(raw, 'color');
  }
  if ('group_id' in body) {
    const raw = optionalNumber(body, 'group_id');
    after.group_id = raw === undefined || raw === null ? null : raw;
  }
  if (isDryRun(ctx, body)) {
    respondDryRun(ctx, { action: 'update', entity: 'category', entityId: id, before, after });
    return;
  }
  withTransaction(ctx.db, () => {
    ctx.db
      .prepare('UPDATE categories SET code = ?, name = ?, color = ?, group_id = ? WHERE id = ?')
      .run(after.code, after.name, after.color, after.group_id, id);
    if (newCode !== undefined && newCode !== before.code) {
      // Repercute le changement de code (aligne ConfigService.updateCategory).
      ctx.db
        .prepare('UPDATE transactions SET category_code = ? WHERE category_code = ?')
        .run(newCode, before.code);
      ctx.db
        .prepare('UPDATE autocat_stats SET category_code = ? WHERE category_code = ?')
        .run(newCode, before.code);
    }
    writeAudit(ctx.db, {
      actor: ctx.actor,
      action: 'update',
      entity: 'category',
      entityId: id,
      before,
      after: getCategoryRow(ctx.db, id),
    });
  });
  sendJson(ctx.res, 200, { category: getCategoryRow(ctx.db, id) });
}

export async function deleteCategory(ctx: RouteContext): Promise<void> {
  const id = requireIdParam(ctx.params, 'id');
  const body = await readJsonBody(ctx.req);
  const before = getCategoryRow(ctx.db, id);
  if (!before) throw new HttpError(404, `Categorie ${id} introuvable`);
  if (before.code === TRANSFER_CODE) {
    throw new HttpError(422, "Categorie 'X' (transferts) protegee : suppression interdite");
  }
  if (isDryRun(ctx, body)) {
    respondDryRun(ctx, {
      action: 'delete',
      entity: 'category',
      entityId: id,
      before,
      after: { note: 'transactions.category_code remis a NULL, autocat_stats et label_rules nettoyes' },
    });
    return;
  }
  withTransaction(ctx.db, () => {
    ctx.db.prepare('DELETE FROM categories WHERE id = ?').run(id);
    ctx.db
      .prepare('UPDATE transactions SET category_code = NULL WHERE category_code = ?')
      .run(before.code);
    ctx.db.prepare('DELETE FROM autocat_stats WHERE category_code = ?').run(before.code);
    ctx.db.prepare('DELETE FROM label_rules WHERE category_code = ?').run(before.code);
    writeAudit(ctx.db, {
      actor: ctx.actor,
      action: 'delete',
      entity: 'category',
      entityId: id,
      before,
      after: null,
    });
  });
  sendJson(ctx.res, 200, { ok: true, deleted: 'hard' });
}

// ---------------------------------------------------------------------------
// Journal d'audit (lecture seule)
// ---------------------------------------------------------------------------

interface AuditRow {
  id: number;
  ts: string;
  actor: string;
  action: string;
  entity: string;
  entity_id: string | null;
  before_json: string | null;
  after_json: string | null;
}

export async function listAudit(ctx: RouteContext): Promise<void> {
  const limit = intQuery(ctx.query, 'limit', { def: DEFAULT_LIMIT, min: 1, max: MAX_LIMIT });
  const offset = intQuery(ctx.query, 'offset', { def: 0, min: 0, max: 10_000_000 });
  const total = (ctx.db.prepare('SELECT COUNT(*) AS n FROM audit_log').get() as { n: number }).n;
  const rows = ctx.db
    .prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT ? OFFSET ?')
    .all(limit, offset) as unknown as AuditRow[];
  const items = rows.map((r) => ({
    id: r.id,
    ts: r.ts,
    actor: r.actor,
    action: r.action,
    entity: r.entity,
    entity_id: r.entity_id,
    before: r.before_json === null ? null : JSON.parse(r.before_json),
    after: r.after_json === null ? null : JSON.parse(r.after_json),
  }));
  sendJson(ctx.res, 200, { items, total, limit, offset });
}

// ---------------------------------------------------------------------------
// Regroupements de categories (lecture seule, aligne ConfigService.listCategoryGroups)
// ---------------------------------------------------------------------------

interface CategoryGroupRow {
  id: number;
  name: string;
  color: string;
  sort_order: number;
  created_at: string;
}

function getCategoryGroupRow(db: DatabaseSync, id: number): CategoryGroupRow | undefined {
  return db
    .prepare('SELECT id, name, color, sort_order, created_at FROM category_groups WHERE id = ?')
    .get(id) as CategoryGroupRow | undefined;
}

export async function listCategoryGroups(ctx: RouteContext): Promise<void> {
  const rows = ctx.db
    .prepare('SELECT id, name, color, sort_order, created_at FROM category_groups ORDER BY sort_order, name')
    .all() as unknown as CategoryGroupRow[];
  sendJson(ctx.res, 200, { items: rows, total: rows.length });
}

export async function getCategoryGroup(ctx: RouteContext): Promise<void> {
  const id = requireIdParam(ctx.params, 'id');
  const row = ctx.db
    .prepare('SELECT id, name, color, sort_order, created_at FROM category_groups WHERE id = ?')
    .get(id) as CategoryGroupRow | undefined;
  if (!row) throw new HttpError(404, `Regroupement ${id} introuvable`);
  sendJson(ctx.res, 200, row);
}

/** POST /category-groups : cree un regroupement (aligne ConfigService.createCategoryGroup). */
export async function createCategoryGroup(ctx: RouteContext): Promise<void> {
  const body = await readJsonBody(ctx.req);
  const name = requireString(body, 'name', { max: 100 });
  const colorRaw = optionalString(body, 'color', { max: 9 });
  const color = colorRaw === undefined || colorRaw === null ? '#64748b' : validateHexColor(colorRaw, 'color');
  if (isDryRun(ctx, body)) {
    respondDryRun(ctx, {
      action: 'create',
      entity: 'category_group',
      entityId: null,
      before: null,
      after: { name, color, sort_order: 'MAX(sort_order) + 1' },
    });
    return;
  }
  const id = withTransaction(ctx.db, () => {
    const maxRow = ctx.db
      .prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM category_groups')
      .get() as unknown as { n: number };
    const result = ctx.db
      .prepare('INSERT INTO category_groups (name, color, sort_order) VALUES (?, ?, ?)')
      .run(name, color, maxRow.n);
    const newId = Number(result.lastInsertRowid);
    writeAudit(ctx.db, {
      actor: ctx.actor,
      action: 'create',
      entity: 'category_group',
      entityId: newId,
      before: null,
      after: getCategoryGroupRow(ctx.db, newId) ?? null,
    });
    return newId;
  });
  sendJson(ctx.res, 201, { id, categoryGroup: getCategoryGroupRow(ctx.db, id) });
}

/** PATCH /category-groups/{id} : name / color / sort_order partiels (aligne ConfigService.updateCategoryGroup). */
export async function updateCategoryGroup(ctx: RouteContext): Promise<void> {
  const id = requireIdParam(ctx.params, 'id');
  const body = await readJsonBody(ctx.req);
  const before = getCategoryGroupRow(ctx.db, id);
  if (!before) throw new HttpError(404, `Regroupement ${id} introuvable`);
  const after: CategoryGroupRow = { ...before };
  if ('name' in body) after.name = requireString(body, 'name', { max: 100 });
  if ('color' in body) {
    const raw = optionalString(body, 'color', { max: 9 });
    after.color = raw === undefined || raw === null ? before.color : validateHexColor(raw, 'color');
  }
  if ('sort_order' in body) {
    const raw = optionalNumber(body, 'sort_order', { min: 0 });
    after.sort_order = raw === undefined || raw === null ? before.sort_order : raw;
  }
  if (isDryRun(ctx, body)) {
    respondDryRun(ctx, { action: 'update', entity: 'category_group', entityId: id, before, after });
    return;
  }
  withTransaction(ctx.db, () => {
    ctx.db
      .prepare('UPDATE category_groups SET name = ?, color = ?, sort_order = ? WHERE id = ?')
      .run(after.name, after.color, after.sort_order, id);
    writeAudit(ctx.db, {
      actor: ctx.actor,
      action: 'update',
      entity: 'category_group',
      entityId: id,
      before,
      after: getCategoryGroupRow(ctx.db, id) ?? null,
    });
  });
  sendJson(ctx.res, 200, { categoryGroup: getCategoryGroupRow(ctx.db, id) });
}

/** DELETE /category-groups/{id} : categories.group_id remis a NULL puis suppression (aligne ConfigService.deleteCategoryGroup). */
export async function deleteCategoryGroup(ctx: RouteContext): Promise<void> {
  const id = requireIdParam(ctx.params, 'id');
  const body = await readJsonBody(ctx.req);
  const before = getCategoryGroupRow(ctx.db, id);
  if (!before) throw new HttpError(404, `Regroupement ${id} introuvable`);
  if (isDryRun(ctx, body)) {
    respondDryRun(ctx, {
      action: 'delete',
      entity: 'category_group',
      entityId: id,
      before,
      after: { note: 'categories.group_id remis a NULL, regroupement supprime' },
    });
    return;
  }
  withTransaction(ctx.db, () => {
    ctx.db.prepare('UPDATE categories SET group_id = NULL WHERE group_id = ?').run(id);
    ctx.db.prepare('DELETE FROM category_groups WHERE id = ?').run(id);
    writeAudit(ctx.db, {
      actor: ctx.actor,
      action: 'delete',
      entity: 'category_group',
      entityId: id,
      before,
      after: null,
    });
  });
  sendJson(ctx.res, 200, { ok: true, deleted: 'hard', cascade: 'categories.group_id -> NULL' });
}

// ---------------------------------------------------------------------------
// Soldes / nets (lecture seule, requetes identiques a ConfigService.categoryNets / accountNets)
// ---------------------------------------------------------------------------

function sqlTxActive(alias: string): string {
  const col = `${alias}.deleted_at`;
  return `(${col} IS NULL OR ${col} = '')`;
}

export async function getBalances(ctx: RouteContext): Promise<void> {
  const catRows = ctx.db
    .prepare(
      `SELECT c.code, COALESCE(SUM(t.debit + t.credit), 0) AS net
       FROM categories c
       LEFT JOIN transactions t ON t.category_code = c.code AND ${sqlTxActive('t')}
       GROUP BY c.code`
    )
    .all() as unknown as { code: string; net: number }[];
  const accRows = ctx.db
    .prepare(
      `SELECT a.code, a.initial_balance + COALESCE(SUM(t.debit + t.credit), 0) AS net
       FROM accounts a
       LEFT JOIN transactions t ON t.account_id = a.id AND ${sqlTxActive('t')}
       GROUP BY a.id`
    )
    .all() as unknown as { code: string; net: number }[];
  sendJson(ctx.res, 200, {
    accounts: Object.fromEntries(accRows.map((r) => [r.code, Number(r.net)])),
    categories: Object.fromEntries(catRows.map((r) => [r.code, Number(r.net)])),
  });
}

// ---------------------------------------------------------------------------
// Statistiques (aligne StatsService de l'app : where/kpis/distinctPeriods/
// categoryTotals). Filtres communs en query params CSV.
// ---------------------------------------------------------------------------

interface StatsWhere {
  sql: string;
  params: (string | number)[];
}

/** Copie de StatsService.where : filtres communs des stats en query params. */
function statsWhere(ctx: RouteContext): StatsWhere {
  const clauses: string[] = [sqlTxActive('t')];
  const params: (string | number)[] = [];
  const accountIds = csvIntQuery(ctx.query, 'account_ids', { maxItems: 50, min: 1, max: 1_000_000 });
  if (accountIds.length > 0) {
    clauses.push(`t.account_id IN (${accountIds.map(() => '?').join(',')})`);
    params.push(...accountIds);
  }
  const categoryCodes = csvQuery(ctx.query, 'category_codes', { maxItems: 100, maxLen: 20 });
  if (categoryCodes.length > 0) {
    clauses.push(`t.category_code IN (${categoryCodes.map(() => '?').join(',')})`);
    params.push(...categoryCodes);
  }
  const excludeCategories = csvQuery(ctx.query, 'exclude_categories', { maxItems: 100, maxLen: 20 });
  if (excludeCategories.length > 0) {
    clauses.push(`(t.category_code IS NULL OR t.category_code NOT IN (${excludeCategories.map(() => '?').join(',')}))`);
    params.push(...excludeCategories);
  }
  const dateStart = ctx.query.get('date_start');
  if (dateStart) {
    validateIsoDate(dateStart, 'date_start');
    clauses.push('t.date >= ?');
    params.push(dateStart);
  }
  const dateEnd = ctx.query.get('date_end');
  if (dateEnd) {
    validateIsoDate(dateEnd, 'date_end');
    clauses.push('t.date <= ?');
    params.push(dateEnd);
  }
  const search = ctx.query.get('search');
  if (search && search.trim()) {
    clauses.push(`t.label LIKE ? ESCAPE '\\' COLLATE NOCASE`);
    params.push(`%${escapeLike(search.trim())}%`);
  }
  return { sql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/** GET /stats/kpis : revenus, depenses, net, plus gros montants (aligne StatsService.kpis). */
export async function getStatsKpis(ctx: RouteContext): Promise<void> {
  const { sql, params } = statsWhere(ctx);
  const row = ctx.db
    .prepare(
      `SELECT
         COALESCE(SUM(t.credit), 0) AS income,
         COALESCE(SUM(-t.debit), 0) AS expenses,
         COUNT(*) AS n,
         COALESCE(MAX(t.credit), 0) AS largestIncome,
         COALESCE(MAX(CASE WHEN t.debit < 0 THEN -t.debit ELSE NULL END), 0) AS largestExpense,
         COALESCE(AVG(ABS(t.debit) + ABS(t.credit)), 0) AS avgAmount
       FROM transactions t ${sql}`
    )
    .get(...params) as unknown as {
    income: number;
    expenses: number;
    n: number;
    largestIncome: number;
    largestExpense: number;
    avgAmount: number;
  };
  const income = Number(row?.income ?? 0);
  const expenses = Number(row?.expenses ?? 0);
  sendJson(ctx.res, 200, {
    income,
    expenses,
    net: income - expenses,
    count: Number(row?.n ?? 0),
    largestIncome: Number(row?.largestIncome ?? 0),
    largestExpense: Number(row?.largestExpense ?? 0),
    avgAmount: Number(row?.avgAmount ?? 0),
  });
}

/** GET /stats/periods : semaines/mois/annees distincts des transactions (aligne distinctPeriods). */
export async function getStatsPeriods(ctx: RouteContext): Promise<void> {
  const active = sqlTxActive('t');
  const weekRows = ctx.db
    .prepare(
      `SELECT DISTINCT date(t.date, '-' || ((CAST(strftime('%w', t.date) AS INTEGER) + 6) % 7) || ' days') AS weekStart
       FROM transactions t
       WHERE t.date IS NOT NULL AND t.date != '' AND ${active}
       ORDER BY weekStart DESC`
    )
    .all() as unknown as { weekStart: string }[];
  const monthRows = ctx.db
    .prepare(
      `SELECT DISTINCT strftime('%Y-%m', t.date) AS ym
       FROM transactions t
       WHERE t.date IS NOT NULL AND t.date != '' AND ${active}
       ORDER BY ym DESC`
    )
    .all() as unknown as { ym: string }[];
  const yearRows = ctx.db
    .prepare(
      `SELECT DISTINCT strftime('%Y', t.date) AS y
       FROM transactions t
       WHERE t.date IS NOT NULL AND t.date != '' AND ${active}
       ORDER BY y DESC`
    )
    .all() as unknown as { y: string }[];

  const lastDayOfMonth = (ym: string): string => {
    const parts = ym.split('-');
    const y = Number(parts[0] ?? 0);
    const m = Number(parts[1] ?? 0);
    const last = new Date(Date.UTC(y, m, 0));
    const dd = String(last.getUTCDate()).padStart(2, '0');
    return `${ym}-${dd}`;
  };
  const addSixDays = (iso: string): string => {
    const d = new Date(`${iso}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 6);
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  sendJson(ctx.res, 200, {
    weeks: weekRows
      .filter((r) => r.weekStart)
      .map((r) => ({ start: r.weekStart, end: addSixDays(r.weekStart) })),
    months: monthRows
      .filter((r) => r.ym)
      .map((r) => ({ start: `${r.ym}-01`, end: lastDayOfMonth(r.ym) })),
    years: yearRows
      .filter((r) => r.y)
      .map((r) => ({ start: `${r.y}-01-01`, end: `${r.y}-12-31` })),
  });
}

/** GET /stats/category-totals : totaux par categorie (aligne StatsService.categoryTotals). */
export async function getStatsCategoryTotals(ctx: RouteContext): Promise<void> {
  const { sql, params } = statsWhere(ctx);
  const rows = ctx.db
    .prepare(
      `SELECT t.category_code AS categoryCode,
              COALESCE(SUM(t.debit + t.credit), 0) AS net,
              COALESCE(SUM(t.credit), 0) AS income,
              COALESCE(SUM(-t.debit), 0) AS expenses,
              COUNT(*) AS txCount
       FROM transactions t ${sql}
       GROUP BY t.category_code
       ORDER BY ABS(SUM(t.debit + t.credit)) DESC`
    )
    .all(...params) as unknown as {
    categoryCode: string | null;
    net: number;
    income: number;
    expenses: number;
    txCount: number;
  }[];
  sendJson(ctx.res, 200, {
    items: rows.map((r) => ({
      categoryCode: r.categoryCode,
      net: Number(r.net),
      income: Number(r.income),
      expenses: Number(r.expenses),
      txCount: Number(r.txCount),
    })),
  });
}

// ---------------------------------------------------------------------------
// Facturation : devis et factures (payload JSON, aligne InvoiceService)
// ---------------------------------------------------------------------------

export interface DocRow {
  id: string;
  client_id: string;
  numero: string;
  statut: string;
  devis_origine?: string | null;
  supprime: number;
  payload: string;
  updated_at: string;
}

export function getDocRow(db: DatabaseSync, table: 'devis' | 'factures', id: string): DocRow | undefined {
  return db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id) as DocRow | undefined;
}

function numeroTaken(db: DatabaseSync, table: 'devis' | 'factures', numero: string, id: string): boolean {
  return db.prepare(`SELECT 1 FROM ${table} WHERE numero = ? AND id != ?`).get(numero, id) !== undefined;
}

function listDocs(ctx: RouteContext, table: 'devis' | 'factures'): void {
  const includeDeleted = boolQuery(ctx.query, 'include_deleted');
  const limit = intQuery(ctx.query, 'limit', { def: DEFAULT_LIMIT, min: 1, max: MAX_LIMIT });
  const offset = intQuery(ctx.query, 'offset', { def: 0, min: 0, max: 10_000_000 });
  const whereDeleted = includeDeleted ? '' : ' WHERE supprime = 0';
  const total = (
    ctx.db.prepare(`SELECT COUNT(*) AS n FROM ${table}${whereDeleted}`).get() as { n: number }
  ).n;
  const rows = ctx.db
    .prepare(`SELECT * FROM ${table}${whereDeleted} ORDER BY updated_at DESC LIMIT ? OFFSET ?`)
    .all(limit, offset) as unknown as DocRow[];
  const items = rows.map((row) => JSON.parse(row.payload) as Record<string, unknown>);
  sendJson(ctx.res, 200, { items, total, limit, offset });
}

function getDoc(ctx: RouteContext, table: 'devis' | 'factures'): void {
  const id = ctx.params['id'] ?? '';
  const row = getDocRow(ctx.db, table, id);
  if (!row || row.supprime !== 0) throw new HttpError(404, `Document ${id} introuvable`);
  sendJson(ctx.res, 200, JSON.parse(row.payload) as Record<string, unknown>);
}

function insertDoc(
  ctx: RouteContext,
  table: 'devis' | 'factures',
  columns: { id: string; client_id: string; numero: string; statut: string; devis_origine?: string | null; payload: string },
  document: Record<string, unknown>
): void {
  if (numeroTaken(ctx.db, table, columns.numero, columns.id)) {
    throw new HttpError(422, `Numero '${columns.numero}' deja utilise`);
  }
  if (table === 'factures' && columns.devis_origine) {
    const origin = getDocRow(ctx.db, 'devis', columns.devis_origine);
    if (!origin) throw new HttpError(422, `Devis origine '${columns.devis_origine}' introuvable`);
  }
  const devisCols = columns as { devis_origine?: string | null };
  if (table === 'devis') {
    ctx.db
      .prepare(
        `INSERT INTO devis (id, client_id, numero, statut, supprime, payload, updated_at)
         VALUES (?, ?, ?, ?, 0, ?, ?)`
      )
      .run(columns.id, columns.client_id, columns.numero, columns.statut, columns.payload, new Date().toISOString());
  } else {
    ctx.db
      .prepare(
        `INSERT INTO factures (id, client_id, numero, statut, devis_origine, supprime, payload, updated_at)
         VALUES (?, ?, ?, ?, ?, 0, ?, ?)`
      )
      .run(
        columns.id,
        columns.client_id,
        columns.numero,
        columns.statut,
        devisCols.devis_origine ?? null,
        columns.payload,
        new Date().toISOString()
      );
  }
  writeAudit(ctx.db, {
    actor: ctx.actor,
    action: 'create',
    entity: table === 'devis' ? 'devis' : 'facture',
    entityId: columns.id,
    before: null,
    after: document,
  });
}

export async function listDevis(ctx: RouteContext): Promise<void> {
  listDocs(ctx, 'devis');
}

export async function getDevis(ctx: RouteContext): Promise<void> {
  getDoc(ctx, 'devis');
}

export async function createDevis(ctx: RouteContext): Promise<void> {
  const body = await readJsonBody(ctx.req);
  const { columns, document } = normalizeDevisInput(body);
  if (isDryRun(ctx, body)) {
    respondDryRun(ctx, { action: 'create', entity: 'devis', entityId: columns.id, before: null, after: document });
    return;
  }
  withTransaction(ctx.db, () => insertDoc(ctx, 'devis', columns, document));
  sendJson(ctx.res, 201, { id: columns.id, devis: document });
}

export async function listFactures(ctx: RouteContext): Promise<void> {
  listDocs(ctx, 'factures');
}

export async function getFacture(ctx: RouteContext): Promise<void> {
  getDoc(ctx, 'factures');
}

export async function createFacture(ctx: RouteContext): Promise<void> {
  const body = await readJsonBody(ctx.req);
  const { columns, document } = normalizeFactureInput(body);
  if (isDryRun(ctx, body)) {
    respondDryRun(ctx, { action: 'create', entity: 'facture', entityId: columns.id, before: null, after: document });
    return;
  }
  withTransaction(ctx.db, () => insertDoc(ctx, 'factures', columns, document));
  sendJson(ctx.res, 201, { id: columns.id, facture: document });
}

/** POST /factures/{id}/avoir : cree un avoir (facture invertee) depuis une facture. */
export async function createAvoir(ctx: RouteContext): Promise<void> {
  const id = ctx.params['id'] ?? '';
  const body = await readJsonBody(ctx.req);
  const originRow = getDocRow(ctx.db, 'factures', id);
  if (!originRow || originRow.supprime !== 0) {
    throw new HttpError(404, `Facture ${id} introuvable`);
  }
  const origin = JSON.parse(originRow.payload) as Record<string, unknown>;
  if (origin.isAvoir) {
    throw new HttpError(422, 'Impossible de creer un avoir sur un avoir');
  }
  // Numero : fourni dans le body, sinon genere automatiquement (invoice_settings).
  // En dry_run, la sequence n'est pas persistee.
  if (body.numero === undefined || body.numero === null || body.numero === '') {
    body.numero = buildNextNumeroFacture(ctx.db, !isDryRun(ctx, body));
  }
  const { columns, document } = normalizeAvoirInput(origin, body);
  if (isDryRun(ctx, body)) {
    respondDryRun(ctx, { action: 'create', entity: 'facture', entityId: columns.id, before: null, after: document });
    return;
  }
  withTransaction(ctx.db, () => insertDoc(ctx, 'factures', columns, document));
  sendJson(ctx.res, 201, { id: columns.id, avoir: document });
}

function updateDocRow(
  ctx: RouteContext,
  table: 'devis' | 'factures',
  id: string,
  before: Record<string, unknown>,
  columns: { id: string; client_id: string; numero: string; statut: string; devis_origine?: string | null; payload: string },
  document: Record<string, unknown>
): void {
  if (numeroTaken(ctx.db, table, columns.numero, id)) {
    throw new HttpError(422, `Numero '${columns.numero}' deja utilise`);
  }
  if (table === 'factures' && columns.devis_origine) {
    const origin = getDocRow(ctx.db, 'devis', columns.devis_origine);
    if (!origin) throw new HttpError(422, `Devis origine '${columns.devis_origine}' introuvable`);
  }
  const now = new Date().toISOString();
  if (table === 'devis') {
    ctx.db
      .prepare(`UPDATE devis SET client_id = ?, numero = ?, statut = ?, payload = ?, updated_at = ? WHERE id = ?`)
      .run(columns.client_id, columns.numero, columns.statut, columns.payload, now, id);
  } else {
    ctx.db
      .prepare(
        `UPDATE factures SET client_id = ?, numero = ?, statut = ?, devis_origine = ?, payload = ?, updated_at = ? WHERE id = ?`
      )
      .run(columns.client_id, columns.numero, columns.statut, columns.devis_origine ?? null, columns.payload, now, id);
  }
  writeAudit(ctx.db, {
    actor: ctx.actor,
    action: 'update',
    entity: table === 'devis' ? 'devis' : 'facture',
    entityId: id,
    before,
    after: document,
  });
}

export async function updateDevis(ctx: RouteContext): Promise<void> {
  const id = ctx.params['id'] ?? '';
  const row = getDocRow(ctx.db, 'devis', id);
  if (!row || row.supprime !== 0) throw new HttpError(404, `Document ${id} introuvable`);
  const body = await readJsonBody(ctx.req);
  const before = JSON.parse(row.payload) as Record<string, unknown>;
  const { columns, document } = normalizeDevisPatchInput(before, body);
  if (isDryRun(ctx, body)) {
    respondDryRun(ctx, { action: 'update', entity: 'devis', entityId: id, before, after: document });
    return;
  }
  withTransaction(ctx.db, () => updateDocRow(ctx, 'devis', id, before, columns, document));
  sendJson(ctx.res, 200, { id, devis: document });
}

export async function updateFacture(ctx: RouteContext): Promise<void> {
  const id = ctx.params['id'] ?? '';
  const row = getDocRow(ctx.db, 'factures', id);
  if (!row || row.supprime !== 0) throw new HttpError(404, `Document ${id} introuvable`);
  const body = await readJsonBody(ctx.req);
  const before = JSON.parse(row.payload) as Record<string, unknown>;
  const { columns, document } = normalizeFacturePatchInput(before, body);
  if (isDryRun(ctx, body)) {
    respondDryRun(ctx, { action: 'update', entity: 'facture', entityId: id, before, after: document });
    return;
  }
  withTransaction(ctx.db, () => updateDocRow(ctx, 'factures', id, before, columns, document));
  sendJson(ctx.res, 200, { id, facture: document });
}

// ---------------------------------------------------------------------------
// Contacts / clients (payload JSON, aligne ClientService)
// ---------------------------------------------------------------------------

interface ClientRow {
  id: string;
  code_client: string | null;
  type: string;
  archived: number;
  payload: string;
  updated_at: string;
}

function getContactRow(db: DatabaseSync, id: string): ClientRow | undefined {
  return db.prepare('SELECT * FROM clients WHERE id = ?').get(id) as ClientRow | undefined;
}

/** Genere un id metier (aligne newEntityId de l'app). */
function newEntityId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Validation legere d'email (aligne isLightEmail de l'app). */
function isLightEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

/** Validation IBAN modulo 97 (aligne EmetteurService.validateIban de l'app). */
function validateIban(iban: string): boolean {
  const cleaned = iban.replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(cleaned)) return false;
  const rearranged = cleaned.slice(4) + cleaned.slice(0, 4);
  const expanded = rearranged.replace(/[A-Z]/g, (char) => String(char.charCodeAt(0) - 55));
  let checksum = 0;
  for (const char of expanded) {
    const digit = char.charCodeAt(0) - 48;
    if (digit < 0 || digit > 9) return false;
    checksum = (checksum * 10 + digit) % 97;
  }
  return checksum === 1;
}

interface AdresseDoc {
  rue: string;
  codePostal: string;
  ville: string;
  pays: string;
}

/** Normalise une adresse (aligne reviveAdresse de l'app : pays 'France' par defaut). */
function normalizeAdresse(raw: unknown, field: string): AdresseDoc {
  if (raw === undefined || raw === null) {
    return { rue: '', codePostal: '', ville: '', pays: 'France' };
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new HttpError(422, `Champ '${field}' doit etre un objet`);
  }
  const obj = raw as Record<string, unknown>;
  const str = (key: string): string => (typeof obj[key] === 'string' ? (obj[key] as string) : '');
  return { rue: str('rue'), codePostal: str('codePostal'), ville: str('ville'), pays: str('pays') || 'France' };
}

const CONTACT_STRING_FIELDS = [
  'civilite',
  'nom',
  'prenom',
  'denominationSociale',
  'formeJuridique',
  'siren',
  'siret',
  'numeroTVA',
  'codeNAF',
  'telephone',
  'notes',
  'groupeId',
] as const;

function normalizeQuery(value: string): string {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

/** Prefixe du code client (aligne getClientPrefix de l'app). */
function getClientPrefix(doc: Record<string, unknown>): string {
  if (doc.type === 'particulier') {
    const nom = typeof doc.nom === 'string' ? doc.nom : '';
    const prenom = typeof doc.prenom === 'string' ? doc.prenom : '';
    const initials = `${nom.trim().charAt(0)}${prenom.trim().charAt(0)}`.toUpperCase();
    if (initials.length === 2) return initials;
  }
  const source =
    (typeof doc.denominationSociale === 'string' && doc.denominationSociale) ||
    (typeof doc.nom === 'string' && doc.nom) ||
    (typeof doc.prenom === 'string' && doc.prenom) ||
    'CL';
  const cleaned = String(source)
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z]/g, '');
  if (cleaned.length >= 2) return cleaned.slice(0, 2);
  return 'CL';
}

/** Code client auto-incremente (aligne generateCodeClient de l'app). */
function generateCodeClient(db: DatabaseSync, doc: Record<string, unknown>): string {
  const prefix = getClientPrefix(doc);
  const rows = db
    .prepare('SELECT code_client FROM clients WHERE code_client IS NOT NULL')
    .all() as unknown as { code_client: string }[];
  const existing = rows.map((r) => r.code_client).filter((value) => value.startsWith(prefix));
  const maxSuffix = existing.reduce((acc, value) => {
    const match = value.slice(prefix.length).match(/\d{3}$/);
    if (!match) return acc;
    const parsed = Number(match[0]);
    return Number.isNaN(parsed) ? acc : Math.max(acc, parsed);
  }, 0);
  return `${prefix}${String(maxSuffix + 1).padStart(3, '0')}`;
}

/**
 * Normalise un contact : document complet (fusion si existing) + colonnes SQLite.
 * Aligné sur ClientService.upsertClient : email/IBAN validés, codeClient auto,
 * roles par defaut ['client'], updatedAt = maintenant.
 */
function normalizeContactInput(
  db: DatabaseSync,
  body: Record<string, unknown>,
  existing: Record<string, unknown> | null
): { columns: { id: string; code_client: string | null; type: string; archived: number; payload: string; updated_at: string }; document: Record<string, unknown> } {
  const now = new Date().toISOString();
  const document: Record<string, unknown> = existing ? { ...existing } : {};

  if ('type' in body) {
    if (body.type !== 'particulier' && body.type !== 'entreprise') {
      throw new HttpError(422, "Champ 'type' doit valoir 'particulier' ou 'entreprise'");
    }
    document.type = body.type;
  } else if (!existing) {
    document.type = 'particulier';
  }

  for (const field of CONTACT_STRING_FIELDS) {
    if (field in body) {
      const value = optionalString(body, field);
      if (value === null || value === undefined || value.trim() === '') {
        delete document[field];
      } else {
        document[field] = value;
      }
    }
  }

  if ('color' in body) {
    const value = optionalString(body, 'color');
    if (value === null || value === undefined || value.trim() === '') {
      delete document.color;
    } else {
      document.color = validateHexColor(value, 'color');
    }
  }

  if ('capitalSocial' in body) {
    const value = optionalNumber(body, 'capitalSocial', { min: 0 });
    if (value === null || value === undefined) delete document.capitalSocial;
    else document.capitalSocial = value;
  }

  if ('roles' in body) {
    const roles = body.roles;
    if (!Array.isArray(roles) || roles.some((r) => typeof r !== 'string')) {
      throw new HttpError(422, "Champ 'roles' doit etre un tableau de chaines");
    }
    document.roles = (roles as string[]).length > 0 ? roles : ['client'];
  } else if (!existing) {
    document.roles = ['client'];
  }

  if ('adresseFacturation' in body) {
    document.adresseFacturation = normalizeAdresse(body.adresseFacturation, 'adresseFacturation');
  } else if (!existing) {
    document.adresseFacturation = { rue: '', codePostal: '', ville: '', pays: 'France' };
  }

  if ('adresseLivraison' in body) {
    if (body.adresseLivraison === null) delete document.adresseLivraison;
    else document.adresseLivraison = normalizeAdresse(body.adresseLivraison, 'adresseLivraison');
  }

  if ('email' in body) {
    if (body.email === null) {
      delete document.email;
    } else {
      const email = requireString(body, 'email', { max: 200 }).trim();
      if (email === '') delete document.email;
      else {
        if (!isLightEmail(email)) throw new HttpError(422, "Champ 'email' invalide");
        document.email = email;
      }
    }
  }

  if ('coordonneesBancaires' in body) {
    if (body.coordonneesBancaires === null) {
      delete document.coordonneesBancaires;
    } else {
      if (typeof body.coordonneesBancaires !== 'object' || Array.isArray(body.coordonneesBancaires)) {
        throw new HttpError(422, "Champ 'coordonneesBancaires' doit etre un objet");
      }
      const raw = body.coordonneesBancaires as Record<string, unknown>;
      const cb: Record<string, unknown> = {};
      if (typeof raw.titulaire === 'string' && raw.titulaire.trim() !== '') cb.titulaire = raw.titulaire.trim();
      if (typeof raw.bic === 'string' && raw.bic.trim() !== '') cb.bic = raw.bic.trim();
      if (typeof raw.banque === 'string' && raw.banque.trim() !== '') cb.banque = raw.banque.trim();
      if (typeof raw.iban === 'string' && raw.iban.trim() !== '') {
        const iban = raw.iban.trim();
        if (!validateIban(iban)) throw new HttpError(422, "Champ 'coordonneesBancaires.iban' invalide");
        cb.iban = iban;
      }
      if (Object.keys(cb).length > 0) document.coordonneesBancaires = cb;
      else delete document.coordonneesBancaires;
    }
  }

  if ('archived' in body) {
    if (typeof body.archived !== 'boolean') {
      throw new HttpError(422, "Champ 'archived' doit etre un booleen");
    }
    document.archived = body.archived;
  }

  // Garde-fou creation : un contact sans aucun nom n'a pas d'utilite pour un agent.
  if (
    !existing &&
    !document.nom &&
    !document.prenom &&
    !document.denominationSociale
  ) {
    throw new HttpError(422, "Fournir au moins 'nom', 'prenom' ou 'denominationSociale'");
  }

  // codeClient : fourni > conserve (PATCH) > genere (POST, aligne upsertClient).
  let codeClient: string | undefined;
  if ('codeClient' in body) {
    const value = typeof body.codeClient === 'string' ? body.codeClient.trim() : '';
    codeClient = value === '' ? undefined : value;
  } else if (existing && typeof existing.codeClient === 'string') {
    codeClient = existing.codeClient;
  }
  if (!codeClient && !existing) codeClient = generateCodeClient(db, document);
  if (codeClient) document.codeClient = codeClient;

  const id =
    existing && typeof existing.id === 'string'
      ? existing.id
      : typeof body.id === 'string' && body.id.trim() !== ''
        ? body.id.trim()
        : newEntityId('cli');
  if (!existing && getContactRow(db, id)) {
    throw new HttpError(422, `Contact '${id}' existe deja`);
  }
  document.id = id;
  if (!existing) document.createdAt = typeof body.createdAt === 'string' ? body.createdAt : now;
  document.updatedAt = now;

  return {
    columns: {
      id,
      code_client: codeClient ?? null,
      type: String(document.type),
      archived: document.archived === true ? 1 : 0,
      payload: JSON.stringify(document),
      updated_at: now,
    },
    document,
  };
}

function insertContact(
  ctx: RouteContext,
  columns: { id: string; code_client: string | null; type: string; archived: number; payload: string; updated_at: string },
  document: Record<string, unknown>
): void {
  ctx.db
    .prepare(
      `INSERT INTO clients (id, code_client, type, archived, payload, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(columns.id, columns.code_client, columns.type, columns.archived, columns.payload, columns.updated_at);
  writeAudit(ctx.db, {
    actor: ctx.actor,
    action: 'create',
    entity: 'contact',
    entityId: columns.id,
    before: null,
    after: document,
  });
}

export async function listContacts(ctx: RouteContext): Promise<void> {
  const includeArchived = boolQuery(ctx.query, 'include_archived');
  const group = ctx.query.get('group');
  const q = ctx.query.get('q');
  const limit = intQuery(ctx.query, 'limit', { def: DEFAULT_LIMIT, min: 1, max: MAX_LIMIT });
  const offset = intQuery(ctx.query, 'offset', { def: 0, min: 0, max: 10_000_000 });

  const rows = ctx.db
    .prepare('SELECT payload FROM clients ORDER BY updated_at DESC')
    .all() as unknown as { payload: string }[];
  let items = rows.map((r) => JSON.parse(r.payload) as Record<string, unknown>);
  if (!includeArchived) items = items.filter((c) => c.archived !== true);
  if (group !== null && group !== '') items = items.filter((c) => c.groupeId === group);
  if (q !== null && q.trim() !== '') {
    const needle = normalizeQuery(q);
    items = items.filter((client) => {
      const fields = ['nom', 'prenom', 'denominationSociale', 'email', 'telephone', 'siren', 'siret', 'codeClient']
        .map((field) => (typeof client[field] === 'string' ? normalizeQuery(client[field] as string) : ''))
        .filter(Boolean);
      return fields.some((value) => value.includes(needle));
    });
  }
  const total = items.length;
  items = items.slice(offset, offset + limit);
  sendJson(ctx.res, 200, { items, total, limit, offset });
}

export async function getContact(ctx: RouteContext): Promise<void> {
  const id = ctx.params['id'] ?? '';
  const row = getContactRow(ctx.db, id);
  if (!row) throw new HttpError(404, `Contact ${id} introuvable`);
  sendJson(ctx.res, 200, JSON.parse(row.payload) as Record<string, unknown>);
}

export async function createContact(ctx: RouteContext): Promise<void> {
  const body = await readJsonBody(ctx.req);
  const { columns, document } = normalizeContactInput(ctx.db, body, null);
  if (isDryRun(ctx, body)) {
    respondDryRun(ctx, { action: 'create', entity: 'contact', entityId: columns.id, before: null, after: document });
    return;
  }
  withTransaction(ctx.db, () => insertContact(ctx, columns, document));
  sendJson(ctx.res, 201, { id: columns.id, contact: document });
}

export async function updateContact(ctx: RouteContext): Promise<void> {
  const id = ctx.params['id'] ?? '';
  const row = getContactRow(ctx.db, id);
  if (!row) throw new HttpError(404, `Contact ${id} introuvable`);
  const body = await readJsonBody(ctx.req);
  const before = JSON.parse(row.payload) as Record<string, unknown>;
  const { columns, document } = normalizeContactInput(ctx.db, body, before);
  if (isDryRun(ctx, body)) {
    respondDryRun(ctx, { action: 'update', entity: 'contact', entityId: id, before, after: document });
    return;
  }
  withTransaction(ctx.db, () => {
    ctx.db
      .prepare(
        `UPDATE clients SET code_client = ?, type = ?, archived = ?, payload = ?, updated_at = ? WHERE id = ?`
      )
      .run(columns.code_client, columns.type, columns.archived, columns.payload, columns.updated_at, id);
    writeAudit(ctx.db, {
      actor: ctx.actor,
      action: 'update',
      entity: 'contact',
      entityId: id,
      before,
      after: document,
    });
  });
  sendJson(ctx.res, 200, { id, contact: document });
}

// ---------------------------------------------------------------------------
// Groupements de contacts (lecture seule, aligne ContactGroupService.loadGroupes)
// ---------------------------------------------------------------------------

export async function listContactGroups(ctx: RouteContext): Promise<void> {
  const rows = ctx.db
    .prepare('SELECT payload FROM contact_groups ORDER BY updated_at DESC')
    .all() as unknown as { payload: string }[];
  const items = rows
    .map((r) => JSON.parse(r.payload) as Record<string, unknown>)
    .sort((a, b) => String(a.nom ?? '').localeCompare(String(b.nom ?? ''), 'fr'));
  sendJson(ctx.res, 200, { items, total: items.length });
}

function getContactGroupRow(db: DatabaseSync, id: string): Record<string, unknown> | undefined {
  const row = db.prepare('SELECT payload FROM contact_groups WHERE id = ?').get(id) as
    | { payload: string }
    | undefined;
  return row ? (JSON.parse(row.payload) as Record<string, unknown>) : undefined;
}

/** POST /contact-groups : cree un groupement de contacts (aligne ContactGroupService.upsertGroupe). */
export async function createContactGroup(ctx: RouteContext): Promise<void> {
  const body = await readJsonBody(ctx.req);
  const nom = requireString(body, 'nom', { max: 100 });
  const now = new Date().toISOString();
  const id =
    typeof body.id === 'string' && body.id.trim() !== '' ? body.id.trim() : newEntityId('cgrp');
  if (getContactGroupRow(ctx.db, id)) {
    throw new HttpError(422, `Groupement '${id}' existe deja`);
  }
  const document = { id, nom, createdAt: now, updatedAt: now };
  if (isDryRun(ctx, body)) {
    respondDryRun(ctx, { action: 'create', entity: 'contact_group', entityId: id, before: null, after: document });
    return;
  }
  withTransaction(ctx.db, () => {
    ctx.db
      .prepare('INSERT INTO contact_groups (id, payload, updated_at) VALUES (?, ?, ?)')
      .run(id, JSON.stringify(document), now);
    writeAudit(ctx.db, {
      actor: ctx.actor,
      action: 'create',
      entity: 'contact_group',
      entityId: id,
      before: null,
      after: document,
    });
  });
  sendJson(ctx.res, 201, { id, contactGroup: document });
}

/** PATCH /contact-groups/{id} : renomme le groupement (createdAt conserve, updatedAt bumped). */
export async function updateContactGroup(ctx: RouteContext): Promise<void> {
  const id = ctx.params['id'] ?? '';
  const before = getContactGroupRow(ctx.db, id);
  if (!before) throw new HttpError(404, `Groupement ${id} introuvable`);
  const body = await readJsonBody(ctx.req);
  const after: Record<string, unknown> = { ...before };
  if ('nom' in body) after.nom = requireString(body, 'nom', { max: 100 });
  const updatedAt = new Date().toISOString();
  after.updatedAt = updatedAt;
  if (isDryRun(ctx, body)) {
    respondDryRun(ctx, { action: 'update', entity: 'contact_group', entityId: id, before, after });
    return;
  }
  withTransaction(ctx.db, () => {
    ctx.db
      .prepare('UPDATE contact_groups SET payload = ?, updated_at = ? WHERE id = ?')
      .run(JSON.stringify(after), updatedAt, id);
    writeAudit(ctx.db, {
      actor: ctx.actor,
      action: 'update',
      entity: 'contact_group',
      entityId: id,
      before,
      after,
    });
  });
  sendJson(ctx.res, 200, { id, contactGroup: after });
}

/** DELETE /contact-groups/{id} : clients.groupeId remis a NULL puis suppression (aligne ContactGroupService.deleteGroupe). */
export async function deleteContactGroup(ctx: RouteContext): Promise<void> {
  const id = ctx.params['id'] ?? '';
  const before = getContactGroupRow(ctx.db, id);
  if (!before) throw new HttpError(404, `Groupement ${id} introuvable`);
  const body = await readJsonBody(ctx.req);
  if (isDryRun(ctx, body)) {
    respondDryRun(ctx, {
      action: 'delete',
      entity: 'contact_group',
      entityId: id,
      before,
      after: { note: 'clients.groupeId remis a NULL, groupement supprime' },
    });
    return;
  }
  withTransaction(ctx.db, () => {
    const rows = ctx.db.prepare('SELECT id, payload FROM clients').all() as unknown as {
      id: string;
      payload: string;
    }[];
    for (const row of rows) {
      const client = JSON.parse(row.payload) as Record<string, unknown>;
      if (client.groupeId !== id) continue;
      delete client.groupeId;
      const clientUpdatedAt = new Date().toISOString();
      client.updatedAt = clientUpdatedAt;
      ctx.db
        .prepare('UPDATE clients SET payload = ?, updated_at = ? WHERE id = ?')
        .run(JSON.stringify(client), clientUpdatedAt, row.id);
    }
    ctx.db.prepare('DELETE FROM contact_groups WHERE id = ?').run(id);
    writeAudit(ctx.db, {
      actor: ctx.actor,
      action: 'delete',
      entity: 'contact_group',
      entityId: id,
      before,
      after: null,
    });
  });
  sendJson(ctx.res, 200, { ok: true, deleted: 'hard', cascade: 'clients.groupeId -> NULL' });
}

/** DELETE /contacts/{id} : suppression definitive, refusee si devis/factures/dons lies (aligne ClientService.deleteClient). */
export async function deleteContact(ctx: RouteContext): Promise<void> {
  const id = ctx.params['id'] ?? '';
  const row = getContactRow(ctx.db, id);
  if (!row) throw new HttpError(404, `Contact ${id} introuvable`);
  const body = await readJsonBody(ctx.req);
  if (!boolQuery(ctx.query, 'confirm') && body.confirm !== true) {
    throw new HttpError(400, "Suppression destructive : ajouter ?confirm=true");
  }
  const links = {
    devis: (
      ctx.db.prepare('SELECT id FROM devis WHERE client_id = ? AND supprime = 0 LIMIT 1').get(id) as
        | { id: string }
        | undefined
    )?.id,
    factures: (
      ctx.db.prepare('SELECT id FROM factures WHERE client_id = ? AND supprime = 0 LIMIT 1').get(id) as
        | { id: string }
        | undefined
    )?.id,
    donations: (
      ctx.db.prepare('SELECT id FROM donations WHERE contact_id = ? LIMIT 1').get(id) as
        | { id: string }
        | undefined
    )?.id,
  };
  const linked = Object.entries(links).filter(([, v]) => v !== undefined);
  if (linked.length > 0) {
    throw new HttpError(409, `Contact lie a : ${linked.map(([k]) => k).join(', ')} — suppression interdite`);
  }
  const before = JSON.parse(row.payload) as Record<string, unknown>;
  if (isDryRun(ctx, body)) {
    respondDryRun(ctx, { action: 'delete', entity: 'contact', entityId: id, before, after: null });
    return;
  }
  withTransaction(ctx.db, () => {
    ctx.db.prepare('DELETE FROM clients WHERE id = ?').run(id);
    writeAudit(ctx.db, {
      actor: ctx.actor,
      action: 'delete',
      entity: 'contact',
      entityId: id,
      before,
      after: null,
    });
  });
  sendJson(ctx.res, 200, { ok: true, deleted: 'hard' });
}

// ---------------------------------------------------------------------------
// Dons manuels (payload JSON, aligne DonsService de l'app)
// ---------------------------------------------------------------------------

const DONATEUR_ANONYME_ID = 'ANONYME';
const NATURES_DON = ['numeraire', 'nature', 'mecenat_competences'];
const MODES_VERSEMENT = ['virement', 'cheque', 'especes', 'cb', 'prelevement', 'autre'];

interface DonRow {
  id: string;
  donateur_id: string;
  payload: string;
}

/** Accepte YYYY-MM-DD ou ISO datetime complet, renvoie un ISO datetime (aligne DonsService). */
function normalizeIsoDateTime(value: string, field: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new HttpError(422, `Champ '${field}' : date invalide (YYYY-MM-DD ou ISO)`);
  }
  return parsed.toISOString();
}

function normalizeDonInput(db: DatabaseSync, body: Record<string, unknown>): { columns: { id: string; donateur_id: string; payload: string }; document: Record<string, unknown> } {
  const donateurId = requireString(body, 'donateurId', { max: 100 });
  if (donateurId !== DONATEUR_ANONYME_ID) {
    const donor = db.prepare('SELECT 1 FROM donateurs WHERE id = ?').get(donateurId);
    if (!donor) {
      throw new HttpError(422, `Champ 'donateurId' : donateur '${donateurId}' introuvable (ou '${DONATEUR_ANONYME_ID}')`);
    }
  }
  const montant = roundMoney(requireNumber(body, 'montant', { min: 0.01, max: 1_000_000_000 }));
  const natureDon = requireString(body, 'natureDon', { max: 40 });
  if (!NATURES_DON.includes(natureDon)) {
    throw new HttpError(422, `Champ 'natureDon' doit etre un de : ${NATURES_DON.join(', ')}`);
  }
  const modeVersement = optionalString(body, 'modeVersement', { max: 40 });
  if (modeVersement !== undefined && modeVersement !== null && !MODES_VERSEMENT.includes(modeVersement)) {
    throw new HttpError(422, `Champ 'modeVersement' doit etre un de : ${MODES_VERSEMENT.join(', ')}`);
  }
  const dateRaw = optionalString(body, 'date', { max: 40 });
  const date = dateRaw === undefined || dateRaw === null ? new Date().toISOString() : normalizeIsoDateTime(dateRaw, 'date');
  const datePerceptionRaw = optionalString(body, 'datePerception', { max: 40 });
  const datePerception =
    datePerceptionRaw === undefined || datePerceptionRaw === null
      ? undefined
      : normalizeIsoDateTime(datePerceptionRaw, 'datePerception');

  const id = typeof body.id === 'string' && body.id.trim() ? body.id.trim() : newEntityId('don');
  const existing = db.prepare('SELECT 1 FROM dons_manuels WHERE id = ?').get(id);
  if (existing) {
    throw new HttpError(422, `Un don avec l'id '${id}' existe deja`);
  }

  const now = new Date().toISOString();
  const document: Record<string, unknown> = {
    id,
    donateurId,
    montant,
    date,
    natureDon,
    createdAt: now,
    updatedAt: now,
  };
  if (modeVersement !== undefined && modeVersement !== null) document.modeVersement = modeVersement;
  if (datePerception !== undefined) document.datePerception = datePerception;
  const donorLabel = optionalString(body, 'donorLabel', { max: 300 });
  if (donorLabel !== undefined && donorLabel !== null) document.donorLabel = donorLabel;
  const description = optionalString(body, 'description', { max: 2000 });
  if (description !== undefined && description !== null) document.description = description;
  const notes = optionalString(body, 'notes', { max: 2000 });
  if (notes !== undefined && notes !== null) document.notes = notes;

  return { columns: { id, donateur_id: donateurId, payload: JSON.stringify(document) }, document };
}

export async function listDons(ctx: RouteContext): Promise<void> {
  const donateurId = ctx.query.get('donateur_id');
  const limit = intQuery(ctx.query, 'limit', { def: DEFAULT_LIMIT, min: 1, max: MAX_LIMIT });
  const offset = intQuery(ctx.query, 'offset', { def: 0, min: 0, max: 10_000_000 });
  let rows: DonRow[];
  let total: number;
  if (donateurId !== null && donateurId !== '') {
    rows = ctx.db
      .prepare('SELECT id, donateur_id, payload FROM dons_manuels WHERE donateur_id = ?')
      .all(donateurId) as unknown as DonRow[];
    total = rows.length;
  } else {
    rows = ctx.db.prepare('SELECT id, donateur_id, payload FROM dons_manuels').all() as unknown as DonRow[];
    total = rows.length;
  }
  const items = rows
    .map((r) => JSON.parse(r.payload) as Record<string, unknown>)
    .sort((a, b) => String(b.date ?? '').localeCompare(String(a.date ?? '')))
    .slice(offset, offset + limit);
  sendJson(ctx.res, 200, { items, total, limit, offset });
}

export async function createDon(ctx: RouteContext): Promise<void> {
  const body = await readJsonBody(ctx.req);
  const { columns, document } = normalizeDonInput(ctx.db, body);
  if (isDryRun(ctx, body)) {
    respondDryRun(ctx, { action: 'create', entity: 'don', entityId: columns.id, before: null, after: document });
    return;
  }
  withTransaction(ctx.db, () => {
    ctx.db
      .prepare('INSERT INTO dons_manuels (id, donateur_id, payload) VALUES (?, ?, ?)')
      .run(columns.id, columns.donateur_id, columns.payload);
    writeAudit(ctx.db, {
      actor: ctx.actor,
      action: 'create',
      entity: 'don',
      entityId: columns.id,
      before: null,
      after: document,
    });
  });
  sendJson(ctx.res, 201, { id: columns.id, don: document });
}

/** Fusion PATCH d'un don : champs fournis valides, le reste repris du document existant. */
function normalizeDonPatch(db: DatabaseSync, body: Record<string, unknown>, before: Record<string, unknown>): { donateur_id: string; payload: string; document: Record<string, unknown> } {
  const document: Record<string, unknown> = { ...before };

  if ('donateurId' in body) {
    const donateurId = requireString(body, 'donateurId', { max: 100 });
    if (donateurId !== DONATEUR_ANONYME_ID) {
      const donor = db.prepare('SELECT 1 FROM donateurs WHERE id = ?').get(donateurId);
      if (!donor) {
        throw new HttpError(422, `Champ 'donateurId' : donateur '${donateurId}' introuvable (ou '${DONATEUR_ANONYME_ID}')`);
      }
    }
    document.donateurId = donateurId;
  }
  if ('montant' in body) {
    document.montant = roundMoney(requireNumber(body, 'montant', { min: 0.01, max: 1_000_000_000 }));
  }
  if ('natureDon' in body) {
    const natureDon = requireString(body, 'natureDon', { max: 40 });
    if (!NATURES_DON.includes(natureDon)) {
      throw new HttpError(422, `Champ 'natureDon' doit etre un de : ${NATURES_DON.join(', ')}`);
    }
    document.natureDon = natureDon;
  }
  if ('modeVersement' in body) {
    if (body.modeVersement === null) {
      delete document.modeVersement;
    } else {
      const modeVersement = optionalString(body, 'modeVersement', { max: 40 });
      if (modeVersement !== undefined && !MODES_VERSEMENT.includes(modeVersement)) {
        throw new HttpError(422, `Champ 'modeVersement' doit etre un de : ${MODES_VERSEMENT.join(', ')}`);
      }
      document.modeVersement = modeVersement;
    }
  }
  if ('date' in body) {
    const dateRaw = optionalString(body, 'date', { max: 40 });
    if (dateRaw === undefined || dateRaw === null) throw new HttpError(422, "Champ 'date' : chaine requise");
    document.date = normalizeIsoDateTime(dateRaw, 'date');
  }
  if ('datePerception' in body) {
    if (body.datePerception === null) {
      delete document.datePerception;
    } else {
      const datePerceptionRaw = optionalString(body, 'datePerception', { max: 40 });
      if (datePerceptionRaw === undefined) throw new HttpError(422, "Champ 'datePerception' : chaine requise");
      document.datePerception = normalizeIsoDateTime(datePerceptionRaw, 'datePerception');
    }
  }
  if ('donorLabel' in body) {
    if (body.donorLabel === null) delete document.donorLabel;
    else document.donorLabel = optionalString(body, 'donorLabel', { max: 300 });
  }
  if ('description' in body) {
    if (body.description === null) delete document.description;
    else document.description = optionalString(body, 'description', { max: 2000 });
  }
  if ('notes' in body) {
    if (body.notes === null) delete document.notes;
    else document.notes = optionalString(body, 'notes', { max: 2000 });
  }

  document.updatedAt = new Date().toISOString();
  const donateurId = String(document.donateurId ?? '');
  return { donateur_id: donateurId, payload: JSON.stringify(document), document };
}

export async function updateDon(ctx: RouteContext): Promise<void> {
  const id = ctx.params['id'] ?? '';
  const row = ctx.db.prepare('SELECT id, donateur_id, payload FROM dons_manuels WHERE id = ?').get(id) as unknown as DonRow | undefined;
  if (!row) throw new HttpError(404, `Don ${id} introuvable`);
  const body = await readJsonBody(ctx.req);
  const before = JSON.parse(row.payload) as Record<string, unknown>;
  const { donateur_id, payload, document } = normalizeDonPatch(ctx.db, body, before);
  if (isDryRun(ctx, body)) {
    respondDryRun(ctx, { action: 'update', entity: 'don', entityId: id, before, after: document });
    return;
  }
  withTransaction(ctx.db, () => {
    ctx.db
      .prepare('UPDATE dons_manuels SET donateur_id = ?, payload = ? WHERE id = ?')
      .run(donateur_id, payload, id);
    writeAudit(ctx.db, {
      actor: ctx.actor,
      action: 'update',
      entity: 'don',
      entityId: id,
      before,
      after: document,
    });
  });
  sendJson(ctx.res, 200, { id, don: document });
}

export async function deleteDon(ctx: RouteContext): Promise<void> {
  const id = ctx.params['id'] ?? '';
  const row = ctx.db.prepare('SELECT id, donateur_id, payload FROM dons_manuels WHERE id = ?').get(id) as unknown as DonRow | undefined;
  if (!row) throw new HttpError(404, `Don ${id} introuvable`);
  const body = await readJsonBody(ctx.req);
  const before = JSON.parse(row.payload) as Record<string, unknown>;
  if (!boolQuery(ctx.query, 'confirm') && body.confirm !== true) {
    throw new HttpError(400, "Suppression definitive du don : ajouter ?confirm=true");
  }
  if (isDryRun(ctx, body)) {
    respondDryRun(ctx, { action: 'delete', entity: 'don', entityId: id, before, after: null });
    return;
  }
  withTransaction(ctx.db, () => {
    ctx.db.prepare('DELETE FROM dons_manuels WHERE id = ?').run(id);
    writeAudit(ctx.db, {
      actor: ctx.actor,
      action: 'delete',
      entity: 'don',
      entityId: id,
      before,
      after: null,
    });
  });
  sendJson(ctx.res, 200, { ok: true, deleted: 'hard' });
}

// ---------------------------------------------------------------------------
// Donateurs (payload JSON, aligne DonateurService de l'app)
// ---------------------------------------------------------------------------

const TYPES_DONATEUR = ['particulier', 'entreprise'];
const CIVILITES = ['M.', 'Mme', 'Mlle'];

interface DonateurRow {
  id: string;
  payload: string;
}

function getDonateurRow(db: DatabaseSync, id: string): DonateurRow | undefined {
  return db.prepare('SELECT id, payload FROM donateurs WHERE id = ?').get(id) as unknown as DonateurRow | undefined;
}

function validateDonateurFields(db: DatabaseSync, body: Record<string, unknown>, document: Record<string, unknown>): void {
  if ('type' in body) {
    const type = requireString(body, 'type', { max: 20 });
    if (!TYPES_DONATEUR.includes(type)) {
      throw new HttpError(422, `Champ 'type' doit etre un de : ${TYPES_DONATEUR.join(', ')}`);
    }
    document.type = type;
  }
  if ('civilite' in body) {
    if (body.civilite === null) {
      delete document.civilite;
    } else {
      const civilite = optionalString(body, 'civilite', { max: 10 });
      if (civilite !== undefined && !CIVILITES.includes(civilite)) {
        throw new HttpError(422, `Champ 'civilite' doit etre un de : ${CIVILITES.join(', ')}`);
      }
      document.civilite = civilite;
    }
  }
  for (const field of ['nom', 'prenom', 'denominationSociale', 'formeJuridique', 'siren', 'siret', 'email', 'telephone', 'notes'] as const) {
    if (field in body) {
      if (body[field] === null) delete document[field];
      else document[field] = optionalString(body, field, { max: 300 });
    }
  }
  if ('adresse' in body) {
    if (body.adresse === null) {
      delete document.adresse;
    } else if (body.adresse !== undefined) {
      if (typeof body.adresse !== 'object' || body.adresse === null || Array.isArray(body.adresse)) {
        throw new HttpError(422, "Champ 'adresse' doit etre un objet");
      }
      document.adresse = body.adresse;
    }
  }
  if ('categoryCode' in body) {
    if (body.categoryCode === null) {
      delete document.categoryCode;
    } else {
      const categoryCode = optionalString(body, 'categoryCode', { max: 20 });
      if (categoryCode !== undefined && categoryCode !== '') {
        if (!categoryCodeExists(db, categoryCode)) {
          throw new HttpError(422, `Champ 'categoryCode' : categorie '${categoryCode}' introuvable`);
        }
        document.categoryCode = categoryCode;
      } else {
        delete document.categoryCode;
      }
    }
  }
}

/** POST /donateurs : creation (id genere ou fourni unique, aligne DonateurService.upsert). */
export async function createDonateur(ctx: RouteContext): Promise<void> {
  const body = await readJsonBody(ctx.req);
  const id = typeof body.id === 'string' && body.id.trim() ? body.id.trim() : newEntityId('donateur');
  if (id === DONATEUR_ANONYME_ID) {
    throw new HttpError(422, `L'id '${DONATEUR_ANONYME_ID}' est reserve`);
  }
  if (getDonateurRow(ctx.db, id)) {
    throw new HttpError(422, `Un donateur avec l'id '${id}' existe deja`);
  }
  const now = new Date().toISOString();
  const document: Record<string, unknown> = { id, type: 'particulier', createdAt: now, updatedAt: now };
  validateDonateurFields(ctx.db, body, document);
  if (isDryRun(ctx, body)) {
    respondDryRun(ctx, { action: 'create', entity: 'donateur', entityId: id, before: null, after: document });
    return;
  }
  withTransaction(ctx.db, () => {
    ctx.db
      .prepare('INSERT INTO donateurs (id, payload, updated_at) VALUES (?, ?, ?)')
      .run(id, JSON.stringify(document), now);
    writeAudit(ctx.db, {
      actor: ctx.actor,
      action: 'create',
      entity: 'donateur',
      entityId: id,
      before: null,
      after: document,
    });
  });
  sendJson(ctx.res, 201, { id, donateur: document });
}

export async function listDonateurs(ctx: RouteContext): Promise<void> {
  const q = ctx.query.get('q');
  const limit = intQuery(ctx.query, 'limit', { def: DEFAULT_LIMIT, min: 1, max: MAX_LIMIT });
  const offset = intQuery(ctx.query, 'offset', { def: 0, min: 0, max: 10_000_000 });
  const rows = ctx.db
    .prepare('SELECT id, payload FROM donateurs ORDER BY updated_at DESC')
    .all() as unknown as DonateurRow[];
  let items = rows.map((r) => JSON.parse(r.payload) as Record<string, unknown>);
  if (q !== null && q !== '') {
    const needle = q.toLowerCase();
    items = items.filter((d) =>
      [d.nom, d.prenom, d.denominationSociale, d.email]
        .some((v) => typeof v === 'string' && v.toLowerCase().includes(needle))
    );
  }
  const total = items.length;
  items = items.slice(offset, offset + limit);
  sendJson(ctx.res, 200, { items, total, limit, offset });
}

/** PATCH /donateurs/{id} : fusion partielle (updatedAt rafraichi, aligne DonateurService.upsert). */
export async function updateDonateur(ctx: RouteContext): Promise<void> {
  const id = ctx.params['id'] ?? '';
  const row = getDonateurRow(ctx.db, id);
  if (!row) throw new HttpError(404, `Donateur ${id} introuvable`);
  const body = await readJsonBody(ctx.req);
  const before = JSON.parse(row.payload) as Record<string, unknown>;
  const document: Record<string, unknown> = { ...before };
  validateDonateurFields(ctx.db, body, document);
  document.updatedAt = new Date().toISOString();
  const payload = JSON.stringify(document);
  if (isDryRun(ctx, body)) {
    respondDryRun(ctx, { action: 'update', entity: 'donateur', entityId: id, before, after: document });
    return;
  }
  withTransaction(ctx.db, () => {
    ctx.db
      .prepare('UPDATE donateurs SET payload = ?, updated_at = ? WHERE id = ?')
      .run(payload, String(document.updatedAt), id);
    writeAudit(ctx.db, {
      actor: ctx.actor,
      action: 'update',
      entity: 'donateur',
      entityId: id,
      before,
      after: document,
    });
  });
  sendJson(ctx.res, 200, { id, donateur: document });
}

/** DELETE /donateurs/{id} : definitif, supprime aussi les liens transactions (aligne DonateurService.deleteDonateur). */
export async function deleteDonateur(ctx: RouteContext): Promise<void> {
  const id = ctx.params['id'] ?? '';
  const row = getDonateurRow(ctx.db, id);
  if (!row) throw new HttpError(404, `Donateur ${id} introuvable`);
  const body = await readJsonBody(ctx.req);
  const before = JSON.parse(row.payload) as Record<string, unknown>;
  if (!boolQuery(ctx.query, 'confirm') && body.confirm !== true) {
    throw new HttpError(400, "Suppression definitive du donateur : ajouter ?confirm=true");
  }
  if (isDryRun(ctx, body)) {
    respondDryRun(ctx, { action: 'delete', entity: 'donateur', entityId: id, before, after: null });
    return;
  }
  withTransaction(ctx.db, () => {
    ctx.db.prepare('DELETE FROM donateurs WHERE id = ?').run(id);
    ctx.db.prepare('DELETE FROM donateur_transactions WHERE donateur_id = ?').run(id);
    writeAudit(ctx.db, {
      actor: ctx.actor,
      action: 'delete',
      entity: 'donateur',
      entityId: id,
      before,
      after: null,
    });
  });
  sendJson(ctx.res, 200, { ok: true, deleted: 'hard' });
}

// ---------------------------------------------------------------------------
// Export CSV transactions (aligne ExportService.rowsToCsv de l'app)
// ---------------------------------------------------------------------------

function csvQuote(value: string): string {
  if (/[;"\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

/** Map transactionId -> numero de facture (paiements lies, aligne ExportService.invoiceNumeroByTx). */
function invoiceNumeroByTx(db: DatabaseSync): Map<string, string> {
  const map = new Map<string, string>();
  const rows = db.prepare('SELECT payload FROM factures WHERE supprime = 0').all() as {
    payload: string;
  }[];
  for (const row of rows) {
    let doc: Record<string, unknown>;
    try {
      doc = JSON.parse(row.payload) as Record<string, unknown>;
    } catch {
      continue;
    }
    const numero = typeof doc.numero === 'string' ? doc.numero : '';
    if (!numero) continue;
    const paiements = Array.isArray(doc.paiements) ? (doc.paiements as Record<string, unknown>[]) : [];
    for (const paiement of paiements) {
      const txId = paiement.transactionId;
      if (typeof txId !== 'string' || txId === '') continue;
      const previous = map.get(txId);
      map.set(txId, previous ? `${previous}, ${numero}` : numero);
    }
  }
  return map;
}

/**
 * GET /export/transactions?format=csv : export CSV des transactions, memes filtres
 * que GET /transactions (account_id, include_deleted, limit, offset).
 * Colonnes alignees sur ExportService : Date, Compte, Libelle, Debit, Credit, Categorie, N° facture.
 */
export async function exportTransactions(ctx: RouteContext): Promise<void> {
  const format = (ctx.query.get('format') ?? 'csv').toLowerCase();
  if (format !== 'csv') throw new HttpError(400, "Parametre 'format' supporte : csv");

  const accountId = ctx.query.get('account_id');
  let accountIdNum: number | null = null;
  if (accountId !== null && accountId !== '') {
    accountIdNum = Number.parseInt(accountId, 10);
    if (!Number.isInteger(accountIdNum) || accountIdNum < 1) {
      throw new HttpError(400, "Parametre 'account_id' invalide");
    }
  }
  const includeDeleted = boolQuery(ctx.query, 'include_deleted');
  const limit = intQuery(ctx.query, 'limit', { def: DEFAULT_LIMIT, min: 1, max: MAX_LIMIT });
  const offset = intQuery(ctx.query, 'offset', { def: 0, min: 0, max: 10_000_000 });

  const whereDeleted = includeDeleted ? '' : ' AND t.deleted_at IS NULL';
  const whereAccount = accountIdNum !== null ? ' AND t.account_id = ?' : '';
  const params: number[] = [];
  if (accountIdNum !== null) params.push(accountIdNum);

  const rows = ctx.db
    .prepare(
      `SELECT t.*, a.code AS account_code FROM transactions t
       LEFT JOIN accounts a ON a.id = t.account_id
       WHERE 1=1${whereDeleted}${whereAccount}
       ORDER BY t.date ASC, t.id ASC LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset) as unknown as TxRow[];
  const numeros = invoiceNumeroByTx(ctx.db);

  const delimiter = ';';
  const header = ['Date', 'Compte', 'Libellé', 'Débit', 'Crédit', 'Catégorie', 'N° facture'];
  const lines = rows.map((row) =>
    [
      row.date,
      row.account_code ?? '',
      row.label ?? '',
      row.debit ? String(row.debit).replace('.', ',') : '',
      row.credit ? String(row.credit).replace('.', ',') : '',
      row.category_code ?? '',
      numeros.get(String(row.id)) ?? '',
    ]
      .map((v) => csvQuote(String(v)))
      .join(delimiter)
  );
  const csv = [header.map((h) => csvQuote(h)).join(delimiter), ...lines].join('\n');

  ctx.res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8' });
  ctx.res.end(`\uFEFF${csv}`);
}

// ---------------------------------------------------------------------------
// Import CSV + templates d'import (aligne ImportService / ImportTemplateService)
// ---------------------------------------------------------------------------

const ALLOWED_TEMPLATE_ROLES = new Set([
  'date',
  'dateValue',
  'libelle',
  'debit',
  'credit',
  'debitCredit',
  'balance',
  'ignore',
]);
const MAX_TEMPLATE_ROLE_KEYS = 50;

interface ImportTemplateRow {
  id: number;
  name: string;
  account_id: number | null;
  initial_balance: number | null;
  column_roles_json: string;
  created_at: string;
  updated_at: string | null;
}

function mapImportTemplate(row: ImportTemplateRow): Record<string, unknown> {
  let roles: Record<string, string> = {};
  try {
    roles = JSON.parse(row.column_roles_json) as Record<string, string>;
  } catch {
    roles = {};
  }
  return {
    id: row.id,
    name: row.name,
    account_id: row.account_id,
    initial_balance: row.initial_balance,
    column_roles: roles,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function importTransactions(ctx: RouteContext): Promise<void> {
  const body = await readJsonBody(ctx.req);
  const accountId = requireNumber(body, 'account_id', { min: 1 });
  if (!accountExists(ctx.db, accountId)) {
    throw new HttpError(404, `Compte ${accountId} introuvable`);
  }
  const csv = requireString(body, 'csv', { max: 5_000_000 });
  const filename = optionalString(body, 'filename', { max: 300 }) ?? 'import.csv';
  const delimiter = optionalString(body, 'delimiter', { max: 1 });
  const mapping = parseMapping(body.mapping);

  const rows = parseCsv(csv, delimiter);
  const preview = transformRows(rows, mapping);
  if (preview.length === 0) {
    throw new HttpError(422, 'Aucune ligne valide : date non parsable sur toutes les lignes');
  }
  const dates = preview.map((r) => r.date).sort();
  const dateStart = dates[0];
  const dateEnd = dates[dates.length - 1];
  if (!dateStart || !dateEnd) {
    throw new HttpError(422, 'Aucune ligne valide : date non parsable sur toutes les lignes');
  }
  const afterPreview = {
    filename,
    account_id: accountId,
    date_start: dateStart,
    date_end: dateEnd,
    row_count: preview.length,
    rows: preview.slice(0, 5),
  };
  if (isDryRun(ctx, body)) {
    respondDryRun(ctx, {
      action: 'create',
      entity: 'import',
      entityId: null,
      before: null,
      after: afterPreview,
    });
    return;
  }
  const importId = withTransaction(ctx.db, () => {
    const result = ctx.db
      .prepare(
        `INSERT INTO imports (filename, account_id, date_start, date_end, row_count)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(filename, accountId, dateStart, dateEnd, preview.length);
    const newId = Number(result.lastInsertRowid);
    const insert = ctx.db
      .prepare(
        `INSERT INTO transactions (account_id, date, value_date, debit, credit, label, category_code, import_id)
         VALUES (?, ?, ?, ?, ?, ?, NULL, ?)`
      );
    for (const row of preview) {
      insert.run(accountId, row.date, row.valueDate, row.debit, row.credit, row.label, newId);
    }
    writeAudit(ctx.db, {
      actor: ctx.actor,
      action: 'create',
      entity: 'import',
      entityId: newId,
      before: null,
      after: afterPreview,
    });
    return newId;
  });
  sendJson(ctx.res, 201, {
    id: importId,
    imported: preview.length,
    date_start: dateStart,
    date_end: dateEnd,
  });
}

export async function listImportTemplates(ctx: RouteContext): Promise<void> {
  const rows = ctx.db
    .prepare(
      `SELECT id, name, account_id, initial_balance, column_roles_json, created_at, updated_at
       FROM import_templates ORDER BY name COLLATE NOCASE, id ASC`
    )
    .all() as unknown as ImportTemplateRow[];
  sendJson(ctx.res, 200, { items: rows.map(mapImportTemplate), total: rows.length });
}

export async function createImportTemplate(ctx: RouteContext): Promise<void> {
  const body = await readJsonBody(ctx.req);
  const name = requireString(body, 'name', { max: 200 });
  const accountId = optionalNumber(body, 'account_id', { min: 1 });
  if (accountId !== undefined && accountId !== null && !accountExists(ctx.db, accountId)) {
    throw new HttpError(404, `Compte ${accountId} introuvable`);
  }
  const initialBalance = optionalNumber(body, 'initial_balance');
  const rolesRaw = body['column_roles'];
  if (typeof rolesRaw !== 'object' || rolesRaw === null || Array.isArray(rolesRaw)) {
    throw new HttpError(422, "Champ 'column_roles' requis (objet en-tete -> role)");
  }
  const entries = Object.entries(rolesRaw as Record<string, unknown>);
  if (entries.length === 0 || entries.length > MAX_TEMPLATE_ROLE_KEYS) {
    throw new HttpError(422, `Champ 'column_roles' : 1..${MAX_TEMPLATE_ROLE_KEYS} entrees`);
  }
  const roles: Record<string, string> = {};
  for (const [header, role] of entries) {
    const headerTrim = header.trim();
    if (!headerTrim || typeof role !== 'string' || !ALLOWED_TEMPLATE_ROLES.has(role)) {
      throw new HttpError(
        422,
        `Champ 'column_roles' : role invalide pour '${headerTrim}' (attendu : date, dateValue, libelle, debit, credit, debitCredit, balance, ignore)`
      );
    }
    roles[headerTrim] = role;
  }
  const after = {
    name,
    account_id: accountId ?? null,
    initial_balance: initialBalance ?? null,
    column_roles: roles,
  };
  if (isDryRun(ctx, body)) {
    respondDryRun(ctx, { action: 'create', entity: 'import_template', entityId: null, before: null, after });
    return;
  }
  const id = withTransaction(ctx.db, () => {
    const result = ctx.db
      .prepare(
        `INSERT INTO import_templates (name, account_id, initial_balance, column_roles_json)
         VALUES (?, ?, ?, ?)`
      )
      .run(name, accountId ?? null, initialBalance ?? null, JSON.stringify(roles));
    const newId = Number(result.lastInsertRowid);
    writeAudit(ctx.db, {
      actor: ctx.actor,
      action: 'create',
      entity: 'import_template',
      entityId: newId,
      before: null,
      after,
    });
    return newId;
  });
  const row = ctx.db
    .prepare(
      `SELECT id, name, account_id, initial_balance, column_roles_json, created_at, updated_at
       FROM import_templates WHERE id = ?`
    )
    .get(id) as unknown as ImportTemplateRow;
  sendJson(ctx.res, 201, { id, template: mapImportTemplate(row) });
}
