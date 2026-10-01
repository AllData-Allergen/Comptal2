import { Client, Emetteur, EmetteurExtended, Facture, PosteFacture } from '../types/invoice';

export function snapshotVendeur(emetteur: Emetteur | EmetteurExtended) {
  return {
    type: emetteur.type,
    denominationSociale: emetteur.denominationSociale,
    formeJuridique: emetteur.formeJuridique ?? '',
    adresse: emetteur.adresse,
    siren: emetteur.siren ?? '',
    siret: emetteur.siret,
    numeroTVA: emetteur.numeroTVA ?? '',
    capitalSocial: emetteur.capitalSocial,
    rcs: emetteur.rcs,
    email: emetteur.email,
    telephone: emetteur.telephone,
    regimeTVA: emetteur.regimeTVA,
    mentionFranchiseTVA: emetteur.mentionFranchiseTVA,
    mediateurConsommation: emetteur.mediateurConsommation,
    logo: emetteur.logo,
    coordonneesBancaires: emetteur.coordonneesBancaires,
  };
}

export function legalIssuerName(emetteur: Pick<Emetteur, 'type' | 'denominationSociale'>): string {
  const name = emetteur.denominationSociale.trim();
  if (emetteur.type !== 'auto_entrepreneur' || /\bEI\b/i.test(name)) return name;
  return `${name} EI`.trim();
}

export function operationNature(postes: PosteFacture[]): string {
  const kinds = new Set(postes.map((poste) => poste.type));
  if (kinds.size > 1) return 'Livraisons de biens et prestations de services';
  if (kinds.has('materiel')) return 'Livraisons de biens';
  return 'Prestations de services';
}

export function validateMicroInvoice(facture: Facture, emetteur: Emetteur): string[] {
  if (emetteur.type !== 'auto_entrepreneur') return [];
  const errors: string[] = [];
  if (emetteur.regimeTVA === 'franchise' && facture.postes.some((poste) => (poste.tauxTVA ?? 0) !== 0)) {
    errors.push('Une micro-entreprise en franchise de TVA doit facturer toutes les lignes à 0 % de TVA.');
  }
  if (!emetteur.siren?.trim()) errors.push('Le SIREN est obligatoire.');
  if (!emetteur.siret?.trim()) errors.push('Le SIRET est obligatoire.');
  return errors;
}

export function isInvoiceIssued(facture: Facture): boolean {
  return facture.statut !== 'brouillon';
}

function stableJson(value: unknown): string {
  return JSON.stringify(value);
}

function dayStamp(value: Date | undefined): string {
  if (!value) return '';
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, '0');
  const d = String(value.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Champs gelés après émission (hors paiements / PJ / statut de paiement). */
export function invoiceCoreChanged(previous: Facture, next: Facture): boolean {
  return (
    previous.numero !== next.numero ||
    previous.clientId !== next.clientId ||
    dayStamp(previous.dateEmission) !== dayStamp(next.dateEmission) ||
    dayStamp(previous.dateEcheance) !== dayStamp(next.dateEcheance) ||
    previous.intituleSecondaire !== next.intituleSecondaire ||
    previous.devisOrigine !== next.devisOrigine ||
    Boolean(previous.isAvoir) !== Boolean(next.isAvoir) ||
    previous.factureOrigine !== next.factureOrigine ||
    stableJson(previous.postes) !== stableJson(next.postes) ||
    stableJson(previous.vendeur) !== stableJson(next.vendeur)
  );
}

export function invertPosteForAvoir(poste: PosteFacture): PosteFacture {
  if (poste.type === 'materiel') {
    return { ...poste, quantite: -Math.abs(poste.quantite) };
  }
  return { ...poste, heuresEstimees: -Math.abs(poste.heuresEstimees) };
}

function formatAdresseClient(client: Client): string {
  const a = client.adresseFacturation;
  return [a.rue, `${a.codePostal} ${a.ville}`.trim(), a.pays].filter(Boolean).join(', ');
}

export function clientIdentityLines(client: Client | null): string[] {
  if (!client) return ['Client inconnu'];
  const name =
    client.type === 'entreprise'
      ? client.denominationSociale || `${client.prenom ?? ''} ${client.nom ?? ''}`.trim()
      : `${client.civilite ?? ''} ${client.prenom ?? ''} ${client.nom ?? ''}`.trim() ||
        client.denominationSociale ||
        'Client';
  const lines = [name, formatAdresseClient(client)];
  if (client.type === 'entreprise') {
    if (client.siren) lines.push(`SIREN ${client.siren}`);
    if (client.siret) lines.push(`SIRET ${client.siret}`);
    if (client.numeroTVA) lines.push(`N° TVA ${client.numeroTVA}`);
  }
  return lines.filter((line) => line.trim().length > 0);
}

export function tvaBreakdownLines(totalTVA: Record<number, number>): string[] {
  const rates = Object.keys(totalTVA)
    .map(Number)
    .sort((a, b) => b - a);
  if (rates.length === 0) return ['TVA : 0,00 €'];
  return rates.map((rate) => {
    const amount = totalTVA[rate] ?? 0;
    const formatted = amount.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `TVA ${rate} % : ${formatted} €`;
  });
}

/** Mentions minimales TPE (B2B) — toujours présentes, même « néant ». */
export function mandatoryInvoiceMentions(
  emetteur: Emetteur,
  extraSelected = '',
  facture?: Facture
): string {
  const lines: string[] = [];
  if (facture) lines.push(`Nature de l’opération : ${operationNature(facture.postes)}.`);
  if (emetteur.regimeTVA === 'franchise') {
    lines.push(emetteur.mentionFranchiseTVA?.trim() || 'TVA non applicable, art. 293 B du CGI');
  }
  lines.push(
    "En cas de retard de paiement, une pénalité égale à 3 fois le taux d'intérêt légal sera exigible (loi n° 2008-776 du 4 août 2008)."
  );
  lines.push(
    'Indemnité forfaitaire de recouvrement de 40 € due de plein droit en cas de retard (art. D. 441-5 du Code de commerce) — opérations entre professionnels.'
  );
  lines.push('Escompte pour paiement anticipé : néant.');
  if (emetteur.mediateurConsommation?.trim()) {
    lines.push(`Médiateur de la consommation : ${emetteur.mediateurConsommation.trim()}.`);
  }
  if (extraSelected.trim()) lines.push(extraSelected.trim());
  return lines.join('\n');
}
