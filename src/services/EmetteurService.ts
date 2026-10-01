import {
  Emetteur,
  EmetteurExtended,
  EMPTY_ADRESSE,
  InvoiceSettings,
  InvoiceSettingsWithoutEmetteur,
} from '../types/invoice';
import { newEntityId, parseDateOrNow, reviveAdresse } from '../utils/invoiceFormat';
import { usablePdfImage } from '../utils/security';
import i18n from '../i18n/config';
import { loadSingletonJson, saveSingletonJson } from './jsonStore';
import { withLog } from './logger';

const generateEmetteurId = () => newEntityId('emit');

export function defaultEmetteur(): EmetteurExtended {
  const now = new Date();
  return {
    id: generateEmetteurId(),
    type: 'entreprise',
    denominationSociale: '',
    siret: '',
    adresse: { ...EMPTY_ADRESSE },
    regimeTVA: 'franchise',
    linkedAccounts: [],
    selectedMentionsLegales: [],
    customMentionsLegales: [],
    mentionPlaceholderValues: {},
    createdAt: now,
    updatedAt: now,
  };
}

export function defaultInvoiceSettings(emetteur: Emetteur): InvoiceSettings {
  return {
    emetteur,
    prefixeDevis: 'DEVIS',
    prefixeFacture: 'FAC',
    formatNumero: '{PREFIX}-{YEAR}-{SEQ:4}',
    prochainNumeroDevis: 1,
    prochainNumeroFacture: 1,
    tauxTVADefaut: 20,
    delaiPaiementDefaut: 30,
    conditionsPaiementDefaut: 'Paiement à 30 jours',
    mentionsPenalitesRetard: 'Pénalités de retard exigibles en cas de non-paiement',
    mentionIndemniteRecouvrement: 'Indemnité forfaitaire de recouvrement: 40€ (B2B)',
  };
}

function reviveEmetteur(raw: Partial<Emetteur> | null | undefined): Emetteur {
  const address = reviveAdresse(raw?.adresse);
  return {
    id: raw?.id || generateEmetteurId(),
    type: raw?.type ?? 'entreprise',
    denominationSociale: raw?.denominationSociale ?? '',
    formeJuridique: raw?.formeJuridique,
    siren: raw?.siren,
    siret: raw?.siret ?? '',
    numeroTVA: raw?.numeroTVA,
    rna: raw?.rna,
    codeNAF: raw?.codeNAF,
    rcs: raw?.rcs,
    rm: raw?.rm,
    capitalSocial: raw?.capitalSocial,
    adresse: address,
    telephone: raw?.telephone,
    email: raw?.email,
    siteWeb: raw?.siteWeb,
    logo: usablePdfImage(raw?.logo),
    couleurPrincipale: raw?.couleurPrincipale,
    coordonneesBancaires: raw?.coordonneesBancaires,
    regimeTVA: raw?.regimeTVA ?? 'franchise',
    regimeFiscal: raw?.regimeFiscal,
    mentionFranchiseTVA: raw?.mentionFranchiseTVA,
    mediateurConsommation: raw?.mediateurConsommation,
    assurancePro: raw?.assurancePro,
    createdAt: parseDateOrNow(raw?.createdAt),
    updatedAt: parseDateOrNow(raw?.updatedAt),
  };
}

function reviveExtended(raw: Partial<EmetteurExtended> | null | undefined): EmetteurExtended {
  return {
    ...reviveEmetteur(raw),
    linkedAccounts: raw?.linkedAccounts ?? [],
    pdfTemplateDevis: raw?.pdfTemplateDevis,
    pdfTemplateFacture: raw?.pdfTemplateFacture,
    selectedMentionsLegales: raw?.selectedMentionsLegales ?? [],
    customMentionsLegales: raw?.customMentionsLegales ?? [],
    mentionPlaceholderValues: raw?.mentionPlaceholderValues ?? {},
  };
}

function serializeEmetteur(emetteur: EmetteurExtended | Emetteur) {
  return {
    ...emetteur,
    createdAt: emetteur.createdAt.toISOString(),
    updatedAt: emetteur.updatedAt.toISOString(),
  };
}

export const EmetteurService = {
  async loadEmetteur(): Promise<Emetteur | null> {
    return withLog('EmetteurService.loadEmetteur', async () => {
      const extended = await this.loadEmetteurExtended();
      return extended;
    });
  },

  async loadEmetteurExtended(): Promise<EmetteurExtended | null> {
    return withLog('EmetteurService.loadEmetteurExtended', async () => {
      const raw = await loadSingletonJson<Partial<EmetteurExtended>>('invoice_emetteur');
      if (!raw) return null;
      return reviveExtended(raw);
    });
  },

  async saveEmetteurExtended(emetteur: EmetteurExtended): Promise<void> {
    return withLog('EmetteurService.saveEmetteurExtended', async () => {
      const errors = this.validateEmetteur(emetteur);
      if (errors.length > 0) {
        throw new Error(i18n.t('errors.issuerInvalid', { errors: errors.join(', ') }));
      }
      const now = new Date();
      const toSave: EmetteurExtended = {
        ...emetteur,
        createdAt: emetteur.createdAt || now,
        updatedAt: now,
      };
      await saveSingletonJson('invoice_emetteur', serializeEmetteur(toSave));
      const settings = await this.loadInvoiceSettingsSafe(toSave);
      await this.saveInvoiceSettings({ ...settings, emetteur: toSave });
    });
  },

  async loadInvoiceSettings(): Promise<InvoiceSettings> {
    return withLog('EmetteurService.loadInvoiceSettings', async () => {
      const emetteur = await this.loadEmetteurExtended();
      if (!emetteur) {
        throw new Error(i18n.t('errors.issuerMissing'));
      }
      return this.loadInvoiceSettingsSafe(emetteur);
    });
  },

  async loadInvoiceSettingsSafe(emetteur: Emetteur): Promise<InvoiceSettings> {
    const raw = await loadSingletonJson<InvoiceSettingsWithoutEmetteur & { emetteur?: unknown }>(
      'invoice_settings'
    );
    if (!raw) {
      return defaultInvoiceSettings(emetteur);
    }
    const { emetteur: _ignored, ...rest } = raw;
    return { ...defaultInvoiceSettings(emetteur), ...rest, emetteur };
  },

  async saveInvoiceSettings(settings: InvoiceSettings): Promise<void> {
    return withLog('EmetteurService.saveInvoiceSettings', async () => {
      const { emetteur: _emetteur, ...rest } = settings;
      await saveSingletonJson('invoice_settings', rest);
    });
  },

  async isEmetteurConfigured(): Promise<boolean> {
    const emetteur = await this.loadEmetteurExtended();
    if (!emetteur) return false;
    return this.validateEmetteur(emetteur).length === 0;
  },

  validateEmetteur(emetteur: Emetteur): string[] {
    const errors: string[] = [];
    if (!emetteur.denominationSociale) errors.push('denominationSociale');
    if (!emetteur.siret || !this.validateSiret(emetteur.siret)) errors.push('siret');
    if (
      !emetteur.adresse?.rue ||
      !emetteur.adresse?.codePostal ||
      !emetteur.adresse?.ville ||
      !emetteur.adresse?.pays
    ) {
      errors.push('adresse');
    }
    if (!emetteur.type) errors.push('type');
    if (emetteur.type === 'entreprise') {
      if (!emetteur.siren || emetteur.siren.length !== 9) errors.push('siren');
      if (!emetteur.formeJuridique) errors.push('formeJuridique');
    }
    if (emetteur.type === 'association' && !emetteur.rna) errors.push('rna');
    if (emetteur.type === 'auto_entrepreneur') {
      if (!emetteur.siren || emetteur.siren.length !== 9) errors.push('siren');
    }
    if (emetteur.numeroTVA && !this.validateNumeroTVA(emetteur.numeroTVA)) errors.push('numeroTVA');
    if (emetteur.coordonneesBancaires?.iban && !this.validateIban(emetteur.coordonneesBancaires.iban)) {
      errors.push('iban');
    }
    return errors;
  },

  validateSiret(siret: string): boolean {
    const cleaned = siret.replace(/\s+/g, '');
    if (!/^\d{14}$/.test(cleaned)) return false;
    return isLuhnValid(cleaned);
  },

  validateIban(iban: string): boolean {
    const cleaned = iban.replace(/\s+/g, '').toUpperCase();
    if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(cleaned)) return false;
    const rearranged = cleaned.slice(4) + cleaned.slice(0, 4);
    const expanded = rearranged.replace(/[A-Z]/g, (char) => (char.charCodeAt(0) - 55).toString());
    return mod97(expanded) === 1;
  },

  validateNumeroTVA(numeroTVA: string): boolean {
    const cleaned = numeroTVA.replace(/\s+/g, '').toUpperCase();
    return /^FR\d{2}\d{9}$/.test(cleaned);
  },

  calculateNumeroTVA(siren: string): string {
    const cleaned = siren.replace(/\s+/g, '');
    if (!/^\d{9}$/.test(cleaned)) throw new Error(i18n.t('errors.sirenInvalid'));
    const key = (12 + 3 * (Number(cleaned) % 97)) % 97;
    return `FR${key.toString().padStart(2, '0')}${cleaned}`;
  },

  async importRaw(emetteur: unknown, settings: unknown): Promise<void> {
    if (emetteur && typeof emetteur === 'object') {
      await saveSingletonJson('invoice_emetteur', emetteur);
    }
    if (settings && typeof settings === 'object') {
      const { emetteur: _e, ...rest } = settings as Record<string, unknown>;
      await saveSingletonJson('invoice_settings', rest);
    }
  },
};

function isLuhnValid(value: string): boolean {
  let sum = 0;
  let shouldDouble = false;
  for (let i = value.length - 1; i >= 0; i--) {
    let digit = parseInt(value.charAt(i), 10);
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
}

function mod97(value: string): number {
  let checksum = 0;
  for (let i = 0; i < value.length; i++) {
    const charCode = value.charCodeAt(i) - 48;
    if (charCode < 0 || charCode > 9) return -1;
    checksum = (checksum * 10 + charCode) % 97;
  }
  return checksum;
}
