import React from 'react';
import { useTranslation } from 'react-i18next';

interface AmortissementLegalPanelProps {
  isAssociation: boolean;
}

const AmortissementLegalPanel: React.FC<AmortissementLegalPanelProps> = ({ isAssociation }) => {
  const { t } = useTranslation();

  return (
    <div className="ct-card amortissement-legal" style={{ padding: '1rem' }}>
      <h2 style={{ marginTop: 0 }}>{t('amortissement.legalTitle')}</h2>
      <p style={{ fontSize: '0.9rem', color: 'var(--invoicing-gray-700)' }}>
        {t('amortissement.legalIntro')}
      </p>
      <ul>
        <li>
          {t('amortissement.legal.inventory')}{' '}
          <a href="https://www.legifrance.gouv.fr/" target="_blank" rel="noreferrer">
            L123-12
          </a>
        </li>
        <li>
          {t('amortissement.legal.cgi39')}{' '}
          <a
            href="https://bofip.impots.gouv.fr/bofip/4544-PGP.html"
            target="_blank"
            rel="noreferrer"
          >
            BOI-BIC-AMT
          </a>
        </li>
        <li>
          {t('amortissement.legal.degressif')}{' '}
          <a
            href="https://bofip.impots.gouv.fr/bofip/4699-PGP.html"
            target="_blank"
            rel="noreferrer"
          >
            CGI 39 A
          </a>
        </li>
        <li>
          {t('amortissement.legal.lowValue')}{' '}
          <a href="https://bofip.impots.gouv.fr/" target="_blank" rel="noreferrer">
            BOI-BIC-CHG-20-30-10
          </a>
        </li>
        <li>{t('amortissement.legal.rates')}</li>
        {isAssociation ? (
          <>
            <li>
              {t('amortissement.legal.anc')}{' '}
              <a
                href="https://www.anc.gouv.fr/reglement-ndeg-2018-06-du-5-decembre-2018-relatif-aux-comptes-annuels-des-personnes-morales-de"
                target="_blank"
                rel="noreferrer"
              >
                ANC 2018-06
              </a>
            </li>
            <li>{t('amortissement.legal.assoAccounts')}</li>
            <li>{t('amortissement.legal.grants')}</li>
            <li>{t('amortissement.legal.assoSimplified')}</li>
          </>
        ) : (
          <li>{t('amortissement.legal.enterpriseNote')}</li>
        )}
      </ul>
      <p style={{ fontSize: '0.8rem', color: 'var(--invoicing-gray-600)', marginTop: '1rem' }}>
        {t('amortissement.legalDisclaimer')}
      </p>
    </div>
  );
};

export default AmortissementLegalPanel;
