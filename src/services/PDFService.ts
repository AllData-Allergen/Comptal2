import pdfMake from 'pdfmake/build/pdfmake';
import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';
import {
  Devis,
  Emetteur,
  EmetteurExtended,
  Facture,
  PDFTemplate,
  PosteFacture,
  PosteMateriel,
  PosteTravail,
} from '../types/invoice';
import { formatMoney } from '../utils/invoiceFormat';
import { AttachmentService } from './AttachmentService';
import { ClientService } from './ClientService';
import { InvoiceService } from './InvoiceService';
import {
  clientIdentityLines,
  mandatoryInvoiceMentions,
  legalIssuerName,
  tvaBreakdownLines,
} from './InvoiceLegalService';
import { LegalMentionsService } from './LegalMentionsService';
import { PDFTemplateService } from './PDFTemplateService';
import { withLog } from './logger';
import { usablePdfImage } from '../utils/security';

let fontsLoaded = false;

function setPdfMakeVfs(vfs: unknown) {
  try {
    Object.defineProperty(pdfMake, 'vfs', { value: vfs, writable: true, configurable: true });
  } catch {
    (pdfMake as { vfs?: unknown }).vfs = vfs;
  }
}

async function loadFonts() {
  if (fontsLoaded) return;
  try {
    const pdfFonts = await import('pdfmake/build/vfs_fonts');
    const fonts = (pdfFonts as { default?: { pdfMake?: { vfs?: unknown }; vfs?: unknown } }).default;
    if (fonts?.pdfMake?.vfs) setPdfMakeVfs(fonts.pdfMake.vfs);
    else if (fonts?.vfs) setPdfMakeVfs(fonts.vfs);
    fontsLoaded = true;
  } catch {
    fontsLoaded = true;
  }
}

function formatUnite(poste: PosteFacture): string {
  if (poste.type === 'materiel') {
    const m = poste as PosteMateriel;
    const labels: Record<string, string> = {
      unite: 'Unité',
      m2: 'm²',
      m3: 'm³',
      kg: 'kg',
      g: 'g',
      m: 'm',
      l: 'L',
      heure: 'h',
      jour: 'j',
      forfait: 'Forfait',
    };
    return labels[m.unite] || m.unite;
  }
  const t = poste as PosteTravail;
  return t.nombreIntervenants > 1 ? `h (×${t.nombreIntervenants} interv.)` : 'h';
}

function qtyLabel(poste: PosteFacture): string {
  if (poste.type === 'materiel') return String(poste.quantite);
  const totalMinutes = Math.max(0, Math.round(poste.heuresEstimees * 60));
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function unitPrice(poste: PosteFacture): number {
  if (poste.type === 'materiel') {
    let p = poste.prixUnitaireHT;
    if (poste.remise) p *= 1 - poste.remise / 100;
    if (poste.marge) p *= 1 + poste.marge / 100;
    return p;
  }
  return poste.tauxHoraire;
}

function buildPostesRows(postes: PosteFacture[]) {
  return postes.map((poste) => [
    poste.designation,
    qtyLabel(poste),
    formatUnite(poste),
    formatMoney(unitPrice(poste)),
    `${poste.tauxTVA ?? 0} %`,
    formatMoney(InvoiceService.calculateLineHT(poste)),
  ]);
}

function formatAdresse(emetteur: Pick<Emetteur, 'adresse'>): string {
  const a = emetteur.adresse;
  return [a.rue, `${a.codePostal} ${a.ville}`.trim(), a.pays].filter(Boolean).join(', ');
}

function emetteurFromVendeur(
  facture: Facture,
  current: Emetteur | EmetteurExtended
): Emetteur {
  const v = facture.vendeur;
  if (!v) return { ...current };
  return {
    ...current,
    type: v.type ?? current.type,
    denominationSociale: v.denominationSociale ?? current.denominationSociale,
    formeJuridique: v.formeJuridique ?? current.formeJuridique,
    adresse: v.adresse ?? current.adresse,
    siren: v.siren ?? current.siren,
    siret: v.siret ?? current.siret,
    numeroTVA: v.numeroTVA ?? current.numeroTVA,
    capitalSocial: v.capitalSocial ?? current.capitalSocial,
    rcs: v.rcs ?? current.rcs,
    email: v.email ?? current.email,
    telephone: v.telephone ?? current.telephone,
    regimeTVA: v.regimeTVA ?? current.regimeTVA,
    mentionFranchiseTVA: v.mentionFranchiseTVA ?? current.mentionFranchiseTVA,
    mediateurConsommation: v.mediateurConsommation ?? current.mediateurConsommation,
    logo: v.logo ?? current.logo,
    coordonneesBancaires: v.coordonneesBancaires ?? current.coordonneesBancaires,
  };
}

function buildHeader(emetteur: Emetteur, template?: PDFTemplate): Content[] {
  const lines = [
    legalIssuerName(emetteur),
    emetteur.formeJuridique,
    formatAdresse(emetteur),
    emetteur.siret ? `SIRET ${emetteur.siret}` : '',
    emetteur.siren ? `SIREN ${emetteur.siren}` : '',
    emetteur.numeroTVA ? `TVA ${emetteur.numeroTVA}` : '',
  ].filter(Boolean);
  const company = {
    text: lines.join('\n'),
    color: template?.colors.secondary,
    lineHeight: 1.2,
  };
  const logoSrc = usablePdfImage(emetteur.logo);
  if (!logoSrc) {
    return [{ ...company, margin: [0, 0, 0, 18] } as Content];
  }

  const logo = {
    image: logoSrc,
    width: template?.layout.logoSize.width ?? 90,
  };
  const position = template?.layout.logoPosition ?? 'left';
  if (position === 'center') {
    return [
      { ...logo, alignment: 'center', margin: [0, 0, 0, 8] } as Content,
      { ...company, alignment: 'center', margin: [0, 0, 0, 18] } as Content,
    ];
  }
  return [
    {
      columns:
        position === 'right'
          ? [{ ...company, width: '*' }, { ...logo, alignment: 'right' }]
          : [{ ...logo }, { ...company, width: '*', alignment: 'right' }],
      columnGap: 18,
      margin: [0, 0, 0, 18],
    } as Content,
  ];
}

function styledDoc(
  content: Content[],
  template: PDFTemplate | undefined,
  title: string
): TDocumentDefinitions {
  const colors = template?.colors;
  return {
    pageSize: template?.format === 'Letter' ? 'LETTER' : 'A4',
    pageOrientation: template?.orientation ?? 'portrait',
    pageMargins: template
      ? [
          template.layout.margins.left,
          template.layout.margins.top,
          template.layout.margins.right,
          template.layout.margins.bottom,
        ]
      : [40, 40, 40, 40],
    content,
    styles: {
      title: { fontSize: template?.typography.fontSize.title ?? 18, bold: true, color: colors?.primary, margin: [0, 0, 0, 8] },
      subheader: { fontSize: template?.typography.fontSize.header ?? 12, bold: true, color: colors?.primary, margin: [0, 12, 0, 4] },
      tableHeader: { bold: true, fontSize: 9 },
      total: { fontSize: 12, bold: true },
      mentions: { fontSize: template?.typography.fontSize.footer ?? 8, color: colors?.secondary },
    },
    defaultStyle: { fontSize: template?.typography.fontSize.body ?? 10, color: colors?.text },
    info: { title },
  };
}

function tableLayout(template?: PDFTemplate) {
  const border = template?.colors.border ?? '#e5e7eb';
  return {
    hLineWidth: (index: number, node: { table: { body: unknown[] } }) =>
      index === 0 || index === 1 || index === node.table.body.length ? 0.8 : 0.35,
    vLineWidth: () => 0.35,
    hLineColor: () => border,
    vLineColor: () => border,
    fillColor: (rowIndex: number) => (rowIndex > 0 && rowIndex % 2 === 0 ? '#f8fafc' : null),
    paddingLeft: () => 6,
    paddingRight: () => 6,
    paddingTop: () => 5,
    paddingBottom: () => 5,
  };
}

type PdfDoc = ReturnType<typeof pdfMake.createPdf> & {
  getBlob?: (cb?: (blob: Blob) => void, err?: (e: unknown) => void) => unknown;
  getDataUrl?: (cb?: (url: string) => void, err?: (e: unknown) => void) => unknown;
};

/** pdfmake 0.3 : getBlob/getDataUrl retournent une Promise ; anciennes versions utilisaient un callback. */
async function callPdfMethod<T>(pdf: PdfDoc, method: 'getBlob' | 'getDataUrl'): Promise<T> {
  const fn = pdf[method];
  if (typeof fn !== 'function') throw new Error(`pdfmake : ${method} indisponible`);
  const result = Reflect.apply(fn, pdf, []);
  if (result != null && typeof (result as Promise<T>).then === 'function') {
    return result as Promise<T>;
  }
  return new Promise<T>((resolve, reject) => {
    Reflect.apply(fn, pdf, [resolve, reject]);
  });
}

async function getBuffer(doc: TDocumentDefinitions): Promise<Uint8Array> {
  const work = (async () => {
    await loadFonts();
    const pdf = pdfMake.createPdf(doc) as PdfDoc;
    const blob = await callPdfMethod<Blob>(pdf, 'getBlob');
    return new Uint8Array(await blob.arrayBuffer());
  })();
  return Promise.race([
    work,
    new Promise<Uint8Array>((_, reject) =>
      setTimeout(() => reject(new Error('Génération PDF trop longue')), 20000)
    ),
  ]);
}

async function getDataUrl(doc: TDocumentDefinitions): Promise<string> {
  await loadFonts();
  const pdf = pdfMake.createPdf(doc) as PdfDoc;
  return callPdfMethod<string>(pdf, 'getDataUrl');
}

async function mentionsFor(
  emetteur: Emetteur | EmetteurExtended,
  extra?: string[],
  keepUnfilled = false
): Promise<string> {
  const ext = emetteur as EmetteurExtended;
  const ids = extra ?? ext.selectedMentionsLegales ?? [];
  return LegalMentionsService.generateMentionsText(
    ids,
    ext.customMentionsLegales ?? [],
    ext.mentionPlaceholderValues ?? {},
    keepUnfilled
  );
}

export const PDFService = {
  async generateInvoicePreviewDataUrl(
    documentType: 'devis' | 'facture',
    emetteur: Emetteur | EmetteurExtended,
    template: PDFTemplate
  ): Promise<string> {
    const colors = template.colors;
    const date = new Date();
    const dueDate = new Date(date.getTime() + 30 * 86400000);
    const title = documentType === 'devis' ? 'DEVIS N° DEV-2026-001' : 'FACTURE N° FAC-2026-001';
    const sampleRows = [
      ['Conseil et accompagnement', '2', 'jour', '450,00 €', '20 %', '900,00 €'],
      ['Mise en œuvre', '8', 'h', '75,00 €', '20 %', '600,00 €'],
    ];
    const content: Content[] = [
      ...buildHeader(emetteur, template),
      { text: title, style: 'title' },
      { text: `Date : ${date.toLocaleDateString('fr-FR')}`, color: colors.secondary },
      {
        text:
          documentType === 'devis'
            ? `Validité : ${dueDate.toLocaleDateString('fr-FR')}`
            : `Échéance : ${dueDate.toLocaleDateString('fr-FR')}`,
        color: colors.secondary,
      },
      { text: 'Client', style: 'subheader' },
      { text: 'Entreprise Exemple', bold: true },
      { text: '12 rue des Lilas, 75001 Paris', color: colors.secondary, margin: [0, 0, 0, 12] },
      {
        table: {
          headerRows: 1,
          widths: ['*', 'auto', 'auto', 'auto', 'auto', 'auto'],
          body: [
            ['Désignation', 'Qté', 'Unité', 'Prix U. HT', 'TVA', 'Total HT'].map((text) => ({
              text,
              style: 'tableHeader',
              fillColor: colors.primary,
              color: '#ffffff',
            })),
            ...sampleRows,
          ],
        },
        layout: tableLayout(template),
        margin: [0, 0, 0, 16],
      },
      { text: 'Total HT : 1 500,00 €', alignment: 'right' },
      { text: 'Total TVA : 300,00 €', alignment: 'right', color: colors.secondary },
      { text: 'Total TTC : 1 800,00 €', style: 'total', alignment: 'right', color: colors.primary },
      {
        text: 'Conditions de paiement : règlement à 30 jours.',
        style: 'mentions',
        margin: [0, 24, 0, 0],
      },
    ];
    const mentions = await mentionsFor(emetteur, undefined, true);
    if (mentions) {
      content.push({
        text: mentions,
        style: 'mentions',
        margin: [0, 10, 0, 0],
      });
    }
    const iban = (emetteur as EmetteurExtended).coordonneesBancaires;
    if (iban?.iban) {
      content.push({
        text: `Coordonnées bancaires : ${iban.titulaire ? `${iban.titulaire} — ` : ''}IBAN ${iban.iban}${iban.bic ? ` — BIC ${iban.bic}` : ''}`,
        style: 'mentions',
        margin: [0, 8, 0, 0],
      });
    }
    return getDataUrl(styledDoc(content, template, title));
  },

  async generateDevisPDF(devis: Devis, emetteur: Emetteur | EmetteurExtended): Promise<void> {
    await withLog('PDFService.generateDevisPDF', async () => {
      const saved = await this.generateDevisPDFToFile(devis, emetteur);
      await AttachmentService.openRel(saved.path);
    });
  },

  async generateFacturePDF(facture: Facture, emetteur: Emetteur | EmetteurExtended): Promise<void> {
    await withLog('PDFService.generateFacturePDF', async () => {
      const saved = await this.generateFacturePDFToFile(facture, emetteur);
      await AttachmentService.openRel(saved.path);
    });
  },

  async generateDevisPDFToFile(
    devis: Devis,
    emetteur: Emetteur | EmetteurExtended
  ): Promise<{ path: string; name: string }> {
    return withLog('PDFService.generateDevisPDFToFile', async () => {
      const client = await ClientService.getClientById(devis.clientId);
      const ext = emetteur as EmetteurExtended;
      const template = await PDFTemplateService.getTemplateById(ext.pdfTemplateDevis ?? '');
      const colors = template?.colors || { primary: '#1e3a8a', border: '#e5e7eb' };
      const mentions = await mentionsFor(emetteur);
      const content: Content[] = [
        ...buildHeader(emetteur, template ?? undefined),
        { text: `DEVIS N° ${devis.numero}`, style: 'title' },
        { text: `Date : ${devis.dateEmission.toLocaleDateString('fr-FR')}` },
        { text: `Validité : ${devis.dateValidite.toLocaleDateString('fr-FR')}` },
        { text: 'Client', style: 'subheader' },
        ...clientIdentityLines(client).map((line, index) => ({
          text: line,
          bold: index === 0,
        })),
        {
          table: {
            headerRows: 1,
            widths: ['*', 'auto', 'auto', 'auto', 'auto', 'auto'],
            body: [
              [
                { text: 'Désignation', style: 'tableHeader', fillColor: colors.primary, color: '#fff' },
                { text: 'Qté', style: 'tableHeader', fillColor: colors.primary, color: '#fff' },
                { text: 'Unité', style: 'tableHeader', fillColor: colors.primary, color: '#fff' },
                { text: 'Prix U. HT', style: 'tableHeader', fillColor: colors.primary, color: '#fff' },
                { text: 'TVA', style: 'tableHeader', fillColor: colors.primary, color: '#fff' },
                { text: 'Total HT', style: 'tableHeader', fillColor: colors.primary, color: '#fff' },
              ],
              ...buildPostesRows(devis.postes),
            ],
          },
          layout: tableLayout(template ?? undefined),
          margin: [0, 12, 0, 12],
        },
        { text: `Total HT : ${formatMoney(devis.totalHT)}`, alignment: 'right' },
        ...tvaBreakdownLines(devis.totalTVA).map((line) => ({ text: line, alignment: 'right' as const })),
        { text: `Total TTC : ${formatMoney(devis.totalTTC)}`, style: 'total', alignment: 'right' },
        { text: devis.conditionsPaiement || '', style: 'mentions', margin: [0, 16, 0, 0] },
        { text: mentions || devis.mentionsLegales || '', style: 'mentions' },
      ];
      const bytes = await getBuffer(styledDoc(content, template ?? undefined, devis.numero));
      const saved = await AttachmentService.savePdfBytes(`${devis.numero}.pdf`, bytes);
      return { path: saved.rel, name: saved.name };
    });
  },

  async generateFacturePDFToFile(
    facture: Facture,
    emetteur: Emetteur | EmetteurExtended
  ): Promise<{ path: string; name: string }> {
    return withLog('PDFService.generateFacturePDFToFile', async () => {
      const client = await ClientService.getClientById(facture.clientId);
      const frozen = emetteurFromVendeur(facture, emetteur);
      const ext = emetteur as EmetteurExtended;
      const template = await PDFTemplateService.getTemplateById(ext.pdfTemplateFacture ?? '');
      const colors = template?.colors || { primary: '#1e3a8a', secondary: '#64748b', border: '#e5e7eb' };
      const selected = await mentionsFor(emetteur);
      const mentions =
        facture.mentionsLegales ||
        mandatoryInvoiceMentions(frozen, selected, facture);
      const iban = frozen.coordonneesBancaires;
      const titleKind = facture.isAvoir ? 'AVOIR' : 'FACTURE';
      const clientLines = clientIdentityLines(client);
      const tvaLines = tvaBreakdownLines(facture.totalTVA);
      const content: Content[] = [
        ...buildHeader(frozen, template ?? undefined),
        { text: `${titleKind} N° ${facture.numero}`, style: 'title' },
        { text: `Date : ${facture.dateEmission.toLocaleDateString('fr-FR')}` },
        facture.dateLivraison
          ? { text: `Date de la prestation ou livraison : ${facture.dateLivraison.toLocaleDateString('fr-FR')}` }
          : { text: '' },
        facture.dateEcheance
          ? { text: `Échéance : ${facture.dateEcheance.toLocaleDateString('fr-FR')}` }
          : { text: '' },
        facture.isAvoir && facture.factureOrigineNumero
          ? {
              text: `Avoir afférent à la facture ${facture.factureOrigineNumero}`,
              style: 'subheader',
            }
          : { text: '' },
        { text: 'Client', style: 'subheader' },
        ...clientLines.map((line, index) => ({
          text: line,
          bold: index === 0,
          color: index === 0 ? undefined : colors.secondary ?? '#64748b',
        })),
        {
          table: {
            headerRows: 1,
            widths: ['*', 'auto', 'auto', 'auto', 'auto', 'auto'],
            body: [
              [
                { text: 'Désignation', style: 'tableHeader', fillColor: colors.primary, color: '#fff' },
                { text: 'Qté', style: 'tableHeader', fillColor: colors.primary, color: '#fff' },
                { text: 'Unité', style: 'tableHeader', fillColor: colors.primary, color: '#fff' },
                { text: 'Prix U. HT', style: 'tableHeader', fillColor: colors.primary, color: '#fff' },
                { text: 'TVA', style: 'tableHeader', fillColor: colors.primary, color: '#fff' },
                { text: 'Total HT', style: 'tableHeader', fillColor: colors.primary, color: '#fff' },
              ],
              ...buildPostesRows(facture.postes),
            ],
          },
          layout: tableLayout(template ?? undefined),
          margin: [0, 12, 0, 12],
        },
        { text: `Total HT : ${formatMoney(facture.totalHT)}`, alignment: 'right' },
        ...tvaLines.map((line) => ({ text: line, alignment: 'right' as const })),
        { text: `Total TTC : ${formatMoney(facture.totalTTC)}`, style: 'total', alignment: 'right' },
        iban
          ? {
              text: `\nRèglement : ${iban.titulaire} — IBAN ${iban.iban} — BIC ${iban.bic}`,
              style: 'mentions',
            }
          : { text: '' },
        { text: facture.conditionsPaiement || '', style: 'mentions' },
        { text: mentions, style: 'mentions' },
      ];
      const bytes = await getBuffer(styledDoc(content, template ?? undefined, facture.numero));
      const saved = await AttachmentService.savePdfBytes(`${facture.numero}.pdf`, bytes);
      return { path: saved.rel, name: saved.name };
    });
  },
};
