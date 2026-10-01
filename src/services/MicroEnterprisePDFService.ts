import { save } from '@tauri-apps/plugin-dialog';
import pdfMake from 'pdfmake/build/pdfmake';
import type { TableCell, TDocumentDefinitions } from 'pdfmake/interfaces';
import { MicroEnterpriseConfig, MicroReceipt } from '../types/microEnterprise';
import { formatMoney } from '../utils/invoiceFormat';
import { tauriBridge } from './tauri';
import { withLog } from './logger';

let fontsLoaded = false;

async function loadFonts(): Promise<void> {
  if (fontsLoaded) return;
  const module = await import('pdfmake/build/vfs_fonts');
  const source = module.default as unknown as { vfs?: unknown; pdfMake?: { vfs?: unknown } };
  const vfs = source?.vfs ?? source?.pdfMake?.vfs;
  if (vfs) Object.defineProperty(pdfMake, 'vfs', { value: vfs, writable: true, configurable: true });
  fontsLoaded = true;
}

async function buffer(definition: TDocumentDefinitions): Promise<Uint8Array> {
  await loadFonts();
  return new Promise((resolve, reject) => {
    try {
      pdfMake.createPdf(definition).getBuffer((value) => resolve(new Uint8Array(value)));
    } catch (error) {
      reject(error);
    }
  });
}

export const MicroEnterprisePDFService = {
  async exportReceiptBook(
    receipts: MicroReceipt[],
    config: MicroEnterpriseConfig
  ): Promise<boolean> {
    return withLog('MicroEnterprisePDFService.exportReceiptBook', async () => {
      const destination = await save({
        defaultPath: `livre_recettes_${config.fiscalYear}.pdf`,
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
      });
      if (!destination) return false;
      const total = receipts.reduce((sum, item) => sum + item.amount, 0);
      const rows: TableCell[][] = receipts.map((item) => [
        String(item.sequence),
        item.receivedDate.split('-').reverse().join('/'),
        item.clientName,
        item.description,
        item.paymentMethod,
        item.invoiceNumber || item.reference || '—',
        { text: formatMoney(item.amount), alignment: 'right' },
      ]);
      const definition: TDocumentDefinitions = {
        pageSize: 'A4',
        pageOrientation: 'landscape',
        pageMargins: [28, 48, 28, 42],
        header: {
          text: `Livre des recettes — ${config.fiscalYear}`,
          margin: [28, 18, 28, 0],
          bold: true,
          color: '#1e3a8a',
        },
        footer: (current, count) => ({
          text: `Document généré par Comptal2.1 — page ${current}/${count} — outil de gestion, pas un FEC`,
          alignment: 'center',
          fontSize: 8,
          color: '#64748b',
          margin: [0, 12, 0, 0],
        }),
        content: [
          {
            text: `Période du 01/01/${config.fiscalYear} au 31/12/${config.fiscalYear}`,
            margin: [0, 0, 0, 12],
          },
          {
            table: {
              headerRows: 1,
              widths: [24, 54, 92, '*', 58, 72, 68],
              body: [
                ['N°', 'Date', 'Client', 'Nature de la recette', 'Règlement', 'Référence', 'Montant'].map(
                  (text) => ({ text, bold: true, color: '#ffffff', fillColor: '#1e3a8a' })
                ),
                ...rows,
              ],
            },
            layout: 'lightHorizontalLines',
          },
          {
            columns: [
              { text: 'Total des encaissements nets', bold: true },
              { text: formatMoney(total), bold: true, alignment: 'right' },
            ],
            margin: [0, 14, 0, 0],
          },
          {
            text: 'Les corrections figurent comme contrepassations ; aucune ligne validée du livre n’est supprimée ou modifiée.',
            fontSize: 8,
            color: '#64748b',
            margin: [0, 10, 0, 0],
          },
        ],
        defaultStyle: { fontSize: 8.5 },
      };
      const bytes = await buffer(definition);
      await tauriBridge.writeExternalBinaryFile(destination, Array.from(bytes));
      return true;
    });
  },
};
