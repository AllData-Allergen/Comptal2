/**
 * Comptal2.1 Agent API — accès local SQLite pour agents IA.
 * Bind 127.0.0.1 uniquement. Pas de SQL libre.
 */
import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const HOST = process.env.COMPTAL_AGENT_HOST || '127.0.0.1';
const PORT = Number(process.env.COMPTAL_AGENT_PORT || 17841);
const TOKEN = process.env.COMPTAL_AGENT_TOKEN || 'local-comptal-agent';
const READONLY = (process.env.COMPTAL_AGENT_READONLY ?? '1') !== '0';
const DATA_ROOT = resolve(
  process.env.COMPTAL_DATA_ROOT || join(__dirname, '..', '..', 'data')
);

function json(res, status, body) {
  const payload = JSON.stringify(body, null, 0);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(payload);
}

function parseBody(req) {
  return new Promise((resolveBody, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      if (!chunks.length) return resolveBody({});
      try {
        resolveBody(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (e) {
        reject(new Error('JSON invalide'));
      }
    });
    req.on('error', reject);
  });
}

function authOk(req) {
  const h = req.headers.authorization || '';
  if (h === `Bearer ${TOKEN}`) return true;
  const q = new URL(req.url || '/', `http://${HOST}`).searchParams.get('token');
  return q === TOKEN;
}

function listProfiles() {
  const profilsDir = join(DATA_ROOT, 'profils');
  if (!existsSync(profilsDir)) return [];
  return readdirSync(profilsDir)
    .filter((name) => {
      const db = join(profilsDir, name, 'comptal.db');
      return existsSync(db) && statSync(join(profilsDir, name)).isDirectory();
    })
    .map((id) => {
      const infoPath = join(profilsDir, id, 'info.json');
      let info = { id };
      if (existsSync(infoPath)) {
        try {
          info = { ...JSON.parse(readFileSync(infoPath, 'utf8')), id };
        } catch {
          /* ignore */
        }
      }
      return {
        id,
        name: info.name || id,
        mode: info.mode || null,
        dbPath: join(profilsDir, id, 'comptal.db'),
      };
    });
}

function openDb(profileId, { write = false } = {}) {
  const safe = String(profileId).replace(/[^a-zA-Z0-9._-]/g, '');
  if (safe !== profileId) throw Object.assign(new Error('profileId invalide'), { status: 400 });
  const dbPath = join(DATA_ROOT, 'profils', safe, 'comptal.db');
  if (!existsSync(dbPath)) throw Object.assign(new Error('Profil introuvable'), { status: 404 });
  const db = new DatabaseSync(dbPath, { readOnly: !write });
  try {
    db.exec('PRAGMA busy_timeout = 10000');
    if (write) db.exec('PRAGMA foreign_keys = ON');
  } catch {
    /* readonly may reject some pragmas */
  }
  return db;
}

function parseJson(text, fallback = {}) {
  try {
    return JSON.parse(text || '{}');
  } catch {
    return fallback;
  }
}

function sqlTxActive() {
  return `(deleted_at IS NULL OR deleted_at = '')`;
}

function listTransactions(db, { limit = 200, q = '', creditOnly = false } = {}) {
  const lim = Math.min(Math.max(Number(limit) || 200, 1), 2000);
  let sql = `SELECT id, account_id, date, value_date, debit, credit, label, category_code
             FROM transactions WHERE ${sqlTxActive()}`;
  const params = [];
  if (creditOnly) sql += ' AND credit > 0';
  if (q) {
    sql += ' AND label LIKE ?';
    params.push(`%${q}%`);
  }
  sql += ' ORDER BY date DESC, id DESC LIMIT ?';
  params.push(lim);
  return db.prepare(sql).all(...params);
}

function listClients(db) {
  return db
    .prepare(
      `SELECT id, code_client, type, archived, payload, updated_at FROM clients WHERE archived = 0 OR archived IS NULL`
    )
    .all()
    .map((row) => ({
      id: row.id,
      codeClient: row.code_client,
      type: row.type,
      updatedAt: row.updated_at,
      ...pickClientFields(parseJson(row.payload)),
    }));
}

function pickClientFields(p) {
  return {
    nom: p.nom || p.name || p.raisonSociale || p.denomination || null,
    email: p.email || null,
    siret: p.siret || null,
  };
}

function listDevis(db, { includeDeleted = false } = {}) {
  const sql = includeDeleted
    ? `SELECT id, client_id, numero, statut, COALESCE(supprime,0) AS supprime, payload, updated_at FROM devis`
    : `SELECT id, client_id, numero, statut, COALESCE(supprime,0) AS supprime, payload, updated_at FROM devis WHERE COALESCE(supprime,0)=0`;
  return db.prepare(sql).all().map(mapDocRow);
}

function listFactures(db, { unpaidOnly = false, clientId = null } = {}) {
  const rows = db
    .prepare(
      `SELECT id, client_id, numero, statut, devis_origine, COALESCE(supprime,0) AS supprime, payload, updated_at
       FROM factures WHERE COALESCE(supprime,0)=0`
    )
    .all()
    .map(mapDocRow)
    .filter((f) => (clientId ? f.clientId === clientId : true));
  if (!unpaidOnly) return rows;
  return rows.filter((f) => {
    const remaining = remainingAmount(f);
    return remaining > 0.009 && !['annulee', 'brouillon'].includes(f.statut);
  });
}

function correlateSummary(db) {
  const unpaid = listFactures(db, { unpaidOnly: true });
  const samples = [];
  let withLabelMatch = 0;
  for (const facture of unpaid) {
    const matches = findMatches(db, facture);
    const labelMatches = matches.filter((m) => m.reason === 'label' || m.reason === 'both');
    if (labelMatches.length) withLabelMatch += 1;
    for (const m of labelMatches.slice(0, 2)) {
      if (samples.length >= 10) break;
      samples.push({
        factureId: facture.id,
        numero: facture.numero,
        remaining: remainingAmount(facture),
        transactionId: m.transaction.id,
        score: m.score,
        reason: m.reason,
        label: m.transaction.label,
        amount: m.transaction.credit,
      });
    }
    if (samples.length >= 10) break;
  }
  return {
    unpaidFactures: unpaid.length,
    facturesWithLabelMatch: withLabelMatch,
    samples,
  };
}

function mapDocRow(row) {
  const payload = parseJson(row.payload);
  return {
    id: row.id,
    clientId: row.client_id,
    numero: row.numero,
    statut: row.statut,
    devisOrigine: row.devis_origine ?? payload.devisOrigine ?? null,
    updatedAt: row.updated_at,
    totalTTC: Number(payload.totalTTC ?? 0),
    totalHT: Number(payload.totalHT ?? 0),
    paiements: Array.isArray(payload.paiements) ? payload.paiements : [],
    intitule: payload.intituleSecondaire || payload.notes || null,
    dateEmission: payload.dateEmission || null,
    dateEcheance: payload.dateEcheance || null,
    payloadSummary: {
      documentType: payload.documentType || null,
      clientId: payload.clientId || row.client_id,
    },
  };
}

function paidAmount(facture) {
  return (facture.paiements || []).reduce((s, p) => s + Number(p.montant || 0), 0);
}

function remainingAmount(facture) {
  return Math.max(0, Number(facture.totalTTC || 0) - paidAmount(facture));
}

function amountClose(a, b) {
  return Math.abs(Number(a) - Number(b)) < 0.05;
}

function labelContainsNumero(label, numero) {
  if (!label || !numero) return false;
  const norm = (s) =>
    String(s)
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');
  return norm(label).includes(norm(numero));
}

/** Heuristique alignée sur PaymentTrackingService.rankMatch */
function findMatches(db, facture) {
  const remaining = remainingAmount(facture);
  const linked = new Set(
    (facture.paiements || []).map((p) => String(p.transactionId || '')).filter(Boolean)
  );
  const txs = listTransactions(db, { limit: 2000, creditOnly: true });
  const matches = [];
  for (const tx of txs) {
    if (linked.has(String(tx.id))) continue;
    const amount = Math.abs(Number(tx.credit) || 0);
    if (amount <= 0) continue;
    const byLabel = labelContainsNumero(tx.label || '', facture.numero);
    const byAmount =
      amountClose(amount, facture.totalTTC) || amountClose(amount, remaining);
    if (!byLabel && !byAmount) continue;
    const reason = byLabel && byAmount ? 'both' : byLabel ? 'label' : 'amount';
    const score = (byLabel ? 100 : 0) + (byAmount ? 40 : 0) + (reason === 'both' ? 20 : 0);
    matches.push({
      transaction: tx,
      reason,
      score,
      remaining,
    });
  }
  matches.sort(
    (a, b) => b.score - a.score || String(b.transaction.date).localeCompare(String(a.transaction.date))
  );
  return matches;
}

function getFacture(db, factureId) {
  const row = db
    .prepare(
      `SELECT id, client_id, numero, statut, devis_origine, COALESCE(supprime,0) AS supprime, payload, updated_at
       FROM factures WHERE id = ?`
    )
    .get(factureId);
  if (!row || row.supprime) return null;
  return mapDocRow(row);
}

function linkPayment(db, factureId, transactionId) {
  const row = db
    .prepare(`SELECT id, payload, statut FROM factures WHERE id = ? AND COALESCE(supprime,0)=0`)
    .get(factureId);
  if (!row) throw Object.assign(new Error('Facture introuvable'), { status: 404 });
  const payload = parseJson(row.payload);
  payload.paiements = Array.isArray(payload.paiements) ? payload.paiements : [];
  if (payload.paiements.some((p) => String(p.transactionId) === String(transactionId))) {
    return mapDocRow({ ...row, client_id: payload.clientId, numero: payload.numero || row.id, devis_origine: payload.devisOrigine, updated_at: new Date().toISOString(), payload: JSON.stringify(payload) });
  }
  const tx = db
    .prepare(
      `SELECT id, date, credit, label FROM transactions WHERE id = ? AND ${sqlTxActive()}`
    )
    .get(Number(transactionId));
  if (!tx) throw Object.assign(new Error('Transaction introuvable'), { status: 404 });
  const credit = Math.abs(Number(tx.credit) || 0);
  if (credit <= 0) throw Object.assign(new Error('Seuls les crédits sont liables'), { status: 400 });
  const facture = mapDocRow({
    ...row,
    client_id: payload.clientId,
    numero: payload.numero || row.id,
    devis_origine: payload.devisOrigine,
    updated_at: new Date().toISOString(),
    payload: JSON.stringify(payload),
  });
  const remaining = remainingAmount(facture);
  const montant = Math.min(credit, remaining);
  if (montant <= 0) throw Object.assign(new Error('Reste à encaisser nul'), { status: 400 });

  payload.paiements.push({
    id: `pay_${randomUUID().slice(0, 8)}`,
    factureId,
    montant,
    datePaiement: tx.date,
    modePaiement: 'virement',
    transactionId: String(tx.id),
    reference: tx.label,
  });
  const paid = payload.paiements.reduce((s, p) => s + Number(p.montant || 0), 0);
  const totalTTC = Number(payload.totalTTC || 0);
  if (totalTTC - paid <= 0.009) payload.statut = 'payee';
  else if (payload.paiements.length > 0) payload.statut = 'payee_partiellement';
  payload.updatedAt = new Date().toISOString();

  const now = new Date().toISOString();
  db.prepare(
    `UPDATE factures SET statut = ?, payload = ?, updated_at = ? WHERE id = ?`
  ).run(payload.statut, JSON.stringify(payload), now, factureId);

  return getFacture(db, factureId);
}

const OPENAPI = {
  openapi: '3.0.3',
  info: {
    title: 'Comptal2.1 Agent API',
    version: '0.1.0',
    description:
      'API locale (127.0.0.1) pour agents IA — lecture SQLite + corrélation factures/transactions.',
  },
  servers: [{ url: `http://${HOST}:${PORT}` }],
  components: {
    securitySchemes: {
      bearer: { type: 'http', scheme: 'bearer' },
    },
  },
  security: [{ bearer: [] }],
  paths: {
    '/health': { get: { summary: 'Santé' } },
    '/profiles': { get: { summary: 'Liste des profils' } },
    '/profiles/{id}/transactions': { get: { summary: 'Transactions' } },
    '/profiles/{id}/clients': { get: { summary: 'Contacts' } },
    '/profiles/{id}/devis': { get: { summary: 'Devis' } },
    '/profiles/{id}/factures': { get: { summary: 'Factures (?unpaidOnly=1&clientId=)' } },
    '/profiles/{id}/correlate-summary': {
      get: { summary: 'Résumé corrélation (impayées + matches libellé)' },
    },
    '/profiles/{id}/factures/{factureId}/matches': {
      get: { summary: 'Suggestions de corrélation TX ↔ facture' },
    },
    '/profiles/{id}/factures/{factureId}/link': {
      post: { summary: 'Lier une transaction (écriture, READONLY=0)' },
    },
  },
};

async function handle(req, res) {
  if (!authOk(req)) return json(res, 401, { error: 'unauthorized' });
  const url = new URL(req.url || '/', `http://${HOST}`);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const method = req.method || 'GET';

  try {
    if (method === 'GET' && path === '/health') {
      return json(res, 200, {
        ok: true,
        readonly: READONLY,
        dataRoot: DATA_ROOT,
        profiles: listProfiles().length,
      });
    }
    if (method === 'GET' && path === '/openapi.json') {
      return json(res, 200, OPENAPI);
    }
    if (method === 'GET' && path === '/profiles') {
      return json(res, 200, { profiles: listProfiles() });
    }

    const mTx = path.match(/^\/profiles\/([^/]+)\/transactions$/);
    if (method === 'GET' && mTx) {
      const db = openDb(mTx[1]);
      try {
        const items = listTransactions(db, {
          limit: url.searchParams.get('limit'),
          q: url.searchParams.get('q') || '',
          creditOnly: url.searchParams.get('creditOnly') === '1',
        });
        return json(res, 200, { items });
      } finally {
        db.close();
      }
    }

    const mCl = path.match(/^\/profiles\/([^/]+)\/clients$/);
    if (method === 'GET' && mCl) {
      const db = openDb(mCl[1]);
      try {
        return json(res, 200, { items: listClients(db) });
      } finally {
        db.close();
      }
    }

    const mDv = path.match(/^\/profiles\/([^/]+)\/devis$/);
    if (method === 'GET' && mDv) {
      const db = openDb(mDv[1]);
      try {
        return json(res, 200, { items: listDevis(db) });
      } finally {
        db.close();
      }
    }

    const mFa = path.match(/^\/profiles\/([^/]+)\/factures$/);
    if (method === 'GET' && mFa) {
      const db = openDb(mFa[1]);
      try {
        return json(res, 200, {
          items: listFactures(db, {
            unpaidOnly: url.searchParams.get('unpaidOnly') === '1',
            clientId: url.searchParams.get('clientId'),
          }),
        });
      } finally {
        db.close();
      }
    }

    const mSum = path.match(/^\/profiles\/([^/]+)\/correlate-summary$/);
    if (method === 'GET' && mSum) {
      const db = openDb(mSum[1]);
      try {
        return json(res, 200, correlateSummary(db));
      } finally {
        db.close();
      }
    }

    const mMatch = path.match(/^\/profiles\/([^/]+)\/factures\/([^/]+)\/matches$/);
    if (method === 'GET' && mMatch) {
      const db = openDb(mMatch[1]);
      try {
        const facture = getFacture(db, mMatch[2]);
        if (!facture) return json(res, 404, { error: 'facture_not_found' });
        const matches = findMatches(db, facture);
        return json(res, 200, {
          facture: {
            id: facture.id,
            numero: facture.numero,
            totalTTC: facture.totalTTC,
            paid: paidAmount(facture),
            remaining: remainingAmount(facture),
            statut: facture.statut,
          },
          matches,
        });
      } finally {
        db.close();
      }
    }

    const mLink = path.match(/^\/profiles\/([^/]+)\/factures\/([^/]+)\/link$/);
    if (method === 'POST' && mLink) {
      if (READONLY) {
        return json(res, 403, {
          error: 'readonly',
          hint: 'Relancer avec COMPTAL_AGENT_READONLY=0 pour autoriser les écritures',
        });
      }
      const body = await parseBody(req);
      const transactionId = body.transactionId ?? body.transaction_id;
      if (transactionId == null) return json(res, 400, { error: 'transactionId_required' });
      const db = openDb(mLink[1], { write: true });
      try {
        const facture = linkPayment(db, mLink[2], transactionId);
        return json(res, 200, { ok: true, facture });
      } finally {
        db.close();
      }
    }

    return json(res, 404, { error: 'not_found', path });
  } catch (e) {
    const status = e.status || 500;
    return json(res, status, { error: e.message || String(e) });
  }
}

export function startServer() {
  if (HOST !== '127.0.0.1' && HOST !== 'localhost') {
    console.error('Refus: COMPTAL_AGENT_HOST doit être 127.0.0.1');
    process.exit(1);
  }
  const server = createServer((req, res) => {
    void handle(req, res);
  });
  server.listen(PORT, HOST, () => {
    console.log(
      JSON.stringify({
        event: 'agent_api_listen',
        url: `http://${HOST}:${PORT}`,
        readonly: READONLY,
        dataRoot: DATA_ROOT,
      })
    );
  });
  return server;
}

// Démarrage direct: node server.mjs
if (process.argv[1] && /server\.mjs$/i.test(process.argv[1])) {
  startServer();
}
