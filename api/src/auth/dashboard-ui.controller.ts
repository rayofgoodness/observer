import { Controller, Get, Header } from '@nestjs/common'

// Self-service dashboard. Public HTML; all its API calls rely on the httpOnly
// session cookie (same-origin fetch sends it automatically). Users register,
// create projects, and copy the public key + ready-made nuxt.config snippet.
@Controller()
export class DashboardUiController {
  @Get('dashboard')
  @Header('Content-Type', 'text/html; charset=utf-8')
  page(): string {
    return DASHBOARD_HTML
  }
}

const DASHBOARD_HTML = /* html */ `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Observer · Dashboard</title>
<style>
  :root {
    --bg: #0b0e14; --panel: #141924; --panel-2: #1b2130; --border: #262d3d;
    --text: #e6e9f0; --muted: #8a93a6; --accent: #5b8cff; --accent-2: #3a6bff;
    --green: #2ecc71; --red: #ff5c6c; --amber: #f5a623;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--bg); color: var(--text);
    font: 14px/1.5 ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
  }
  a { color: var(--accent); }
  .wrap { max-width: 920px; margin: 0 auto; padding: 24px 20px 64px; }
  header { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
  header h1 { font-size: 18px; margin: 0; font-weight: 650; letter-spacing: .2px; flex: 1; }
  .card {
    background: var(--panel); border: 1px solid var(--border); border-radius: 12px;
    padding: 16px; margin-bottom: 16px;
  }
  .card h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .6px; color: var(--muted); margin: 0 0 12px; }
  label { display: block; font-size: 12px; color: var(--muted); margin: 0 0 4px; }
  input[type=text], input[type=email], input[type=password] {
    width: 100%; background: var(--panel-2); border: 1px solid var(--border);
    color: var(--text); border-radius: 8px; padding: 8px 10px; font: inherit;
  }
  input:focus { outline: none; border-color: var(--accent); }
  .row { display: flex; gap: 10px; flex-wrap: wrap; align-items: end; }
  .row > div { flex: 1; min-width: 140px; }
  button {
    background: var(--accent-2); color: #fff; border: none; border-radius: 8px;
    padding: 8px 14px; font: inherit; font-weight: 600; cursor: pointer;
  }
  button:hover { background: var(--accent); }
  button.ghost { background: transparent; border: 1px solid var(--border); color: var(--text); font-weight: 500; }
  button.ghost:hover { border-color: var(--accent); }
  .muted { color: var(--muted); }
  .toast {
    position: fixed; bottom: 18px; left: 50%; transform: translateX(-50%);
    background: var(--panel-2); border: 1px solid var(--border); border-radius: 8px;
    padding: 10px 16px; opacity: 0; transition: opacity .2s; pointer-events: none; z-index: 20;
  }
  .toast.show { opacity: 1; }
  .empty { color: var(--muted); padding: 20px; text-align: center; }
  .hidden { display: none; }
  .tabs { display: flex; gap: 6px; margin-bottom: 14px; }
  .tab { padding: 6px 14px; }
  .tab.active { border-color: var(--accent); color: var(--accent); }
  .proj { border: 1px solid var(--border); border-radius: 10px; padding: 14px; margin-bottom: 12px; background: var(--panel-2); }
  .proj-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .proj-head .name { font-weight: 650; font-size: 15px; flex: 1; }
  .key { display: flex; align-items: center; gap: 8px; margin: 10px 0; flex-wrap: wrap; }
  .key code { font-size: 12px; color: var(--text); background: var(--bg); border: 1px solid var(--border); border-radius: 6px; padding: 4px 8px; word-break: break-all; }
  pre {
    background: var(--bg); border: 1px solid var(--border); border-radius: 8px;
    padding: 12px; overflow-x: auto; font-size: 12px; margin: 8px 0 0; white-space: pre;
  }
  .snip-head { display: flex; align-items: center; justify-content: space-between; margin-top: 10px; }
  .snip-head span { font-size: 11px; text-transform: uppercase; letter-spacing: .5px; color: var(--muted); }
  .overlay { position: fixed; inset: 0; background: rgba(0,0,0,.6); display: none; align-items: flex-start; justify-content: center; padding: 40px 16px; z-index: 10; overflow-y: auto; }
  .overlay.show { display: flex; }
  .modal { background: var(--panel); border: 1px solid var(--border); border-radius: 12px; width: 100%; max-width: 820px; padding: 18px; }
  .modal-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
  .modal-head h3 { margin: 0; font-size: 15px; }
  .x { background: transparent; border: 1px solid var(--border); color: var(--muted); padding: 4px 10px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: 9px 8px; border-bottom: 1px solid var(--border); }
  th { font-size: 11px; text-transform: uppercase; letter-spacing: .5px; color: var(--muted); font-weight: 600; }
  .src { font-size: 11px; padding: 2px 7px; border-radius: 999px; background: var(--panel-2); color: var(--muted); }
  .badge { font-size: 11px; padding: 2px 7px; border-radius: 999px; }
  .badge.new { background: rgba(245,166,35,.16); color: var(--amber); }
  .badge.resolved { background: rgba(46,204,113,.14); color: var(--green); }
  .badge.ignored { background: rgba(138,147,166,.16); color: var(--muted); }
  .err-row { cursor: pointer; }
  .err-row:hover { background: var(--panel-2); }
  .crumbs { list-style: none; margin: 8px 0 0; padding: 0; border-left: 2px solid var(--border); }
  .crumb { display: flex; gap: 10px; padding: 5px 0 5px 12px; position: relative; font-size: 12px; }
  .crumb::before { content: ''; position: absolute; left: -5px; top: 11px; width: 8px; height: 8px; border-radius: 50%; background: var(--muted); }
  .crumb.click::before { background: var(--accent); }
  .crumb.navigation::before { background: #9b7cff; }
  .crumb.fetch::before { background: var(--amber); }
  .crumb.console::before, .crumb.error::before { background: var(--red); }
  .crumb .ct { color: var(--muted); min-width: 66px; }
  .crumb .cc { text-transform: uppercase; font-size: 10px; letter-spacing: .5px; color: var(--muted); min-width: 70px; }
  .crumb .cm { flex: 1; word-break: break-word; }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <h1>Observer</h1>
    <span class="muted" id="who" style="font-size:12px"></span>
    <button class="ghost hidden" id="logout">Sign out</button>
  </header>

  <!-- Auth (shown when signed out) -->
  <div class="card" id="authCard">
    <div class="tabs">
      <button class="ghost tab active" id="tabLogin">Sign in</button>
      <button class="ghost tab" id="tabRegister">Create account</button>
    </div>
    <div class="row">
      <div><label>Email</label><input type="email" id="email" autocomplete="username" placeholder="you@example.com" /></div>
      <div><label>Password <span id="pwHint" class="muted"></span></label><input type="password" id="password" autocomplete="current-password" placeholder="••••••••" /></div>
      <div style="flex:0 0 auto"><button id="authSubmit">Sign in</button></div>
    </div>
  </div>

  <!-- Dashboard (shown when signed in) -->
  <div id="dash" class="hidden">
    <div class="card">
      <h2>New project</h2>
      <div class="row">
        <div><label>Name</label><input type="text" id="newName" placeholder="my-app" /></div>
        <div style="flex:2"><label>Allowed origins (comma-separated, empty = any)</label>
          <input type="text" id="newOrigins" placeholder="https://app.example.com, http://localhost:3000" /></div>
        <div style="flex:0 0 auto"><button id="create">Create</button></div>
      </div>
    </div>

    <div class="card">
      <h2>Your projects</h2>
      <div id="projects"><div class="empty">Loading…</div></div>
    </div>
  </div>
</div>

<div class="overlay" id="overlay">
  <div class="modal">
    <div class="modal-head"><h3 id="mTitle">Errors</h3><button class="x" id="mClose">✕ Close</button></div>
    <div id="mBody"></div>
  </div>
</div>

<div class="toast" id="toast"></div>

<script>
const $ = (s) => document.querySelector(s)
let mode = 'login'

function toast(msg, bad) {
  const t = $('#toast'); t.textContent = msg
  t.style.borderColor = bad ? 'var(--red)' : 'var(--border)'
  t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2400)
}
function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])) }
function fmtDate(s) { try { return new Date(s).toLocaleString() } catch { return s } }

async function api(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  })
  if (res.status === 401) { const e = new Error('unauth'); e.unauth = true; throw e }
  if (!res.ok) {
    let msg = 'HTTP ' + res.status
    try { const j = await res.json(); if (j.message) msg = Array.isArray(j.message) ? j.message[0] : j.message } catch {}
    throw new Error(msg)
  }
  return res.status === 204 ? null : res.json()
}

// --- Auth UI ---
function setMode(m) {
  mode = m
  $('#tabLogin').classList.toggle('active', m === 'login')
  $('#tabRegister').classList.toggle('active', m === 'register')
  $('#authSubmit').textContent = m === 'login' ? 'Sign in' : 'Create account'
  $('#password').autocomplete = m === 'login' ? 'current-password' : 'new-password'
  $('#pwHint').textContent = m === 'register' ? '(min 8 chars)' : ''
}
$('#tabLogin').onclick = () => setMode('login')
$('#tabRegister').onclick = () => setMode('register')

$('#authSubmit').onclick = async () => {
  const email = $('#email').value.trim()
  const password = $('#password').value
  if (!email || !password) return toast('Email and password required', true)
  try {
    await api('POST', mode === 'login' ? '/auth/login' : '/auth/register', { email, password })
    $('#password').value = ''
    await boot()
  } catch (e) { toast(e.message, true) }
}
$('#password').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#authSubmit').click() })

$('#logout').onclick = async () => {
  try { await api('POST', '/auth/logout') } catch {}
  location.reload()
}

// --- Projects ---
function snippet(key) {
  const endpoint = location.origin + '/v1/ingest'
  return \`// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['nuxt-error-tracker'],
  errorTracker: {
    endpoint: '\${endpoint}',
    publicKey: '\${key}',
  },
})\`
}

function renderProjects(list) {
  const el = $('#projects')
  if (!list.length) { el.innerHTML = '<div class="empty">No projects yet. Create one above.</div>'; return }
  el.innerHTML = list.map((p) => {
    const origins = (p.allowedOrigins && p.allowedOrigins.length) ? esc(p.allowedOrigins.join(', ')) : '<span class="muted">any origin</span>'
    return \`<div class="proj" data-key="\${esc(p.publicKey)}">
      <div class="proj-head">
        <span class="name">\${esc(p.name)}</span>
        <span class="\${p.isActive ? 'muted' : ''}" style="font-size:12px">\${p.isActive ? '' : 'inactive'}</span>
        <button class="ghost" data-logs data-name="\${esc(p.name)}">Logs</button>
      </div>
      <div class="key">
        <code>\${esc(p.publicKey)}</code>
        <button class="ghost" data-copy="\${esc(p.publicKey)}" style="padding:4px 10px;font-size:12px">Copy key</button>
      </div>
      <div class="muted" style="font-size:12px">Origins: \${origins}</div>
      <div class="snip-head"><span>Paste into your Nuxt app</span>
        <button class="ghost" data-snip style="padding:3px 10px;font-size:11px">Copy config</button></div>
      <pre data-snippet>\${esc(snippet(p.publicKey))}</pre>
    </div>\`
  }).join('')
}

async function loadProjects() {
  try {
    const list = await api('GET', '/account/projects')
    renderProjects(list)
  } catch (e) {
    if (e.unauth) return boot()
    $('#projects').innerHTML = '<div class="empty">' + esc(e.message) + '</div>'
  }
}

$('#create').onclick = async () => {
  const name = $('#newName').value.trim()
  if (!name) return toast('Name required', true)
  const origins = $('#newOrigins').value.split(',').map((s) => s.trim()).filter(Boolean)
  try {
    await api('POST', '/account/projects', { name, allowedOrigins: origins })
    $('#newName').value = ''; $('#newOrigins').value = ''
    toast('Project created'); loadProjects()
  } catch (e) { toast(e.message, true) }
}

$('#projects').addEventListener('click', (ev) => {
  const btn = ev.target.closest('button'); if (!btn) return
  const card = btn.closest('.proj')
  if (btn.dataset.copy !== undefined) {
    navigator.clipboard.writeText(btn.dataset.copy).then(() => toast('Key copied'))
  } else if (btn.hasAttribute('data-snip')) {
    navigator.clipboard.writeText(card.querySelector('[data-snippet]').textContent).then(() => toast('Config copied'))
  } else if (btn.hasAttribute('data-logs')) {
    openLogs(card.dataset.key, btn.dataset.name)
  }
})

// --- Error logs modal ---
const overlay = $('#overlay')
function closeModal() { overlay.classList.remove('show') }
$('#mClose').onclick = closeModal
overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal() })
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal() })

let curKey = ''
async function openLogs(key, name) {
  curKey = key
  $('#mTitle').textContent = 'Errors · ' + (name || key)
  overlay.classList.add('show')
  $('#mBody').innerHTML = '<div class="empty">Loading…</div>'
  try {
    const res = await api('GET', '/account/projects/' + encodeURIComponent(key) + '/errors?limit=50')
    if (!res.items.length) { $('#mBody').innerHTML = '<div class="empty">No errors yet.</div>'; return }
    $('#mBody').innerHTML = '<table><thead><tr><th>Count</th><th>Source</th><th>Status</th><th>Message</th><th>Last seen</th></tr></thead><tbody>' +
      res.items.map((e) => \`<tr class="err-row" data-err="\${e.id}">
        <td>\${e.occurrences_count}</td>
        <td><span class="src">\${esc(e.source)}</span></td>
        <td><span class="badge \${esc(e.status)}">\${esc(e.status)}</span></td>
        <td style="max-width:340px">\${esc(e.message)}</td>
        <td class="muted" style="font-size:12px">\${fmtDate(e.last_seen)}</td>
      </tr>\`).join('') + '</tbody></table>'
    $('#mBody').querySelectorAll('.err-row').forEach((r) => { r.onclick = () => openDetail(r.dataset.err) })
  } catch (e) { $('#mBody').innerHTML = '<div class="empty">' + esc(e.message) + '</div>' }
}

async function openDetail(id) {
  $('#mBody').innerHTML = '<div class="empty">Loading…</div>'
  try {
    const d = await api('GET', '/account/errors/' + id)
    const e = d.error
    const occ = d.occurrences || []
    const crumbs = (occ[0] && occ[0].breadcrumbs) || []
    const crumbHtml = crumbs.length ? \`
      <h2 style="margin-top:16px;font-size:13px;text-transform:uppercase;letter-spacing:.6px;color:var(--muted)">History before error <span style="text-transform:none;font-weight:400">· latest occurrence</span></h2>
      <ul class="crumbs">\` + crumbs.map((c) => {
        const t = c.type || 'log'
        const time = c.timestamp ? new Date(c.timestamp).toLocaleTimeString() : ''
        return \`<li class="crumb \${esc(t)}">
          <span class="ct">\${esc(time)}</span>
          <span class="cc">\${esc(c.category || t)}</span>
          <span class="cm">\${esc(c.message || '')}</span>
        </li>\`
      }).join('') + '</ul>' : '<div class="muted" style="margin-top:12px;font-size:12px">No breadcrumbs recorded for this occurrence.</div>'
    const occRows = occ.length ? occ.map((o) => \`<tr>
      <td class="muted" style="font-size:12px">\${fmtDate(o.occurred_at)}</td>
      <td style="font-size:12px">\${esc(o.route || '—')}</td>
      <td class="muted" style="font-size:12px">\${esc(o.app_version || '—')}</td>
    </tr>\`).join('') : '<tr><td colspan="3" class="empty">No occurrences.</td></tr>'
    $('#mBody').innerHTML = \`
      <button class="ghost" id="mBack" style="margin-bottom:12px">← Back</button>
      <div><span class="src">\${esc(e.source)}</span> <span class="badge \${esc(e.status)}">\${esc(e.status)}</span>
        <span class="muted" style="font-size:12px">· \${e.occurrences_count} occurrence(s)</span></div>
      <div style="font-weight:600;margin:6px 0 2px">\${esc(e.message)}</div>
      <pre>\${esc(e.stack || '(no stack)')}</pre>
      \${crumbHtml}
      <h2 style="margin-top:16px;font-size:13px;text-transform:uppercase;letter-spacing:.6px;color:var(--muted)">Recent occurrences</h2>
      <table><thead><tr><th>When</th><th>Route</th><th>App ver</th></tr></thead><tbody>\${occRows}</tbody></table>\`
    $('#mBack').onclick = () => openLogs(curKey)
  } catch (e) { $('#mBody').innerHTML = '<div class="empty">' + esc(e.message) + '</div>' }
}

// --- Boot: decide auth vs dashboard from the session cookie ---
async function boot() {
  try {
    const me = await api('GET', '/auth/me')
    $('#authCard').classList.add('hidden')
    $('#dash').classList.remove('hidden')
    $('#logout').classList.remove('hidden')
    $('#who').textContent = me.email
    loadProjects()
  } catch (e) {
    $('#authCard').classList.remove('hidden')
    $('#dash').classList.add('hidden')
    $('#logout').classList.add('hidden')
    $('#who').textContent = ''
    setMode('login')
  }
}
boot()
</script>
</body>
</html>`
