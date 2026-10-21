// Tests de l'API agent — base de test temporaire, aucune donnee reelle.
// Executer : npm test (dans agent-api/)
import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import { api, TEST_TOKEN, withServer } from './helpers.ts';

withServer('Authentification', (t) => {
  it('401 sans jeton sur /version', async () => {
    const res = await fetch(`${t.baseUrl}/version`);
    assert.equal(res.status, 401);
  });

  it('401 avec un mauvais jeton', async () => {
    const res = await fetch(`${t.baseUrl}/version`, {
      headers: { Authorization: 'Bearer mauvais-jeton-completement-faux' },
    });
    assert.equal(res.status, 401);
  });

  it('200 /health sans jeton (ping applicatif)', async () => {
    const res = await fetch(`${t.baseUrl}/health`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as Record<string, unknown>;
    assert.equal(body.ok, true);
  });

  it('200 /version avec le bon jeton', async () => {
    const res = await fetch(`${t.baseUrl}/version`, {
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as Record<string, unknown>;
    assert.equal(body.api_version, 'v1');
  });

  it('404 route inconnue (authentifie)', async () => {
    const res = await api(t.baseUrl, 'GET', '/inexistant');
    assert.equal(res.status, 404);
  });
});

withServer('Comptes', (t) => {
  it('liste les comptes pre-seedés', async () => {
    const res = await api(t.baseUrl, 'GET', '/accounts');
    assert.equal(res.status, 200);
    assert.equal(res.body.total, 1);
    const items = res.body.items as Array<Record<string, unknown>>;
    assert.ok(items.length > 0);
    assert.equal(items[0]!.code, 'ACC1');
  });

  it('cree un compte (201) puis le relit', async () => {
    const created = await api(t.baseUrl, 'POST', '/accounts', {
      code: 'EPG',
      name: 'Epargne',
      color: '#22aa66',
      initial_balance: 500,
    });
    assert.equal(created.status, 201);
    const id = created.body.id as number;
    const read = await api(t.baseUrl, 'GET', `/accounts/${id}`);
    assert.equal(read.status, 200);
    assert.equal((read.body as Record<string, unknown>).name, 'Epargne');
  });

  it('409 si code de compte duplique', async () => {
    const res = await api(t.baseUrl, 'POST', '/accounts', { code: 'ACC1', name: 'Doublon' });
    assert.equal(res.status, 409);
  });

  it('422 si couleur invalide', async () => {
    const res = await api(t.baseUrl, 'POST', '/accounts', { code: 'BAD', name: 'X', color: 'rouge' });
    assert.equal(res.status, 422);
  });

  it('dry_run ne cree rien', async () => {
    const before = await api(t.baseUrl, 'GET', '/accounts');
    const res = await api(t.baseUrl, 'POST', '/accounts?dry_run=true', { code: 'DRY', name: 'Dry' });
    assert.equal(res.status, 200);
    assert.equal(res.body.dry_run, true);
    const after = await api(t.baseUrl, 'GET', '/accounts');
    assert.equal(after.body.total, before.body.total);
  });

  it('DELETE sans confirm -> 400, avec confirm -> 200 et cascade', async () => {
    const created = await api(t.baseUrl, 'POST', '/accounts', { code: 'TMP', name: 'Temp' });
    const id = created.body.id as number;
    const refused = await api(t.baseUrl, 'DELETE', `/accounts/${id}`);
    assert.equal(refused.status, 400);
    const ok = await api(t.baseUrl, 'DELETE', `/accounts/${id}?confirm=true`);
    assert.equal(ok.status, 200);
    const gone = await api(t.baseUrl, 'GET', `/accounts/${id}`);
    assert.equal(gone.status, 404);
  });
});

withServer('Categories', (t) => {
  it('cree une categorie (201)', async () => {
    const res = await api(t.baseUrl, 'POST', '/categories', { code: 'LOIS', name: 'Loisirs' });
    assert.equal(res.status, 201);
    const category = res.body.category as Record<string, unknown>;
    assert.equal(category.code, 'LOIS');
  });

  it('refuse de supprimer la categorie X (transferts)', async () => {
    const list = await api(t.baseUrl, 'GET', '/categories');
    const items = list.body.items as Array<Record<string, unknown>>;
    const x = items.find((c) => c.code === 'X') as Record<string, unknown>;
    const res = await api(t.baseUrl, 'DELETE', `/categories/${x.id}`);
    assert.equal(res.status, 422);
  });

  it('refuse de renommer la categorie X', async () => {
    const list = await api(t.baseUrl, 'GET', '/categories');
    const items = list.body.items as Array<Record<string, unknown>>;
    const x = items.find((c) => c.code === 'X') as Record<string, unknown>;
    const res = await api(t.baseUrl, 'PATCH', `/categories/${x.id}`, { name: 'Pirate' });
    assert.equal(res.status, 422);
  });

  it('refuse de creer une categorie avec le code X', async () => {
    const res = await api(t.baseUrl, 'POST', '/categories', { code: 'X', name: 'Pirate' });
    assert.equal(res.status, 409);
  });

  it('renommage de code repercute sur les transactions', async () => {
    const created = await api(t.baseUrl, 'POST', '/categories', { code: 'VIEUX', name: 'Vieux code' });
    const id = created.body.id as number;
    const tx = await api(t.baseUrl, 'POST', '/transactions', {
      account_id: 1,
      date: '2026-10-01',
      debit: 10,
      label: 'Test renommage',
      category_code: 'VIEUX',
    });
    assert.equal(tx.status, 201);
    const renamed = await api(t.baseUrl, 'PATCH', `/categories/${id}`, { code: 'NOUV' });
    assert.equal(renamed.status, 200);
    const read = await api(t.baseUrl, 'GET', `/transactions/${tx.body.id as number}`);
    const transaction = read.body as Record<string, unknown>;
    assert.equal(transaction.category_code, 'NOUV');
  });
});

withServer('Transactions', (t) => {
  it('cree une transaction (201) avec valeur_date par defaut = date', async () => {
    const res = await api(t.baseUrl, 'POST', '/transactions', {
      account_id: 1,
      date: '2026-10-05',
      debit: 12.345,
      label: 'Courses',
      category_code: 'ALIM',
    });
    assert.equal(res.status, 201);
    const transaction = res.body.transaction as Record<string, unknown>;
    assert.equal(transaction.value_date, '2026-10-05');
    // Convention app : debit positif saisi -> normalise en negatif (depense), arrondi 2 decimales.
    assert.equal(transaction.debit, -12.35);
    assert.equal(transaction.deleted_at, null);
  });

  it('422 si compte inexistant', async () => {
    const res = await api(t.baseUrl, 'POST', '/transactions', {
      account_id: 9999,
      date: '2026-10-05',
      debit: 1,
      label: 'X',
    });
    assert.equal(res.status, 422);
  });

  it('422 si categorie inexistante', async () => {
    const res = await api(t.baseUrl, 'POST', '/transactions', {
      account_id: 1,
      date: '2026-10-05',
      debit: 1,
      label: 'X',
      category_code: 'NUL',
    });
    assert.equal(res.status, 422);
  });

  it('422 si date invalide', async () => {
    const res = await api(t.baseUrl, 'POST', '/transactions', {
      account_id: 1,
      date: '05/10/2026',
      debit: 1,
      label: 'X',
    });
    assert.equal(res.status, 422);
  });

  it('422 si debit et credit tous deux positifs (POST)', async () => {
    const res = await api(t.baseUrl, 'POST', '/transactions', {
      account_id: 1,
      date: '2026-10-05',
      debit: 10,
      credit: 5,
      label: 'Incoherent',
    });
    assert.equal(res.status, 422);
  });

  it('422 si debit et credit tous deux nuls (POST)', async () => {
    const res = await api(t.baseUrl, 'POST', '/transactions', {
      account_id: 1,
      date: '2026-10-05',
      debit: 0,
      credit: 0,
      label: 'Vide',
    });
    assert.equal(res.status, 422);
  });

  it('422 si champ inconnu (POST) — message citant le champ', async () => {
    const res = await api(t.baseUrl, 'POST', '/transactions', {
      account_id: 1,
      date: '2026-10-05',
      debit: 10,
      label: 'X',
      montant: 10, // champ inexistant : doit etre rejete, pas ignore
    });
    assert.equal(res.status, 422);
    assert.ok(String(res.body.error).includes('montant'));
  });

  it('422 si champ inconnu (PATCH)', async () => {
    const created = await api(t.baseUrl, 'POST', '/transactions', {
      account_id: 1,
      date: '2026-10-05',
      debit: 10,
      label: 'B',
    });
    assert.equal(created.status, 201);
    const id = created.body.id as number;
    const res = await api(t.baseUrl, 'PATCH', `/transactions/${id}`, { libelle: 'nouveau' });
    assert.equal(res.status, 422);
    assert.ok(String(res.body.error).includes('libelle'));
  });

  it('422 si PATCH rend debit et credit simultanement positifs', async () => {
    const created = await api(t.baseUrl, 'POST', '/transactions', {
      account_id: 1,
      date: '2026-10-05',
      debit: 10,
      label: 'A',
    });
    assert.equal(created.status, 201);
    const id = created.body.id as number;
    const res = await api(t.baseUrl, 'PATCH', `/transactions/${id}`, { credit: 5 });
    assert.equal(res.status, 422);
  });

  it('PATCH peut basculer debit -> credit (mouvement unique conserve)', async () => {
    const created = await api(t.baseUrl, 'POST', '/transactions', {
      account_id: 1,
      date: '2026-10-05',
      debit: 10,
      label: 'Bascule',
    });
    const id = created.body.id as number;
    const res = await api(t.baseUrl, 'PATCH', `/transactions/${id}`, { debit: 0, credit: 10 });
    assert.equal(res.status, 200);
    const transaction = res.body.transaction as Record<string, unknown>;
    assert.equal(transaction.debit, 0);
    assert.equal(transaction.credit, 10);
  });

  it('PATCH modifie le libelle et journalise before/after', async () => {
    const created = await api(t.baseUrl, 'POST', '/transactions', {
      account_id: 1,
      date: '2026-10-06',
      credit: 100,
      label: 'Salaire',
    });
    const id = created.body.id as number;
    const patched = await api(t.baseUrl, 'PATCH', `/transactions/${id}`, { label: 'Salaire octobre' });
    assert.equal(patched.status, 200);
    const transaction = patched.body.transaction as Record<string, unknown>;
    assert.equal(transaction.label, 'Salaire octobre');
    const audit = await api(t.baseUrl, 'GET', '/audit?limit=5');
    const items = audit.body.items as Array<Record<string, unknown>>;
    const entry = items.find(
      (a) => a.entity === 'transaction' && a.action === 'update' && a.entity_id === String(id)
    );
    assert.ok(entry, 'entree audit update transaction manquante');
    const before = entry.before as Record<string, unknown>;
    const after = entry.after as Record<string, unknown>;
    assert.equal(before.label, 'Salaire');
    assert.equal(after.label, 'Salaire octobre');
  });

  it('DELETE = soft delete, invisible par defaut, visible avec include_deleted', async () => {
    const created = await api(t.baseUrl, 'POST', '/transactions', {
      account_id: 1,
      date: '2026-10-07',
      debit: 5,
      label: 'A supprimer',
    });
    const id = created.body.id as number;
    const del = await api(t.baseUrl, 'DELETE', `/transactions/${id}`);
    assert.equal(del.status, 200);
    assert.equal(del.body.deleted, 'soft');
    const read = await api(t.baseUrl, 'GET', `/transactions/${id}`);
    assert.equal(read.status, 404);
    const listDefault = await api(t.baseUrl, 'GET', '/transactions');
    const listDeleted = await api(t.baseUrl, 'GET', '/transactions?include_deleted=true');
    assert.equal(listDefault.body.total, (listDeleted.body.total as number) - 1);
  });

  it('dry_run PATCH renvoie le diff sans ecrire', async () => {
    const created = await api(t.baseUrl, 'POST', '/transactions', {
      account_id: 1,
      date: '2026-10-08',
      debit: 20,
      label: 'Original',
    });
    const id = created.body.id as number;
    const dry = await api(t.baseUrl, 'PATCH', `/transactions/${id}?dry_run=true`, { label: 'Modifie' });
    assert.equal(dry.status, 200);
    assert.equal(dry.body.dry_run, true);
    const before = dry.body.before as Record<string, unknown>;
    const after = dry.body.after as Record<string, unknown>;
    assert.equal(before.label, 'Original');
    assert.equal(after.label, 'Modifie');
    const read = await api(t.baseUrl, 'GET', `/transactions/${id}`);
    assert.equal((read.body as Record<string, unknown>).label, 'Original');
  });

  it('filtre par account_id et pagination', async () => {
    const res = await api(t.baseUrl, 'GET', '/transactions?account_id=1&limit=2&offset=0');
    assert.equal(res.status, 200);
    const items = res.body.items as unknown[];
    assert.ok(items.length <= 2);
    assert.equal(res.body.limit, 2);
  });
});

withServer("Journal d'audit", (t) => {
  it('est append-only : UPDATE et DELETE sont bloques par trigger', async () => {
    // Les seeds sont inseres hors API : on cree une ecriture pour alimenter le journal.
    const created = await api(t.baseUrl, 'POST', '/categories', { code: 'APP', name: 'Append test' });
    assert.equal(created.status, 201);
    const audit = await api(t.baseUrl, 'GET', '/audit?limit=1');
    const items = audit.body.items as Array<Record<string, unknown>>;
    assert.ok(items.length > 0, 'audit vide : rien a tester');
    const id = items[0]!.id as number;
    assert.throws(
      () => t.db.prepare('UPDATE audit_log SET actor = ? WHERE id = ?').run('pirate', id),
      /append-only/
    );
    assert.throws(() => t.db.prepare('DELETE FROM audit_log WHERE id = ?').run(id), /append-only/);
  });

  it('les ecritures agent-api sont journalisees avec actor=agent-api', async () => {
    const created = await api(t.baseUrl, 'POST', '/categories', { code: 'AUD', name: 'Audit test' });
    assert.equal(created.status, 201);
    const audit = await api(t.baseUrl, 'GET', '/audit?limit=10');
    const items = audit.body.items as Array<Record<string, unknown>>;
    const entry = items.find(
      (a) =>
        a.entity === 'category' &&
        a.action === 'create' &&
        (a.after as Record<string, unknown>).code === 'AUD'
    );
    assert.ok(entry, 'entree audit create category manquante');
    assert.equal(entry.actor, 'agent-api');
  });
});

withServer('Regroupements et soldes', (t) => {
  it('liste les regroupements de categories', async () => {
    const res = await api(t.baseUrl, 'GET', '/category-groups');
    assert.equal(res.status, 200);
    const items = res.body.items as Array<Record<string, unknown>>;
    assert.equal(items.length, 1);
    assert.ok(items[0], 'regroupement factice manquant');
    assert.equal(items[0].name, 'Courant');
    assert.equal(items[0].sort_order, 0);
  });

  it('renvoie un regroupement par id, 404 sinon', async () => {
    const ok = await api(t.baseUrl, 'GET', '/category-groups/1');
    assert.equal(ok.status, 200);
    assert.equal((ok.body as Record<string, unknown>).name, 'Courant');
    const missing = await api(t.baseUrl, 'GET', '/category-groups/9999');
    assert.equal(missing.status, 404);
  });

  it('POST /category-groups cree un regroupement (sort_order auto, audit)', async () => {
    const res = await api(t.baseUrl, 'POST', '/category-groups', { name: 'Loisirs', color: '#22c55e' });
    assert.equal(res.status, 201);
    const group = res.body.categoryGroup as Record<string, unknown>;
    assert.equal(group.name, 'Loisirs');
    assert.equal(group.color, '#22c55e');
    assert.equal(group.sort_order, 1, 'sort_order = max + 1');
    const audit = await api(t.baseUrl, 'GET', '/audit?limit=10');
    const items = audit.body.items as Array<Record<string, unknown>>;
    const entry = items.find((a) => a.entity === 'category_group' && a.action === 'create');
    assert.ok(entry, 'entree audit manquante');
    const sansCouleur = await api(t.baseUrl, 'POST', '/category-groups', { name: 'Sans couleur' });
    assert.equal(sansCouleur.status, 201);
    assert.equal((sansCouleur.body.categoryGroup as Record<string, unknown>).color, '#64748b', 'couleur par defaut');
    const sansNom = await api(t.baseUrl, 'POST', '/category-groups', { color: '#22c55e' });
    assert.equal(sansNom.status, 422);
    const mauvaiseCouleur = await api(t.baseUrl, 'POST', '/category-groups', { name: 'X', color: 'vert' });
    assert.equal(mauvaiseCouleur.status, 422);
  });

  it('dry_run sur POST /category-groups ne ecrit rien', async () => {
    const before = await api(t.baseUrl, 'GET', '/category-groups');
    const beforeTotal = before.body.total as number;
    const res = await api(t.baseUrl, 'POST', '/category-groups', { name: 'Fantome', dry_run: true });
    assert.equal(res.status, 200);
    assert.equal(res.body.dry_run, true);
    const after = await api(t.baseUrl, 'GET', '/category-groups');
    assert.equal(after.body.total, beforeTotal);
  });

  it('PATCH /category-groups/{id} modifie partiellement, 404 sinon', async () => {
    const created = await api(t.baseUrl, 'POST', '/category-groups', { name: 'A renommer' });
    const id = created.body.id as number;
    const res = await api(t.baseUrl, 'PATCH', `/category-groups/${id}`, { name: 'Renomme', sort_order: 42 });
    assert.equal(res.status, 200);
    const group = res.body.categoryGroup as Record<string, unknown>;
    assert.equal(group.name, 'Renomme');
    assert.equal(group.sort_order, 42);
    assert.ok(group.color, 'couleur conservee');
    const missing = await api(t.baseUrl, 'PATCH', '/category-groups/9999', { name: 'X' });
    assert.equal(missing.status, 404);
    const mauvaiseCouleur = await api(t.baseUrl, 'PATCH', `/category-groups/${id}`, { color: 'bleu' });
    assert.equal(mauvaiseCouleur.status, 422);
  });

  it('DELETE /category-groups/{id} remet group_id a NULL et journalise, 404 sinon', async () => {
    const created = await api(t.baseUrl, 'POST', '/category-groups', { name: 'A supprimer' });
    const id = created.body.id as number;
    // Rattache la categorie ALIM a ce regroupement.
    t.db.prepare('UPDATE categories SET group_id = ? WHERE code = ?').run(id, 'ALIM');
    const res = await api(t.baseUrl, 'DELETE', `/category-groups/${id}`);
    assert.equal(res.status, 200);
    const cat = t.db.prepare("SELECT group_id FROM categories WHERE code = 'ALIM'").get() as { group_id: number | null };
    assert.equal(cat.group_id, null, 'group_id remis a NULL');
    const missing = await api(t.baseUrl, 'DELETE', '/category-groups/9999');
    assert.equal(missing.status, 404);
    const audit = await api(t.baseUrl, 'GET', '/audit?limit=10');
    const items = audit.body.items as Array<Record<string, unknown>>;
    const entry = items.find((a) => a.entity === 'category_group' && a.action === 'delete');
    assert.ok(entry, 'entree audit delete manquante');
  });

  it('GET /balances renvoie les nets par compte et par categorie (aligne ConfigService)', async () => {
    // Une transaction de debit 10 sur le compte 1, categorie ALIM.
    const created = await api(t.baseUrl, 'POST', '/transactions', {
      account_id: 1,
      date: '2026-10-10',
      debit: 10,
      label: 'Net',
      category_code: 'ALIM',
    });
    assert.equal(created.status, 201);
    const res = await api(t.baseUrl, 'GET', '/balances');
    assert.equal(res.status, 200);
    const accounts = res.body.accounts as Record<string, number>;
    const categories = res.body.categories as Record<string, number>;
    // Compte ACC1 : initial 100 + debit normalise -10 (depense) = 90 (formule identique a ConfigService.accountNets).
    assert.equal(accounts['ACC1'], 90);
    assert.equal(categories['ALIM'], -10);
    assert.equal(categories['X'], 0);
  });

  it('GET /balances exclut les transactions soft-supprimees', async () => {
    const created = await api(t.baseUrl, 'POST', '/transactions', {
      account_id: 1,
      date: '2026-10-11',
      debit: 7,
      label: 'A supprimer',
      category_code: 'ALIM',
    });
    const id = created.body.id as number;
    await api(t.baseUrl, 'DELETE', `/transactions/${id}`);
    const res = await api(t.baseUrl, 'GET', '/balances');
    const accounts = res.body.accounts as Record<string, number>;
    assert.equal(accounts['ACC1'], 90); // inchangé : la transaction supprimée ne compte plus
  });
});

withServer('Convention de signe debit (E2E ecriture -> stats/balances)', (t) => {
  it('POST debit>0 stocke -debit, visible dans stats/kpis et balances (issue cycle 4)', async () => {
    // 1. Ecriture : un agent cree une depense de 12.5 avec debit positif (sens naturel).
    const created = await api(t.baseUrl, 'POST', '/transactions', {
      account_id: 1,
      date: '2026-10-15',
      debit: 12.5,
      label: 'Courses E2E',
      category_code: 'ALIM',
    });
    assert.equal(created.status, 201);
    const transaction = (created.body as Record<string, unknown>).transaction as Record<string, unknown>;
    // Stockage aligne sur l'app : depense = debit NEGATIF.
    assert.equal(transaction.debit, -12.5);
    assert.equal(transaction.credit, 0);

    // 2. Stats : la depense est comptee positivement, le net est negatif.
    const kpis = await api(t.baseUrl, 'GET', '/stats/kpis');
    assert.equal(kpis.status, 200);
    assert.equal(kpis.body.expenses, 12.5);
    assert.equal(kpis.body.income, 0);
    assert.equal(kpis.body.net, -12.5);
    assert.equal(kpis.body.largestExpense, 12.5);

    // 3. Balance : le solde du compte diminue de 12.5 (initial 100 -> 87.5).
    const balances = await api(t.baseUrl, 'GET', '/balances');
    assert.equal(balances.status, 200);
    const accounts = balances.body.accounts as Record<string, number>;
    const categories = balances.body.categories as Record<string, number>;
    assert.equal(accounts['ACC1'], 87.5);
    assert.equal(categories['ALIM'], -12.5);
  });

  it('debit deja negatif (convention app) accepte tel quel, credit negatif normalise', async () => {
    const neg = await api(t.baseUrl, 'POST', '/transactions', {
      account_id: 1,
      date: '2026-10-16',
      debit: -5,
      label: 'Debit negatif direct',
    });
    assert.equal(neg.status, 201);
    const tx = (neg.body as Record<string, unknown>).transaction as Record<string, unknown>;
    assert.equal(tx.debit, -5);

    const creditNeg = await api(t.baseUrl, 'POST', '/transactions', {
      account_id: 1,
      date: '2026-10-16',
      credit: -7,
      label: 'Credit negatif normalise',
    });
    assert.equal(creditNeg.status, 201);
    const tx2 = (creditNeg.body as Record<string, unknown>).transaction as Record<string, unknown>;
    assert.equal(tx2.credit, 7);
  });

  it('PATCH normalise aussi le debit (debit: 5 stocke -5)', async () => {
    const created = await api(t.baseUrl, 'POST', '/transactions', {
      account_id: 1,
      date: '2026-10-17',
      credit: 20,
      label: 'Salaire',
    });
    const id = created.body.id as number;
    const patched = await api(t.baseUrl, 'PATCH', `/transactions/${id}`, { debit: 5, credit: 0 });
    assert.equal(patched.status, 200);
    const tx = patched.body.transaction as Record<string, unknown>;
    assert.equal(tx.debit, -5);
    assert.equal(tx.credit, 0);
  });
});

withServer('Statistiques', (t) => {
  // Seed : LOIS + transactions etalées sur 2 mois, 2 comptes.
  before(async () => {
    await api(t.baseUrl, 'POST', '/categories', { code: 'LOIS', name: 'Loisirs' });
    await api(t.baseUrl, 'POST', '/accounts', { code: 'EPG', name: 'Epargne' });
    // Convention app : depense = debit NEGATIF, revenu = credit positif.
    // Insertion SQL directe : on teste la lecture de debits negatifs tels qu'ecrits
    // par l'app (l'API normalise aussi debit>0 en negatif a l'ecriture).
    const insert = t.db.prepare(
      `INSERT INTO transactions (account_id, date, value_date, debit, credit, label, category_code)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    const seed: Array<[number, string, number, number, string, string | null]> = [
      [1, '2026-09-05', 0, 100, 'Salaire septembre', null],
      [1, '2026-09-10', -30, 0, 'Courses ALIM', 'ALIM'],
      [1, '2026-10-02', -12.5, 0, 'Cinema', 'LOIS'],
      [2, '2026-10-15', -200, 0, 'Virement epargne', 'X'],
    ];
    for (const [accountId, date, debit, credit, label, category] of seed) {
      insert.run(accountId, date, date, debit, credit, label, category);
    }
  });

  it('GET /stats/kpis calcule income/expenses/net/count (aligne StatsService.kpis)', async () => {
    const res = await api(t.baseUrl, 'GET', '/stats/kpis');
    assert.equal(res.status, 200);
    assert.equal(res.body.income, 100);
    assert.equal(res.body.expenses, 242.5);
    assert.equal(res.body.net, -142.5);
    assert.equal(res.body.count, 4);
    assert.equal(res.body.largestIncome, 100);
    assert.equal(res.body.largestExpense, 200);
    assert.equal(res.body.avgAmount, (100 + 30 + 12.5 + 200) / 4);
  });

  it('GET /stats/kpis filtre par category_codes et exclude_categories', async () => {
    const onlyAlim = await api(t.baseUrl, 'GET', '/stats/kpis?category_codes=ALIM');
    assert.equal(onlyAlim.body.expenses, 30);
    assert.equal(onlyAlim.body.count, 1);
    // exclude_categories garde les transactions sans categorie (aligne StatsService.where).
    const noX = await api(t.baseUrl, 'GET', '/stats/kpis?exclude_categories=X');
    assert.equal(noX.body.count, 3);
    assert.equal(noX.body.expenses, 42.5);
  });

  it('GET /stats/kpis filtre par dates, compte et recherche libelle', async () => {
    const oct = await api(t.baseUrl, 'GET', '/stats/kpis?date_start=2026-10-01&date_end=2026-10-31');
    assert.equal(oct.body.count, 2);
    assert.equal(oct.body.expenses, 212.5);
    const epg = await api(t.baseUrl, 'GET', '/stats/kpis?account_ids=2');
    assert.equal(epg.body.count, 1);
    assert.equal(epg.body.expenses, 200);
    const search = await api(t.baseUrl, 'GET', '/stats/kpis?search=cinema');
    assert.equal(search.body.count, 1);
    assert.equal(search.body.expenses, 12.5);
  });

  it('GET /stats/kpis exclut les transactions soft-supprimees', async () => {
    const result = t.db
      .prepare(
        `INSERT INTO transactions (account_id, date, value_date, debit, credit, label, category_code)
         VALUES (1, '2026-10-20', '2026-10-20', -999, 0, 'A supprimer', NULL)`
      )
      .run();
    const id = Number(result.lastInsertRowid);
    await api(t.baseUrl, 'DELETE', `/transactions/${id}`);
    const res = await api(t.baseUrl, 'GET', '/stats/kpis');
    assert.equal(res.body.count, 4);
    assert.equal(res.body.expenses, 242.5);
  });

  it('GET /stats/periods renvoie semaines/mois/annees distincts avec bornes (aligne distinctPeriods)', async () => {
    const res = await api(t.baseUrl, 'GET', '/stats/periods');
    assert.equal(res.status, 200);
    const months = res.body.months as Array<{ start: string; end: string }>;
    assert.deepEqual(months, [
      { start: '2026-10-01', end: '2026-10-31' },
      { start: '2026-09-01', end: '2026-09-30' },
    ]);
    const years = res.body.years as Array<{ start: string; end: string }>;
    assert.deepEqual(years, [{ start: '2026-01-01', end: '2026-12-31' }]);
    // 2026-09-05 est un samedi -> semaine du lundi 2026-08-31 au dimanche 2026-09-06.
    const weeks = res.body.weeks as Array<{ start: string; end: string }>;
    assert.ok(weeks.some((w) => w.start === '2026-08-31' && w.end === '2026-09-06'));
    // 2026-10-02 est un vendredi -> semaine du lundi 2026-09-28 au dimanche 2026-10-04.
    assert.ok(weeks.some((w) => w.start === '2026-09-28' && w.end === '2026-10-04'));
    // 2026-10-15 est un jeudi -> semaine du lundi 2026-10-12 au dimanche 2026-10-18.
    assert.ok(weeks.some((w) => w.start === '2026-10-12' && w.end === '2026-10-18'));
  });

  it('GET /stats/category-totals groupe par categorie, trie par montant absolu decroissant', async () => {
    const res = await api(t.baseUrl, 'GET', '/stats/category-totals');
    assert.equal(res.status, 200);
    const items = res.body.items as Array<{
      categoryCode: string | null;
      net: number;
      income: number;
      expenses: number;
      txCount: number;
    }>;
    assert.equal(items.length, 4);
    // Tri par |net| decroissant : X (-200), sans categorie (+100), ALIM (-30), LOIS (-12.5).
    assert.equal(items[0]!.categoryCode, 'X');
    assert.equal(items[0]!.net, -200);
    assert.equal(items[0]!.txCount, 1);
    assert.equal(items[1]!.categoryCode, null);
    assert.equal(items[1]!.net, 100);
    assert.equal(items[1]!.income, 100);
    assert.equal(items[2]!.categoryCode, 'ALIM');
    assert.equal(items[2]!.net, -30);
    assert.equal(items[2]!.expenses, 30);
    assert.equal(items[3]!.categoryCode, 'LOIS');
    assert.equal(items[3]!.net, -12.5);
  });

  it('GET /stats/* refuse des filtres invalides', async () => {
    const badDate = await api(t.baseUrl, 'GET', '/stats/kpis?date_start=10-2026');
    assert.equal(badDate.status, 422); // date mal formee -> validation 422
    const badIds = await api(t.baseUrl, 'GET', '/stats/category-totals?account_ids=abc');
    assert.equal(badIds.status, 400); // CSV d'entiers invalide -> 400
  });
});

withServer('Facturation devis/factures', (t) => {
  const devisBody = {
    clientId: 'client-1',
    numero: 'DV-2026-001',
    dateEmission: '2026-10-01',
    dateValidite: '2026-11-01',
    postes: [
      {
        id: 'p1',
        type: 'materiel',
        designation: 'Licence',
        prixUnitaireHT: 100,
        quantite: 2,
        tauxTVA: 20,
        unite: 'u',
      },
    ],
  };

  it('cree un devis (201) avec totaux recalcules et audit', async () => {
    const res = await api(t.baseUrl, 'POST', '/devis', devisBody);
    assert.equal(res.status, 201);
    const devis = res.body.devis as Record<string, unknown>;
    assert.equal(devis.totalHT, 200);
    assert.equal(devis.totalTTC, 240);
    assert.deepEqual(devis.totalTVA, { 20: 40 });
    assert.equal(devis.statut, 'brouillon');
    assert.ok(devis.id, 'id genere si absent');
    const audit = await api(t.baseUrl, 'GET', '/audit?limit=10');
    const items = audit.body.items as Array<Record<string, unknown>>;
    const entry = items.find((a) => a.entity === 'devis' && a.action === 'create');
    assert.ok(entry, 'entree audit devis manquante');
    assert.equal(entry.actor, 'agent-api');
  });

  it('dry_run sur POST /devis ne ecrit rien', async () => {
    const before = await api(t.baseUrl, 'GET', '/devis');
    const beforeTotal = before.body.total as number;
    const res = await api(t.baseUrl, 'POST', '/devis', { ...devisBody, numero: 'DV-DR-1', dry_run: true });
    assert.equal(res.status, 200);
    assert.equal(res.body.dry_run, true);
    const after = await api(t.baseUrl, 'GET', '/devis');
    assert.equal(after.body.total, beforeTotal);
  });

  it('422 si numero deja utilise ou clientId manquant', async () => {
    await api(t.baseUrl, 'POST', '/devis', devisBody);
    const clash = await api(t.baseUrl, 'POST', '/devis', devisBody);
    assert.equal(clash.status, 422);
    const noClient = await api(t.baseUrl, 'POST', '/devis', { ...devisBody, numero: 'DV-2026-002', clientId: '' });
    assert.equal(noClient.status, 422);
  });

  it('liste et lit un devis, 404 sinon', async () => {
    const created = await api(t.baseUrl, 'POST', '/devis', { ...devisBody, numero: 'DV-2026-010' });
    const id = created.body.id as string;
    const list = await api(t.baseUrl, 'GET', '/devis');
    const items = list.body.items as Array<Record<string, unknown>>;
    assert.ok(items.some((d) => d.numero === 'DV-2026-010'), 'devis absent de la liste');
    const one = await api(t.baseUrl, 'GET', `/devis/${id}`);
    assert.equal(one.status, 200);
    assert.equal((one.body as Record<string, unknown>).numero, 'DV-2026-010');
    const missing = await api(t.baseUrl, 'GET', '/devis/inconnu');
    assert.equal(missing.status, 404);
  });

  it('cree une facture rattachee au devis, 422 si devis origine inconnu', async () => {
    const devis = await api(t.baseUrl, 'POST', '/devis', devisBody);
    const devisId = devis.body.id as string;
    const res = await api(t.baseUrl, 'POST', '/factures', {
      clientId: 'client-1',
      numero: 'FA-2026-001',
      devisOrigine: devisId,
      postes: [
        {
          id: 'p1',
          type: 'travail',
          designation: 'Prestation',
          tauxHoraire: 50,
          heuresEstimees: 2,
          nombreIntervenants: 1,
          tauxTVA: 20,
        },
      ],
    });
    assert.equal(res.status, 201);
    const facture = res.body.facture as Record<string, unknown>;
    assert.equal(facture.totalHT, 100);
    assert.equal(facture.totalTTC, 120);
    assert.equal(facture.devisOrigine, devisId);
    const bad = await api(t.baseUrl, 'POST', '/factures', {
      clientId: 'client-1',
      numero: 'FA-2026-002',
      devisOrigine: 'devis-inconnu',
      postes: [],
    });
    assert.equal(bad.status, 422);
  });

  it('liste les factures et journalise l audit facture', async () => {
    await api(t.baseUrl, 'POST', '/factures', { clientId: 'client-1', numero: 'FA-2026-003', postes: [] });
    const list = await api(t.baseUrl, 'GET', '/factures');
    const items = list.body.items as Array<Record<string, unknown>>;
    assert.ok(items.some((f) => f.numero === 'FA-2026-003'), 'facture absente de la liste');
    const audit = await api(t.baseUrl, 'GET', '/audit?limit=10');
    const auditItems = audit.body.items as Array<Record<string, unknown>>;
    const entry = auditItems.find((a) => a.entity === 'facture' && a.action === 'create');
    assert.ok(entry, 'entree audit facture manquante');
  });
});

withServer('Avoirs', (t) => {
  let factureSeq = 0;
  async function createFactureOrigine(): Promise<string> {
    factureSeq += 1;
    const res = await api(t.baseUrl, 'POST', '/factures', {
      clientId: 'client-1',
      numero: `FA-AV-${String(factureSeq).padStart(3, '0')}`,
      postes: [
        {
          id: 'p1',
          type: 'materiel',
          designation: 'Licence',
          prixUnitaireHT: 100,
          quantite: 2,
          tauxTVA: 20,
        },
        {
          id: 'p2',
          type: 'travail',
          designation: 'Prestation',
          tauxHoraire: 50,
          heuresEstimees: 2,
          nombreIntervenants: 1,
          tauxTVA: 20,
        },
      ],
    });
    assert.equal(res.status, 201);
    return res.body.id as string;
  }

  it('cree un avoir depuis une facture (postes inverses, totaux negatifs, numero auto)', async () => {
    const factureId = await createFactureOrigine();
    const res = await api(t.baseUrl, 'POST', `/factures/${factureId}/avoir`, {});
    assert.equal(res.status, 201);
    const avoir = res.body.avoir as Record<string, unknown>;
    assert.equal(avoir.isAvoir, true);
    assert.equal(avoir.factureOrigine, factureId);
    assert.equal(avoir.factureOrigineNumero, 'FA-AV-001');    assert.equal(avoir.statut, 'envoyee');
    assert.deepEqual(avoir.paiements, []);
    assert.equal(avoir.numero, 'FAC-2026-0001', 'numero genere depuis invoice_settings (defauts)');
    const postes = avoir.postes as Array<Record<string, unknown>>;
    assert.equal(postes.length, 2);
    const materiel = postes.find((p) => p.type === 'materiel') as Record<string, unknown>;
    assert.equal(materiel.quantite, -2, 'quantite materiel invertee');
    const travail = postes.find((p) => p.type === 'travail') as Record<string, unknown>;
    assert.equal(travail.heuresEstimees, -2, 'heures travail inversees');
    assert.equal(avoir.totalHT, -300);
    assert.equal(avoir.totalTTC, -360);
    assert.deepEqual(avoir.totalTVA, { 20: -60 });
    const audit = await api(t.baseUrl, 'GET', '/audit?limit=10');
    const auditItems = audit.body.items as Array<Record<string, unknown>>;
    assert.ok(
      auditItems.some((a) => a.entity === 'facture' && a.action === 'create'),
      'entree audit avoir manquante'
    );
  });

  it('422 si avoir sur avoir, 404 si facture inconnue', async () => {
    const factureId = await createFactureOrigine();
    const avoir = await api(t.baseUrl, 'POST', `/factures/${factureId}/avoir`, {});
    const avoirId = avoir.body.id as string;
    const again = await api(t.baseUrl, 'POST', `/factures/${avoirId}/avoir`, {});
    assert.equal(again.status, 422);
    const missing = await api(t.baseUrl, 'POST', '/factures/inconnu/avoir', {});
    assert.equal(missing.status, 404);
  });

  it('numero explicite respecte, dry_run ne ecrit rien', async () => {
    const factureId = await createFactureOrigine();
    const before = await api(t.baseUrl, 'GET', '/factures');
    const beforeTotal = before.body.total as number;
    const dry = await api(t.baseUrl, 'POST', `/factures/${factureId}/avoir`, { dry_run: true });
    assert.equal(dry.status, 200);
    assert.equal(dry.body.dry_run, true);
    const after = await api(t.baseUrl, 'GET', '/factures');
    assert.equal(after.body.total, beforeTotal, 'avoir cree en dry_run');
    const res = await api(t.baseUrl, 'POST', `/factures/${factureId}/avoir`, { numero: 'AV-EXPLICITE-1' });
    assert.equal(res.status, 201);
    const avoir = res.body.avoir as Record<string, unknown>;
    assert.equal(avoir.numero, 'AV-EXPLICITE-1');
  });
});

withServer('PATCH devis/factures', (t) => {
  const devisBody = {
    clientId: 'client-1',
    numero: 'DV-P-001',
    dateEmission: '2026-10-01',
    postes: [
      {
        id: 'p1',
        type: 'materiel',
        designation: 'Licence',
        prixUnitaireHT: 100,
        quantite: 2,
        tauxTVA: 20,
      },
    ],
  };

  it('PATCH /devis/{id} fusionne le payload, recalcule les totaux et journalise before/after', async () => {
    const created = await api(t.baseUrl, 'POST', '/devis', devisBody);
    assert.equal(created.status, 201);
    const id = created.body.id as string;
    const res = await api(t.baseUrl, 'PATCH', `/devis/${id}`, {
      postes: [
        {
          id: 'p1',
          type: 'materiel',
          designation: 'Licence',
          prixUnitaireHT: 150,
          quantite: 2,
          tauxTVA: 20,
        },
      ],
      notes: 'Relance client',
    });
    assert.equal(res.status, 200);
    const devis = res.body.devis as Record<string, unknown>;
    assert.equal(devis.totalHT, 300);
    assert.equal(devis.totalTTC, 360);
    assert.deepEqual(devis.totalTVA, { 20: 60 });
    assert.equal(devis.notes, 'Relance client');
    assert.equal(devis.numero, 'DV-P-001', 'numero conserve si absent du body');
    assert.ok(devis.updatedAt, 'updatedAt mis a jour');
    const audit = await api(t.baseUrl, 'GET', '/audit?limit=10');
    const items = audit.body.items as Array<Record<string, unknown>>;
    const entry = items.find((a) => a.entity === 'devis' && a.action === 'update');
    assert.ok(entry, 'entree audit update devis manquante');
    const before = entry.before as Record<string, unknown>;
    const after = entry.after as Record<string, unknown>;
    assert.equal(before.totalHT, 200);
    assert.equal(after.totalHT, 300);
  });

  it('PATCH /devis/{id} change le statut (caducite), 422 si statut invalide, 404 sinon', async () => {
    const created = await api(t.baseUrl, 'POST', '/devis', { ...devisBody, numero: 'DV-P-002' });
    const id = created.body.id as string;
    const res = await api(t.baseUrl, 'PATCH', `/devis/${id}`, { statut: 'caduc' });
    assert.equal(res.status, 200);
    assert.equal((res.body.devis as Record<string, unknown>).statut, 'caduc');
    const bad = await api(t.baseUrl, 'PATCH', `/devis/${id}`, { statut: 'payee' });
    assert.equal(bad.status, 422);
    const missing = await api(t.baseUrl, 'PATCH', '/devis/inconnu', { statut: 'caduc' });
    assert.equal(missing.status, 404);
  });

  it('PATCH /factures/{id} brouillon modifie les postes, totaux recalcules', async () => {
    const created = await api(t.baseUrl, 'POST', '/factures', {
      clientId: 'client-1',
      numero: 'FA-P-001',
      postes: [
        { id: 'p1', type: 'travail', designation: 'Prestation', tauxHoraire: 50, heuresEstimees: 2, nombreIntervenants: 1, tauxTVA: 20 },
      ],
    });
    assert.equal(created.status, 201);
    const id = created.body.id as string;
    const res = await api(t.baseUrl, 'PATCH', `/factures/${id}`, {
      postes: [
        { id: 'p1', type: 'travail', designation: 'Prestation', tauxHoraire: 60, heuresEstimees: 2, nombreIntervenants: 1, tauxTVA: 20 },
      ],
    });
    assert.equal(res.status, 200);
    const facture = res.body.facture as Record<string, unknown>;
    assert.equal(facture.totalHT, 120);
    assert.equal(facture.totalTTC, 144);
  });

  it('PATCH /factures/{id} emise : champs geles proteges, statut et champs libres autorises', async () => {
    const created = await api(t.baseUrl, 'POST', '/factures', {
      clientId: 'client-1',
      numero: 'FA-P-002',
      dateEmission: '2026-10-01',
      statut: 'envoyee',
      postes: [
        { id: 'p1', type: 'travail', designation: 'Prestation', tauxHoraire: 50, heuresEstimees: 2, nombreIntervenants: 1, tauxTVA: 20 },
      ],
    });
    assert.equal(created.status, 201);
    const id = created.body.id as string;
    // postes geles
    const frozen = await api(t.baseUrl, 'PATCH', `/factures/${id}`, {
      postes: [
        { id: 'p1', type: 'travail', designation: 'Prestation', tauxHoraire: 99, heuresEstimees: 2, nombreIntervenants: 1, tauxTVA: 20 },
      ],
    });
    assert.equal(frozen.status, 422);
    // numero gele
    const frozenNumero = await api(t.baseUrl, 'PATCH', `/factures/${id}`, { numero: 'FA-P-002-BIS' });
    assert.equal(frozenNumero.status, 422);
    // statut autorise (annulation)
    const cancelled = await api(t.baseUrl, 'PATCH', `/factures/${id}`, { statut: 'annulee' });
    assert.equal(cancelled.status, 200);
    assert.equal((cancelled.body.facture as Record<string, unknown>).statut, 'annulee');
    // champ libre autorise
    const notes = await api(t.baseUrl, 'PATCH', `/factures/${id}`, { notes: 'Annulee par le client' });
    assert.equal(notes.status, 200);
    assert.equal((notes.body.facture as Record<string, unknown>).notes, 'Annulee par le client');
  });

  it('dry_run sur PATCH /devis/{id} ne modifie rien', async () => {
    const created = await api(t.baseUrl, 'POST', '/devis', { ...devisBody, numero: 'DV-P-003' });
    const id = created.body.id as string;
    const res = await api(t.baseUrl, 'PATCH', `/devis/${id}`, { notes: 'essai', dry_run: true });
    assert.equal(res.status, 200);
    assert.equal(res.body.dry_run, true);
    const one = await api(t.baseUrl, 'GET', `/devis/${id}`);
    const devis = one.body as Record<string, unknown>;
    assert.equal(devis.notes, undefined, 'notes non ecrites en dry_run');
  });
});

withServer('Contacts / clients', (t) => {
  it('cree un contact (201) avec codeClient genere et audit', async () => {
    const res = await api(t.baseUrl, 'POST', '/contacts', {
      type: 'particulier',
      nom: 'Dupont',
      prenom: 'Marie',
      email: 'marie.dupont@example.fr',
      adresseFacturation: { rue: '1 rue du Test', codePostal: '75001', ville: 'Paris' },
    });
    assert.equal(res.status, 201);
    const contact = res.body.contact as Record<string, unknown>;
    assert.equal(contact.type, 'particulier');
    assert.deepEqual(contact.roles, ['client']);
    assert.equal(contact.codeClient, 'DM001');
    const adresse = contact.adresseFacturation as Record<string, unknown>;
    assert.equal(adresse.pays, 'France');
    assert.ok(contact.createdAt, 'createdAt genere');
    assert.ok(contact.updatedAt, 'updatedAt genere');
    const audit = await api(t.baseUrl, 'GET', '/audit?limit=10');
    const items = audit.body.items as Array<Record<string, unknown>>;
    const entry = items.find((a) => a.entity === 'contact' && a.action === 'create');
    assert.ok(entry, 'entree audit contact manquante');
    assert.equal(entry.actor, 'agent-api');
  });

  it('cree un contact entreprise avec IBAN valide et codeClient prefixe denomination', async () => {
    const res = await api(t.baseUrl, 'POST', '/contacts', {
      type: 'entreprise',
      denominationSociale: 'Atelier Bois',
      coordonneesBancaires: { titulaire: 'Atelier Bois', iban: 'FR7630006000011234567890189', bic: 'AGRIFRPP' },
    });
    assert.equal(res.status, 201);
    const contact = res.body.contact as Record<string, unknown>;
    assert.equal(contact.codeClient, 'AT001');
    const cb = contact.coordonneesBancaires as Record<string, unknown>;
    assert.equal(cb.iban, 'FR7630006000011234567890189');
  });

  it('422 sur validations : email, IBAN, type, contact sans nom', async () => {
    const badEmail = await api(t.baseUrl, 'POST', '/contacts', { nom: 'Test', email: 'pas-un-email' });
    assert.equal(badEmail.status, 422);
    const badIban = await api(t.baseUrl, 'POST', '/contacts', {
      nom: 'Test',
      coordonneesBancaires: { iban: 'FR7630006000011234567890190' },
    });
    assert.equal(badIban.status, 422);
    const badType = await api(t.baseUrl, 'POST', '/contacts', { nom: 'Test', type: 'societe' });
    assert.equal(badType.status, 422);
    const noName = await api(t.baseUrl, 'POST', '/contacts', { email: 'seul@example.fr' });
    assert.equal(noName.status, 422);
  });

  it('dry_run sur POST /contacts ne ecrit rien', async () => {
    const before = await api(t.baseUrl, 'GET', '/contacts');
    const beforeTotal = before.body.total as number;
    const res = await api(t.baseUrl, 'POST', '/contacts', { nom: 'Fantome', dry_run: true });
    assert.equal(res.status, 200);
    assert.equal(res.body.dry_run, true);
    const after = await api(t.baseUrl, 'GET', '/contacts');
    assert.equal(after.body.total, beforeTotal);
  });

  it('liste, lit et recherche des contacts, 404 sinon', async () => {
    const list = await api(t.baseUrl, 'GET', '/contacts');
    assert.ok((list.body.total as number) >= 2, 'contacts absents de la liste');
    const search = await api(t.baseUrl, 'GET', '/contacts?q=dupont');
    assert.equal(search.body.total, 1);
    const created = await api(t.baseUrl, 'POST', '/contacts', { nom: 'Martin' });
    const id = created.body.id as string;
    const one = await api(t.baseUrl, 'GET', `/contacts/${id}`);
    assert.equal(one.status, 200);
    assert.equal((one.body as Record<string, unknown>).nom, 'Martin');
    const missing = await api(t.baseUrl, 'GET', '/contacts/inconnu');
    assert.equal(missing.status, 404);
  });

  it('PATCH /contacts/{id} fusionne le payload et journalise before/after', async () => {
    const created = await api(t.baseUrl, 'POST', '/contacts', { nom: 'Bernard', email: 'bernard@example.fr' });
    const id = created.body.id as string;
    const res = await api(t.baseUrl, 'PATCH', `/contacts/${id}`, { telephone: '0102030405' });
    assert.equal(res.status, 200);
    const contact = res.body.contact as Record<string, unknown>;
    assert.equal(contact.telephone, '0102030405');
    assert.equal(contact.email, 'bernard@example.fr', 'champ non modifie conserve');
    assert.equal(contact.nom, 'Bernard');
    const audit = await api(t.baseUrl, 'GET', '/audit?limit=10');
    const items = audit.body.items as Array<Record<string, unknown>>;
    const entry = items.find((a) => a.entity === 'contact' && a.action === 'update');
    assert.ok(entry, 'entree audit update manquante');
    const before = entry.before as Record<string, unknown>;
    const after = entry.after as Record<string, unknown>;
    assert.equal(before.telephone, undefined);
    assert.equal(after.telephone, '0102030405');
    const missing = await api(t.baseUrl, 'PATCH', '/contacts/inconnu', { nom: 'X' });
    assert.equal(missing.status, 404);
  });

  it('contacts archives exclus par defaut, inclus avec include_archived', async () => {
    const created = await api(t.baseUrl, 'POST', '/contacts', { nom: 'Archive' });
    const id = created.body.id as string;
    await api(t.baseUrl, 'PATCH', `/contacts/${id}`, { archived: true });
    const defaut = await api(t.baseUrl, 'GET', '/contacts');
    const itemsDefaut = defaut.body.items as Array<Record<string, unknown>>;
    assert.ok(!itemsDefaut.some((c) => c.nom === 'Archive'), 'archive visible par defaut');
    const tous = await api(t.baseUrl, 'GET', '/contacts?include_archived=true');
    const itemsTous = tous.body.items as Array<Record<string, unknown>>;
    assert.ok(itemsTous.some((c) => c.nom === 'Archive'), 'archive absent avec include_archived');
  });

  it('GET /contact-groups liste les groupements tries par nom', async () => {
    t.db
      .prepare(
        "INSERT INTO contact_groups (id, payload, updated_at) VALUES (?, ?, datetime('now'))"
      )
      .run('cgrp-1', JSON.stringify({ id: 'cgrp-1', nom: 'Fournisseurs', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }));
    t.db
      .prepare(
        "INSERT INTO contact_groups (id, payload, updated_at) VALUES (?, ?, datetime('now'))"
      )
      .run('cgrp-2', JSON.stringify({ id: 'cgrp-2', nom: 'Clients fidèles', createdAt: '2026-01-02T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z' }));
    const res = await api(t.baseUrl, 'GET', '/contact-groups');
    assert.equal(res.status, 200);
    const items = res.body.items as Array<Record<string, unknown>>;
    assert.equal(items.length, 2);
    assert.equal(items[0]!.nom, 'Clients fidèles');
    assert.equal(items[1]!.nom, 'Fournisseurs');
  });

  it('POST /contact-groups cree un groupement (id genere, audit, 422 si id existant)', async () => {
    const res = await api(t.baseUrl, 'POST', '/contact-groups', { nom: 'Partenaires' });
    assert.equal(res.status, 201);
    const group = res.body.contactGroup as Record<string, unknown>;
    assert.equal(group.nom, 'Partenaires');
    assert.ok(String(group.id).startsWith('cgrp'), 'id genere cgrp-*');
    assert.ok(group.createdAt, 'createdAt genere');
    const audit = await api(t.baseUrl, 'GET', '/audit?limit=10');
    const items = audit.body.items as Array<Record<string, unknown>>;
    const entry = items.find((a) => a.entity === 'contact_group' && a.action === 'create');
    assert.ok(entry, 'entree audit manquante');
    const clash = await api(t.baseUrl, 'POST', '/contact-groups', { id: 'cgrp-1', nom: 'Doublon' });
    assert.equal(clash.status, 422);
    const sansNom = await api(t.baseUrl, 'POST', '/contact-groups', {});
    assert.equal(sansNom.status, 422);
  });

  it('dry_run sur POST /contact-groups ne ecrit rien', async () => {
    const before = await api(t.baseUrl, 'GET', '/contact-groups');
    const beforeTotal = before.body.total as number;
    const res = await api(t.baseUrl, 'POST', '/contact-groups', { nom: 'Fantome', dry_run: true });
    assert.equal(res.status, 200);
    assert.equal(res.body.dry_run, true);
    const after = await api(t.baseUrl, 'GET', '/contact-groups');
    assert.equal(after.body.total, beforeTotal);
  });

  it('PATCH /contact-groups/{id} renomme (createdAt conserve), 404 sinon', async () => {
    const created = await api(t.baseUrl, 'POST', '/contact-groups', { nom: 'A renommer' });
    const id = created.body.id as string;
    const res = await api(t.baseUrl, 'PATCH', `/contact-groups/${id}`, { nom: 'Renomme' });
    assert.equal(res.status, 200);
    const group = res.body.contactGroup as Record<string, unknown>;
    assert.equal(group.nom, 'Renomme');
    assert.equal(group.createdAt, (created.body.contactGroup as Record<string, unknown>).createdAt, 'createdAt conserve');
    const missing = await api(t.baseUrl, 'PATCH', '/contact-groups/inconnu', { nom: 'X' });
    assert.equal(missing.status, 404);
  });

  it('DELETE /contact-groups/{id} unset clients.groupeId puis supprime, 404 sinon', async () => {
    const created = await api(t.baseUrl, 'POST', '/contact-groups', { nom: 'A supprimer' });
    const id = created.body.id as string;
    // Contact rattache au groupement (payload JSON).
    t.db
      .prepare('INSERT INTO clients (id, type, payload, updated_at) VALUES (?, ?, ?, ?)')
      .run('client-grp', 'particulier', JSON.stringify({ id: 'client-grp', nom: 'Rattache', groupeId: id }), '2026-01-01T00:00:00.000Z');
    const res = await api(t.baseUrl, 'DELETE', `/contact-groups/${id}`);
    assert.equal(res.status, 200);
    const client = t.db.prepare('SELECT payload FROM clients WHERE id = ?').get('client-grp') as { payload: string };
    const parsed = JSON.parse(client.payload) as Record<string, unknown>;
    assert.equal(parsed.groupeId, undefined, 'groupeId unset');
    const missing = await api(t.baseUrl, 'DELETE', '/contact-groups/inconnu');
    assert.equal(missing.status, 404);
    const audit = await api(t.baseUrl, 'GET', '/audit?limit=10');
    const items = audit.body.items as Array<Record<string, unknown>>;
    const entry = items.find((a) => a.entity === 'contact_group' && a.action === 'delete');
    assert.ok(entry, 'entree audit delete manquante');
  });

  it('DELETE /contacts/{id} : 400 sans confirm, 409 si devis/factures/dons lies, 200 sinon', async () => {
    const created = await api(t.baseUrl, 'POST', '/contacts', { nom: 'ASupprimer' });
    const id = created.body.id as string;
    // Sans confirm -> 400.
    const noConfirm = await api(t.baseUrl, 'DELETE', `/contacts/${id}`);
    assert.equal(noConfirm.status, 400);
    // Avec confirm -> 200, suppression definitive.
    const ok = await api(t.baseUrl, 'DELETE', `/contacts/${id}?confirm=true`);
    assert.equal(ok.status, 200);
    assert.equal(ok.body.deleted, 'hard');
    const gone = await api(t.baseUrl, 'GET', `/contacts/${id}`);
    assert.equal(gone.status, 404);
    // Contact lie a un devis actif -> 409.
    const lie = await api(t.baseUrl, 'POST', '/contacts', { nom: 'LieDevis' });
    const lieId = lie.body.id as string;
    t.db
      .prepare('INSERT INTO devis (id, client_id, numero, statut, payload, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run('devis-lien', lieId, 'DV-L-001', 'brouillon', '{}', '2026-01-01T00:00:00.000Z');
    const conflictDevis = await api(t.baseUrl, 'DELETE', `/contacts/${lieId}?confirm=true`);
    assert.equal(conflictDevis.status, 409);
    // Contact lie a un don -> 409.
    const lieDon = await api(t.baseUrl, 'POST', '/contacts', { nom: 'LieDon' });
    const lieDonId = lieDon.body.id as string;
    t.db.prepare('INSERT INTO donations (id, contact_id) VALUES (?, ?)').run('don-lien', lieDonId);
    const conflictDon = await api(t.baseUrl, 'DELETE', `/contacts/${lieDonId}?confirm=true`);
    assert.equal(conflictDon.status, 409);
    // Contact lie a une facture -> 409.
    const lieFacture = await api(t.baseUrl, 'POST', '/contacts', { nom: 'LieFacture' });
    const lieFactureId = lieFacture.body.id as string;
    t.db
      .prepare('INSERT INTO factures (id, client_id, numero, statut, payload, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run('facture-lien', lieFactureId, 'FA-L-001', 'brouillon', '{}', '2026-01-01T00:00:00.000Z');
    const conflictFacture = await api(t.baseUrl, 'DELETE', `/contacts/${lieFactureId}?confirm=true`);
    assert.equal(conflictFacture.status, 409);
    // Contact introuvable -> 404.
    const missing = await api(t.baseUrl, 'DELETE', '/contacts/inconnu?confirm=true');
    assert.equal(missing.status, 404);
    // Audit delete.
    const audit = await api(t.baseUrl, 'GET', '/audit?limit=10');
    const items = audit.body.items as Array<Record<string, unknown>>;
    const entry = items.find((a) => a.entity === 'contact' && a.action === 'delete');
    assert.ok(entry, 'entree audit delete manquante');
  });

  it('dry_run sur DELETE /contacts/{id} ne supprime rien', async () => {
    const created = await api(t.baseUrl, 'POST', '/contacts', { nom: 'FantomeSuppr' });
    const id = created.body.id as string;
    const res = await api(t.baseUrl, 'DELETE', `/contacts/${id}?confirm=true&dry_run=true`);
    assert.equal(res.status, 200);
    assert.equal(res.body.dry_run, true);
    const still = await api(t.baseUrl, 'GET', `/contacts/${id}`);
    assert.equal(still.status, 200, 'contact toujours present en dry_run');
  });

  it('POST /dons cree un don avec audit, GET /dons liste et filtre par donateur', async () => {
    // Donateur de reference (donnees factices).
    t.db
      .prepare('INSERT INTO donateurs (id, payload, updated_at) VALUES (?, ?, ?)')
      .run(
        'donateur-1',
        JSON.stringify({ id: 'donateur-1', type: 'particulier', nom: 'Martin', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }),
        '2026-01-01T00:00:00.000Z'
      );
    const created = await api(t.baseUrl, 'POST', '/dons', {
      donateurId: 'donateur-1',
      montant: 150.456,
      natureDon: 'numeraire',
      modeVersement: 'cheque',
      date: '2026-03-15',
      notes: 'Don printemps',
    });
    assert.equal(created.status, 201);
    const don = created.body.don as Record<string, unknown>;
    assert.equal(created.body.id, don.id);
    assert.equal(don.donateurId, 'donateur-1');
    assert.equal(don.montant, 150.46, 'montant arrondi a 2 decimales');
    assert.equal(don.natureDon, 'numeraire');
    assert.equal(don.modeVersement, 'cheque');
    assert.equal(don.date, '2026-03-15T00:00:00.000Z', 'date YYYY-MM-DD normalisee en ISO');
    assert.ok(don.createdAt, 'createdAt genere');

    // Don anonyme.
    const anonyme = await api(t.baseUrl, 'POST', '/dons', {
      donateurId: 'ANONYME',
      montant: 20,
      natureDon: 'especes',
    });
    assert.equal(anonyme.status, 422, 'natureDon invalide refusee');
    const anonymeOk = await api(t.baseUrl, 'POST', '/dons', {
      donateurId: 'ANONYME',
      montant: 20,
      natureDon: 'numeraire',
      modeVersement: 'especes',
    });
    assert.equal(anonymeOk.status, 201);

    // Erreurs de validation.
    const donateurInconnu = await api(t.baseUrl, 'POST', '/dons', {
      donateurId: 'inconnu',
      montant: 10,
      natureDon: 'numeraire',
    });
    assert.equal(donateurInconnu.status, 422);
    const montantZero = await api(t.baseUrl, 'POST', '/dons', {
      donateurId: 'donateur-1',
      montant: 0,
      natureDon: 'numeraire',
    });
    assert.equal(montantZero.status, 422);
    const doublon = await api(t.baseUrl, 'POST', '/dons', {
      id: created.body.id,
      donateurId: 'donateur-1',
      montant: 10,
      natureDon: 'numeraire',
    });
    assert.equal(doublon.status, 422, 'id existant refuse');

    // Liste : tri par date decroissante, filtre donateur_id.
    const liste = await api(t.baseUrl, 'GET', '/dons');
    assert.equal(liste.status, 200);
    const items = liste.body.items as Array<Record<string, unknown>>;
    assert.equal(liste.body.total, 2);
    assert.equal(items.length, 2);
    assert.equal(items[0]!.donateurId, 'ANONYME', 'don le plus recent (date du jour) en premier');
    const filtre = await api(t.baseUrl, 'GET', '/dons?donateur_id=donateur-1');
    const itemsFiltre = filtre.body.items as Array<Record<string, unknown>>;
    assert.equal(filtre.body.total, 1);
    assert.equal(itemsFiltre[0]!.id, created.body.id);

    // Audit.
    const audit = await api(t.baseUrl, 'GET', '/audit?limit=10');
    const auditItems = audit.body.items as Array<Record<string, unknown>>;
    const entry = auditItems.find((a) => a.entity === 'don' && a.action === 'create' && a.entity_id === created.body.id);
    assert.ok(entry, 'entree audit don manquante');
    assert.equal((entry.after as Record<string, unknown>).montant, 150.46);
  });

  it('dry_run sur POST /dons ne modifie rien', async () => {
    const avant = await api(t.baseUrl, 'GET', '/dons');
    const totalAvant = avant.body.total as number;
    const res = await api(t.baseUrl, 'POST', '/dons', {
      donateurId: 'ANONYME',
      montant: 50,
      natureDon: 'numeraire',
      dry_run: true,
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.dry_run, true);
    const after = (res.body.after as Record<string, unknown>).montant;
    assert.equal(after, 50);
    const liste = await api(t.baseUrl, 'GET', '/dons');
    assert.equal(liste.body.total, totalAvant, 'aucune ecriture en dry_run');
  });

  it('PATCH /dons/{id} fusionne le payload avec audit, DELETE exige confirm', async () => {
    t.db
      .prepare('INSERT OR IGNORE INTO donateurs (id, payload, updated_at) VALUES (?, ?, ?)')
      .run(
        'donateur-2',
        JSON.stringify({ id: 'donateur-2', type: 'particulier', nom: 'Bernard', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }),
        '2026-01-01T00:00:00.000Z'
      );
    const created = await api(t.baseUrl, 'POST', '/dons', {
      donateurId: 'donateur-2',
      montant: 100,
      natureDon: 'numeraire',
      notes: 'note initiale',
    });
    assert.equal(created.status, 201);
    const id = created.body.id as string;

    // PATCH partiel : montant + donateur, le reste conserve.
    const patched = await api(t.baseUrl, 'PATCH', `/dons/${id}`, {
      montant: 250.5,
      donateurId: 'ANONYME',
    });
    assert.equal(patched.status, 200);
    const don = patched.body.don as Record<string, unknown>;
    assert.equal(don.montant, 250.5);
    assert.equal(don.donateurId, 'ANONYME');
    assert.equal(don.natureDon, 'numeraire', 'champ non fourni conserve');
    assert.equal(don.notes, 'note initiale', 'champ non fourni conserve');
    assert.ok(don.updatedAt, 'updatedAt rafraichi');

    // Validation : donateur inconnu refuse, natureDon invalide refusee.
    const mauvaisDonateur = await api(t.baseUrl, 'PATCH', `/dons/${id}`, { donateurId: 'inconnu' });
    assert.equal(mauvaisDonateur.status, 422);
    const mauvaiseNature = await api(t.baseUrl, 'PATCH', `/dons/${id}`, { natureDon: 'especes' });
    assert.equal(mauvaiseNature.status, 422);
    const introuvable = await api(t.baseUrl, 'PATCH', '/dons/don-inconnu', { montant: 10 });
    assert.equal(introuvable.status, 404);

    // dry_run PATCH : diff sans ecriture.
    const dry = await api(t.baseUrl, 'PATCH', `/dons/${id}`, { montant: 999, dry_run: true });
    assert.equal(dry.status, 200);
    assert.equal(dry.body.dry_run, true);
    const relit = await api(t.baseUrl, 'GET', `/dons?donateur_id=ANONYME`);
    const relitItems = relit.body.items as Array<Record<string, unknown>>;
    const conserve = relitItems.find((d) => d.id === id) as Record<string, unknown>;
    assert.equal(conserve.montant, 250.5, 'dry_run PATCH n ecrit rien');

    // DELETE sans confirm refuse.
    const sansConfirm = await api(t.baseUrl, 'DELETE', `/dons/${id}`);
    assert.equal(sansConfirm.status, 400);
    // dry_run DELETE (confirm requis aussi en simulation, aligne DELETE /accounts) : diff sans ecriture.
    const dryDel = await api(t.baseUrl, 'DELETE', `/dons/${id}?confirm=true&dry_run=true`);
    assert.equal(dryDel.status, 200);
    assert.equal(dryDel.body.dry_run, true);
    // DELETE avec confirm.
    const deleted = await api(t.baseUrl, 'DELETE', `/dons/${id}?confirm=true`);
    assert.equal(deleted.status, 200);
    const apres = await api(t.baseUrl, 'GET', `/dons?donateur_id=ANONYME`);
    const apresItems = apres.body.items as Array<Record<string, unknown>>;
    assert.ok(!apresItems.some((d) => d.id === id), 'don supprime');

    // Audit update + delete.
    const audit = await api(t.baseUrl, 'GET', '/audit?limit=20');
    const auditItems = audit.body.items as Array<Record<string, unknown>>;
    const upd = auditItems.find((a) => a.entity === 'don' && a.action === 'update' && a.entity_id === id);
    assert.ok(upd, 'entree audit update don manquante');
    assert.equal((upd.before as Record<string, unknown>).montant, 100);
    assert.equal((upd.after as Record<string, unknown>).montant, 250.5);
    const del = auditItems.find((a) => a.entity === 'don' && a.action === 'delete' && a.entity_id === id);
    assert.ok(del, 'entree audit delete don manquante');
  });
});

withServer('Label rules', (t) => {
  it('POST /label-rules cree une regle (upsert par mot), GET liste, PATCH modifie, DELETE supprime', async () => {
    // Creation : word normalise (trim, espaces multiples, majuscules), min 4 caracteres.
    const created = await api(t.baseUrl, 'POST', '/label-rules', {
      word: '  loyer   habitation ',
      categoryCode: 'ALIM',
      tag: 'logement',
    });
    assert.equal(created.status, 201);
    const rule = created.body.rule as Record<string, unknown>;
    assert.equal(rule.word, 'LOYER HABITATION', 'word normalise en majuscules, espaces reduits');
    assert.equal(rule.categoryCode, 'ALIM');
    assert.equal(rule.tag, 'logement');
    assert.equal(rule.active, true);
    assert.ok(rule.createdAt);

    // Upsert : meme mot, categorie differente -> mise a jour (200).
    const upsert = await api(t.baseUrl, 'POST', '/label-rules', {
      word: 'loyer habitation',
      categoryCode: 'ALIM',
    });
    assert.equal(upsert.status, 200, 'upsert sur mot existant');
    const upsertRule = upsert.body.rule as Record<string, unknown>;
    assert.equal(upsertRule.id, rule.id, 'meme regle mise a jour');
    assert.equal(upsertRule.tag, null, 'tag reinitialise comme LabelRuleService.upsert');

    // Erreurs de validation.
    const tropCourt = await api(t.baseUrl, 'POST', '/label-rules', { word: 'abc', categoryCode: 'ALIM' });
    assert.equal(tropCourt.status, 422, 'sequence de moins de 4 caracteres refusee');
    const categorieInconnue = await api(t.baseUrl, 'POST', '/label-rules', { word: 'mot valide', categoryCode: 'INCONNU' });
    assert.equal(categorieInconnue.status, 422, 'categorie inexistante refusee');
    const sansCategorie = await api(t.baseUrl, 'POST', '/label-rules', { word: 'mot valide' });
    assert.equal(sansCategorie.status, 422, 'categoryCode requis');

    // Liste triee par word.
    await api(t.baseUrl, 'POST', '/label-rules', { word: 'assurance auto', categoryCode: 'ALIM' });
    const liste = await api(t.baseUrl, 'GET', '/label-rules');
    assert.equal(liste.status, 200);
    const items = liste.body.items as Array<Record<string, unknown>>;
    assert.equal(liste.body.total, 2);
    assert.equal(items[0]!.word, 'ASSURANCE AUTO', 'tri par word croissant');
    assert.equal(items[1]!.word, 'LOYER HABITATION');

    // PATCH : categorie, tag null, active false.
    const id = rule.id as number;
    const patched = await api(t.baseUrl, 'PATCH', `/label-rules/${id}`, {
      tag: null,
      active: false,
    });
    assert.equal(patched.status, 200);
    const patchedRule = patched.body.rule as Record<string, unknown>;
    assert.equal(patchedRule.tag, null);
    assert.equal(patchedRule.active, false);
    assert.equal(patchedRule.categoryCode, 'ALIM', 'champ non fourni conserve');
    const activeInvalide = await api(t.baseUrl, 'PATCH', `/label-rules/${id}`, { active: 'oui' });
    assert.equal(activeInvalide.status, 422);
    const introuvable = await api(t.baseUrl, 'PATCH', '/label-rules/9999', { active: true });
    assert.equal(introuvable.status, 404);

    // dry_run PATCH : diff sans ecriture.
    const dry = await api(t.baseUrl, 'PATCH', `/label-rules/${id}?dry_run=true`, { active: true });
    assert.equal(dry.status, 200);
    assert.equal(dry.body.dry_run, true);
    const relit = await api(t.baseUrl, 'GET', '/label-rules');
    const relitItems = relit.body.items as Array<Record<string, unknown>>;
    const conserve = relitItems.find((r) => r.id === id) as Record<string, unknown>;
    assert.equal(conserve.active, false, 'dry_run PATCH n ecrit rien');

    // DELETE (hard, sans cascade) + audit.
    const deleted = await api(t.baseUrl, 'DELETE', `/label-rules/${id}`);
    assert.equal(deleted.status, 200);
    const apres = await api(t.baseUrl, 'GET', '/label-rules');
    const apresItems = apres.body.items as Array<Record<string, unknown>>;
    assert.ok(!apresItems.some((r) => r.id === id), 'regle supprimee');
    const introuvableDel = await api(t.baseUrl, 'DELETE', '/label-rules/9999');
    assert.equal(introuvableDel.status, 404);

    // Audit create + update + delete.
    const audit = await api(t.baseUrl, 'GET', '/audit?limit=20');
    const auditItems = audit.body.items as Array<Record<string, unknown>>;
    assert.ok(
      auditItems.some((a) => a.entity === 'label_rule' && a.action === 'create' && a.entity_id === String(id)),
      'entree audit create label_rule manquante'
    );
    assert.ok(
      auditItems.some((a) => a.entity === 'label_rule' && a.action === 'update' && a.entity_id === String(id)),
      'entree audit update label_rule manquante'
    );
    assert.ok(
      auditItems.some((a) => a.entity === 'label_rule' && a.action === 'delete' && a.entity_id === String(id)),
      'entree audit delete label_rule manquante'
    );
  });

  it('dry_run sur POST /label-rules ne modifie rien', async () => {
    const avant = await api(t.baseUrl, 'GET', '/label-rules');
    const totalAvant = avant.body.total as number;
    const res = await api(t.baseUrl, 'POST', '/label-rules', {
      word: 'mot factice',
      categoryCode: 'ALIM',
      dry_run: true,
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.dry_run, true);
    assert.equal(res.body.action, 'create');
    const apres = await api(t.baseUrl, 'GET', '/label-rules');
    assert.equal(apres.body.total, totalAvant, 'aucune ecriture en dry_run');
  });

  it('POST /label-rules/apply attribue les categories (mot le plus long prioritaire, audit), dry_run = apercu', async () => {
    // Regles actives : mot long prioritaire sur mot court.
    await api(t.baseUrl, 'POST', '/label-rules', { word: 'loyer habitation', categoryCode: 'ALIM' });
    await api(t.baseUrl, 'POST', '/label-rules', { word: 'assurance', categoryCode: 'ALIM' });
    // Transactions factices : sans categorie (candidates) et avec categorie (exclues).
    const insertTx = t.db.prepare(
      "INSERT INTO transactions (account_id, date, debit, label, category_code) VALUES (1, '2026-10-01', 10, ?, ?)"
    );
    insertTx.run('Paiement LOYER HABITATION octobre', null);
    insertTx.run('Prime ASSURANCE auto', null);
    insertTx.run('Achat deja catégorisé', 'ALIM');
    insertTx.run('Sans correspondance', null);
    // Transaction soft-supprimee : exclue.
    t.db
      .prepare("INSERT INTO transactions (account_id, date, debit, label, deleted_at) VALUES (1, '2026-10-02', 5, 'LOYER HABITATION supprime', '2026-10-03T00:00:00.000Z')")
      .run();

    // dry_run : apercu sans ecriture.
    const dry = await api(t.baseUrl, 'POST', '/label-rules/apply', { dry_run: true });
    assert.equal(dry.status, 200);
    assert.equal(dry.body.dry_run, true);
    assert.equal(dry.body.count, 2, '2 transactions candidates');
    const dryChanges = dry.body.changes as Array<Record<string, unknown>>;
    assert.ok(dryChanges.every((c) => (c.before as Record<string, unknown>).categoryCode === null), 'before sans categorie');

    // Application effective.
    const res = await api(t.baseUrl, 'POST', '/label-rules/apply', {});
    assert.equal(res.status, 200);
    assert.equal(res.body.applied, 2);
    const changes = res.body.changes as Array<Record<string, unknown>>;
    const loyer = changes.find((c) => String((c.after as Record<string, unknown>).categoryCode) === 'ALIM');
    assert.ok(loyer, 'changement loyer present');
    const tx = t.db.prepare('SELECT category_code FROM transactions WHERE id = ?').get(loyer!.id as number) as { category_code: string };
    assert.equal(tx.category_code, 'ALIM');
    const dejaCat = t.db.prepare("SELECT COUNT(*) AS n FROM transactions WHERE label = 'Achat deja catégorisé' AND category_code = 'ALIM'").get() as { n: number };
    assert.equal(dejaCat.n, 1, 'transaction deja categorisee non reattribuee');
    const sansMatch = t.db.prepare("SELECT category_code FROM transactions WHERE label = 'Sans correspondance'").get() as { category_code: string | null };
    assert.equal(sansMatch.category_code, null, 'transaction sans correspondance intacte');
    // Audit.
    const audit = await api(t.baseUrl, 'GET', '/audit?limit=10');
    const items = audit.body.items as Array<Record<string, unknown>>;
    const entry = items.find((a) => a.entity === 'transaction' && a.action === 'update');
    assert.ok(entry, 'entree audit apply manquante');
    const after = entry.after as Record<string, unknown>;
    assert.equal(after.operation, 'apply_label_rules');
  });

  it('POST /label-rules/apply filtre par ids et import_id, 422 sur payload invalide', async () => {
    await api(t.baseUrl, 'POST', '/label-rules', { word: 'carburant total', categoryCode: 'ALIM' });
    // Import factice (FK transactions.import_id -> imports.id).
    t.db.prepare("INSERT INTO imports (id, filename, account_id) VALUES (7, 'import-factice.csv', 1)").run();
    const insertTx = t.db.prepare(
      "INSERT INTO transactions (account_id, date, debit, label, category_code, import_id) VALUES (1, '2026-10-01', 10, ?, ?, ?)"
    );
    const idStation = Number(insertTx.run('CARBURANT TOTAL station', null, null).lastInsertRowid);
    insertTx.run('CARBURANT TOTAL autoroute', null, 7);
    insertTx.run('CARBURANT TOTAL hors cible', 'ALIM', null);

    // Filtre par ids.
    const parIds = await api(t.baseUrl, 'POST', '/label-rules/apply', { ids: [idStation] });
    assert.equal(parIds.status, 200);
    assert.equal(parIds.body.applied, 1, 'seule la transaction ciblee est traitee');

    // Filtre par import_id.
    const parImport = await api(t.baseUrl, 'POST', '/label-rules/apply', { import_id: 7 });
    assert.equal(parImport.status, 200);
    assert.equal(parImport.body.applied, 1, 'seule la transaction d import 7 est traitee');

    // Payload invalide.
    const mauvaisIds = await api(t.baseUrl, 'POST', '/label-rules/apply', { ids: ['a'] });
    assert.equal(mauvaisIds.status, 422);
    const mauvaisImport = await api(t.baseUrl, 'POST', '/label-rules/apply', { import_id: 'sept' });
    assert.equal(mauvaisImport.status, 422);
  });
});

withServer('Donateurs', (t) => {
  it('POST /donateurs cree, GET liste avec recherche q, PATCH fusionne, DELETE exige confirm', async () => {
    // Creation : id genere, type par defaut particulier.
    const created = await api(t.baseUrl, 'POST', '/donateurs', {
      type: 'particulier',
      civilite: 'Mme',
      nom: 'Dupont',
      prenom: 'Claire',
      email: 'claire.dupont@example.org',
    });
    assert.equal(created.status, 201);
    const id = created.body.id as string;
    const donateur = created.body.donateur as Record<string, unknown>;
    assert.equal(donateur.type, 'particulier');
    assert.equal(donateur.nom, 'Dupont');
    assert.ok(donateur.createdAt);
    assert.ok(donateur.updatedAt);

    // Id reserve et doublon.
    const reserve = await api(t.baseUrl, 'POST', '/donateurs', { id: 'ANONYME', nom: 'X' });
    assert.equal(reserve.status, 422, "id ANONYME reserve");
    const doublon = await api(t.baseUrl, 'POST', '/donateurs', { id, nom: 'X' });
    assert.equal(doublon.status, 422, 'id existant refuse');

    // Validation des champs.
    const typeInvalide = await api(t.baseUrl, 'POST', '/donateurs', { type: 'societe' });
    assert.equal(typeInvalide.status, 422);
    const civiliteInvalide = await api(t.baseUrl, 'POST', '/donateurs', { civilite: 'Dr' });
    assert.equal(civiliteInvalide.status, 422);
    const categorieInconnue = await api(t.baseUrl, 'POST', '/donateurs', { categoryCode: 'INCONNU' });
    assert.equal(categorieInconnue.status, 422);
    const adresseInvalide = await api(t.baseUrl, 'POST', '/donateurs', { adresse: '12 rue' });
    assert.equal(adresseInvalide.status, 422, 'adresse doit etre un objet');

    // Liste + recherche q.
    await api(t.baseUrl, 'POST', '/donateurs', {
      type: 'entreprise',
      denominationSociale: 'Boulangerie Martin',
    });
    const liste = await api(t.baseUrl, 'GET', '/donateurs');
    assert.equal(liste.status, 200);
    assert.ok((liste.body.total as number) >= 2);
    const recherche = await api(t.baseUrl, 'GET', '/donateurs?q=martin');
    const rechercheItems = recherche.body.items as Array<Record<string, unknown>>;
    assert.equal(recherche.body.total, 1, 'recherche q filtre sur denominationSociale');
    assert.equal(rechercheItems[0]!.denominationSociale, 'Boulangerie Martin');

    // PATCH partiel : champs modifies, le reste conserve ; categoryCode valide.
    const patched = await api(t.baseUrl, 'PATCH', `/donateurs/${id}`, {
      email: 'claire.dupont@example.com',
      categoryCode: 'ALIM',
    });
    assert.equal(patched.status, 200);
    const patchedDonateur = patched.body.donateur as Record<string, unknown>;
    assert.equal(patchedDonateur.email, 'claire.dupont@example.com');
    assert.equal(patchedDonateur.nom, 'Dupont', 'champ non fourni conserve');
    assert.equal(patchedDonateur.categoryCode, 'ALIM');
    const introuvable = await api(t.baseUrl, 'PATCH', '/donateurs/donateur-inconnu', { nom: 'X' });
    assert.equal(introuvable.status, 404);

    // dry_run PATCH : diff sans ecriture.
    const dry = await api(t.baseUrl, 'PATCH', `/donateurs/${id}?dry_run=true`, { nom: 'Modifie' });
    assert.equal(dry.status, 200);
    assert.equal(dry.body.dry_run, true);
    const relit = await api(t.baseUrl, 'GET', `/donateurs?q=dupont`);
    const relitItems = relit.body.items as Array<Record<string, unknown>>;
    assert.equal((relitItems[0] as Record<string, unknown>).nom, 'Dupont', 'dry_run PATCH n ecrit rien');

    // DELETE sans confirm -> 400, avec confirm -> 200.
    const sansConfirm = await api(t.baseUrl, 'DELETE', `/donateurs/${id}`);
    assert.equal(sansConfirm.status, 400);
    const deleted = await api(t.baseUrl, 'DELETE', `/donateurs/${id}?confirm=true`);
    assert.equal(deleted.status, 200);
    const apres = await api(t.baseUrl, 'GET', '/donateurs?q=dupont');
    assert.equal(apres.body.total, 0, 'donateur supprime');
    const introuvableDel = await api(t.baseUrl, 'DELETE', '/donateurs/donateur-inconnu?confirm=true');
    assert.equal(introuvableDel.status, 404);

    // Audit create + update + delete.
    const audit = await api(t.baseUrl, 'GET', '/audit?limit=20');
    const auditItems = audit.body.items as Array<Record<string, unknown>>;
    assert.ok(auditItems.some((a) => a.entity === 'donateur' && a.action === 'create' && a.entity_id === id), 'entree audit create donateur manquante');
    assert.ok(auditItems.some((a) => a.entity === 'donateur' && a.action === 'update' && a.entity_id === id), 'entree audit update donateur manquante');
    assert.ok(auditItems.some((a) => a.entity === 'donateur' && a.action === 'delete' && a.entity_id === id), 'entree audit delete donateur manquante');
  });

  it('DELETE /donateurs/{id} supprime aussi les liens donateur_transactions', async () => {
    t.db
      .prepare('INSERT OR IGNORE INTO donateurs (id, payload, updated_at) VALUES (?, ?, ?)')
      .run(
        'donateur-liens',
        JSON.stringify({ id: 'donateur-liens', type: 'particulier', nom: 'Martin', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }),
        '2026-01-01T00:00:00.000Z'
      );
    t.db
      .prepare('INSERT OR IGNORE INTO donateur_transactions (transaction_id, donateur_id) VALUES (?, ?)')
      .run('tx-1', 'donateur-liens');
    const deleted = await api(t.baseUrl, 'DELETE', '/donateurs/donateur-liens?confirm=true');
    assert.equal(deleted.status, 200);
    const liens = t.db.prepare('SELECT COUNT(*) AS n FROM donateur_transactions WHERE donateur_id = ?').get('donateur-liens') as { n: number };
    assert.equal(liens.n, 0, 'liens transactions supprimes avec le donateur');
  });

  it('dry_run sur POST /donateurs ne modifie rien', async () => {
    const avant = await api(t.baseUrl, 'GET', '/donateurs');
    const totalAvant = avant.body.total as number;
    const res = await api(t.baseUrl, 'POST', '/donateurs', { nom: 'Factice', dry_run: true });
    assert.equal(res.status, 200);
    assert.equal(res.body.dry_run, true);
    assert.equal(res.body.action, 'create');
    const apres = await api(t.baseUrl, 'GET', '/donateurs');
    assert.equal(apres.body.total, totalAvant, 'aucune ecriture en dry_run');
  });
});

withServer('Export CSV transactions', (t) => {
  it('exporte les transactions en CSV (colonnes alignees ExportService)', async () => {
    const create1 = await api(t.baseUrl, 'POST', '/transactions', {
      account_id: 1,
      date: '2026-10-05',
      debit: 12.35,
      label: 'Courses',
      category_code: 'ALIM',
    });
    assert.equal(create1.status, 201);
    const create2 = await api(t.baseUrl, 'POST', '/transactions', {
      account_id: 1,
      date: '2026-10-06',
      credit: 50,
      label: 'Remboursement; essai',
    });
    assert.equal(create2.status, 201);

    const res = await api(t.baseUrl, 'GET', '/export/transactions');
    assert.equal(res.status, 200);
    // BOM UTF-8 en tete (verifie sur les bytes bruts : res.text() retire le BOM).
    const bytes = new Uint8Array(await (await fetch(`${t.baseUrl}/export/transactions`, { headers: { Authorization: `Bearer ${TEST_TOKEN}` } })).arrayBuffer());
    assert.deepEqual([bytes[0], bytes[1], bytes[2]], [0xef, 0xbb, 0xbf], 'BOM UTF-8 attendu');
    const csv = res.body.raw as string;
    const lignes = csv.split('\n');
    assert.equal(lignes[0], 'Date;Compte;Libellé;Débit;Crédit;Catégorie;N° facture');
    // Tri par date croissante ; debit stocke negatif exporte brut (aligne ExportService : t.debit sans transformation).
    assert.ok(lignes.some((l) => l === '2026-10-05;ACC1;Courses;-12,35;;ALIM;'), 'ligne depense manquante');
    // Libelle avec point-virgule : quote CSV.
    assert.ok(lignes.some((l) => l === '2026-10-06;ACC1;"Remboursement; essai";;50;;'), 'ligne revenu manquante');
  });

  it('filtre par account_id et exclut les soft-supprimees', async () => {
    const create = await api(t.baseUrl, 'POST', '/transactions', {
      account_id: 1,
      date: '2026-10-07',
      debit: 5,
      label: 'ASupprimer',
    });
    const id = (create.body.transaction as Record<string, unknown>).id as number;
    const del = await api(t.baseUrl, 'DELETE', `/transactions/${id}`);
    assert.equal(del.status, 200);
    const res = await api(t.baseUrl, 'GET', '/export/transactions');
    const csv = res.body.raw as string;
    assert.ok(!csv.includes('ASupprimer'), 'transaction soft-supprimee ne doit pas etre exportee');
    const resInclude = await api(t.baseUrl, 'GET', '/export/transactions?include_deleted=true');
    assert.ok((resInclude.body.raw as string).includes('ASupprimer'), 'include_deleted doit inclure la soft-supprimee');
  });

  it('400 si format non supporte', async () => {
    const res = await api(t.baseUrl, 'GET', '/export/transactions?format=xlsx');
    assert.equal(res.status, 400);
  });
});

withServer('Import CSV transactions', (t) => {
  it('aller-retour export -> import cree les transactions sans categorie', async () => {
    const create1 = await api(t.baseUrl, 'POST', '/transactions', {
      account_id: 1,
      date: '2026-10-05',
      debit: 12.35,
      label: 'Courses',
      category_code: 'ALIM',
    });
    assert.equal(create1.status, 201);
    const create2 = await api(t.baseUrl, 'POST', '/transactions', {
      account_id: 1,
      date: '2026-10-06',
      credit: 50,
      label: 'Remboursement',
    });
    assert.equal(create2.status, 201);

    const exportRes = await api(t.baseUrl, 'GET', '/export/transactions');
    assert.equal(exportRes.status, 200);
    const csv = exportRes.body.raw as string;

    // Mapping aligne sur l'export : Date=0, Compte=1, Libelle=2, Debit=3, Credit=4.
    const importRes = await api(t.baseUrl, 'POST', '/imports/transactions', {
      account_id: 1,
      csv,
      filename: 'aller-retour.csv',
      mapping: { dateColumnIndex: 0, libelleColumnIndex: 2, debitColumnIndex: 3, creditColumnIndex: 4 },
    });
    assert.equal(importRes.status, 201);
    assert.equal(importRes.body.imported, 2);
    assert.equal(importRes.body.date_start, '2026-10-05');
    assert.equal(importRes.body.date_end, '2026-10-06');
    const importId = importRes.body.id as number;
    assert.ok(Number.isInteger(importId) && importId >= 1);

    const list = await api(t.baseUrl, 'GET', '/transactions');
    assert.equal(list.body.total, 4, '2 transactions initiales + 2 importees');
    const items = list.body.items as Array<Record<string, unknown>>;
    const imported = items.filter((tx) => tx.import_id === importId);
    assert.equal(imported.length, 2);
    for (const tx of imported) {
      assert.equal(tx.category_code, null, 'import sans categorie');
      assert.equal(tx.account_id, 1);
    }
    const depense = imported.find((tx) => tx.label === 'Courses');
    const revenu = imported.find((tx) => tx.label === 'Remboursement');
    assert.ok(depense && revenu, 'lignes importees presentes');
    assert.equal(depense.debit, -12.35, 'debit negatif conserve');
    assert.equal(revenu.credit, 50, 'credit positif conserve');
  });

  it('dry_run renvoie un apercu sans ecrire', async () => {
    const before = await api(t.baseUrl, 'GET', '/transactions');
    const csv = 'Date;Libellé;Débit;Crédit\n2026-10-10;Apercu;10;\n';
    const res = await api(t.baseUrl, 'POST', '/imports/transactions?dry_run=true', {
      account_id: 1,
      csv,
      mapping: { dateColumnIndex: 0, libelleColumnIndex: 1, debitColumnIndex: 2, creditColumnIndex: 3 },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.dry_run, true);
    const after = res.body.after as Record<string, unknown>;
    assert.equal(after.row_count, 1);
    assert.equal(after.date_start, '2026-10-10');
    const rows = after.rows as Array<Record<string, unknown>>;
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.label, 'Apercu');
    const afterList = await api(t.baseUrl, 'GET', '/transactions');
    assert.equal(afterList.body.total, before.body.total, 'dry_run n ecrit rien');
  });

  it('404 compte introuvable, 422 mapping manquant, 422 aucune ligne valide', async () => {
    const csv = 'Date;Libellé;Débit;Crédit\n2026-10-10;X;10;\n';
    const mapping = { dateColumnIndex: 0, libelleColumnIndex: 1, debitColumnIndex: 2, creditColumnIndex: 3 };
    const noAccount = await api(t.baseUrl, 'POST', '/imports/transactions', { account_id: 999, csv, mapping });
    assert.equal(noAccount.status, 404);
    const noMapping = await api(t.baseUrl, 'POST', '/imports/transactions', { account_id: 1, csv });
    assert.equal(noMapping.status, 422);
    assert.ok(String(noMapping.body.error).includes('mapping'));
    const badDates = await api(t.baseUrl, 'POST', '/imports/transactions', {
      account_id: 1,
      csv: 'Date;Libellé;Débit;Crédit\npasunedate;X;10;\n',
      mapping,
    });
    assert.equal(badDates.status, 422);
    assert.ok(String(badDates.body.error).includes('Aucune ligne valide'));
  });

  it('montant combine (debitCredit) : colonne unique a montants signes', async () => {
    const csv = 'Date;Libellé;Montant\n2026-10-11;Retrait;-25,5\n2026-10-12;Virement;100\n';
    const res = await api(t.baseUrl, 'POST', '/imports/transactions', {
      account_id: 1,
      csv,
      mapping: { dateColumnIndex: 0, libelleColumnIndex: 1, debitColumnIndex: 2, creditColumnIndex: 2 },
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.imported, 2);
    const list = await api(t.baseUrl, 'GET', '/transactions');
    const items = list.body.items as Array<Record<string, unknown>>;
    const retrait = items.find((tx) => tx.label === 'Retrait');
    const virement = items.find((tx) => tx.label === 'Virement');
    assert.ok(retrait && virement);
    assert.equal(retrait.debit, -25.5);
    assert.equal(retrait.credit, 0);
    assert.equal(virement.credit, 100);
    assert.equal(virement.debit, 0);
  });
});

withServer('Templates import CSV', (t) => {
  it('cree un template, le liste, refuse un role invalide', async () => {
    const create = await api(t.baseUrl, 'POST', '/import-templates', {
      name: 'Banque Populaire',
      account_id: 1,
      initial_balance: 100,
      column_roles: { Date: 'date', 'Date de valeur': 'dateValue', Libellé: 'libelle', Débit: 'debit', Crédit: 'credit', Catégorie: 'ignore' },
    });
    assert.equal(create.status, 201);
    const template = create.body.template as Record<string, unknown>;
    assert.equal(template.name, 'Banque Populaire');
    assert.equal(template.account_id, 1);
    assert.equal(template.initial_balance, 100);
    const roles = template.column_roles as Record<string, string>;
    assert.equal(roles['Libellé'], 'libelle');
    assert.equal(roles['Catégorie'], 'ignore');
    const id = create.body.id as number;
    assert.ok(Number.isInteger(id) && id >= 1);

    const list = await api(t.baseUrl, 'GET', '/import-templates');
    assert.equal(list.status, 200);
    const items = list.body.items as Array<Record<string, unknown>>;
    assert.ok(items.some((tpl) => tpl.name === 'Banque Populaire'), 'template liste');

    const badRole = await api(t.baseUrl, 'POST', '/import-templates', {
      name: 'Invalide',
      column_roles: { Date: 'date', Libellé: 'libelle', Montant: 'signe' },
    });
    assert.equal(badRole.status, 422);
    assert.ok(String(badRole.body.error).includes('role invalide'));

    const noAccount = await api(t.baseUrl, 'POST', '/import-templates', {
      name: 'Compte inconnu',
      account_id: 999,
      column_roles: { Date: 'date' },
    });
    assert.equal(noAccount.status, 404);
  });
});
