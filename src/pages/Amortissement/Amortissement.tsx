import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Landmark, Loader2, Plus, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import ConfirmModal from '../../components/Common/ConfirmModal';
import ImmobilisationFormModal from '../../components/Amortissement/ImmobilisationFormModal';
import ImmobilisationTable from '../../components/Amortissement/ImmobilisationTable';
import ImmobilisationAttachmentsPanel from '../../components/Amortissement/ImmobilisationAttachmentsPanel';
import AmortissementSettingsPanel from '../../components/Amortissement/AmortissementSettingsPanel';
import AmortissementLegalPanel from '../../components/Amortissement/AmortissementLegalPanel';
import AmortissementChartView from '../../components/Amortissement/AmortissementChartView';
import ChartGranularityZoom from '../../components/Common/ChartGranularityZoom';
import { AmortissementService } from '../../services/AmortissementService';
import { Logger } from '../../services/logger';
import { ProfileService } from '../../services/ProfileService';
import { SettingsService } from '../../services/SettingsService';
import { parseUsageMode } from '../../utils/usageMode';
import { formatMoney } from '../../utils/invoiceFormat';
import { formatRegisterDate } from '../../utils/registerI18n';
import {
  AmortissementSeries,
  AmortissementSettings,
  DEFAULT_AMORTISSEMENT_SETTINGS,
  Immobilisation,
  ImmobilisationComputed,
  StatutImmobilisation,
  TYPE_IMMOBILISATION_LIST,
  TypeImmobilisation,
} from '../../types/amortissement';
import { ChartGranularity } from '../../types/projection';
import '../../styles/amortissement-custom.css';

type Tab = 'registre' | 'suivi' | 'parametres' | 'references';

const AmortissementPage: React.FC = () => {
  const { t, i18n } = useTranslation();
  const [tab, setTab] = useState<Tab>('registre');
  const [rows, setRows] = useState<ImmobilisationComputed[]>([]);
  const [settings, setSettings] = useState<AmortissementSettings>(DEFAULT_AMORTISSEMENT_SETTINGS);
  const [statutFilter, setStatutFilter] = useState<'all' | StatutImmobilisation>('actif');
  const [typeFilter, setTypeFilter] = useState<'all' | TypeImmobilisation>('all');
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Immobilisation | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [isAssociation, setIsAssociation] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [attachmentCounts, setAttachmentCounts] = useState<Record<string, number>>({});
  const [chartSeries, setChartSeries] = useState<AmortissementSeries | null>(null);
  const [granularity, setGranularity] = useState<ChartGranularity>('year');

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const [computed, nextSettings, profiles, counts] = await Promise.all([
        AmortissementService.computeAll(),
        AmortissementService.getSettings(),
        ProfileService.list(),
        AmortissementService.countAttachmentsByImmobilisation(),
      ]);
      setRows(computed);
      setSettings(nextSettings);
      setAttachmentCounts(counts);
      const active = profiles.find((p) => p.id === SettingsService.current.activeProfileId);
      setIsAssociation(parseUsageMode(active?.usageMode, 'tpe') === 'association');
      setSelectedId((current) =>
        current && computed.some((r) => r.article.id === current)
          ? current
          : computed[0]?.article.id ?? null
      );
    } catch (err) {
      Logger.error('AmortissementPage.load', err);
      toast.error(t('common.error'));
    } finally {
      setBusy(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (statutFilter !== 'all' && row.article.statut !== statutFilter) return false;
      if (typeFilter !== 'all' && row.article.typeImmobilisation !== typeFilter) return false;
      if (!q) return true;
      return (
        row.article.designation.toLowerCase().includes(q) ||
        (row.article.reference ?? '').toLowerCase().includes(q) ||
        (row.article.fournisseur ?? '').toLowerCase().includes(q)
      );
    });
  }, [rows, search, statutFilter, typeFilter]);

  const liveSummary = useMemo(() => {
    const actifs = filtered.filter((r) => r.article.statut === 'actif');
    const base = actifs.length > 0 ? actifs : filtered;
    return {
      count: base.length,
      brut: base.reduce((s, r) => s + r.article.valeurAcquisitionHT, 0),
      amortiCumule: base.reduce((s, r) => s + r.amortissementCumule, 0),
      vnc: base.reduce((s, r) => s + r.vnc, 0),
      dotationExercice: base.reduce((s, r) => s + r.dotationExercice, 0),
      attachments: base.reduce((s, r) => s + (attachmentCounts[r.article.id] ?? 0), 0),
    };
  }, [filtered, attachmentCounts]);

  const selected = useMemo(
    () => filtered.find((r) => r.article.id === selectedId) ?? filtered[0] ?? null,
    [filtered, selectedId]
  );

  useEffect(() => {
    if (tab !== 'suivi' && tab !== 'registre') return;
    if (rows.length === 0) {
      setChartSeries(null);
      return;
    }
    const dates = rows.map((r) => r.article.dateMiseEnService || r.article.dateAcquisition).sort();
    const from = dates[0] ?? new Date().toISOString().slice(0, 10);
    const to = new Date().toISOString().slice(0, 10);
    void AmortissementService.buildAmortissementSeries(granularity, from, to)
      .then(setChartSeries)
      .catch((err) => {
        Logger.error('AmortissementPage.chart', err);
        setChartSeries(null);
      });
  }, [rows, granularity, tab]);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (id: string) => {
    const found = rows.find((r) => r.article.id === id);
    if (!found) return;
    setEditing(found.article);
    setFormOpen(true);
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    try {
      await AmortissementService.remove(deleteId);
      setDeleteId(null);
      if (selectedId === deleteId) setSelectedId(null);
      if (expandedId === deleteId) setExpandedId(null);
      toast.success(t('amortissement.deleted'));
      await load();
    } catch (err) {
      Logger.error('AmortissementPage.delete', err);
      toast.error(t('common.error'));
    }
  };

  const refreshAttachments = async () => {
    const counts = await AmortissementService.countAttachmentsByImmobilisation();
    setAttachmentCounts(counts);
  };

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'registre', label: t('amortissement.tabs.registre') },
    { id: 'suivi', label: t('amortissement.tabs.suivi') },
    { id: 'parametres', label: t('amortissement.tabs.parametres') },
    { id: 'references', label: t('amortissement.tabs.references') },
  ];

  const kpiCards: Array<{ key: keyof typeof liveSummary; label: string; money?: boolean }> = [
    { key: 'count', label: t('amortissement.kpi.count') },
    { key: 'brut', label: t('amortissement.kpi.brut'), money: true },
    { key: 'amortiCumule', label: t('amortissement.kpi.amorti'), money: true },
    { key: 'vnc', label: t('amortissement.kpi.vnc'), money: true },
    { key: 'dotationExercice', label: t('amortissement.kpi.dotation'), money: true },
    { key: 'attachments', label: t('amortissement.kpi.attachments') },
  ];

  return (
    <div className={`amortissement-page${busy ? ' is-loading' : ''}`}>
      <div className="amortissement-header">
        <div className="amortissement-header-icon">
          <Landmark size={22} />
        </div>
        <div>
          <h1>{t('amortissement.title')}</h1>
          <p className="amortissement-disclaimer">{t('amortissement.disclaimer')}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="ct-btn-secondary" onClick={() => void load()} disabled={busy}>
            {busy ? <Loader2 size={16} className="animate-spin" style={{ marginRight: 6 }} /> : <RefreshCw size={16} style={{ marginRight: 6 }} />}
            {t('common.refresh')}
          </button>
        </div>
      </div>

      <div className="amortissement-kpis">
        {kpiCards.map((card) => (
          <button
            key={card.key}
            type="button"
            className="amortissement-kpi"
            onClick={() => {
              if (card.key === 'count') setStatutFilter('actif');
            }}
          >
            <div className="amortissement-kpi-label">{card.label}</div>
            <div className="amortissement-kpi-value">
              {card.money ? formatMoney(liveSummary[card.key]) : liveSummary[card.key]}
            </div>
          </button>
        ))}
      </div>

      <div className="amortissement-tabs">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`amortissement-tab${tab === item.id ? ' is-active' : ''}`}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {(tab === 'registre' || tab === 'suivi') && (
        <div className="amortissement-main-grid">
          <div className="amortissement-main-col">
            <div className="amortissement-toolbar">
              <div className="amortissement-filters">
                <input
                  type="search"
                  placeholder={t('common.search')}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{ minWidth: 180 }}
                />
                <select
                  value={statutFilter}
                  onChange={(e) => setStatutFilter(e.target.value as 'all' | StatutImmobilisation)}
                >
                  <option value="all">{t('amortissement.filters.all')}</option>
                  <option value="actif">{t('amortissement.statuses.actif')}</option>
                  <option value="cede">{t('amortissement.statuses.cede')}</option>
                  <option value="mis_au_rebut">{t('amortissement.statuses.mis_au_rebut')}</option>
                </select>
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value as 'all' | TypeImmobilisation)}
                >
                  <option value="all">{t('amortissement.filters.allTypes')}</option>
                  {TYPE_IMMOBILISATION_LIST.map((type) => (
                    <option key={type} value={type}>
                      {t(`amortissement.types.${type}`)}
                    </option>
                  ))}
                </select>
              </div>
              {tab === 'registre' && (
                <button type="button" className="ct-btn-primary" onClick={openCreate}>
                  <Plus size={16} style={{ marginRight: 6 }} />
                  {t('amortissement.addAsset')}
                </button>
              )}
            </div>

            <ImmobilisationTable
              rows={filtered}
              mode={tab === 'registre' ? 'registre' : 'suivi'}
              selectedId={selected?.article.id ?? null}
              expandedId={expandedId}
              attachmentCounts={attachmentCounts}
              onSelect={setSelectedId}
              onToggleExpand={(id) => setExpandedId((cur) => (cur === id ? null : id))}
              onEdit={openEdit}
              onDelete={setDeleteId}
              onAttachmentsChanged={() => void refreshAttachments()}
            />

            {tab === 'suivi' && (
              <div className="amortissement-chart-card">
                <div className="amortissement-chart-head">
                  <h3>{t('amortissement.chartTitle')}</h3>
                  <ChartGranularityZoom granularity={granularity} onChange={setGranularity} />
                </div>
                <div className="amortissement-chart-body">
                  <AmortissementChartView series={chartSeries} granularity={granularity} />
                </div>
              </div>
            )}
          </div>

          <aside className="amortissement-detail">
            {selected ? (
              <>
                <h3>{selected.article.designation}</h3>
                <dl className="amortissement-detail-grid">
                  <div>
                    <dt>{t('amortissement.type')}</dt>
                    <dd>{t(`amortissement.types.${selected.article.typeImmobilisation}`)}</dd>
                  </div>
                  <div>
                    <dt>{t('amortissement.amountHT')}</dt>
                    <dd>{formatMoney(selected.article.valeurAcquisitionHT)}</dd>
                  </div>
                  <div>
                    <dt>{t('amortissement.netValue')}</dt>
                    <dd>{formatMoney(selected.vnc)}</dd>
                  </div>
                  <div>
                    <dt>{t('amortissement.depreciationCumulative')}</dt>
                    <dd>{formatMoney(selected.amortissementCumule)}</dd>
                  </div>
                  <div>
                    <dt>{t('amortissement.method')}</dt>
                    <dd>{t(`amortissement.methods.${selected.article.methode}`)}</dd>
                  </div>
                  <div>
                    <dt>{t('amortissement.duration')}</dt>
                    <dd>{selected.article.dureeAnnees} {t('amortissement.years')}</dd>
                  </div>
                  <div>
                    <dt>{t('amortissement.serviceDate')}</dt>
                    <dd>{formatRegisterDate(selected.article.dateMiseEnService, i18n.language)}</dd>
                  </div>
                  <div>
                    <dt>{t('amortissement.status')}</dt>
                    <dd>{t(`amortissement.statuses.${selected.article.statut}`)}</dd>
                  </div>
                </dl>
                <div className="amortissement-progress">
                  <div className="amortissement-progress-label">
                    <span>{t('amortissement.depreciationCumulative')}</span>
                    <span>
                      {selected.article.valeurAcquisitionHT > 0
                        ? Math.min(
                            100,
                            Math.round(
                              (selected.amortissementCumule / selected.article.valeurAcquisitionHT) * 100
                            )
                          )
                        : 0}
                      %
                    </span>
                  </div>
                  <div className="amortissement-progress-bar">
                    <div
                      className="amortissement-progress-fill"
                      style={{
                        width: `${
                          selected.article.valeurAcquisitionHT > 0
                            ? Math.min(
                                100,
                                (selected.amortissementCumule / selected.article.valeurAcquisitionHT) * 100
                              )
                            : 0
                        }%`,
                      }}
                    />
                  </div>
                </div>
                <ImmobilisationAttachmentsPanel
                  immobilisationId={selected.article.id}
                  onChanged={() => void refreshAttachments()}
                />
                <div className="amortissement-detail-actions">
                  <button type="button" className="ct-btn-secondary" onClick={() => openEdit(selected.article.id)}>
                    {t('common.edit')}
                  </button>
                </div>
              </>
            ) : (
              <p className="amortissement-detail-empty">{t('amortissement.selectHint')}</p>
            )}
          </aside>
        </div>
      )}

      {tab === 'parametres' && (
        <AmortissementSettingsPanel
          settings={settings}
          onSaved={(next) => {
            setSettings(next);
            void load();
          }}
        />
      )}

      {tab === 'references' && <AmortissementLegalPanel isAssociation={isAssociation} />}

      <ImmobilisationFormModal
        isOpen={formOpen}
        initial={editing}
        onClose={() => setFormOpen(false)}
        onSaved={() => void load()}
      />

      <ConfirmModal
        isOpen={Boolean(deleteId)}
        title={t('amortissement.deleteTitle')}
        message={t('amortissement.deleteConfirm')}
        confirmLabel={t('common.delete')}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
};

export default AmortissementPage;
