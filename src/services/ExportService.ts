import { save } from '@tauri-apps/plugin-dialog';
import { StatsFilters, StatsService, TransactionListRow } from './StatsService';
import { tauriBridge } from './tauri';
import { withLog } from './logger';
import { formatFrDate } from '../utils/dateFormats';
import { csvQuote } from '../utils/security';
import { InvoiceService } from './InvoiceService';
import { PluginService } from './PluginService';
import { ExportCsvField, PluginExportMapper } from '../types/plugin';
import { ConfigService } from './ConfigService';
import { ClientService } from './ClientService';
import { DonationService } from './DonationService';
import { AmortissementService } from './AmortissementService';
import { clientDisplayName } from '../utils/invoiceFormat';
import { ExcelCellValue, ExcelSheetInput, saveExcelWorkbook } from '../utils/excelExport';

const DEFAULT_HEADERS: Array<{ header: string; field: ExportCsvField }> = [
  { header: 'Date', field: 'date' },
  { header: 'Compte', field: 'account' },
  { header: 'Libellé', field: 'label' },
  { header: 'Débit', field: 'debit' },
  { header: 'Crédit', field: 'credit' },
  { header: 'Catégorie', field: 'category' },
  { header: 'N° facture', field: 'invoiceNumero' },
];

interface AccountantRow extends TransactionListRow {
  invoiceNumero: string;
}

function fieldValue(row: AccountantRow, field: ExportCsvField): string {
  switch (field) {
    case 'date':
      return formatFrDate(row.date);
    case 'account':
      return row.accountCode;
    case 'label':
      return row.label;
    case 'debit':
      return row.debit ? String(row.debit).replace('.', ',') : '';
    case 'credit':
      return row.credit ? String(row.credit).replace('.', ',') : '';
    case 'category':
      return row.categoryCode ?? '';
    case 'invoiceNumero':
      return row.invoiceNumero;
  }
}

function rowsToCsv(rows: AccountantRow[], mapper?: PluginExportMapper | null): string {
  const delimiter = mapper?.delimiter ?? ';';
  const columns = mapper?.columns?.length ? mapper.columns : DEFAULT_HEADERS;
  const header = columns.map((col) => csvQuote(col.header)).join(delimiter);
  const lines = rows.map((row) =>
    columns.map((col) => csvQuote(fieldValue(row, col.field))).join(delimiter)
  );
  return [header, ...lines].join('\n');
}

async function invoiceNumeroByTx(): Promise<Map<string, string>> {
  const factures = await InvoiceService.loadFactures();
  const map = new Map<string, string>();
  for (const facture of factures) {
    if (facture.supprime) continue;
    for (const paiement of facture.paiements) {
      if (paiement.transactionId) {
        const previous = map.get(paiement.transactionId);
        map.set(
          paiement.transactionId,
          previous ? `${previous}, ${facture.numero}` : facture.numero
        );
      }
    }
  }
  return map;
}

function sheetFromObjects(
  name: string,
  headers: string[],
  rows: ExcelCellValue[][]
): ExcelSheetInput {
  return { name, rows: [headers, ...rows] };
}

export const ExportService = {
  async exportTransactionsCsv(filters: StatsFilters): Promise<void> {
    return this.exportAccountantCsv(filters);
  },

  async exportAccountantCsv(filters: StatsFilters): Promise<void> {
    return withLog('ExportService.exportAccountantCsv', async () => {
      const [rows, invoiceMap, mapper] = await Promise.all([
        StatsService.listAllTransactions(filters),
        invoiceNumeroByTx(),
        PluginService.getActiveExportMapper().catch(() => null),
      ]);
      const accountantRows: AccountantRow[] = rows.map((row) => ({
        ...row,
        invoiceNumero: invoiceMap.get(String(row.id)) ?? '',
      }));
      const dest = await save({
        defaultPath: `comptal_tresorerie_${filters.dateStart ?? 'all'}_${filters.dateEnd ?? 'all'}.csv`,
        filters: [{ name: 'CSV', extensions: ['csv'] }],
      });
      if (!dest) return;
      await tauriBridge.writeExternalTextFile(dest, rowsToCsv(accountantRows, mapper));
    });
  },

  /** Export d’un tableau Finance globale (une feuille). Retourne false si annulé. */
  async exportTableExcel(
    defaultFileName: string,
    sheetName: string,
    headers: string[],
    rows: ExcelCellValue[][]
  ): Promise<boolean> {
    return withLog('ExportService.exportTableExcel', async () => {
      return saveExcelWorkbook(defaultFileName, [sheetFromObjects(sheetName, headers, rows)]);
    });
  },

  /**
   * Export cumulé du profil actif : comptes, catégories, transactions,
   * contacts, factures, dons, immobilisations — une feuille par domaine.
   */
  async exportCumulativeExcel(): Promise<boolean> {
    return withLog('ExportService.exportCumulativeExcel', async () => {
      const [accounts, categories, groups, transactions, invoiceMap, clients, factures, donations, immobilisations] =
        await Promise.all([
          ConfigService.listAccounts(),
          ConfigService.listCategories(),
          ConfigService.listCategoryGroups(),
          StatsService.listAllTransactions({}),
          invoiceNumeroByTx(),
          ClientService.loadClients(),
          InvoiceService.loadFactures(),
          DonationService.list(),
          AmortissementService.list(),
        ]);

      const groupById = new Map(groups.map((g) => [g.id, g.name]));
      const clientById = new Map(clients.map((c) => [c.id, c]));
      const stamp = new Date().toISOString().slice(0, 10);

      const toIsoDate = (value: Date | string | undefined): string => {
        if (!value) return '';
        if (typeof value === 'string') return value.slice(0, 10);
        return value.toISOString().slice(0, 10);
      };

      const sheets: ExcelSheetInput[] = [
        sheetFromObjects(
          'Comptes',
          ['Code', 'Nom', 'Solde initial', 'Couleur'],
          accounts.map((a) => [a.code, a.name, a.initialBalance, a.color])
        ),
        sheetFromObjects(
          'Catégories',
          ['Code', 'Nom', 'Regroupement', 'Couleur'],
          categories.map((c) => [
            c.code,
            c.name,
            c.groupId != null ? (groupById.get(c.groupId) ?? '') : '',
            c.color,
          ])
        ),
        sheetFromObjects(
          'Transactions',
          ['Date', 'Compte', 'Libellé', 'Débit', 'Crédit', 'Catégorie', 'N° facture'],
          transactions.map((row) => [
            formatFrDate(row.date),
            row.accountCode,
            row.label,
            row.debit || '',
            row.credit || '',
            row.categoryCode ?? '',
            invoiceMap.get(String(row.id)) ?? '',
          ])
        ),
        sheetFromObjects(
          'Contacts',
          ['Code', 'Nom', 'Type', 'Rôles', 'Email', 'Téléphone', 'SIRET', 'Archivé'],
          clients.map((c) => [
            c.codeClient ?? '',
            clientDisplayName(c),
            c.type,
            (c.roles ?? []).join(', '),
            c.email ?? '',
            c.telephone ?? '',
            c.siret ?? '',
            c.archived ? 'oui' : 'non',
          ])
        ),
        sheetFromObjects(
          'Factures',
          ['Numéro', 'Date', 'Client', 'Statut', 'Total HT', 'Total TTC', 'Supprimée'],
          factures.map((f) => {
            const client = clientById.get(f.clientId);
            return [
              f.numero,
              formatFrDate(toIsoDate(f.dateEmission)),
              client ? clientDisplayName(client) : f.clientId,
              f.statut,
              f.totalHT,
              f.totalTTC,
              f.supprime ? 'oui' : 'non',
            ];
          })
        ),
        sheetFromObjects(
          'Dons',
          [
            'Date',
            'Contact',
            'Anonyme',
            'Nature',
            'Montant',
            'Source',
            'Mode',
            'Éligible reçu',
            'Description',
          ],
          donations.map((d) => [
            formatFrDate(d.date),
            d.anonymous ? (d.donorLabel ?? 'Anonyme') : (d.donorLabel ?? d.contactId ?? ''),
            d.anonymous ? 'oui' : 'non',
            d.natureDon,
            d.montant,
            d.source,
            d.modeVersement ?? '',
            d.receiptEligible ? 'oui' : 'non',
            d.description ?? '',
          ])
        ),
        sheetFromObjects(
          'Immobilisations',
          [
            'Désignation',
            'Référence',
            'Type',
            'VA HT',
            'TVA %',
            'Acquisition',
            'Mise en service',
            'Durée (ans)',
            'Méthode',
            'VR',
            'Statut',
            'Faible valeur',
            'Subvention',
          ],
          immobilisations.map((i) => [
            i.designation,
            i.reference ?? '',
            i.typeImmobilisation,
            i.valeurAcquisitionHT,
            i.tauxTVA,
            formatFrDate(i.dateAcquisition),
            formatFrDate(i.dateMiseEnService),
            i.dureeAnnees,
            i.methode,
            i.valeurResiduelle,
            i.statut,
            i.faibleValeur ? 'oui' : 'non',
            i.subventionInvestissement,
          ])
        ),
      ];

      return saveExcelWorkbook(`comptal_donnees_cumulees_${stamp}`, sheets);
    });
  },
};
