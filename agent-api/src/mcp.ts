// Serveur MCP (Model Context Protocol) sur stdio — JSON-RPC 2.0, une ligne par message.
// Reutilise les handlers HTTP de handlers.ts via un adaptateur req/res simule :
// la logique metier (validation, dry_run, audit) n'existe qu'a un seul endroit.
// Authentification : chaque tools/call doit porter le jeton COMPTAL_AGENT_TOKEN
// (params._meta.token, params._meta['comptal.token'] ou params.token).
import * as crypto from 'node:crypto';
import * as readline from 'node:readline';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { DatabaseSync } from 'node:sqlite';
import { loadConfig } from './config.ts';
import { openDb } from './db.ts';
import { HttpError } from './http.ts';
import type { RouteContext, RouteHandler } from './routes.ts';
import {
  listTransactions,
  getTransaction,
  createTransaction,
  updateTransaction,
  deleteTransaction,
  exportTransactions,
  importTransactions,
  listImportTemplates,
  createImportTemplate,
  listAccounts,
  getAccount,
  createAccount,
  updateAccount,
  deleteAccount,
  listCategories,
  getCategory,
  createCategory,
  updateCategory,
  deleteCategory,
  listAudit,
  listCategoryGroups,
  createCategoryGroup,
  updateCategoryGroup,
  deleteCategoryGroup,
  getCategoryGroup,
  getBalances,
  getStatsKpis,
  getStatsPeriods,
  getStatsCategoryTotals,
  listDevis,
  getDevis,
  createDevis,
  updateDevis,
  listFactures,
  getFacture,
  createFacture,
  updateFacture,
  createAvoir,
  listContacts,
  getContact,
  createContact,
  updateContact,
  listContactGroups,
  createContactGroup,
  updateContactGroup,
  deleteContactGroup,
  deleteContact,
  listDons,
  createDon,
  updateDon,
  deleteDon,
  listLabelRules,
  createLabelRule,
  updateLabelRule,
  deleteLabelRule,
  applyLabelRules,
  listDonateurs,
  createDonateur,
  updateDonateur,
  deleteDonateur,
} from './handlers.ts';
import {
  getFacturePaymentStatus,
  listFacturePaymentMatches,
  linkTransactionToFacture,
  autoLinkFacturePaiements,
  addManualPaiement,
  unlinkPaiement,
} from './payments.ts';

// ---------------------------------------------------------------------------
// Adaptateur req/res simule (les handlers n'utilisent que readJsonBody/sendJson)
// ---------------------------------------------------------------------------

interface MockRes {
  statusCode: number;
  body: string;
  writeHead(status: number, _headers?: Record<string, string>): unknown;
  end(body?: string): unknown;
}

function makeMockReq(body: unknown): IncomingMessage {
  const payload = body === undefined ? '' : JSON.stringify(body);
  let dataDone = false;
  return {
    on(event: string, cb: (...args: unknown[]) => void): unknown {
      if (event === 'data' && !dataDone && payload !== '') cb(Buffer.from(payload, 'utf8'));
      if (event === 'end') {
        dataDone = true;
        cb();
      }
      // 'error' : jamais emis (payload deja valide)
      return this;
    },
    destroy(): unknown {
      return this;
    },
  } as unknown as IncomingMessage;
}

function makeMockRes(): MockRes & ServerResponse {
  const res: MockRes = {
    statusCode: 0,
    body: '',
    writeHead(status: number) {
      res.statusCode = status;
      return res;
    },
    end(body?: string) {
      res.body = body ?? '';
      return res;
    },
  };
  return res as MockRes & ServerResponse;
}

export interface ToolCallResult {
  status: number;
  json: Record<string, unknown>;
}

/** Execute un handler metier avec un contexte simule et renvoie la reponse JSON. */
export async function callTool(
  db: DatabaseSync,
  tool: ToolDef,
  args: Record<string, unknown>
): Promise<ToolCallResult> {
  const params: Record<string, string> = {};
  if (tool.idRequired) {
    const id = args['id'];
    if (tool.idType === 'int') {
      if (typeof id !== 'number' || !Number.isInteger(id)) {
        throw new HttpError(422, "Champ 'id' : entier requis");
      }
      params['id'] = String(id);
    } else {
      if (typeof id !== 'string' || id.trim() === '') {
        throw new HttpError(422, "Champ 'id' : chaine requise");
      }
      params['id'] = id.trim();
    }
  }
  if (tool.secondId) {
    const value = args[tool.secondId.param];
    if (tool.secondId.type === 'int') {
      if (typeof value !== 'number' || !Number.isInteger(value)) {
        throw new HttpError(422, `Champ '${tool.secondId.param}' : entier requis`);
      }
      params[tool.secondId.param] = String(value);
    } else {
      if (typeof value !== 'string' || value.trim() === '') {
        throw new HttpError(422, `Champ '${tool.secondId.param}' : chaine requise`);
      }
      params[tool.secondId.param] = value.trim();
    }
  }
  const query = new URLSearchParams();
  for (const field of tool.queryFields ?? []) {
    const value = args[field.name];
    if (value === undefined || value === null || value === '') continue;
    if (field.type === 'bool') {
      if (value === true) query.set(field.name, 'true');
      else if (value === false) query.set(field.name, 'false');
    } else if (field.type === 'csv' || field.type === 'csv_int') {
      // Liste MCP -> parametre CSV (ex. category_codes: ["ALIM","LOIS"] -> "ALIM,LOIS")
      if (Array.isArray(value) && value.length > 0) {
        query.set(field.name, value.map((item) => String(item)).join(','));
      }
    } else {
      query.set(field.name, String(value));
    }
  }
  if (tool.confirm && args['confirm'] === true) query.set('confirm', 'true');
  if (args['dry_run'] === true) query.set('dry_run', 'true');

  const body = args['body'];
  if (tool.bodyRequired && (body === undefined || body === null || typeof body !== 'object')) {
    throw new HttpError(422, "Champ 'body' : objet JSON requis");
  }
  const req = makeMockReq(body ?? {});
  const res = makeMockRes();
  const ctx: RouteContext = { db, params, query, req, res, actor: 'mcp' };
  try {
    await tool.handler(ctx);
    let json: Record<string, unknown> = {};
    if (res.body !== '') {
      try {
        json = JSON.parse(res.body) as Record<string, unknown>;
      } catch {
        json = { raw: res.body };
      }
    }
    return { status: res.statusCode, json };
  } catch (err) {
    if (err instanceof HttpError) {
      return { status: err.status, json: { error: err.message } };
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Table declarative des outils
// ---------------------------------------------------------------------------

interface QueryField {
  name: string;
  type: 'string' | 'int' | 'bool' | 'csv' | 'csv_int';
}

export interface ToolDef {
  name: string;
  description: string;
  handler: RouteHandler;
  idRequired?: boolean;
  idType?: 'int' | 'string';
  /** Second parametre de chemin (ex. paiementId sur DELETE /factures/{id}/paiements/{paiementId}). */
  secondId?: { param: string; type: 'int' | 'string' };
  bodyRequired?: boolean;
  confirm?: boolean;
  queryFields?: QueryField[];
}

const LIMIT_OFFSET: QueryField[] = [
  { name: 'limit', type: 'int' },
  { name: 'offset', type: 'int' },
];

const TX_LIST_FIELDS: QueryField[] = [
  { name: 'account_id', type: 'int' },
  { name: 'include_deleted', type: 'bool' },
  ...LIMIT_OFFSET,
];

const CONTACT_LIST_FIELDS: QueryField[] = [
  { name: 'include_archived', type: 'bool' },
  { name: 'group', type: 'string' },
  { name: 'q', type: 'string' },
  ...LIMIT_OFFSET,
];

const DON_LIST_FIELDS: QueryField[] = [{ name: 'donateur_id', type: 'string' }, ...LIMIT_OFFSET];

const STATS_FILTER_FIELDS: QueryField[] = [
  { name: 'account_ids', type: 'csv_int' },
  { name: 'category_codes', type: 'csv' },
  { name: 'exclude_categories', type: 'csv' },
  { name: 'date_start', type: 'string' },
  { name: 'date_end', type: 'string' },
  { name: 'search', type: 'string' },
];

export const TOOLS: ToolDef[] = [
  // Transactions
  { name: 'comptal_list_transactions', description: 'Liste les transactions (account_id, include_deleted, limit, offset).', handler: listTransactions, queryFields: TX_LIST_FIELDS },
  { name: 'comptal_get_transaction', description: 'Detail d\'une transaction par id (entier).', handler: getTransaction, idRequired: true, idType: 'int' },
  { name: 'comptal_create_transaction', description: 'Cree une transaction. body requis : account_id (entier), date (YYYY-MM-DD), label, et exactement un de debit/credit non nul (depense : debit>0 accepte et stocke negatif, convention app ; revenu : credit>0). category_code optionnel (code existant). dry_run supporte.', handler: createTransaction, bodyRequired: true },
  { name: 'comptal_update_transaction', description: 'Modifie une transaction (PATCH partiel via body). dry_run supporte.', handler: updateTransaction, idRequired: true, idType: 'int', bodyRequired: true },
  { name: 'comptal_delete_transaction', description: 'Supprime une transaction (suppression douce). dry_run supporte.', handler: deleteTransaction, idRequired: true, idType: 'int' },
  { name: 'comptal_export_transactions', description: 'Exporte les transactions en CSV (separateur ;, colonnes Date/Compte/Libelle/Debit/Credit/Categorie/N° facture, aligne ExportService). Filtres : account_id, include_deleted, limit, offset. Renvoie le CSV dans raw.', handler: exportTransactions, queryFields: [{ name: 'format', type: 'string' }, { name: 'account_id', type: 'int' }, { name: 'include_deleted', type: 'bool' }, ...LIMIT_OFFSET] },
  // Import CSV + templates d'import
  { name: 'comptal_import_transactions', description: 'Importe un CSV de transactions. body requis : account_id (entier), csv (texte CSV, 5 Mo max), mapping (indices de colonnes : dateColumnIndex, libelleColumnIndex, debitColumnIndex, creditColumnIndex requis ; dateValueColumnIndex, categoryColumnIndex, accountColumnIndex optionnels) ; filename, delimiter optionnels. Dates FR/ISO/serie Excel, montants FR/EN. dry_run supporte (apercu 5 lignes).', handler: importTransactions, bodyRequired: true },
  { name: 'comptal_list_import_templates', description: 'Liste les templates d\'import (en-tetes -> roles).', handler: listImportTemplates },
  { name: 'comptal_create_import_template', description: 'Cree un template d\'import. body requis : name, column_roles (objet en-tete -> role parmi date, dateValue, libelle, debit, credit, debitCredit, balance, ignore) ; account_id, initial_balance optionnels. dry_run supporte.', handler: createImportTemplate, bodyRequired: true },
  // Comptes
  { name: 'comptal_list_accounts', description: 'Liste les comptes.', handler: listAccounts },
  { name: 'comptal_get_account', description: 'Detail d\'un compte par id (entier).', handler: getAccount, idRequired: true, idType: 'int' },
  { name: 'comptal_create_account', description: 'Cree un compte. body requis : code, name. dry_run supporte.', handler: createAccount, bodyRequired: true },
  { name: 'comptal_update_account', description: 'Modifie un compte (PATCH partiel via body). dry_run supporte.', handler: updateAccount, idRequired: true, idType: 'int', bodyRequired: true },
  { name: 'comptal_delete_account', description: 'Supprime un compte (destructif, cascade transactions) : confirm=true requis. dry_run supporte.', handler: deleteAccount, idRequired: true, idType: 'int', confirm: true },
  // Categories
  { name: 'comptal_list_categories', description: 'Liste les categories.', handler: listCategories },
  { name: 'comptal_get_category', description: 'Detail d\'une categorie par id (entier).', handler: getCategory, idRequired: true, idType: 'int' },
  { name: 'comptal_create_category', description: 'Cree une categorie. body requis : code, name ; color optionnel (#RRGGBB). Le code X (transferts) est reserve. dry_run supporte.', handler: createCategory, bodyRequired: true },
  { name: 'comptal_update_category', description: 'Modifie une categorie (PATCH partiel via body). Le code X est protege. dry_run supporte.', handler: updateCategory, idRequired: true, idType: 'int', bodyRequired: true },
  { name: 'comptal_delete_category', description: 'Supprime une categorie. Le code X est protege. dry_run supporte.', handler: deleteCategory, idRequired: true, idType: 'int' },
  // Audit / regroupements / soldes
  { name: 'comptal_list_audit', description: 'Journal d\'audit (limit, offset), du plus recent au plus ancien.', handler: listAudit, queryFields: LIMIT_OFFSET },
  { name: 'comptal_list_category_groups', description: 'Liste les regroupements de categories.', handler: listCategoryGroups },
  { name: 'comptal_get_category_group', description: 'Detail d\'un regroupement de categories par id (entier).', handler: getCategoryGroup, idRequired: true, idType: 'int' },
  { name: 'comptal_create_category_group', description: 'Cree un regroupement de categories. body requis : name ; color optionnel (#RRGGBB). sort_order attribue automatiquement. dry_run supporte.', handler: createCategoryGroup, bodyRequired: true },
  { name: 'comptal_update_category_group', description: 'Modifie un regroupement de categories (PATCH partiel via body : name, color, sort_order). dry_run supporte.', handler: updateCategoryGroup, idRequired: true, idType: 'int', bodyRequired: true },
  { name: 'comptal_delete_category_group', description: 'Supprime un regroupement de categories (categories.group_id remis a NULL, sans supprimer les categories). dry_run supporte.', handler: deleteCategoryGroup, idRequired: true, idType: 'int' },
  { name: 'comptal_get_balances', description: 'Soldes par compte et par categorie (aligne ConfigService).', handler: getBalances },
  // Statistiques (aligne StatsService)
  { name: 'comptal_stats_kpis', description: 'KPIs des transactions filtrees : income, expenses, net, count, largestIncome, largestExpense, avgAmount. Filtres : account_ids (liste), category_codes (liste), exclude_categories (liste), date_start, date_end, search.', handler: getStatsKpis, queryFields: STATS_FILTER_FIELDS },
  { name: 'comptal_stats_periods', description: 'Semaines/mois/annees distincts des transactions (start/end par periode, ordre decroissant). Filtres identiques aux KPIs.', handler: getStatsPeriods, queryFields: STATS_FILTER_FIELDS },
  { name: 'comptal_stats_category_totals', description: 'Totaux par categorie (net, income, expenses, txCount), tries par montant absolu decroissant. Filtres identiques aux KPIs.', handler: getStatsCategoryTotals, queryFields: STATS_FILTER_FIELDS },
  // Facturation
  { name: 'comptal_list_devis', description: 'Liste les devis (limit, offset).', handler: listDevis, queryFields: LIMIT_OFFSET },
  { name: 'comptal_get_devis', description: 'Detail d\'un devis par id (chaine).', handler: getDevis, idRequired: true, idType: 'string' },
  { name: 'comptal_create_devis', description: 'Cree un devis (totaux recalcules). dry_run supporte.', handler: createDevis, bodyRequired: true },
  { name: 'comptal_update_devis', description: 'Modifie un devis (PATCH partiel via body). dry_run supporte.', handler: updateDevis, idRequired: true, idType: 'string', bodyRequired: true },
  { name: 'comptal_list_factures', description: 'Liste les factures (limit, offset).', handler: listFactures, queryFields: LIMIT_OFFSET },
  { name: 'comptal_get_facture', description: 'Detail d\'une facture par id (chaine).', handler: getFacture, idRequired: true, idType: 'string' },
  { name: 'comptal_create_facture', description: 'Cree une facture (devisOrigine verifie, totaux recalcules). dry_run supporte.', handler: createFacture, bodyRequired: true },
  { name: 'comptal_update_facture', description: 'Modifie une facture (PATCH partiel via body). dry_run supporte.', handler: updateFacture, idRequired: true, idType: 'string', bodyRequired: true },
  { name: 'comptal_create_avoir', description: 'Cree un avoir (facture invertee) depuis une facture : postes inverses, totaux negatifs, numero auto (invoice_settings) sauf si numero fourni. 422 si la facture est deja un avoir. dry_run supporte.', handler: createAvoir, idRequired: true, idType: 'string' },
  // Suivi des paiements de factures (PaymentTracking)
  { name: 'comptal_get_facture_payment_status', description: 'Statut de paiement d\'une facture : paidAmount, totalTTC, percent, remaining, statut_calcule (payee|payee_partiellement|en_retard|envoyee|brouillon).', handler: getFacturePaymentStatus, idRequired: true, idType: 'string' },
  { name: 'comptal_list_facture_payment_matches', description: 'Transactions candidates pour payer cette facture (libelle contenant le numero et/ou montant correspondant) : items [{transaction, reason, score}], total. Lecture seule.', handler: listFacturePaymentMatches, idRequired: true, idType: 'string' },
  { name: 'comptal_link_facture_paiement', description: 'Lie une transaction (credit) comme paiement de la facture. body requis : transaction_id (entier). Idempotent si deja liee ; 422 si la transaction est un debit. dry_run supporte.', handler: linkTransactionToFacture, idRequired: true, idType: 'string', bodyRequired: true },
  { name: 'comptal_autolink_facture_paiements', description: 'Lie automatiquement les transactions dont le libelle contient le numero de facture. Renvoie linked (nombre de paiements lies, 0 si aucun). dry_run supporte.', handler: autoLinkFacturePaiements, idRequired: true, idType: 'string' },
  { name: 'comptal_add_facture_paiement', description: 'Enregistre un paiement manuel (especes/cheque) et cree la transaction de tresorerie correspondante. body requis : montant (>0), date (YYYY-MM-DD), mode (especes|cheque), account_id (entier) ; reference optionnel. 422 si facture deja soldee. dry_run supporte.', handler: addManualPaiement, idRequired: true, idType: 'string', bodyRequired: true },
  { name: 'comptal_unlink_facture_paiement', description: 'Retire un paiement de la facture (statut recalcule) : confirm=true requis, paiement_id (chaine) requis. dry_run supporte.', handler: unlinkPaiement, idRequired: true, idType: 'string', secondId: { param: 'paiementId', type: 'string' }, confirm: true },
  // Contacts
  { name: 'comptal_list_contacts', description: 'Liste les contacts (include_archived, group, q, limit, offset).', handler: listContacts, queryFields: CONTACT_LIST_FIELDS },
  { name: 'comptal_get_contact', description: 'Detail d\'un contact par id (chaine).', handler: getContact, idRequired: true, idType: 'string' },
  { name: 'comptal_create_contact', description: 'Cree un contact. body : au moins nom, prenom ou denominationSociale ; type (particulier|entreprise), email, roles, adresses, coordonneesBancaires optionnels. dry_run supporte.', handler: createContact, bodyRequired: true },
  { name: 'comptal_update_contact', description: 'Modifie un contact (PATCH partiel via body). dry_run supporte.', handler: updateContact, idRequired: true, idType: 'string', bodyRequired: true },
  { name: 'comptal_list_contact_groups', description: 'Liste les groupements de contacts.', handler: listContactGroups },
  { name: 'comptal_create_contact_group', description: 'Cree un groupement de contacts. body requis : nom ; id optionnel (prefixe cgrp genere sinon). dry_run supporte.', handler: createContactGroup, bodyRequired: true },
  { name: 'comptal_update_contact_group', description: 'Renomme un groupement de contacts (PATCH partiel via body : nom). dry_run supporte.', handler: updateContactGroup, idRequired: true, idType: 'string', bodyRequired: true },
  { name: 'comptal_delete_contact_group', description: 'Supprime un groupement de contacts (clients.groupeId remis a NULL, contacts conserves). dry_run supporte.', handler: deleteContactGroup, idRequired: true, idType: 'string' },
  { name: 'comptal_delete_contact', description: 'Supprime definitivement un contact : refuse (409) si devis, factures ou dons lies ; confirm=true requis. dry_run supporte.', handler: deleteContact, idRequired: true, idType: 'string', confirm: true },
  // Dons
  { name: 'comptal_list_dons', description: 'Liste les dons manuels (donateur_id, limit, offset).', handler: listDons, queryFields: DON_LIST_FIELDS },
  { name: 'comptal_create_don', description: 'Enregistre un don manuel. body requis : donateurId (id donateur ou ANONYME), montant (>0), natureDon (numeraire|nature|mecenat_competences) ; modeVersement, date, description optionnels. dry_run supporte.', handler: createDon, bodyRequired: true },
  { name: 'comptal_update_don', description: 'Modifie un don manuel (PATCH partiel via body : donateurId, montant, natureDon, modeVersement, date, datePerception, donorLabel, description, notes). dry_run supporte.', handler: updateDon, idRequired: true, idType: 'string', bodyRequired: true },
  { name: 'comptal_delete_don', description: 'Supprime un don manuel (definitif) : confirm=true requis. dry_run supporte.', handler: deleteDon, idRequired: true, idType: 'string', confirm: true },
  // Regles de libelles
  { name: 'comptal_list_label_rules', description: 'Liste les regles de libelles (table label_rules, triees par word).', handler: listLabelRules },
  { name: 'comptal_create_label_rule', description: 'Cree ou met a jour une regle de libelle par mot (upsert). body requis : word (4 caracteres minimum, normalise en majuscules), categoryCode (categorie existante) ; tag optionnel. dry_run supporte.', handler: createLabelRule, bodyRequired: true },
  { name: 'comptal_update_label_rule', description: 'Modifie une regle de libelle (PATCH partiel via body : categoryCode, tag, active ; le mot n\'est pas modifiable). dry_run supporte.', handler: updateLabelRule, idRequired: true, idType: 'int', bodyRequired: true },
  { name: 'comptal_delete_label_rule', description: 'Supprime une regle de libelle (definitif, sans cascade). dry_run supporte.', handler: deleteLabelRule, idRequired: true, idType: 'int' },
  { name: 'comptal_apply_label_rules', description: 'Applique les regles de libelles actives aux transactions sans categorie (mot le plus long prioritaire). body optionnel : ids (liste d\'entiers), import_id (entier) pour cibler ; dry_run=true renvoie l\'apercu des changements sans appliquer.', handler: applyLabelRules },
  // Donateurs
  { name: 'comptal_list_donateurs', description: 'Liste les donateurs (q : recherche nom/prenom/raison sociale/email, limit, offset).', handler: listDonateurs, queryFields: LIMIT_OFFSET },
  { name: 'comptal_create_donateur', description: 'Cree un donateur. body : type (particulier|entreprise), nom, prenom, denominationSociale, civilite, email, telephone, adresse, categoryCode, notes optionnels. dry_run supporte.', handler: createDonateur, bodyRequired: true },
  { name: 'comptal_update_donateur', description: 'Modifie un donateur (PATCH partiel via body). dry_run supporte.', handler: updateDonateur, idRequired: true, idType: 'string', bodyRequired: true },
  { name: 'comptal_delete_donateur', description: 'Supprime un donateur (definitif, supprime aussi ses liens transactions) : confirm=true requis. dry_run supporte.', handler: deleteDonateur, idRequired: true, idType: 'string', confirm: true },
];

function toolInputSchema(tool: ToolDef): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  if (tool.idRequired) {
    properties['id'] = { type: tool.idType === 'int' ? 'integer' : 'string' };
    required.push('id');
  }
  if (tool.secondId) {
    properties[tool.secondId.param] = { type: tool.secondId.type === 'int' ? 'integer' : 'string' };
    required.push(tool.secondId.param);
  }
  if (tool.bodyRequired) {
    properties['body'] = { type: 'object', additionalProperties: true, description: 'Payload JSON valide par le handler metier.' };
    required.push('body');
  }
  if (tool.confirm) {
    properties['confirm'] = { type: 'boolean', description: 'Confirmation explicite des suppressions destructives.' };
  }
  properties['dry_run'] = { type: 'boolean', description: 'Simule l\'action sans ecrire (renvoie le diff prevu).' };
  for (const field of tool.queryFields ?? []) {
    properties[field.name] =
      field.type === 'int'
        ? { type: 'integer' }
        : field.type === 'bool'
          ? { type: 'boolean' }
          : { type: 'string' };
  }
  return { type: 'object', properties, required, additionalProperties: false };
}

// ---------------------------------------------------------------------------
// JSON-RPC 2.0 / MCP
// ---------------------------------------------------------------------------

const PROTOCOL_VERSION = '2025-06-18';
const ERR_PARSE = -32700;
const ERR_INVALID_PARAMS = -32602;
const ERR_METHOD_NOT_FOUND = -32601;
const ERR_INTERNAL = -32603;
const ERR_UNAUTHORIZED = -32001;

interface JsonRpcId {
  jsonrpc: '2.0';
  id: number | string | null;
}

function errorResponse(id: JsonRpcId['id'], code: number, message: string): Record<string, unknown> {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

function resultResponse(id: JsonRpcId['id'], result: unknown): Record<string, unknown> {
  return { jsonrpc: '2.0', id, result };
}

/** Comparaison du jeton en temps constant (hashes, pas de fuite de longueur). */
function tokenMatches(provided: unknown, expected: string): boolean {
  if (typeof provided !== 'string' || provided.length === 0) return false;
  const a = crypto.createHash('sha256').update(provided).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

function extractToken(params: Record<string, unknown>): unknown {
  const meta = params['_meta'];
  if (meta !== null && typeof meta === 'object' && !Array.isArray(meta)) {
    const m = meta as Record<string, unknown>;
    if (m['token'] !== undefined) return m['token'];
    if (m['comptal.token'] !== undefined) return m['comptal.token'];
  }
  return params['token'];
}

function findTool(name: unknown): ToolDef | undefined {
  if (typeof name !== 'string') return undefined;
  return TOOLS.find((t) => t.name === name);
}

/**
 * Traite un message JSON-RPC deja parse. Renvoie la reponse a ecrire, ou null
 * pour une notification (pas d'id, rien a repondre).
 */
export async function handleMessage(
  db: DatabaseSync,
  token: string,
  message: unknown
): Promise<Record<string, unknown> | null> {
  if (message === null || typeof message !== 'object' || Array.isArray(message)) {
    return errorResponse(null, ERR_INVALID_PARAMS, 'Requete JSON-RPC invalide');
  }
  const msg = message as Record<string, unknown>;
  const id = 'id' in msg ? (msg['id'] as JsonRpcId['id']) : null;
  const isNotification = !('id' in msg);
  const method = typeof msg['method'] === 'string' ? msg['method'] : '';
  const rawParams = msg['params'];
  const params: Record<string, unknown> =
    rawParams !== null && typeof rawParams === 'object' && !Array.isArray(rawParams)
      ? (rawParams as Record<string, unknown>)
      : {};

  switch (method) {
    case 'initialize': {
      if (isNotification) return null;
      const clientVersion = typeof params['protocolVersion'] === 'string' ? params['protocolVersion'] : PROTOCOL_VERSION;
      return resultResponse(id, {
        protocolVersion: clientVersion,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'comptal21-agent-api-mcp', version: '0.1.0' },
        instructions:
          "Serveur MCP du profil Comptal2.1. Chaque tools/call doit porter le jeton dans params._meta.token (ou params.token). Les ecritures supportent dry_run.",
      });
    }
    case 'notifications/initialized':
      return null;
    case 'ping':
      return isNotification ? null : resultResponse(id, {});
    case 'tools/list':
      if (isNotification) return null;
      return resultResponse(id, {
        tools: TOOLS.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: toolInputSchema(t),
        })),
      });
    case 'tools/call': {
      if (isNotification) return null;
      if (!tokenMatches(extractToken(params), token)) {
        return errorResponse(
          id,
          ERR_UNAUTHORIZED,
          "Jeton manquant ou invalide : fournir COMPTAL_AGENT_TOKEN dans params._meta.token (ou params.token)."
        );
      }
      const tool = findTool(params['name']);
      if (!tool) {
        return errorResponse(id, ERR_INVALID_PARAMS, `Outil inconnu : ${String(params['name'])}`);
      }
      const args =
        params['arguments'] !== null && typeof params['arguments'] === 'object' && !Array.isArray(params['arguments'])
          ? (params['arguments'] as Record<string, unknown>)
          : {};
      try {
        const { status, json } = await callTool(db, tool, args);
        return resultResponse(id, {
          content: [{ type: 'text', text: JSON.stringify({ status, ...json }) }],
          isError: status >= 400,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return errorResponse(id, ERR_INTERNAL, message);
      }
    }
    default:
      if (isNotification) return null;
      return errorResponse(id, ERR_METHOD_NOT_FOUND, `Methode inconnue : ${method}`);
  }
}

// ---------------------------------------------------------------------------
// Point d'entree stdio
// ---------------------------------------------------------------------------

function main(): void {
  const config = loadConfig();
  const db = openDb(config.dbPath);
  const rl = readline.createInterface({ input: process.stdin, terminal: false });
  const write = (payload: Record<string, unknown>): void => {
    process.stdout.write(JSON.stringify(payload) + '\n');
  };
  rl.on('line', (line: string) => {
    const trimmed = line.trim();
    if (trimmed === '') return;
    let message: unknown;
    try {
      message = JSON.parse(trimmed);
    } catch {
      write(errorResponse(null, ERR_PARSE, 'JSON invalide'));
      return;
    }
    handleMessage(db, config.token, message)
      .then((response) => {
        if (response !== null) write(response);
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        write(errorResponse(null, ERR_INTERNAL, message));
      });
  });
  rl.on('close', () => {
    db.close();
    process.exit(0);
  });
}

if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('src/mcp.ts')) {
  main();
}
