import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,
  agent      TEXT NOT NULL,
  cwd        TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  ended_at   INTEGER,
  exit_code  INTEGER,
  notes      TEXT
);

CREATE TABLE IF NOT EXISTS file_events (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id      TEXT NOT NULL REFERENCES sessions(id),
  event_type      TEXT NOT NULL,
  file_path       TEXT NOT NULL,
  snapshot_before TEXT,
  snapshot_after  TEXT,
  occurred_at     INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS shell_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id  TEXT NOT NULL REFERENCES sessions(id),
  command     TEXT NOT NULL,
  cwd         TEXT NOT NULL,
  occurred_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_file_events_session  ON file_events(session_id);
CREATE INDEX IF NOT EXISTS idx_shell_events_session ON shell_events(session_id);
`;

/**
 * Open (or create) the SQLite database.
 * Prefers project-local .agentlog/sessions.db, falls back to ~/.agentlog/sessions.db.
 */
export function openDb(cwd) {
  const localDir = path.join(cwd, '.agentlog');
  let dbPath;

  if (fs.existsSync(localDir)) {
    dbPath = path.join(localDir, 'sessions.db');
  } else {
    const globalDir = path.join(os.homedir(), '.agentlog');
    fs.mkdirSync(globalDir, { recursive: true });
    dbPath = path.join(globalDir, 'sessions.db');
  }

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  return db;
}

// ─── Sessions ────────────────────────────────────────────────────────

export function createSession(db, { id, agent, cwd }) {
  const stmt = db.prepare(
    `INSERT INTO sessions (id, agent, cwd, started_at) VALUES (?, ?, ?, ?)`
  );
  stmt.run(id, agent, cwd, Date.now());
}

export function endSession(db, id, exitCode) {
  const stmt = db.prepare(
    `UPDATE sessions SET ended_at = ?, exit_code = ? WHERE id = ?`
  );
  stmt.run(Date.now(), exitCode ?? 0, id);
}

export function getSessions(db, limit = 20) {
  const stmt = db.prepare(`
    SELECT
      s.*,
      (SELECT COUNT(*) FROM file_events  WHERE session_id = s.id) AS file_count,
      (SELECT COUNT(*) FROM shell_events WHERE session_id = s.id) AS shell_count
    FROM sessions s
    ORDER BY s.started_at DESC
    LIMIT ?
  `);
  return stmt.all(limit);
}

export function getSession(db, id) {
  const stmt = db.prepare(`SELECT * FROM sessions WHERE id = ?`);
  return stmt.get(id);
}

export function getSessionByShortId(db, shortId) {
  const stmt = db.prepare(`SELECT * FROM sessions WHERE id LIKE ?`);
  const rows = stmt.all(shortId + '%');
  if (rows.length === 1) return rows[0];
  if (rows.length > 1) return { ambiguous: true, matches: rows };
  return null;
}

// ─── File Events ─────────────────────────────────────────────────────

export function recordFileEvent(db, { sessionId, type, filePath, before, after }) {
  const stmt = db.prepare(`
    INSERT INTO file_events (session_id, event_type, file_path, snapshot_before, snapshot_after, occurred_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  stmt.run(sessionId, type, filePath, before ?? null, after ?? null, Date.now());
}

export function getFileEvents(db, sessionId) {
  const stmt = db.prepare(
    `SELECT * FROM file_events WHERE session_id = ? ORDER BY occurred_at ASC`
  );
  return stmt.all(sessionId);
}

// ─── Shell Events ────────────────────────────────────────────────────

export function recordShellEvent(db, { sessionId, command, cwd }) {
  const stmt = db.prepare(
    `INSERT INTO shell_events (session_id, command, cwd, occurred_at) VALUES (?, ?, ?, ?)`
  );
  stmt.run(sessionId, command, cwd, Date.now());
}

export function getShellEvents(db, sessionId) {
  const stmt = db.prepare(
    `SELECT * FROM shell_events WHERE session_id = ? ORDER BY occurred_at ASC`
  );
  return stmt.all(sessionId);
}

// ─── Aggregated query (for AI query command) ─────────────────────────

export function getAllSessionData(db, limit = 20) {
  const sessions = getSessions(db, limit);
  return sessions.map((s) => {
    const files = db
      .prepare(
        `SELECT event_type, file_path, occurred_at FROM file_events WHERE session_id = ? ORDER BY occurred_at ASC`
      )
      .all(s.id);
    const commands = db
      .prepare(
        `SELECT command, cwd, occurred_at FROM shell_events WHERE session_id = ? ORDER BY occurred_at ASC`
      )
      .all(s.id);
    return { ...s, files, commands };
  });
}

/**
 * Resolve a session by exact ID or prefix match. Returns session or exits.
 */
export function resolveSession(db, idInput) {
  let session = getSession(db, idInput);
  if (session) return session;

  const result = getSessionByShortId(db, idInput);
  if (result && result.ambiguous) {
    return { error: `Ambiguous ID "${idInput}" matches ${result.matches.length} sessions: ${result.matches.map((r) => r.id).join(', ')}` };
  }
  if (!result) {
    return { error: `No session found matching "${idInput}".` };
  }
  return result;
}
