import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FileText, Boxes, ReceiptText, BookOpenCheck } from 'lucide-react';
import DocumentsPanel from '../../components/Facturation/DocumentsPanel';
import PostesPanel from '../../components/Facturation/PostesPanel';
import MicroReceiptBookPanel from '../../components/MicroEnterprise/MicroReceiptBookPanel';
import { MicroEnterpriseService } from '../../services/MicroEnterpriseService';
import '../../styles/facturation-custom.css';
import '../../styles/organization-custom.css';

const Facturation: React.FC = () => {
  const { t } = useTranslation();
  const [tab, setTab] = useState<'docs' | 'postes' | 'receipts'>('docs');
  const [microEnabled, setMicroEnabled] = useState(false);

  useEffect(() => {
    void MicroEnterpriseService.isEnabled().then(setMicroEnabled);
  }, []);

  return (
    <div className="inv-page">
      <header className="inv-page-header">
        <span className="inv-page-header-icon"><ReceiptText size={23} /></span>
        <div>
          <h1 data-tour="page-intro-anchor">{t('pages.invoicing')}</h1>
          <p>{t('facturation.pageHint')}</p>
          <p className="ct-hint">{t('legal.invoicingDisclaimer')}</p>
        </div>
      </header>
      <div className="inv-page-tabs">
        <button
          type="button"
          className={tab === 'docs' ? 'active' : ''}
          onClick={() => setTab('docs')}
        >
          <FileText size={16} /> {t('facturation.tabDocs')}
        </button>
        <button
          type="button"
          className={tab === 'postes' ? 'active' : ''}
          onClick={() => setTab('postes')}
        >
          <Boxes size={16} /> {t('facturation.tabPostes')}
        </button>
        {microEnabled && (
          <button
            type="button"
            className={tab === 'receipts' ? 'active' : ''}
            onClick={() => setTab('receipts')}
          >
            <BookOpenCheck size={16} /> Livre des recettes
          </button>
        )}
      </div>
      {tab === 'docs' && <DocumentsPanel />}
      {tab === 'postes' && <PostesPanel kind="facturation" />}
      {tab === 'receipts' && microEnabled && <MicroReceiptBookPanel />}
    </div>
  );
};

export default Facturation;
