import { FileStructure, PreviewRow } from '../types/import';
import { Category } from '../types/models';
import { withLog } from './logger';

export interface CategoryValueStats {
  raw: string;
  count: number;
}

export interface CategoryResolveResult {
  /** Valeur brute du fichier → category_code */
  valueToCode: Record<string, string>;
  missing: CategoryValueStats[];
  values: CategoryValueStats[];
}

/** Préremplit code/nom à la création d'après la valeur CSV. */
export function suggestCategoryDraft(raw: string): { code: string; name: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { code: '', name: '' };
  if (/^[A-Za-z0-9_-]{1,8}$/.test(trimmed)) {
    return { code: trimmed.toUpperCase(), name: trimmed };
  }
  const letters = trimmed
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]/g, '')
    .slice(0, 4)
    .toUpperCase();
  return { code: letters || 'CAT', name: trimmed };
}

/** Matching : code (case-insensitive) puis nom exact (case-insensitive). */
export function matchCategory(raw: string, categories: Category[]): Category | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const upper = trimmed.toUpperCase();
  const byCode = categories.find((c) => c.code.toUpperCase() === upper);
  if (byCode) return byCode;
  const lower = trimmed.toLowerCase();
  return categories.find((c) => c.name.trim().toLowerCase() === lower) ?? null;
}

export function collectCategoryValues(
  structure: FileStructure,
  categoryColumnIndex: number
): CategoryValueStats[] {
  const counts = new Map<string, number>();
  const dataRows = structure.rawData.slice(structure.dataStartRowIndex);
  for (const row of dataRows) {
    if (!row || row.length === 0) continue;
    const raw = String(row[categoryColumnIndex] ?? '').trim();
    if (!raw) continue;
    counts.set(raw, (counts.get(raw) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([raw, count]) => ({ raw, count }))
    .sort((a, b) => a.raw.localeCompare(b.raw, undefined, { sensitivity: 'base' }));
}

export function resolveCategoryMappings(
  values: CategoryValueStats[],
  categories: Category[]
): Omit<CategoryResolveResult, 'values'> {
  const valueToCode: Record<string, string> = {};
  const missing: CategoryValueStats[] = [];
  for (const item of values) {
    const found = matchCategory(item.raw, categories);
    if (found) valueToCode[item.raw] = found.code;
    else missing.push(item);
  }
  return { valueToCode, missing };
}

export function applyCategoryCodesToRows(
  rows: PreviewRow[],
  valueToCode: Record<string, string>
): PreviewRow[] {
  return rows.map((row) => {
    const raw = row.categoryRaw?.trim();
    if (!raw) return { ...row, categoryCode: row.categoryCode ?? null };
    const code = valueToCode[raw];
    return { ...row, categoryCode: code ?? null };
  });
}

export const CategoryImportService = {
  suggestCategoryDraft,
  matchCategory,
  collectCategoryValues,
  resolveCategoryMappings,
  applyCategoryCodesToRows,

  async analyzeMappedCategories(
    structure: FileStructure,
    categoryColumnIndex: number,
    categories: Category[]
  ): Promise<CategoryResolveResult> {
    return withLog(
      'CategoryImportService.analyzeMappedCategories',
      async () => {
        const values = collectCategoryValues(structure, categoryColumnIndex);
        const resolved = resolveCategoryMappings(values, categories);
        return { ...resolved, values };
      },
      { data: { columnIndex: categoryColumnIndex, categoryCount: categories.length } }
    );
  },
};
