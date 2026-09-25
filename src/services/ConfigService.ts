// CRUD comptes bancaires et catégories (tables SQLite du profil actif)
import { Account, Category, CategoryGroup } from '../types/models';
import { isTransferCategory } from '../utils/categories';
import i18n from '../i18n/config';
import { Db } from './db';
import { withLog } from './logger';
import { sqlTxActive } from '../utils/sqlTx';

interface AccountRow {
  id: number;
  code: string;
  name: string;
  color: string;
  initial_balance: number;
}

interface CategoryRow {
  id: number;
  code: string;
  name: string;
  color: string;
  group_id: number | null;
}

interface CategoryGroupRow {
  id: number;
  name: string;
  color: string;
  sort_order: number;
}

function mapCategory(r: CategoryRow): Category {
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    color: r.color,
    groupId: r.group_id ?? null,
  };
}

function mapCategoryGroup(r: CategoryGroupRow): CategoryGroup {
  return { id: r.id, name: r.name, color: r.color, sortOrder: r.sort_order };
}

export const ConfigService = {
  // ----- Comptes -----

  async listAccounts(): Promise<Account[]> {
    const rows = await Db.select<AccountRow>(
      'SELECT id, code, name, color, initial_balance FROM accounts ORDER BY code'
    );
    return rows.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      color: r.color,
      initialBalance: r.initial_balance,
    }));
  },

  async createAccount(input: {
    code: string;
    name: string;
    color: string;
    initialBalance?: number;
  }): Promise<number> {
    return withLog('ConfigService.createAccount', async () => {
      const result = await Db.execute(
        'INSERT INTO accounts (code, name, color, initial_balance) VALUES (?, ?, ?, ?)',
        [input.code.trim(), input.name.trim(), input.color, input.initialBalance ?? 0]
      );
      return result.lastInsertId ?? 0;
    }, { data: { code: input.code } });
  },

  async updateAccount(
    id: number,
    fields: { code?: string; name?: string; color?: string; initialBalance?: number }
  ): Promise<void> {
    return withLog('ConfigService.updateAccount', async () => {
      const sets: string[] = [];
      const params: unknown[] = [];
      if (fields.code !== undefined) {
        sets.push('code = ?');
        params.push(fields.code.trim());
      }
      if (fields.name !== undefined) {
        sets.push('name = ?');
        params.push(fields.name.trim());
      }
      if (fields.color !== undefined) {
        sets.push('color = ?');
        params.push(fields.color);
      }
      if (fields.initialBalance !== undefined) {
        sets.push('initial_balance = ?');
        params.push(fields.initialBalance);
      }
      if (sets.length === 0) return;
      params.push(id);
      await Db.execute(`UPDATE accounts SET ${sets.join(', ')} WHERE id = ?`, params);
    }, { data: { id } });
  },

  /** Supprime un compte ET ses transactions (cascade SQL). */
  async deleteAccount(id: number): Promise<void> {
    return withLog('ConfigService.deleteAccount', async () => {
      await Db.execute('DELETE FROM accounts WHERE id = ?', [id]);
    }, { data: { id } });
  },

  async countTransactionsForAccount(id: number): Promise<number> {
    const rows = await Db.select<{ n: number }>(
      'SELECT COUNT(*) AS n FROM transactions WHERE account_id = ? AND ' + sqlTxActive(),
      [id]
    );
    return rows[0]?.n ?? 0;
  },

  // ----- Catégories -----

  async listCategories(): Promise<Category[]> {
    const rows = await Db.select<CategoryRow>(
      'SELECT id, code, name, color, group_id FROM categories ORDER BY code'
    );
    return rows.map(mapCategory);
  },

  async createCategory(input: {
    code: string;
    name: string;
    color: string;
    groupId?: number | null;
  }): Promise<void> {
    return withLog('ConfigService.createCategory', async () => {
      const code = input.code.trim().toUpperCase();
      await Db.execute(
        'INSERT INTO categories (code, name, color, group_id) VALUES (?, ?, ?, ?)',
        [
          code,
          input.name.trim(),
          isTransferCategory(code) ? '#ffffff' : input.color,
          input.groupId ?? null,
        ]
      );
    }, { data: { code: input.code } });
  },

  async updateCategory(
    id: number,
    fields: { code?: string; name?: string; color?: string; groupId?: number | null }
  ): Promise<void> {
    return withLog('ConfigService.updateCategory', async () => {
      const current = await Db.select<CategoryRow>(
        'SELECT id, code, name, color, group_id FROM categories WHERE id = ?',
        [id]
      );
      const oldCode = current[0]?.code;
      const sets: string[] = [];
      const params: unknown[] = [];
      const transferLocked = isTransferCategory(oldCode);
      if (fields.code !== undefined && !transferLocked) {
        sets.push('code = ?');
        params.push(fields.code.trim());
      }
      if (fields.name !== undefined && !transferLocked) {
        sets.push('name = ?');
        params.push(fields.name.trim());
      }
      if (fields.color !== undefined && !transferLocked) {
        sets.push('color = ?');
        params.push(fields.color);
      }
      if (fields.groupId !== undefined) {
        sets.push('group_id = ?');
        params.push(fields.groupId);
      }
      if (sets.length === 0) return;
      params.push(id);
      await Db.execute(`UPDATE categories SET ${sets.join(', ')} WHERE id = ?`, params);
      // Répercute un changement de code sur les transactions déjà catégorisées
      if (fields.code !== undefined && oldCode && fields.code.trim() !== oldCode) {
        await Db.execute('UPDATE transactions SET category_code = ? WHERE category_code = ?', [
          fields.code.trim(),
          oldCode,
        ]);
        await Db.execute('UPDATE autocat_stats SET category_code = ? WHERE category_code = ?', [
          fields.code.trim(),
          oldCode,
        ]);
      }
    }, { data: { id } });
  },

  async applyAccountColors(updates: Array<{ code: string; color: string }>): Promise<void> {
    return withLog('ConfigService.applyAccountColors', async () => {
      await Db.inTransaction('ConfigService.applyAccountColors', async () => {
        for (const update of updates) {
          await Db.execute('UPDATE accounts SET color = ? WHERE code = ?', [update.color, update.code]);
        }
      });
    }, { data: { count: updates.length } });
  },

  async applyCategoryColors(updates: Array<{ code: string; color: string }>): Promise<void> {
    return withLog('ConfigService.applyCategoryColors', async () => {
      await Db.inTransaction('ConfigService.applyCategoryColors', async () => {
        for (const update of updates) {
          if (isTransferCategory(update.code)) continue;
          await Db.execute('UPDATE categories SET color = ? WHERE code = ?', [update.color, update.code]);
        }
      });
    }, { data: { count: updates.length } });
  },

  async categoryNets(): Promise<Record<string, number>> {
    return withLog('ConfigService.categoryNets', async () => {
      const rows = await Db.select<{ code: string; net: number }>(
        `SELECT c.code, COALESCE(SUM(t.debit + t.credit), 0) AS net
         FROM categories c
         LEFT JOIN transactions t ON t.category_code = c.code AND ${sqlTxActive('t')}
         GROUP BY c.code`
      );
      return Object.fromEntries(rows.map((row) => [row.code, Number(row.net)]));
    });
  },

  async accountNets(): Promise<Record<string, number>> {
    return withLog('ConfigService.accountNets', async () => {
      const rows = await Db.select<{ code: string; net: number }>(
        `SELECT a.code,
                a.initial_balance + COALESCE(SUM(t.debit + t.credit), 0) AS net
         FROM accounts a
         LEFT JOIN transactions t ON t.account_id = a.id AND ${sqlTxActive('t')}
         GROUP BY a.id`
      );
      return Object.fromEntries(rows.map((row) => [row.code, Number(row.net)]));
    });
  },

  /** Supprime une catégorie ; les transactions concernées redeviennent non catégorisées. */
  async deleteCategory(id: number): Promise<void> {
    return withLog('ConfigService.deleteCategory', async () => {
      const rows = await Db.select<CategoryRow>('SELECT code FROM categories WHERE id = ?', [id]);
      const code = rows[0]?.code;
      if (isTransferCategory(code)) {
        throw new Error(i18n.t('errors.categoryXProtected'));
      }
      await Db.execute('DELETE FROM categories WHERE id = ?', [id]);
      if (code) {
        await Db.execute('UPDATE transactions SET category_code = NULL WHERE category_code = ?', [
          code,
        ]);
        await Db.execute('DELETE FROM autocat_stats WHERE category_code = ?', [code]);
        await Db.execute('DELETE FROM label_rules WHERE category_code = ?', [code]);
      }
    }, { data: { id } });
  },

  // ----- Regroupements de catégories -----

  async listCategoryGroups(): Promise<CategoryGroup[]> {
    const rows = await Db.select<CategoryGroupRow>(
      'SELECT id, name, color, sort_order FROM category_groups ORDER BY sort_order, name'
    );
    return rows.map(mapCategoryGroup);
  },

  async createCategoryGroup(input: { name: string; color: string }): Promise<number> {
    return withLog('ConfigService.createCategoryGroup', async () => {
      const maxRows = await Db.select<{ n: number }>(
        'SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM category_groups'
      );
      const result = await Db.execute(
        'INSERT INTO category_groups (name, color, sort_order) VALUES (?, ?, ?)',
        [input.name.trim(), input.color, maxRows[0]?.n ?? 0]
      );
      return result.lastInsertId ?? 0;
    }, { data: { name: input.name } });
  },

  async updateCategoryGroup(
    id: number,
    fields: { name?: string; color?: string; sortOrder?: number }
  ): Promise<void> {
    return withLog('ConfigService.updateCategoryGroup', async () => {
      const sets: string[] = [];
      const params: unknown[] = [];
      if (fields.name !== undefined) {
        sets.push('name = ?');
        params.push(fields.name.trim());
      }
      if (fields.color !== undefined) {
        sets.push('color = ?');
        params.push(fields.color);
      }
      if (fields.sortOrder !== undefined) {
        sets.push('sort_order = ?');
        params.push(fields.sortOrder);
      }
      if (sets.length === 0) return;
      params.push(id);
      await Db.execute(`UPDATE category_groups SET ${sets.join(', ')} WHERE id = ?`, params);
    }, { data: { id } });
  },

  async deleteCategoryGroup(id: number): Promise<void> {
    return withLog('ConfigService.deleteCategoryGroup', async () => {
      await Db.execute('UPDATE categories SET group_id = NULL WHERE group_id = ?', [id]);
      await Db.execute('DELETE FROM category_groups WHERE id = ?', [id]);
    }, { data: { id } });
  },
};
