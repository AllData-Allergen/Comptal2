// Serveur HTTP local pour agents IA — Comptal2.1.
// - Ecoute sur 127.0.0.1 uniquement.
// - Toutes les routes sauf GET /health exigent Authorization: Bearer $COMPTAL_AGENT_TOKEN.
// - Les ecritures supportent dry_run (diff prevu, rien n'est ecrit) et sont journalisees
//   dans audit_log (append-only) dans la meme transaction que l'ecriture.
import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { loadConfig, type AgentApiConfig } from './config.ts';
import { openDb } from './db.ts';
import { HttpError, requireAuth, sendJson } from './http.ts';
import { registerRoutes, type RouteContext, type RouteHandler } from './routes.ts';

interface MatchedRoute {
  handler: RouteHandler;
  params: Record<string, string>;
}

function matchRoute(
  routes: ReturnType<typeof registerRoutes>,
  method: string,
  pathname: string
): MatchedRoute | undefined {
  for (const route of routes) {
    if (route.method !== method) continue;
    const match = route.pattern.exec(pathname);
    if (match) {
      return { handler: route.handler, params: match.groups ?? {} };
    }
  }
  return undefined;
}

export function createAgentServer(config: AgentApiConfig) {
  const db = openDb(config.dbPath);
  const routes = registerRoutes(db);

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', `http://${config.host}`);
    const pathname = decodeURIComponent(url.pathname);
    try {
      // /health est volontairement sans auth : il ne revele rien (ping applicatif).
      if (req.method === 'GET' && pathname === '/health') {
        sendJson(res, 200, { ok: true, service: 'comptal21-agent-api' });
        return;
      }

      requireAuth(req, config.token);

      const matched = matchRoute(routes, req.method ?? 'GET', pathname);
      if (!matched) {
        sendJson(res, 404, { error: 'Route inconnue', method: req.method, path: pathname });
        return;
      }

      const ctx: RouteContext = {
        db,
        params: matched.params,
        query: url.searchParams,
        req,
        res,
        actor: 'agent-api',
      };
      await matched.handler(ctx);
    } catch (err) {
      if (err instanceof HttpError) {
        sendJson(res, err.status, { error: err.message });
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      // Contrainte d'unicite SQLite -> 409, sinon 500.
      if (/UNIQUE constraint failed/i.test(message)) {
        sendJson(res, 409, { error: 'Conflit : la valeur existe deja', detail: message });
        return;
      }
      sendJson(res, 500, { error: 'Erreur interne', detail: message });
    }
  });

  return { server, db };
}

function main(): void {
  let config: AgentApiConfig;
  try {
    config = loadConfig();
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
  const { server } = createAgentServer(config);
  server.listen(config.port, config.host, () => {
    console.log(`comptal21-agent-api en ecoute sur http://${config.host}:${config.port} (base: ${config.dbPath})`);
  });
}

// Demarrage direct : node src/server.ts
if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('src/server.ts')) {
  main();
}
