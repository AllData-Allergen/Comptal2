import {
  Devis,
  DevisCaducite,
  Facture,
  Paiement,
  PosteFacture,
  PosteMateriel,
  PosteTravail,
} from '../types/invoice';
import { isDevisCaduc, newEntityId, parseDateOrNow } from '../utils/invoiceFormat';
import i18n from '../i18n/config';
import { AttachmentService } from './AttachmentService';
import { Db } from './db';
import { EmetteurService } from './EmetteurService';
import { withLog } from './logger';
import { roundMoney } from '../utils/amounts';
import {
  isInvoiceIssued,
  invoiceCoreChanged,
  invertPosteForAvoir,
} from './InvoiceLegalService';

function serializeDevis(devis: Devis) {
  return {
    ...devis,
    dateEmission: devis.dateEmission.toISOString(),
    dateEcheance: devis.dateEcheance ? devis.dateEcheance.toISOString() : undefined,
    dateValidite: devis.dateValidite.toISOString(),
    createdAt: devis.createdAt.toISOString(),
    updatedAt: devis.updatedAt.toISOString(),
    caducite: devis.caducite
      ? {
          signedBy: devis.caducite.signedBy,
          signedAt: devis.caducite.signedAt.toISOString(),
          reason: devis.caducite.reason,
        }
      : undefined,
  };
}

function deserializeDevis(raw: Record<string, unknown>): Devis {
  const caducRaw = raw.caducite as (Partial<DevisCaducite> & { signedAt?: unknown }) | undefined;
  return {
    ...(raw as unknown as Devis),
    dateEmission: parseDateOrNow(raw.dateEmission),
    dateEcheance: raw.dateEcheance ? parseDateOrNow(raw.dateEcheance) : undefined,
    dateValidite: parseDateOrNow(raw.dateValidite),
    createdAt: parseDateOrNow(raw.createdAt),
    updatedAt: parseDateOrNow(raw.updatedAt),
    postes: (raw.postes as PosteFacture[]) ?? [],
    caduc: Boolean(raw.caduc) || raw.statut === 'caduc',
    caducite: caducRaw?.signedBy
      ? {
          signedBy: String(caducRaw.signedBy),
          signedAt: parseDateOrNow(caducRaw.signedAt),
          reason: caducRaw.reason ? String(caducRaw.reason) : undefined,
        }
      : undefined,
  };
}

function serializeFacture(facture: Facture) {
  return {
    ...facture,
    dateEmission: facture.dateEmission.toISOString(),
    dateEcheance: facture.dateEcheance ? facture.dateEcheance.toISOString() : undefined,
    dateLivraison: facture.dateLivraison ? facture.dateLivraison.toISOString() : undefined,
    paiements: facture.paiements.map((p) => ({
      ...p,
      datePaiement: p.datePaiement.toISOString(),
    })),
    createdAt: facture.createdAt.toISOString(),
    updatedAt: facture.updatedAt.toISOString(),
  };
}

function deserializeFacture(raw: Record<string, unknown>): Facture {
  const paiements = ((raw.paiements as Array<Paiement & { datePaiement: string }>) ?? []).map((p) => ({
    ...p,
    datePaiement: parseDateOrNow(p.datePaiement),
  }));
  return {
    ...(raw as unknown as Facture),
    dateEmission: parseDateOrNow(raw.dateEmission),
    dateEcheance: raw.dateEcheance ? parseDateOrNow(raw.dateEcheance) : undefined,
    dateLivraison: raw.dateLivraison ? parseDateOrNow(raw.dateLivraison) : undefined,
    paiements,
    createdAt: parseDateOrNow(raw.createdAt),
    updatedAt: parseDateOrNow(raw.updatedAt),
    postes: (raw.postes as PosteFacture[]) ?? [],
  };
}

function formatNumero(format: string, prefix: string, year: number, seq: number): string {
  return format
    .replace('{PREFIX}', prefix)
    .replace('{YEAR}', String(year))
    .replace(/\{SEQ:(\d+)\}/, (_, size) => String(seq).padStart(Number(size), '0'));
}

async function existingNumeros(table: 'devis' | 'factures'): Promise<Set<string>> {
  const rows = await Db.select<{ numero: string }>(`SELECT numero FROM ${table}`);
  return new Set(rows.map((r) => r.numero));
}

export const InvoiceService = {
  calculateLineHT(poste: PosteFacture): number {
    if (poste.type === 'materiel') {
      const p = poste as PosteMateriel;
      let total = p.prixUnitaireHT * p.quantite;
      if (p.remise) total *= 1 - p.remise / 100;
      if (p.marge) total *= 1 + p.marge / 100;
      if (p.fraisTransport) total += p.fraisTransport;
      return total;
    }
    const t = poste as PosteTravail;
    let total = t.tauxHoraire * t.heuresEstimees * t.nombreIntervenants;
    if (t.marge) total *= 1 + t.marge / 100;
    if (t.fraisDeplacement) total += t.fraisDeplacement;
    return total;
  },

  calculateTotals(postes: PosteFacture[]): {
    totalHT: number;
    totalTVA: Record<number, number>;
    totalTTC: number;
  } {
    const totals = { totalHT: 0, totalTVA: {} as Record<number, number>, totalTTC: 0 };
    postes.forEach((poste) => {
      const lineHT = this.calculateLineHT(poste);
      const tvaRate = poste.tauxTVA || 0;
      const lineTVA = (lineHT * tvaRate) / 100;
      totals.totalHT += lineHT;
      totals.totalTVA[tvaRate] = (totals.totalTVA[tvaRate] || 0) + lineTVA;
      totals.totalTTC += lineHT + lineTVA;
    });
    return totals;
  },

  async loadDevis(): Promise<Devis[]> {
    return withLog('InvoiceService.loadDevis', async () => {
      const rows = await Db.select<{ payload: string }>('SELECT payload FROM devis ORDER BY updated_at DESC');
      return rows.map((r) => deserializeDevis(JSON.parse(r.payload)));
    });
  },

  async loadFactures(): Promise<Facture[]> {
    return withLog('InvoiceService.loadFactures', async () => {
      const rows = await Db.select<{ payload: string }>('SELECT payload FROM factures ORDER BY updated_at DESC');
      return rows.map((r) => deserializeFacture(JSON.parse(r.payload)));
    });
  },

  async upsertDevis(devis: Devis): Promise<void> {
    return withLog('InvoiceService.upsertDevis', async () => {
      const clash = await Db.select<{ id: string }>(
        'SELECT id FROM devis WHERE numero = ? AND id != ?',
        [devis.numero, devis.id]
      );
      if (clash.length > 0) {
        throw new Error(i18n.t('errors.quoteNumberTaken', { numero: devis.numero }));
      }
      const totals = this.calculateTotals(devis.postes ?? []);
      const now = new Date();
      const normalized: Devis = {
        ...devis,
        totalHT: roundMoney(totals.totalHT),
        totalTVA: Object.fromEntries(
          Object.entries(totals.totalTVA).map(([rate, amount]) => [Number(rate), roundMoney(amount)])
        ),
        totalTTC: roundMoney(totals.totalTTC),
        updatedAt: now,
      };
      await Db.execute(
        `INSERT INTO devis (id, client_id, numero, statut, supprime, payload, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           client_id = excluded.client_id,
           numero = excluded.numero,
           statut = excluded.statut,
           supprime = excluded.supprime,
           payload = excluded.payload,
           updated_at = excluded.updated_at`,
        [
          normalized.id,
          normalized.clientId,
          normalized.numero,
          normalized.statut,
          normalized.supprime ? 1 : 0,
          JSON.stringify(serializeDevis(normalized)),
          now.toISOString(),
        ]
      );
    });
  },

  async upsertFacture(facture: Facture): Promise<void> {
    return withLog('InvoiceService.upsertFacture', async () => {
      if (facture.devisOrigine) {
        const devisList = await this.loadDevis();
        const origin = devisList.find((d) => d.id === facture.devisOrigine);
        if (origin && isDevisCaduc(origin)) {
          throw new Error(i18n.t('errors.cannotInvoiceLapsed'));
        }
      }
      const existingRows = await Db.select<{ payload: string }>(
        'SELECT payload FROM factures WHERE id = ?',
        [facture.id]
      );
      if (existingRows[0]) {
        const previous = deserializeFacture(JSON.parse(existingRows[0].payload));
        if (isInvoiceIssued(previous) && invoiceCoreChanged(previous, facture)) {
          facture = {
            ...previous,
            paiements: facture.paiements,
            attachment: facture.attachment ?? previous.attachment,
            statut: facture.statut,
            supprime: facture.supprime,
            updatedAt: new Date(),
          };
        }
      }
      const clash = await Db.select<{ id: string }>(
        'SELECT id FROM factures WHERE numero = ? AND id != ?',
        [facture.numero, facture.id]
      );
      if (clash.length > 0) {
        throw new Error(i18n.t('errors.invoiceNumberTaken', { numero: facture.numero }));
      }
      const now = new Date();
      const totals = this.calculateTotals(facture.postes ?? []);
      const normalized: Facture = {
        ...facture,
        totalHT: roundMoney(totals.totalHT),
        totalTVA: Object.fromEntries(
          Object.entries(totals.totalTVA).map(([rate, amount]) => [Number(rate), roundMoney(amount)])
        ),
        totalTTC: roundMoney(totals.totalTTC),
        updatedAt: now,
      };
      await Db.execute(
        `INSERT INTO factures (id, client_id, numero, statut, devis_origine, supprime, payload, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           client_id = excluded.client_id,
           numero = excluded.numero,
           statut = excluded.statut,
           devis_origine = excluded.devis_origine,
           supprime = excluded.supprime,
           payload = excluded.payload,
           updated_at = excluded.updated_at`,
        [
          normalized.id,
          normalized.clientId,
          normalized.numero,
          normalized.statut,
          normalized.devisOrigine ?? null,
          normalized.supprime ? 1 : 0,
          JSON.stringify(serializeFacture(normalized)),
          now.toISOString(),
        ]
      );
    });
  },

  async softDeleteDevis(devisId: string): Promise<void> {
    const devisList = await this.loadDevis();
    const found = devisList.find((d) => d.id === devisId);
    if (!found) return;
    await this.upsertDevis({ ...found, supprime: true, updatedAt: new Date() });
  },

  async softDeleteFacture(factureId: string): Promise<void> {
    const factures = await this.loadFactures();
    const found = factures.find((f) => f.id === factureId);
    if (!found) return;
    await this.upsertFacture({ ...found, supprime: true, updatedAt: new Date() });
  },

  async createAvoir(factureId: string): Promise<Facture> {
    return withLog('InvoiceService.createAvoir', async () => {
      const factures = await this.loadFactures();
      const origin = factures.find((f) => f.id === factureId);
      if (!origin) throw new Error(i18n.t('errors.invoiceNotFound'));
      if (origin.isAvoir) throw new Error(i18n.t('errors.cannotCreditCreditNote'));
      const now = new Date();
      const postes = origin.postes.map((poste) => ({
        ...invertPosteForAvoir(poste),
        id: newEntityId('poste'),
      }));
      const totals = this.calculateTotals(postes);
      const avoir: Facture = {
        ...origin,
        id: newEntityId('fac'),
        documentType: 'facture',
        numero: await this.generateNumero('facture'),
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
        dateEmission: now,
        createdAt: now,
        updatedAt: now,
        vendeur: origin.vendeur,
        mentionsLegales: origin.mentionsLegales,
      };
      await this.upsertFacture(avoir);
      return avoir;
    }, { data: { factureId } });
  },

  async markDevisCaduc(
    devisId: string,
    caducite: { signedBy: string; reason?: string }
  ): Promise<Devis> {
    return withLog('InvoiceService.markDevisCaduc', async () => {
      const devisList = await this.loadDevis();
      const found = devisList.find((d) => d.id === devisId);
      if (!found) throw new Error(i18n.t('errors.quoteNotFound'));
      if (isDevisCaduc(found)) return found;
      const signedBy = caducite.signedBy.trim();
      if (signedBy.length < 2) throw new Error(i18n.t('errors.signatureRequired'));
      const updated: Devis = {
        ...found,
        caduc: true,
        statut: 'caduc',
        caducite: {
          signedBy,
          signedAt: new Date(),
          reason: caducite.reason?.trim() || undefined,
        },
        updatedAt: new Date(),
      };
      await this.upsertDevis(updated);
      return updated;
    }, { data: { devisId } });
  },

  async addClientAttachment(devis: Devis, file: File): Promise<Devis> {
    return withLog('InvoiceService.addClientAttachment', async () => {
      const saved = await AttachmentService.saveUserFile(file);
      const updated: Devis = {
        ...devis,
        clientAttachments: [
          ...(devis.clientAttachments ?? []),
          { mode: 'copy', path: saved.rel, name: saved.name, mimeType: saved.mimeType },
        ],
        updatedAt: new Date(),
      };
      try {
        await this.upsertDevis(updated);
      } catch (err) {
        await AttachmentService.deleteRel(saved.rel).catch(() => undefined);
        throw err;
      }
      return updated;
    }, { data: { devisId: devis.id } });
  },

  async removeClientAttachment(devis: Devis, path: string): Promise<Devis> {
    return withLog('InvoiceService.removeClientAttachment', async () => {
      await AttachmentService.deleteRel(path).catch(() => undefined);
      const updated: Devis = {
        ...devis,
        clientAttachments: (devis.clientAttachments ?? []).filter((item) => item.path !== path),
        updatedAt: new Date(),
      };
      await this.upsertDevis(updated);
      return updated;
    }, { data: { devisId: devis.id } });
  },

  async peekNextNumero(
    type: 'devis' | 'facture',
    options: { codeClient?: string; devisNumero?: string } = {}
  ): Promise<string> {
    return withLog('InvoiceService.peekNextNumero', () => this.buildNextNumero(type, options, false), {
      data: { type },
    });
  },

  async generateNumero(
    type: 'devis' | 'facture',
    options: { codeClient?: string; devisNumero?: string } = {}
  ): Promise<string> {
    return withLog('InvoiceService.generateNumero', async () => this.buildNextNumero(type, options, true), {
      data: { type },
    });
  },

  async buildNextNumero(
    type: 'devis' | 'facture',
    options: { codeClient?: string; devisNumero?: string },
    persist: boolean
  ): Promise<string> {
    const settings = await EmetteurService.loadInvoiceSettings();
    const year = new Date().getFullYear();
    if (type === 'devis') {
      const prefix = options.codeClient || settings.prefixeDevis || 'DEVIS';
      const taken = await existingNumeros('devis');
      let seq = settings.prochainNumeroDevis;
      let formatted = formatNumero(settings.formatNumero, prefix, year, seq);
      while (taken.has(formatted)) {
        seq += 1;
        formatted = formatNumero(settings.formatNumero, prefix, year, seq);
      }
      if (persist) {
        settings.prochainNumeroDevis = seq + 1;
        await EmetteurService.saveInvoiceSettings(settings);
      }
      return formatted;
    }
    const prefix = settings.prefixeFacture || 'FAC';
    const taken = await existingNumeros('factures');
    let seq = settings.prochainNumeroFacture;
    let formatted = formatNumero(settings.formatNumero, prefix, year, seq);
    while (taken.has(formatted)) {
      seq += 1;
      formatted = formatNumero(settings.formatNumero, prefix, year, seq);
    }
    if (persist) {
      settings.prochainNumeroFacture = seq + 1;
      await EmetteurService.saveInvoiceSettings(settings);
    }
    return formatted;
  },

  async importDevisList(rawList: unknown[]): Promise<number> {
    let n = 0;
    for (const raw of rawList) {
      await this.upsertDevis(deserializeDevis(raw as Record<string, unknown>));
      n += 1;
    }
    return n;
  },

  async importFacturesList(rawList: unknown[]): Promise<number> {
    let n = 0;
    for (const raw of rawList) {
      await this.upsertFacture(deserializeFacture(raw as Record<string, unknown>));
      n += 1;
    }
    return n;
  },
};
