import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import { FileText, Mail, Paperclip, Trash2 } from 'lucide-react';
import { ImmobilisationAttachment } from '../../types/amortissement';
import { AmortissementService } from '../../services/AmortissementService';
import { Logger } from '../../services/logger';

const ACCEPT = '.pdf,.eml,.msg,image/*,.png,.jpg,.jpeg,.webp';

interface ImmobilisationAttachmentsPanelProps {
  immobilisationId: string;
  onChanged?: () => void;
}

function iconForMime(mime: string) {
  if (mime.includes('pdf')) return <FileText size={14} />;
  if (mime.includes('mail') || mime.includes('message') || mime.includes('outlook')) {
    return <Mail size={14} />;
  }
  return <Paperclip size={14} />;
}

const ImmobilisationAttachmentsPanel: React.FC<ImmobilisationAttachmentsPanelProps> = ({
  immobilisationId,
  onChanged,
}) => {
  const { t } = useTranslation();
  const fileRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<ImmobilisationAttachment[]>([]);
  const [busy, setBusy] = useState(false);

  const reload = async () => {
    const next = await AmortissementService.listAttachments(immobilisationId);
    setItems(next);
  };

  useEffect(() => {
    void reload().catch((err) => {
      Logger.error('ImmobilisationAttachmentsPanel.load', err);
    });
  }, [immobilisationId]);

  const attach = async (file: File) => {
    setBusy(true);
    try {
      await AmortissementService.addAttachment(immobilisationId, file);
      toast.success(t('amortissement.attachmentAdded'));
      await reload();
      onChanged?.();
    } catch (err) {
      Logger.error('ImmobilisationAttachmentsPanel.attach', err);
      toast.error(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setBusy(true);
    try {
      await AmortissementService.removeAttachment(id);
      toast.success(t('amortissement.attachmentRemoved'));
      await reload();
      onChanged?.();
    } catch (err) {
      Logger.error('ImmobilisationAttachmentsPanel.remove', err);
      toast.error(t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  const open = (path: string) => {
    void AmortissementService.openAttachment(path).catch((err) => {
      Logger.error('ImmobilisationAttachmentsPanel.open', err);
      toast.error(t('common.error'));
    });
  };

  return (
    <div className="amortissement-attachments">
      <div className="amortissement-attachments-head">
        <h4>
          <Paperclip size={16} />
          {t('amortissement.attachments')}
          <span className="amortissement-attachments-count">{items.length}</span>
        </h4>
        <button
          type="button"
          className="ct-btn-secondary"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
        >
          {t('amortissement.addAttachment')}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept={ACCEPT}
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) void attach(file);
          }}
        />
      </div>
      <p className="amortissement-attachments-hint">{t('amortissement.attachmentsHint')}</p>
      {items.length === 0 ? (
        <p className="amortissement-attachments-empty">{t('amortissement.noAttachments')}</p>
      ) : (
        <ul className="amortissement-attachments-list">
          {items.map((item) => (
            <li key={item.id}>
              <button type="button" className="amortissement-file" onClick={() => open(item.path)}>
                {iconForMime(item.mimeType)}
                <span>{item.name}</span>
              </button>
              <button
                type="button"
                className="ct-btn-secondary"
                style={{ padding: 4 }}
                disabled={busy}
                onClick={() => void remove(item.id)}
                title={t('common.delete')}
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default ImmobilisationAttachmentsPanel;
