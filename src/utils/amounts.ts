/** Parse un montant FR/EN (espaces, virgule, euro). Chaîne vide → 0. */
export function parseAmount(raw: unknown): number {
  return parseAmountOptional(raw) ?? 0;
}

/** Parse un montant FR/EN. Chaîne vide / invalide → null (0 reste 0). */
export function parseAmountOptional(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  const cleaned = trimmed.replace(/[\s\u00a0€]/g, '').replace(',', '.');
  if (!cleaned) return null;
  const value = parseFloat(cleaned);
  return Number.isFinite(value) ? value : null;
}

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function formatMoney(value: number, locale = 'fr-FR'): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
  }).format(value);
}
