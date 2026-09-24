import { DEFAULT_MENU_VISIBILITY, MenuVisibility } from '../types/settings';

export type UsageMode = 'familiale' | 'tpe' | 'association';

export const USAGE_MODES: UsageMode[] = ['familiale', 'tpe', 'association'];

export function isUsageMode(value: unknown): value is UsageMode {
  return value === 'familiale' || value === 'tpe' || value === 'association';
}

export function parseUsageMode(value: unknown, fallback: UsageMode = 'tpe'): UsageMode {
  return isUsageMode(value) ? value : fallback;
}

/** Menus adaptés au mode — une seule app, pas trois produits. */
export function menuPresetForUsage(mode: UsageMode): MenuVisibility {
  const all = { ...DEFAULT_MENU_VISIBILITY };
  if (mode === 'familiale') {
    return { ...all, invoicing: false, association: false, register: false, amortissement: false };
  }
  if (mode === 'tpe') {
    return { ...all, association: false };
  }
  return all;
}
