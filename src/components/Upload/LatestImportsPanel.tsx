import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Settings, ChevronDown, ChevronRight, Trash2 } from 'lucide-react';

export interface LatestImportsGroup {
  account: { id: number; code: string; name: string; color: string; initialBalance: number };
  imports: Array<{ id: number; filename: string; accountId: number; dateStart: string | null; dateEnd: string | null; rowCount: number; importedAt: string }>;
}

interface Props {
  groups: LatestImportsGroup[];
  onEditAccount: (group: LatestImportsGroup) => void;
  onDeleteImport?: (importId: number, filename: string) => void;
  canEditData: boolean;
}

function formatDate(iso: string | null): string {
  if (!iso) return '?';
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return iso;
}

const LatestImportsPanel: React.FC<Props> = ({ groups, onEditAccount, onDeleteImport, canEditData }) => {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const toggle = (code: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  if (groups.length === 0) {
    return (
      <div className="ct-card self-start w-full lg:sticky lg:top-6 lg:max-h-[calc(100dvh-180px)] lg:overflow-auto">
        <h3 className="ct-section-title">{t('upload.latestDataTitle')}</h3>
        <p className="ct-hint">{t('upload.latestDataEmpty')}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 self-start w-full lg:sticky lg:top-6 lg:max-h-[calc(100dvh-180px)] lg:overflow-auto lg:pr-1 min-h-0">
      <h3 className="text-sm font-semibold shrink-0" style={{ color: 'var(--invoicing-gray-800)' }}>
        {t('upload.latestDataTitle')} · {groups.length} compte(s)
      </h3>
      {groups.map((g) => {
        const totalRows = g.imports.reduce((s, r) => s + r.rowCount, 0);
        const starts = g.imports.map((r) => r.dateStart).filter(Boolean) as string[];
        const ends = g.imports.map((r) => r.dateEnd).filter(Boolean) as string[];
        const earliest = starts.length ? starts.slice().sort()[0] : null;
        const latest = ends.length ? ends.slice().sort().pop() ?? null : null;
        const isOpen = expanded.has(g.account.code);
        const hasData = g.imports.length > 0;
        return (
          <div key={g.account.code} className="ct-card !p-0 overflow-hidden">
            {/* Ligne rétractable : 1 ligne compacte en mode replié */}
            <button
              type="button"
              onClick={() => hasData && toggle(g.account.code)}
              className={`w-full flex items-center gap-2 px-3 py-2.5 text-left ${hasData ? 'cursor-pointer hover:opacity-90' : 'cursor-default'}`}
              style={{ backgroundColor: isOpen ? 'var(--invoicing-primary-lightest)' : 'transparent' }}
              title={hasData ? (isOpen ? t('common.hide') : t('common.showDetails')) : undefined}
            >
              <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: g.account.color }} />
              <span className="font-semibold text-sm shrink-0" style={{ color: 'var(--invoicing-gray-900)' }}>
                {g.account.code}
              </span>
              <span className="text-sm truncate flex-1" style={{ color: 'var(--invoicing-gray-600)' }} title={g.account.name}>
                {g.account.name}
              </span>
              <span className="text-xs shrink-0 hidden xl:inline" style={{ color: 'var(--invoicing-gray-500)' }}>
                {g.imports.length} imp. · {totalRows} l.
              </span>
              {hasData ? (
                <span className="shrink-0" style={{ color: 'var(--invoicing-gray-400)' }}>
                  {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </span>
              ) : (
                <span className="text-xs shrink-0" style={{ color: 'var(--invoicing-gray-400)' }}>
                  —
                </span>
              )}
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  onEditAccount(g);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.stopPropagation();
                    onEditAccount(g);
                  }
                }}
                className="ct-btn-icon !p-1 shrink-0"
                title={t('common.settings')}
              >
                <Settings size={14} />
              </span>
            </button>

            {/* Bande dates : 1 ligne claire, petit écart sous le bouton */}
            {hasData ? (
              <div className={`px-3 flex items-center gap-2 text-xs whitespace-nowrap overflow-hidden ${isOpen ? 'py-1.5 border-t' : 'pb-2'}`} style={isOpen ? { borderColor: 'var(--invoicing-gray-200)', backgroundColor: 'var(--invoicing-gray-50)', color: 'var(--invoicing-gray-600)' } : { color: 'var(--invoicing-gray-600)' }}>
                <span>{t('upload.startDate')} <strong style={{ color: 'var(--invoicing-gray-900)' }}>{formatDate(earliest)}</strong></span>
                <span style={{ color: 'var(--invoicing-gray-400)' }}>→</span>
                <span>{t('upload.endDate')} <strong style={{ color: 'var(--invoicing-gray-900)' }}>{formatDate(latest)}</strong></span>
                <span className="ml-auto shrink-0" style={{ color: 'var(--invoicing-gray-500)' }}>{g.imports.length} imp. · {totalRows} l.</span>
              </div>
            ) : (
              <div className="px-3 pb-2 text-xs" style={{ color: 'var(--invoicing-gray-400)' }}>{t('upload.noImportForAccount')}</div>
            )}

            {isOpen && hasData && (
              <div className="border-t" style={{ borderColor: 'var(--invoicing-gray-200)' }}>
                <ul className="divide-y" style={{ borderColor: 'var(--invoicing-gray-100)' }}>
                  {g.imports.map((imp) => (
                    <li key={imp.id} className="px-3 py-2 flex items-start justify-between gap-2 text-xs">
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium" style={{ color: 'var(--invoicing-gray-800)' }} title={imp.filename}>
                          {imp.filename}
                        </div>
                        <div className="flex flex-wrap items-center gap-1 mt-0.5" style={{ color: 'var(--invoicing-gray-500)' }}>
                          <span className="px-1.5 py-0 rounded text-[11px]" style={{ backgroundColor: 'var(--invoicing-gray-100)' }}>
                            {formatDate(imp.dateStart)}
                          </span>
                          <span>→</span>
                          <span className="px-1.5 py-0 rounded text-[11px]" style={{ backgroundColor: 'var(--invoicing-gray-100)' }}>
                            {formatDate(imp.dateEnd)}
                          </span>
                          <span>· {imp.rowCount} l.</span>
                        </div>
                      </div>
                      {canEditData && onDeleteImport && (
                        <button type="button" className="ct-btn-icon !p-1 shrink-0 mt-1" title={t('common.delete')} onClick={() => onDeleteImport(imp.id, imp.filename)}>
                          <Trash2 size={14} />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
                {!canEditData && (
                  <p className="ct-hint px-3 py-2 text-xs border-t" style={{ borderColor: 'var(--invoicing-gray-100)' }}>
                    {t('upload.editDataFamilialeOnly')}
                  </p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default LatestImportsPanel;
