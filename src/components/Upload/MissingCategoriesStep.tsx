import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import { AlertTriangle, Link2, Plus } from 'lucide-react';
import { Category, CategoryGroup } from '../../types/models';
import {
  CategoryValueStats,
  suggestCategoryDraft,
} from '../../services/CategoryImportService';
import { ConfigService } from '../../services/ConfigService';
import { Logger, withLog } from '../../services/logger';
import { organizeCategoriesByGroup } from '../../utils/categoryGroups';

type Mode = 'create' | 'link';

interface DraftRow {
  mode: Mode;
  code: string;
  name: string;
  color: string;
  groupId: number | null;
  linkCode: string;
  creatingGroup: boolean;
  newGroupName: string;
  newGroupColor: string;
}

interface MissingCategoriesStepProps {
  missing: CategoryValueStats[];
  categories: Category[];
  groups: CategoryGroup[];
  onResolved: (valueToCode: Record<string, string>) => void;
  onBack: () => void;
  onIgnore?: () => void;
  ignoreHint?: string;
}

function buildInitialDrafts(missing: CategoryValueStats[]): Record<string, DraftRow> {
  const drafts: Record<string, DraftRow> = {};
  for (const item of missing) {
    const suggested = suggestCategoryDraft(item.raw);
    drafts[item.raw] = {
      mode: 'create',
      code: suggested.code,
      name: suggested.name,
      color: '#94a3b8',
      groupId: null,
      linkCode: '',
      creatingGroup: false,
      newGroupName: '',
      newGroupColor: '#64748b',
    };
  }
  return drafts;
}

const MissingCategoriesStep: React.FC<MissingCategoriesStepProps> = ({
  missing,
  categories,
  groups,
  onResolved,
  onBack,
  onIgnore,
  ignoreHint,
}) => {
  const { t } = useTranslation();
  const [drafts, setDrafts] = useState<Record<string, DraftRow>>(() => buildInitialDrafts(missing));
  const [localGroups, setLocalGroups] = useState(groups);
  const [localCategories, setLocalCategories] = useState(categories);
  const [busy, setBusy] = useState(false);

  const sections = useMemo(
    () => organizeCategoriesByGroup(localCategories, localGroups),
    [localCategories, localGroups]
  );

  const updateDraft = (raw: string, patch: Partial<DraftRow>) => {
    setDrafts((prev) => ({ ...prev, [raw]: { ...prev[raw], ...patch } }));
  };

  const isRowValid = (draft: DraftRow | undefined): boolean => {
    if (!draft) return false;
    if (draft.mode === 'link') return Boolean(draft.linkCode.trim());
    if (!draft.code.trim() || !draft.name.trim()) return false;
    if (draft.creatingGroup && !draft.newGroupName.trim()) return false;
    return true;
  };

  const allValid = missing.every((item) => isRowValid(drafts[item.raw]));

  const handleConfirm = async () => {
    if (!allValid || busy) return;
    setBusy(true);
    try {
      const valueToCode = await withLog('MissingCategoriesStep.confirm', async () => {
        const map: Record<string, string> = {};
        let workingGroups = [...localGroups];
        const usedCodes = new Set(localCategories.map((c) => c.code.toUpperCase()));

        for (const item of missing) {
          const draft = drafts[item.raw];
          if (draft.mode === 'link') {
            map[item.raw] = draft.linkCode.trim().toUpperCase();
            continue;
          }

          let groupId = draft.groupId;
          if (draft.creatingGroup && draft.newGroupName.trim()) {
            const newId = await ConfigService.createCategoryGroup({
              name: draft.newGroupName.trim(),
              color: draft.newGroupColor,
            });
            groupId = newId;
            workingGroups = [
              ...workingGroups,
              {
                id: newId,
                name: draft.newGroupName.trim(),
                color: draft.newGroupColor,
                sortOrder: workingGroups.length,
              },
            ];
          }

          let code = draft.code.trim().toUpperCase();
          if (usedCodes.has(code)) {
            let suffix = 2;
            while (usedCodes.has(`${code}${suffix}`)) suffix += 1;
            code = `${code}${suffix}`;
          }

          await ConfigService.createCategory({
            code,
            name: draft.name.trim(),
            color: draft.color,
            groupId,
          });
          usedCodes.add(code);
          map[item.raw] = code;
        }

        setLocalGroups(workingGroups);
        const refreshed = await ConfigService.listCategories();
        setLocalCategories(refreshed);
        return map;
      });

      onResolved(valueToCode);
    } catch (err) {
      Logger.error('MissingCategoriesStep.confirm', err);
      toast.error(t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ct-card space-y-6">
      <div>
        <h2 className="ct-section-title m-0">{t('upload.categories.title')}</h2>
        <p className="ct-hint mt-1">{t('upload.categories.subtitle', { count: missing.length })}</p>
      </div>

      <div className="upload-info-banner warn flex gap-3 items-start">
        <AlertTriangle size={18} className="shrink-0 mt-0.5" />
        <p className="text-sm m-0">{t('upload.categories.hint')}</p>
      </div>

      <div className="space-y-4">
        {missing.map((item) => {
          const draft = drafts[item.raw];
          if (!draft) return null;
          return (
            <div key={item.raw} className="upload-missing-cat-card">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <div>
                  <div className="font-semibold" style={{ color: 'var(--invoicing-gray-900)' }}>
                    {item.raw}
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: 'var(--invoicing-gray-500)' }}>
                    {t('upload.categories.occurrences', { count: item.count })}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className={`ct-btn-secondary text-sm ${draft.mode === 'create' ? 'is-active-mode' : ''}`}
                    onClick={() => updateDraft(item.raw, { mode: 'create' })}
                  >
                    <Plus size={14} />
                    {t('upload.categories.create')}
                  </button>
                  <button
                    type="button"
                    className={`ct-btn-secondary text-sm ${draft.mode === 'link' ? 'is-active-mode' : ''}`}
                    onClick={() => updateDraft(item.raw, { mode: 'link' })}
                  >
                    <Link2 size={14} />
                    {t('upload.categories.link')}
                  </button>
                </div>
              </div>

              {draft.mode === 'create' ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="ct-label">
                    {t('common.code')}
                    <input
                      className="ct-input w-full mt-1"
                      value={draft.code}
                      onChange={(e) => updateDraft(item.raw, { code: e.target.value })}
                    />
                  </label>
                  <label className="ct-label">
                    {t('common.name')}
                    <input
                      className="ct-input w-full mt-1"
                      value={draft.name}
                      onChange={(e) => updateDraft(item.raw, { name: e.target.value })}
                    />
                  </label>
                  <label className="ct-label">
                    {t('common.color')}
                    <input
                      type="color"
                      className="mt-1 h-10 w-16"
                      value={draft.color}
                      onChange={(e) => updateDraft(item.raw, { color: e.target.value })}
                    />
                  </label>
                  <label className="ct-label">
                    {t('settings.categories.group')}
                    <select
                      className="ct-select w-full mt-1"
                      value={
                        draft.creatingGroup
                          ? '__new__'
                          : draft.groupId != null
                            ? String(draft.groupId)
                            : ''
                      }
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === '__new__') {
                          updateDraft(item.raw, { creatingGroup: true, groupId: null });
                        } else {
                          updateDraft(item.raw, {
                            creatingGroup: false,
                            groupId: v ? Number(v) : null,
                          });
                        }
                      }}
                    >
                      <option value="">{t('settings.categories.noGroup')}</option>
                      {localGroups.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name}
                        </option>
                      ))}
                      <option value="__new__">{t('upload.categories.newGroup')}</option>
                    </select>
                  </label>
                  {draft.creatingGroup && (
                    <>
                      <label className="ct-label">
                        {t('upload.categories.newGroupName')}
                        <input
                          className="ct-input w-full mt-1"
                          value={draft.newGroupName}
                          onChange={(e) =>
                            updateDraft(item.raw, { newGroupName: e.target.value })
                          }
                        />
                      </label>
                      <label className="ct-label">
                        {t('upload.categories.newGroupColor')}
                        <input
                          type="color"
                          className="mt-1 h-10 w-16"
                          value={draft.newGroupColor}
                          onChange={(e) =>
                            updateDraft(item.raw, { newGroupColor: e.target.value })
                          }
                        />
                      </label>
                    </>
                  )}
                </div>
              ) : (
                <label className="ct-label block">
                  {t('upload.categories.linkTo')}
                  <select
                    className="ct-select w-full mt-1"
                    value={draft.linkCode}
                    onChange={(e) => updateDraft(item.raw, { linkCode: e.target.value })}
                  >
                    <option value="">{t('upload.categories.chooseExisting')}</option>
                    {sections.map((section) => (
                      <optgroup
                        key={section.group?.id ?? 'ungrouped'}
                        label={
                          section.group?.name ?? t('settings.categories.noGroup')
                        }
                      >
                        {section.categories.map((cat) => (
                          <option key={cat.id} value={cat.code}>
                            {cat.code} — {cat.name}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </label>
              )}
            </div>
          );
        })}
      </div>

      {ignoreHint && <p className="ct-hint">{ignoreHint}</p>}

      <div
        className="flex flex-wrap justify-end gap-3 pt-4"
        style={{ borderTop: '1px solid var(--invoicing-gray-200)' }}
      >
        <button className="ct-btn-secondary" onClick={onBack} disabled={busy}>
          {t('common.cancel')}
        </button>
        {onIgnore && (
          <button className="ct-btn-secondary" onClick={onIgnore} disabled={busy}>
            {t('upload.ignoreThisImport')}
          </button>
        )}
        <button
          className="ct-btn-primary"
          disabled={!allValid || busy}
          onClick={() => void handleConfirm()}
        >
          {t('upload.categories.continue')}
        </button>
      </div>
    </div>
  );
};

export default MissingCategoriesStep;
