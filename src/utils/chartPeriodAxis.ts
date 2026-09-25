import { ChartGranularity } from '../types/projection';

/** Largeur mini par jour pour garder les ticks lisibles (labels inclinés). */
export const DAY_TICK_PX = 52;

export function periodChartMinWidth(
  labelCount: number,
  granularity: ChartGranularity
): number | undefined {
  if (granularity !== 'day' || labelCount <= 0) return undefined;
  return labelCount * DAY_TICK_PX;
}

export function periodXTicks(granularity: ChartGranularity, color: string) {
  const isDay = granularity === 'day';
  const isWeek = granularity === 'week';
  return {
    color,
    autoSkip: !isDay,
    autoSkipPadding: isWeek ? 6 : 4,
    maxRotation: isDay || isWeek ? 45 : 0,
    minRotation: isDay || isWeek ? 45 : 0,
    font: { size: 11 },
  };
}
