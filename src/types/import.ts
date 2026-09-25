export type FileType = 'csv' | 'excel';
export type ColumnType = 'date' | 'text' | 'number' | 'unknown';
export type ColumnRole =
  | 'date'
  | 'dateValue'
  | 'libelle'
  | 'debit'
  | 'credit'
  | 'debitCredit'
  | 'balance'
  | 'category'
  | 'account'
  | 'ignore';

export interface ColumnInfo {
  index: number;
  name: string;
  type: ColumnType;
  sampleValues: string[];
  hasNegativeValues?: boolean;
  hasPositiveValues?: boolean;
  isMonotonic?: boolean;
}

export interface FileStructure {
  fileType: FileType;
  encoding?: string;
  delimiter?: string;
  headerRowIndex: number;
  dataStartRowIndex: number;
  columns: ColumnInfo[];
  totalRows: number;
  sampleRows: unknown[][];
  rawData: unknown[][];
}

export interface DetectedColumns {
  dateColumn?: ColumnInfo;
  dateValueColumn?: ColumnInfo;
  libelleColumn?: ColumnInfo;
  amountColumns: ColumnInfo[];
  balanceColumn?: ColumnInfo;
  otherColumns: ColumnInfo[];
  amountColumnType?: 'single' | 'split';
}

export interface FileAnalysisResult {
  structure: FileStructure;
  detectedColumns: DetectedColumns;
  requiresManualMapping: boolean;
}

export interface ColumnMappingConfig {
  dateColumnIndex: number;
  dateValueColumnIndex?: number;
  libelleColumnIndex: number;
  debitColumnIndex: number;
  creditColumnIndex: number;
  categoryColumnIndex?: number;
  accountColumnIndex?: number;
}

export interface PreviewRow {
  date: string;
  valueDate: string | null;
  debit: number;
  credit: number;
  label: string;
  /** Valeur brute de la colonne catégorie du fichier (avant résolution). */
  categoryRaw?: string | null;
  /** Code catégorie résolu pour l'INSERT. */
  categoryCode?: string | null;
  /** Valeur brute de la colonne compte du fichier (avant résolution). */
  accountRaw?: string | null;
  /** Id compte résolu pour l'INSERT (sinon compte wizard). */
  accountId?: number | null;
  /** Code compte résolu (aperçu). */
  accountCode?: string | null;
}

export interface ExcelSheetInfo {
  name: string;
  index: number;
  rowCount: number;
  startDate?: string;
  endDate?: string;
}

export interface OverlapWarning {
  importId: number;
  filename: string;
  dateStart: string | null;
  dateEnd: string | null;
}

/** Mapping en-tête de colonne → rôle (persistance templates). */
export type ColumnRolesByHeader = Record<string, ColumnRole>;

export interface ImportTemplate {
  id: number;
  name: string;
  accountId: number | null;
  initialBalance: number | null;
  columnRoles: ColumnRolesByHeader;
  createdAt: string;
  updatedAt: string | null;
}

export interface ImportTemplateInput {
  name: string;
  accountId?: number | null;
  initialBalance?: number | null;
  columnRoles: ColumnRolesByHeader;
}

/** Construit un ColumnMappingConfig à partir d'un Map index → rôle. */
export function mappingFromRoles(
  roles: Map<number, ColumnRole>
): ColumnMappingConfig | null {
  let dateColumnIndex: number | undefined;
  let dateValueColumnIndex: number | undefined;
  let libelleColumnIndex: number | undefined;
  let debitColumnIndex: number | undefined;
  let creditColumnIndex: number | undefined;
  let categoryColumnIndex: number | undefined;
  let accountColumnIndex: number | undefined;

  for (const [index, role] of roles.entries()) {
    switch (role) {
      case 'date':
        dateColumnIndex = index;
        break;
      case 'dateValue':
        dateValueColumnIndex = index;
        break;
      case 'libelle':
        libelleColumnIndex = index;
        break;
      case 'debit':
        debitColumnIndex = index;
        break;
      case 'credit':
        creditColumnIndex = index;
        break;
      case 'debitCredit':
        debitColumnIndex = index;
        creditColumnIndex = index;
        break;
      case 'category':
        categoryColumnIndex = index;
        break;
      case 'account':
        accountColumnIndex = index;
        break;
      default:
        break;
    }
  }

  if (
    dateColumnIndex === undefined ||
    libelleColumnIndex === undefined ||
    (debitColumnIndex === undefined && creditColumnIndex === undefined)
  ) {
    return null;
  }

  return {
    dateColumnIndex,
    dateValueColumnIndex,
    libelleColumnIndex,
    debitColumnIndex: debitColumnIndex ?? creditColumnIndex!,
    creditColumnIndex: creditColumnIndex ?? debitColumnIndex!,
    categoryColumnIndex,
    accountColumnIndex,
  };
}
