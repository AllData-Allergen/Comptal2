import React, { useCallback, useEffect, useState } from 'react';
import { Plus, RefreshCw, Undo2 } from 'lucide-react';
import { toast } from 'react-toastify';
import { Logger } from '../../services/logger';
import { MicroEnterpriseService } from '../../services/MicroEnterpriseService';
import type {
  MicroEnterpriseConfig,
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

const MicroReceiptBookPanel: React.FC = () => {
  const [config, setConfig] = useState<MicroEnterpriseConfig | null>(null);
  const [receipts, setReceipts] = useState<MicroReceipt[]>([]);
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
      const current = await MicroEnterpriseService.loadConfigSafe();
      await MicroEnterpriseService.backfillInvoicePayments();
      const items = await MicroEnterpriseService.listReceipts(
        `${current.fiscalYear}-01-01`,
        `${current.fiscalYear}-12-31`
      );
      setConfig(current);
      setReceipts(items);
    } catch (error) {
      Logger.error('MicroReceiptBookPanel.load', error);
      toast.error(error instanceof Error ? error.message : 'Chargement du livre impossible');
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

  if (loading) {
    return <div className="ct-card">Chargement du livre des recettes…</div>;
  }

  return (
    <div className="micro-panel micro-receipts-panel">
      <section className="ct-card">
        <div className="micro-section-heading">
          <div>
            <h2>Ajouter une recette sans facture liée</h2>
            <p className="ct-hint">
              Les paiements de factures sont ajoutés automatiquement. Utilisez ce formulaire pour
              un encaissement exceptionnel ou importé.
            </p>
          </div>
          <button className="ct-btn-secondary" type="button" onClick={() => void load()}>
            <RefreshCw size={16} /> Actualiser
          </button>
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
            type="button"
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
            <h2>Livre des recettes {config?.fiscalYear}</h2>
            <p className="ct-hint">
              Les écritures sont chronologiques et inaltérables. Une correction crée une
              contrepassation. Les générations PDF, CSV et Excel sont disponibles dans Registre.
            </p>
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
                        type="button"
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

export default MicroReceiptBookPanel;
