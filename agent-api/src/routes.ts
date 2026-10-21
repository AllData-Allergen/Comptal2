// Registre des routes de l'API agent.
// Chaque route : methode + pattern d'URL (groupes nommees -> params) + handler.
import type { DatabaseSync } from 'node:sqlite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  listTransactions,
  getTransaction,
  createTransaction,
  updateTransaction,
  deleteTransaction,
  exportTransactions,
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
  getCategoryGroup,
  createCategoryGroup,
  updateCategoryGroup,
  deleteCategoryGroup,
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
  importTransactions,
  listImportTemplates,
  createImportTemplate,
} from './handlers.ts';
import {
  getFacturePaymentStatus,
  listFacturePaymentMatches,
  linkTransactionToFacture,
  autoLinkFacturePaiements,
  addManualPaiement,
  unlinkPaiement,
} from './payments.ts';

export interface RouteContext {
  db: DatabaseSync;
  params: Record<string, string>;
  query: URLSearchParams;
  req: IncomingMessage;
  res: ServerResponse;
  actor: string;
}

export type RouteHandler = (ctx: RouteContext) => Promise<void> | void;

export interface RouteDef {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  pattern: RegExp;
  handler: RouteHandler;
}

export function registerRoutes(_db: DatabaseSync): RouteDef[] {
  const routes: RouteDef[] = [
    // Informations sur l'API (authentifie, ne revele aucune donnee metier).
    {
      method: 'GET',
      pattern: /^\/version$/,
      handler: (ctx) => {
        ctx.res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        ctx.res.end(
          JSON.stringify({
            service: 'comptal21-agent-api',
            api_version: 'v1',
            capabilities: [
              'transactions',
              'accounts',
              'categories',
              'audit',
              'dry_run',
              'contacts',
              'facturation',
              'payment_tracking',
              'dons',
              'import_csv',
              'balances',
              'stats',
              'mcp',
            ],
          })
        );
      },
    },
    // Transactions
    { method: 'GET', pattern: /^\/transactions$/, handler: listTransactions },
    { method: 'POST', pattern: /^\/transactions$/, handler: createTransaction },
    { method: 'GET', pattern: /^\/transactions\/(?<id>\d+)$/, handler: getTransaction },
    { method: 'PATCH', pattern: /^\/transactions\/(?<id>\d+)$/, handler: updateTransaction },
    { method: 'DELETE', pattern: /^\/transactions\/(?<id>\d+)$/, handler: deleteTransaction },
    // Export CSV des transactions (aligne ExportService)
    { method: 'GET', pattern: /^\/export\/transactions$/, handler: exportTransactions },
    // Import CSV de transactions + templates d'import (aligne ImportService / ImportTemplateService)
    { method: 'POST', pattern: /^\/imports\/transactions$/, handler: importTransactions },
    { method: 'GET', pattern: /^\/import-templates$/, handler: listImportTemplates },
    { method: 'POST', pattern: /^\/import-templates$/, handler: createImportTemplate },
    // Comptes
    { method: 'GET', pattern: /^\/accounts$/, handler: listAccounts },
    { method: 'POST', pattern: /^\/accounts$/, handler: createAccount },
    { method: 'GET', pattern: /^\/accounts\/(?<id>\d+)$/, handler: getAccount },
    { method: 'PATCH', pattern: /^\/accounts\/(?<id>\d+)$/, handler: updateAccount },
    { method: 'DELETE', pattern: /^\/accounts\/(?<id>\d+)$/, handler: deleteAccount },
    // Categories
    { method: 'GET', pattern: /^\/categories$/, handler: listCategories },
    { method: 'POST', pattern: /^\/categories$/, handler: createCategory },
    { method: 'GET', pattern: /^\/categories\/(?<id>\d+)$/, handler: getCategory },
    { method: 'PATCH', pattern: /^\/categories\/(?<id>\d+)$/, handler: updateCategory },
    { method: 'DELETE', pattern: /^\/categories\/(?<id>\d+)$/, handler: deleteCategory },
    // Journal d'audit (lecture seule)
    { method: 'GET', pattern: /^\/audit$/, handler: listAudit },
    // Regroupements de categories (aligne ConfigService)
    { method: 'GET', pattern: /^\/category-groups$/, handler: listCategoryGroups },
    { method: 'POST', pattern: /^\/category-groups$/, handler: createCategoryGroup },
    { method: 'GET', pattern: /^\/category-groups\/(?<id>\d+)$/, handler: getCategoryGroup },
    { method: 'PATCH', pattern: /^\/category-groups\/(?<id>\d+)$/, handler: updateCategoryGroup },
    { method: 'DELETE', pattern: /^\/category-groups\/(?<id>\d+)$/, handler: deleteCategoryGroup },
    // Soldes par compte et par categorie (lecture seule, aligne ConfigService)
    { method: 'GET', pattern: /^\/balances$/, handler: getBalances },
    // Statistiques (lecture seule, aligne StatsService)
    { method: 'GET', pattern: /^\/stats\/kpis$/, handler: getStatsKpis },
    { method: 'GET', pattern: /^\/stats\/periods$/, handler: getStatsPeriods },
    { method: 'GET', pattern: /^\/stats\/category-totals$/, handler: getStatsCategoryTotals },
    // Facturation : devis et factures (payload JSON aligne InvoiceService)
    { method: 'GET', pattern: /^\/devis$/, handler: listDevis },
    { method: 'GET', pattern: /^\/devis\/(?<id>[^/]+)$/, handler: getDevis },
    { method: 'POST', pattern: /^\/devis$/, handler: createDevis },
    { method: 'PATCH', pattern: /^\/devis\/(?<id>[^/]+)$/, handler: updateDevis },
    { method: 'GET', pattern: /^\/factures$/, handler: listFactures },
    { method: 'GET', pattern: /^\/factures\/(?<id>[^/]+)$/, handler: getFacture },
    { method: 'POST', pattern: /^\/factures$/, handler: createFacture },
    { method: 'PATCH', pattern: /^\/factures\/(?<id>[^/]+)$/, handler: updateFacture },
    { method: 'POST', pattern: /^\/factures\/(?<id>[^/]+)\/avoir$/, handler: createAvoir },
    // Suivi des paiements de factures (aligne PaymentTrackingService)
    { method: 'GET', pattern: /^\/factures\/(?<id>[^/]+)\/payment-status$/, handler: getFacturePaymentStatus },
    { method: 'GET', pattern: /^\/factures\/(?<id>[^/]+)\/paiements\/matches$/, handler: listFacturePaymentMatches },
    { method: 'POST', pattern: /^\/factures\/(?<id>[^/]+)\/paiements\/link$/, handler: linkTransactionToFacture },
    { method: 'POST', pattern: /^\/factures\/(?<id>[^/]+)\/paiements\/auto-link$/, handler: autoLinkFacturePaiements },
    { method: 'POST', pattern: /^\/factures\/(?<id>[^/]+)\/paiements$/, handler: addManualPaiement },
    { method: 'DELETE', pattern: /^\/factures\/(?<id>[^/]+)\/paiements\/(?<paiementId>[^/]+)$/, handler: unlinkPaiement },
    // Contacts / clients (payload JSON aligne ClientService)
    { method: 'GET', pattern: /^\/contacts$/, handler: listContacts },
    { method: 'POST', pattern: /^\/contacts$/, handler: createContact },
    { method: 'GET', pattern: /^\/contacts\/(?<id>[^/]+)$/, handler: getContact },
    { method: 'PATCH', pattern: /^\/contacts\/(?<id>[^/]+)$/, handler: updateContact },
    { method: 'DELETE', pattern: /^\/contacts\/(?<id>[^/]+)$/, handler: deleteContact },
    // Groupements de contacts (aligne ContactGroupService)
    { method: 'GET', pattern: /^\/contact-groups$/, handler: listContactGroups },
    { method: 'POST', pattern: /^\/contact-groups$/, handler: createContactGroup },
    { method: 'PATCH', pattern: /^\/contact-groups\/(?<id>[^/]+)$/, handler: updateContactGroup },
    { method: 'DELETE', pattern: /^\/contact-groups\/(?<id>[^/]+)$/, handler: deleteContactGroup },
    // Dons manuels (payload JSON aligne DonsService)
    { method: 'GET', pattern: /^\/dons$/, handler: listDons },
    { method: 'POST', pattern: /^\/dons$/, handler: createDon },
    { method: 'PATCH', pattern: /^\/dons\/(?<id>[^/]+)$/, handler: updateDon },
    { method: 'DELETE', pattern: /^\/dons\/(?<id>[^/]+)$/, handler: deleteDon },
    // Regles de libelles (table label_rules, aligne LabelRuleService)
    { method: 'GET', pattern: /^\/label-rules$/, handler: listLabelRules },
    { method: 'POST', pattern: /^\/label-rules$/, handler: createLabelRule },
    { method: 'POST', pattern: /^\/label-rules\/apply$/, handler: applyLabelRules },
    { method: 'PATCH', pattern: /^\/label-rules\/(?<id>\d+)$/, handler: updateLabelRule },
    { method: 'DELETE', pattern: /^\/label-rules\/(?<id>\d+)$/, handler: deleteLabelRule },
    // Donateurs (payload JSON aligne DonateurService)
    { method: 'GET', pattern: /^\/donateurs$/, handler: listDonateurs },
    { method: 'POST', pattern: /^\/donateurs$/, handler: createDonateur },
    { method: 'PATCH', pattern: /^\/donateurs\/(?<id>[^/]+)$/, handler: updateDonateur },
    { method: 'DELETE', pattern: /^\/donateurs\/(?<id>[^/]+)$/, handler: deleteDonateur },
  ];
  return routes;
}
