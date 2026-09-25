import React from 'react';
import { useTranslation } from 'react-i18next';
import { CategoryAggregation } from '../../utils/categoryAggregate';

interface CategoryAggToggleProps {
  value: CategoryAggregation;
  onChange: (value: CategoryAggregation) => void;
  className?: string;
}

const CategoryAggToggle: React.FC<CategoryAggToggleProps> = ({ value, onChange, className }) => {
  const { t } = useTranslation();

  return (
    <div
      className={`category-agg-toggle${className ? ` ${className}` : ''}`}
      role="group"
      aria-label={t('categoryAgg.label')}
    >
      <button
        type="button"
        className={`category-agg-toggle-btn${value === 'category' ? ' is-active' : ''}`}
        onClick={() => onChange('category')}
        aria-pressed={value === 'category'}
      >
        {t('categoryAgg.category')}
      </button>
      <button
        type="button"
        className={`category-agg-toggle-btn${value === 'group' ? ' is-active' : ''}`}
        onClick={() => onChange('group')}
        aria-pressed={value === 'group'}
      >
        {t('categoryAgg.group')}
      </button>
    </div>
  );
};

export default CategoryAggToggle;
