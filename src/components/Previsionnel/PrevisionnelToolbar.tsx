import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Copy, FolderPlus, Plus, Trash2 } from 'lucide-react';
import { Project } from '../../types/projection';

interface PrevisionnelToolbarProps {
  projects: Project[];
  projectId: number | '';
  name: string;
  startDate: string;
  endDate: string;
  initialBalance: string;
  onSelectProject: (id: number | '') => void;
  onNameChange: (value: string) => void;
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
  onBalanceChange: (value: string) => void;
  onCreate: () => void;
  onDelete: () => void;
  onAddLine: () => void;
  onFromCategory: () => void;
  onFromTransaction: () => void;
  onAddGroup: () => void;
  onDuplicate: () => void;
  onDeleteRow: () => void;
}

const PrevisionnelToolbar: React.FC<PrevisionnelToolbarProps> = ({
  projects,
  projectId,
  name,
  startDate,
  endDate,
  initialBalance,
  onSelectProject,
  onNameChange,
  onStartDateChange,
  onEndDateChange,
  onBalanceChange,
  onCreate,
  onDelete,
  onAddLine,
  onFromCategory,
  onFromTransaction,
  onAddGroup,
  onDuplicate,
  onDeleteRow,
}) => {
  const { t } = useTranslation();
  const [lineMenuOpen, setLineMenuOpen] = useState(false);
  const lineMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!lineMenuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!lineMenuRef.current?.contains(e.target as Node)) setLineMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLineMenuOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [lineMenuOpen]);

  const disabled = projectId === '';

  return (
    <div className="previsionnel-toolbar">
      <div className="previsionnel-toolbar-row">
        <label className="previsionnel-field">
          <span>{t('previsionnel.forecast')}</span>
          <select
            className="ct-select"
            value={projectId}
            onChange={(e) => onSelectProject(e.target.value ? Number(e.target.value) : '')}
          >
            {projects.length === 0 && <option value="">{t('previsionnel.noForecast')}</option>}
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="previsionnel-field">
          <span>{t('common.name')}</span>
          <input className="ct-input" value={name} onChange={(e) => onNameChange(e.target.value)} />
        </label>
        <label className="previsionnel-field">
          <span>{t('previsionnel.startDate')}</span>
          <input className="ct-input" type="date" value={startDate} onChange={(e) => onStartDateChange(e.target.value)} />
        </label>
        <label className="previsionnel-field">
          <span>{t('previsionnel.endDate')}</span>
          <input className="ct-input" type="date" value={endDate} onChange={(e) => onEndDateChange(e.target.value)} />
        </label>
        <label className="previsionnel-field">
          <span>{t('previsionnel.initialBalance')}</span>
          <input
            className="ct-input"
            type="number"
            step="0.01"
            value={initialBalance}
            onChange={(e) => onBalanceChange(e.target.value)}
          />
        </label>
        <div className="previsionnel-toolbar-actions">
          <button type="button" className="ct-btn-primary previsionnel-sm-btn" onClick={onCreate}>
            <Plus size={14} /> {t('previsionnel.newForecast')}
          </button>
          <button
            type="button"
            className="ct-btn-danger previsionnel-sm-btn"
            onClick={onDelete}
            disabled={disabled}
          >
            <Trash2 size={14} /> {t('common.delete')}
          </button>
        </div>
      </div>
      <div className="previsionnel-toolbar-row">
        <div className="previsionnel-line-menu" ref={lineMenuRef}>
          <button
            type="button"
            className="ct-btn-secondary previsionnel-sm-btn"
            disabled={disabled}
            aria-expanded={lineMenuOpen}
            aria-haspopup="menu"
            onClick={() => setLineMenuOpen((v) => !v)}
          >
            <Plus size={14} /> {t('previsionnel.newLine')}
            <ChevronDown size={14} />
          </button>
          {lineMenuOpen && !disabled && (
            <ul className="previsionnel-line-menu-list" role="menu">
              <li role="none">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setLineMenuOpen(false);
                    onFromCategory();
                  }}
                >
                  {t('previsionnel.fromCategory.action')}
                </button>
              </li>
              <li role="none">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setLineMenuOpen(false);
                    onFromTransaction();
                  }}
                >
                  {t('previsionnel.fromTransaction.action')}
                </button>
              </li>
              <li role="none">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setLineMenuOpen(false);
                    onAddLine();
                  }}
                >
                  {t('previsionnel.neutralLine')}
                </button>
              </li>
            </ul>
          )}
        </div>
        <button type="button" className="ct-btn-secondary previsionnel-sm-btn" onClick={onAddGroup} disabled={disabled}>
          <FolderPlus size={14} /> {t('previsionnel.addGroup')}
        </button>
        <button type="button" className="ct-btn-secondary previsionnel-sm-btn" onClick={onDuplicate} disabled={disabled}>
          <Copy size={14} /> {t('previsionnel.duplicate')}
        </button>
        <button
          type="button"
          className="ct-btn-secondary previsionnel-sm-btn"
          onMouseDown={(e) => e.preventDefault()}
          onClick={onDeleteRow}
          disabled={disabled}
        >
          <Trash2 size={14} /> {t('previsionnel.deleteRow')}
        </button>
      </div>
    </div>
  );
};

export default PrevisionnelToolbar;
