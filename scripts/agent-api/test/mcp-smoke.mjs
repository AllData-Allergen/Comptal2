/**
 * Smoke test MCP stdio → HTTP (fixture locale).
 */
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const apiRoot = join(__dirname, '..');

await import('./make-fixture.mjs');

const dataRoot = mkdtempSync(join(tmpdir(), 'comptal-mcp-'));
cpSync(join(__dirname, 'fixture-profil'), join(dataRoot, 'profils', 'fixture-profil'), {
  recursive: true,
});

const PORT = 17843;
const TOKEN = 'mcp-test-token';
const env = {
  ...process.env,
  COMPTAL_DATA_ROOT: dataRoot,
  COMPTAL_AGENT_PORT: String(PORT),
  COMPTAL_AGENT_TOKEN: TOKEN,
  COMPTAL_AGENT_READONLY: '0',
  COMPTAL_AGENT_URL: `http://127.0.0.1:${PORT}`,
};

const httpChild = spawn(
  process.execPath,
  ['--experimental-sqlite', join(apiRoot, 'server.mjs')],
  { env, stdio: ['ignore', 'pipe', 'pipe'] }
);

let httpReady = false;
httpChild.stdout.on('data', (b) => {
  if (b.toString().includes('agent_api_listen')) httpReady = true;
});

function waitReady() {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const iv = setInterval(() => {
      if (httpReady) {
        clearInterval(iv);
        resolve();
      } else if (Date.now() - t0 > 8000) {
        clearInterval(iv);
        reject(new Error('HTTP server timeout'));
      }
    }, 50);
  });
}

const mcpChild = spawn(process.execPath, [join(apiRoot, 'mcp-server.mjs')], {
  env,
  stdio: ['pipe', 'pipe', 'pipe'],
});

const responses = new Map();
let buf = '';
mcpChild.stdout.on('data', (chunk) => {
  buf += chunk.toString();
  const lines = buf.split('\n');
  buf = lines.pop() || '';
  for (const line of lines) {
    if (!line.trim()) continue;
    const msg = JSON.parse(line);
    if (msg.id != null) responses.set(msg.id, msg);
  }
});

function rpc(id, method, params = {}) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const iv = setInterval(() => {
      const res = responses.get(id);
      if (res) {
        clearInterval(iv);
        resolve(res);
      } else if (Date.now() - t0 > 5000) {
        clearInterval(iv);
        reject(new Error(`timeout ${method}`));
      }
    }, 30);
    mcpChild.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
}

const failures = [];
function assert(cond, msg) {
  if (!cond) failures.push(msg);
}

try {
  await waitReady();

  const init = await rpc(1, 'initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'mcp-smoke', version: '0' },
  });
  assert(init.result?.serverInfo?.name === 'comptal-agent-mcp', 'initialize');

  const list = await rpc(2, 'tools/list', {});
  const names = list.result?.tools?.map((t) => t.name) || [];
  assert(names.includes('comptal_health'), 'tool health');
  assert(names.includes('comptal_link_payment'), 'tool link when rw');

  const health = await rpc(3, 'tools/call', {
    name: 'comptal_health',
    arguments: {},
  });
  const healthJson = JSON.parse(health.result?.content?.[0]?.text || '{}');
  assert(healthJson.ok === true, 'health call');

  const matches = await rpc(4, 'tools/call', {
    name: 'comptal_suggest_matches',
    arguments: { profileId: 'fixture-profil', factureId: 'fac1' },
  });
  assert(matches.result?.content?.[0]?.text?.includes('matches'), 'suggest matches');

  const ping = await rpc(5, 'ping', {});
  assert(ping.result !== undefined && !ping.error, 'ping');

  if (failures.length) {
    console.error('MCP_FAIL', failures);
    process.exitCode = 1;
  } else {
    console.log('MCP_SMOKE_OK');
  }
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  mcpChild.kill('SIGTERM');
  httpChild.kill('SIGTERM');
  try {
    rmSync(dataRoot, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}
