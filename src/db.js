import initSqlJs from 'sql.js';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

let SQL = null;

async function getSqlJs() {
  if (!SQL) {
    SQL = await initSqlJs();
  }
  return SQL;
}

// ─── Thin wrapper around sql.js to match better-sqlite3-style API ────

class DatabaseWrapper {
  constructor(sqlDb, dbPath) {
    this._db = sqlDb;
    this._path = dbPath;
  }

  run(sql, ...params) {
    this._db.run(sql, params.flat());
    this._save();
  }

  exec(sql) {
    this._db.run(sql);
    this._save();
  }

  get(sql, ...params) {
    const stmt = this._db.prepare(sql);
    stmt.bind(params.flat());
    let row = null;
    if (stmt.step()) {
      row = stmt.getAsObject();
    }
    stmt.free();
    return row || undefined;
  }

  all(sql, ...params) {
    const stmt = this._db.prepare(sql);
    stmt.bind(params.flat());
    const rows = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
    stmt.free();
    return rows;
  }

  _save() {
    const data = this._db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(this._path, buffer);
  }

  close() {
    this._save();
    this._db.close();
  }
}

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

const MIGRATIONS = [
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
      // Column already exists — ignore
    }
  }
}

/**
 * Open (or create) the SQLite database.
 * Now async because sql.js requires WASM initialization.
 */
export async function openDb(cwd) {
  const SqlJs = await getSqlJs();

  const localDir = path.join(cwd, '.agentlog');
  let dbPath;

  if (fs.existsSync(localDir)) {
    dbPath = path.join(localDir, 'sessions.db');
  } else {
    const globalDir = path.join(os.homedir(), '.agentlog');
    fs.mkdirSync(globalDir, { recursive: true });
    dbPath = path.join(globalDir, 'sessions.db');
  }

  let sqlDb;
  if (fs.existsSync(dbPath)) {
    const buffer = fs.readFileSync(dbPath);
    sqlDb = new SqlJs.Database(buffer);
  } else {
    sqlDb = new SqlJs.Database();
  }

  const db = new DatabaseWrapper(sqlDb, dbPath);

  // Schema + migrations (use raw _db for DDL to avoid excessive saves)
  for (const stmt of SCHEMA.split(';').filter((s) => s.trim())) {
    try { sqlDb.run(stmt + ';'); } catch { /* already exists */ }
  }
  sqlDb.run('PRAGMA foreign_keys = ON;');
  for (const sql of MIGRATIONS) {
    try { sqlDb.run(sql); } catch { /* already exists */ }
  }
  // Save after schema setup
  db._save();

  return db;
}

// ─── Sessions ────────────────────────────────────────────────────────

export function createSession(db, { id, agent, cwd, tags }) {
  db.run(
    `INSERT INTO sessions (id, agent, cwd, started_at, tags) VALUES (?, ?, ?, ?, ?)`,
    id, agent, cwd, Date.now(), tags || ''
  );
}

export function endSession(db, id, exitCode) {
  db.run(
    `UPDATE sessions SET ended_at = ?, exit_code = ? WHERE id = ?`,
    Date.now(), exitCode ?? 0, id
  );
}

export function updateSessionTags(db, id, tags) {
  db.run(`UPDATE sessions SET tags = ? WHERE id = ?`, tags, id);
}

export function updateSessionNotes(db, id, notes) {
  db.run(`UPDATE sessions SET notes = ? WHERE id = ?`, notes, id);
}

export function deleteSession(db, id) {
  db.run(`DELETE FROM file_events WHERE session_id = ?`, id);
  db.run(`DELETE FROM shell_events WHERE session_id = ?`, id);
  db.run(`DELETE FROM sessions WHERE id = ?`, id);
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

  return db.all(sql, ...params);
}

export function getSession(db, id) {
  return db.get(`SELECT * FROM sessions WHERE id = ?`, id);
}

export function getSessionByShortId(db, shortId) {
  const rows = db.all(`SELECT * FROM sessions WHERE id LIKE ? COLLATE NOCASE`, shortId + '%');
  if (rows.length === 1) return rows[0];
  if (rows.length > 1) return { ambiguous: true, matches: rows };
  return null;
}

export function getActiveSession(db, cwd) {
  return db.get(
    `SELECT * FROM sessions WHERE cwd = ? AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1`,
    cwd
  );
}

// ─── File Events ─────────────────────────────────────────────────────

export function recordFileEvent(db, { sessionId, type, filePath, before, after, fileSize, isBinary }) {
  db.run(
    `INSERT INTO file_events (session_id, event_type, file_path, snapshot_before, snapshot_after, file_size, is_binary, occurred_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    sessionId, type, filePath, before ?? null, after ?? null, fileSize ?? 0, isBinary ? 1 : 0, Date.now()
  );
}

export function getFileEvents(db, sessionId) {
  return db.all(
    `SELECT * FROM file_events WHERE session_id = ? ORDER BY occurred_at ASC`,
    sessionId
  );
}

// ─── Shell Events ────────────────────────────────────────────────────

export function recordShellEvent(db, { sessionId, command, cwd }) {
  db.run(
    `INSERT INTO shell_events (session_id, command, cwd, occurred_at) VALUES (?, ?, ?, ?)`,
    sessionId, command, cwd, Date.now()
  );
}

export function getShellEvents(db, sessionId) {
  return db.all(
    `SELECT * FROM shell_events WHERE session_id = ? ORDER BY occurred_at ASC`,
    sessionId
  );
}

// ─── Aggregated query ────────────────────────────────────────────────

export function getAllSessionData(db, limit = 20) {
  const sessions = getSessions(db, { limit });
  return sessions.map((s) => {
    const files = db.all(
      `SELECT event_type, file_path, file_size, is_binary, occurred_at FROM file_events WHERE session_id = ? ORDER BY occurred_at ASC`,
      s.id
    );
    const commands = db.all(
      `SELECT command, cwd, occurred_at FROM shell_events WHERE session_id = ? ORDER BY occurred_at ASC`,
      s.id
    );
    return { ...s, files, commands };
  });
}

// ─── Stats ───────────────────────────────────────────────────────────

export function getStats(db) {
  const totalSessions = db.get(`SELECT COUNT(*) AS count FROM sessions`).count;
  const totalFileEvents = db.get(`SELECT COUNT(*) AS count FROM file_events`).count;
  const totalShellEvents = db.get(`SELECT COUNT(*) AS count FROM shell_events`).count;
  const agents = db.all(`SELECT agent, COUNT(*) AS count FROM sessions GROUP BY agent ORDER BY count DESC`);
  const topFiles = db.all(
    `SELECT file_path, COUNT(*) AS count FROM file_events GROUP BY file_path ORDER BY count DESC LIMIT 10`
  );
  const firstSession = db.get(`SELECT MIN(started_at) AS ts FROM sessions`);
  const lastSession = db.get(`SELECT MAX(started_at) AS ts FROM sessions`);
  const avgDuration = db.get(
    `SELECT AVG(ended_at - started_at) AS avg FROM sessions WHERE ended_at IS NOT NULL`
  );
  const totalSize = db.get(`SELECT SUM(file_size) AS total FROM file_events`);
  const binaryCount = db.get(`SELECT COUNT(*) AS count FROM file_events WHERE is_binary = 1`).count;
  const eventsByType = db.all(
    `SELECT event_type, COUNT(*) AS count FROM file_events GROUP BY event_type ORDER BY count DESC`
  );

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
  const excess = db.all(`SELECT id FROM sessions ORDER BY started_at DESC LIMIT -1 OFFSET ?`, keepCount);
  for (const { id } of excess) {
    deleteSession(db, id);
  }
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
