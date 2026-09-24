import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import { AlertTriangle, Link2, Plus } from 'lucide-react';
import { Account } from '../../types/models';
import {
  AccountValueStats,
  suggestAccountDraft,
} from '../../services/AccountImportService';
import { ConfigService } from '../../services/ConfigService';
import { Logger, withLog } from '../../services/logger';
import { parseAmount } from '../../utils/amounts';

type Mode = 'create' | 'link';

interface DraftRow {
  mode: Mode;
  code: string;
  name: string;
  color: string;
  initialBalance: string;
  linkId: number | '';
}

interface MissingAccountsStepProps {
  missing: AccountValueStats[];
  accounts: Account[];
  onResolved: (valueToId: Record<string, number>, valueToCode: Record<string, string>) => void;
  onBack: () => void;
  onIgnore?: () => void;
  ignoreHint?: string;
}

function buildInitialDrafts(missing: AccountValueStats[]): Record<string, DraftRow> {
  const drafts: Record<string, DraftRow> = {};
  for (const item of missing) {
    const suggested = suggestAccountDraft(item.raw);
    drafts[item.raw] = {
      mode: 'create',
      code: suggested.code,
      name: suggested.name,
      color: '#4a90e2',
      initialBalance: '0',
      linkId: '',
    };
  }
  return drafts;
}

const MissingAccountsStep: React.FC<MissingAccountsStepProps> = ({
  missing,
  accounts,
  onResolved,
  onBack,
  onIgnore,
  ignoreHint,
}) => {
  const { t } = useTranslation();
  const [drafts, setDrafts] = useState<Record<string, DraftRow>>(() => buildInitialDrafts(missing));
  const [localAccounts, setLocalAccounts] = useState(accounts);
  const [busy, setBusy] = useState(false);

  const updateDraft = (raw: string, patch: Partial<DraftRow>) => {
    setDrafts((prev) => ({ ...prev, [raw]: { ...prev[raw], ...patch } }));
  };

  const isRowValid = (draft: DraftRow | undefined): boolean => {
    if (!draft) return false;
    if (draft.mode === 'link') return draft.linkId !== '';
    return Boolean(draft.code.trim() && draft.name.trim());
  };

  const allValid = missing.every((item) => isRowValid(drafts[item.raw]));

  const handleConfirm = async () => {
    if (!allValid || busy) return;
    setBusy(true);
    try {
      const result = await withLog('MissingAccountsStep.confirm', async () => {
        const valueToId: Record<string, number> = {};
        const valueToCode: Record<string, string> = {};
        let working = [...localAccounts];
        const usedCodes = new Set(working.map((a) => a.code.toUpperCase()));

        for (const item of missing) {
          const draft = drafts[item.raw];
          if (draft.mode === 'link') {
            const linked = working.find((a) => a.id === draft.linkId);
            if (!linked) throw new Error('linked account missing');
            valueToId[item.raw] = linked.id;
            valueToCode[item.raw] = linked.code;
            continue;
          }

          let code = draft.code.trim().toUpperCase();
          if (usedCodes.has(code)) {
            let suffix = 2;
            while (usedCodes.has(`${code}${suffix}`)) suffix += 1;
            code = `${code}${suffix}`;
          }

          const newId = await ConfigService.createAccount({
            code,
            name: draft.name.trim(),
            color: draft.color,
            initialBalance: parseAmount(draft.initialBalance),
          });
          usedCodes.add(code);
          working = [
            ...working,
            {
              id: newId,
              code,
              name: draft.name.trim(),
              color: draft.color,
              initialBalance: parseAmount(draft.initialBalance),
            },
          ];
          valueToId[item.raw] = newId;
          valueToCode[item.raw] = code;
        }

        setLocalAccounts(working);
        return { valueToId, valueToCode };
      });

      onResolved(result.valueToId, result.valueToCode);
    } catch (err) {
      Logger.error('MissingAccountsStep.confirm', err);
      toast.error(t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ct-card space-y-6">
      <div>
        <h2 className="ct-section-title m-0">{t('upload.accounts.title')}</h2>
        <p className="ct-hint mt-1">{t('upload.accounts.subtitle', { count: missing.length })}</p>
      </div>

      <div className="upload-info-banner warn flex gap-3 items-start">
        <AlertTriangle size={18} className="shrink-0 mt-0.5" />
        <p className="text-sm m-0">{t('upload.accounts.hint')}</p>
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
                    {t('upload.accounts.occurrences', { count: item.count })}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className={`ct-btn-secondary text-sm ${draft.mode === 'create' ? 'is-active-mode' : ''}`}
                    onClick={() => updateDraft(item.raw, { mode: 'create' })}
                  >
                    <Plus size={14} />
                    {t('upload.accounts.create')}
                  </button>
                  <button
                    type="button"
                    className={`ct-btn-secondary text-sm ${draft.mode === 'link' ? 'is-active-mode' : ''}`}
                    onClick={() => updateDraft(item.raw, { mode: 'link' })}
                  >
                    <Link2 size={14} />
                    {t('upload.accounts.link')}
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
                    {t('settings.accounts.initialBalance')}
                    <input
                      className="ct-input w-full mt-1"
                      value={draft.initialBalance}
                      onChange={(e) => updateDraft(item.raw, { initialBalance: e.target.value })}
                    />
                  </label>
                </div>
              ) : (
                <label className="ct-label block">
                  {t('upload.accounts.linkTo')}
                  <select
                    className="ct-select w-full mt-1"
                    value={draft.linkId === '' ? '' : String(draft.linkId)}
                    onChange={(e) =>
                      updateDraft(item.raw, {
                        linkId: e.target.value ? Number(e.target.value) : '',
                      })
                    }
                  >
                    <option value="">{t('upload.accounts.chooseExisting')}</option>
                    {localAccounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.code} — {acc.name}
                      </option>
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
          {t('upload.accounts.continue')}
        </button>
      </div>
    </div>
  );
};

export default MissingAccountsStep;
