// Types des paramètres globaux de Comptal2.1 (fichier data/parameter/settings.json)
import { OnboardingProgress } from './onboarding';

export type { OnboardingProgress } from './onboarding';

export const DEFAULT_ONBOARDING: OnboardingProgress = {
  tourCompleted: false,
  seenPageIntros: [],
};

export interface MenuVisibility {
  dashboard: boolean;
  upload: boolean;
  edition: boolean;
  financeGlobal: boolean;
  projectManagement: boolean;
  invoicing: boolean;
  clients: boolean;
  association: boolean;
  register: boolean;
  amortissement: boolean;
}

export type AppLanguage = 'fr' | 'en' | 'de';

export const LANGUAGE_OPTIONS: Array<{ code: AppLanguage; label: string }> = [
  { code: 'fr', label: 'Français' },
  { code: 'en', label: 'English' },
  { code: 'de', label: 'Deutsch' },
];

export function isAppLanguage(value: unknown): value is AppLanguage {
  return value === 'fr' || value === 'en' || value === 'de';
}

export type WindowMode = 'preset' | 'custom' | 'fullscreen';

export interface WindowSettings {
  mode: WindowMode;
  width: number;
  height: number;
}

export interface AppSettings {
  language: AppLanguage;
  theme: 'light' | 'dark';
  zoomLevel: number;
  window: WindowSettings;
  menuVisibility: MenuVisibility;
  activeProfileId: string | null;
  onboarding: OnboardingProgress;
  /** Premier lancement : l’utilisateur a lu le périmètre (pas FEC, pas caisse, pas PA). */
  scopeAcknowledged: boolean;
}

export const DEFAULT_MENU_VISIBILITY: MenuVisibility = {
  dashboard: true,
  upload: true,
  edition: true,
  financeGlobal: true,
  projectManagement: true,
  invoicing: true,
  clients: true,
  association: true,
  register: true,
  amortissement: true,
};

export const DEFAULT_SETTINGS: AppSettings = {
  language: 'fr',
  theme: 'light',
  zoomLevel: 100,
  window: { mode: 'preset', width: 1400, height: 900 },
  menuVisibility: DEFAULT_MENU_VISIBILITY,
  activeProfileId: null,
  onboarding: DEFAULT_ONBOARDING,
  scopeAcknowledged: false,
};

export interface WindowPreset {
  label: string;
  width: number;
  height: number;
}

export const WINDOW_PRESETS: WindowPreset[] = [
  { label: '1280 × 800 (compact)', width: 1280, height: 800 },
  { label: '1400 × 900 (recommandé)', width: 1400, height: 900 },
  { label: '1600 × 900 (large)', width: 1600, height: 900 },
  { label: '1920 × 1080 (Full HD)', width: 1920, height: 1080 },
];
