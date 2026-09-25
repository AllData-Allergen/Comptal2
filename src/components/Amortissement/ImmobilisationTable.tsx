import React from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight, Paperclip, Pencil, Trash2 } from 'lucide-react';
import { ImmobilisationComputed } from '../../types/amortissement';
import { formatMoney } from '../../utils/invoiceFormat';
import { formatRegisterDate } from '../../utils/registerI18n';
import ImmobilisationAttachmentsPanel from './ImmobilisationAttachmentsPanel';

interface ImmobilisationTableProps {
  rows: ImmobilisationComputed[];
  mode: 'registre' | 'suivi';
  selectedId: string | null;
  expandedId: string | null;
  attachmentCounts: Record<string, number>;
  onSelect: (id: string) => void;
  onToggleExpand: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onAttachmentsChanged: () => void;
}

const ImmobilisationTable: React.FC<ImmobilisationTableProps> = ({
  rows,
  mode,
  selectedId,
  expandedId,
  attachmentCounts,
  onSelect,
  onToggleExpand,
  onEdit,
  onDelete,
  onAttachmentsChanged,
}) => {
  const { t, i18n } = useTranslation();
  const colSpan = mode === 'suivi' ? 11 : 8;

  if (rows.length === 0) {
    return (
      <div className="amortissement-table-wrap">
        <p style={{ padding: '1rem', margin: 0, color: 'var(--invoicing-gray-600)' }}>
          {t('amortissement.empty')}
        </p>
      </div>
    );
  }

  return (
    <div className="amortissement-table-wrap">
      <table className="amortissement-table">
        <thead>
          <tr>
            <th style={{ width: 36 }} />
            <th>{t('amortissement.designation')}</th>
            <th>{t('amortissement.type')}</th>
            {mode === 'registre' && <th>{t('amortissement.acquisitionDate')}</th>}
            <th>{t('amortissement.amountHT')}</th>
            {mode === 'suivi' && (
              <>
                <th>{t('amortissement.duration')}</th>
                <th>{t('amortissement.method')}</th>
                <th>{t('amortissement.yearsOwned')}</th>
                <th>{t('amortissement.depreciationPerYear')}</th>
                <th>{t('amortissement.depreciationCumulative')}</th>
                <th>{t('amortissement.netValue')}</th>
              </>
            )}
            {mode === 'registre' && (
              <>
                <th>{t('amortissement.status')}</th>
                <th>{t('amortissement.netValue')}</th>
                <th>{t('amortissement.attachments')}</th>
              </>
            )}
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const { article, anneesEcoulees, amortissementAnnuel, amortissementCumule, vnc } = row;
            const expanded = expandedId === article.id;
            const selected = selectedId === article.id;
            const attCount = attachmentCounts[article.id] ?? 0;
            return (
              <React.Fragment key={article.id}>
                <tr
                  className={`amortissement-row${selected ? ' is-selected' : ''}${expanded ? ' is-expanded' : ''}`}
                  onClick={() => onSelect(article.id)}
                >
                  <td>
                    <button
                      type="button"
                      className="amortissement-expand-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleExpand(article.id);
                      }}
                      title={t('amortissement.attachments')}
                    >
                      {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </button>
                  </td>
                  <td>
                    {article.designation}
                    {article.faibleValeur && (
                      <span className="amortissement-badge warn" style={{ marginLeft: 6 }}>
                        {t('amortissement.lowValueShort')}
                      </span>
                    )}
                  </td>
                  <td>{t(`amortissement.types.${article.typeImmobilisation}`)}</td>
                  {mode === 'registre' && <td>{formatRegisterDate(article.dateAcquisition, i18n.language)}</td>}
                  <td>{formatMoney(article.valeurAcquisitionHT)}</td>
                  {mode === 'suivi' && (
                    <>
                      <td>{article.dureeAnnees}</td>
                      <td>{t(`amortissement.methods.${article.methode}`)}</td>
                      <td>{anneesEcoulees.toFixed(2)}</td>
                      <td>{formatMoney(amortissementAnnuel)}</td>
                      <td>{formatMoney(amortissementCumule)}</td>
                      <td>{formatMoney(vnc)}</td>
                    </>
                  )}
                  {mode === 'registre' && (
                    <>
                      <td>
                        <span className={`amortissement-badge${article.statut === 'actif' ? '' : ' muted'}`}>
                          {t(`amortissement.statuses.${article.statut}`)}
                        </span>
                      </td>
                      <td>{formatMoney(vnc)}</td>
                      <td>
                        <span className="amortissement-att-chip">
                          <Paperclip size={12} /> {attCount}
                        </span>
                      </td>
                    </>
                  )}
                  <td onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      className="ct-btn-secondary"
                      style={{ padding: 4 }}
                      onClick={() => onEdit(article.id)}
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      className="ct-btn-secondary"
                      style={{ padding: 4, marginLeft: 4 }}
                      onClick={() => onDelete(article.id)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
                {expanded && (
                  <tr className="amortissement-expand-row">
                    <td colSpan={colSpan}>
                      <ImmobilisationAttachmentsPanel
                        immobilisationId={article.id}
                        onChanged={onAttachmentsChanged}
                      />
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default ImmobilisationTable;
