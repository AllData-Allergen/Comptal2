import React, { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  BookOpenCheck,
  CalendarRange,
  ExternalLink,
  Eye,
  FileBarChart,
  FileCheck2,
  FilePlus2,
  FileText,
  Landmark,
  Link2,
  Paperclip,
  Plus,
  ReceiptText,
  RefreshCw,
  Settings,
  Trash2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import ConfirmModal from '../../components/Common/ConfirmModal';
import RegisterTypeEnableList from '../../components/Register/RegisterTypeEnableList';
import { Logger } from '../../services/logger';
import { RegisterPDFService } from '../../services/RegisterPDFService';
import { RegisterService } from '../../services/RegisterService';
import {
  ASSOCIATION_REGISTER_TYPES,
  GENERAL_REGISTER_TYPES,
  RegisterAttachment,
  RegisterDocument,
  RegisterDocumentType,
} from '../../types/register';
import { formatMoney } from '../../utils/invoiceFormat';
import {
  formatRegisterDate,
  registerRowDetail,
  registerRowExtra,
  registerRowLabel,
  registerStatusLabel,
  registerTypeDescription,
  registerTypeTitle,
} from '../../utils/registerI18n';
import '../../styles/register-custom.css';

const TODAY = new Date().toISOString().slice(0, 10);
const YEAR_START = `${new Date().getFullYear()}-01-01`;

const TYPE_ICONS: Record<RegisterDocumentType, React.ReactNode> = {
  reference: <FileText size={20} />,
  invoice_summary: <ReceiptText size={20} />,
  cashflow_summary: <FileBarChart size={20} />,
  amortissement_register: <Landmark size={20} />,
  donation_journal: <BookOpenCheck size={20} />,
  tax_receipt_register: <ReceiptText size={20} />,
  annual_donation_statement: <FileCheck2 size={20} />,
};

const COUNT_TOTAL_KEYS = new Set([
  'donationCount',
  'receiptCount',
  'cancelledReceipts',
  'particuliers',
  'entreprises',
  'immoCount',
]);

const kindOf = (document: RegisterDocument) => RegisterService.documentKind(document);

const Register: React.FC = () => {
  const { t, i18n } = useTranslation();
  const formatDate = (value: string) => formatRegisterDate(value, i18n.language);
  const typeTitle = (type: RegisterDocumentType) => registerTypeTitle(type);
  const typeDescription = (type: RegisterDocumentType) => registerTypeDescription(type);
  const totalLabel = (key: string) => t(`register.totals.${key}`, { defaultValue: key });
  const [documents, setDocuments] = useState<RegisterDocument[]>([]);
  const [selected, setSelected] = useState<RegisterDocument | null>(null);
  const [registerAttachments, setRegisterAttachments] = useState<RegisterAttachment[]>([]);
  const [type, setType] = useState<RegisterDocumentType>('reference');
  const [title, setTitle] = useState('');
  const [titleTouched, setTitleTouched] = useState(false);
  const [start, setStart] = useState(YEAR_START);
  const [end, setEnd] = useState(TODAY);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<'all' | 'association' | 'general'>('all');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [enabledTypes, setEnabledTypes] = useState<RegisterDocumentType[]>([
    ...ASSOCIATION_REGISTER_TYPES,
    ...GENERAL_REGISTER_TYPES,
  ]);
  const [item, setItem] = useState({ label: '', description: '', amount: '' });
  const [link, setLink] = useState({ label: '', value: '', url: '' });
  const [showTypeSettings, setShowTypeSettings] = useState(false);

  const load = async (selectId?: string) => {
    const [nextDocuments, attachments] = await Promise.all([
      RegisterService.listDocuments(),
      RegisterService.listRegisterAttachments(),
    ]);
    setDocuments(nextDocuments);
    setRegisterAttachments(attachments);
    const id = selectId ?? selected?.id;
    setSelected(id ? nextDocuments.find((doc) => doc.id === id) ?? nextDocuments[0] ?? null : nextDocuments[0] ?? null);
  };

  useEffect(() => {
    void load().catch(() => toast.error(t('register.loadFail')));
    void RegisterService.loadSettings()
      .then((settings) => {
        const enabled = RegisterService.enabledTypes(settings);
        applyEnabledTypes(enabled);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!titleTouched) setTitle(registerTypeTitle(type));
  }, [type, i18n.language, titleTouched]);

  const chooseType = (next: RegisterDocumentType) => {
    setType(next);
    setTitleTouched(false);
  };

  const applyEnabledTypes = (enabled: RegisterDocumentType[]) => {
    setEnabledTypes(enabled);
    setType((current) => {
      if (enabled.includes(current)) return current;
      setTitleTouched(false);
      return enabled[0] ?? 'reference';
    });
  };

  const toggleEnabledType = async (nextType: RegisterDocumentType) => {
    try {
      const next = await RegisterService.toggleEnabledType(nextType);
      applyEnabledTypes(next);
    } catch (error) {
      if (error instanceof Error && error.message === 'EMPTY_TYPES') {
        toast.info(t('register.keepOneType'));
        return;
      }
      Logger.error('Register.toggleEnabledType', error);
      toast.error(t('register.saveTypesFail'));
    }
  };

  const createPdf = async (document: RegisterDocument) => {
    const settings = await RegisterService.loadSettings();
    const path = await RegisterPDFService.generate(document, settings);
    await RegisterService.setPdfPath(document.id, path);
    return path;
  };

  const generate = async (event: FormEvent) => {
    event.preventDefault();
    if (start > end) {
      toast.error(t('register.dateOrder'));
      return;
    }
    setBusy(true);
    try {
      const document = await RegisterService.generate({
        type,
        title: title.trim() || typeTitle(type),
        periodStart: start,
        periodEnd: end,
        notes,
      });
      await createPdf(document);
      await load(document.id);
      toast.success(t('register.generated', { number: document.number }));
    } catch (error) {
      Logger.error('Register.generate', error);
      toast.error(t('register.generateFail'));
    } finally {
      setBusy(false);
    }
  };

  const refreshPdf = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      await createPdf(selected);
      await load(selected.id);
      toast.success(t('register.pdfRefreshed'));
    } catch {
      toast.error(t('register.pdfRefreshFail'));
    } finally {
      setBusy(false);
    }
  };

  const openPdf = async (document: RegisterDocument) => {
    setBusy(true);
    try {
      await RegisterService.openDocumentPdf(document);
      await load(document.id);
    } catch (error) {
      Logger.error('Register.openPdf', error);
      toast.error(t('common.openPdfFail'));
    } finally {
      setBusy(false);
    }
  };

  const addItem = async (event: FormEvent) => {
    event.preventDefault();
    if (!selected || !item.label.trim()) return;
    await RegisterService.addItem(selected.id, {
      label: item.label.trim(),
      description: item.description.trim(),
      amount: item.amount === '' ? null : Number(item.amount),
    });
    setItem({ label: '', description: '', amount: '' });
    await load(selected.id);
  };

  const addLink = async (event: FormEvent) => {
    event.preventDefault();
    if (!selected || !link.label.trim()) return;
    await RegisterService.addLink(selected.id, {
      label: link.label.trim(),
      value: link.value.trim(),
      url: link.url.trim(),
    });
    setLink({ label: '', value: '', url: '' });
    await load(selected.id);
  };

  const visibleDocuments = useMemo(() => {
    if (filter === 'association') {
      return documents.filter((doc) => ASSOCIATION_REGISTER_TYPES.includes(kindOf(doc)));
    }
    if (filter === 'general') {
      return documents.filter((doc) => !ASSOCIATION_REGISTER_TYPES.includes(kindOf(doc)));
    }
    return documents;
  }, [documents, filter]);

  const confirmDelete = async () => {
    if (!deleteId) return;
    setBusy(true);
    try {
      await RegisterService.deleteDocument(deleteId);
      setDeleteId(null);
      await load();
      toast.success(t('register.removed'));
    } catch (error) {
      Logger.error('Register.delete', error);
      toast.error(t('register.deleteFail'));
    } finally {
      setBusy(false);
    }
  };

  const attach = async (documentId: string | null, files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    try {
      await RegisterService.addAttachment(documentId, file);
      await load(documentId ?? undefined);
      toast.success(t('register.attachmentAdded'));
    } catch {
      toast.error(t('register.attachmentFail'));
    }
  };

  return (
    <div className="register-page">
      <header className="register-header">
        <span className="register-header-icon"><BookOpenCheck size={23} /></span>
        <div>
          <h1 data-tour="page-intro-anchor">{t('register.pageTitle')}</h1>
          <p>{t('register.pageHint')}</p>
        </div>
        <label className="register-attach-button">
          <Paperclip size={17} /> {t('register.attachToRegister')}
          <input type="file" accept="application/pdf,image/png,image/jpeg,image/webp" onChange={(event) => void attach(null, event.target.files)} />
        </label>
      </header>

      <div className="register-layout">
        <aside className="register-launcher">
          <div className="register-launcher-head">
            <h2><FilePlus2 size={19} /> {t('register.newGeneration')}</h2>
            <button
              type="button"
              className={`register-launcher-settings${showTypeSettings ? ' is-open' : ''}`}
              onClick={() => setShowTypeSettings((open) => !open)}
              title={t('register.toggleTypes')}
              aria-expanded={showTypeSettings}
            >
              <Settings size={16} />
            </button>
          </div>
          <p className="register-launcher-hint">
            {showTypeSettings
              ? t('register.typesHintOpen')
              : t('register.typesHintClosed')}
          </p>
          {showTypeSettings && (
            <div className="register-launcher-types-panel">
              <RegisterTypeEnableList
                compact
                enabledTypes={enabledTypes}
                onToggle={(nextType) => void toggleEnabledType(nextType)}
              />
            </div>
          )}
          <div className="register-types">
            {ASSOCIATION_REGISTER_TYPES.filter((key) => enabledTypes.includes(key)).length > 0 && (
              <small className="register-type-group">{t('register.groupAssociation')}</small>
            )}
            {ASSOCIATION_REGISTER_TYPES.filter((key) => enabledTypes.includes(key)).map((key) => (
              <button
                key={key}
                type="button"
                className={type === key ? 'active' : ''}
                onClick={() => chooseType(key)}
              >
                {TYPE_ICONS[key]}
                <span><strong>{typeTitle(key)}</strong><small>{typeDescription(key)}</small></span>
              </button>
            ))}
            {GENERAL_REGISTER_TYPES.filter((key) => enabledTypes.includes(key)).length > 0 && (
              <small className="register-type-group">{t('register.groupGeneral')}</small>
            )}
            {GENERAL_REGISTER_TYPES.filter((key) => enabledTypes.includes(key)).map((key) => (
              <button
                key={key}
                type="button"
                className={type === key ? 'active' : ''}
                onClick={() => chooseType(key)}
              >
                {TYPE_ICONS[key]}
                <span><strong>{typeTitle(key)}</strong><small>{typeDescription(key)}</small></span>
              </button>
            ))}
          </div>
          <form className="register-generate-form" onSubmit={generate}>
            <label>{t('common.title')}<input value={title} onChange={(e) => { setTitleTouched(true); setTitle(e.target.value); }} required /></label>
            <div className="register-date-grid">
              <label>{t('common.from')}<input type="date" value={start} onChange={(e) => setStart(e.target.value)} required /></label>
              <label>{t('common.to')}<input type="date" value={end} onChange={(e) => setEnd(e.target.value)} required /></label>
            </div>
            <label>{t('common.notes')}<textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} /></label>
            <button className="register-primary" disabled={busy}>
              {busy ? <RefreshCw className="spin" size={17} /> : <FilePlus2 size={17} />}
              {t('register.generatePdf')}
            </button>
          </form>
          {registerAttachments.length > 0 && (
            <section className="register-global-files">
              <h3>{t('register.registerFiles')}</h3>
              {registerAttachments.map((attachment) => (
                <button key={attachment.id} onClick={() => void RegisterService.openAttachment(attachment.path)}>
                  <Paperclip size={14} /> {attachment.name}
                </button>
              ))}
            </section>
          )}
        </aside>

        <main className="register-library">
          <div className="register-library-head">
            <div>
              <h2>{t('register.generatedDocs')}</h2>
              <span>{t('register.documentCount', { count: visibleDocuments.length })}</span>
            </div>
            <div className="register-library-filters">
              {([
                ['all', t('common.all')],
                ['association', t('register.groupAssociation')],
                ['general', t('register.filterGeneral')],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={filter === value ? 'active' : ''}
                  onClick={() => setFilter(value)}
                >
                  {label}
                </button>
              ))}
              <button type="button" onClick={() => void load()} title={t('common.refresh')}><RefreshCw size={17} /></button>
            </div>
          </div>
          <div className="register-workspace">
            <div className="register-document-list">
              {visibleDocuments.length === 0 && <div className="register-empty">{t('register.emptyDocs')}</div>}
              {visibleDocuments.map((document) => (
                <div
                  key={document.id}
                  className={`register-document-row${selected?.id === document.id ? ' active' : ''}`}
                >
                  <button
                    type="button"
                    className="register-document-select"
                    onClick={() => setSelected(document)}
                    onDoubleClick={() => void openPdf(document)}
                    title={t('register.doubleClickPdf')}
                  >
                    <span className="register-doc-icon">{TYPE_ICONS[kindOf(document)] ?? TYPE_ICONS.reference}</span>
                    <span><strong>{document.title}</strong><small>{document.number} · {formatDate(document.createdAt)}</small></span>
                  </button>
                  <button
                    type="button"
                    className="register-document-pdf"
                    title={t('common.openPdf')}
                    disabled={busy}
                    onClick={() => void openPdf(document)}
                  >
                    <Eye size={15} />
                  </button>
                </div>
              ))}
            </div>

            {selected ? (
              <article className="register-detail">
                <div className="register-detail-head">
                  <div>
                    <span>{typeTitle(kindOf(selected))}</span>
                    <h2>{selected.title}</h2>
                    <p>{t('register.periodRange', { number: selected.number, start: formatDate(selected.periodStart), end: formatDate(selected.periodEnd) })}</p>
                  </div>
                  <div className="register-detail-actions">
                    <button type="button" onClick={() => void refreshPdf()} disabled={busy}>
                      <RefreshCw size={16} /> {t('register.refreshPdf')}
                    </button>
                    <button type="button" className="primary" onClick={() => void openPdf(selected)} disabled={busy}>
                      <ExternalLink size={16} /> {t('common.openPdf')}
                    </button>
                    <button type="button" className="danger" onClick={() => setDeleteId(selected.id)} disabled={busy}>
                      <Trash2 size={16} /> {t('register.deleteDoc')}
                    </button>
                  </div>
                </div>

                {Object.keys(selected.snapshot.totals).length > 0 && (
                  <div className="register-kpis">
                    {Object.entries(selected.snapshot.totals).map(([key, value]) => (
                      <div key={key}><span>{totalLabel(key)}</span><strong>{
                        COUNT_TOTAL_KEYS.has(key)
                          ? Number(value)
                          : formatMoney(Number(value))
                      }</strong></div>
                    ))}
                  </div>
                )}

                {selected.snapshot.rows.length > 0 && (
                  <div className="register-snapshot">
                    <h3><CalendarRange size={16} /> {t('register.frozenData')}</h3>
                    <table><thead><tr>
                      {kindOf(selected) === 'amortissement_register' ? (
                        <>
                          <th>{t('register.colLabel')}</th>
                          <th>{t('register.colDetail')}</th>
                          <th>{t('register.colExtra')}</th>
                          <th>{t('common.status')}</th>
                          <th>{t('register.colImmoBrut')}</th>
                          <th>{t('register.colImmoAmorti')}</th>
                          <th>{t('register.colImmoDotation')}</th>
                          <th>{t('register.colImmoVnc')}</th>
                        </>
                      ) : ASSOCIATION_REGISTER_TYPES.includes(kindOf(selected)) ? (
                        <>
                          <th>{t('register.colLabel')}</th>
                          <th>{t('register.colDetail')}</th>
                          <th>{t('register.colExtra')}</th>
                          <th>{t('common.status')}</th>
                          <th>{t('common.amount')}</th>
                        </>
                      ) : (
                        <>
                          <th>{t('register.colLabel')}</th>
                          <th>{t('register.colDetail')}</th>
                          <th>{t('register.colDebit')}</th>
                          <th>{t('register.colCredit')}</th>
                        </>
                      )}
                    </tr></thead>
                      <tbody>{selected.snapshot.rows.map((row, index) => (
                        <tr key={`${row.label}-${index}`}>
                          <td>{registerRowLabel(row)}</td>
                          <td>{registerRowDetail(row) || '—'}</td>
                          {kindOf(selected) === 'amortissement_register' ? (
                            <>
                              <td>{registerRowExtra(row) || '—'}</td>
                              <td>{registerStatusLabel(row.status) || '—'}</td>
                              <td>{row.credit != null ? formatMoney(row.credit) : '—'}</td>
                              <td>{row.debit != null ? formatMoney(row.debit) : '—'}</td>
                              <td>{row.periodCharge != null ? formatMoney(row.periodCharge) : '—'}</td>
                              <td>{row.amount != null ? formatMoney(Number(row.amount)) : '—'}</td>
                            </>
                          ) : ASSOCIATION_REGISTER_TYPES.includes(kindOf(selected)) ? (
                            <>
                              <td>{registerRowExtra(row) || '—'}</td>
                              <td className={row.status === 'Annulé' || row.status === 'cancelled' ? 'is-cancelled' : undefined}>
                                {registerStatusLabel(row.status) || '—'}
                              </td>
                              <td>{row.amount != null ? formatMoney(Number(row.amount)) : '—'}</td>
                            </>
                          ) : (
                            <>
                              <td>{row.debit != null || row.amount != null ? formatMoney(Number(row.debit ?? row.amount)) : '—'}</td>
                              <td>{row.credit != null ? formatMoney(row.credit) : '—'}</td>
                            </>
                          )}
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                )}

                <div className="register-enrichment">
                  <section>
                    <h3><Plus size={16} /> {t('register.items')}</h3>
                    {selected.items.map((entry) => <div className="register-entry" key={entry.id}><strong>{entry.label}</strong><span>{entry.description}{entry.amount != null ? ` · ${formatMoney(entry.amount)}` : ''}</span></div>)}
                    <form onSubmit={addItem}><input placeholder={t('register.colLabel')} value={item.label} onChange={(e) => setItem({ ...item, label: e.target.value })} required /><input placeholder={t('common.description')} value={item.description} onChange={(e) => setItem({ ...item, description: e.target.value })} /><input type="number" step="0.01" placeholder={t('common.amount')} value={item.amount} onChange={(e) => setItem({ ...item, amount: e.target.value })} /><button>{t('common.add')}</button></form>
                  </section>
                  <section>
                    <h3><Link2 size={16} /> {t('register.linkedInfo')}</h3>
                    {selected.links.map((entry) => <div className="register-entry" key={entry.id}><strong>{entry.label}</strong><span>{entry.value}{entry.url ? ` · ${entry.url}` : ''}</span></div>)}
                    <form onSubmit={addLink}><input placeholder={t('register.colLabel')} value={link.label} onChange={(e) => setLink({ ...link, label: e.target.value })} required /><input placeholder={t('common.value')} value={link.value} onChange={(e) => setLink({ ...link, value: e.target.value })} /><input placeholder={t('register.linkOrRef')} value={link.url} onChange={(e) => setLink({ ...link, url: e.target.value })} /><button>{t('common.add')}</button></form>
                  </section>
                  <section>
                    <h3><Paperclip size={16} /> {t('register.attachments')}</h3>
                    {selected.attachments.map((attachment) => <button className="register-file" key={attachment.id} onClick={() => void RegisterService.openAttachment(attachment.path)}><Paperclip size={14} /> {attachment.name}</button>)}
                    <label className="register-file-add"><Plus size={15} /> {t('register.addFile')}<input type="file" accept="application/pdf,image/png,image/jpeg,image/webp" onChange={(event) => void attach(selected.id, event.target.files)} /></label>
                  </section>
                </div>
              </article>
            ) : <div className="register-detail-empty"><FileText size={38} /><p>{t('register.selectDocument')}</p></div>}
          </div>
        </main>
      </div>
      <ConfirmModal
        isOpen={Boolean(deleteId)}
        title={t('register.deleteTitle')}
        message={t('register.deleteMessage')}
        onCancel={() => setDeleteId(null)}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
};

export default Register;
