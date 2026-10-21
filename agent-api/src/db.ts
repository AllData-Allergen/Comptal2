// Ouverture SQLite + journal d'audit append-only.
// L'API ouvre directement la base du profil Comptal2.1 (chemin configurable via COMPTAL_DB_PATH).
import { DatabaseSync } from 'node:sqlite';

export const AUDIT_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT,
  before_json TEXT,
  after_json TEXT
);
CREATE TRIGGER IF NOT EXISTS audit_log_no_update
  BEFORE UPDATE ON audit_log
  BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END;
CREATE TRIGGER IF NOT EXISTS audit_log_no_delete
  BEFORE DELETE ON audit_log
  BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END;
`;

export function openDb(dbPath: string): DatabaseSync {
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(AUDIT_SCHEMA_SQL);
  return db;
}

export interface AuditEntry {
  actor: string;
  action: string;
  entity: string;
  entityId?: string | number | null;
  before?: unknown;
  after?: unknown;
}

/** Insere une entree d'audit. A appeler DANS la meme transaction que l'ecriture. */
export function writeAudit(db: DatabaseSync, entry: AuditEntry): void {
  db.prepare(
    `INSERT INTO audit_log (actor, action, entity, entity_id, before_json, after_json)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    entry.actor,
    entry.action,
    entry.entity,
    entry.entityId === undefined || entry.entityId === null ? null : String(entry.entityId),
    entry.before === undefined ? null : JSON.stringify(entry.before),
    entry.after === undefined ? null : JSON.stringify(entry.after)
  );
}

/** Exécute fn dans une transaction SQLite (BEGIN IMMEDIATE / COMMIT / ROLLBACK). */
export function withTransaction<T>(db: DatabaseSync, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // rollback deja fait ou connexion fermee : on ne masque pas l'erreur d'origine
    }
    throw err;
  }
}
