import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2 } from 'lucide-react';
import { Client, ClientDetailField, ContactGroupe, EMPTY_ADRESSE } from '../../types/invoice';
import { newEntityId } from '../../utils/invoiceFormat';
import { EmetteurService } from '../../services/EmetteurService';
import { isLightEmail } from '../../utils/security';
import EntrepriseSearch from './EntrepriseSearch';

interface ClientFormProps {
  initial?: Client | null;
  groupes?: ContactGroupe[];
  onSubmit: (client: Client) => void;
  onCancel?: () => void;
  onCreateGroupe?: (nom: string) => Promise<ContactGroupe | null>;
  embedded?: boolean;
}

export function emptyClient(): Client {
  const now = new Date();
  return {
    id: newEntityId('cli'),
    type: 'particulier',
    color: '#3b82f6',
    roles: ['client'],
    adresseFacturation: { ...EMPTY_ADRESSE },
    extraDetails: [],
    createdAt: now,
    updatedAt: now,
  };
}

function emptyBank() {
  return { titulaire: '', iban: '', bic: '', banque: '' };
}

function emptyDetail(): ClientDetailField {
  return { id: newEntityId('cdet'), label: '', value: '' };
}

const ClientForm: React.FC<ClientFormProps> = ({
  initial,
  groupes = [],
  onSubmit,
  onCancel,
  onCreateGroupe,
  embedded,
}) => {
  const { t } = useTranslation();
  const [client, setClient] = useState<Client>(initial ? { ...initial } : emptyClient());
  const [newGroupeNom, setNewGroupeNom] = useState('');
  const [formError, setFormError] = useState('');
  const patch = (partial: Partial<Client>) => setClient((c) => ({ ...c, ...partial }));

  useEffect(() => {
    setClient(initial ? { ...initial } : emptyClient());
  }, [initial]);

  const details = client.extraDetails ?? [];
  const bank = client.coordonneesBancaires ?? emptyBank();

  const patchBank = (partial: Partial<NonNullable<Client['coordonneesBancaires']>>) =>
    patch({ coordonneesBancaires: { ...bank, ...partial } });

  const patchDetail = (id: string, partial: Partial<ClientDetailField>) =>
    patch({
      extraDetails: details.map((d) => (d.id === id ? { ...d, ...partial } : d)),
    });

  return (
    <div className="contact-form">
      <div className="contact-card">
      <h3 className="org-section-title">{t('clients.identity')}</h3>
      <div className="contact-role-picker">
        <label>
          <input
            type="checkbox"
            checked={client.roles?.includes('client') ?? true}
            onChange={(e) => patch({
              roles: e.target.checked
                ? Array.from(new Set([...(client.roles ?? []), 'client']))
                : (client.roles ?? []).filter((role) => role !== 'client'),
            })}
          />
          <span><strong>{t('clients.roleClient')}</strong><small>{t('clients.roleClientHint')}</small></span>
        </label>
        <label>
          <input
            type="checkbox"
            checked={client.roles?.includes('donateur') ?? false}
            onChange={(e) => patch({
              roles: e.target.checked
                ? Array.from(new Set([...(client.roles ?? []), 'donateur']))
                : (client.roles ?? []).filter((role) => role !== 'donateur'),
            })}
          />
          <span><strong>{t('clients.roleDonor')}</strong><small>{t('clients.roleDonorHint')}</small></span>
        </label>
      </div>
      <label className="org-field">
        <span>{t('org.type')}</span>
        <select
          value={client.type}
          onChange={(e) => patch({ type: e.target.value as Client['type'] })}
        >
          <option value="particulier">{t('org.typePart')}</option>
          <option value="entreprise">{t('org.typeEntreprise')}</option>
        </select>
      </label>
      <div className="contact-color-field">
        <label className="org-field">
          <span>{t('clients.color')}</span>
          <div className="contact-color-control">
            <input
              type="color"
              value={client.color ?? '#3b82f6'}
              onChange={(e) => patch({ color: e.target.value })}
              aria-label={t('clients.color')}
            />
            <code>{(client.color ?? '#3b82f6').toUpperCase()}</code>
          </div>
        </label>
        <div className="contact-color-swatches" aria-label={t('clients.colorPresets')}>
          {['#1e3a8a', '#3b82f6', '#0ea5e9', '#14b8a6', '#10b981', '#f59e0b', '#f97316', '#ef4444', '#8b5cf6', '#64748b'].map((color) => (
            <button
              key={color}
              type="button"
              className={client.color === color ? 'is-selected' : ''}
              style={{ backgroundColor: color }}
              title={color}
              aria-label={`${t('clients.chooseColor')} ${color}`}
              onClick={() => patch({ color })}
            />
          ))}
        </div>
        <p className="contact-hint">{t('clients.colorHint')}</p>
      </div>
      {client.type === 'entreprise' && (
        <>
          <EntrepriseSearch
            onSelect={(r) =>
              patch({
                denominationSociale: r.nom_complet || r.denomination,
                siren: r.siren,
                siret: r.siret,
                codeNAF: r.activite_principale,
                adresseFacturation: {
                  ...client.adresseFacturation,
                  rue: r.adresse ?? client.adresseFacturation.rue,
                  codePostal: r.code_postal ?? client.adresseFacturation.codePostal,
                  ville: r.commune ?? client.adresseFacturation.ville,
                },
              })
            }
          />
          <label className="org-field">
            <span>{t('org.denomination')}</span>
            <input
              value={client.denominationSociale ?? ''}
              onChange={(e) => patch({ denominationSociale: e.target.value })}
            />
          </label>
        </>
      )}
      {client.type === 'particulier' && (
        <div className="org-grid">
          <label className="org-field">
            <span>{t('clients.prenom')}</span>
            <input value={client.prenom ?? ''} onChange={(e) => patch({ prenom: e.target.value })} />
          </label>
          <label className="org-field">
            <span>{t('clients.nom')}</span>
            <input value={client.nom ?? ''} onChange={(e) => patch({ nom: e.target.value })} />
          </label>
        </div>
      )}
      <div className="org-grid">
        <label className="org-field">
          <span>{t('org.email')}</span>
            <input type="email" value={client.email ?? ''} onChange={(e) => patch({ email: e.target.value })} />
        </label>
        <label className="org-field">
          <span>{t('org.tel')}</span>
          <input value={client.telephone ?? ''} onChange={(e) => patch({ telephone: e.target.value })} />
        </label>
        <label className="org-field full">
          <span>{t('org.rue')}</span>
          <input
            value={client.adresseFacturation.rue}
            onChange={(e) =>
              patch({ adresseFacturation: { ...client.adresseFacturation, rue: e.target.value } })
            }
          />
        </label>
        <label className="org-field">
          <span>{t('org.cp')}</span>
          <input
            value={client.adresseFacturation.codePostal}
            onChange={(e) =>
              patch({
                adresseFacturation: { ...client.adresseFacturation, codePostal: e.target.value },
              })
            }
          />
        </label>
        <label className="org-field">
          <span>{t('org.ville')}</span>
          <input
            value={client.adresseFacturation.ville}
            onChange={(e) =>
              patch({
                adresseFacturation: { ...client.adresseFacturation, ville: e.target.value },
              })
            }
          />
        </label>
      </div>
      </div>

      <div className="contact-card">
        <h3 className="org-section-title">{t('clients.groupement')}</h3>
        <div className="contact-groupe-row">
          <label className="org-field flex-1">
            <span>{t('clients.groupement')}</span>
            <select
              value={client.groupeId ?? ''}
              onChange={(e) => patch({ groupeId: e.target.value || undefined })}
            >
              <option value="">{t('clients.noGroupe')}</option>
              {groupes.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.nom}
                </option>
              ))}
            </select>
          </label>
          {onCreateGroupe && (
            <div className="contact-groupe-create">
              <input
                value={newGroupeNom}
                onChange={(e) => setNewGroupeNom(e.target.value)}
                placeholder={t('clients.newGroupePlaceholder')}
              />
              <button
                type="button"
                className="ct-btn-secondary"
                disabled={!newGroupeNom.trim()}
                onClick={() => {
                  void onCreateGroupe(newGroupeNom.trim()).then((created) => {
                    if (!created) return;
                    setNewGroupeNom('');
                    patch({ groupeId: created.id });
                  });
                }}
              >
                <Plus size={14} /> {t('clients.addGroupe')}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="contact-card">
        <h3 className="org-section-title">{t('clients.extraDetails')}</h3>
        {details.length === 0 && <p className="contact-hint">{t('clients.extraDetailsHint')}</p>}
        {details.map((detail) => (
          <div key={detail.id} className="contact-detail-row">
            <label className="org-field">
              <span>{t('clients.detailLabel')}</span>
              <input
                value={detail.label}
                onChange={(e) => patchDetail(detail.id, { label: e.target.value })}
                placeholder={t('clients.detailLabelPh')}
              />
            </label>
            <label className="org-field">
              <span>{t('clients.detailValue')}</span>
              <input
                value={detail.value}
                onChange={(e) => patchDetail(detail.id, { value: e.target.value })}
                placeholder={t('clients.detailValuePh')}
              />
            </label>
            <button
              type="button"
              className="ct-btn-danger inv-icon-button"
              title={t('common.delete')}
              onClick={() => patch({ extraDetails: details.filter((d) => d.id !== detail.id) })}
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        <button
          type="button"
          className="ct-btn-secondary self-start"
          onClick={() => patch({ extraDetails: [...details, emptyDetail()] })}
        >
          <Plus size={14} /> {t('clients.addDetail')}
        </button>
      </div>

      <div className="contact-card">
        <h3 className="org-section-title">{t('org.bank')}</h3>
        <div className="org-grid">
          <label className="org-field">
            <span>{t('org.titulaire')}</span>
            <input value={bank.titulaire} onChange={(e) => patchBank({ titulaire: e.target.value })} />
          </label>
          <label className="org-field">
            <span>IBAN</span>
            <input value={bank.iban} onChange={(e) => patchBank({ iban: e.target.value })} />
          </label>
          <label className="org-field">
            <span>BIC</span>
            <input value={bank.bic} onChange={(e) => patchBank({ bic: e.target.value })} />
          </label>
          <label className="org-field">
            <span>{t('clients.banque')}</span>
            <input value={bank.banque ?? ''} onChange={(e) => patchBank({ banque: e.target.value })} />
          </label>
        </div>
      </div>

      <div className="contact-note-encart">
        <label className="org-field">
          <span>{t('clients.note')}</span>
          <textarea
            rows={4}
            value={client.notes ?? ''}
            onChange={(e) => patch({ notes: e.target.value })}
            placeholder={t('clients.notePlaceholder')}
          />
        </label>
      </div>

      {formError && <p className="text-sm" style={{ color: 'var(--invoicing-danger, #b91c1c)' }}>{formError}</p>}
      <div className="contact-form-actions">
        {!embedded && onCancel && (
          <button type="button" className="ct-btn-secondary" onClick={onCancel}>
            {t('common.cancel')}
          </button>
        )}
        <button
          type="button"
          className="ct-btn-primary"
          onClick={() => {
            const email = client.email?.trim();
            if (email && !isLightEmail(email)) {
              setFormError(t('errors.emailInvalid'));
              return;
            }
            const iban = client.coordonneesBancaires?.iban?.trim();
            if (iban && !EmetteurService.validateIban(iban)) {
              setFormError(t('errors.ibanInvalid'));
              return;
            }
            setFormError('');
            onSubmit(client);
          }}
        >
          {t('common.save')}
        </button>
      </div>
    </div>
  );
};

export default ClientForm;
