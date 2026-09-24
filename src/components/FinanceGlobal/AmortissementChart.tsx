import React from 'react';
import { AmortissementSeries } from '../../types/amortissement';
import { ChartGranularity } from '../../types/projection';
import AmortissementChartView from '../Amortissement/AmortissementChartView';

interface AmortissementChartProps {
  series: AmortissementSeries | null;
  granularity: ChartGranularity;
}

const AmortissementChart: React.FC<AmortissementChartProps> = (props) => (
  <AmortissementChartView {...props} showExcelExport />
);

export default AmortissementChart;
