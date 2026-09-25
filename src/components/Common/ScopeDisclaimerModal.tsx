import React from 'react';
import { useTranslation } from 'react-i18next';
import Modal from './Modal';

interface ScopeDisclaimerModalProps {
  isOpen: boolean;
  onAcknowledge: () => void;
}

const ScopeDisclaimerModal: React.FC<ScopeDisclaimerModalProps> = ({ isOpen, onAcknowledge }) => {
  const { t } = useTranslation();
  return (
    <Modal isOpen={isOpen} title={t('legal.scopeTitle')} onClose={onAcknowledge} dismissible={false}>
      <div className="flex flex-col gap-3 text-sm" style={{ color: 'var(--invoicing-gray-700)' }}>
        <p>{t('legal.scopeLead')}</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>{t('legal.scopeItemTreasury')}</li>
          <li>{t('legal.scopeItemComplement')}</li>
          <li>{t('legal.scopeItemNotFec')}</li>
          <li>{t('legal.scopeItemNotCash')}</li>
          <li>{t('legal.scopeItemNotPa')}</li>
        </ul>
        <p>{t('legal.scopeUserDuty')}</p>
        <div>
          <button type="button" className="ct-btn-primary" onClick={onAcknowledge}>
            {t('legal.scopeAck')}
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default ScopeDisclaimerModal;
