import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import { usablePdfImage } from '../../utils/security';
import { Building2, Save, ScanSearch } from 'lucide-react';
import { EmetteurExtended, InvoiceSettings } from '../../types/invoice';
import { ConfigService } from '../../services/ConfigService';
import { defaultEmetteur, defaultInvoiceSettings, EmetteurService } from '../../services/EmetteurService';
import { SireneAPIService, SireneEntrepriseResult } from '../../services/SireneAPIService';
import { Logger } from '../../services/logger';
import { Account } from '../../types/models';
import { FORMES_JURIDIQUES } from '../../constants/invoicingConstants';
import SuggestInput, { SuggestItem } from '../Common/SuggestInput';
import { MicroEnterpriseConfig } from '../../types/microEnterprise';
import {
  defaultMicroEnterpriseConfig,
  MicroEnterpriseService,
} from '../../services/MicroEnterpriseService';

const IdentityCompanyPanel: React.FC = () => {
  const { t } = useTranslation();
  const [emetteur, setEmetteur] = useState<EmetteurExtended>(defaultEmetteur());
  const [settings, setSettings] = useState<InvoiceSettings>(defaultInvoiceSettings(defaultEmetteur()));
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [sireneQ, setSireneQ] = useState('');
  const [saving, setSaving] = useState(false);
  const [microConfig, setMicroConfig] = useState<MicroEnterpriseConfig | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [loaded, loadedMicro] = await Promise.all([
          EmetteurService.loadEmetteurExtended(),
          MicroEnterpriseService.loadConfig(),
        ]);
        setMicroConfig(loadedMicro);
        if (loaded) {
          setEmetteur(loaded);
          setSettings(await EmetteurService.loadInvoiceSettingsSafe(loaded));
        } else if (loadedMicro?.enabled) {
          const microEmetteur: EmetteurExtended = {
            ...defaultEmetteur(),
            type: 'auto_entrepreneur',
            formeJuridique: 'EI',
            regimeTVA: 'franchise',
            regimeFiscal: loadedMicro.regimeFiscal,
            mentionFranchiseTVA: 'TVA non applicable, art. 293 B du CGI',
          };
          setEmetteur(microEmetteur);
          setSettings({ ...defaultInvoiceSettings(microEmetteur), tauxTVADefaut: 0 });
        }
        setAccounts(await ConfigService.listAccounts());
      } catch (err) {
        Logger.error('IdentityCompanyPanel.load', err);
      }
    })();
  }, []);

  const patch = (partial: Partial<EmetteurExtended>) => setEmetteur((prev) => ({ ...prev, ...partial }));

  const formeSuggestions = useMemo<SuggestItem[]>(
    () =>
      FORMES_JURIDIQUES.map((forme) => ({
        id: forme.value,
        value: forme.value,
        label: forme.label,
      })),
    []
  );

  const applySirene = (result: SireneEntrepriseResult) => {
    setEmetteur((prev) => ({
      ...prev,
      denominationSociale: result.nom_complet || result.denomination || prev.denominationSociale,
      siren: result.siren ?? prev.siren,
      siret: result.siret ?? prev.siret,
      codeNAF: result.activite_principale ?? prev.codeNAF,
      adresse: {
        ...prev.adresse,
        rue: result.adresse ?? prev.adresse.rue,
        codePostal: result.code_postal ?? prev.adresse.codePostal,
        ville: result.commune ?? prev.adresse.ville,
      },
    }));
  };

  const searchDenominations = useCallback(async (query: string): Promise<Array<SuggestItem<SireneEntrepriseResult>>> => {
    const data = await SireneAPIService.searchEntreprises(query, 1, 8);
    return (data.results ?? [])
      .filter((result) => result.nom_complet || result.denomination)
      .map((result, index) => ({
        id: `${result.siret || result.siren || result.nom_complet}-${index}`,
        value: result.nom_complet || result.denomination || query,
        label: result.nom_complet || result.denomination || query,
        hint: [result.siret, result.commune].filter(Boolean).join(' · '),
        payload: result,
      }));
  }, []);

  const fillSirene = async () => {
    try {
      const found = await SireneAPIService.searchEntreprises(sireneQ, 1, 1);
      const r = found.results[0];
      if (!r) {
        toast.error(t('org.sireneEmpty'));
        return;
      }
      patch({
        denominationSociale: r.nom_complet || r.denomination || emetteur.denominationSociale,
        siren: r.siren ?? emetteur.siren,
        siret: r.siret ?? emetteur.siret,
        codeNAF: r.activite_principale ?? emetteur.codeNAF,
        adresse: {
          ...emetteur.adresse,
          rue: r.adresse ?? emetteur.adresse.rue,
          codePostal: r.code_postal ?? emetteur.adresse.codePostal,
          ville: r.commune ?? emetteur.adresse.ville,
        },
      });
      toast.success(t('org.sireneOk'));
    } catch (err) {
      Logger.error('IdentityCompanyPanel.sirene', err);
      toast.error(t('common.error'));
    }
  };

  const onLogo = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const logo = usablePdfImage(String(reader.result));
      if (!logo) {
        toast.error(t('errors.fileTypeNotAllowed'));
        return;
      }
      patch({ logo });
    };
    reader.readAsDataURL(file);
  };

  const save = async () => {
    setSaving(true);
    try {
      await EmetteurService.saveEmetteurExtended(emetteur);
      await EmetteurService.saveInvoiceSettings({ ...settings, emetteur });
      if (microConfig) await MicroEnterpriseService.saveConfig(microConfig);
      toast.success(t('org.saved'));
    } catch (err) {
      Logger.error('IdentityCompanyPanel.save', err);
      toast.error(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="org-split">
      <div className="org-form-scroll">
        <header className="org-panel-heading">
          <span className="org-panel-icon"><Building2 size={19} /></span>
          <div>
            <h2>{t('org.identityCompany')}</h2>
            <p>{t('org.identityCompanyHint')}</p>
          </div>
        </header>
        <h3 className="org-section-title">{t('org.legalIdentity')}</h3>
        <div className="org-grid">
          <label className="org-field">
            <span>{t('org.type')}</span>
            <select
              value={emetteur.type}
              onChange={(e) => {
                const type = e.target.value as EmetteurExtended['type'];
                if (type === 'auto_entrepreneur') {
                  const config = microConfig ?? defaultMicroEnterpriseConfig();
                  setMicroConfig(config);
                  patch({
                    type,
                    formeJuridique: 'EI',
                    regimeTVA: 'franchise',
                    regimeFiscal: config.regimeFiscal,
                    mentionFranchiseTVA: 'TVA non applicable, art. 293 B du CGI',
                  });
                  setSettings((prev) => ({ ...prev, tauxTVADefaut: 0 }));
                } else {
                  patch({ type });
                }
              }}
            >
              <option value="entreprise">{t('org.typeEntreprise')}</option>
              <option value="auto_entrepreneur">{t('org.typeAe')}</option>
              <option value="association">{t('org.typeAsso')}</option>
              <option value="particulier">{t('org.typePart')}</option>
            </select>
          </label>
          <div className="org-field">
            <span>{t('org.denomination')}</span>
            <SuggestInput
              value={emetteur.denominationSociale}
              onChange={(value) => patch({ denominationSociale: value })}
              loadSuggestions={searchDenominations}
              minQueryLength={2}
              placeholder={t('org.denominationPlaceholder')}
              emptyLabel={t('org.suggestEmpty')}
              typeMoreLabel={t('org.suggestTypeMore')}
              onSelect={(item) => {
                if (item.payload) applySirene(item.payload);
              }}
            />
          </div>
          <div className="org-field">
            <span>{t('org.formeJuridique')}</span>
            <SuggestInput
              value={emetteur.formeJuridique ?? ''}
              onChange={(value) => patch({ formeJuridique: value })}
              suggestions={formeSuggestions}
              showAllOnFocus
              placeholder={t('org.formeJuridiquePlaceholder')}
              emptyLabel={t('org.suggestManual')}
            />
          </div>
          <label className="org-field">
            <span>SIREN</span>
            <input value={emetteur.siren ?? ''} onChange={(e) => patch({ siren: e.target.value })} />
          </label>
          <label className="org-field">
            <span>SIRET</span>
            <input value={emetteur.siret} onChange={(e) => patch({ siret: e.target.value })} />
          </label>
          <label className="org-field">
            <span>TVA</span>
            <input
              value={emetteur.numeroTVA ?? ''}
              onChange={(e) => patch({ numeroTVA: e.target.value })}
            />
          </label>
          {emetteur.type === 'association' && (
            <label className="org-field">
              <span>RNA</span>
              <input value={emetteur.rna ?? ''} onChange={(e) => patch({ rna: e.target.value })} />
            </label>
          )}
          <label className="org-field full">
            <span>{t('org.rue')}</span>
            <input
              value={emetteur.adresse.rue}
              onChange={(e) => patch({ adresse: { ...emetteur.adresse, rue: e.target.value } })}
            />
          </label>
          <label className="org-field">
            <span>{t('org.cp')}</span>
            <input
              value={emetteur.adresse.codePostal}
              onChange={(e) =>
                patch({ adresse: { ...emetteur.adresse, codePostal: e.target.value } })
              }
            />
          </label>
          <label className="org-field">
            <span>{t('org.ville')}</span>
            <input
              value={emetteur.adresse.ville}
              onChange={(e) => patch({ adresse: { ...emetteur.adresse, ville: e.target.value } })}
            />
          </label>
          <label className="org-field">
            <span>{t('org.email')}</span>
            <input value={emetteur.email ?? ''} onChange={(e) => patch({ email: e.target.value })} />
          </label>
          <label className="org-field">
            <span>{t('org.tel')}</span>
            <input
              value={emetteur.telephone ?? ''}
              onChange={(e) => patch({ telephone: e.target.value })}
            />
          </label>
        </div>

        {emetteur.type === 'auto_entrepreneur' && microConfig && (
          <>
            <h3 className="org-section-title">Régime micro-entreprise</h3>
            <div className="org-grid">
              <label className="org-field">
                <span>Date de début d’activité</span>
                <input
                  type="date"
                  value={microConfig.businessStartDate}
                  onChange={(e) => setMicroConfig({ ...microConfig, businessStartDate: e.target.value })}
                />
              </label>
              <label className="org-field">
                <span>Régime fiscal</span>
                <select
                  value={microConfig.regimeFiscal}
                  onChange={(e) => {
                    const regimeFiscal = e.target.value as MicroEnterpriseConfig['regimeFiscal'];
                    setMicroConfig({ ...microConfig, regimeFiscal });
                    patch({ regimeFiscal });
                  }}
                >
                  <option value="micro_bnc">Micro-BNC — prestations intellectuelles</option>
                  <option value="micro_bic">Micro-BIC — prestations commerciales</option>
                </select>
              </label>
              <label className="org-field">
                <span>Année des taux et seuils</span>
                <input
                  type="number"
                  min="2020"
                  max="2100"
                  value={microConfig.fiscalYear}
                  onChange={(e) => setMicroConfig({ ...microConfig, fiscalYear: Number(e.target.value) })}
                />
              </label>
              <label className="org-field">
                <span>Déclaration URSSAF</span>
                <select
                  value={microConfig.declarationFrequency}
                  onChange={(e) =>
                    setMicroConfig({
                      ...microConfig,
                      declarationFrequency: e.target.value as MicroEnterpriseConfig['declarationFrequency'],
                    })
                  }
                >
                  <option value="quarterly">Trimestrielle</option>
                  <option value="monthly">Mensuelle</option>
                </select>
              </label>
              <label className="org-field">
                <span>Régime de TVA</span>
                <select
                  value={emetteur.regimeTVA}
                  onChange={(e) => {
                    const regimeTVA = e.target.value as EmetteurExtended['regimeTVA'];
                    patch({ regimeTVA });
                    if (regimeTVA === 'franchise') {
                      setSettings((prev) => ({ ...prev, tauxTVADefaut: 0 }));
                    }
                  }}
                >
                  <option value="franchise">Franchise en base de TVA</option>
                  <option value="reel_simplifie">Réel simplifié</option>
                  <option value="reel_normal">Réel normal</option>
                  <option value="mini_reel">Mini-réel</option>
                </select>
              </label>
              <label className="org-field full">
                <span>Mention de franchise TVA</span>
                <input
                  value={emetteur.mentionFranchiseTVA ?? ''}
                  onChange={(e) => patch({ mentionFranchiseTVA: e.target.value })}
                />
              </label>
              <label className="org-field full">
                <span>Médiateur de la consommation (si clients particuliers)</span>
                <input
                  value={emetteur.mediateurConsommation ?? ''}
                  onChange={(e) => patch({ mediateurConsommation: e.target.value })}
                  placeholder="Nom, adresse et site du médiateur"
                />
              </label>
              <label className="org-field">
                <span>Taux de cotisations sociales (%)</span>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={microConfig.socialRate}
                  onChange={(e) => setMicroConfig({ ...microConfig, socialRate: Number(e.target.value) })}
                />
              </label>
              <label className="org-field">
                <span>Contribution formation CFP (%)</span>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={microConfig.trainingRate}
                  onChange={(e) => setMicroConfig({ ...microConfig, trainingRate: Number(e.target.value) })}
                />
              </label>
              <label className="org-field">
                <span>Plafond micro annuel (€)</span>
                <input
                  type="number"
                  min="0"
                  value={microConfig.microThreshold}
                  onChange={(e) => setMicroConfig({ ...microConfig, microThreshold: Number(e.target.value) })}
                />
              </label>
              <label className="org-field">
                <span>Seuil de franchise TVA (€)</span>
                <input
                  type="number"
                  min="0"
                  value={microConfig.vatBaseThreshold}
                  onChange={(e) => setMicroConfig({ ...microConfig, vatBaseThreshold: Number(e.target.value) })}
                />
              </label>
              <label className="org-field">
                <span>Seuil majoré de TVA (€)</span>
                <input
                  type="number"
                  min="0"
                  value={microConfig.vatToleranceThreshold}
                  onChange={(e) =>
                    setMicroConfig({ ...microConfig, vatToleranceThreshold: Number(e.target.value) })
                  }
                />
              </label>
              <label className="org-field">
                <span>Outils mensuels estimés (€)</span>
                <input
                  type="number"
                  min="0"
                  value={microConfig.estimatedMonthlyToolsCost}
                  onChange={(e) =>
                    setMicroConfig({ ...microConfig, estimatedMonthlyToolsCost: Number(e.target.value) })
                  }
                />
              </label>
              <label className="org-field">
                <span>Taux du versement libératoire (%)</span>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={microConfig.incomeTaxRate}
                  onChange={(e) =>
                    setMicroConfig({ ...microConfig, incomeTaxRate: Number(e.target.value) })
                  }
                />
              </label>
              <label className="flex items-center gap-2 text-sm full">
                <input
                  type="checkbox"
                  checked={microConfig.versementLiberatoire}
                  onChange={(e) =>
                    setMicroConfig({ ...microConfig, versementLiberatoire: e.target.checked })
                  }
                />
                Versement libératoire de l’impôt ({microConfig.incomeTaxRate.toFixed(1)} %)
              </label>
            </div>
            <p className="ct-hint">
              Les taux et seuils restent modifiables : vérifiez-les chaque année sur les sites officiels.
            </p>
          </>
        )}

        <h3 className="org-section-title">{t('org.sirene')}</h3>
        <div className="flex gap-2">
          <input
            className="inv-search flex-1"
            value={sireneQ}
            onChange={(e) => setSireneQ(e.target.value)}
            placeholder={t('org.sirenePlaceholder')}
          />
          <button type="button" className="ct-btn-secondary" onClick={() => void fillSirene()}>
            <ScanSearch size={16} /> {t('org.sireneSearch')}
          </button>
        </div>

        <h3 className="org-section-title">{t('org.logo')}</h3>
        <div className="org-logo-row">
          {emetteur.logo && <img src={emetteur.logo} alt="logo" />}
          <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => onLogo(e.target.files?.[0])} />
        </div>

        <h3 className="org-section-title">{t('org.bank')}</h3>
        <div className="org-grid">
          <label className="org-field">
            <span>{t('org.titulaire')}</span>
            <input
              value={emetteur.coordonneesBancaires?.titulaire ?? ''}
              onChange={(e) =>
                patch({
                  coordonneesBancaires: {
                    titulaire: e.target.value,
                    iban: emetteur.coordonneesBancaires?.iban ?? '',
                    bic: emetteur.coordonneesBancaires?.bic ?? '',
                    banque: emetteur.coordonneesBancaires?.banque,
                  },
                })
              }
            />
          </label>
          <label className="org-field">
            <span>IBAN</span>
            <input
              value={emetteur.coordonneesBancaires?.iban ?? ''}
              onChange={(e) =>
                patch({
                  coordonneesBancaires: {
                    titulaire: emetteur.coordonneesBancaires?.titulaire ?? '',
                    iban: e.target.value,
                    bic: emetteur.coordonneesBancaires?.bic ?? '',
                    banque: emetteur.coordonneesBancaires?.banque,
                  },
                })
              }
            />
          </label>
          <label className="org-field">
            <span>BIC</span>
            <input
              value={emetteur.coordonneesBancaires?.bic ?? ''}
              onChange={(e) =>
                patch({
                  coordonneesBancaires: {
                    titulaire: emetteur.coordonneesBancaires?.titulaire ?? '',
                    iban: emetteur.coordonneesBancaires?.iban ?? '',
                    bic: e.target.value,
                    banque: emetteur.coordonneesBancaires?.banque,
                  },
                })
              }
            />
          </label>
        </div>

        <h3 className="org-section-title">{t('org.linkedAccounts')}</h3>
        <div className="flex flex-col gap-2">
          {accounts.map((acc) => {
            const checked = emetteur.linkedAccounts?.some((l) => l.accountCode === acc.code) ?? false;
            return (
              <label key={acc.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => {
                    const current = emetteur.linkedAccounts ?? [];
                    patch({
                      linkedAccounts: e.target.checked
                        ? [...current, { accountCode: acc.code, accountName: acc.name, isPrimary: current.length === 0, color: acc.color }]
                        : current.filter((l) => l.accountCode !== acc.code),
                    });
                  }}
                />
                {acc.code} — {acc.name}
              </label>
            );
          })}
        </div>

        <h3 className="org-section-title">{t('org.numbering')}</h3>
        <div className="org-grid">
          <label className="org-field">
            <span>{t('org.prefixDevis')}</span>
            <input
              value={settings.prefixeDevis}
              onChange={(e) => setSettings({ ...settings, prefixeDevis: e.target.value })}
            />
          </label>
          <label className="org-field">
            <span>{t('org.prefixFacture')}</span>
            <input
              value={settings.prefixeFacture}
              onChange={(e) => setSettings({ ...settings, prefixeFacture: e.target.value })}
            />
          </label>
          <label className="org-field">
            <span>{t('org.tvaDefault')}</span>
            <input
              type="number"
              value={settings.tauxTVADefaut}
              onChange={(e) => setSettings({ ...settings, tauxTVADefaut: Number(e.target.value) })}
            />
          </label>
          <label className="org-field">
            <span>{t('org.delai')}</span>
            <input
              type="number"
              value={settings.delaiPaiementDefaut}
              onChange={(e) =>
                setSettings({ ...settings, delaiPaiementDefaut: Number(e.target.value) })
              }
            />
          </label>
          <label className="org-field full">
            <span>{t('org.conditions')}</span>
            <input
              value={settings.conditionsPaiementDefaut}
              onChange={(e) =>
                setSettings({ ...settings, conditionsPaiementDefaut: e.target.value })
              }
            />
          </label>
        </div>

        <div className="org-save-bar">
          <span>{t('org.identitySaveHint')}</span>
          <button className="ct-btn-primary" type="button" disabled={saving} onClick={() => void save()}>
            <Save size={16} /> {saving ? t('org.saving') : t('common.save')}
          </button>
        </div>
      </div>
      <aside className="org-preview">
        <div className="org-preview-label">{t('org.identityPreview')}</div>
        <div className="org-preview-sheet">
          {emetteur.logo && <img src={emetteur.logo} alt="" style={{ maxHeight: 48 }} />}
          <strong>{emetteur.denominationSociale || t('org.previewEmpty')}</strong>
          <p>{emetteur.formeJuridique}</p>
          <p>
            {emetteur.adresse.rue}
            <br />
            {emetteur.adresse.codePostal} {emetteur.adresse.ville}
          </p>
          <p>SIRET {emetteur.siret}</p>
        </div>
      </aside>
    </div>
  );
};

export default IdentityCompanyPanel;
