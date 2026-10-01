import type {
  MicroDeadline,
  MicroEnterpriseConfig,
  MicroEnterpriseSummary,
  MicroReceipt,
} from '../types/microEnterprise';

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function contributionRate(config: MicroEnterpriseConfig): number {
  return config.socialRate + config.trainingRate + (config.versementLiberatoire ? config.incomeTaxRate : 0);
}

function progress(value: number, threshold: number): number {
  return threshold > 0 ? (value / threshold) * 100 : 0;
}

function warningLevel(value: number): 0 | 75 | 90 | 100 {
  if (value >= 100) return 100;
  if (value >= 90) return 90;
  if (value >= 75) return 75;
  return 0;
}

export function calculateMicroSummary(
  config: MicroEnterpriseConfig,
  periodReceipts: MicroReceipt[],
  yearReceipts: MicroReceipt[],
  start: string,
  end: string
): MicroEnterpriseSummary {
  const periodCollected = roundMoney(periodReceipts.reduce((sum, item) => sum + item.amount, 0));
  const yearCollected = roundMoney(yearReceipts.reduce((sum, item) => sum + item.amount, 0));
  const socialContributions = roundMoney(periodCollected * (config.socialRate / 100));
  const trainingContribution = roundMoney(periodCollected * (config.trainingRate / 100));
  const incomeTaxProvision = config.versementLiberatoire
    ? roundMoney(periodCollected * (config.incomeTaxRate / 100))
    : 0;
  const totalProvision = roundMoney(periodCollected * (contributionRate(config) / 100));
  const months = Math.max(
    1,
    (Number(end.slice(0, 4)) - Number(start.slice(0, 4))) * 12 +
      Number(end.slice(5, 7)) -
      Number(start.slice(5, 7)) +
      1
  );
  const toolsCost = roundMoney(config.estimatedMonthlyToolsCost * months);
  const microThresholdProgress = progress(yearCollected, config.microThreshold);
  const vatBaseProgress = progress(yearCollected, config.vatBaseThreshold);
  const vatToleranceProgress = progress(yearCollected, config.vatToleranceThreshold);
  return {
    periodStart: start,
    periodEnd: end,
    periodCollected,
    yearCollected,
    socialContributions,
    trainingContribution,
    incomeTaxProvision,
    totalProvision,
    toolsCost,
    estimatedRemainder: roundMoney(periodCollected - totalProvision - toolsCost),
    microThresholdProgress,
    vatBaseProgress,
    vatToleranceProgress,
    warningLevel: warningLevel(Math.max(microThresholdProgress, vatBaseProgress)),
  };
}

function isoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function buildMicroDeadlines(
  config: Pick<MicroEnterpriseConfig, 'declarationFrequency'>,
  from: Date
): MicroDeadline[] {
  const deadlines: MicroDeadline[] = [];
  const fromIso = isoDate(from);
  if (config.declarationFrequency === 'monthly') {
    for (let offset = 0; offset < 12; offset += 1) {
      const period = new Date(from.getFullYear(), from.getMonth() + offset, 1);
      const due = new Date(period.getFullYear(), period.getMonth() + 2, 0);
      const periodLabel = `${String(period.getMonth() + 1).padStart(2, '0')}/${period.getFullYear()}`;
      deadlines.push({
        id: `urssaf-${isoDate(period).slice(0, 7)}`,
        date: isoDate(due),
        label: `Déclaration URSSAF — ${periodLabel}`,
        detail: "Déclarer le chiffre d'affaires encaissé, même s'il est nul.",
        kind: 'urssaf',
      });
    }
  } else {
    const year = from.getFullYear();
    for (const [date, label] of [
      [`${year}-04-30`, '1er trimestre'],
      [`${year}-07-31`, '2e trimestre'],
      [`${year}-10-31`, '3e trimestre'],
      [`${year + 1}-01-31`, '4e trimestre'],
      [`${year + 1}-04-30`, '1er trimestre'],
    ]) {
      if (date >= fromIso) {
        deadlines.push({
          id: `urssaf-${date}`,
          date,
          label: `Déclaration URSSAF — ${label}`,
          detail: "Déclarer le chiffre d'affaires encaissé, même s'il est nul.",
          kind: 'urssaf',
        });
      }
    }
  }
  const taxYear = from.getFullYear() + 1;
  deadlines.push(
    {
      id: `tax-${taxYear}`,
      date: `${taxYear}-05-31`,
      label: 'Déclaration 2042-C-PRO',
      detail: "Date indicative : vérifier l'échéance affichée sur impots.gouv.fr.",
      kind: 'tax',
    },
    {
      id: `cfe-${from.getFullYear()}`,
      date: `${from.getFullYear()}-12-31`,
      label: 'Déclaration initiale CFE 1447-C-SD',
      detail: "À déposer avant la fin de l'année de création.",
      kind: 'cfe',
    },
    {
      id: 'einvoicing-2027',
      date: '2027-09-01',
      label: 'Facturation électronique B2B',
      detail: "Prévoir une plateforme agréée ; le PDF seul n'est pas une facture électronique réglementaire.",
      kind: 'einvoicing',
    }
  );
  return deadlines.filter((item) => item.date >= fromIso).sort((a, b) => a.date.localeCompare(b.date));
}
