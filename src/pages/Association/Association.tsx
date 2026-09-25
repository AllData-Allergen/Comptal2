import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowUpDown, Banknote, FileCheck2, Link2, Package, Plus, ReceiptText, RefreshCw, Sparkles, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import WideModal from '../../components/Common/WideModal';
import DonationFormModal from '../../components/Association/DonationFormModal';
import ReceiptSignatureModal from '../../components/Association/ReceiptSignatureModal';
import RegistreRecusPanel from '../../components/Association/RegistreRecusPanel';
import { AssociationConfigService } from '../../services/AssociationConfigService';
import { AssociationDemoService } from '../../services/AssociationDemoService';
import { AssociationPDFService } from '../../services/AssociationPDFService';
import { AttachmentService } from '../../services/AttachmentService';
import { ClientService } from '../../services/ClientService';
import { ConfigService } from '../../services/ConfigService';
import {
  DonationService,
  DonationSummary,
  DonationTransaction,
} from '../../services/DonationService';
import { Logger } from '../../services/logger';
import { RegistreRecusService } from '../../services/RegistreRecusService';
import { AssociationConfig, Donation, DonationRule, ReceiptSignature } from '../../types/association';
import { Category } from '../../types/models';
import { Client } from '../../types/invoice';
import { clientDisplayName, formatMoney } from '../../utils/invoiceFormat';
import { registerDateLocale } from '../../utils/registerI18n';
import '../../styles/association-custom.css';
import '../../styles/organization-custom.css';

const TODAY = new Date().toISOString().slice(0, 10);
const YEAR_START = `${new Date().getFullYear()}-01-01`;
const EMPTY_SUMMARY: DonationSummary = {
  count: 0, total: 0, anonymousTotal: 0, natureTotal: 0, receiptsPending: 0,
};

type Tab = 'dons' | 'transactions' | 'rules' | 'recus';

const Association: React.FC = () => {
  const { t, i18n } = useTranslation();
  const dateLocale = registerDateLocale(i18n.language);
  const [tab, setTab] = useState<Tab>('dons');
  const [donations, setDonations] = useState<Donation[]>([]);
  const [donors, setDonors] = useState<Client[]>([]);
  const [allContacts, setAllContacts] = useState<Client[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [transactions, setTransactions] = useState<DonationTransaction[]>([]);
  const [rules, setRules] = useState<DonationRule[]>([]);
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [start, setStart] = useState(YEAR_START);
  const [end, setEnd] = useState(TODAY);
  const [search, setSearch] = useState('');
  const [donorFilter, setDonorFilter] = useState('');
  const [sortBy, setSortBy] = useState<'date' | 'donor'>('date');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [signPrompt, setSignPrompt] = useState<'batch' | 'period' | null>(null);
  const [assoConfig, setAssoConfig] = useState<AssociationConfig | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [ruleFor, setRuleFor] = useState<DonationTransaction | null>(null);
  const [categoryLink, setCategoryLink] = useState({ categoryCode: '', contactId: '' });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [nextDonations, nextDonors, nextContacts, nextCategories, nextTransactions, nextRules, nextSummary, nextConfig] = await Promise.all([
      DonationService.list(start, end),
      DonationService.listDonors(),
      ClientService.loadClients(),
      ConfigService.listCategories(),
      DonationService.listIncomingTransactions(),
      DonationService.listRules(),
      DonationService.summary(start, end),
      AssociationConfigService.getOrCreateConfig(),
    ]);
    setDonations(nextDonations);
    setDonors(nextDonors);
    setAllContacts(nextContacts.filter((c) => !c.archived));
    setCategories(nextCategories.filter((c) => c.code !== 'X'));
    setTransactions(nextTransactions);
    setRules(nextRules);
    setSummary(nextSummary);
    setAssoConfig(nextConfig);
    setSelectedIds((current) => current.filter((id) => nextDonations.some((donation) => donation.id === id && !donation.receiptId)));
  }, [start, end]);

  useEffect(() => {
    void (async () => {
      try {
        await load();
      } catch (error) {
        Logger.error('DonationManagement.load', error);
      }
    })();
  }, [load]);

  const seedExamples = async () => {
    setBusy(true);
    try {
      const result = await AssociationDemoService.seed();
      toast.success(t('association.exampleLoaded', result));
      await load();
    } catch (error) {
      Logger.error('DonationManagement.seedExamples', error);
      toast.error(error instanceof Error ? error.message : t('association.exampleFail'));
    } finally {
      setBusy(false);
    }
  };

  const donorName = (contactId: string | null, fallback?: string) => {
    if (!contactId) return fallback || t('association.anonymousDonor');
    const contact = donors.find((item) => item.id === contactId);
    return contact ? clientDisplayName(contact) : fallback || t('association.unknownContact');
  };

  const filteredDonations = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('fr');
    const rows = donations.filter((donation) => {
      if (donorFilter === '__anonymous__') {
        if (!donation.anonymous) return false;
      } else if (donorFilter && donation.contactId !== donorFilter) {
        return false;
      }
      if (!query) return true;
      return `${donorName(donation.contactId, donation.donorLabel)} ${donation.description ?? ''}`
        .toLocaleLowerCase('fr').includes(query);
    });
    return [...rows].sort((a, b) => {
      if (sortBy === 'donor') {
        const cmp = donorName(a.contactId, a.donorLabel).localeCompare(
          donorName(b.contactId, b.donorLabel),
          'fr'
        );
        if (cmp !== 0) return cmp;
      }
      return (b.datePerception || b.date).localeCompare(a.datePerception || a.date);
    });
  }, [donations, donors, search, donorFilter, sortBy, t]);

  const periodDonors = useMemo(() => {
    const ids = [...new Set(donations.map((donation) => donation.contactId).filter(Boolean) as string[])];
    return ids
      .map((id) => donors.find((donor) => donor.id === id))
      .filter((donor): donor is Client => Boolean(donor))
      .sort((a, b) => clientDisplayName(a).localeCompare(clientDisplayName(b), 'fr'));
  }, [donations, donors]);

  const selectedDonor = donorFilter && donorFilter !== '__anonymous__'
    ? donors.find((donor) => donor.id === donorFilter) ?? null
    : null;

  const pendingForSelectedDonor = useMemo(() => {
    if (!selectedDonor) return [];
    return donations.filter((donation) =>
      donation.contactId === selectedDonor.id
      && !donation.anonymous
      && donation.receiptEligible
      && !donation.receiptId
    );
  }, [donations, selectedDonor]);

  const alreadyEmittedForSelectedDonor = useMemo(() => {
    if (!selectedDonor) return [];
    return donations.filter((donation) =>
      donation.contactId === selectedDonor.id && Boolean(donation.receiptId)
    );
  }, [donations, selectedDonor]);

  const linkCategory = async () => {
    if (!categoryLink.categoryCode || !categoryLink.contactId) {
      toast.info(t('association.chooseCategoryAndContact'));
      return;
    }
    setBusy(true);
    try {
      const linked = await DonationService.linkCategoryToContact(
        categoryLink.categoryCode,
        categoryLink.contactId
      );
      toast.success(
        linked > 0
          ? t('association.categoryLinked', { count: linked })
          : t('association.ruleSavedNoTx')
      );
      setCategoryLink({ categoryCode: '', contactId: '' });
      await load();
    } catch (error) {
      Logger.error('DonationManagement.linkCategory', error);
      toast.error(error instanceof Error ? error.message : t('association.linkFail'));
    } finally {
      setBusy(false);
    }
  };

  const link = async (transaction: DonationTransaction, contactId: string) => {
    if (!contactId) return;
    await DonationService.linkTransaction(transaction, contactId);
    toast.success(t('association.txLinked'));
    await load();
  };

  const pendingReceipts = useMemo(
    () => filteredDonations.filter((donation) =>
      donation.receiptEligible && !donation.anonymous && !donation.receiptId && donation.contactId
    ),
    [filteredDonations]
  );

  const selectedPending = useMemo(
    () => pendingReceipts.filter((donation) => selectedIds.includes(donation.id)),
    [pendingReceipts, selectedIds]
  );

  const toggleSelected = (id: string) => {
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  };

  const toggleAllPending = () => {
    setSelectedIds((current) =>
      current.length === pendingReceipts.length ? [] : pendingReceipts.map((donation) => donation.id)
    );
  };

  const rememberSignature = async (signature: ReceiptSignature | null, remember: boolean) => {
    if (!remember || !signature || !assoConfig) return;
    const next = { ...assoConfig, signataireSignature: signature.imageDataUrl };
    await AssociationConfigService.saveConfig(next);
    setAssoConfig(next);
  };

  const emitReceipt = (donation: Donation) => {
    if (!donation.contactId) return;
    setSelectedIds([donation.id]);
    setSignPrompt('batch');
  };

  const requestSelectedReceipts = () => {
    if (selectedPending.length === 0) {
      toast.info(t('association.selectEligible'));
      return;
    }
    setSignPrompt('batch');
  };

  const requestPeriodReceipt = () => {
    if (!selectedDonor) {
      toast.info(t('association.chooseDonorPeriod'));
      return;
    }
    if (pendingForSelectedDonor.length === 0) {
      toast.info(t('association.noEligiblePeriod'));
      return;
    }
    setSignPrompt('period');
  };

  const emitSignedReceipts = async (signature: ReceiptSignature | null, remember: boolean) => {
    const mode = signPrompt;
    setSignPrompt(null);
    setBusy(true);
    try {
      await rememberSignature(signature, remember);
      if (mode === 'period' && selectedDonor) {
        const result = await AssociationPDFService.generateForDonorPeriod(
          selectedDonor,
          donations,
          { start, end },
          { signature }
        );
        await DonationService.markReceipts(result.donationIds, result.receiptId);
        toast.success(
          t('association.periodIssued', {
            numero: result.numero,
            count: result.count,
            amount: formatMoney(result.total),
          })
        );
      } else {
        const targets = selectedPending.length > 0 ? selectedPending : pendingReceipts.filter((donation) => selectedIds.includes(donation.id));
        const items: Array<{ donation: Donation; contact: Client }> = [];
        for (const donation of targets) {
          if (!donation.contactId) continue;
          const contact = await ClientService.getClientById(donation.contactId);
          if (!contact) throw new Error(t('association.donorNotFound'));
          items.push({ donation, contact });
        }
        const results = await AssociationPDFService.generateForDonations(items, { signature });
        for (const result of results) {
          await DonationService.markReceipt(result.donationId, result.receiptId);
        }
        toast.success(
          results.length === 1
            ? t('association.oneReceiptArchived', { numero: results[0].numero })
            : t('association.manyReceiptsArchived', { count: results.length })
        );
      }
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('association.generateFail'));
    } finally {
      setBusy(false);
    }
  };

  const openReceipt = async (donation: Donation) => {
    if (!donation.receiptId) return;
    const entry = await RegistreRecusService.getById(donation.receiptId);
    if (!entry?.pdfPath) {
      toast.error(t('association.pdfNotFound'));
      return;
    }
    try {
      await AttachmentService.openRel(entry.pdfPath);
    } catch (error) {
      Logger.error('DonationManagement.openReceipt', error);
      toast.error(t('common.openPdfFail'));
    }
  };

  const applyRules = async () => {
    setBusy(true);
    try {
      const count = await DonationService.applyRules();
      toast.success(t('association.rulesApplied', { count }));
      await load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="donation-page">
      <header className="donation-header">
        <span className="donation-header-icon"><Banknote size={23} /></span>
        <div>
          <h1 data-tour="page-intro-anchor">{t('association.pageTitle')}</h1>
          <p>{t('association.pageHint')}</p>
          <p className="ct-hint">{t('legal.associationDisclaimer')}</p>
        </div>
      </header>

      <div className="donation-toolbar">
        <label>{t('common.from')}<input type="date" value={start} onChange={(event) => setStart(event.target.value)} /></label>
        <label>{t('common.to')}<input type="date" value={end} onChange={(event) => setEnd(event.target.value)} /></label>
        <label>{t('association.donor')}
          <select value={donorFilter} onChange={(event) => setDonorFilter(event.target.value)}>
            <option value="">{t('association.allDonors')}</option>
            {donations.some((donation) => donation.anonymous) && (
              <option value="__anonymous__">{t('association.anonymousDonations')}</option>
            )}
            {periodDonors.map((donor) => (
              <option key={donor.id} value={donor.id}>{clientDisplayName(donor)}</option>
            ))}
          </select>
        </label>
        <label>{t('common.sort')}
          <select value={sortBy} onChange={(event) => setSortBy(event.target.value as 'date' | 'donor')}>
            <option value="date">{t('association.sortByDate')}</option>
            <option value="donor">{t('association.sortByDonor')}</option>
          </select>
        </label>
        <input className="donation-search" value={search} onChange={(event) => setSearch(event.target.value)}
          placeholder={t('association.searchPlaceholder')} />
        {selectedDonor && (
          <button type="button" className="ct-btn-primary" disabled={busy} onClick={requestPeriodReceipt}>
            <ReceiptText size={16} /> {t('association.periodReceipt')}
          </button>
        )}
        {pendingReceipts.length > 0 && (
          <button type="button" className="ct-btn-primary" disabled={busy || selectedPending.length === 0} onClick={requestSelectedReceipts}>
            <ReceiptText size={16} /> {selectedPending.length > 0 ? t('association.generateReceiptsCount', { count: selectedPending.length }) : t('association.generateReceipts')}
          </button>
        )}
        <button type="button" className="ct-btn-secondary" disabled={busy} onClick={() => void seedExamples()}>
          <Sparkles size={16} /> {t('association.exampleData')}
        </button>
        <button type="button" className="ct-btn-primary" onClick={() => setFormOpen(true)}><Plus size={16} /> {t('association.newDonation')}</button>
      </div>

      <div className="donation-kpis">
        <div><span>{t('association.kpiCount')}</span><strong>{summary.count}</strong></div>
        <div><span>{t('association.kpiTotal')}</span><strong>{formatMoney(summary.total)}</strong></div>
        <div><span>{t('association.kpiNature')}</span><strong>{formatMoney(summary.natureTotal)}</strong></div>
        <div><span>{t('association.kpiAnonymous')}</span><strong>{formatMoney(summary.anonymousTotal)}</strong></div>
        <div><span>{t('association.kpiPending')}</span><strong>{summary.receiptsPending}</strong></div>
      </div>

      <div className="donation-tabs">
        <button type="button" className={tab === 'dons' ? 'active' : ''} onClick={() => setTab('dons')}><Package size={16} /> {t('association.dons')}</button>
        <button type="button" className={tab === 'transactions' ? 'active' : ''} onClick={() => setTab('transactions')}><Link2 size={16} /> {t('association.tabTransactions')}</button>
        <button type="button" className={tab === 'rules' ? 'active' : ''} onClick={() => setTab('rules')}><RefreshCw size={16} /> {t('association.tabRules')}</button>
        <button type="button" className={tab === 'recus' ? 'active' : ''} onClick={() => setTab('recus')}><ReceiptText size={16} /> {t('association.recus')}</button>
      </div>

      {tab === 'dons' && (
        <section className="donation-card">
          <div className="donation-section-head"><div><h2>{t('association.journalTitle')}</h2><p>{t('association.journalHint')}</p></div></div>
          <div className="donation-table-wrap">
            <table className="donation-table">
              <thead><tr>
                <th style={{ width: 36 }}>
                  <input
                    type="checkbox"
                    checked={pendingReceipts.length > 0 && selectedPending.length === pendingReceipts.length}
                    onChange={toggleAllPending}
                    aria-label={t('association.selectAllEligible')}
                  />
                </th>
                <th>
                  <button type="button" className="donation-sort" onClick={() => setSortBy('date')}>
                    {t('common.date')} {sortBy === 'date' && <ArrowUpDown size={12} />}
                  </button>
                </th>
                <th>
                  <button type="button" className="donation-sort" onClick={() => setSortBy('donor')}>
                    {t('association.donor')} {sortBy === 'donor' && <ArrowUpDown size={12} />}
                  </button>
                </th>
                <th>{t('association.nature')}</th><th>{t('common.description')}</th><th>{t('association.amountOrValuation')}</th><th>{t('common.source')}</th><th>{t('association.receipt')}</th>
              </tr></thead>
              <tbody>
                {filteredDonations.map((donation) => (
                  <tr key={donation.id}>
                    <td>
                      {donation.receiptEligible && !donation.anonymous && !donation.receiptId && donation.contactId ? (
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(donation.id)}
                          onChange={() => toggleSelected(donation.id)}
                          aria-label={t('association.selectThis')}
                        />
                      ) : null}
                    </td>
                    <td>{new Date(donation.date).toLocaleDateString(dateLocale)}</td>
                    <td><strong>{donorName(donation.contactId, donation.donorLabel)}</strong>{donation.anonymous && <small>{t('association.anonymousNominative')}</small>}</td>
                    <td>{donation.natureDon === 'numeraire' ? `${t('association.numeraire')}${donation.modeVersement ? ` · ${t(`association.mode.${donation.modeVersement}`, { defaultValue: donation.modeVersement })}` : ''}` : donation.natureDon === 'nature' ? t('association.natureDon') : t('association.mecenat')}</td>
                    <td>{donation.description || '—'}{donation.valuationMethod && <small>{t('association.valuationPrefix', { method: donation.valuationMethod })}</small>}</td>
                    <td className="amount">{formatMoney(donation.montant)}</td>
                    <td>{donation.source === 'transaction' ? t('association.sourceTransaction') : t('association.sourceManual')}</td>
                    <td>
                      {donation.receiptId ? (
                        <button type="button" className="ct-btn-secondary" onClick={() => void openReceipt(donation)}>
                          <FileCheck2 size={13} /> {t('association.issued')}
                        </button>
                      ) : donation.receiptEligible && !donation.anonymous
                        ? <button type="button" disabled={busy} className="ct-btn-secondary" onClick={() => void emitReceipt(donation)}>{t('association.emit')}</button>
                        : <span className="donation-status">{t('association.nonNominative')}</span>}
                    </td>
                  </tr>
                ))}
                {filteredDonations.length === 0 && <tr><td colSpan={8} className="donation-empty">{t('association.emptyPeriod')}</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === 'transactions' && (
        <section className="donation-card">
          <div className="donation-section-head"><div><h2>{t('association.correlateTitle')}</h2><p>{t('association.correlateHint')}</p></div></div>
          <div className="donation-transaction-list">
            {transactions.map((transaction) => (
              <div key={transaction.id} className="donation-transaction-row">
                <div><strong>{transaction.label}</strong><small>{new Date(transaction.date).toLocaleDateString(dateLocale)} · {transaction.accountName}</small></div>
                <span>{formatMoney(transaction.credit)}</span>
                <select value={transaction.contactId ?? ''} onChange={(event) => void link(transaction, event.target.value)}>
                  <option value="">{t('association.chooseDonor')}</option>
                  {allContacts.map((donor) => <option key={donor.id} value={donor.id}>{clientDisplayName(donor)}</option>)}
                </select>
                {transaction.donationId
                  ? <button className="ct-btn-secondary" onClick={() => void DonationService.unlinkTransaction(transaction.id).then(load)}>{t('association.unlink')}</button>
                  : <button className="ct-btn-secondary" onClick={() => setRuleFor(transaction)}>{t('association.ruleEllipsis')}</button>}
              </div>
            ))}
            {transactions.length === 0 && <div className="donation-empty">{t('association.noCreditTx')}</div>}
          </div>
        </section>
      )}

      {tab === 'recus' && <RegistreRecusPanel isVisible={tab === 'recus'} start={start} end={end} />}

      {tab === 'rules' && (
        <section className="donation-card">
          <div className="donation-section-head">
            <div>
              <h2>{t('association.rulesTitle')}</h2>
              <p>{t('association.rulesHint')}</p>
            </div>
            <button className="ct-btn-primary" disabled={busy} onClick={() => void applyRules()}>
              <RefreshCw size={16} /> {t('association.applyToTx')}
            </button>
          </div>

          <div className="donation-category-link">
            <label className="org-field">
              <span>{t('association.categoryLabel')}</span>
              <select
                value={categoryLink.categoryCode}
                onChange={(event) => setCategoryLink({ ...categoryLink, categoryCode: event.target.value })}
              >
                <option value="">{t('association.chooseCategory')}</option>
                {categories.map((category) => (
                  <option key={category.code} value={category.code}>
                    {category.code} — {category.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="org-field">
              <span>{t('association.donorContact')}</span>
              <select
                value={categoryLink.contactId}
                onChange={(event) => setCategoryLink({ ...categoryLink, contactId: event.target.value })}
              >
                <option value="">{t('association.chooseContact')}</option>
                {allContacts.map((contact) => (
                  <option key={contact.id} value={contact.id}>{clientDisplayName(contact)}</option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="ct-btn-primary"
              disabled={busy || !categoryLink.categoryCode || !categoryLink.contactId}
              onClick={() => void linkCategory()}
            >
              <Link2 size={16} /> {t('association.linkCategoryContact')}
            </button>
          </div>

          {rules.map((rule) => {
            const category = categories.find((item) => item.code === rule.categoryCode);
            const categoryLabel = category
              ? `${category.code} — ${category.name}`
              : rule.categoryCode;
            return (
              <div className="donation-rule" key={rule.id}>
                <Users size={16} />
                <strong>{donorName(rule.contactId)}</strong>
                <span>
                  {rule.categoryCode && !rule.labelContains
                    ? t('association.ruleCategory', { label: categoryLabel })
                    : `${t('association.ruleLabelContains', { label: rule.labelContains || t('association.ruleLabelAny') })}${rule.categoryCode ? t('association.ruleCategorySuffix', { code: rule.categoryCode }) : ''}`}
                </span>
                <button className="ct-btn-secondary" onClick={() => void DonationService.deleteRule(rule.id).then(load)}>
                  {t('common.delete')}
                </button>
              </div>
            );
          })}
          {rules.length === 0 && (
            <div className="donation-empty">{t('association.noRules')}</div>
          )}
        </section>
      )}

      <DonationFormModal
        isOpen={formOpen}
        donors={allContacts}
        onClose={() => setFormOpen(false)}
        onSaved={load}
      />

      <WideModal isOpen={Boolean(ruleFor)} title={t('association.createRuleTitle')} onClose={() => setRuleFor(null)}>
        {ruleFor && (
          <RuleForm
            transaction={ruleFor}
            donors={allContacts}
            categories={categories}
            onSaved={async () => { setRuleFor(null); await load(); }}
          />
        )}
      </WideModal>

      <ReceiptSignatureModal
        isOpen={signPrompt !== null}
        title={signPrompt === 'period' ? t('association.emitPeriodTitle') : t('association.generateTaxTitle')}
        message={
          signPrompt === 'period' && selectedDonor
            ? `${t('association.periodMessage', {
              name: clientDisplayName(selectedDonor),
              start: new Date(start).toLocaleDateString(dateLocale),
              end: new Date(end).toLocaleDateString(dateLocale),
              count: pendingForSelectedDonor.length,
              amount: formatMoney(pendingForSelectedDonor.reduce((sum, donation) => sum + donation.montant, 0)),
            })}${alreadyEmittedForSelectedDonor.length > 0 ? t('association.periodSkipIssued', { count: alreadyEmittedForSelectedDonor.length }) : ''}`
            : t('association.batchMessage', { count: selectedPending.length })
        }
        donations={signPrompt === 'period' ? pendingForSelectedDonor : selectedPending}
        donors={donors}
        config={assoConfig}
        confirmLabel={signPrompt === 'period' ? t('association.emitSigned') : t('association.generateConfirm')}
        busy={busy}
        onCancel={() => setSignPrompt(null)}
        onConfirm={(signature, remember) => void emitSignedReceipts(signature, remember)}
      />
    </div>
  );
};

const RuleForm: React.FC<{
  transaction: DonationTransaction;
  donors: Client[];
  categories: Category[];
  onSaved: () => Promise<void>;
}> = ({ transaction, donors, categories, onSaved }) => {
  const { t } = useTranslation();
  const [contactId, setContactId] = useState('');
  const [labelContains, setLabelContains] = useState(transaction.label);
  const [categoryCode, setCategoryCode] = useState(transaction.categoryCode ?? '');
  return (
    <div className="donation-form">
      <p>{t('association.ruleIntro')}</p>
      <div className="org-grid">
        <label className="org-field">
          <span>{t('association.donor')}</span>
          <select value={contactId} onChange={(event) => setContactId(event.target.value)}>
            <option value="">{t('common.choose')}</option>
            {donors.map((donor) => (
              <option key={donor.id} value={donor.id}>{clientDisplayName(donor)}</option>
            ))}
          </select>
        </label>
        <label className="org-field">
          <span>{t('association.labelContains')}</span>
          <input value={labelContains} onChange={(event) => setLabelContains(event.target.value)} />
        </label>
        <label className="org-field">
          <span>{t('association.categoryOptional')}</span>
          <select value={categoryCode} onChange={(event) => setCategoryCode(event.target.value)}>
            <option value="">{t('association.noCategory')}</option>
            {categories.map((category) => (
              <option key={category.code} value={category.code}>
                {category.code} — {category.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="donation-form-actions">
        <button
          type="button"
          className="ct-btn-primary"
          disabled={!contactId || (!labelContains.trim() && !categoryCode)}
          onClick={() => void DonationService.saveRule({
            contactId,
            labelContains,
            categoryCode: categoryCode || undefined,
            modeVersement: 'virement',
          }).then(async () => {
            await DonationService.applyRules();
            await onSaved();
          })}
        >
          {t('association.createRule')}
        </button>
      </div>
    </div>
  );
};

export default Association;
