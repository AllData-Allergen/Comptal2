// Helpers HTTP : reponses JSON, lecture du corps, authentification par jeton.
import { IncomingMessage, ServerResponse } from 'node:http';
import { timingSafeEqual } from 'node:crypto';

export const MAX_BODY_BYTES = 1_000_000;

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

export function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new HttpError(413, 'Corps de requete trop volumineux'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (chunks.length === 0) {
        resolve({});
        return;
      }
      try {
        const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
          reject(new HttpError(400, 'Corps JSON attendu : objet'));
          return;
        }
        resolve(parsed as Record<string, unknown>);
      } catch {
        reject(new HttpError(400, 'JSON invalide'));
      }
    });
    req.on('error', (err) => reject(err));
  });
}

/** Compare le jeton fourni au jeton attendu sans fuite de timing. */
export function tokenMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) {
    // Comparaison factice pour garder un temps similaire sur longueurs differentes.
    timingSafeEqual(Buffer.alloc(32, 0), Buffer.alloc(32, 0));
    return false;
  }
  return timingSafeEqual(a, b);
}

/** Extrait et verifie le jeton Bearer. 401 si absent/invalide. */
export function requireAuth(req: IncomingMessage, expectedToken: string): void {
  const header = req.headers.authorization ?? '';
  const match = /^Bearer (.+)$/s.exec(header);
  if (!match || !tokenMatches(match[1] ?? '', expectedToken)) {
    throw new HttpError(401, 'Jeton manquant ou invalide (Authorization: Bearer <COMPTAL_AGENT_TOKEN>)');
  }
}
