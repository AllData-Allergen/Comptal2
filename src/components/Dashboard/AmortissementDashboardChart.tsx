import React from 'react';
import { AmortissementSeries } from '../../types/amortissement';
import { ChartGranularity } from '../../types/projection';
import AmortissementChartView from '../Amortissement/AmortissementChartView';

interface AmortissementDashboardChartProps {
  series: AmortissementSeries | null;
  granularity: ChartGranularity;
}

const AmortissementDashboardChart: React.FC<AmortissementDashboardChartProps> = (props) => (
  <AmortissementChartView {...props} />
);

export default AmortissementDashboardChart;
