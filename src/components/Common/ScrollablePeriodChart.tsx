import React from 'react';
import { ChartGranularity } from '../../types/projection';
import { periodChartMinWidth } from '../../utils/chartPeriodAxis';

interface ScrollablePeriodChartProps {
  granularity: ChartGranularity;
  labelCount: number;
  className?: string;
  children: React.ReactNode;
}

/** En granularité Jour, élargit le canvas et active un scroll horizontal. */
const ScrollablePeriodChart: React.FC<ScrollablePeriodChartProps> = ({
  granularity,
  labelCount,
  className,
  children,
}) => {
  const minWidth = periodChartMinWidth(labelCount, granularity);
  const scrollable = Boolean(minWidth);

  return (
    <div
      className={`chart-x-scroll${scrollable ? ' is-day' : ''}${className ? ` ${className}` : ''}`}
    >
      <div
        className="chart-x-scroll-inner"
        style={minWidth ? { minWidth: `${minWidth}px` } : undefined}
      >
        {children}
      </div>
    </div>
  );
};

export default ScrollablePeriodChart;
