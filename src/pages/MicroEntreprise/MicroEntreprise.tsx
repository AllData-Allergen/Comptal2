import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import {
  AlertTriangle,
  BookOpenCheck,
  CalendarClock,
  Download,
  FileSpreadsheet,
  FileText,
  Landmark,
  Plus,
  RefreshCw,
  Settings,
  WalletCards,
  Undo2,
} from 'lucide-react';
import { ExportService } from '../../services/ExportService';
import { Logger } from '../../services/logger';
import {
  defaultMicroEnterpriseConfig,
  MicroEnterpriseService,
} from '../../services/MicroEnterpriseService';
import { MicroEnterprisePDFService } from '../../services/MicroEnterprisePDFService';
import {
  MicroDeadline,
  MicroEnterpriseConfig,
  MicroEnterpriseSummary,
  MicroPaymentMethod,
  MicroReceipt,
} from '../../types/microEnterprise';
import { formatMoney } from '../../utils/amounts';
import { formatFrDate } from '../../utils/dateFormats';
import '../../styles/micro-enterprise-custom.css';

const PAYMENT_METHODS: Array<{ value: MicroPaymentMethod; label: string }> = [
  { value: 'virement', label: 'Virement' },
  { value: 'cheque', label: 'Chèque' },
  { value: 'especes', label: 'Espèces' },
  { value: 'cb', label: 'Carte bancaire' },
  { value: 'prelevement', label: 'Prélèvement' },
  { value: 'autre', label: 'Autre' },
];

const emptySummary = (year: number): MicroEnterpriseSummary => ({
  periodStart: `${year}-01-01`,
  periodEnd: `${year}-12-31`,
  periodCollected: 0,
  yearCollected: 0,
  socialContributions: 0,
  trainingContribution: 0,
  incomeTaxProvision: 0,
  totalProvision: 0,
  toolsCost: 0,
  estimatedRemainder: 0,
  microThresholdProgress: 0,
  vatBaseProgress: 0,
  vatToleranceProgress: 0,
  warningLevel: 0,
});

const MicroEntreprise: React.FC = () => {
  const navigate = useNavigate();
  const [config, setConfig] = useState<MicroEnterpriseConfig>(defaultMicroEnterpriseConfig());
  const [receipts, setReceipts] = useState<MicroReceipt[]>([]);
  const [summary, setSummary] = useState<MicroEnterpriseSummary>(
    emptySummary(new Date().getFullYear())
  );
  const [deadlines, setDeadlines] = useState<MicroDeadline[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    receivedDate: new Date().toISOString().slice(0, 10),
    clientName: '',
    description: '',
    amount: '',
    paymentMethod: 'virement' as MicroPaymentMethod,
    reference: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const current = (await MicroEnterpriseService.loadConfig()) ??
        (await MicroEnterpriseService.initializeProfile());
      await MicroEnterpriseService.backfillInvoicePayments();
      const [items, indicators, nextDeadlines] = await Promise.all([
        MicroEnterpriseService.listReceipts(
          `${current.fiscalYear}-01-01`,
          `${current.fiscalYear}-12-31`
        ),
        MicroEnterpriseService.summary(
          `${current.fiscalYear}-01-01`,
          `${current.fiscalYear}-12-31`
        ),
        MicroEnterpriseService.upcomingDeadlines(),
      ]);
      setConfig(current);
      setReceipts(items);
      setSummary(indicators);
      setDeadlines(nextDeadlines.slice(0, 8));
    } catch (error) {
      Logger.error('MicroEntreprise.load', error);
      toast.error(error instanceof Error ? error.message : 'Chargement impossible');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const addReceipt = async () => {
    setSaving(true);
    try {
      await MicroEnterpriseService.addManualReceipt({
        receivedDate: form.receivedDate,
        clientName: form.clientName,
        description: form.description,
        amount: Number(form.amount.replace(',', '.')),
        paymentMethod: form.paymentMethod,
        reference: form.reference,
      });
      setForm((previous) => ({
        ...previous,
        clientName: '',
        description: '',
        amount: '',
        reference: '',
      }));
      toast.success('Recette ajoutée au livre');
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Impossible d'ajouter la recette");
    } finally {
      setSaving(false);
    }
  };

  const reverseReceipt = async (receipt: MicroReceipt) => {
    if (!window.confirm(`Créer une contrepassation pour la recette n° ${receipt.sequence} ?`)) return;
    try {
      await MicroEnterpriseService.reverseReceipt(receipt.id);
      toast.success('Contrepassation ajoutée');
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Contrepassation impossible');
    }
  };

  const createForecast = async () => {
    try {
      await MicroEnterpriseService.createForecastProvision();
      toast.success('Prévisionnel micro-entreprise prêt');
      navigate('/previsionnel');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Création du prévisionnel impossible');
    }
  };

  const thresholdItems = useMemo(
    () => [
      {
        label: 'Plafond du régime micro',
        value: summary.microThresholdProgress,
        amount: config.microThreshold,
      },
      {
        label: 'Franchise en base de TVA',
        value: summary.vatBaseProgress,
        amount: config.vatBaseThreshold,
      },
      {
        label: 'Seuil majoré de TVA',
        value: summary.vatToleranceProgress,
        amount: config.vatToleranceThreshold,
      },
    ],
    [config, summary]
  );

  if (loading) {
    return <div className="ct-card">Chargement du module micro-entreprise…</div>;
  }

  return (
    <div className="micro-page">
      <header className="micro-header">
        <div>
          <p className="micro-eyebrow">Profil TPE · Régime micro</p>
          <h1>Micro-entreprise</h1>
          <p>
            Livre des recettes, chiffre d’affaires encaissé, provisions et échéances locales.
          </p>
        </div>
        <div className="micro-header-actions">
          <button className="ct-btn-secondary" onClick={() => void load()}>
            <RefreshCw size={16} /> Actualiser
          </button>
          <button className="ct-btn-secondary" onClick={() => void createForecast()}>
            <CalendarClock size={16} /> Créer le prévisionnel
          </button>
          <Link className="ct-btn-primary" to="/parametre?tab=organization">
            <Settings size={16} /> Régler les taux et seuils
          </Link>
        </div>
      </header>

      <div className="micro-scope">
        <AlertTriangle size={18} />
        <span>
          Comptal2.1 calcule des estimations locales. Il ne télédéclare pas à l’URSSAF ou aux impôts,
          ne produit pas de FEC et n’est pas une plateforme agréée.
        </span>
      </div>

      {summary.warningLevel > 0 && (
        <div className={`micro-threshold-alert level-${summary.warningLevel}`} role="status">
          <AlertTriangle size={18} />
          <span>
            <b>Alerte à {summary.warningLevel} %.</b> Le CA encaissé de l’année {config.fiscalYear}{' '}
            atteint {formatMoney(summary.yearCollected)}. L’alerte compare les encaissements nets au
            plus proche des seuils « régime micro » ({formatMoney(config.microThreshold)}) et
            « franchise TVA » ({formatMoney(config.vatBaseThreshold)}).
          </span>
        </div>
      )}

      <section className="micro-kpis">
        <article>
          <WalletCards size={20} />
          <span>CA encaissé {config.fiscalYear}</span>
          <strong>{formatMoney(summary.yearCollected)}</strong>
        </article>
        <article>
          <Landmark size={20} />
          <span>Cotisations + CFP à provisionner</span>
          <strong>{formatMoney(summary.socialContributions + summary.trainingContribution)}</strong>
        </article>
        <article>
          <FileText size={20} />
          <span>Versement libératoire</span>
          <strong>{formatMoney(summary.incomeTaxProvision)}</strong>
        </article>
        <article>
          <BookOpenCheck size={20} />
          <span>Reste estimé avant autres impôts</span>
          <strong>{formatMoney(summary.estimatedRemainder)}</strong>
        </article>
      </section>

      <div className="micro-grid-two">
        <section className="ct-card">
          <h2>Suivi des seuils</h2>
          <p className="ct-hint">
            Calcul annuel sur les encaissements enregistrés. Les valeurs sont modifiables dans
            Organisation.
          </p>
          <div className="micro-thresholds">
            {thresholdItems.map((item) => (
              <div key={item.label}>
                <div className="micro-threshold-label">
                  <span>{item.label}</span>
                  <b>
                    {Math.min(item.value, 999).toFixed(1)} % · {formatMoney(item.amount)}
                  </b>
                </div>
                <div className="micro-progress">
                  <span
                    className={item.value >= 100 ? 'danger' : item.value >= 75 ? 'warning' : ''}
                    style={{ width: `${Math.min(item.value, 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="ct-card">
          <h2><CalendarClock size={19} /> Prochaines échéances</h2>
          <div className="micro-deadlines">
            {deadlines.map((deadline) => (
              <div key={deadline.id}>
                <time>{formatFrDate(deadline.date)}</time>
                <span>
                  <b>{deadline.label}</b>
                  <small>{deadline.detail}</small>
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="ct-card">
        <div className="micro-section-heading">
          <div>
            <h2>Ajouter une recette sans facture liée</h2>
            <p className="ct-hint">
              Les paiements de factures sont ajoutés automatiquement. Utilisez ce formulaire pour
              un encaissement exceptionnel ou importé.
            </p>
          </div>
        </div>
        <div className="micro-receipt-form">
          <label>
            Date
            <input
              type="date"
              value={form.receivedDate}
              onChange={(event) => setForm({ ...form, receivedDate: event.target.value })}
            />
          </label>
          <label>
            Client
            <input
              value={form.clientName}
              onChange={(event) => setForm({ ...form, clientName: event.target.value })}
            />
          </label>
          <label className="wide">
            Nature de la recette
            <input
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
            />
          </label>
          <label>
            Montant encaissé
            <input
              inputMode="decimal"
              value={form.amount}
              onChange={(event) => setForm({ ...form, amount: event.target.value })}
            />
          </label>
          <label>
            Règlement
            <select
              value={form.paymentMethod}
              onChange={(event) =>
                setForm({ ...form, paymentMethod: event.target.value as MicroPaymentMethod })
              }
            >
              {PAYMENT_METHODS.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
          </label>
          <label>
            Référence
            <input
              value={form.reference}
              onChange={(event) => setForm({ ...form, reference: event.target.value })}
            />
          </label>
          <button
            className="ct-btn-primary"
            disabled={saving || !form.clientName || !form.description || !form.amount}
            onClick={() => void addReceipt()}
          >
            <Plus size={16} /> Ajouter au livre
          </button>
        </div>
      </section>

      <section className="ct-card">
        <div className="micro-section-heading">
          <div>
            <h2>Livre des recettes {config.fiscalYear}</h2>
            <p className="ct-hint">
              Les écritures sont chronologiques et inaltérables. Une correction crée une
              contrepassation.
            </p>
          </div>
          <div className="micro-export-actions">
            <button
              className="ct-btn-secondary"
              onClick={() => void ExportService.exportMicroReceiptsCsv(config.fiscalYear)}
            >
              <Download size={16} /> CSV
            </button>
            <button
              className="ct-btn-secondary"
              onClick={() => void ExportService.exportMicroReceiptsExcel(config.fiscalYear)}
            >
              <FileSpreadsheet size={16} /> Excel
            </button>
            <button
              className="ct-btn-secondary"
              onClick={() => void MicroEnterprisePDFService.exportReceiptBook(receipts, config)}
            >
              <FileText size={16} /> PDF
            </button>
          </div>
        </div>
        <div className="micro-table-wrap">
          <table className="micro-table">
            <thead>
              <tr>
                <th>N°</th>
                <th>Date</th>
                <th>Client</th>
                <th>Nature</th>
                <th>Règlement</th>
                <th>Référence</th>
                <th>Montant</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {receipts.length === 0 && (
                <tr><td colSpan={8} className="micro-empty">Aucune recette enregistrée.</td></tr>
              )}
              {receipts.map((receipt) => (
                <tr key={receipt.id} className={receipt.source === 'reversal' ? 'is-reversal' : ''}>
                  <td>{receipt.sequence}</td>
                  <td>{formatFrDate(receipt.receivedDate)}</td>
                  <td>{receipt.clientName}</td>
                  <td>{receipt.description}</td>
                  <td>{PAYMENT_METHODS.find((item) => item.value === receipt.paymentMethod)?.label}</td>
                  <td>{receipt.invoiceNumber || receipt.reference || '—'}</td>
                  <td className="amount">{formatMoney(receipt.amount)}</td>
                  <td>
                    {receipt.source !== 'reversal' && (
                      <button
                        className="ct-btn-icon"
                        title="Créer une contrepassation"
                        onClick={() => void reverseReceipt(receipt)}
                      >
                        <Undo2 size={15} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};

export default MicroEntreprise;
