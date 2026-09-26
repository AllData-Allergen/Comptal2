/**
 * Comptal2.1 Agent API — serveur MCP stdio (JSON-RPC) → HTTP local.
 * Prérequis : `npm run agent-api:start` sur 127.0.0.1 (ou COMPTAL_AGENT_URL).
 */
import { createInterface } from 'node:readline';

const PORT = Number(process.env.COMPTAL_AGENT_PORT || 17841);
const TOKEN = process.env.COMPTAL_AGENT_TOKEN || 'local-comptal-agent';
const BASE_URL = (process.env.COMPTAL_AGENT_URL || `http://127.0.0.1:${PORT}`).replace(
  /\/$/,
  ''
);
const READONLY = (process.env.COMPTAL_AGENT_READONLY ?? '1') !== '0';

const SERVER_INFO = { name: 'comptal-agent-mcp', version: '0.1.0' };
const PROTOCOL_VERSION = '2024-11-05';

function logErr(...args) {
  console.error('[comptal-mcp]', ...args);
}

function textResult(data, { isError = false } = {}) {
  const text =
    typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  return { content: [{ type: 'text', text }], isError };
}

async function httpJson(method, path, { query, body } = {}) {
  const url = new URL(path.startsWith('/') ? path : `/${path}`, `${BASE_URL}/`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === '') continue;
      url.searchParams.set(key, String(value));
    }
  }
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const raw = await res.text();
  let parsed;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    parsed = raw;
  }
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}`);
    err.status = res.status;
    err.body = parsed;
    throw err;
  }
  return parsed;
}

function buildTools() {
  const tools = [
    {
      name: 'comptal_health',
      description: 'État du sidecar Agent API (lecture seule, dataRoot, nombre de profils).',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'comptal_list_profiles',
      description: 'Liste les profils Comptal ayant un fichier comptal.db.',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'comptal_list_transactions',
      description: 'Transactions bancaires d’un profil (filtres optionnels).',
      inputSchema: {
        type: 'object',
        properties: {
          profileId: { type: 'string', description: 'Identifiant du profil' },
          q: { type: 'string', description: 'Filtre libellé (LIKE)' },
          creditOnly: {
            type: 'boolean',
            description: 'Ne garder que les crédits (credit > 0)',
          },
          limit: { type: 'number', description: 'Max lignes (1–2000, défaut 200)' },
        },
        required: ['profileId'],
      },
    },
    {
      name: 'comptal_list_factures',
      description: 'Factures d’un profil.',
      inputSchema: {
        type: 'object',
        properties: {
          profileId: { type: 'string' },
          unpaidOnly: {
            type: 'boolean',
            description: 'Uniquement factures avec reste à encaisser',
          },
        },
        required: ['profileId'],
      },
    },
    {
      name: 'comptal_list_devis',
      description: 'Devis actifs d’un profil.',
      inputSchema: {
        type: 'object',
        properties: { profileId: { type: 'string' } },
        required: ['profileId'],
      },
    },
    {
      name: 'comptal_list_clients',
      description: 'Contacts / clients non archivés d’un profil.',
      inputSchema: {
        type: 'object',
        properties: { profileId: { type: 'string' } },
        required: ['profileId'],
      },
    },
    {
      name: 'comptal_suggest_matches',
      description:
        'Suggestions de transactions à lier à une facture (libellé + montant, comme PaymentTrackingService).',
      inputSchema: {
        type: 'object',
        properties: {
          profileId: { type: 'string' },
          factureId: { type: 'string' },
        },
        required: ['profileId', 'factureId'],
      },
    },
  ];

  if (!READONLY) {
    tools.push({
      name: 'comptal_link_payment',
      description:
        'Lie une transaction (crédit) à une facture dans le payload JSON (écriture SQLite).',
      inputSchema: {
        type: 'object',
        properties: {
          profileId: { type: 'string' },
          factureId: { type: 'string' },
          transactionId: {
            type: ['string', 'number'],
            description: 'ID transaction SQLite',
          },
        },
        required: ['profileId', 'factureId', 'transactionId'],
      },
    });
  }

  return tools;
}

async function callTool(name, args) {
  const a = args && typeof args === 'object' ? args : {};

  switch (name) {
    case 'comptal_health':
      return textResult(await httpJson('GET', '/health'));

    case 'comptal_list_profiles':
      return textResult(await httpJson('GET', '/profiles'));

    case 'comptal_list_transactions': {
      if (!a.profileId) throw Object.assign(new Error('profileId requis'), { code: -32602 });
      const query = {};
      if (a.q) query.q = a.q;
      if (a.creditOnly === true) query.creditOnly = '1';
      if (a.limit != null) query.limit = a.limit;
      return textResult(
        await httpJson('GET', `/profiles/${encodeURIComponent(a.profileId)}/transactions`, {
          query,
        })
      );
    }

    case 'comptal_list_factures': {
      if (!a.profileId) throw Object.assign(new Error('profileId requis'), { code: -32602 });
      const query = {};
      if (a.unpaidOnly === true) query.unpaidOnly = '1';
      return textResult(
        await httpJson('GET', `/profiles/${encodeURIComponent(a.profileId)}/factures`, {
          query,
        })
      );
    }

    case 'comptal_list_devis': {
      if (!a.profileId) throw Object.assign(new Error('profileId requis'), { code: -32602 });
      return textResult(
        await httpJson('GET', `/profiles/${encodeURIComponent(a.profileId)}/devis`)
      );
    }

    case 'comptal_list_clients': {
      if (!a.profileId) throw Object.assign(new Error('profileId requis'), { code: -32602 });
      return textResult(
        await httpJson('GET', `/profiles/${encodeURIComponent(a.profileId)}/clients`)
      );
    }

    case 'comptal_suggest_matches': {
      if (!a.profileId || !a.factureId) {
        throw Object.assign(new Error('profileId et factureId requis'), { code: -32602 });
      }
      return textResult(
        await httpJson(
          'GET',
          `/profiles/${encodeURIComponent(a.profileId)}/factures/${encodeURIComponent(a.factureId)}/matches`
        )
      );
    }

    case 'comptal_link_payment': {
      if (READONLY) {
        return textResult(
          {
            error: 'readonly',
            hint: 'Définir COMPTAL_AGENT_READONLY=0 sur le MCP et le serveur HTTP',
          },
          { isError: true }
        );
      }
      if (!a.profileId || !a.factureId || a.transactionId == null) {
        throw Object.assign(new Error('profileId, factureId et transactionId requis'), {
          code: -32602,
        });
      }
      return textResult(
        await httpJson(
          'POST',
          `/profiles/${encodeURIComponent(a.profileId)}/factures/${encodeURIComponent(a.factureId)}/link`,
          { body: { transactionId: a.transactionId } }
        )
      );
    }

    default:
      throw Object.assign(new Error(`Outil inconnu: ${name}`), { code: -32601 });
  }
}

function reply(id, result) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n');
}

function replyError(id, code, message, data) {
  process.stdout.write(
    JSON.stringify({
      jsonrpc: '2.0',
      id,
      error: { code, message, ...(data !== undefined ? { data } : {}) },
    }) + '\n'
  );
}

async function handleRequest(msg) {
  const { id, method, params } = msg;

  if (method === 'initialize') {
    return reply(id, {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: {} },
      serverInfo: SERVER_INFO,
    });
  }

  if (method === 'ping') {
    return reply(id, {});
  }

  if (method === 'tools/list') {
    return reply(id, { tools: buildTools() });
  }

  if (method === 'tools/call') {
    const toolName = params?.name;
    const toolArgs = params?.arguments ?? {};
    try {
      const result = await callTool(toolName, toolArgs);
      return reply(id, result);
    } catch (e) {
      const code = e.code ?? (e.status ? -32000 : -32603);
      if (id !== undefined) {
        if (e.status) {
          return reply(id, textResult({ status: e.status, body: e.body }, { isError: true }));
        }
        return replyError(id, code, e.message || String(e));
      }
    }
    return;
  }

  if (method === 'notifications/initialized') {
    return;
  }

  if (id !== undefined) {
    return replyError(id, -32601, `Méthode non supportée: ${method}`);
  }
}

function onLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return;
  let msg;
  try {
    msg = JSON.parse(trimmed);
  } catch (e) {
    logErr('JSON invalide sur stdin', e.message);
    return;
  }

  if (msg.method && msg.id === undefined) {
    void handleRequest(msg);
    return;
  }

  if (msg.id === undefined) return;

  void handleRequest(msg).catch((e) => {
    logErr('handleRequest', e);
    replyError(msg.id, -32603, e.message || String(e));
  });
}

const rl = createInterface({ input: process.stdin, terminal: false });
rl.on('line', onLine);
rl.on('close', () => process.exit(0));

process.stdin.on('error', (e) => logErr('stdin error', e));
