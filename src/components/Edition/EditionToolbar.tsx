import React from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Sparkles, Copy, Undo2, Redo2, Bookmark } from 'lucide-react';
import { Account, Category } from '../../types/models';
import FilterPanels from './FilterPanels';

interface EditionToolbarProps {
  accounts: Account[];
  categories: Category[];
  selectedAccounts: number[];
  selectedCategories: string[];
  uncategorizedOnly: boolean;
  dateStart: string;
  dateEnd: string;
  search: string;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onAddRow: () => void;
  onAutocat: () => void;
  onRoutineLabel: () => void;
  onDuplicates: () => void;
  onAccounts: (ids: number[]) => void;
  onCategories: (codes: string[]) => void;
  onUncategorized: (value: boolean) => void;
  onDates: (start: string, end: string) => void;
  onSearch: (value: string) => void;
}

const EditionToolbar: React.FC<EditionToolbarProps> = ({
  accounts,
  categories,
  selectedAccounts,
  selectedCategories,
  uncategorizedOnly,
  dateStart,
  dateEnd,
  search,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onAddRow,
  onAutocat,
  onRoutineLabel,
  onDuplicates,
  onAccounts,
  onCategories,
  onUncategorized,
  onDates,
  onSearch,
}) => {
  const { t } = useTranslation();

  return (
    <div className="edition-toolbar">
      <div className="edition-toolbar-row">
        <div className="edition-toolbar-actions">
          <div className="edition-toolbar-history">
            <button
              type="button"
              className="edition-toolbar-btn edition-toolbar-btn-icon"
              onClick={onUndo}
              disabled={!canUndo}
              title={`${t('edition.undo')} (Ctrl+Z)`}
              aria-label={t('edition.undo')}
            >
              <Undo2 size={14} />
            </button>
            <button
              type="button"
              className="edition-toolbar-btn edition-toolbar-btn-icon"
              onClick={onRedo}
              disabled={!canRedo}
              title={`${t('edition.redo')} (Ctrl+Y)`}
              aria-label={t('edition.redo')}
            >
              <Redo2 size={14} />
            </button>
          </div>
          <button type="button" className="edition-toolbar-btn edition-toolbar-btn-icon" onClick={onAddRow} title={t('edition.addRow')} aria-label={t('edition.addRow')}>
            <Plus size={14} />
          </button>
          <button type="button" className="edition-toolbar-btn edition-toolbar-btn-icon" onClick={onAutocat} title={t('edition.autocat')} aria-label={t('edition.autocat')}>
            <Sparkles size={14} />
          </button>
          <button type="button" className="edition-toolbar-btn edition-toolbar-btn-icon" onClick={onRoutineLabel} title={t('edition.routineLabelToolbar')} aria-label={t('edition.routineLabelToolbar')}>
            <Bookmark size={14} />
          </button>
          <button type="button" className="edition-toolbar-btn edition-toolbar-btn-icon" onClick={onDuplicates} title={t('edition.duplicates')} aria-label={t('edition.duplicates')}>
            <Copy size={14} />
          </button>
        </div>
        <input
          className="edition-toolbar-search"
          placeholder={t('common.search')}
          value={search}
          onChange={(e) => onSearch(e.target.value)}
        />
        <FilterPanels
          accounts={accounts}
          categories={categories}
          selectedAccounts={selectedAccounts}
          selectedCategories={selectedCategories}
          uncategorizedOnly={uncategorizedOnly}
          dateStart={dateStart}
          dateEnd={dateEnd}
          onAccounts={onAccounts}
          onCategories={onCategories}
          onUncategorized={onUncategorized}
          onDates={onDates}
        />
      </div>
    </div>
  );
};

export default EditionToolbar;
