// Validite statique de la spec OpenAPI — aucune base, aucune donnee reelle.
// Garde-fou du cycle 5 : les cles de reponses doivent etre des codes HTTP
// (ex. "200"), pas des variantes type "200_dry_run" (invalides en OpenAPI).
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { openDb } from '../src/db.ts';
import { registerRoutes } from '../src/routes.ts';

const specPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'openapi.yaml');
const spec = readFileSync(specPath, 'utf8');

describe('Spec OpenAPI', () => {
  it('les cles de reponses sont des codes HTTP a 3 chiffres (ou $ref)', () => {
    const lines = spec.split(/\r?\n/);
    const invalid: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i]!.match(/^(\s*)"([^"]+)":\s*$/);
      if (!m) continue;
      const key = m[2]!;
      // Cles de reponses : code HTTP ("200", "404"...) ou $ref inline.
      if (/^\d{3}$/.test(key) || key === '$ref') continue;
      // Faux positifs possibles : cles de schemas/parametres. On ne garde que
      // les cles qui ressemblent a une variante de code HTTP (ex. "200_dry_run").
      if (/^\d{3}_/.test(key)) invalid.push(`ligne ${i + 1}: "${key}"`);
    }
    assert.deepEqual(invalid, []);
  });

  it('aucune occurrence de 200_dry_run', () => {
    assert.ok(!spec.includes('200_dry_run'));
  });

  it('chaque route HTTP enregistree est documentee dans paths (et reciproquement)', () => {
    // Routes reelles : registerRoutes() sur une base jetable (aucune donnee reelle).
    const dir = mkdtempSync(join(tmpdir(), 'comptal-agent-api-openapi-'));
    const db = openDb(join(dir, 't.db'));
    try {
      const routes = registerRoutes(db);
      // Paths documentes : "  /xxx:" sous "paths:" -> methodes get/post/patch/delete.
      const documented = new Set<string>();
      let inPaths = false;
      let currentPath: string | null = null;
      for (const line of spec.split(/\r?\n/)) {
        if (/^paths:/.test(line)) { inPaths = true; continue; }
        if (inPaths && /^[a-zA-Z]/.test(line)) inPaths = false;
        if (!inPaths) continue;
        const pathMatch = line.match(/^  (\/[^:]+):$/);
        if (pathMatch) {
          currentPath = pathMatch[1]!;
          continue;
        }
        const methodMatch = line.match(/^    (get|post|patch|delete):$/);
        if (methodMatch && currentPath) documented.add(`${methodMatch[1]!.toUpperCase()} ${currentPath}`);
      }
      // Routes -> patterns regex : on reconstruit le chemin literal
      // (\/imports\/transactions -> /imports/transactions, (?<id>\d+) -> {id}).
      const registered = new Set<string>();
      for (const route of routes) {
        const literal = route.pattern.source
          .replace(/^\^\\\//, '/')
          .replace(/\\\/\(\?<([a-zA-Z]+)>[^)]*\)/g, (_m, name: string) => `/{${name}}`)
          .replace(/\\\//g, '/')
          .replace(/\$$/, '');
        registered.add(`${route.method} ${literal}`);
      }
      const missing: string[] = [];
      for (const r of registered) if (!documented.has(r)) missing.push(`route non documentee : ${r}`);
      const extra: string[] = [];
      for (const d of documented) {
        // /health est gere directement dans server.ts (sans auth, hors registerRoutes).
        if (d === 'GET /health') continue;
        if (!registered.has(d)) extra.push(`path documente sans route : ${d}`);
      }
      assert.deepEqual([...missing, ...extra], []);
    } finally {
      db.close();
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
  });
});
