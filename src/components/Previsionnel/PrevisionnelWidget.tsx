import React from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface PrevisionnelWidgetProps {
  title: string;
  description?: string;
  widgetType?: string;
  onRemove?: () => void;
  children: React.ReactNode;
}

const PrevisionnelWidget: React.FC<PrevisionnelWidgetProps> = ({
  title,
  description,
  widgetType,
  onRemove,
  children,
}) => {
  const { t } = useTranslation();
  return (
    <section
      className="previsionnel-widget"
      data-widget-type={widgetType}
      aria-label={description ? `${title} — ${description}` : title}
    >
      <header className="previsionnel-widget-header">
        <div className="previsionnel-widget-header-text">
          <h3>{title}</h3>
          {description ? <p className="previsionnel-widget-desc">{description}</p> : null}
        </div>
        {onRemove && (
          <div className="previsionnel-widget-actions">
            <button
              type="button"
              className="previsionnel-icon-btn"
              onClick={onRemove}
              aria-label={t('previsionnel.hideWidget')}
            >
              <X size={14} />
            </button>
          </div>
        )}
      </header>
      <div className="previsionnel-widget-body">{children}</div>
    </section>
  );
};

export default PrevisionnelWidget;
