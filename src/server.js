import http from 'node:http';
import { openDb, getSessions, getFileEvents, getShellEvents, getStats, resolveSession, getAllSessionData } from './db.js';
import { shortPath, agentLabel, formatDuration } from './utils.js';
import { isWatcherRunning } from './commands/run.js';
import { createTwoFilesPatch } from 'diff';

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
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>AgentLog Dashboard</title>
<style>
  :root {
    --bg: #0d1117; --bg2: #161b22; --bg3: #21262d; --border: #30363d;
    --text: #e6edf3; --dim: #8b949e; --accent: #58a6ff; --green: #3fb950;
    --red: #f85149; --yellow: #d29922; --purple: #bc8cff; --pink: #f778ba;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: var(--bg); color: var(--text); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; font-size: 14px; }
  a { color: var(--accent); text-decoration: none; }
  a:hover { text-decoration: underline; }

  .header { background: var(--bg2); border-bottom: 1px solid var(--border); padding: 16px 24px; display: flex; align-items: center; gap: 16px; }
  .header h1 { font-size: 18px; font-weight: 600; }
  .header .badge { font-size: 11px; background: var(--bg3); border: 1px solid var(--border); border-radius: 12px; padding: 2px 10px; color: var(--dim); }
  .header .recording { background: rgba(63,185,80,0.15); border-color: var(--green); color: var(--green); animation: pulse 2s infinite; }
  @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.6; } }
  .header .nav { margin-left: auto; display: flex; gap: 8px; }
  .header .nav button { background: var(--bg3); border: 1px solid var(--border); color: var(--text); padding: 6px 14px; border-radius: 6px; cursor: pointer; font-size: 13px; }
  .header .nav button:hover { background: var(--border); }
  .header .nav button.active { background: var(--accent); color: #000; border-color: var(--accent); }

  .container { max-width: 1200px; margin: 0 auto; padding: 24px; }

  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 24px; }
  .card { background: var(--bg2); border: 1px solid var(--border); border-radius: 8px; padding: 16px; }
  .card .label { font-size: 12px; color: var(--dim); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
  .card .value { font-size: 24px; font-weight: 600; color: var(--accent); }
  .card .value.green { color: var(--green); }
  .card .value.yellow { color: var(--yellow); }

  .panel { background: var(--bg2); border: 1px solid var(--border); border-radius: 8px; margin-bottom: 16px; }
  .panel-header { padding: 12px 16px; border-bottom: 1px solid var(--border); font-weight: 600; display: flex; align-items: center; gap: 8px; }
  .panel-body { padding: 0; }

  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; padding: 8px 16px; font-size: 12px; color: var(--dim); text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid var(--border); }
  td { padding: 10px 16px; border-bottom: 1px solid var(--border); font-size: 13px; }
  tr:last-child td { border-bottom: none; }
  tr:hover td { background: rgba(88,166,255,0.04); }
  .dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 6px; }
  .dot.green { background: var(--green); }
  .dot.red { background: var(--red); }
  .dot.yellow { background: var(--yellow); animation: pulse 2s infinite; }
  .tag { font-size: 11px; background: rgba(188,140,255,0.15); color: var(--purple); border-radius: 4px; padding: 1px 6px; margin-left: 4px; }
  .mono { font-family: 'SF Mono', 'Fira Code', monospace; font-size: 12px; }
  .clickable { cursor: pointer; }

  .diff-view { background: var(--bg); border-radius: 6px; overflow: auto; max-height: 400px; font-family: 'SF Mono', monospace; font-size: 12px; line-height: 1.6; padding: 12px; margin: 8px 16px 16px; }
  .diff-add { color: var(--green); }
  .diff-del { color: var(--red); }
  .diff-hunk { color: var(--accent); }
  .diff-ctx { color: var(--dim); }

  .file-icon { margin-right: 4px; }
  .file-add { color: var(--green); }
  .file-change { color: var(--yellow); }
  .file-delete { color: var(--red); }

  .live-feed { max-height: 300px; overflow-y: auto; padding: 12px 16px; }
  .live-event { padding: 4px 0; font-family: monospace; font-size: 12px; display: flex; gap: 8px; }
  .live-event .time { color: var(--dim); min-width: 70px; }

  .empty { text-align: center; padding: 40px; color: var(--dim); }

  .detail-back { color: var(--accent); cursor: pointer; font-size: 13px; margin-bottom: 16px; display: inline-block; }
  .detail-header { margin-bottom: 16px; }
  .detail-header h2 { font-size: 16px; margin-bottom: 4px; }
  .detail-meta { color: var(--dim); font-size: 13px; }

  .bar-chart { padding: 8px 16px 16px; }
  .bar-row { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; font-size: 13px; }
  .bar-label { min-width: 80px; color: var(--dim); }
  .bar-fill { height: 20px; border-radius: 3px; min-width: 2px; }
  .bar-value { color: var(--dim); font-size: 12px; }

  #view-sessions, #view-detail, #view-stats { display: none; }
  #view-sessions.active, #view-detail.active, #view-stats.active { display: block; }
</style>
</head>
<body>

<div class="header">
  <h1>AgentLog</h1>
  <span class="badge" id="status-badge">offline</span>
  <div class="nav">
    <button class="active" onclick="showView('sessions')">Sessions</button>
    <button onclick="showView('stats')">Analytics</button>
  </div>
</div>

<div class="container">
  <!-- Stats cards -->
  <div class="grid" id="overview-cards"></div>

  <!-- Live feed (only shown when recording) -->
  <div class="panel" id="live-panel" style="display:none">
    <div class="panel-header"><span style="color:var(--green)">&#9679;</span> Live Recording</div>
    <div class="panel-body live-feed" id="live-feed"></div>
  </div>

  <!-- Sessions view -->
  <div id="view-sessions" class="active">
    <div class="panel">
      <div class="panel-header">Sessions</div>
      <div class="panel-body">
        <table><thead><tr><th></th><th>ID</th><th>Agent</th><th>Started</th><th>Duration</th><th>Files</th><th>Tags</th></tr></thead>
        <tbody id="sessions-body"></tbody></table>
      </div>
    </div>
  </div>

  <!-- Session detail view -->
  <div id="view-detail">
    <span class="detail-back" onclick="showView('sessions')">&larr; Back to sessions</span>
    <div class="detail-header">
      <h2 id="detail-title"></h2>
      <div class="detail-meta" id="detail-meta"></div>
    </div>
    <div id="detail-files"></div>
    <div id="detail-commands"></div>
  </div>

  <!-- Stats view -->
  <div id="view-stats">
    <div class="panel">
      <div class="panel-header">Event Breakdown</div>
      <div class="panel-body bar-chart" id="event-bars"></div>
    </div>
    <div class="panel">
      <div class="panel-header">Agents</div>
      <div class="panel-body bar-chart" id="agent-bars"></div>
    </div>
    <div class="panel">
      <div class="panel-header">Most Changed Files</div>
      <div class="panel-body">
        <table><thead><tr><th>File</th><th>Changes</th></tr></thead>
        <tbody id="top-files"></tbody></table>
      </div>
    </div>
  </div>
</div>

<script>
const API = '';
let currentView = 'sessions';

function showView(view) {
  currentView = view;
  document.querySelectorAll('#view-sessions,#view-detail,#view-stats').forEach(el => el.classList.remove('active'));
  document.getElementById('view-' + view).classList.add('active');
  document.querySelectorAll('.nav button').forEach(b => b.classList.remove('active'));
  if (view === 'sessions') document.querySelector('.nav button:first-child').classList.add('active');
  if (view === 'stats') { document.querySelector('.nav button:last-child').classList.add('active'); loadStats(); }
}

function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 10) return 'just now';
  if (s < 60) return s + 's ago';
  const m = Math.floor(s / 60);
  if (m < 60) return m + 'm ago';
  const h = Math.floor(m / 60);
  if (h < 24) return h + 'h ago';
  return Math.floor(h/24) + 'd ago';
}

function dur(ms) {
  if (!ms || ms < 0) return 'ongoing';
  const s = Math.floor(ms/1000);
  if (s < 60) return s + 's';
  const m = Math.floor(s/60);
  if (m < 60) return m + 'm ' + (s%60) + 's';
  return Math.floor(m/60) + 'h ' + (m%60) + 'm';
}

function escHtml(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

async function loadSessions() {
  const data = await fetch(API + '/api/sessions?limit=50').then(r => r.json());
  const tbody = document.getElementById('sessions-body');
  if (!data.length) { tbody.innerHTML = '<tr><td colspan="7" class="empty">No sessions yet</td></tr>'; return; }
  tbody.innerHTML = data.map(s => {
    const active = !s.ended_at;
    const err = s.exit_code && s.exit_code !== 0;
    const dot = active ? 'yellow' : err ? 'red' : 'green';
    const d = active ? '<span style="color:var(--yellow)">live</span>' : dur(s.ended_at - s.started_at);
    const tags = (s.tags||'').split(',').filter(Boolean).map(t => '<span class="tag">#'+escHtml(t)+'</span>').join(' ');
    return '<tr class="clickable" onclick="loadDetail(\\''+s.id+'\\')"><td><span class="dot '+dot+'"></span></td><td class="mono">'+s.id+'</td><td>'+escHtml(s.agent||'')+'</td><td>'+timeAgo(s.started_at)+'</td><td>'+d+'</td><td>'+s.file_count+'</td><td>'+tags+'</td></tr>';
  }).join('');
}

async function loadDetail(id) {
  showView('detail');
  const data = await fetch(API + '/api/session/' + id).then(r => r.json());
  if (data.error) { document.getElementById('detail-title').textContent = data.error; return; }
  const s = data.session;
  const d = s.ended_at ? dur(s.ended_at - s.started_at) : 'ongoing';
  const tags = (s.tags||'').split(',').filter(Boolean).map(t => '<span class="tag">#'+t+'</span>').join(' ');
  document.getElementById('detail-title').innerHTML = '<span class="mono">'+s.id+'</span> &middot; '+escHtml(s.agent)+' '+tags;
  document.getElementById('detail-meta').innerHTML = timeAgo(s.started_at)+' &middot; '+d+' &middot; '+data.totalEvents+' events'+(s.notes ? ' &middot; "'+escHtml(s.notes)+'"' : '');

  const filesHtml = data.files.map(f => {
    const cls = f.type === 'add' ? 'file-add' : f.type === 'delete' ? 'file-delete' : 'file-change';
    const icon = f.type === 'add' ? '+' : f.type === 'delete' ? '-' : '~';
    let diffHtml = '';
    if (f.diff) {
      const lines = f.diff.split('\\n').slice(4).map(l => {
        if (l.startsWith('+')) return '<div class="diff-add">'+escHtml(l)+'</div>';
        if (l.startsWith('-')) return '<div class="diff-del">'+escHtml(l)+'</div>';
        if (l.startsWith('@@')) return '<div class="diff-hunk">'+escHtml(l)+'</div>';
        return '<div class="diff-ctx">'+escHtml(l)+'</div>';
      }).join('');
      diffHtml = '<div class="diff-view">'+lines+'</div>';
    }
    const binary = f.isBinary ? ' <span style="color:var(--dim)">[binary]</span>' : '';
    return '<div class="panel"><div class="panel-header"><span class="file-icon '+cls+'">'+icon+'</span> <span class="mono">'+escHtml(f.path)+'</span>'+binary+'</div><div class="panel-body">'+diffHtml+'</div></div>';
  }).join('');
  document.getElementById('detail-files').innerHTML = filesHtml;

  if (data.commands.length) {
    document.getElementById('detail-commands').innerHTML = '<div class="panel"><div class="panel-header">Commands</div><div class="panel-body"><table>'+data.commands.map(c => '<tr><td class="mono" style="color:var(--accent)">$ '+escHtml(c.command)+'</td><td style="color:var(--dim)">'+timeAgo(c.occurred_at)+'</td></tr>').join('')+'</table></div></div>';
  } else {
    document.getElementById('detail-commands').innerHTML = '';
  }
}

async function loadStats() {
  const data = await fetch(API + '/api/stats').then(r => r.json());
  // Event bars
  const maxE = Math.max(...(data.eventsByType||[]).map(e=>e.count), 1);
  document.getElementById('event-bars').innerHTML = (data.eventsByType||[]).map(e => {
    const color = e.event_type==='add'?'var(--green)':e.event_type==='delete'?'var(--red)':'var(--yellow)';
    const pct = (e.count/maxE*100).toFixed(0);
    return '<div class="bar-row"><span class="bar-label">'+e.event_type+'</span><div class="bar-fill" style="width:'+pct+'%;background:'+color+'"></div><span class="bar-value">'+e.count+'</span></div>';
  }).join('');

  // Agent bars
  const maxA = Math.max(...(data.agents||[]).map(a=>a.count), 1);
  document.getElementById('agent-bars').innerHTML = (data.agents||[]).map(a => {
    const pct = (a.count/maxA*100).toFixed(0);
    return '<div class="bar-row"><span class="bar-label">'+a.agent+'</span><div class="bar-fill" style="width:'+pct+'%;background:var(--accent)"></div><span class="bar-value">'+a.count+'</span></div>';
  }).join('');

  // Top files
  document.getElementById('top-files').innerHTML = (data.topFiles||[]).map(f => {
    const rel = f.file_path.split('/').slice(-2).join('/');
    return '<tr><td class="mono">'+escHtml(rel)+'</td><td>'+f.count+'</td></tr>';
  }).join('');
}

async function loadOverview() {
  const [stats, status] = await Promise.all([
    fetch(API+'/api/stats').then(r=>r.json()),
    fetch(API+'/api/status').then(r=>r.json()),
  ]);
  document.getElementById('overview-cards').innerHTML = [
    {l:'Sessions',v:stats.totalSessions},
    {l:'File Events',v:stats.totalFileEvents},
    {l:'Commands',v:stats.totalShellEvents},
    {l:'Agents',v:(stats.agents||[]).length},
  ].map(c => '<div class="card"><div class="label">'+c.l+'</div><div class="value">'+c.v+'</div></div>').join('');

  const badge = document.getElementById('status-badge');
  if (status.recording) {
    badge.textContent = 'recording · ' + status.active.id.slice(0,8);
    badge.className = 'badge recording';
  } else {
    badge.textContent = 'idle';
    badge.className = 'badge';
  }
}

// Live feed via SSE
function startLiveFeed() {
  const es = new EventSource(API + '/api/events/live');
  const panel = document.getElementById('live-panel');
  const feed = document.getElementById('live-feed');
  es.onmessage = (e) => {
    const data = JSON.parse(e.data);
    if (data.recording) {
      panel.style.display = 'block';
      const badge = document.getElementById('status-badge');
      badge.textContent = 'recording · ' + data.sessionId.slice(0,8) + ' · ' + data.eventCount + ' events';
      badge.className = 'badge recording';

      feed.innerHTML = (data.recent||[]).map(ev => {
        const cls = ev.type==='add'?'file-add':ev.type==='delete'?'file-delete':'file-change';
        const icon = ev.type==='add'?'+':ev.type==='delete'?'-':'~';
        const t = new Date(ev.timestamp).toLocaleTimeString('en-US',{hour12:false});
        return '<div class="live-event"><span class="time">'+t+'</span><span class="'+cls+'">'+icon+'</span><span class="mono">'+escHtml(ev.path)+'</span></div>';
      }).join('');
    } else {
      panel.style.display = 'none';
      const badge = document.getElementById('status-badge');
      badge.textContent = 'idle';
      badge.className = 'badge';
    }
    // Refresh sessions list if on that view
    if (currentView === 'sessions') loadSessions();
  };
}

// Init
loadOverview();
loadSessions();
startLiveFeed();
setInterval(loadOverview, 10000);
</script>
</body>
</html>`;
}
