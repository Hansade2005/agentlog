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
  tags       TEXT DEFAULT '',
  notes      TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS file_events (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id      TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  event_type      TEXT NOT NULL,
  file_path       TEXT NOT NULL,
  snapshot_before TEXT,
  snapshot_after  TEXT,
  file_size       INTEGER DEFAULT 0,
  is_binary       INTEGER DEFAULT 0,
  occurred_at     INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS shell_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id  TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  command     TEXT NOT NULL,
  cwd         TEXT NOT NULL,
  occurred_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_file_events_session   ON file_events(session_id);
CREATE INDEX IF NOT EXISTS idx_file_events_path      ON file_events(file_path);
CREATE INDEX IF NOT EXISTS idx_shell_events_session  ON shell_events(session_id);
CREATE INDEX IF NOT EXISTS idx_sessions_started      ON sessions(started_at);
CREATE INDEX IF NOT EXISTS idx_sessions_agent        ON sessions(agent);
`;

// ─── Migrations (additive only) ──────────────────────────────────────

const MIGRATIONS = [
  // v1.1: add tags, notes, file_size, is_binary columns if missing
  `ALTER TABLE sessions ADD COLUMN tags TEXT DEFAULT ''`,
  `ALTER TABLE sessions ADD COLUMN notes TEXT DEFAULT ''`,
  `ALTER TABLE file_events ADD COLUMN file_size INTEGER DEFAULT 0`,
  `ALTER TABLE file_events ADD COLUMN is_binary INTEGER DEFAULT 0`,
];

function runMigrations(db) {
  for (const sql of MIGRATIONS) {
    try {
      db.exec(sql);
    } catch {
      // Column/index already exists — ignore
    }
  }
}

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
  runMigrations(db);
  return db;
}

// ─── Sessions ────────────────────────────────────────────────────────

export function createSession(db, { id, agent, cwd, tags }) {
  const stmt = db.prepare(
    `INSERT INTO sessions (id, agent, cwd, started_at, tags) VALUES (?, ?, ?, ?, ?)`
  );
  stmt.run(id, agent, cwd, Date.now(), tags || '');
}

export function endSession(db, id, exitCode) {
  const stmt = db.prepare(
    `UPDATE sessions SET ended_at = ?, exit_code = ? WHERE id = ?`
  );
  stmt.run(Date.now(), exitCode ?? 0, id);
}

export function updateSessionTags(db, id, tags) {
  const stmt = db.prepare(`UPDATE sessions SET tags = ? WHERE id = ?`);
  stmt.run(tags, id);
}

export function updateSessionNotes(db, id, notes) {
  const stmt = db.prepare(`UPDATE sessions SET notes = ? WHERE id = ?`);
  stmt.run(notes, id);
}

export function deleteSession(db, id) {
  db.prepare(`DELETE FROM file_events WHERE session_id = ?`).run(id);
  db.prepare(`DELETE FROM shell_events WHERE session_id = ?`).run(id);
  db.prepare(`DELETE FROM sessions WHERE id = ?`).run(id);
}

export function getSessions(db, { limit = 20, agent, tag, since, until } = {}) {
  let sql = `
    SELECT
      s.*,
      (SELECT COUNT(*) FROM file_events  WHERE session_id = s.id) AS file_count,
      (SELECT COUNT(*) FROM shell_events WHERE session_id = s.id) AS shell_count
    FROM sessions s
    WHERE 1=1
  `;
  const params = [];

  if (agent) {
    sql += ` AND s.agent = ?`;
    params.push(agent);
  }
  if (tag) {
    sql += ` AND (',' || s.tags || ',') LIKE ?`;
    params.push(`%,${tag},%`);
  }
  if (since) {
    sql += ` AND s.started_at >= ?`;
    params.push(since);
  }
  if (until) {
    sql += ` AND s.started_at <= ?`;
    params.push(until);
  }

  sql += ` ORDER BY s.started_at DESC LIMIT ?`;
  params.push(limit);

  return db.prepare(sql).all(...params);
}

export function getSession(db, id) {
  return db.prepare(`SELECT * FROM sessions WHERE id = ?`).get(id);
}

export function getSessionByShortId(db, shortId) {
  const rows = db.prepare(`SELECT * FROM sessions WHERE id LIKE ? COLLATE NOCASE`).all(shortId + '%');
  if (rows.length === 1) return rows[0];
  if (rows.length > 1) return { ambiguous: true, matches: rows };
  return null;
}

export function getActiveSession(db, cwd) {
  return db.prepare(
    `SELECT * FROM sessions WHERE cwd = ? AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1`
  ).get(cwd);
}

// ─── File Events ─────────────────────────────────────────────────────

export function recordFileEvent(db, { sessionId, type, filePath, before, after, fileSize, isBinary }) {
  const stmt = db.prepare(`
    INSERT INTO file_events (session_id, event_type, file_path, snapshot_before, snapshot_after, file_size, is_binary, occurred_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(sessionId, type, filePath, before ?? null, after ?? null, fileSize ?? 0, isBinary ? 1 : 0, Date.now());
}

export function recordFileEventBatch(db, events) {
  const stmt = db.prepare(`
    INSERT INTO file_events (session_id, event_type, file_path, snapshot_before, snapshot_after, file_size, is_binary, occurred_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertMany = db.transaction((rows) => {
    for (const e of rows) {
      stmt.run(e.sessionId, e.type, e.filePath, e.before ?? null, e.after ?? null, e.fileSize ?? 0, e.isBinary ? 1 : 0, Date.now());
    }
  });
  insertMany(events);
}

export function getFileEvents(db, sessionId) {
  return db.prepare(
    `SELECT * FROM file_events WHERE session_id = ? ORDER BY occurred_at ASC`
  ).all(sessionId);
}

// ─── Shell Events ────────────────────────────────────────────────────

export function recordShellEvent(db, { sessionId, command, cwd }) {
  db.prepare(
    `INSERT INTO shell_events (session_id, command, cwd, occurred_at) VALUES (?, ?, ?, ?)`
  ).run(sessionId, command, cwd, Date.now());
}

export function getShellEvents(db, sessionId) {
  return db.prepare(
    `SELECT * FROM shell_events WHERE session_id = ? ORDER BY occurred_at ASC`
  ).all(sessionId);
}

// ─── Aggregated query (for AI query + export) ────────────────────────

export function getAllSessionData(db, limit = 20) {
  const sessions = getSessions(db, { limit });
  return sessions.map((s) => {
    const files = db.prepare(
      `SELECT event_type, file_path, file_size, is_binary, occurred_at FROM file_events WHERE session_id = ? ORDER BY occurred_at ASC`
    ).all(s.id);
    const commands = db.prepare(
      `SELECT command, cwd, occurred_at FROM shell_events WHERE session_id = ? ORDER BY occurred_at ASC`
    ).all(s.id);
    return { ...s, files, commands };
  });
}

// ─── Stats ───────────────────────────────────────────────────────────

export function getStats(db) {
  const totalSessions = db.prepare(`SELECT COUNT(*) AS count FROM sessions`).get().count;
  const totalFileEvents = db.prepare(`SELECT COUNT(*) AS count FROM file_events`).get().count;
  const totalShellEvents = db.prepare(`SELECT COUNT(*) AS count FROM shell_events`).get().count;
  const agents = db.prepare(`SELECT agent, COUNT(*) AS count FROM sessions GROUP BY agent ORDER BY count DESC`).all();
  const topFiles = db.prepare(
    `SELECT file_path, COUNT(*) AS count FROM file_events GROUP BY file_path ORDER BY count DESC LIMIT 10`
  ).all();
  const firstSession = db.prepare(`SELECT MIN(started_at) AS ts FROM sessions`).get();
  const lastSession = db.prepare(`SELECT MAX(started_at) AS ts FROM sessions`).get();
  const avgDuration = db.prepare(
    `SELECT AVG(ended_at - started_at) AS avg FROM sessions WHERE ended_at IS NOT NULL`
  ).get();
  const totalSize = db.prepare(`SELECT SUM(file_size) AS total FROM file_events`).get();
  const binaryCount = db.prepare(`SELECT COUNT(*) AS count FROM file_events WHERE is_binary = 1`).get().count;
  const eventsByType = db.prepare(
    `SELECT event_type, COUNT(*) AS count FROM file_events GROUP BY event_type ORDER BY count DESC`
  ).all();

  return {
    totalSessions,
    totalFileEvents,
    totalShellEvents,
    agents,
    topFiles,
    firstSession: firstSession?.ts,
    lastSession: lastSession?.ts,
    avgDuration: avgDuration?.avg,
    totalSize: totalSize?.total || 0,
    binaryCount,
    eventsByType,
  };
}

// ─── Pruning ─────────────────────────────────────────────────────────

export function pruneSessions(db, keepCount) {
  const excess = db.prepare(`
    SELECT id FROM sessions ORDER BY started_at DESC LIMIT -1 OFFSET ?
  `).all(keepCount);

  if (excess.length === 0) return 0;

  const del = db.transaction((ids) => {
    for (const { id } of ids) {
      deleteSession(db, id);
    }
  });
  del(excess);
  return excess.length;
}

// ─── Resolution ──────────────────────────────────────────────────────

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
