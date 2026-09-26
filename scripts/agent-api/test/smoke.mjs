/**
 * Smoke test Agent API (fixture locale).
 * Usage: node --experimental-sqlite test/smoke.mjs
 */
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const apiRoot = join(__dirname, '..');

// rebuild fixture
await import('./make-fixture.mjs');

const dataRoot = mkdtempSync(join(tmpdir(), 'comptal-agent-'));
cpSync(join(__dirname, 'fixture-profil'), join(dataRoot, 'profils', 'fixture-profil'), {
  recursive: true,
});

const PORT = 17842;
const TOKEN = 'test-token';
const env = {
  ...process.env,
  COMPTAL_DATA_ROOT: dataRoot,
  COMPTAL_AGENT_PORT: String(PORT),
  COMPTAL_AGENT_TOKEN: TOKEN,
  COMPTAL_AGENT_READONLY: '0',
};

const child = spawn(
  process.execPath,
  ['--experimental-sqlite', join(apiRoot, 'server.mjs')],
  { env, stdio: ['ignore', 'pipe', 'pipe'] }
);

let ready = false;
child.stdout.on('data', (b) => {
  const s = b.toString();
  if (s.includes('agent_api_listen')) ready = true;
  process.stdout.write(s);
});
child.stderr.on('data', (b) => process.stderr.write(b));

function waitReady(ms = 5000) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const iv = setInterval(() => {
      if (ready) {
        clearInterval(iv);
        resolve();
      } else if (Date.now() - t0 > ms) {
        clearInterval(iv);
        reject(new Error('server timeout'));
      }
    }, 50);
  });
}

async function api(path, opts = {}) {
  const res = await fetch(`http://127.0.0.1:${PORT}${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
  const body = await res.json();
  return { status: res.status, body };
}

const failures = [];
function assert(cond, msg) {
  if (!cond) failures.push(msg);
}

try {
  await waitReady();
  const health = await api('/health');
  assert(health.status === 200 && health.body.ok, 'health');

  const profiles = await api('/profiles');
  assert(profiles.body.profiles?.some((p) => p.id === 'fixture-profil'), 'profiles');

  const factures = await api('/profiles/fixture-profil/factures?unpaidOnly=1');
  assert(factures.body.items?.length === 1, 'unpaid factures');

  const matches = await api('/profiles/fixture-profil/factures/fac1/matches');
  assert(matches.body.matches?.length >= 1, 'matches exists');
  assert(
    matches.body.matches.some((m) => m.reason === 'both' || m.reason === 'label'),
    'label/both match for FACT-2026-001'
  );

  const summary = await api('/profiles/fixture-profil/correlate-summary');
  assert(summary.status === 200 && summary.body.unpaidFactures >= 1, 'correlate-summary');

  const link = await api('/profiles/fixture-profil/factures/fac1/link', {
    method: 'POST',
    body: JSON.stringify({ transactionId: 10 }),
  });
  assert(link.status === 200 && link.body.ok, 'link ok');
  assert(link.body.facture?.statut === 'payee', 'statut payee');
  assert(
    link.body.facture?.paiements?.some((p) => String(p.transactionId) === '10'),
    'paiement linked'
  );

  if (failures.length) {
    console.error('FAIL', failures);
    process.exitCode = 1;
  } else {
    console.log('SMOKE_OK');
  }
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  child.kill('SIGTERM');
  try {
    rmSync(dataRoot, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}
