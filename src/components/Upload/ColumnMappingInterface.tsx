import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, CheckCircle, Info, Save, SkipForward } from 'lucide-react';
import {
  ColumnMappingConfig,
  ColumnRole,
  DetectedColumns,
  FileStructure,
  ImportTemplate,
  mappingFromRoles,
} from '../../types/import';
import { ImportTemplateService } from '../../services/ImportTemplateService';
import {
  buildInitialRoles,
  guessRoleFromHeader,
} from '../../services/ColumnMappingService';
import TemplatePicker from './TemplatePicker';

interface ColumnMappingInterfaceProps {
  structure: FileStructure;
  detectedColumns: DetectedColumns;
  initialBalance: string;
  templates: ImportTemplate[];
  selectedTemplateId: number | '';
  onChangeBalance: (value: string) => void;
  onSelectTemplate: (id: number | '') => void;
  onConfirm: (mapping: ColumnMappingConfig, roles: Map<number, ColumnRole>) => void;
  onSaveTemplate: (roles: Map<number, ColumnRole>) => void;
  onBack: () => void;
  onIgnore?: () => void;
  ignoreHint?: string;
}

const ROLE_COLORS: Record<ColumnRole, string> = {
  date: '#3b82f6',
  dateValue: '#60a5fa',
  libelle: '#8b5cf6',
  debit: '#ef4444',
  credit: '#10b981',
  debitCredit: '#a855f7',
  balance: '#64748b',
  category: '#f59e0b',
  account: '#0ea5e9',
  ignore: '#94a3b8',
};


const ColumnMappingInterface: React.FC<ColumnMappingInterfaceProps> = ({
  structure,
  detectedColumns,
  initialBalance,
  templates,
  selectedTemplateId,
  onChangeBalance,
  onSelectTemplate,
  onConfirm,
  onSaveTemplate,
  onBack,
  onIgnore,
  ignoreHint,
}) => {
  const { t } = useTranslation();
  const [roles, setRoles] = useState<Map<number, ColumnRole>>(() =>
    buildInitialRoles(structure.columns, detectedColumns)
  );

  useEffect(() => {
    setRoles(buildInitialRoles(structure.columns, detectedColumns));
  }, [detectedColumns, structure.columns]);

  useEffect(() => {
    if (selectedTemplateId === '') return;
    const tpl = templates.find((x) => x.id === selectedTemplateId);
    if (!tpl) return;
    const applied = ImportTemplateService.applyToColumns(tpl, structure.columns);
    if (applied.size > 0) setRoles(applied);
  }, [selectedTemplateId, templates, structure.columns]);

  const setRole = (index: number, role: ColumnRole) => {
    setRoles((prev) => {
      const next = new Map(prev);
      // Unicité des rôles exclusifs
      if (role !== 'ignore') {
        for (const [idx, r] of next.entries()) {
          if (idx !== index && r === role) next.set(idx, 'ignore');
          if (
            role === 'debitCredit' &&
            idx !== index &&
            (r === 'debit' || r === 'credit' || r === 'debitCredit')
          ) {
            next.set(idx, 'ignore');
          }
          if (
            (role === 'debit' || role === 'credit') &&
            idx !== index &&
            r === 'debitCredit'
          ) {
            next.set(idx, 'ignore');
          }
        }
      }
      next.set(index, role);
      return next;
    });
  };

  const validation = useMemo(() => {
    const errors: string[] = [];
    const values = Array.from(roles.values());
    if (!values.includes('date')) errors.push(t('columnMapping.errDate'));
    if (!values.includes('libelle')) errors.push(t('columnMapping.errLibelle'));
    const hasAmount =
      values.includes('debitCredit') ||
      values.includes('debit') ||
      values.includes('credit');
    if (!hasAmount) errors.push(t('columnMapping.errAmount'));
    return { valid: errors.length === 0, errors };
  }, [roles, t]);

  const warningNoCredit =
    rolesHas(roles, 'debit') && !rolesHas(roles, 'credit') && !rolesHas(roles, 'debitCredit');

  const handleConfirm = () => {
    const mapping = mappingFromRoles(roles);
    if (!mapping || !validation.valid) return;
    onConfirm(mapping, roles);
  };

  return (
    <div className="ct-card space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="ct-section-title m-0">{t('columnMapping.title')}</h2>
        <TemplatePicker
          templates={templates}
          selectedId={selectedTemplateId}
          onSelect={onSelectTemplate}
          compact
        />
      </div>

      <div className="upload-info-banner flex gap-3 items-start">
        <Info size={18} className="shrink-0 mt-0.5" />
        <div className="text-sm">
          <p className="font-semibold mb-1">{t('columnMapping.instructions')}</p>
          <ul className="list-disc list-inside space-y-1 opacity-90">
            <li dangerouslySetInnerHTML={{ __html: t('columnMapping.instruction1') }} />
            <li>{t('columnMapping.instruction2')}</li>
            <li>{t('columnMapping.instruction3')}</li>
            <li>{t('columnMapping.instruction4')}</li>
          </ul>
        </div>
      </div>

      {warningNoCredit && (
        <div className="upload-info-banner warn flex gap-3 items-start">
          <AlertTriangle size={18} className="shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold mb-1">{t('columnMapping.warning')}</p>
            <p>{t('columnMapping.warningNoCredit')}</p>
          </div>
        </div>
      )}

      {!validation.valid && (
        <div className="upload-info-banner error flex gap-3 items-start">
          <AlertTriangle size={18} className="shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold mb-1">{t('columnMapping.validationErrors')}</p>
            <ul className="list-disc list-inside">
              {validation.errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <div>
        <h3 className="font-semibold mb-3" style={{ color: 'var(--invoicing-gray-900)' }}>
          {t('columnMapping.dataPreview')}
        </h3>
        <div className="overflow-x-auto border rounded-lg" style={{ borderColor: 'var(--invoicing-gray-200)' }}>
          <table className="ct-table text-xs">
            <thead>
              <tr>
                {structure.columns.map((col) => (
                  <th key={col.index}>
                    <div>{col.name}</div>
                    <div className="font-normal opacity-60">{col.type}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {structure.sampleRows.slice(0, 5).map((row, ri) => (
                <tr key={ri}>
                  {structure.columns.map((col) => (
                    <td key={col.index} className="max-w-[140px] truncate">
                      {row[col.index] !== undefined && row[col.index] !== null && row[col.index] !== ''
                        ? String(row[col.index])
                        : '—'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h3 className="font-semibold mb-3" style={{ color: 'var(--invoicing-gray-900)' }}>
          {t('columnMapping.columnAssignment')}
        </h3>
        <div className="space-y-3">
          {structure.columns.map((column) => {
            const role = roles.get(column.index) ?? 'ignore';
            const suggestCombined =
              column.type === 'number' &&
              column.hasNegativeValues &&
              column.hasPositiveValues &&
              role !== 'debitCredit';
            return (
              <div key={column.index} className="upload-column-row">
                <div className="flex-1 min-w-0">
                  <div className="font-medium" style={{ color: 'var(--invoicing-gray-900)' }}>
                    {column.name}
                  </div>
                  <div className="text-xs mt-1" style={{ color: 'var(--invoicing-gray-500)' }}>
                    {t('columnMapping.type')} {column.type}
                    {column.hasNegativeValues ? t('columnMapping.hasNegative') : ''}
                    {column.hasPositiveValues ? t('columnMapping.hasPositive') : ''}
                    {column.isMonotonic ? t('columnMapping.isMonotonic') : ''}
                  </div>
                  <div className="text-xs mt-1 opacity-60">
                    {t('columnMapping.examples')} {column.sampleValues.slice(0, 3).join(', ') || '—'}
                  </div>
                  {guessRoleFromHeader(column.name) === role && role !== 'ignore' && (
                    <p className="text-xs mt-1" style={{ color: 'var(--invoicing-primary)' }}>
                      {t('columnMapping.fromHeader')}
                    </p>
                  )}
                  {suggestCombined && (
                    <p
                      className="text-xs mt-2 font-medium"
                      style={{ color: ROLE_COLORS.debitCredit }}
                    >
                      {t('columnMapping.suggestDebitCredit')}
                    </p>
                  )}
                </div>
                <select
                  className="ct-select"
                  style={{ minWidth: 220 }}
                  value={role}
                  onChange={(e) => setRole(column.index, e.target.value as ColumnRole)}
                >
                  <option value="ignore">{t('columnMapping.ignore')}</option>
                  <option value="date">{t('columnMapping.date')}</option>
                  <option value="dateValue">{t('columnMapping.dateValue')}</option>
                  <option value="libelle">{t('columnMapping.libelle')}</option>
                  <optgroup label={t('columnMapping.amountGroup')}>
                    <option value="debit">{t('columnMapping.debit')}</option>
                    <option value="credit">{t('columnMapping.credit')}</option>
                    <option value="debitCredit">{t('columnMapping.debitCredit')}</option>
                  </optgroup>
                  <option value="balance">{t('columnMapping.balance')}</option>
                  <option value="category">{t('columnMapping.category')}</option>
                  <option value="account">{t('columnMapping.account')}</option>
                </select>
                {role !== 'ignore' && (
                  <CheckCircle size={20} style={{ color: ROLE_COLORS[role] }} className="shrink-0" />
                )}
              </div>
            );
          })}
        </div>
      </div>

      <label className="ct-label max-w-xs">
        {t('settings.accounts.initialBalance')}
        <input
          className="ct-input w-full mt-1"
          value={initialBalance}
          onChange={(e) => onChangeBalance(e.target.value)}
        />
      </label>

      {ignoreHint && <p className="ct-hint">{ignoreHint}</p>}

      <div
        className="flex flex-wrap justify-end gap-3 pt-4"
        style={{ borderTop: '1px solid var(--invoicing-gray-200)' }}
      >
        <button className="ct-btn-secondary" onClick={onBack}>
          {t('common.cancel')}
        </button>
        {onIgnore && (
          <button className="ct-btn-secondary" onClick={onIgnore}>
            <SkipForward size={16} />
            {t('upload.ignoreThisImport')}
          </button>
        )}
        <button className="ct-btn-secondary" onClick={() => onSaveTemplate(roles)}>
          <Save size={16} />
          {t('upload.templates.save')}
        </button>
        <button className="ct-btn-primary" disabled={!validation.valid} onClick={handleConfirm}>
          {t('upload.toPreview')}
        </button>
      </div>
    </div>
  );
};

function rolesHas(roles: Map<number, ColumnRole>, role: ColumnRole): boolean {
  for (const r of roles.values()) {
    if (r === role) return true;
  }
  return false;
}

export default ColumnMappingInterface;
