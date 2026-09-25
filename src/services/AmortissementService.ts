import i18n from '../i18n/config';
import {
  AmortissementSeries,
  AmortissementSettings,
  AmortissementSummary,
  DEFAULT_AMORTISSEMENT_SETTINGS,
  DEFAULT_DUREES_PAR_TYPE,
  Immobilisation,
  ImmobilisationAttachment,
  ImmobilisationComputed,
  MethodeAmortissement,
  StatutImmobilisation,
  TypeImmobilisation,
  TYPE_IMMOBILISATION_LIST,
} from '../types/amortissement';
import { ChartGranularity } from '../types/projection';
import { newEntityId } from '../utils/invoiceFormat';
import { assertIsoDate } from '../utils/security';
import {
  enumeratePeriodKeys,
  getPeriodLabel,
  parsePeriodKeyToDate,
} from '../utils/periodKeys';
import { AttachmentService } from './AttachmentService';
import { Db } from './db';
import { withLog } from './logger';

const nowIso = () => new Date().toISOString();

function parseDate(iso: string): Date {
  return new Date(`${assertIsoDate(iso)}T00:00:00`);
}

function toDateOnly(iso: string): string {
  return assertIsoDate(iso);
}

function assertFiniteAmount(value: number, allowZero = true): number {
  if (!Number.isFinite(value) || value < 0 || (!allowZero && value === 0)) {
    throw new Error(i18n.t('errors.amountPositive'));
  }
  return value;
}

/** Coefficients dégressifs CGI art. 39 A. */
export function degressifCoefficient(dureeAnnees: number): number {
  if (dureeAnnees <= 4) return 1.25;
  if (dureeAnnees <= 6) return 1.75;
  return 2.25;
}

function monthsBetween(start: Date, end: Date): number {
  const years = end.getFullYear() - start.getFullYear();
  const months = end.getMonth() - start.getMonth();
  let total = years * 12 + months;
  if (end.getDate() < start.getDate()) total -= 1;
  return Math.max(0, total);
}

function yearsElapsed(start: Date, end: Date, prorataMensuel: boolean): number {
  if (end.getTime() <= start.getTime()) return 0;
  if (prorataMensuel) {
    return monthsBetween(start, end) / 12;
  }
  const ms = end.getTime() - start.getTime();
  return ms / (365.25 * 24 * 60 * 60 * 1000);
}

/**
 * Amortissement cumulé à une date donnée (linéaire ou dégressif CGI 39 A).
 * Dégressif : application annuelle sur VNC, bascule linéaire si plus favorable.
 */
export function calculateAmortissementCumule(
  article: Immobilisation,
  endDate: Date = new Date(),
  settings: Pick<AmortissementSettings, 'prorataMensuel'> = { prorataMensuel: true }
): number {
  if (article.methode === 'non_amortissable' || article.faibleValeur) return 0;
  const duree = article.dureeAnnees;
  if (duree <= 0) return 0;

  const base = Math.max(0, article.valeurAcquisitionHT - (article.valeurResiduelle || 0));
  if (base <= 0) return 0;

  const start = parseDate(article.dateMiseEnService || article.dateAcquisition);
  let end = endDate;
  if (article.statut !== 'actif' && article.dateCession) {
    const cession = parseDate(article.dateCession);
    if (cession.getTime() < end.getTime()) end = cession;
  }
  if (end.getTime() <= start.getTime()) return 0;

  const elapsed = yearsElapsed(start, end, settings.prorataMensuel);
  if (elapsed <= 0) return 0;

  if (article.methode !== 'degressif') {
    const annual = base / duree;
    return Math.min(base, annual * Math.min(elapsed, duree));
  }

  // Dégressif CGI 39 A — simulation année par année sur VNC
  const coeff = degressifCoefficient(duree);
  const linearRate = 1 / duree;
  const degressifRate = linearRate * coeff;
  let remaining = base;
  let yearsDone = 0;
  const fullYears = Math.floor(elapsed);
  const frac = elapsed - fullYears;

  while (yearsDone < fullYears && remaining > 0.0001) {
    const yearsLeft = duree - yearsDone;
    if (yearsLeft <= 0) break;
    const linearRemaining = remaining / yearsLeft;
    const degressifDot = remaining * degressifRate;
    const useLinear = linearRemaining >= degressifDot;
    const applied = Math.min(remaining, useLinear ? linearRemaining : degressifDot);
    remaining -= applied;
    yearsDone += 1;
  }

  if (frac > 0 && remaining > 0.0001) {
    const yearsLeft = Math.max(duree - yearsDone, frac);
    const linearRemaining = remaining / yearsLeft;
    const degressifDot = remaining * degressifRate * frac;
    const linearDot = (base / duree) * frac;
    const useLinear = linearRemaining * frac >= degressifDot;
    const applied = Math.min(remaining, useLinear ? linearDot : degressifDot);
    remaining -= applied;
  }

  return Math.min(base, base - remaining);
}

export function calculateVNC(
  article: Immobilisation,
  endDate: Date = new Date(),
  settings: Pick<AmortissementSettings, 'prorataMensuel'> = { prorataMensuel: true }
): number {
  const amorti = calculateAmortissementCumule(article, endDate, settings);
  return Math.max(0, article.valeurAcquisitionHT - amorti);
}

function annualDotationEstimate(article: Immobilisation): number {
  if (article.methode === 'non_amortissable' || article.faibleValeur) return 0;
  const base = Math.max(0, article.valeurAcquisitionHT - (article.valeurResiduelle || 0));
  if (article.dureeAnnees <= 0 || base <= 0) return 0;
  if (article.methode === 'degressif') {
    return (base / article.dureeAnnees) * degressifCoefficient(article.dureeAnnees);
  }
  return base / article.dureeAnnees;
}

function immobilisationFromRow(row: Record<string, unknown>): Immobilisation {
  return {
    id: String(row.id),
    designation: String(row.designation ?? ''),
    reference: row.reference ? String(row.reference) : undefined,
    typeImmobilisation: String(row.type_immobilisation) as TypeImmobilisation,
    valeurAcquisitionHT: Number(row.valeur_acquisition_ht) || 0,
    tauxTVA: Number(row.taux_tva) || 0,
    dateAcquisition: toDateOnly(String(row.date_acquisition)),
    dateMiseEnService: toDateOnly(String(row.date_mise_en_service)),
    dureeAnnees: Number(row.duree_annees) || 0,
    methode: String(row.methode) as MethodeAmortissement,
    valeurResiduelle: Number(row.valeur_residuelle) || 0,
    statut: String(row.statut) as StatutImmobilisation,
    dateCession: row.date_cession ? toDateOnly(String(row.date_cession)) : undefined,
    valeurCession: row.valeur_cession != null ? Number(row.valeur_cession) : undefined,
    fournisseur: row.fournisseur ? String(row.fournisseur) : undefined,
    factureRef: row.facture_ref ? String(row.facture_ref) : undefined,
    notes: row.notes ? String(row.notes) : undefined,
    faibleValeur: Number(row.faible_valeur) === 1,
    subventionInvestissement: Number(row.subvention_investissement) || 0,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function parseSettingsPayload(raw: string | null | undefined): AmortissementSettings {
  if (!raw) return { ...DEFAULT_AMORTISSEMENT_SETTINGS, dureesParType: { ...DEFAULT_DUREES_PAR_TYPE } };
  try {
    const parsed = JSON.parse(raw) as Partial<AmortissementSettings>;
    const durees = { ...DEFAULT_DUREES_PAR_TYPE };
    if (parsed.dureesParType && typeof parsed.dureesParType === 'object') {
      for (const key of TYPE_IMMOBILISATION_LIST) {
        const v = parsed.dureesParType[key];
        if (typeof v === 'number' && v > 0) durees[key] = v;
      }
    }
    return {
      dureesParType: durees,
      seuilFaibleValeur:
        typeof parsed.seuilFaibleValeur === 'number' && parsed.seuilFaibleValeur >= 0
          ? parsed.seuilFaibleValeur
          : DEFAULT_AMORTISSEMENT_SETTINGS.seuilFaibleValeur,
      prorataMensuel: parsed.prorataMensuel !== false,
      methodeDefaut:
        parsed.methodeDefaut === 'degressif' || parsed.methodeDefaut === 'non_amortissable'
          ? parsed.methodeDefaut
          : 'lineaire',
    };
  } catch {
    return { ...DEFAULT_AMORTISSEMENT_SETTINGS, dureesParType: { ...DEFAULT_DUREES_PAR_TYPE } };
  }
}

function endOfPeriod(key: string, granularity: ChartGranularity): Date {
  const start = parsePeriodKeyToDate(key, granularity);
  switch (granularity) {
    case 'day':
      return new Date(start.getFullYear(), start.getMonth(), start.getDate(), 23, 59, 59, 999);
    case 'week': {
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      end.setHours(23, 59, 59, 999);
      return end;
    }
    case 'month':
      return new Date(start.getFullYear(), start.getMonth() + 1, 0, 23, 59, 59, 999);
    case 'quarter':
      return new Date(start.getFullYear(), start.getMonth() + 3, 0, 23, 59, 59, 999);
    case 'semester':
      return new Date(start.getFullYear(), start.getMonth() + 6, 0, 23, 59, 59, 999);
    case 'year':
      return new Date(start.getFullYear(), 11, 31, 23, 59, 59, 999);
    default:
      return start;
  }
}

export const AmortissementService = {
  degressifCoefficient,

  async getSettings(): Promise<AmortissementSettings> {
    return withLog('AmortissementService.getSettings', async () => {
      const rows = await Db.select<{ payload: string }>(
        'SELECT payload FROM amortissement_settings WHERE id = 1'
      );
      return parseSettingsPayload(rows[0]?.payload);
    });
  },

  async saveSettings(settings: AmortissementSettings): Promise<AmortissementSettings> {
    return withLog('AmortissementService.saveSettings', async () => {
      assertFiniteAmount(settings.seuilFaibleValeur);
      for (const type of TYPE_IMMOBILISATION_LIST) {
        assertFiniteAmount(settings.dureesParType[type], false);
      }
      const payload = JSON.stringify(settings);
      await Db.execute(
        `INSERT INTO amortissement_settings (id, payload) VALUES (1, ?)
         ON CONFLICT(id) DO UPDATE SET payload = excluded.payload`,
        [payload]
      );
      return settings;
    });
  },

  async list(statut?: StatutImmobilisation): Promise<Immobilisation[]> {
    return withLog('AmortissementService.list', async () => {
      const rows = statut
        ? await Db.select<Record<string, unknown>>(
            `SELECT * FROM immobilisations WHERE statut = ?
             ORDER BY date_mise_en_service DESC, designation ASC`,
            [statut]
          )
        : await Db.select<Record<string, unknown>>(
            `SELECT * FROM immobilisations
             ORDER BY date_mise_en_service DESC, designation ASC`
          );
      return rows.map(immobilisationFromRow);
    });
  },

  async getById(id: string): Promise<Immobilisation | null> {
    const rows = await Db.select<Record<string, unknown>>(
      'SELECT * FROM immobilisations WHERE id = ?',
      [id]
    );
    return rows[0] ? immobilisationFromRow(rows[0]) : null;
  },

  async count(): Promise<number> {
    const rows = await Db.select<{ c: number }>('SELECT COUNT(*) as c FROM immobilisations');
    return Number(rows[0]?.c) || 0;
  },

  async save(
    input: Partial<Immobilisation> &
      Pick<Immobilisation, 'designation' | 'typeImmobilisation' | 'valeurAcquisitionHT' | 'dateAcquisition'>
  ): Promise<Immobilisation> {
    return withLog('AmortissementService.save', async () => {
      if (!input.designation.trim()) throw new Error(i18n.t('amortissement.errors.designationRequired'));
      assertFiniteAmount(input.valeurAcquisitionHT);
      if (input.tauxTVA !== undefined) {
        assertFiniteAmount(input.tauxTVA);
        if (input.tauxTVA > 100) throw new Error(i18n.t('errors.amountPositive'));
      }
      if (input.dureeAnnees !== undefined) assertFiniteAmount(input.dureeAnnees, false);
      if (input.valeurResiduelle !== undefined) assertFiniteAmount(input.valeurResiduelle);
      if (input.valeurCession !== undefined) assertFiniteAmount(input.valeurCession);
      if (input.subventionInvestissement !== undefined) {
        assertFiniteAmount(input.subventionInvestissement);
      }

      const settings = await this.getSettings();
      const existing = input.id ? await this.getById(input.id) : null;
      const now = nowIso();
      const dateAcq = toDateOnly(input.dateAcquisition);
      const dateMes = toDateOnly(input.dateMiseEnService || input.dateAcquisition || dateAcq);
      const dateCession = input.dateCession
        ? toDateOnly(input.dateCession)
        : existing?.dateCession;
      if (dateMes < dateAcq || (dateCession && dateCession < dateAcq)) {
        throw new Error(i18n.t('errors.invalidDateRange'));
      }
      const duree =
        input.dureeAnnees && input.dureeAnnees > 0
          ? input.dureeAnnees
          : settings.dureesParType[input.typeImmobilisation] ?? 5;
      const seuil = settings.seuilFaibleValeur;
      const faibleValeur =
        input.faibleValeur !== undefined
          ? Boolean(input.faibleValeur)
          : input.valeurAcquisitionHT > 0 && input.valeurAcquisitionHT <= seuil;

      const article: Immobilisation = {
        id: existing?.id || input.id || newEntityId('immo'),
        designation: input.designation.trim(),
        reference: input.reference?.trim() || undefined,
        typeImmobilisation: input.typeImmobilisation,
        valeurAcquisitionHT: input.valeurAcquisitionHT,
        tauxTVA: input.tauxTVA ?? existing?.tauxTVA ?? 20,
        dateAcquisition: dateAcq,
        dateMiseEnService: dateMes,
        dureeAnnees: duree,
        methode: faibleValeur
          ? 'non_amortissable'
          : (input.methode ?? existing?.methode ?? settings.methodeDefaut),
        valeurResiduelle: Math.max(0, input.valeurResiduelle ?? existing?.valeurResiduelle ?? 0),
        statut: input.statut ?? existing?.statut ?? 'actif',
        dateCession,
        valeurCession: input.valeurCession ?? existing?.valeurCession,
        fournisseur: input.fournisseur?.trim() || undefined,
        factureRef: input.factureRef?.trim() || undefined,
        notes: input.notes?.trim() || undefined,
        faibleValeur,
        subventionInvestissement: Math.max(
          0,
          input.subventionInvestissement ?? existing?.subventionInvestissement ?? 0
        ),
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      if (article.valeurResiduelle > article.valeurAcquisitionHT) {
        throw new Error(i18n.t('errors.amountPositive'));
      }

      await Db.execute(
        `INSERT INTO immobilisations (
          id, designation, reference, type_immobilisation, valeur_acquisition_ht, taux_tva,
          date_acquisition, date_mise_en_service, duree_annees, methode, valeur_residuelle,
          statut, date_cession, valeur_cession, fournisseur, facture_ref, notes,
          faible_valeur, subvention_investissement, created_at, updated_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET
          designation = excluded.designation,
          reference = excluded.reference,
          type_immobilisation = excluded.type_immobilisation,
          valeur_acquisition_ht = excluded.valeur_acquisition_ht,
          taux_tva = excluded.taux_tva,
          date_acquisition = excluded.date_acquisition,
          date_mise_en_service = excluded.date_mise_en_service,
          duree_annees = excluded.duree_annees,
          methode = excluded.methode,
          valeur_residuelle = excluded.valeur_residuelle,
          statut = excluded.statut,
          date_cession = excluded.date_cession,
          valeur_cession = excluded.valeur_cession,
          fournisseur = excluded.fournisseur,
          facture_ref = excluded.facture_ref,
          notes = excluded.notes,
          faible_valeur = excluded.faible_valeur,
          subvention_investissement = excluded.subvention_investissement,
          updated_at = excluded.updated_at`,
        [
          article.id,
          article.designation,
          article.reference ?? null,
          article.typeImmobilisation,
          article.valeurAcquisitionHT,
          article.tauxTVA,
          article.dateAcquisition,
          article.dateMiseEnService,
          article.dureeAnnees,
          article.methode,
          article.valeurResiduelle,
          article.statut,
          article.dateCession ?? null,
          article.valeurCession ?? null,
          article.fournisseur ?? null,
          article.factureRef ?? null,
          article.notes ?? null,
          article.faibleValeur ? 1 : 0,
          article.subventionInvestissement,
          article.createdAt,
          article.updatedAt,
        ]
      );
      return article;
    });
  },

  async remove(id: string): Promise<void> {
    return withLog('AmortissementService.remove', async () => {
      const attachments = await this.listAttachments(id);
      for (const item of attachments) {
        await AttachmentService.deleteRel(item.path).catch(() => undefined);
      }
      await Db.execute('DELETE FROM immobilisation_attachments WHERE immobilisation_id = ?', [id]);
      await Db.execute('DELETE FROM immobilisations WHERE id = ?', [id]);
    });
  },

  async listAttachments(immobilisationId: string): Promise<ImmobilisationAttachment[]> {
    return withLog('AmortissementService.listAttachments', async () => {
      const rows = await Db.select<Record<string, unknown>>(
        `SELECT * FROM immobilisation_attachments
         WHERE immobilisation_id = ?
         ORDER BY created_at DESC`,
        [immobilisationId]
      );
      return rows.map((row) => ({
        id: String(row.id),
        immobilisationId: String(row.immobilisation_id),
        name: String(row.name),
        path: String(row.path),
        mimeType: String(row.mime_type),
        createdAt: String(row.created_at),
      }));
    });
  },

  async countAttachmentsByImmobilisation(): Promise<Record<string, number>> {
    return withLog('AmortissementService.countAttachmentsByImmobilisation', async () => {
      const rows = await Db.select<{ immobilisation_id: string; c: number }>(
        `SELECT immobilisation_id, COUNT(*) as c
         FROM immobilisation_attachments
         GROUP BY immobilisation_id`
      );
      const map: Record<string, number> = {};
      for (const row of rows) map[row.immobilisation_id] = Number(row.c) || 0;
      return map;
    });
  },

  async addAttachment(immobilisationId: string, file: File): Promise<ImmobilisationAttachment> {
    return withLog('AmortissementService.addAttachment', async () => {
      const existing = await this.getById(immobilisationId);
      if (!existing) throw new Error(i18n.t('amortissement.errors.notFound'));
      const saved = await AttachmentService.saveUserFile(file);
      const attachment: ImmobilisationAttachment = {
        id: newEntityId('immo-att'),
        immobilisationId,
        name: saved.name,
        path: saved.rel,
        mimeType: saved.mimeType,
        createdAt: nowIso(),
      };
      try {
        await Db.execute(
          `INSERT INTO immobilisation_attachments
           (id, immobilisation_id, name, path, mime_type, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            attachment.id,
            attachment.immobilisationId,
            attachment.name,
            attachment.path,
            attachment.mimeType,
            attachment.createdAt,
          ]
        );
      } catch (err) {
        await AttachmentService.deleteRel(saved.rel).catch(() => undefined);
        throw err;
      }
      return attachment;
    });
  },

  async removeAttachment(attachmentId: string): Promise<void> {
    return withLog('AmortissementService.removeAttachment', async () => {
      const rows = await Db.select<Record<string, unknown>>(
        'SELECT * FROM immobilisation_attachments WHERE id = ?',
        [attachmentId]
      );
      const row = rows[0];
      if (!row) return;
      await AttachmentService.deleteRel(String(row.path)).catch(() => undefined);
      await Db.execute('DELETE FROM immobilisation_attachments WHERE id = ?', [attachmentId]);
    });
  },

  async openAttachment(path: string): Promise<void> {
    await AttachmentService.openRel(path);
  },

  computeOne(
    article: Immobilisation,
    settings: AmortissementSettings,
    endDate: Date = new Date()
  ): ImmobilisationComputed {
    const base = Math.max(0, article.valeurAcquisitionHT - (article.valeurResiduelle || 0));
    const start = parseDate(article.dateMiseEnService || article.dateAcquisition);
    const anneesEcoulees = yearsElapsed(start, endDate, settings.prorataMensuel);
    const amortissementCumule = calculateAmortissementCumule(article, endDate, settings);
    const vnc = Math.max(0, article.valeurAcquisitionHT - amortissementCumule);
    const yearStart = new Date(endDate.getFullYear(), 0, 1);
    const prevCumule = calculateAmortissementCumule(
      article,
      new Date(yearStart.getTime() - 1),
      settings
    );
    const dotationExercice = Math.max(0, amortissementCumule - prevCumule);
    return {
      article,
      baseAmortissable: base,
      anneesEcoulees,
      amortissementAnnuel: annualDotationEstimate(article),
      amortissementCumule,
      vnc,
      dotationExercice,
    };
  },

  async computeAll(endDate: Date = new Date()): Promise<ImmobilisationComputed[]> {
    return withLog('AmortissementService.computeAll', async () => {
      const [articles, settings] = await Promise.all([this.list(), this.getSettings()]);
      return articles.map((a) => this.computeOne(a, settings, endDate));
    });
  },

  async summary(endDate: Date = new Date()): Promise<AmortissementSummary> {
    return withLog('AmortissementService.summary', async () => {
      const rows = await this.computeAll(endDate);
      const actifs = rows.filter((r) => r.article.statut === 'actif');
      return {
        count: actifs.length,
        brut: actifs.reduce((s, r) => s + r.article.valeurAcquisitionHT, 0),
        amortiCumule: actifs.reduce((s, r) => s + r.amortissementCumule, 0),
        vnc: actifs.reduce((s, r) => s + r.vnc, 0),
        dotationExercice: actifs.reduce((s, r) => s + r.dotationExercice, 0),
        faibleValeurCount: actifs.filter((r) => r.article.faibleValeur).length,
      };
    });
  },

  async buildAmortissementSeries(
    granularity: ChartGranularity,
    dateFrom: string,
    dateTo: string
  ): Promise<AmortissementSeries> {
    return withLog('AmortissementService.buildAmortissementSeries', async () => {
      const [articles, settings] = await Promise.all([this.list(), this.getSettings()]);
      const periodKeys = enumeratePeriodKeys(dateFrom.slice(0, 10), dateTo.slice(0, 10), granularity);

      const brut: number[] = [];
      const amortiCumule: number[] = [];
      const vnc: number[] = [];
      const dotation: number[] = [];
      let prevAmorti = 0;

      for (let idx = 0; idx < periodKeys.length; idx++) {
        const key = periodKeys[idx]!;
        const end = endOfPeriod(key, granularity);
        let brutSum = 0;
        let amortiSum = 0;
        let vncSum = 0;

        for (const article of articles) {
          const mes = parseDate(article.dateMiseEnService || article.dateAcquisition);
          if (mes.getTime() > end.getTime()) continue;
          if (
            article.statut !== 'actif' &&
            article.dateCession &&
            parseDate(article.dateCession).getTime() < end.getTime()
          ) {
            continue;
          }
          brutSum += article.valeurAcquisitionHT;
          const a = calculateAmortissementCumule(article, end, settings);
          amortiSum += a;
          vncSum += Math.max(0, article.valeurAcquisitionHT - a);
        }

        brut.push(Math.round(brutSum * 100) / 100);
        amortiCumule.push(Math.round(amortiSum * 100) / 100);
        vnc.push(Math.round(vncSum * 100) / 100);
        const periodDot = Math.max(0, amortiSum - prevAmorti);
        dotation.push(Math.round(periodDot * 100) / 100);
        prevAmorti = amortiSum;
      }

      return {
        labels: periodKeys.map((k) => getPeriodLabel(k, granularity)),
        periodKeys,
        brut,
        amortiCumule,
        vnc,
        dotation,
      };
    });
  },
};
