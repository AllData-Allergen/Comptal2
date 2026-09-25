import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckSquare, SquareX } from 'lucide-react';
import { Account, Category } from '../../types/models';
import { CategorySwatch } from '../Common/CategoryX';

type FilterTab = 'accounts' | 'categories' | 'period';

interface FilterPanelsProps {
  accounts: Account[];
  categories: Category[];
  selectedAccounts: number[];
  selectedCategories: string[];
  uncategorizedOnly: boolean;
  dateStart: string;
  dateEnd: string;
  onAccounts: (ids: number[]) => void;
  onCategories: (codes: string[]) => void;
  onUncategorized: (value: boolean) => void;
  onDates: (start: string, end: string) => void;
}

const NONE = '*';

const FilterPanels: React.FC<FilterPanelsProps> = ({
  accounts,
  categories,
  selectedAccounts,
  selectedCategories,
  uncategorizedOnly,
  dateStart,
  dateEnd,
  onAccounts,
  onCategories,
  onUncategorized,
  onDates,
}) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<FilterTab>('categories');

  const toggle = <T,>(list: T[], value: T, set: (next: T[]) => void) => {
    set(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  };

  const isAccountNone = selectedAccounts.length === 1 && selectedAccounts[0] === (NONE as unknown as number);
  const isCategoryNone = selectedCategories.length === 1 && selectedCategories[0] === NONE;

  const isAccountSelected = (id: number) =>
    !isAccountNone && (selectedAccounts.length === 0 || selectedAccounts.includes(id));

  const isCategorySelected = (code: string) =>
    !isCategoryNone && (selectedCategories.length === 0 || selectedCategories.includes(code));

  const accountsAllSelected = !isAccountNone && (selectedAccounts.length === 0);
  const categoriesAllSelected = !isCategoryNone && (selectedCategories.length === 0);

  const toggleAllAccounts = () => {
    onAccounts(accountsAllSelected ? [NONE as unknown as number] : []);
  };

  const toggleAllCategories = () => {
    if (uncategorizedOnly) return;
    onCategories(categoriesAllSelected ? [NONE] : []);
  };

  const navButton = (tab: FilterTab, label: string) => (
    <button
      type="button"
      className={`edition-filter-nav-button${activeTab === tab ? ' active' : ''}`}
      onClick={() => setActiveTab(tab)}
    >
      {label}
    </button>
  );

  return (
    <div className="edition-filters-inline">
      <div className="edition-filter-nav">
        {navButton('accounts', t('upload.account'))}
        {navButton('categories', t('settings.tabs.categories'))}
        {navButton('period', t('edition.period'))}
      </div>
      <div className="edition-filter-strip">
        {activeTab === 'accounts' && (
          <>
            <button
              type="button"
              className="edition-filter-select-all"
              onClick={toggleAllAccounts}
            >
              {accountsAllSelected ? <SquareX size={14} /> : <CheckSquare size={14} />}
              {accountsAllSelected ? t('common.deselectAll') : t('common.selectAll')}
            </button>
            {accounts.map((a) => {
              const selected = isAccountSelected(a.id);
              return (
                <button
                  key={a.id}
                  type="button"
                  className={`edition-filter-chip${selected ? ' selected' : ''}`}
                  onClick={() => {
                    if (selectedAccounts.length === 0) {
                      onAccounts(accounts.filter((x) => x.id !== a.id).map((x) => x.id));
                    } else if (isAccountNone) {
                      onAccounts([a.id]);
                    } else {
                      toggle(selectedAccounts, a.id, onAccounts);
                    }
                  }}
                >
                  <span className="edition-filter-chip-dot" style={{ backgroundColor: a.color }} />
                  {a.code}
                </button>
              );
            })}
          </>
        )}
        {activeTab === 'categories' && (
          <>
            <button
              type="button"
              className={`edition-filter-chip${uncategorizedOnly ? ' selected' : ''}`}
              onClick={() => onUncategorized(!uncategorizedOnly)}
            >
              {t('edition.uncategorizedShort')}
            </button>
            <button
              type="button"
              className="edition-filter-select-all"
              disabled={uncategorizedOnly}
              onClick={toggleAllCategories}
            >
              {categoriesAllSelected ? <SquareX size={14} /> : <CheckSquare size={14} />}
              {categoriesAllSelected ? t('common.deselectAll') : t('common.selectAll')}
            </button>
            {categories.map((c) => {
              const selected = !uncategorizedOnly && isCategorySelected(c.code);
              return (
                <button
                  key={c.code}
                  type="button"
                  disabled={uncategorizedOnly}
                  className={`edition-filter-chip${selected ? ' selected' : ''}${uncategorizedOnly ? ' disabled' : ''}`}
                  onClick={() => {
                    if (selectedCategories.length === 0) {
                      onCategories(categories.filter((x) => x.code !== c.code).map((x) => x.code));
                    } else if (isCategoryNone) {
                      onCategories([c.code]);
                    } else {
                      toggle(selectedCategories, c.code, onCategories);
                    }
                  }}
                >
                  <CategorySwatch code={c.code} color={c.color} className="edition-filter-chip-dot" />
                  {c.code}
                </button>
              );
            })}
          </>
        )}
        {activeTab === 'period' && (
          <div className="edition-filter-period">
            <input
              type="date"
              className="edition-filter-date"
              value={dateStart}
              onChange={(e) => onDates(e.target.value, dateEnd)}
              title={t('edition.dateFrom')}
            />
            <span className="edition-filter-period-sep">→</span>
            <input
              type="date"
              className="edition-filter-date"
              value={dateEnd}
              onChange={(e) => onDates(dateStart, e.target.value)}
              title={t('edition.dateTo')}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default FilterPanels;
