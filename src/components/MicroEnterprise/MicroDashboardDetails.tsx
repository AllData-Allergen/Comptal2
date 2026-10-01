import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarClock, Settings } from 'lucide-react';
import { Link } from 'react-router-dom';
import { MicroEnterpriseService } from '../../services/MicroEnterpriseService';
import type {
  MicroDeadline,
  MicroEnterpriseConfig,
  MicroEnterpriseSummary,
} from '../../types/microEnterprise';
import { formatMoney } from '../../utils/amounts';
import { formatFrDate } from '../../utils/dateFormats';
import '../../styles/micro-enterprise-custom.css';

interface MicroDashboardDetailsProps {
  summary: MicroEnterpriseSummary;
}

const MicroDashboardDetails: React.FC<MicroDashboardDetailsProps> = ({ summary }) => {
  const [config, setConfig] = useState<MicroEnterpriseConfig | null>(null);
  const [deadlines, setDeadlines] = useState<MicroDeadline[]>([]);

  useEffect(() => {
    void Promise.all([
      MicroEnterpriseService.loadConfigSafe(),
      MicroEnterpriseService.upcomingDeadlines(),
    ]).then(([nextConfig, nextDeadlines]) => {
      setConfig(nextConfig);
      setDeadlines(nextDeadlines.slice(0, 5));
    });
  }, []);

  const thresholdItems = useMemo(
    () =>
      config
        ? [
            {
              label: 'Plafond du régime micro',
              value: summary.microThresholdProgress,
              amount: config.microThreshold,
            },
            {
              label: 'Franchise en base de TVA',
              value: summary.vatBaseProgress,
              amount: config.vatBaseThreshold,
            },
            {
              label: 'Seuil majoré de TVA',
              value: summary.vatToleranceProgress,
              amount: config.vatToleranceThreshold,
            },
          ]
        : [],
    [config, summary]
  );

  if (!config) return null;

  return (
    <div className="micro-panel micro-dashboard-details">
      <div className="micro-scope">
        <AlertTriangle size={18} />
        <span>
          Estimations locales uniquement : Comptal2.1 ne télédéclare pas à l’URSSAF ou aux impôts,
          ne produit pas de FEC et n’est pas une plateforme agréée.
        </span>
        <Link className="ct-btn-secondary" to="/parametre?tab=organization">
          <Settings size={15} /> Régler les taux
        </Link>
      </div>

      {summary.warningLevel > 0 && (
        <div className={`micro-threshold-alert level-${summary.warningLevel}`} role="status">
          <AlertTriangle size={18} />
          <span>
            <b>Alerte à {summary.warningLevel} %.</b> Le CA encaissé {config.fiscalYear} atteint{' '}
            {formatMoney(summary.yearCollected)}. La comparaison utilise les seuils du régime micro
            ({formatMoney(config.microThreshold)}) et de franchise TVA
            ({formatMoney(config.vatBaseThreshold)}).
          </span>
        </div>
      )}

      <div className="micro-grid-two">
        <section className="ct-card">
          <h2>Suivi annuel des seuils</h2>
          <p className="ct-hint">
            Calculé sur les encaissements nets. Les seuils restent modifiables dans Organisation.
          </p>
          <div className="micro-thresholds">
            {thresholdItems.map((item) => (
              <div key={item.label}>
                <div className="micro-threshold-label">
                  <span>{item.label}</span>
                  <b>{Math.min(item.value, 999).toFixed(1)} % · {formatMoney(item.amount)}</b>
                </div>
                <div className="micro-progress">
                  <span
                    className={item.value >= 100 ? 'danger' : item.value >= 75 ? 'warning' : ''}
                    style={{ width: `${Math.min(item.value, 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="ct-card">
          <h2><CalendarClock size={19} /> Prochaines échéances</h2>
          <div className="micro-deadlines">
            {deadlines.map((deadline) => (
              <div key={deadline.id}>
                <time>{formatFrDate(deadline.date)}</time>
                <span>
                  <b>{deadline.label}</b>
                  <small>{deadline.detail}</small>
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};

export default MicroDashboardDetails;
