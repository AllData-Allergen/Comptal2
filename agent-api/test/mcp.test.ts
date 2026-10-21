// Tests du serveur MCP stdio : protocole JSON-RPC, authentification par jeton,
// appels d'outils reutilisant les handlers metier. Base SQLite temporaire uniquement.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, TEST_TOKEN, type TestDb } from './helpers.ts';
import { handleMessage } from '../src/mcp.ts';

interface RpcResponse {
  jsonrpc: string;
  id: number | string | null;
  result?: Record<string, unknown>;
  error?: { code: number; message: string };
}

function call(
  db: TestDb['db'],
  id: number | string,
  method: string,
  params?: Record<string, unknown>
): Promise<RpcResponse | null> {
  const message: Record<string, unknown> = { jsonrpc: '2.0', id, method };
  if (params !== undefined) message['params'] = params;
  return handleMessage(db, TEST_TOKEN, message) as Promise<RpcResponse | null>;
}

describe('MCP : protocole JSON-RPC', () => {
  let testDb: TestDb;
  before(() => {
    testDb = createTestDb();
  });
  after(() => {
    testDb.cleanup();
  });

  it('initialize renvoie serverInfo et capabilities', async () => {
    const res = await call(testDb.db, 1, 'initialize', { protocolVersion: '2025-06-18' });
    assert.ok(res && res.result);
    const serverInfo = res.result['serverInfo'] as Record<string, unknown>;
    assert.equal(serverInfo['name'], 'comptal21-agent-api-mcp');
    assert.equal(res.result['protocolVersion'], '2025-06-18');
  });

  it('notifications/initialized ne renvoie rien (notification)', async () => {
    const res = await call(testDb.db, 2, 'notifications/initialized');
    assert.equal(res, null);
  });

  it('ping renvoie un resultat vide', async () => {
    const res = await call(testDb.db, 3, 'ping');
    assert.ok(res && res.result);
  });

  it('methode inconnue -> erreur -32601', async () => {
    const res = await call(testDb.db, 4, 'resources/list');
    assert.ok(res && res.error);
    assert.equal(res.error.code, -32601);
  });

  it('tools/list expose les outils avec name/description/inputSchema', async () => {
    const res = await call(testDb.db, 5, 'tools/list');
    assert.ok(res && res.result);
    const tools = res.result['tools'] as Array<Record<string, unknown>>;
    assert.ok(tools.length >= 30);
    for (const tool of tools) {
      assert.equal(typeof tool['name'], 'string');
      assert.equal(typeof tool['description'], 'string');
      const schema = tool['inputSchema'] as Record<string, unknown>;
      assert.equal(schema['type'], 'object');
    }
    const names = tools.map((t) => t['name']);
    assert.ok(names.includes('comptal_create_transaction'));
    assert.ok(names.includes('comptal_list_dons'));
    assert.ok(names.includes('comptal_get_balances'));
  });
});

describe('MCP : authentification par jeton', () => {
  let testDb: TestDb;
  before(() => {
    testDb = createTestDb();
  });
  after(() => {
    testDb.cleanup();
  });

  it('tools/call sans jeton -> erreur -32001', async () => {
    const res = await call(testDb.db, 1, 'tools/call', {
      name: 'comptal_list_transactions',
      arguments: {},
    });
    assert.ok(res && res.error);
    assert.equal(res.error.code, -32001);
  });

  it('tools/call avec mauvais jeton -> erreur -32001', async () => {
    const res = await handleMessage(testDb.db, TEST_TOKEN, {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'comptal_list_transactions',
        arguments: {},
        _meta: { token: 'mauvais-jeton-000000000000' },
      },
    }) as unknown as RpcResponse;
    assert.ok(res.error);
    assert.equal(res.error.code, -32001);
  });

  it('initialize et tools/list restent accessibles sans jeton (aucune donnee metier)', async () => {
    const init = await call(testDb.db, 3, 'initialize', {});
    assert.ok(init && init.result);
    const list = await call(testDb.db, 4, 'tools/list');
    assert.ok(list && list.result);
  });
});

describe('MCP : outils metier (transactions)', () => {
  let testDb: TestDb;
  before(() => {
    testDb = createTestDb();
  });
  after(() => {
    testDb.cleanup();
  });

  async function toolCall(
    id: number,
    name: string,
    args: Record<string, unknown>
  ): Promise<{ status: number; isError: boolean; payload: Record<string, unknown> }> {
    const res = await handleMessage(testDb.db, TEST_TOKEN, {
      jsonrpc: '2.0',
      id,
      method: 'tools/call',
      params: { name, arguments: args, _meta: { token: TEST_TOKEN } },
    }) as unknown as RpcResponse;
    assert.ok(res && res.result, `reponse attendue pour ${name}`);
    const content = res.result!['content'] as Array<{ type: string; text: string }>;
    assert.ok(Array.isArray(content) && content.length > 0);
    const payload = JSON.parse(content[0]!.text) as Record<string, unknown>;
    return {
      status: payload['status'] as number,
      isError: res.result!['isError'] === true,
      payload,
    };
  }

  it('comptal_create_transaction cree une ligne et l\'audit', async () => {
    const out = await toolCall(1, 'comptal_create_transaction', {
      body: { account_id: 1, date: '2026-01-15', debit: 12.5, label: 'Courses MCP' },
    });
    assert.equal(out.status, 201);
    assert.equal(out.isError, false);
    const created = out.payload['transaction'] as Record<string, unknown>;
    assert.equal(created['label'], 'Courses MCP');
    const audit = testDb.db.prepare("SELECT count(*) AS n FROM audit_log WHERE entity = 'transaction' AND action = 'create' AND actor = 'mcp'").get() as { n: number };
    assert.equal(audit.n, 1);
  });

  it('comptal_list_transactions retrouve la transaction creee', async () => {
    const out = await toolCall(2, 'comptal_list_transactions', {});
    assert.equal(out.status, 200);
    const items = out.payload['items'] as Array<Record<string, unknown>>;
    assert.ok(items.some((t) => t['label'] === 'Courses MCP'));
  });

  it('comptal_get_transaction avec id inexistant -> isError + status 404', async () => {
    const out = await toolCall(3, 'comptal_get_transaction', { id: 9999 });
    assert.equal(out.status, 404);
    assert.equal(out.isError, true);
    assert.ok(typeof out.payload['error'] === 'string');
  });

  it('comptal_create_transaction avec body invalide -> isError + status 422', async () => {
    const out = await toolCall(4, 'comptal_create_transaction', { body: { account_id: 1 } });
    assert.equal(out.status, 422);
    assert.equal(out.isError, true);
  });

  it('dry_run simule la creation sans ecrire', async () => {
    const before = (testDb.db.prepare('SELECT count(*) AS n FROM transactions').get() as { n: number }).n;
    const out = await toolCall(5, 'comptal_create_transaction', {
      body: { account_id: 1, date: '2026-02-01', credit: 30, label: 'Dry run' },
      dry_run: true,
    });
    assert.equal(out.status, 200);
    const after = (testDb.db.prepare('SELECT count(*) AS n FROM transactions').get() as { n: number }).n;
    assert.equal(after, before);
    assert.ok(out.payload['dry_run'] !== undefined);
  });

  it('comptal_delete_account sans confirm -> 400, avec confirm -> 200', async () => {
    testDb.db.prepare("INSERT INTO accounts (code, name) VALUES ('TMP', 'Temporaire')").run();
    const tmpId = (testDb.db.prepare("SELECT id FROM accounts WHERE code = 'TMP'").get() as { id: number }).id;
    const refused = await toolCall(6, 'comptal_delete_account', { id: tmpId });
    assert.equal(refused.status, 400);
    const ok = await toolCall(7, 'comptal_delete_account', { id: tmpId, confirm: true });
    assert.equal(ok.status, 200);
  });

  it('comptal_create_category_group cree un regroupement', async () => {
    const out = await toolCall(9, 'comptal_create_category_group', { body: { name: 'Loisirs MCP', color: '#22c55e' } });
    assert.equal(out.status, 201);
    const group = out.payload['categoryGroup'] as Record<string, unknown>;
    assert.equal(group['name'], 'Loisirs MCP');
    assert.equal(group['sort_order'], 1);
  });

  it('comptal_delete_contact sans confirm -> 400, avec confirm -> 200', async () => {
    const created = await toolCall(10, 'comptal_create_contact', { body: { nom: 'MCP Suppr' } });
    assert.equal(created.status, 201);
    const id = created.payload['id'] as string;
    const refused = await toolCall(11, 'comptal_delete_contact', { id });
    assert.equal(refused.status, 400);
    const ok = await toolCall(12, 'comptal_delete_contact', { id, confirm: true });
    assert.equal(ok.status, 200);
    assert.equal(ok.payload['deleted'], 'hard');
  });

  it('comptal_apply_label_rules applique les regles actives', async () => {
    await toolCall(13, 'comptal_create_label_rule', { body: { word: 'courses mcp', categoryCode: 'ALIM' } });
    const out = await toolCall(14, 'comptal_apply_label_rules', {});
    assert.equal(out.status, 200);
    assert.equal(out.payload['applied'], 1, 'la transaction Courses MCP est categorisee');
    const tx = testDb.db.prepare("SELECT category_code FROM transactions WHERE label = 'Courses MCP'").get() as { category_code: string };
    assert.equal(tx.category_code, 'ALIM');
  });

  it('outil inconnu -> erreur -32602', async () => {
    const res = await handleMessage(testDb.db, TEST_TOKEN, {
      jsonrpc: '2.0',
      id: 8,
      method: 'tools/call',
      params: { name: 'outil_fantome', arguments: {}, _meta: { token: TEST_TOKEN } },
    }) as unknown as RpcResponse;
    assert.ok(res.error);
    assert.equal(res.error.code, -32602);
  });
});

describe('MCP : process stdio (integration)', () => {
  let testDb: TestDb;
  let child: ReturnType<typeof spawn> | null = null;

  before(() => {
    testDb = createTestDb();
  });
  after(() => {
    if (child !== null && child.exitCode === null) {
      child.kill();
    }
    testDb.cleanup();
  });

  it('le process repond a initialize puis tools/call sur stdout', async () => {
    child = spawn(process.execPath, ['src/mcp.ts'], {
      cwd: fileURLToPath(new URL('..', import.meta.url)),
      env: { ...process.env, COMPTAL_AGENT_TOKEN: TEST_TOKEN, COMPTAL_DB_PATH: testDb.dbPath },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const lines: string[] = [];
    let stdoutData = '';
    child.stdout!.setEncoding('utf8');
    child.stdout!.on('data', (chunk: string) => {
      stdoutData += chunk;
      let index = stdoutData.indexOf('\n');
      while (index !== -1) {
        lines.push(stdoutData.slice(0, index));
        stdoutData = stdoutData.slice(index + 1);
        index = stdoutData.indexOf('\n');
      }
    });
    const stderrChunks: string[] = [];
    child.stderr!.on('data', (chunk: Buffer) => stderrChunks.push(String(chunk)));

    const waitForLine = (predicate: (parsed: RpcResponse) => boolean, timeoutMs = 10_000): Promise<RpcResponse> => {
      return new Promise((resolve, reject) => {
        const started = Date.now();
        const timer = setInterval(() => {
          for (const line of lines) {
            try {
              const parsed = JSON.parse(line) as RpcResponse;
              if (predicate(parsed)) {
                clearInterval(timer);
                resolve(parsed);
                return;
              }
            } catch {
              // ligne partielle : ignoree
            }
          }
          if (Date.now() - started > timeoutMs) {
            clearInterval(timer);
            reject(new Error(`Timeout MCP stdio. stderr: ${stderrChunks.join('')}`));
          }
        }, 50);
      });
    };

    child.stdin!.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } }) + '\n');
    const init = await waitForLine((r) => r.id === 1);
    assert.ok(init.result);
    assert.equal((init.result!['serverInfo'] as Record<string, unknown>)['name'], 'comptal21-agent-api-mcp');

    child.stdin!.write(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'comptal_create_transaction',
          arguments: { body: { account_id: 1, date: '2026-03-10', credit: 42, label: 'Via stdio' } },
          _meta: { token: TEST_TOKEN },
        },
      }) + '\n'
    );
    const created = await waitForLine((r) => r.id === 2);
    const content = created.result!['content'] as Array<{ text: string }>;
    const payload = JSON.parse(content[0]!.text) as Record<string, unknown>;
    assert.equal(payload['status'], 201);

    child.stdin!.end();
    await new Promise((resolve) => setTimeout(resolve, 100));
  });
});
