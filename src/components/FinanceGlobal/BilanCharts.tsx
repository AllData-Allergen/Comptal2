import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChartOptions } from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { BilanChartData } from '../../services/StatsService';
import { CategoryAggregation } from '../../utils/categoryAggregate';
import { formatMoney } from '../../utils/amounts';
import { chartAxisColor, chartGridColor, chartTooltipTheme } from '../../utils/chartPastel';
import '../../utils/registerCharts';

interface BilanChartsProps {
  data: BilanChartData;
  aggregation: CategoryAggregation;
}

const BilanCharts: React.FC<BilanChartsProps> = ({ data, aggregation }) => {
  const { t } = useTranslation();
  const [isDarkMode, setIsDarkMode] = useState(() =>
    document.documentElement.classList.contains('dark')
  );

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDarkMode(document.documentElement.classList.contains('dark'));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  const textColor = chartAxisColor(isDarkMode);
  const gridColor = chartGridColor(isDarkMode);
  const tooltip = chartTooltipTheme(isDarkMode);

  const creditsBarData = useMemo(() => {
    const labels = data.categoriesWithCredits;
    const values = labels.map((cat) =>
      (data.creditsByCategory[cat] || []).reduce((a, b) => a + b, 0)
    );
    return { labels, values, colors: labels.map((c) => data.categoryColors[c] || '#10b981') };
  }, [data]);

  const debitsBarData = useMemo(() => {
    const labels = data.categoriesWithDebits;
    const values = labels.map((cat) =>
      (data.debitsByCategory[cat] || []).reduce((a, b) => a + b, 0)
    );
    return { labels, values, colors: labels.map((c) => data.categoryColors[c] || '#ef4444') };
  }, [data]);

  const barOptions: ChartOptions<'bar'> = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: 'y',
      scales: {
        x: {
          grid: { color: gridColor },
          ticks: { color: textColor, callback: (v) => formatMoney(Number(v)) },
        },
        y: { grid: { display: false }, ticks: { color: textColor } },
      },
      plugins: { legend: { display: false }, tooltip },
    }),
    [gridColor, textColor, tooltip]
  );

  const hasCredits = creditsBarData.values.some((v) => v > 0);
  const hasDebits = debitsBarData.values.some((v) => v !== 0);
  const byGroup = aggregation === 'group';

  return (
    <div className="bilan-charts-grid">
      <div className="bilan-chart-cell">
        <h3 className="bilan-chart-title">
          {t(
            byGroup
              ? 'financeGlobal.bilanChartDebitsByGroup'
              : 'financeGlobal.bilanChartDebitsByCategory'
          )}
        </h3>
        <div className="bilan-chart-inner">
          {hasDebits ? (
            <Bar
              data={{
                labels: debitsBarData.labels,
                datasets: [
                  {
                    label: t('financeGlobal.totalDebits'),
                    data: debitsBarData.values,
                    backgroundColor: debitsBarData.colors,
                  },
                ],
              }}
              options={barOptions}
            />
          ) : (
            <div className="bilan-chart-empty">{t('financeGlobal.bilanNoData')}</div>
          )}
        </div>
      </div>
      <div className="bilan-chart-cell">
        <h3 className="bilan-chart-title">
          {t(
            byGroup
              ? 'financeGlobal.bilanChartCreditsByGroup'
              : 'financeGlobal.bilanChartCreditsByCategory'
          )}
        </h3>
        <div className="bilan-chart-inner">
          {hasCredits ? (
            <Bar
              data={{
                labels: creditsBarData.labels,
                datasets: [
                  {
                    label: t('financeGlobal.totalCredits'),
                    data: creditsBarData.values,
                    backgroundColor: creditsBarData.colors,
                  },
                ],
              }}
              options={barOptions}
            />
          ) : (
            <div className="bilan-chart-empty">{t('financeGlobal.bilanNoData')}</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default BilanCharts;
