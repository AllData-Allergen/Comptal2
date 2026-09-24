import * as XLSX from 'xlsx';
import { save } from '@tauri-apps/plugin-dialog';
import { tauriBridge } from '../services/tauri';

export type ExcelCellValue = string | number | boolean | null | undefined;

export interface ExcelSheetInput {
  name: string;
  rows: ExcelCellValue[][];
}

/** Sanitize sheet name for Excel (max 31 chars, no special chars). */
export function excelSheetName(raw: string, fallback = 'Feuille'): string {
  const cleaned = raw.replace(/[\\/*?[\]:]/g, ' ').trim() || fallback;
  return cleaned.slice(0, 31);
}

export function buildWorkbook(sheets: ExcelSheetInput[]): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const used = new Set<string>();
  for (const sheet of sheets) {
    let name = excelSheetName(sheet.name);
    let suffix = 2;
    while (used.has(name.toLowerCase())) {
      const base = excelSheetName(sheet.name).slice(0, 28);
      name = `${base}_${suffix}`;
      suffix += 1;
    }
    used.add(name.toLowerCase());
    const ws = XLSX.utils.aoa_to_sheet(sheet.rows.length > 0 ? sheet.rows : [['']]);
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
  if (wb.SheetNames.length === 0) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[]]), 'Vide');
  }
  return wb;
}

/** Prompt save dialog and write .xlsx via Tauri. Returns false if cancelled. */
export async function saveExcelWorkbook(
  defaultPath: string,
  sheets: ExcelSheetInput[]
): Promise<boolean> {
  const fileName = defaultPath.endsWith('.xlsx') ? defaultPath : `${defaultPath}.xlsx`;
  const dest = await save({
    defaultPath: fileName,
    filters: [{ name: 'Excel', extensions: ['xlsx'] }],
  });
  if (!dest) return false;
  const wb = buildWorkbook(sheets);
  const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
  await tauriBridge.writeExternalBinaryFile(dest, Array.from(new Uint8Array(buffer)));
  return true;
}
