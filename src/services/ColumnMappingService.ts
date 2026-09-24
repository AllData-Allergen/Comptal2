import {
  ColumnInfo,
  ColumnRole,
  DetectedColumns,
  FileAnalysisResult,
  FileStructure,
} from '../types/import';
import { Logger } from './logger';

/** Normalise un en-tête pour comparaison (sans accents, ponctuation, casse). */
export function normalizeHeader(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[''`´]/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Devine le rôle d'une colonne d'après son nom d'en-tête (relevés bancaires FR/EN).
 * Les motifs les plus spécifiques sont testés en premier.
 */
export function guessRoleFromHeader(name: string): ColumnRole | null {
  const n = normalizeHeader(name);
  if (!n || /^colonne \d+$/.test(n) || /^column \d+$/.test(n) || /^col \d+$/.test(n)) {
    return null;
  }

  if (
    /(date).*(valeur|value)/.test(n) ||
    /(valeur|value).*(date)/.test(n) ||
    /\bvalue date\b/.test(n) ||
    /\bdt valeur\b/.test(n)
  ) {
    return 'dateValue';
  }

  if (
    /^(date|jour|dt|dte)$/.test(n) ||
    /^date (operation|comptable|oper|op)$/.test(n) ||
    /^(transaction|posting|operation|value) date$/.test(n) ||
    /^date d operation$/.test(n) ||
    n.startsWith('date ')
  ) {
    return 'date';
  }

  if (
    /(debit\/ ?credit|credit\/ ?debit|debit credit|credit debit)/.test(n) ||
    /(debit).*(credit)/.test(n)
  ) {
    return 'debitCredit';
  }

  if (
    /\b(debit|debits)\b/.test(n) ||
    /\b(depenses?|sorties?|withdrawal|withdrawals)\b/.test(n)
  ) {
    return 'debit';
  }

  if (
    /\b(credit|credits)\b/.test(n) ||
    /\b(recettes?|entrees?|deposit|deposits)\b/.test(n)
  ) {
    return 'credit';
  }

  if (
    /^(solde|balance)$/.test(n) ||
    /\b(solde compte|solde bancaire|running balance|account balance)\b/.test(n) ||
    /\bsolde\b/.test(n)
  ) {
    return 'balance';
  }

  if (
    /^(montant|amount|mouvement|mouvements)$/.test(n) ||
    /\b(montant signe|transaction amount|signed amount)\b/.test(n) ||
    /\b(montant|amount|mouvement)\b/.test(n)
  ) {
    return 'debitCredit';
  }

  if (
    /\b(libelle|intitule|description|communication|wording|narrative|memo|motif|label|designation|details?)\b/.test(
      n
    )
  ) {
    return 'libelle';
  }

  if (
    /^(categorie|category|cat)$/.test(n) ||
    /\b(categorie|categories|category|categories)\b/.test(n)
  ) {
    return 'category';
  }

  if (
    /^(compte|comptes|account|accounts|cpt|acc)$/.test(n) ||
    /\b(compte bancaire|bank account)\b/.test(n) ||
    (/\b(compte|account)\b/.test(n) && !/\b(comptable|accounting|solde)\b/.test(n))
  ) {
    return 'account';
  }

  return null;
}

export function rolesConflict(existing: ColumnRole, next: ColumnRole): boolean {
  if (existing === 'ignore' || next === 'ignore') return false;
  if (existing === next) return true;
  const amount = new Set<ColumnRole>(['debit', 'credit', 'debitCredit']);
  return amount.has(existing) && amount.has(next);
}

function roleTaken(map: Map<number, ColumnRole>, role: ColumnRole): boolean {
  for (const current of map.values()) {
    if (rolesConflict(current, role)) return true;
  }
  return false;
}

/** Structure exploitable : au moins une ligne de données non vide. */
export function isImportableStructure(structure: FileStructure): boolean {
  if (structure.columns.length === 0) return false;
  const start = Math.max(0, structure.dataStartRowIndex);
  const dataRows = structure.rawData.slice(start);
  for (const row of dataRows) {
    if (!row || row.length === 0) continue;
    if (row.some((cell) => cell !== null && cell !== undefined && String(cell).trim() !== '')) {
      return true;
    }
  }
  return false;
}

/**
 * Pré-remplit les rôles : d'abord les noms d'en-tête, puis la détection par type.
 */
export function buildInitialRoles(
  columns: ColumnInfo[],
  detected: DetectedColumns
): Map<number, ColumnRole> {
  const map = new Map<number, ColumnRole>();

  const assign = (index: number, role: ColumnRole) => {
    if (map.has(index) || roleTaken(map, role)) return;
    map.set(index, role);
  };

  for (const col of columns) {
    const guessed = guessRoleFromHeader(col.name);
    if (guessed) assign(col.index, guessed);
  }

  if (detected.dateColumn) assign(detected.dateColumn.index, 'date');
  if (detected.dateValueColumn && detected.dateValueColumn !== detected.dateColumn) {
    assign(detected.dateValueColumn.index, 'dateValue');
  }
  if (detected.libelleColumn) assign(detected.libelleColumn.index, 'libelle');
  if (detected.balanceColumn) assign(detected.balanceColumn.index, 'balance');

  if (detected.amountColumns.length === 1) {
    const col = detected.amountColumns[0];
    if (col.hasNegativeValues && col.hasPositiveValues) {
      assign(col.index, 'debitCredit');
    } else if (col.hasNegativeValues) {
      assign(col.index, 'debit');
    } else {
      assign(col.index, 'credit');
    }
  } else if (detected.amountColumns.length >= 2) {
    const [c1, c2] = detected.amountColumns;
    if (c1.hasNegativeValues && !c2.hasNegativeValues) {
      assign(c1.index, 'debit');
      assign(c2.index, 'credit');
    } else if (c2.hasNegativeValues && !c1.hasNegativeValues) {
      assign(c2.index, 'debit');
      assign(c1.index, 'credit');
    } else {
      assign(c1.index, 'debit');
      assign(c2.index, 'credit');
    }
  }

  return map;
}

function pickByHeader(columns: ColumnInfo[], role: ColumnRole): ColumnInfo | undefined {
  return columns.find((col) => guessRoleFromHeader(col.name) === role);
}

export const ColumnMappingService = {
  guessRoleFromHeader,
  normalizeHeader,
  isImportableStructure,
  buildInitialRoles,

  detectColumns(structure: FileStructure): DetectedColumns {
    const detected: DetectedColumns = { amountColumns: [], otherColumns: [] };
    const { columns } = structure;

    const headerDate = pickByHeader(columns, 'date');
    const headerDateValue = pickByHeader(columns, 'dateValue');
    const headerLibelle = pickByHeader(columns, 'libelle');
    const headerDebit = pickByHeader(columns, 'debit');
    const headerCredit = pickByHeader(columns, 'credit');
    const headerCombined = pickByHeader(columns, 'debitCredit');
    const headerBalance = pickByHeader(columns, 'balance');

    const dateColumns = columns.filter((col) => col.type === 'date');
    detected.dateColumn = headerDate ?? dateColumns[0];
    detected.dateValueColumn =
      headerDateValue ??
      (dateColumns.length > 1
        ? dateColumns.find((c) => c !== detected.dateColumn) ?? dateColumns[1]
        : detected.dateColumn);

    const textColumns = columns.filter((col) => col.type === 'text');
    if (headerLibelle) {
      detected.libelleColumn = headerLibelle;
    } else if (textColumns.length > 0) {
      detected.libelleColumn = textColumns.reduce((max, col) => {
        const avg =
          col.sampleValues.reduce((sum, val) => sum + val.length, 0) /
          Math.max(col.sampleValues.length, 1);
        const maxAvg =
          max.sampleValues.reduce((sum, val) => sum + val.length, 0) /
          Math.max(max.sampleValues.length, 1);
        return avg > maxAvg ? col : max;
      });
    }

    const takenIndexes = new Set<number>();
    const markTaken = (col?: ColumnInfo) => {
      if (col) takenIndexes.add(col.index);
    };
    markTaken(detected.dateColumn);
    if (detected.dateValueColumn !== detected.dateColumn) markTaken(detected.dateValueColumn);
    markTaken(detected.libelleColumn);

    const numericColumns = columns.filter((col) => col.type === 'number');
    const monotonicColumns = numericColumns.filter((col) => col.isMonotonic === true);
    let nonMonotonic = numericColumns.filter((col) => col.isMonotonic !== true);

    detected.balanceColumn =
      headerBalance ?? (monotonicColumns.length > 0 ? monotonicColumns[0] : undefined);
    markTaken(detected.balanceColumn);

    if (headerDebit || headerCredit) {
      detected.amountColumns = [headerDebit, headerCredit].filter(
        (col): col is ColumnInfo => Boolean(col)
      );
      detected.amountColumnType = 'split';
    } else if (headerCombined) {
      detected.amountColumns = [headerCombined];
      detected.amountColumnType = 'single';
    } else {
      if (nonMonotonic.length === 0 && numericColumns.length > 0) {
        nonMonotonic = numericColumns.filter((col) => col !== detected.balanceColumn);
      }
      detected.amountColumns = nonMonotonic.filter((col) => !takenIndexes.has(col.index));

      if (detected.amountColumns.length === 1) {
        const singleCol = detected.amountColumns[0];
        if (singleCol.hasNegativeValues && singleCol.hasPositiveValues) {
          detected.amountColumnType = 'single';
        } else if (singleCol.hasNegativeValues && !singleCol.hasPositiveValues) {
          const credit = numericColumns.find(
            (col) =>
              col !== singleCol &&
              !takenIndexes.has(col.index) &&
              col.hasPositiveValues &&
              !col.hasNegativeValues
          );
          if (credit) detected.amountColumns.push(credit);
          detected.amountColumnType = 'split';
        } else {
          detected.amountColumnType = 'split';
        }
      } else if (detected.amountColumns.length >= 2) {
        detected.amountColumns = detected.amountColumns.slice(0, 2);
        detected.amountColumnType = 'split';
      }
    }

    detected.otherColumns = columns.filter((col) => {
      if (col === detected.dateColumn || col === detected.dateValueColumn) return false;
      if (col === detected.libelleColumn) return false;
      if (detected.amountColumns.includes(col)) return false;
      if (col === detected.balanceColumn) return false;
      return true;
    });
    return detected;
  },

  analyzeFile(structure: FileStructure): FileAnalysisResult {
    const startedAt = Logger.start('ColumnMappingService.analyzeFile', 'activation', {
      columns: structure.columns.length,
    });
    try {
      const detectedColumns = this.detectColumns(structure);
      let requiresManualMapping = false;
      if (detectedColumns.amountColumns.length === 2) {
        const [col1, col2] = detectedColumns.amountColumns;
        if (!col1.hasNegativeValues && !col2.hasNegativeValues) requiresManualMapping = true;
      } else if (detectedColumns.amountColumns.length === 1) {
        const single = detectedColumns.amountColumns[0];
        if (
          single.hasNegativeValues &&
          !single.hasPositiveValues &&
          detectedColumns.amountColumnType === 'split'
        ) {
          requiresManualMapping = true;
        }
      }
      Logger.end('ColumnMappingService.analyzeFile', startedAt, 'fin', {
        date: detectedColumns.dateColumn?.name,
        dateValue: detectedColumns.dateValueColumn?.name,
        libelle: detectedColumns.libelleColumn?.name,
        amounts: detectedColumns.amountColumns.map((c) => c.name),
        balance: detectedColumns.balanceColumn?.name,
      });
      return { structure, detectedColumns, requiresManualMapping };
    } catch (err) {
      Logger.error('ColumnMappingService.analyzeFile', err);
      Logger.end('ColumnMappingService.analyzeFile', startedAt, 'fin (erreur)');
      throw err;
    }
  },

  validate(result: FileAnalysisResult): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!result.detectedColumns.dateColumn) errors.push('Aucune colonne de date détectée');
    if (!result.detectedColumns.libelleColumn) errors.push('Aucune colonne de libellé détectée');
    if (result.detectedColumns.amountColumns.length === 0) {
      errors.push('Aucune colonne de montant détectée');
    }
    return { valid: errors.length === 0, errors };
  },

  mappingFromDetection(detected: DetectedColumns): {
    dateColumnIndex: number;
    dateValueColumnIndex?: number;
    libelleColumnIndex: number;
    debitColumnIndex: number;
    creditColumnIndex: number;
  } | null {
    if (!detected.dateColumn || !detected.libelleColumn || detected.amountColumns.length === 0) {
      return null;
    }
    const debit = detected.amountColumns[0];
    const credit =
      detected.amountColumnType === 'single' ? debit : (detected.amountColumns[1] ?? debit);
    return {
      dateColumnIndex: detected.dateColumn.index,
      dateValueColumnIndex: detected.dateValueColumn?.index,
      libelleColumnIndex: detected.libelleColumn.index,
      debitColumnIndex: debit.index,
      creditColumnIndex: credit.index,
    };
  },

  roleOf(col: ColumnInfo, detected: DetectedColumns): string {
    if (col === detected.dateColumn) return 'date';
    if (col === detected.dateValueColumn && col !== detected.dateColumn) return 'dateValue';
    if (col === detected.libelleColumn) return 'libelle';
    if (col === detected.balanceColumn) return 'balance';
    if (detected.amountColumns[0] === col && detected.amountColumnType === 'single') {
      return 'debitCredit';
    }
    if (detected.amountColumns[0] === col) return 'debit';
    if (detected.amountColumns[1] === col) return 'credit';
    return 'ignore';
  },
};
