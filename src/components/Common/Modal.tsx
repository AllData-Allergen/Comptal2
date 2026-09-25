import React, { useEffect } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: string;
  /** Si false, seul le bouton explicite ferme la modale (pas Échap, ni clic extérieur, ni X). */
  dismissible?: boolean;
}

/** Modale générique (remplace window.confirm/alert, interdits par les règles projet). */
const Modal: React.FC<ModalProps> = ({
  isOpen,
  title,
  onClose,
  children,
  footer,
  maxWidth,
  dismissible = true,
}) => {
  useEffect(() => {
    if (!isOpen || !dismissible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dismissible, isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 animate-fade-in"
      onMouseDown={(e) => {
        if (dismissible && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="ct-card w-full mx-4 flex flex-col max-h-[85vh]"
        style={{ maxWidth: maxWidth ?? '480px' }}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold" style={{ color: 'var(--invoicing-gray-900)' }}>
            {title}
          </h2>
          {dismissible && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-500 dark:text-gray-400"
            >
              <X size={18} />
            </button>
          )}
        </div>
        <div className="overflow-y-auto flex-1">{children}</div>
        {footer && <div className="flex justify-end gap-3 mt-6">{footer}</div>}
      </div>
    </div>
  );
};

export default Modal;
