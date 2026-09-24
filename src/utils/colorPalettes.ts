import { ColorPalette } from '../types/colorPalette';

export const PREDEFINED_PALETTES: ColorPalette[] = [
  {
    id: 'pastel',
    name: 'Pastel',
    colors: [
      '#FFB3BA', '#FFDFBA', '#FFFFBA', '#BAFFC9', '#BAE1FF', '#E0BBE4',
      '#FFCCCB', '#F0E68C', '#DDA0DD', '#98D8C8', '#F7DC6F', '#AED6F1',
    ],
  },
  {
    id: 'vif',
    name: 'Vif',
    colors: [
      '#FF0000', '#FF8C00', '#FFD700', '#32CD32', '#00CED1', '#1E90FF',
      '#9370DB', '#FF1493', '#00FF00', '#00BFFF', '#FF4500', '#8A2BE2',
    ],
  },
  {
    id: 'ocean',
    name: 'Océan',
    colors: [
      '#001F3F', '#0074D9', '#39CCCC', '#7FDBFF', '#B3E5FC', '#E0F7FA',
      '#006064', '#0097A7', '#00ACC1', '#4DD0E1', '#80DEEA', '#B2EBF2',
    ],
  },
  {
    id: 'foret',
    name: 'Forêt',
    colors: [
      '#1B5E20', '#2E7D32', '#388E3C', '#43A047', '#66BB6A', '#81C784',
      '#A5D6A7', '#6D4C41', '#8D6E63', '#A1887F', '#BCAAA4', '#D7CCC8',
    ],
  },
  {
    id: 'coucher-soleil',
    name: 'Coucher de soleil',
    colors: [
      '#FF6B35', '#F7931E', '#FFC857', '#FFE66D', '#FF8C94', '#FF6B9D',
      '#C44569', '#F8B500', '#FFA07A', '#FF7F50', '#FF6347', '#FF4500',
    ],
  },
  {
    id: 'arc-en-ciel',
    name: 'Arc-en-ciel',
    colors: [
      '#FF0000', '#FF7F00', '#FFFF00', '#00FF00', '#0000FF', '#4B0082',
      '#9400D3', '#FF1493', '#00CED1', '#32CD32', '#FFD700', '#FF69B4',
    ],
  },
  {
    id: 'monochrome-bleu',
    name: 'Monochrome Bleu',
    colors: [
      '#000080', '#0000CD', '#0000FF', '#4169E1', '#1E90FF', '#00BFFF',
      '#87CEEB', '#B0E0E6', '#ADD8E6', '#E0F7FA', '#B3E5FC', '#E1F5FE',
    ],
  },
  {
    id: 'monochrome-vert',
    name: 'Monochrome Vert',
    colors: [
      '#006400', '#008000', '#228B22', '#32CD32', '#00FF00', '#7CFC00',
      '#90EE90', '#98FB98', '#ADFF2F', '#B3E5B3', '#C8E6C9', '#E8F5E9',
    ],
  },
  {
    id: 'monochrome-rouge',
    name: 'Monochrome Rouge',
    colors: [
      '#8B0000', '#DC143C', '#FF0000', '#FF4500', '#FF6347', '#FF7F50',
      '#FF8C00', '#FFA07A', '#FFB6C1', '#FFC0CB', '#FFE4E1', '#FFF0F5',
    ],
  },
  {
    id: 'monochrome-pastel-bleu',
    name: 'Monochrome pastel bleu',
    colors: [
      '#7EB8D8', '#8EC8E0', '#A8D4E8', '#C0E0F0',
      '#94A0D0', '#A8B4D8', '#BCC8E4', '#D0D8EC',
      '#70C0C8', '#88CCC8', '#A0D8D0', '#B8E4DC',
    ],
  },
  {
    id: 'monochrome-pastel-vert',
    name: 'Monochrome pastel vert',
    colors: [
      '#7CC8A0', '#90D4B0', '#A4DEC0', '#B8E8D0',
      '#A0C090', '#B0CCA4', '#C4D8B8', '#D4E4CC',
      '#80D4B0', '#98D8BC', '#A8E0C8', '#C0E8D4',
    ],
  },
  {
    id: 'monochrome-pastel-rose',
    name: 'Monochrome pastel rose',
    colors: [
      '#E894A8', '#F0A8B8', '#F4BCC8', '#F8D0D8',
      '#E8A098', '#F0B4AC', '#F4C4BC', '#F8D4CC',
      '#D898B0', '#E4ACB8', '#ECC0C8', '#F4D4D8',
    ],
  },
  {
    id: 'monochrome-pastel-violet',
    name: 'Monochrome pastel violet',
    colors: [
      '#A8A0D0', '#BCB4D8', '#D0C8E4', '#E0D8EC',
      '#B4A0D8', '#C4B4E0', '#D4C8E8', '#E4D8F0',
      '#C0A0CC', '#D0B4D4', '#DCC4E0', '#E8D8EC',
    ],
  },
  {
    id: 'monochrome-pastel-peche',
    name: 'Monochrome pastel pêche',
    colors: [
      '#F0B898', '#F4C8A8', '#F8D8BC', '#FAE4CC',
      '#F0A8A0', '#F4B8B0', '#F8C8C0', '#FCD8D0',
      '#E8B8A0', '#F0C8B0', '#F4D4C0', '#F8E0D0',
    ],
  },
  {
    id: 'monochrome-pastel-gris',
    name: 'Monochrome pastel gris',
    colors: [
      '#A0A8B4', '#B4BCC4', '#C4CCD4', '#D4DCE0',
      '#9CA4B8', '#B0B8C8', '#C0C8D4', '#D0D8E0',
      '#A8A4A4', '#BCB8B8', '#CCC8C8', '#DCD8D8',
    ],
  },
  {
    id: 'dynamique-pastel',
    name: 'Dynamique (débit / crédit)',
    kind: 'dynamic',
    description: 'Jaune → orange → rouge pastel pour les débits, vert pastel pour les crédits — répartition logarithmique : plus le montant est élevé, plus la teinte est marquée.',
    colors: [
      '#F5E0A0', '#EBB899', '#EB9999', '#E8E4DC', '#C0E0CB', '#99CCA8', '#80B399',
    ],
  },
];

export function generateHarmonyColors(
  baseColor: string,
  type: 'analogous' | 'complementary' | 'triadic'
): string[] {
  const hex = baseColor.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  const rgb = [r / 255, g / 255, b / 255];
  const max = Math.max(...rgb);
  const min = Math.min(...rgb);
  const delta = max - min;

  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (delta !== 0) {
    s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);
    if (max === rgb[0]) {
      h = ((rgb[1] - rgb[2]) / delta + (rgb[1] < rgb[2] ? 6 : 0)) / 6;
    } else if (max === rgb[1]) {
      h = ((rgb[2] - rgb[0]) / delta + 2) / 6;
    } else {
      h = ((rgb[0] - rgb[1]) / delta + 4) / 6;
    }
  }

  const colors: string[] = [];
  if (type === 'analogous') {
    for (let i = -2; i <= 2; i++) {
      colors.push(hslToHex((h + (i * 30) / 360 + 1) % 1, s, l));
    }
  } else if (type === 'complementary') {
    colors.push(hslToHex(h, s, l));
    colors.push(hslToHex((h + 0.5) % 1, s, l));
    colors.push(hslToHex(h, s, Math.max(0, l - 0.2)));
    colors.push(hslToHex(h, s, Math.min(1, l + 0.2)));
    colors.push(hslToHex((h + 0.5) % 1, s, Math.max(0, l - 0.2)));
    colors.push(hslToHex((h + 0.5) % 1, s, Math.min(1, l + 0.2)));
  } else {
    colors.push(hslToHex(h, s, l));
    colors.push(hslToHex((h + 1 / 3) % 1, s, l));
    colors.push(hslToHex((h + 2 / 3) % 1, s, l));
    colors.push(hslToHex(h, s, Math.max(0, l - 0.15)));
    colors.push(hslToHex((h + 1 / 3) % 1, s, Math.max(0, l - 0.15)));
    colors.push(hslToHex((h + 2 / 3) % 1, s, Math.max(0, l - 0.15)));
  }
  return colors;
}

function hslToHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h * 6) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 1 / 6) {
    r = c; g = x;
  } else if (h < 2 / 6) {
    r = x; g = c;
  } else if (h < 3 / 6) {
    g = c; b = x;
  } else if (h < 4 / 6) {
    g = x; b = c;
  } else if (h < 5 / 6) {
    r = x; b = c;
  } else {
    r = c; b = x;
  }
  const toHex = (n: number) => Math.round((n + m) * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const cleanHex = hex.replace('#', '');
  const r = parseInt(cleanHex.substring(0, 2), 16) / 255;
  const g = parseInt(cleanHex.substring(2, 4), 16) / 255;
  const b = parseInt(cleanHex.substring(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (delta !== 0) {
    s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);
    if (max === r) h = ((g - b) / delta + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / delta + 2) / 6;
    else h = ((r - g) / delta + 4) / 6;
  }
  return { h, s, l };
}

export function lightenColor(hex: string, amount: number): string {
  const { h, s, l } = hexToHsl(hex);
  return hslToHex(h, s, Math.min(0.95, l + amount));
}

export function darkenColor(hex: string, amount: number): string {
  const { h, s, l } = hexToHsl(hex);
  return hslToHex(h, s, Math.max(0.05, l - amount));
}

export const DYNAMIC_PALETTE_ID = 'dynamique-pastel';

export function isDynamicPalette(palette: ColorPalette): boolean {
  return palette.kind === 'dynamic' || palette.id === DYNAMIC_PALETTE_ID;
}

const DYNAMIC_NEUTRAL = '#E8E4DC';
const DYNAMIC_EPS = 0.005;

function rankSpread(absValues: number[]): number[] {
  const n = absValues.length;
  if (n === 0) return [];
  if (n === 1) return [0.5];

  const ranked = absValues
    .map((value, index) => ({ index, value }))
    .sort((a, b) => a.value - b.value);
  const result = Array(n).fill(0);
  ranked.forEach((item, rank) => {
    result[item.index] = rank / (n - 1);
  });
  return result;
}

function logSpread(absValues: number[]): number[] {
  const n = absValues.length;
  if (n === 0) return [];
  if (n === 1) return [0.86];

  const logs = absValues.map((value) => Math.log1p(value));
  const minLog = Math.min(...logs);
  const maxLog = Math.max(...logs);
  const logRange = maxLog - minLog;

  const ranked = absValues
    .map((value, index) => ({ index, value }))
    .sort((a, b) => a.value - b.value);
  const rankT = Array(n).fill(0);
  ranked.forEach((item, rank) => {
    rankT[item.index] = rank / (n - 1);
  });

  if (logRange < 1e-6) {
    return rankT.map((rank) => 0.22 + rank * 0.78);
  }

  return logs.map((log, index) => {
    const logT = (log - minLog) / logRange;
    const mixed = 0.8 * logT + 0.2 * rankT[index];
    return 0.18 + mixed * 0.82;
  });
}

function pastelByIntensity(isDebit: boolean, intensity: number): string {
  const t = Math.min(1, Math.max(0, intensity));
  if (isDebit) {
    const stops = [
      { t: 0, h: 0.13, s: 0.45, l: 0.84 },
      { t: 0.5, h: 0.07, s: 0.50, l: 0.80 },
      { t: 1, h: 0.0, s: 0.50, l: 0.78 },
    ];
    const i = t <= 0.5 ? 0 : 1;
    const localT = t <= 0.5 ? t / 0.5 : (t - 0.5) / 0.5;
    const from = stops[i];
    const to = stops[i + 1];
    return hslToHex(
      from.h + (to.h - from.h) * localT,
      from.s + (to.s - from.s) * localT,
      from.l + (to.l - from.l) * localT,
    );
  }
  const stops = [
    { t: 0, h: 0.38, s: 0.35, l: 0.85 },
    { t: 0.5, h: 0.35, s: 0.40, l: 0.80 },
    { t: 1, h: 0.30, s: 0.45, l: 0.75 },
  ];
  const i = t <= 0.5 ? 0 : 1;
  const localT = t <= 0.5 ? t / 0.5 : (t - 0.5) / 0.5;
  const from = stops[i];
  const to = stops[i + 1];
  return hslToHex(
    from.h + (to.h - from.h) * localT,
    from.s + (to.s - from.s) * localT,
    from.l + (to.l - from.l) * localT,
  );
}

/** Jaune→orange→ rouge pastel pour débits (classement par rang), vert pastel pour crédits. */
export function dynamicPastelColor(net: number, maxAbs: number): string {
  if (!Number.isFinite(net) || Math.abs(net) < DYNAMIC_EPS) return DYNAMIC_NEUTRAL;
  const intensity = maxAbs > 0
    ? Math.min(1, Math.log1p(Math.abs(net)) / Math.log1p(maxAbs))
    : 0;
  return pastelByIntensity(net < 0, 0.18 + intensity * 0.82);
}

export function assignDynamicPastelColors(nets: Record<string, number>): Record<string, string> {
  const entries = Object.entries(nets);
  const colors: Record<string, string> = {};
  const debits: Array<{ code: string; abs: number }> = [];
  const credits: Array<{ code: string; abs: number }> = [];

  for (const [code, net] of entries) {
    if (!Number.isFinite(net) || Math.abs(net) < DYNAMIC_EPS) {
      colors[code] = DYNAMIC_NEUTRAL;
      continue;
    }
    if (net < 0) debits.push({ code, abs: Math.abs(net) });
    else credits.push({ code, abs: net });
  }

  const debitSpread = rankSpread(debits.map((item) => item.abs));
  debits.forEach((item, index) => {
    colors[item.code] = pastelByIntensity(true, debitSpread[index]);
  });
  const creditSpread = logSpread(credits.map((item) => item.abs));
  credits.forEach((item, index) => {
    colors[item.code] = pastelByIntensity(false, creditSpread[index]);
  });
  return colors;
}

export function applyPaletteColors(
  palette: ColorPalette,
  itemCodes: string[],
  nets: Record<string, number> = {}
): Record<string, string> {
  if (isDynamicPalette(palette)) {
    const scoped: Record<string, number> = {};
    for (const code of itemCodes) scoped[code] = nets[code] ?? 0;
    return assignDynamicPastelColors(scoped);
  }
  const colors: Record<string, string> = {};
  itemCodes.forEach((code, index) => {
    colors[code] = palette.colors[index % palette.colors.length];
  });
  return colors;
}
