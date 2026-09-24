// Logger central Comptal2.1 — règle .cursor/rules/comptal21-logs.mdc
// 1 fichier JSONL par session et par type : logs/AAAA-MM-JJ_HH-mm-ss_(type).jsonl
// 1 ligne = 1 événement JSON avec tag séquentiel [LOG1], [LOG2], ...
import { isTauriAvailable, tauriBridge, SessionInfo } from './tauri';

export type LogType = 'app' | 'error' | 'data' | 'perf';
export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
export type LogEvent = 'start' | 'end' | 'error' | 'info';

interface LogEntry {
  tag: string;
  ts: string;
  level: LogLevel;
  fn: string;
  event: LogEvent;
  msg: string;
  durationMs?: number;
  data?: unknown;
  stack?: string;
}

let session: SessionInfo | null = null;
let seq = 0;
let writeChain: Promise<void> = Promise.resolve();
const preInitBuffer: Array<{ type: LogType; entry: LogEntry }> = [];
let writeFailureReported = false;

function buildEntry(
  level: LogLevel,
  fn: string,
  event: LogEvent,
  msg: string,
  extra?: Partial<Pick<LogEntry, 'durationMs' | 'data' | 'stack'>>
): LogEntry {
  seq += 1;
  return {
    tag: `[LOG${seq}]`,
    ts: new Date().toISOString(),
    level,
    fn,
    event,
    msg,
    ...(extra?.durationMs !== undefined ? { durationMs: Math.round(extra.durationMs) } : {}),
    ...(extra?.data !== undefined ? { data: extra.data } : {}),
    ...(extra?.stack ? { stack: extra.stack } : {}),
  };
}

function enqueueWrite(type: LogType, entry: LogEntry): void {
  if (!session) {
    preInitBuffer.push({ type, entry });
    return;
  }
  if (!isTauriAvailable()) {
    return;
  }
  const file = `logs/${session.sessionId}_(${type}).jsonl`;
  const line = JSON.stringify(entry);
  // Chaîne de promesses : préserve l'ordre des lignes sans bloquer l'appelant
  writeChain = writeChain
    .then(() => tauriBridge.appendTextLine(file, line))
    .catch((err) => {
      if (!writeFailureReported) {
        writeFailureReported = true;
        console.warn('[logger] Écriture du log impossible:', err);
      }
    });
}

export const Logger = {
  /** À appeler une fois au démarrage, avant tout le reste. */
  async init(): Promise<SessionInfo> {
    try {
      session = await tauriBridge.getSessionInfo();
    } catch {
      const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
      session = {
        sessionId: `${stamp}_browser`,
        dataRoot: '',
        appVersion: '2.1.2',
        dev: true,
      };
    }
    for (const buffered of preInitBuffer) {
      enqueueWrite(buffered.type, buffered.entry);
    }
    preInitBuffer.length = 0;
    this.info('Logger.init', `Session ${session.sessionId} — Comptal2.1 v${session.appVersion}`, {
      dev: session.dev,
      tauri: isTauriAvailable(),
    });
    return session;
  },

  get session(): SessionInfo | null {
    return session;
  },

  /** Log d'activation de fonction. Retourne le timestamp de départ pour end(). */
  start(fn: string, msg = 'activation', data?: unknown): number {
    enqueueWrite('app', buildEntry('INFO', fn, 'start', msg, { data }));
    return performance.now();
  },

  /** Log de fin de fonction avec durée. */
  end(fn: string, startedAt: number, msg = 'fin', data?: unknown): void {
    enqueueWrite(
      'app',
      buildEntry('INFO', fn, 'end', msg, { durationMs: performance.now() - startedAt, data })
    );
  },

  info(fn: string, msg: string, data?: unknown): void {
    enqueueWrite('app', buildEntry('INFO', fn, 'info', msg, { data }));
  },

  warn(fn: string, msg: string, data?: unknown): void {
    enqueueWrite('app', buildEntry('WARN', fn, 'info', msg, { data }));
  },

  /** Erreur attrapée : fichier (error) avec message + stack. */
  error(fn: string, err: unknown, msg?: string): void {
    const e = err instanceof Error ? err : new Error(String(err));
    enqueueWrite(
      'error',
      buildEntry('ERROR', fn, 'error', msg ? `${msg}: ${e.message}` : e.message, {
        stack: e.stack,
      })
    );
  },

  /** Opérations de lecture/écriture de données : fichier (data). */
  data(fn: string, msg: string, data?: unknown): void {
    enqueueWrite('data', buildEntry('INFO', fn, 'info', msg, { data }));
  },

  /** Mesures de performance : fichier (perf). */
  perf(fn: string, msg: string, durationMs: number, data?: unknown): void {
    enqueueWrite('perf', buildEntry('INFO', fn, 'info', msg, { durationMs, data }));
  },
};

/**
 * Enveloppe une fonction significative avec les logs obligatoires
 * start / end / error (règle comptal21-logs).
 */
export async function withLog<T>(
  fnName: string,
  run: () => Promise<T>,
  options?: { msg?: string; data?: unknown }
): Promise<T> {
  const startedAt = Logger.start(fnName, options?.msg ?? 'activation', options?.data);
  try {
    const result = await run();
    Logger.end(fnName, startedAt);
    return result;
  } catch (err) {
    Logger.error(fnName, err);
    Logger.end(fnName, startedAt, 'fin (erreur)');
    throw err;
  }
}
