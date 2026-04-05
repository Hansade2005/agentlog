import http from 'node:http';
import { openDb, getSessions, getFileEvents, getShellEvents, getStats, resolveSession, getAllSessionData } from './db.js';
import { shortPath, agentLabel, formatDuration } from './utils.js';
import { isWatcherRunning } from './commands/run.js';
import { createTwoFilesPatch } from 'diff';
import { DASHBOARD_HTML } from './dashboard.js';

export async function createServer(cwd, port) {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${port}`);
    const pathname = url.pathname;

    // CORS for dev
    res.setHeader('Access-Control-Allow-Origin', '*');

    try {
      if (pathname === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(getDashboardHTML(port));
        return;
      }

      if (pathname === '/api/status') {
        const running = isWatcherRunning(cwd);
        const db = await openDb(cwd);
        let active = null;
        if (running) {
          const session = db.get('SELECT * FROM sessions WHERE id = ?', running.sessionId);
          if (session) {
            const events = getFileEvents(db, session.id);
            active = { ...session, pid: running.pid, eventCount: events.length };
          }
        }
        db.close();
        json(res, { recording: !!running, active });
        return;
      }

      if (pathname === '/api/sessions') {
        const limit = parseInt(url.searchParams.get('limit') || '50', 10);
        const agent = url.searchParams.get('agent') || undefined;
        const tag = url.searchParams.get('tag') || undefined;
        const db = await openDb(cwd);
        const sessions = getSessions(db, { limit, agent, tag });
        db.close();
        json(res, sessions);
        return;
      }

      if (pathname === '/api/stats') {
        const db = await openDb(cwd);
        const stats = getStats(db);
        db.close();
        json(res, { ...stats, cwd });
        return;
      }

      if (pathname.startsWith('/api/session/')) {
        const id = pathname.split('/')[3];
        const db = await openDb(cwd);
        const session = resolveSession(db, id);
        if (session.error) { db.close(); json(res, { error: session.error }, 404); return; }
        const fileEvents = getFileEvents(db, session.id);
        const shellEvents = getShellEvents(db, session.id);
        db.close();

        // Compute diffs
        const files = [];
        const fileMap = new Map();
        for (const e of fileEvents) fileMap.set(e.file_path, e);

        for (const [fp, evt] of fileMap) {
          const rel = shortPath(fp, session.cwd);
          let diff = null;
          if (!evt.is_binary && (evt.snapshot_before || evt.snapshot_after)) {
            diff = createTwoFilesPatch(rel, rel, evt.snapshot_before || '', evt.snapshot_after || '', 'before', 'after');
          }
          files.push({
            path: rel,
            type: evt.event_type,
            isBinary: !!evt.is_binary,
            fileSize: evt.file_size,
            diff,
            timestamp: evt.occurred_at,
          });
        }

        json(res, {
          session,
          files,
          commands: shellEvents,
          totalEvents: fileEvents.length,
        });
        return;
      }

      if (pathname === '/api/events/live') {
        // SSE endpoint for live updates
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        });

        const interval = setInterval(async () => {
          try {
            const running = isWatcherRunning(cwd);
            const db = await openDb(cwd);
            let data = { recording: false };
            if (running) {
              const session = db.get('SELECT * FROM sessions WHERE id = ?', running.sessionId);
              if (session) {
                const events = getFileEvents(db, session.id);
                const recent = events.slice(-10).map((e) => ({
                  type: e.event_type,
                  path: shortPath(e.file_path, session.cwd),
                  timestamp: e.occurred_at,
                  isBinary: !!e.is_binary,
                }));
                data = { recording: true, sessionId: session.id, agent: session.agent, eventCount: events.length, recent };
              }
            }
            db.close();
            res.write(`data: ${JSON.stringify(data)}\n\n`);
          } catch {
            // DB busy
          }
        }, 1500);

        req.on('close', () => clearInterval(interval));
        return;
      }

      res.writeHead(404);
      res.end('Not found');
    } catch (err) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: err.message }));
    }
  });

  return new Promise((resolve) => {
    server.listen(port, () => resolve(server));
  });
}

function json(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function getDashboardHTML(port) {
  return DASHBOARD_HTML;
}
