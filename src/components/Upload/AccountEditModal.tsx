import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Modal from '../Common/Modal';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  initial: { id: number; code: string; name: string; color: string; initialBalance: number };
  onSave: (fields: { code: string; name: string; color: string; initialBalance: number }) => Promise<void>;
}

const AccountEditModal: React.FC<Props> = ({ isOpen, onClose, initial, onSave }) => {
  const { t } = useTranslation();
  const [code, setCode] = useState(initial.code);
  const [name, setName] = useState(initial.name);
  const [color, setColor] = useState(initial.color);
  const [balance, setBalance] = useState(String(initial.initialBalance));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setCode(initial.code);
      setName(initial.name);
      setColor(initial.color);
      setBalance(String(initial.initialBalance));
    }
  }, [isOpen, initial]);

  const handleSave = async () => {
    if (!code.trim() || !name.trim()) return;
    setBusy(true);
    try {
      await onSave({ code: code.toUpperCase().trim(), name: name.trim(), color, initialBalance: parseFloat(balance.replace(',', '.')) || 0 });
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal isOpen={isOpen} title={t('settings.accounts.title')} onClose={onClose} footer={
      <>
        <button className="ct-btn-secondary" onClick={onClose}>{t('common.cancel')}</button>
        <button className="ct-btn-primary" disabled={busy} onClick={() => void handleSave()}>{t('common.save')}</button>
      </>
    }>
      <div className="flex flex-col gap-3">
        <label className="ct-label">{t('common.code')}<input className="ct-input w-full mt-1" value={code} onChange={(e) => setCode(e.target.value)} /></label>
        <label className="ct-label">{t('common.name')}<input className="ct-input w-full mt-1" value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label className="ct-label">{t('common.color')}<input type="color" className="w-16 h-8 mt-1" value={color} onChange={(e) => setColor(e.target.value)} /></label>
        <label className="ct-label">{t('settings.accounts.initialBalance')}<input className="ct-input w-full mt-1" value={balance} onChange={(e) => setBalance(e.target.value)} /></label>
      </div>
    </Modal>
  );
};

export default AccountEditModal;
