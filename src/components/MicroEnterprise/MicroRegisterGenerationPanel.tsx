import React, { useCallback, useEffect, useState } from 'react';
import { Download, FileSpreadsheet, FileText, RefreshCw } from 'lucide-react';
import { toast } from 'react-toastify';
import { ExportService } from '../../services/ExportService';
import { Logger } from '../../services/logger';
import { MicroEnterprisePDFService } from '../../services/MicroEnterprisePDFService';
import { MicroEnterpriseService } from '../../services/MicroEnterpriseService';
import type { MicroEnterpriseConfig, MicroReceipt } from '../../types/microEnterprise';
import { formatMoney } from '../../utils/amounts';
import '../../styles/micro-enterprise-custom.css';

const MicroRegisterGenerationPanel: React.FC = () => {
  const [config, setConfig] = useState<MicroEnterpriseConfig | null>(null);
  const [receipts, setReceipts] = useState<MicroReceipt[]>([]);
  const [year, setYear] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (requestedYear?: number) => {
    setLoading(true);
    try {
      const current = await MicroEnterpriseService.loadConfigSafe();
      const targetYear = requestedYear ?? current.fiscalYear;
      const items = await MicroEnterpriseService.listReceipts(
        `${targetYear}-01-01`,
        `${targetYear}-12-31`
      );
      setConfig(current);
      setYear(targetYear);
      setReceipts(items);
    } catch (error) {
      Logger.error('MicroRegisterGenerationPanel.load', error);
      toast.error('Chargement du livre des recettes impossible');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const exportPdf = async () => {
    if (!config) return;
    await MicroEnterprisePDFService.exportReceiptBook(receipts, { ...config, fiscalYear: year });
  };

  const total = receipts.reduce((sum, receipt) => sum + receipt.amount, 0);

  return (
    <section className="micro-register-generation">
      <div>
        <span className="micro-eyebrow">Régime micro-entreprise</span>
        <h2>Livre des recettes</h2>
        <p>
          Générez le livre annuel à partir des encaissements conservés dans Facturation.
          Les corrections restent visibles sous forme de contrepassations.
        </p>
      </div>
      <label>
        Exercice
        <input
          type="number"
          min="2000"
          max="2100"
          value={year}
          onChange={(event) => setYear(Number(event.target.value))}
          onBlur={() => void load(year)}
        />
      </label>
      <div className="micro-register-stats">
        <span>{receipts.length} écriture{receipts.length > 1 ? 's' : ''}</span>
        <strong>{formatMoney(total)}</strong>
      </div>
      <div className="micro-export-actions">
        <button
          className="ct-btn-secondary"
          type="button"
          disabled={loading}
          onClick={() => void load(year)}
        >
          <RefreshCw size={16} /> Actualiser
        </button>
        <button
          className="ct-btn-secondary"
          type="button"
          disabled={loading}
          onClick={() => void ExportService.exportMicroReceiptsCsv(year)}
        >
          <Download size={16} /> CSV
        </button>
        <button
          className="ct-btn-secondary"
          type="button"
          disabled={loading}
          onClick={() => void ExportService.exportMicroReceiptsExcel(year)}
        >
          <FileSpreadsheet size={16} /> Excel
        </button>
        <button
          className="ct-btn-primary"
          type="button"
          disabled={loading || !config}
          onClick={() => void exportPdf()}
        >
          <FileText size={16} /> Générer le PDF
        </button>
      </div>
    </section>
  );
};

export default MicroRegisterGenerationPanel;
