// Modèles métier de Comptal2.1 (miroir des tables SQLite)
import { UsageMode } from '../utils/usageMode';

export interface Account {
  id: number;
  code: string;
  name: string;
  color: string;
  initialBalance: number;
}

export interface Category {
  id: number;
  code: string;
  name: string;
  color: string;
  groupId: number | null;
}

export interface CategoryGroup {
  id: number;
  name: string;
  color: string;
  sortOrder: number;
}

export interface TransactionRow {
  id: number;
  accountId: number;
  accountCode?: string;
  date: string; // ISO yyyy-MM-dd
  valueDate: string | null;
  debit: number; // <= 0
  credit: number; // >= 0
  label: string;
  categoryCode: string | null;
  tag: string | null;
  importId: number | null;
}

export interface ImportRecord {
  id: number;
  filename: string;
  accountId: number;
  dateStart: string | null;
  dateEnd: string | null;
  rowCount: number;
  importedAt: string;
}

export interface AccountImportsSummary {
  account: Account;
  importCount: number;
  totalRows: number;
  earliestStart: string | null;
  latestEnd: string | null;
  lastImport: ImportRecord | null;
  imports: ImportRecord[];
}

export interface ProfileInfo {
  id: string;
  name: string;
  createdAt: string;
  /** Mode d’usage du profil (une app, trois cibles). */
  usageMode?: UsageMode;
  /** Verrou irréversible (association / tpe uniquement). */
  usageLocked?: boolean;
  lockedAt?: string | null;
}
