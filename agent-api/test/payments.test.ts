// Tests du suivi des paiements de factures (PaymentTracking).
// Base SQLite temporaire uniquement (jamais data/ ni AppData).
import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import { api, withServer } from './helpers.ts';

const POSTES_TTC120 = [
  {
    id: 'p1',
    type: 'travail',
    designation: 'Prestation',
    tauxHoraire: 50,
    heuresEstimees: 2,
    nombreIntervenants: 1,
    tauxTVA: 20,
  },
];

withServer('Suivi des paiements de factures', (t) => {
  let factureId: string;

  before(async () => {
    const res = await api(t.baseUrl, 'POST', '/factures', {
      clientId: 'client-1',
      numero: 'FA-2026-101',
      dateEcheance: '2026-12-31',
      postes: POSTES_TTC120,
    });
    assert.equal(res.status, 201);
    factureId = res.body.id as string;
  });

  it('GET payment-status : facture non payee, statut brouillon', async () => {
    const res = await api(t.baseUrl, 'GET', `/factures/${factureId}/payment-status`);
    assert.equal(res.status, 200);
    assert.equal(res.body.paidAmount, 0);
    assert.equal(res.body.totalTTC, 120);
    assert.equal(res.body.remaining, 120);
    assert.equal(res.body.statut_calcule, 'brouillon');
    const missing = await api(t.baseUrl, 'GET', '/factures/inconnu/payment-status');
    assert.equal(missing.status, 404);
  });

  it('GET matches : transaction label+montant -> reason both, score 160', async () => {
    await api(t.baseUrl, 'POST', '/transactions', {
      account_id: 1,
      date: '2026-10-15',
      credit: 120,
      label: 'Virement client FA-2026-101',
    });
    const res = await api(t.baseUrl, 'GET', `/factures/${factureId}/paiements/matches`);
    assert.equal(res.status, 200);
    const items = res.body.items as Array<Record<string, unknown>>;
    const first = items[0];
    assert.ok(first, 'aucun match');
    assert.equal(first.reason, 'both');
    assert.equal(first.score, 160);
  });

  it('POST link dry_run : diff sans ecriture', async () => {
    const res = await api(t.baseUrl, 'POST', `/factures/${factureId}/paiements/link`, { transaction_id: 1, dry_run: true });
    assert.equal(res.status, 200);
    assert.equal(res.body.dry_run, true);
    assert.equal(res.body.action, 'link_paiement');
    const status = await api(t.baseUrl, 'GET', `/factures/${factureId}/payment-status`);
    assert.equal(status.body.remaining, 120);
  });

  it('POST link : lie la transaction, statut payee, audit journalise', async () => {
    const res = await api(t.baseUrl, 'POST', `/factures/${factureId}/paiements/link`, { transaction_id: 1 });
    assert.equal(res.status, 200);
    assert.equal(res.body.linked, true);
    const facture = res.body.facture as Record<string, unknown>;
    assert.equal(facture.statut, 'payee');
    const status = await api(t.baseUrl, 'GET', `/factures/${factureId}/payment-status`);
    assert.equal(status.body.remaining, 0);
    assert.equal(status.body.statut_calcule, 'payee');
    const audit = await api(t.baseUrl, 'GET', '/audit?limit=10');
    const items = audit.body.items as Array<Record<string, unknown>>;
    assert.ok(items.some((a) => a.entity === 'facture' && a.action === 'link_paiement'), 'audit link_paiement manquant');
  });

  it('POST link : idempotent si deja lie, 422 si debit, 404 si transaction inconnue', async () => {
    const again = await api(t.baseUrl, 'POST', `/factures/${factureId}/paiements/link`, { transaction_id: 1 });
    assert.equal(again.status, 200);
    assert.equal(again.body.linked, false);
    await api(t.baseUrl, 'POST', '/transactions', { account_id: 1, date: '2026-10-16', debit: -50, label: 'Achat' });
    const debit = await api(t.baseUrl, 'POST', `/factures/${factureId}/paiements/link`, { transaction_id: 2 });
    assert.equal(debit.status, 422);
    const unknown = await api(t.baseUrl, 'POST', `/factures/${factureId}/paiements/link`, { transaction_id: 999 });
    assert.equal(unknown.status, 404);
  });

  it('POST paiement manuel : especes, transaction de tresorerie creee, statut payee_partiellement', async () => {
    const created = await api(t.baseUrl, 'POST', '/factures', {
      clientId: 'client-1',
      numero: 'FA-2026-102',
      postes: [
        { id: 'p1', type: 'materiel', designation: 'Licence', prixUnitaireHT: 50, quantite: 1, tauxTVA: 20 },
      ],
    });
    const id2 = created.body.id as string;
    const res = await api(t.baseUrl, 'POST', `/factures/${id2}/paiements`, {
      montant: 30,
      date: '2026-10-16',
      mode: 'especes',
      account_id: 1,
    });
    assert.equal(res.status, 201);
    const facture = res.body.facture as Record<string, unknown>;
    assert.equal(facture.statut, 'payee_partiellement');
    const status = await api(t.baseUrl, 'GET', `/factures/${id2}/payment-status`);
    assert.equal(status.body.paidAmount, 30);
    assert.equal(status.body.remaining, 30);
    // La transaction de tresorerie correspondante existe (credit 30, label suivi).
    const tx = t.db.prepare('SELECT * FROM transactions WHERE id = ?').get(3) as Record<string, unknown> | undefined;
    assert.ok(tx, 'transaction de tresorerie manquante');
    assert.equal(tx.credit, 30);
    assert.match(String(tx.label), /Paiement Espèces FA-2026-102/);
    const badMode = await api(t.baseUrl, 'POST', `/factures/${id2}/paiements`, {
      montant: 10, date: '2026-10-16', mode: 'virement', account_id: 1,
    });
    assert.equal(badMode.status, 422);
  });

  it('DELETE paiement : 400 sans confirm, 200 avec confirm, statut recalcule', async () => {
    const created = await api(t.baseUrl, 'POST', '/factures', {
      clientId: 'client-1',
      numero: 'FA-2026-103',
      postes: [
        { id: 'p1', type: 'materiel', designation: 'Licence', prixUnitaireHT: 50, quantite: 1, tauxTVA: 20 },
      ],
    });
    const id3 = created.body.id as string;
    const pay = await api(t.baseUrl, 'POST', `/factures/${id3}/paiements`, {
      montant: 60, date: '2026-10-16', mode: 'cheque', account_id: 1,
    });
    const paiementId = pay.body.paiement_id as string;
    const noConfirm = await api(t.baseUrl, 'DELETE', `/factures/${id3}/paiements/${paiementId}`);
    assert.equal(noConfirm.status, 400);
    const dry = await api(t.baseUrl, 'DELETE', `/factures/${id3}/paiements/${paiementId}?confirm=true`, { dry_run: true });
    assert.equal(dry.status, 200);
    assert.equal(dry.body.dry_run, true);
    const res = await api(t.baseUrl, 'DELETE', `/factures/${id3}/paiements/${paiementId}?confirm=true`);
    assert.equal(res.status, 200);
    const facture = res.body.facture as Record<string, unknown>;
    // Apres retrait du paiement, la facture n'est plus un brouillon : statut envoyee.
    assert.equal(facture.statut, 'envoyee');
    const missing = await api(t.baseUrl, 'DELETE', `/factures/${id3}/paiements/${paiementId}?confirm=true`);
    assert.equal(missing.status, 404);
  });

  it('POST auto-link : lie les transactions dont le libelle contient le numero', async () => {
    const created = await api(t.baseUrl, 'POST', '/factures', {
      clientId: 'client-1',
      numero: 'FA-2026-104',
      dateEcheance: '2026-12-31',
      postes: POSTES_TTC120,
    });
    const id4 = created.body.id as string;
    await api(t.baseUrl, 'POST', '/transactions', {
      account_id: 1, date: '2026-10-16', credit: 120, label: 'Reglement facture FA-2026-104',
    });
    const dry = await api(t.baseUrl, 'POST', `/factures/${id4}/paiements/auto-link`, { dry_run: true });
    assert.equal(dry.status, 200);
    assert.equal(dry.body.dry_run, true);
    const res = await api(t.baseUrl, 'POST', `/factures/${id4}/paiements/auto-link`);
    assert.equal(res.status, 200);
    assert.equal(res.body.linked, 1);
    const facture = res.body.facture as Record<string, unknown>;
    assert.equal(facture.statut, 'payee');
    const again = await api(t.baseUrl, 'POST', `/factures/${id4}/paiements/auto-link`);
    assert.equal(again.body.linked, 0);
  });
});
