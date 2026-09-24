import {
  DEFAULT_SUBSCRIPTION_COLOR,
  FlowType,
  Periodicity,
  Project,
  ProjectSubscription,
} from '../types/projection';
import {
  DEFAULT_COLUMN_WIDTHS,
  DEFAULT_WIDGET_LAYOUT,
  ForecastWidgetLayout,
  SPLIT_RATIO_STORAGE_KEY,
  clampSplitRatio,
  normalizeForecastColumns,
  normalizeForecastWidgets,
} from '../types/forecast';
import { Db } from './db';
import { withLog } from './logger';

interface ProjectRow {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
  initial_balance: number;
  widget_layout: string | null;
}

interface SubRow {
  id: number;
  project_id: number;
  name: string;
  type: FlowType;
  amount: number;
  periodicity: Periodicity;
  start_date: string;
  end_date: string | null;
  category_code: string | null;
  color: string | null;
  parent_id: number | null;
  is_group: number;
  sort_order: number;
}

function storedSplitRatio(): number | null {
  try {
    const raw = localStorage.getItem(SPLIT_RATIO_STORAGE_KEY);
    if (!raw) return null;
    return clampSplitRatio(Number(raw));
  } catch {
    return null;
  }
}

function parseWidgetLayout(raw: string | null): ForecastWidgetLayout {
  if (!raw) return structuredClone(DEFAULT_WIDGET_LAYOUT);
  try {
    const parsed = JSON.parse(raw) as Partial<ForecastWidgetLayout>;
    if (!parsed?.widgets?.length) return structuredClone(DEFAULT_WIDGET_LAYOUT);
    return {
      chartGranularity: parsed.chartGranularity ?? 'month',
      widgets: normalizeForecastWidgets(parsed.widgets),
      splitRatio: clampSplitRatio(
        parsed.splitRatio ?? storedSplitRatio() ?? DEFAULT_WIDGET_LAYOUT.splitRatio
      ),
      columns: normalizeForecastColumns(parsed.columns),
      columnWidths: { ...DEFAULT_COLUMN_WIDTHS, ...(parsed.columnWidths ?? {}) },
    };
  } catch {
    return structuredClone(DEFAULT_WIDGET_LAYOUT);
  }
}

function mapSub(r: SubRow): ProjectSubscription {
  return {
    id: r.id,
    projectId: r.project_id,
    name: r.name,
    type: r.type,
    amount: r.amount,
    periodicity: r.periodicity,
    startDate: r.start_date,
    endDate: r.end_date,
    categoryCode: r.category_code,
    color: r.color || DEFAULT_SUBSCRIPTION_COLOR,
    parentId: r.parent_id,
    isGroup: r.is_group === 1,
    sortOrder: r.sort_order ?? 0,
  };
}

function buildTree(flat: ProjectSubscription[]): ProjectSubscription[] {
  const byId = new Map<number, ProjectSubscription>();
  for (const sub of flat) {
    byId.set(sub.id, { ...sub, children: [] });
  }

  const wouldCycle = (childId: number, parentId: number): boolean => {
    let current: number | null = parentId;
    const seen = new Set<number>();
    while (current) {
      if (current === childId) return true;
      if (seen.has(current)) return true;
      seen.add(current);
      current = byId.get(current)?.parentId ?? null;
    }
    return false;
  };

  const roots: ProjectSubscription[] = [];
  for (const sub of byId.values()) {
    if (sub.parentId && byId.has(sub.parentId) && !wouldCycle(sub.id, sub.parentId)) {
      const parent = byId.get(sub.parentId)!;
      parent.children = parent.children ?? [];
      parent.children.push(sub);
    } else {
      roots.push(sub);
    }
  }
  const sortNodes = (nodes: ProjectSubscription[]) => {
    nodes.sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
    for (const n of nodes) {
      if (n.children?.length) sortNodes(n.children);
    }
  };
  sortNodes(roots);
  return roots;
}

export type SubscriptionInput = Omit<ProjectSubscription, 'id' | 'children'>;
export type SubscriptionPatch = Partial<Omit<ProjectSubscription, 'id' | 'projectId' | 'children'>>;

export const ProjectService = {
  async list(): Promise<Project[]> {
    const rows = await Db.select<ProjectRow>(
      `SELECT id, name, start_date, end_date, initial_balance, widget_layout
       FROM projects ORDER BY name`
    );
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      startDate: r.start_date,
      endDate: r.end_date,
      initialBalance: r.initial_balance,
      widgetLayout: parseWidgetLayout(r.widget_layout),
    }));
  },

  async get(id: number): Promise<Project | null> {
    const rows = await Db.select<ProjectRow>(
      `SELECT id, name, start_date, end_date, initial_balance, widget_layout
       FROM projects WHERE id = ?`,
      [id]
    );
    const r = rows[0];
    if (!r) return null;
    return {
      id: r.id,
      name: r.name,
      startDate: r.start_date,
      endDate: r.end_date,
      initialBalance: r.initial_balance,
      widgetLayout: parseWidgetLayout(r.widget_layout),
    };
  },

  async create(input: Omit<Project, 'id' | 'widgetLayout'> & { widgetLayout?: ForecastWidgetLayout }): Promise<number> {
    return withLog('ProjectService.create', async () => {
      const layout = JSON.stringify(input.widgetLayout ?? DEFAULT_WIDGET_LAYOUT);
      const res = await Db.execute(
        `INSERT INTO projects (name, start_date, end_date, initial_balance, widget_layout, updated_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'))`,
        [input.name, input.startDate, input.endDate, input.initialBalance, layout]
      );
      return res.lastInsertId ?? 0;
    });
  },

  async update(id: number, fields: Partial<Omit<Project, 'id'>>): Promise<void> {
    return withLog('ProjectService.update', async () => {
      const sets: string[] = ['updated_at = datetime(\'now\')'];
      const params: unknown[] = [];
      if (fields.name !== undefined) {
        sets.push('name = ?');
        params.push(fields.name);
      }
      if (fields.startDate !== undefined) {
        sets.push('start_date = ?');
        params.push(fields.startDate);
      }
      if (fields.endDate !== undefined) {
        sets.push('end_date = ?');
        params.push(fields.endDate);
      }
      if (fields.initialBalance !== undefined) {
        sets.push('initial_balance = ?');
        params.push(fields.initialBalance);
      }
      if (fields.widgetLayout !== undefined) {
        sets.push('widget_layout = ?');
        params.push(
          JSON.stringify({
            ...fields.widgetLayout,
            widgets: normalizeForecastWidgets(fields.widgetLayout.widgets),
          })
        );
      }
      params.push(id);
      await Db.execute(`UPDATE projects SET ${sets.join(', ')} WHERE id = ?`, params);
    });
  },

  async saveWidgetLayout(id: number, layout: ForecastWidgetLayout): Promise<void> {
    return this.update(id, { widgetLayout: layout });
  },

  async loadWidgetLayout(id: number): Promise<ForecastWidgetLayout> {
    const project = await this.get(id);
    return project?.widgetLayout ?? structuredClone(DEFAULT_WIDGET_LAYOUT);
  },

  async remove(id: number): Promise<void> {
    return withLog('ProjectService.remove', async () => {
      await Db.execute('DELETE FROM project_subscriptions WHERE project_id = ?', [id]);
      await Db.execute('DELETE FROM projects WHERE id = ?', [id]);
    });
  },

  async listSubscriptions(projectId: number): Promise<ProjectSubscription[]> {
    const rows = await Db.select<SubRow>(
      `SELECT id, project_id, name, type, amount, periodicity, start_date, end_date,
              category_code, color, parent_id, is_group, sort_order
       FROM project_subscriptions WHERE project_id = ? ORDER BY sort_order, id`,
      [projectId]
    );
    return rows.map(mapSub);
  },

  async listSubscriptionTree(projectId: number): Promise<ProjectSubscription[]> {
    const flat = await this.listSubscriptions(projectId);
    return buildTree(flat);
  },

  async addSubscription(input: SubscriptionInput): Promise<number> {
    return withLog('ProjectService.addSubscription', async () => {
      const res = await Db.execute(
        `INSERT INTO project_subscriptions
         (project_id, name, type, amount, periodicity, start_date, end_date,
          category_code, color, parent_id, is_group, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          input.projectId,
          input.name,
          input.type,
          input.amount,
          input.periodicity,
          input.startDate,
          input.endDate,
          input.categoryCode,
          input.color || DEFAULT_SUBSCRIPTION_COLOR,
          input.parentId,
          input.isGroup ? 1 : 0,
          input.sortOrder,
        ]
      );
      return res.lastInsertId ?? 0;
    });
  },

  async updateSubscription(id: number, fields: SubscriptionPatch): Promise<void> {
    return withLog('ProjectService.updateSubscription', async () => {
      const sets: string[] = [];
      const params: unknown[] = [];
      const map: Array<[keyof SubscriptionPatch, string]> = [
        ['name', 'name'],
        ['type', 'type'],
        ['amount', 'amount'],
        ['periodicity', 'periodicity'],
        ['startDate', 'start_date'],
        ['endDate', 'end_date'],
        ['categoryCode', 'category_code'],
        ['color', 'color'],
        ['parentId', 'parent_id'],
        ['sortOrder', 'sort_order'],
      ];
      for (const [field, col] of map) {
        if (fields[field] !== undefined) {
          sets.push(`${col} = ?`);
          params.push(fields[field]);
        }
      }
      if (fields.isGroup !== undefined) {
        sets.push('is_group = ?');
        params.push(fields.isGroup ? 1 : 0);
      }
      if (sets.length === 0) return;
      params.push(id);
      await Db.execute(`UPDATE project_subscriptions SET ${sets.join(', ')} WHERE id = ?`, params);
    });
  },

  async reorderSubscriptions(orderedIds: number[]): Promise<void> {
    return withLog('ProjectService.reorderSubscriptions', async () => {
      await Db.inTransaction('ProjectService.reorderSubscriptions', async () => {
        for (let i = 0; i < orderedIds.length; i += 1) {
          await Db.execute('UPDATE project_subscriptions SET sort_order = ? WHERE id = ?', [
            i,
            orderedIds[i],
          ]);
        }
      });
    });
  },

  async removeSubscription(id: number): Promise<void> {
    return withLog('ProjectService.removeSubscription', async () => {
      await Db.inTransaction('ProjectService.removeSubscription', async () => {
        const ids: number[] = [];
        const queue = [id];
        while (queue.length > 0) {
          const current = queue.pop()!;
          ids.push(current);
          const children = await Db.select<{ id: number }>(
            'SELECT id FROM project_subscriptions WHERE parent_id = ?',
            [current]
          );
          for (const child of children) {
            queue.push(child.id);
          }
        }
        if (ids.length === 0) return;
        const placeholders = ids.map(() => '?').join(', ');
        await Db.execute(
          `DELETE FROM project_subscriptions WHERE id IN (${placeholders})`,
          ids
        );
      });
    });
  },

  async upsertSubscriptionTree(projectId: number, tree: ProjectSubscription[]): Promise<void> {
    return withLog('ProjectService.upsertSubscriptionTree', async () => {
      await Db.inTransaction('ProjectService.upsertSubscriptionTree', async () => {
        await Db.execute('DELETE FROM project_subscriptions WHERE project_id = ?', [projectId]);
        let order = 0;
        const insertNode = async (node: ProjectSubscription, parentId: number | null) => {
          const res = await Db.execute(
            `INSERT INTO project_subscriptions
             (project_id, name, type, amount, periodicity, start_date, end_date,
              category_code, color, parent_id, is_group, sort_order)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              projectId,
              node.name,
              node.type,
              node.amount,
              node.periodicity,
              node.startDate,
              node.endDate,
              node.categoryCode,
              node.color || DEFAULT_SUBSCRIPTION_COLOR,
              parentId,
              node.isGroup ? 1 : 0,
              order,
            ]
          );
          order += 1;
          const newId = res.lastInsertId ?? 0;
          if (node.children?.length) {
            for (const child of node.children) {
              await insertNode(child, newId);
            }
          }
        };
        for (const root of tree) {
          await insertNode(root, null);
        }
      });
    });
  },
};
