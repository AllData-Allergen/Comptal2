import React from 'react';

interface PrevisionnelChartFrameProps {
  children: React.ReactNode;
  /** Hauteur dynamique (ex. barres horizontales nombreuses). */
  autoHeightPx?: number;
  className?: string;
}

/**
 * Cadre de confinement pour Chart.js (maintainAspectRatio: false).
 * Empêche le canvas absolu de déborder sur les widgets voisins.
 */
const PrevisionnelChartFrame: React.FC<PrevisionnelChartFrameProps> = ({
  children,
  autoHeightPx,
  className,
}) => {
  const auto = typeof autoHeightPx === 'number' && autoHeightPx > 0;
  return (
    <div
      className={`previsionnel-chart-h${auto ? ' is-auto' : ''}${className ? ` ${className}` : ''}`}
      style={auto ? { minHeight: autoHeightPx, height: autoHeightPx } : undefined}
    >
      {children}
    </div>
  );
};

export default PrevisionnelChartFrame;
