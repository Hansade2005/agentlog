export const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>AgentLog</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<style>
:root {
  --bg: #09090b; --bg-raised: #111114; --bg-surface: #18181b; --bg-hover: #1e1e22;
  --border: rgba(255,255,255,0.06); --border-bright: rgba(255,255,255,0.1);
  --text: #fafafa; --text-secondary: #a1a1aa; --text-muted: #52525b;
  --accent: #e4a853; --accent-dim: rgba(228,168,83,0.12); --accent-glow: rgba(228,168,83,0.25);
  --green: #4ade80; --green-dim: rgba(74,222,128,0.1); --green-glow: rgba(74,222,128,0.2);
  --red: #f87171; --red-dim: rgba(248,113,113,0.1);
  --yellow: #facc15; --yellow-dim: rgba(250,204,21,0.1);
  --purple: #c084fc; --purple-dim: rgba(192,132,252,0.12);
  --blue: #60a5fa;
  --radius: 12px; --radius-sm: 8px; --radius-xs: 6px;
  --font: 'DM Sans', system-ui, -apple-system, sans-serif;
  --mono: 'JetBrains Mono', 'SF Mono', 'Fira Code', monospace;
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.4);
  --shadow-md: 0 4px 16px rgba(0,0,0,0.4);
  --shadow-glow: 0 0 40px var(--accent-glow);
}
*, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
html { scroll-behavior: smooth; }
body {
  background: var(--bg); color: var(--text); font-family: var(--font);
  font-size: 14px; line-height: 1.6; min-height: 100vh;
  background-image: radial-gradient(ellipse 80% 50% at 50% -20%, rgba(228,168,83,0.05), transparent);
}

/* ── Scrollbar ──────────────────────────────────── */
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--text-muted); border-radius: 3px; }

/* ── Animations ─────────────────────────────────── */
@keyframes fadeUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }
@keyframes glow { 0%,100% { box-shadow: 0 0 8px var(--green-glow); } 50% { box-shadow: 0 0 20px var(--green-glow); } }
@keyframes slideIn { from { opacity: 0; transform: translateX(-8px); } to { opacity: 1; transform: translateX(0); } }
.animate-in { animation: fadeUp 0.4s ease-out both; }
.stagger-1 { animation-delay: 0.05s; }
.stagger-2 { animation-delay: 0.1s; }
.stagger-3 { animation-delay: 0.15s; }
.stagger-4 { animation-delay: 0.2s; }

/* ── Topbar ─────────────────────────────────────── */
.topbar {
  position: sticky; top: 0; z-index: 100;
  backdrop-filter: blur(16px) saturate(180%); -webkit-backdrop-filter: blur(16px) saturate(180%);
  background: rgba(9,9,11,0.78); border-bottom: 1px solid var(--border);
  padding: 0 32px; height: 56px; display: flex; align-items: center; gap: 16px;
}
.topbar-logo {
  font-family: var(--mono); font-weight: 600; font-size: 15px; letter-spacing: -0.3px;
  color: var(--accent); display: flex; align-items: center; gap: 8px;
}
.topbar-logo svg { width: 20px; height: 20px; }
.topbar-badge {
  font-size: 11px; font-weight: 500; padding: 3px 10px; border-radius: 20px;
  background: var(--bg-surface); border: 1px solid var(--border); color: var(--text-muted);
  transition: all 0.3s ease;
}
.topbar-badge.recording {
  background: var(--green-dim); border-color: rgba(74,222,128,0.3);
  color: var(--green); animation: glow 2.5s ease-in-out infinite;
}
.topbar-nav { margin-left: auto; display: flex; gap: 4px; }
.topbar-nav button {
  font-family: var(--font); font-size: 13px; font-weight: 500; padding: 6px 16px;
  border-radius: 8px; border: none; cursor: pointer; transition: all 0.2s ease;
  background: transparent; color: var(--text-secondary);
}
.topbar-nav button:hover { background: var(--bg-hover); color: var(--text); }
.topbar-nav button.active {
  background: var(--accent-dim); color: var(--accent); font-weight: 600;
}

/* ── Layout ─────────────────────────────────────── */
.container { max-width: 1120px; margin: 0 auto; padding: 28px 32px; }

/* ── Metric Cards ───────────────────────────────── */
.metrics { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 28px; }
.metric {
  background: var(--bg-raised); border: 1px solid var(--border); border-radius: var(--radius);
  padding: 18px 20px; position: relative; overflow: hidden; transition: border-color 0.2s, transform 0.15s;
}
.metric:hover { border-color: var(--border-bright); transform: translateY(-1px); }
.metric::before {
  content: ''; position: absolute; top: 0; left: 0; right: 0; height: 1px;
  background: linear-gradient(90deg, transparent, var(--accent-glow), transparent); opacity: 0.5;
}
.metric-label { font-size: 11px; font-weight: 500; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 6px; }
.metric-value { font-family: var(--mono); font-size: 28px; font-weight: 600; letter-spacing: -1px; color: var(--text); }
.metric-sub { font-size: 12px; color: var(--text-muted); margin-top: 2px; }

/* ── Live Panel ─────────────────────────────────── */
.live-panel {
  background: linear-gradient(135deg, rgba(74,222,128,0.04), rgba(74,222,128,0.01));
  border: 1px solid rgba(74,222,128,0.15); border-radius: var(--radius);
  margin-bottom: 28px; overflow: hidden; display: none;
}
.live-panel.active { display: block; animation: fadeUp 0.3s ease-out; }
.live-header {
  padding: 12px 20px; display: flex; align-items: center; gap: 10px;
  border-bottom: 1px solid rgba(74,222,128,0.1);
}
.live-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--green); animation: pulse 1.5s infinite; }
.live-title { font-size: 13px; font-weight: 600; color: var(--green); }
.live-meta { margin-left: auto; font-size: 12px; color: var(--text-muted); font-family: var(--mono); }
.live-feed { padding: 8px 0; max-height: 200px; overflow-y: auto; }
.live-row {
  display: flex; align-items: center; gap: 10px; padding: 4px 20px; font-size: 12px;
  animation: slideIn 0.2s ease-out both;
}
.live-row .time { font-family: var(--mono); color: var(--text-muted); min-width: 60px; }
.live-row .icon { font-family: var(--mono); font-weight: 700; width: 14px; text-align: center; }
.live-row .icon.add { color: var(--green); }
.live-row .icon.change { color: var(--yellow); }
.live-row .icon.delete { color: var(--red); }
.live-row .path { font-family: var(--mono); color: var(--text-secondary); }

/* ── Panel ──────────────────────────────────────── */
.panel {
  background: var(--bg-raised); border: 1px solid var(--border); border-radius: var(--radius);
  margin-bottom: 16px; overflow: hidden;
}
.panel-head {
  padding: 14px 20px; border-bottom: 1px solid var(--border);
  display: flex; align-items: center; gap: 10px;
}
.panel-head h3 { font-size: 13px; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px; }

/* ── Sessions Table ─────────────────────────────── */
.s-table { width: 100%; border-collapse: collapse; }
.s-table th {
  text-align: left; padding: 10px 20px; font-size: 11px; font-weight: 500;
  color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.6px;
  border-bottom: 1px solid var(--border);
}
.s-table td {
  padding: 14px 20px; border-bottom: 1px solid var(--border); font-size: 13px; vertical-align: middle;
  transition: background 0.15s;
}
.s-table tr:last-child td { border-bottom: none; }
.s-table tbody tr { cursor: pointer; }
.s-table tbody tr:hover td { background: var(--bg-hover); }
.s-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; }
.s-dot.ok { background: var(--green); box-shadow: 0 0 6px var(--green-glow); }
.s-dot.err { background: var(--red); }
.s-dot.live { background: var(--yellow); animation: pulse 1.5s infinite; box-shadow: 0 0 6px var(--yellow-dim); }
.s-id { font-family: var(--mono); font-weight: 500; font-size: 12px; color: var(--accent); }
.s-agent { font-weight: 500; }
.s-time { color: var(--text-secondary); }
.s-dur { font-family: var(--mono); font-size: 12px; }
.s-files { font-family: var(--mono); font-size: 12px; color: var(--text-secondary); }
.s-tag {
  display: inline-block; font-size: 10px; font-weight: 600; padding: 2px 8px; border-radius: 4px;
  background: var(--purple-dim); color: var(--purple); margin-left: 4px; letter-spacing: 0.3px;
}
.s-note { display: block; font-size: 12px; color: var(--text-muted); margin-top: 2px; font-style: italic; }

/* ── Detail View ────────────────────────────────── */
.detail-back {
  display: inline-flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 500;
  color: var(--text-muted); cursor: pointer; margin-bottom: 20px; transition: color 0.2s;
}
.detail-back:hover { color: var(--accent); }
.detail-head { margin-bottom: 24px; }
.detail-head h2 { font-family: var(--mono); font-size: 18px; font-weight: 600; margin-bottom: 6px; }
.detail-head .meta { font-size: 13px; color: var(--text-muted); display: flex; gap: 12px; flex-wrap: wrap; }
.detail-head .meta span { display: flex; align-items: center; gap: 4px; }

/* ── File Card ──────────────────────────────────── */
.file-card {
  background: var(--bg-raised); border: 1px solid var(--border); border-radius: var(--radius);
  margin-bottom: 12px; overflow: hidden; transition: border-color 0.2s;
}
.file-card:hover { border-color: var(--border-bright); }
.file-card-head {
  padding: 10px 16px; display: flex; align-items: center; gap: 8px;
  border-bottom: 1px solid var(--border); cursor: pointer;
}
.file-card-head .ficon {
  font-family: var(--mono); font-weight: 700; font-size: 13px; width: 18px; text-align: center;
}
.file-card-head .ficon.add { color: var(--green); }
.file-card-head .ficon.change { color: var(--yellow); }
.file-card-head .ficon.delete { color: var(--red); }
.file-card-head .fname { font-family: var(--mono); font-size: 13px; font-weight: 500; }
.file-card-head .fbadge { margin-left: auto; font-size: 11px; color: var(--text-muted); }

.diff-block {
  background: var(--bg); max-height: 420px; overflow: auto;
  font-family: var(--mono); font-size: 12px; line-height: 1.7;
  padding: 12px 16px; border-top: 1px solid var(--border);
}
.diff-block .d-add { color: var(--green); background: var(--green-dim); padding: 0 4px; border-radius: 2px; }
.diff-block .d-del { color: var(--red); background: var(--red-dim); padding: 0 4px; border-radius: 2px; }
.diff-block .d-hunk { color: var(--blue); font-weight: 500; padding: 4px 0; }
.diff-block .d-ctx { color: var(--text-muted); }

/* ── Stats ──────────────────────────────────────── */
.stat-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
@media (max-width: 768px) { .stat-grid { grid-template-columns: 1fr; } .metrics { grid-template-columns: repeat(2,1fr); } }
.bar-row { display: flex; align-items: center; gap: 12px; padding: 8px 20px; }
.bar-label { min-width: 90px; font-size: 13px; font-weight: 500; color: var(--text-secondary); }
.bar-track { flex: 1; height: 24px; background: var(--bg); border-radius: var(--radius-xs); overflow: hidden; position: relative; }
.bar-fill { height: 100%; border-radius: var(--radius-xs); transition: width 0.6s cubic-bezier(0.16,1,0.3,1); position: relative; }
.bar-fill::after {
  content: ''; position: absolute; inset: 0;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.08));
}
.bar-value { min-width: 50px; text-align: right; font-family: var(--mono); font-size: 12px; color: var(--text-muted); }

.top-file-row { display: flex; align-items: center; gap: 12px; padding: 10px 20px; border-bottom: 1px solid var(--border); }
.top-file-row:last-child { border-bottom: none; }
.top-file-rank { font-family: var(--mono); font-size: 11px; color: var(--text-muted); min-width: 24px; }
.top-file-bar { width: 40px; height: 6px; border-radius: 3px; background: var(--bg); overflow: hidden; }
.top-file-bar-fill { height: 100%; border-radius: 3px; background: var(--accent); }
.top-file-name { flex: 1; font-family: var(--mono); font-size: 12px; color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.top-file-count { font-family: var(--mono); font-size: 12px; color: var(--text-muted); }

/* ── Empty ──────────────────────────────────────── */
.empty-state {
  text-align: center; padding: 60px 20px; color: var(--text-muted);
}
.empty-state p { font-size: 15px; margin-bottom: 8px; }
.empty-state code { font-family: var(--mono); color: var(--accent); font-size: 13px; }

/* ── Views ──────────────────────────────────────── */
.view { display: none; }
.view.active { display: block; animation: fadeIn 0.25s ease-out; }
</style>
</head>
<body>

<div class="topbar">
  <div class="topbar-logo">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 20V10"/><path d="M18 20V4"/><path d="M6 20v-4"/></svg>
    AgentLog
  </div>
  <span class="topbar-badge" id="status-badge">idle</span>
  <div class="topbar-nav">
    <button class="active" onclick="nav('sessions')">Sessions</button>
    <button onclick="nav('stats')">Analytics</button>
  </div>
</div>

<div class="container">
  <div class="metrics" id="metrics"></div>

  <div class="live-panel" id="live-panel">
    <div class="live-header">
      <div class="live-dot"></div>
      <span class="live-title">Live Recording</span>
      <span class="live-meta" id="live-meta"></span>
    </div>
    <div class="live-feed" id="live-feed"></div>
  </div>

  <!-- Sessions View -->
  <div class="view active" id="v-sessions">
    <div class="panel animate-in">
      <div class="panel-head"><h3>Session History</h3></div>
      <table class="s-table">
        <thead><tr><th style="width:24px"></th><th>Session</th><th>Agent</th><th>When</th><th>Duration</th><th>Files</th><th>Tags</th></tr></thead>
        <tbody id="s-body"></tbody>
      </table>
    </div>
  </div>

  <!-- Detail View -->
  <div class="view" id="v-detail">
    <div class="detail-back" onclick="nav('sessions')">&#8592; Sessions</div>
    <div class="detail-head" id="d-head"></div>
    <div id="d-files"></div>
    <div id="d-cmds"></div>
  </div>

  <!-- Stats View -->
  <div class="view" id="v-stats">
    <div class="stat-grid">
      <div class="panel animate-in stagger-1">
        <div class="panel-head"><h3>Event Breakdown</h3></div>
        <div id="st-events"></div>
      </div>
      <div class="panel animate-in stagger-2">
        <div class="panel-head"><h3>Agents</h3></div>
        <div id="st-agents"></div>
      </div>
    </div>
    <div class="panel animate-in stagger-3" style="margin-top:16px">
      <div class="panel-head"><h3>Most Changed Files</h3></div>
      <div id="st-files"></div>
    </div>
  </div>
</div>

<script>
let curView='sessions';
const esc=(s)=>{const d=document.createElement('div');d.textContent=s;return d.innerHTML};
const ago=(ts)=>{const s=Math.floor((Date.now()-ts)/1000);if(s<10)return'just now';if(s<60)return s+'s ago';const m=Math.floor(s/60);if(m<60)return m+'m ago';const h=Math.floor(m/60);if(h<24)return h+'h ago';return Math.floor(h/24)+'d ago'};
const dur=(ms)=>{if(!ms||ms<0)return'ongoing';const s=Math.floor(ms/1000);if(s<60)return s+'s';const m=Math.floor(s/60);if(m<60)return m+'m '+s%60+'s';return Math.floor(m/60)+'h '+m%60+'m'};

function nav(v){
  curView=v;
  document.querySelectorAll('.view').forEach(el=>el.classList.remove('active'));
  document.getElementById('v-'+v).classList.add('active');
  document.querySelectorAll('.topbar-nav button').forEach(b=>b.classList.remove('active'));
  if(v==='sessions')document.querySelector('.topbar-nav button:first-child').classList.add('active');
  if(v==='stats'){document.querySelector('.topbar-nav button:last-child').classList.add('active');loadStats();}
}

async function loadMetrics(){
  const[stats,status]=await Promise.all([fetch('/api/stats').then(r=>r.json()),fetch('/api/status').then(r=>r.json())]);
  const items=[
    {l:'Sessions',v:stats.totalSessions,c:''},
    {l:'File Events',v:stats.totalFileEvents,c:''},
    {l:'Shell Commands',v:stats.totalShellEvents,c:''},
    {l:'Avg Duration',v:stats.avgDuration?dur(stats.avgDuration):'-',c:''},
  ];
  document.getElementById('metrics').innerHTML=items.map((c,i)=>
    '<div class="metric animate-in stagger-'+((i%4)+1)+'"><div class="metric-label">'+c.l+'</div><div class="metric-value">'+c.v+'</div></div>'
  ).join('');
  const b=document.getElementById('status-badge');
  if(status.recording){b.textContent='recording \\u00b7 '+status.active.id.slice(0,8);b.className='topbar-badge recording';}
  else{b.textContent='idle';b.className='topbar-badge';}
}

async function loadSessions(){
  const data=await fetch('/api/sessions?limit=50').then(r=>r.json());
  const tb=document.getElementById('s-body');
  if(!data.length){tb.innerHTML='<tr><td colspan="7"><div class="empty-state"><p>No sessions recorded yet</p><code>agentlog run cursor</code></div></td></tr>';return;}
  tb.innerHTML=data.map(s=>{
    const live=!s.ended_at;const err=s.exit_code&&s.exit_code!==0;
    const dot=live?'live':err?'err':'ok';
    const d=live?'<span style="color:var(--yellow)">live</span>':dur(s.ended_at-s.started_at);
    const tags=(s.tags||'').split(',').filter(Boolean).map(t=>'<span class="s-tag">#'+esc(t)+'</span>').join(' ');
    const note=s.notes?'<span class="s-note">'+esc(s.notes)+'</span>':'';
    return '<tr onclick="loadDetail(\\''+s.id+'\\')"><td><span class="s-dot '+dot+'"></span></td><td><span class="s-id">'+s.id+'</span>'+note+'</td><td class="s-agent">'+esc(s.agent||'')+'</td><td class="s-time">'+ago(s.started_at)+'</td><td class="s-dur">'+d+'</td><td class="s-files">'+s.file_count+'</td><td>'+tags+'</td></tr>';
  }).join('');
}

async function loadDetail(id){
  nav('detail');
  const data=await fetch('/api/session/'+id).then(r=>r.json());
  if(data.error){document.getElementById('d-head').innerHTML='<h2>'+esc(data.error)+'</h2>';return;}
  const s=data.session;
  const d=s.ended_at?dur(s.ended_at-s.started_at):'ongoing';
  const tags=(s.tags||'').split(',').filter(Boolean).map(t=>'<span class="s-tag">#'+esc(t)+'</span>').join(' ');
  document.getElementById('d-head').innerHTML='<h2>'+s.id+'</h2><div class="meta"><span>'+esc(s.agent)+'</span><span>'+ago(s.started_at)+'</span><span>'+d+'</span><span>'+data.totalEvents+' events</span>'+tags+'</div>'+(s.notes?'<div style="margin-top:8px;color:var(--text-muted);font-style:italic">"'+esc(s.notes)+'"</div>':'');

  document.getElementById('d-files').innerHTML=data.files.map((f,i)=>{
    const cls=f.type==='add'?'add':f.type==='delete'?'delete':'change';
    const icon=f.type==='add'?'+':f.type==='delete'?'\\u2212':'~';
    let diffH='';
    if(f.diff){
      const lines=f.diff.split('\\n').slice(4).map(l=>{
        if(l.startsWith('+'))return'<div class="d-add">'+esc(l)+'</div>';
        if(l.startsWith('-'))return'<div class="d-del">'+esc(l)+'</div>';
        if(l.startsWith('@@'))return'<div class="d-hunk">'+esc(l)+'</div>';
        return'<div class="d-ctx">'+esc(l)+'</div>';
      }).join('');
      diffH='<div class="diff-block">'+lines+'</div>';
    }
    const badge=f.isBinary?'binary':'';
    return'<div class="file-card animate-in" style="animation-delay:'+(i*0.04)+'s"><div class="file-card-head"><span class="ficon '+cls+'">'+icon+'</span><span class="fname">'+esc(f.path)+'</span><span class="fbadge">'+badge+'</span></div>'+diffH+'</div>';
  }).join('');

  if(data.commands.length){
    document.getElementById('d-cmds').innerHTML='<div class="panel animate-in" style="margin-top:16px"><div class="panel-head"><h3>Commands</h3></div>'+data.commands.map(c=>'<div style="padding:8px 20px;font-family:var(--mono);font-size:12px;border-bottom:1px solid var(--border)"><span style="color:var(--accent)">$ </span>'+esc(c.command)+'<span style="float:right;color:var(--text-muted)">'+ago(c.occurred_at)+'</span></div>').join('')+'</div>';
  }else{document.getElementById('d-cmds').innerHTML='';}
}

async function loadStats(){
  const data=await fetch('/api/stats').then(r=>r.json());
  const maxE=Math.max(...(data.eventsByType||[]).map(e=>e.count),1);
  document.getElementById('st-events').innerHTML=(data.eventsByType||[]).map(e=>{
    const c=e.event_type==='add'?'var(--green)':e.event_type==='delete'?'var(--red)':'var(--yellow)';
    const pct=(e.count/maxE*100).toFixed(0);
    return'<div class="bar-row"><span class="bar-label">'+e.event_type+'</span><div class="bar-track"><div class="bar-fill" style="width:'+pct+'%;background:'+c+'"></div></div><span class="bar-value">'+e.count+'</span></div>';
  }).join('')||'<div class="empty-state"><p>No events yet</p></div>';

  const maxA=Math.max(...(data.agents||[]).map(a=>a.count),1);
  document.getElementById('st-agents').innerHTML=(data.agents||[]).map(a=>{
    const pct=(a.count/maxA*100).toFixed(0);
    return'<div class="bar-row"><span class="bar-label">'+esc(a.agent)+'</span><div class="bar-track"><div class="bar-fill" style="width:'+pct+'%;background:var(--accent)"></div></div><span class="bar-value">'+a.count+'</span></div>';
  }).join('')||'<div class="empty-state"><p>No agents yet</p></div>';

  const maxF=Math.max(...(data.topFiles||[]).map(f=>f.count),1);
  document.getElementById('st-files').innerHTML=(data.topFiles||[]).map((f,i)=>{
    const rel=f.file_path.split('/').slice(-2).join('/');
    const pct=(f.count/maxF*100).toFixed(0);
    return'<div class="top-file-row"><span class="top-file-rank">'+(i+1)+'</span><div class="top-file-bar"><div class="top-file-bar-fill" style="width:'+pct+'%"></div></div><span class="top-file-name">'+esc(rel)+'</span><span class="top-file-count">'+f.count+'</span></div>';
  }).join('')||'<div class="empty-state"><p>No files yet</p></div>';
}

function startSSE(){
  const es=new EventSource('/api/events/live');
  const panel=document.getElementById('live-panel');
  const feed=document.getElementById('live-feed');
  const meta=document.getElementById('live-meta');
  es.onmessage=(e)=>{
    const d=JSON.parse(e.data);
    if(d.recording){
      panel.classList.add('active');
      meta.textContent=d.sessionId.slice(0,8)+' \\u00b7 '+d.eventCount+' events';
      const b=document.getElementById('status-badge');
      b.textContent='recording \\u00b7 '+d.sessionId.slice(0,8);b.className='topbar-badge recording';
      feed.innerHTML=(d.recent||[]).map(ev=>{
        const cls=ev.type==='add'?'add':ev.type==='delete'?'delete':'change';
        const icon=ev.type==='add'?'+':ev.type==='delete'?'\\u2212':'~';
        const t=new Date(ev.timestamp).toLocaleTimeString('en-US',{hour12:false});
        return'<div class="live-row"><span class="time">'+t+'</span><span class="icon '+cls+'">'+icon+'</span><span class="path">'+esc(ev.path)+'</span></div>';
      }).join('');
      if(curView==='sessions')loadSessions();
    }else{
      panel.classList.remove('active');
      const b=document.getElementById('status-badge');b.textContent='idle';b.className='topbar-badge';
    }
  };
}

loadMetrics();loadSessions();startSSE();setInterval(loadMetrics,8000);
</script>
</body>
</html>`;
