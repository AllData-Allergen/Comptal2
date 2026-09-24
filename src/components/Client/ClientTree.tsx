import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FolderPlus, Mail, Phone, Plus, Search, Trash2 } from 'lucide-react';
import { toast } from 'react-toastify';
import { Donation } from '../../types/association';
import { Client, ContactGroupe, Devis, Facture } from '../../types/invoice';
import { ClientService } from '../../services/ClientService';
import { ContactGroupService } from '../../services/ContactGroupService';
import { DonationService } from '../../services/DonationService';
import { InvoiceService } from '../../services/InvoiceService';
import { EmetteurService } from '../../services/EmetteurService';
import { PDFService } from '../../services/PDFService';
import { AttachmentService } from '../../services/AttachmentService';
import { clientDisplayName, newEntityId } from '../../utils/invoiceFormat';
import { Logger } from '../../services/logger';
import ConfirmModal from '../Common/ConfirmModal';
import Modal from '../Common/Modal';
import WideModal from '../Common/WideModal';
import DonationFormModal from '../Association/DonationFormModal';
import ClientForm from './ClientForm';
import ContactFicheModal from './ContactFicheModal';
import ContactElementModal from './ContactElementModal';
import DevisModal from '../Facturation/DevisModal';
import FactureModal from '../Facturation/FactureModal';
import PaiementFactureModal from '../Facturation/PaiementFactureModal';
import CaducDevisModal from '../Facturation/CaducDevisModal';

const ClientTree: React.FC = () => {
  const { t } = useTranslation();
  const [clients, setClients] = useState<Client[]>([]);
  const [devis, setDevis] = useState<Devis[]>([]);
  const [factures, setFactures] = useState<Facture[]>([]);
  const [query, setQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [roleFilter, setRoleFilter] = useState('');
  const [ficheClient, setFicheClient] = useState<Client | null>(null);
  const [contactDonations, setContactDonations] = useState<Donation[]>([]);
  const [donationFormOpen, setDonationFormOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteClientId, setDeleteClientId] = useState<string | null>(null);
  const [openDevis, setOpenDevis] = useState<Devis | null>(null);
  const [openFacture, setOpenFacture] = useState<Facture | null>(null);
  const [devisClientId, setDevisClientId] = useState<string | null>(null);
  const [editDevis, setEditDevis] = useState<Devis | null>(null);
  const [factureDevis, setFactureDevis] = useState<Devis | null>(null);
  const [editFacture, setEditFacture] = useState<Facture | null>(null);
  const [payFacture, setPayFacture] = useState<Facture | null>(null);
  const [caducDevis, setCaducDevis] = useState<Devis | null>(null);
  const [groupes, setGroupes] = useState<ContactGroupe[]>([]);
  const [groupeFilter, setGroupeFilter] = useState('');
  const [deleteGroupeId, setDeleteGroupeId] = useState<string | null>(null);
  const [groupeModalOpen, setGroupeModalOpen] = useState(false);
  const [groupeModalNom, setGroupeModalNom] = useState('');

  const reload = useCallback(async () => {
    const [loadedClients, loadedDevis, loadedFactures, loadedGroupes] = await Promise.all([
      ClientService.loadClients(),
      InvoiceService.loadDevis(),
      InvoiceService.loadFactures(),
      ContactGroupService.loadGroupes(),
    ]);
    setClients(loadedClients);
    setDevis(loadedDevis.filter((d) => !d.supprime));
    setFactures(loadedFactures.filter((f) => !f.supprime));
    setGroupes(loadedGroupes);
    setFicheClient((current) => {
      const next = current ? loadedClients.find((c) => c.id === current.id) ?? current : null;
      if (next) {
        void DonationService.listByContact(next.id)
          .then(setContactDonations)
          .catch((err) => Logger.error('ClientTree.loadDonations', err));
      } else {
        setContactDonations([]);
      }
      return next;
    });
    setOpenDevis((current) => (current ? loadedDevis.find((d) => d.id === current.id) ?? current : null));
    setOpenFacture((current) => (current ? loadedFactures.find((f) => f.id === current.id) ?? current : null));
  }, []);

  useEffect(() => {
    void reload().catch((err) => Logger.error('ClientTree.load', err));
  }, [reload]);

  const visible = useMemo(() => {
    return clients.filter((c) => {
      if (!showArchived && c.archived) return false;
      if (roleFilter && !c.roles?.includes(roleFilter as 'client' | 'donateur')) return false;
      if (!query.trim()) return true;
      const blob = `${c.nom} ${c.prenom} ${c.denominationSociale} ${c.email} ${c.telephone} ${c.codeClient} ${c.notes}`.toLowerCase();
      return blob.includes(query.toLowerCase());
    });
  }, [clients, query, roleFilter, showArchived]);

  const devisOf = (clientId: string) => devis.filter((d) => d.clientId === clientId);
  const facturesOfDevis = (devisId: string) => factures.filter((f) => f.devisOrigine === devisId);
  const facturesDirect = (clientId: string) =>
    factures.filter((f) => f.clientId === clientId && !f.devisOrigine);

  const facturesByDevisForClient = (clientId: string) => {
    const map = new Map<string, Facture[]>();
    devisOf(clientId).forEach((d) => map.set(d.id, facturesOfDevis(d.id)));
    return map;
  };

  const filteredByGroupe = useMemo(() => {
    if (!groupeFilter) return visible;
    if (groupeFilter === '__none__') return visible.filter((c) => !c.groupeId);
    return visible.filter((c) => c.groupeId === groupeFilter);
  }, [visible, groupeFilter]);

  const groupedContacts = useMemo(() => {
    const byId = new Map<string, Client[]>();
    const ungrouped: Client[] = [];
    filteredByGroupe.forEach((client) => {
      if (!client.groupeId) {
        ungrouped.push(client);
        return;
      }
      const list = byId.get(client.groupeId) ?? [];
      list.push(client);
      byId.set(client.groupeId, list);
    });
    const sections = groupes
      .filter((g) => byId.has(g.id))
      .map((g) => ({ id: g.id, nom: g.nom, clients: byId.get(g.id) ?? [] }));
    const orphanIds = [...byId.keys()].filter((id) => !groupes.some((g) => g.id === id));
    orphanIds.forEach((id) => {
      sections.push({ id, nom: t('clients.unknownGroupe'), clients: byId.get(id) ?? [] });
    });
    return { sections, ungrouped };
  }, [filteredByGroupe, groupes, t]);

  const createGroupe = async (nom: string): Promise<ContactGroupe | null> => {
    const trimmed = nom.trim();
    if (!trimmed) return null;
    try {
      const created = await ContactGroupService.upsertGroupe({
        id: newEntityId('cgrp'),
        nom: trimmed,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await reload();
      return created;
    } catch (err) {
      Logger.error('ClientTree.createGroupe', err);
      toast.error(t('common.error'));
      return null;
    }
  };

  const openPdf = async (doc: Devis | Facture) => {
    try {
      const emetteur = await EmetteurService.loadEmetteurExtended();
      if (!emetteur) return;
      if (doc.attachment?.path) {
        await AttachmentService.openRel(doc.attachment.path);
        return;
      }
      if (doc.documentType === 'devis') await PDFService.generateDevisPDF(doc, emetteur);
      else await PDFService.generateFacturePDF(doc, emetteur);
    } catch (err) {
      Logger.error('ClientTree.pdf', err);
    }
  };

  const saveClient = (c: Client) => {
    void ClientService.upsertClient(c)
      .then((saved) => {
        toast.success(t('common.success'));
        setCreateOpen(false);
        setFicheClient(saved);
        return reload();
      })
      .catch((err) => {
        Logger.error('ClientTree.save', err);
        toast.error(t('common.error'));
      });
  };

  const renderContactRow = (client: Client) => {
    const dCount = devisOf(client.id).length;
    const fCount =
      devisOf(client.id).reduce((n, d) => n + facturesOfDevis(d.id).length, 0) +
      facturesDirect(client.id).length;
    return (
      <div key={client.id} className="inv-row">
        <div
          className="inv-row-head contact-row"
          onClick={() => {
            setFicheClient(client);
            void DonationService.listByContact(client.id)
              .then(setContactDonations)
              .catch((err) => Logger.error('ClientTree.loadDonations', err));
          }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setFicheClient(client);
              void DonationService.listByContact(client.id)
                .then(setContactDonations)
                .catch((err) => Logger.error('ClientTree.loadDonations', err));
            }
          }}
        >
          <span
            className="inv-client-avatar"
            style={client.color ? { backgroundColor: client.color, borderColor: client.color, color: '#ffffff' } : undefined}
          >
            {clientDisplayName(client).slice(0, 2).toUpperCase()}
          </span>
          <span className="inv-client-identity">
            <span className="inv-row-title">{clientDisplayName(client)}</span>
            <small>{client.type === 'entreprise' ? t('org.typeEntreprise') : t('org.typePart')}</small>
          </span>
          <span className="inv-badge">{client.codeClient}</span>
          {client.roles?.includes('donateur') && <span className="inv-badge contact-donor-badge">{t('clients.roleDonor')}</span>}
          <span className="inv-row-meta">
            {client.email && <><Mail size={13} /> {client.email}</>}
            {client.telephone && <><Phone size={13} /> {client.telephone}</>}
          </span>
          <span className="inv-client-doc-count">
            {dCount} {t('clients.quotes')} · {fCount} {t('clients.invoices')}
          </span>
          <button
            type="button"
            className="ct-btn-danger inv-icon-button"
            title={t('common.delete')}
            onClick={(e) => {
              e.stopPropagation();
              setDeleteClientId(client.id);
            }}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="client-workspace">
      <div className="inv-toolbar-card">
        <label className="inv-search-wrap">
          <Search size={17} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('clients.searchPlaceholder')}
          />
        </label>
        <select
          className="contact-filter-groupe"
          value={groupeFilter}
          onChange={(e) => setGroupeFilter(e.target.value)}
          aria-label={t('clients.groupement')}
        >
          <option value="">{t('clients.allGroupes')}</option>
          <option value="__none__">{t('clients.noGroupe')}</option>
          {groupes.map((g) => (
            <option key={g.id} value={g.id}>
              {g.nom}
            </option>
          ))}
        </select>
        <select
          className="contact-filter-groupe"
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          aria-label={t('clients.role')}
        >
          <option value="">{t('clients.allRoles')}</option>
          <option value="client">{t('clients.roleClients')}</option>
          <option value="donateur">{t('clients.roleDonors')}</option>
        </select>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          {t('clients.showArchived')}
        </label>
        <button type="button" className="ct-btn-secondary" onClick={() => setGroupeModalOpen(true)}>
          <FolderPlus size={16} /> {t('clients.newGroupe')}
        </button>
        <button type="button" className="ct-btn-primary" onClick={() => setCreateOpen(true)}>
          <Plus size={16} /> {t('clients.new')}
        </button>
      </div>

      <div className="inv-tree">
        {filteredByGroupe.length === 0 && <div className="inv-empty">{t('clients.empty')}</div>}
        {groupedContacts.sections.map((section) => (
          <div key={section.id} className="contact-groupe-block">
            <div className="contact-groupe-head">
              <strong>{section.nom}</strong>
              <span>{section.clients.length}</span>
              <button
                type="button"
                className="ct-btn-danger inv-icon-button"
                title={t('common.delete')}
                onClick={() => setDeleteGroupeId(section.id)}
              >
                <Trash2 size={14} />
              </button>
            </div>
            {section.clients.map((client) => renderContactRow(client))}
          </div>
        ))}
        {groupedContacts.ungrouped.length > 0 && (
          <div className="contact-groupe-block">
            {groupedContacts.sections.length > 0 && (
              <div className="contact-groupe-head">
                <strong>{t('clients.noGroupe')}</strong>
                <span>{groupedContacts.ungrouped.length}</span>
              </div>
            )}
            {groupedContacts.ungrouped.map((client) => renderContactRow(client))}
          </div>
        )}
      </div>

      {ficheClient && (
        <ContactFicheModal
          isOpen={Boolean(ficheClient)}
          client={ficheClient}
          groupes={groupes}
          devis={devisOf(ficheClient.id)}
          facturesByDevis={facturesByDevisForClient(ficheClient.id)}
          facturesDirect={facturesDirect(ficheClient.id)}
          donations={contactDonations}
          onClose={() => {
            setFicheClient(null);
            setContactDonations([]);
            setDonationFormOpen(false);
          }}
          onSaveClient={saveClient}
          onCreateGroupe={createGroupe}
          onOpenDevis={(d) => setOpenDevis(d)}
          onOpenFacture={(f) => setOpenFacture(f)}
          onNewDevis={() => {
            setEditDevis(null);
            setDevisClientId(ficheClient.id);
          }}
          onNewDonation={() => setDonationFormOpen(true)}
        />
      )}

      {ficheClient && (
        <DonationFormModal
          isOpen={donationFormOpen}
          donors={[ficheClient]}
          lockedContactId={ficheClient.id}
          title={t('clients.newDonation')}
          onClose={() => setDonationFormOpen(false)}
          onSaved={async () => {
            await reload();
            const donations = await DonationService.listByContact(ficheClient.id);
            setContactDonations(donations);
          }}
        />
      )}

      <ContactElementModal
        isOpen={Boolean(openDevis) && !openFacture}
        clientName={ficheClient ? clientDisplayName(ficheClient) : ''}
        devis={openDevis}
        linkedFactures={openDevis ? facturesOfDevis(openDevis.id) : []}
        onClose={() => setOpenDevis(null)}
        onOpenFacture={(f) => setOpenFacture(f)}
        onEditDevis={() => {
          if (!openDevis) return;
          setEditDevis(openDevis);
          setDevisClientId(openDevis.clientId);
        }}
        onFacturer={() => setFactureDevis(openDevis)}
        onCaduc={() => setCaducDevis(openDevis)}
        onPdf={() => openDevis && void openPdf(openDevis)}
        onDevisRefresh={reload}
        onDevisUpdated={setOpenDevis}
      />

      <ContactElementModal
        isOpen={Boolean(openFacture)}
        clientName={ficheClient ? clientDisplayName(ficheClient) : ''}
        facture={openFacture}
        originDevis={
          openFacture?.devisOrigine ? devis.find((d) => d.id === openFacture.devisOrigine) ?? null : null
        }
        onClose={() => setOpenFacture(null)}
        onPdf={() => openFacture && void openPdf(openFacture)}
        onPay={() => openFacture && setPayFacture(openFacture)}
        onEditFacture={() => {
          if (!openFacture) return;
          setEditFacture(openFacture);
        }}
      />

      <WideModal isOpen={createOpen} title={t('clients.formTitle')} onClose={() => setCreateOpen(false)}>
        <ClientForm
          initial={null}
          groupes={groupes}
          onCancel={() => setCreateOpen(false)}
          onSubmit={saveClient}
          onCreateGroupe={createGroupe}
        />
      </WideModal>

      <Modal
        isOpen={groupeModalOpen}
        title={t('clients.newGroupe')}
        onClose={() => {
          setGroupeModalOpen(false);
          setGroupeModalNom('');
        }}
        footer={
          <>
            <button
              type="button"
              className="ct-btn-secondary"
              onClick={() => {
                setGroupeModalOpen(false);
                setGroupeModalNom('');
              }}
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              className="ct-btn-primary"
              disabled={!groupeModalNom.trim()}
              onClick={() => {
                void createGroupe(groupeModalNom).then((created) => {
                  if (!created) return;
                  setGroupeModalOpen(false);
                  setGroupeModalNom('');
                  toast.success(t('common.success'));
                });
              }}
            >
              {t('common.save')}
            </button>
          </>
        }
      >
        <label className="org-field">
          <span>{t('clients.groupeNom')}</span>
          <input
            autoFocus
            value={groupeModalNom}
            onChange={(e) => setGroupeModalNom(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && groupeModalNom.trim()) {
                e.preventDefault();
                void createGroupe(groupeModalNom).then((created) => {
                  if (!created) return;
                  setGroupeModalOpen(false);
                  setGroupeModalNom('');
                  toast.success(t('common.success'));
                });
              }
            }}
          />
        </label>
      </Modal>

      <DevisModal
        isOpen={Boolean(devisClientId) || Boolean(editDevis)}
        clientId={devisClientId}
        devisToEdit={editDevis}
        onClose={() => {
          setDevisClientId(null);
          setEditDevis(null);
          void reload();
        }}
      />
      <FactureModal
        isOpen={Boolean(factureDevis) || Boolean(editFacture)}
        devis={factureDevis}
        factureToEdit={editFacture}
        onClose={() => {
          setFactureDevis(null);
          setEditFacture(null);
          void reload();
        }}
      />

      {payFacture && (
        <PaiementFactureModal
          isOpen={Boolean(payFacture)}
          onClose={() => setPayFacture(null)}
          facture={payFacture}
          clientName={
            (() => {
              const c = clients.find((item) => item.id === payFacture.clientId);
              return c ? clientDisplayName(c) : payFacture.clientId;
            })()
          }
          onSaved={async () => {
            await reload();
            const updated = (await InvoiceService.loadFactures()).find((f) => f.id === payFacture.id);
            setPayFacture(updated ?? null);
            if (updated) setOpenFacture(updated);
          }}
        />
      )}
      <CaducDevisModal
        isOpen={Boolean(caducDevis)}
        numero={caducDevis?.numero ?? ''}
        onCancel={() => setCaducDevis(null)}
        onConfirm={async (payload) => {
          if (!caducDevis) return;
          await InvoiceService.markDevisCaduc(caducDevis.id, payload);
          toast.success(t('facturation.caduc.done'));
          setCaducDevis(null);
          await reload();
        }}
      />

      <ConfirmModal
        isOpen={Boolean(deleteClientId)}
        title={t('common.delete')}
        message={t('clients.deleteConfirm')}
        onCancel={() => setDeleteClientId(null)}
        onConfirm={() => {
          if (!deleteClientId) return;
          void ClientService.deleteClient(deleteClientId).then(() => {
            setDeleteClientId(null);
            if (ficheClient?.id === deleteClientId) setFicheClient(null);
            return reload();
          }).catch((err) => {
            toast.error(err instanceof Error ? err.message : t('common.error'));
          });
        }}
      />
      <ConfirmModal
        isOpen={Boolean(deleteGroupeId)}
        title={t('common.delete')}
        message={t('clients.deleteGroupeConfirm')}
        onCancel={() => setDeleteGroupeId(null)}
        onConfirm={() => {
          if (!deleteGroupeId) return;
          void ContactGroupService.deleteGroupe(deleteGroupeId).then(() => {
            if (groupeFilter === deleteGroupeId) setGroupeFilter('');
            setDeleteGroupeId(null);
            return reload();
          });
        }}
      />
    </div>
  );
};

export default ClientTree;
