import { Controller, Get, Header } from '@nestjs/common'

// Static admin console. The page itself is public; every API call it makes
// carries the X-Admin-Token header (kept in localStorage), which the guarded
// /admin/* endpoints validate. Inlined as a string so `nest build` needs no
// asset-copy step.
@Controller()
export class AdminUiController {
  @Get('admin')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'no-cache')
  page(): string {
    return ADMIN_HTML
  }
}

const ADMIN_HTML = /* html */ `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Observer · Admin</title>
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
  .wrap { max-width: 1000px; margin: 0 auto; padding: 24px 20px 64px; }
  header { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
  header h1 { font-size: 18px; margin: 0; font-weight: 650; letter-spacing: .2px; }
  header .dot { width: 9px; height: 9px; border-radius: 50%; background: var(--muted); }
  header .dot.ok { background: var(--green); } header .dot.bad { background: var(--red); }
  .card {
    background: var(--panel); border: 1px solid var(--border); border-radius: 12px;
    padding: 16px; margin-bottom: 16px;
  }
  .card h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .6px; color: var(--muted); margin: 0 0 12px; }
  label { display: block; font-size: 12px; color: var(--muted); margin: 0 0 4px; }
  input[type=text], input[type=number], input[type=password] {
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
  button.danger { background: transparent; border: 1px solid var(--red); color: var(--red); }
  button.danger:hover { background: rgba(255,92,108,.12); }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: 10px 8px; border-bottom: 1px solid var(--border); vertical-align: middle; }
  th { font-size: 11px; text-transform: uppercase; letter-spacing: .5px; color: var(--muted); font-weight: 600; }
  td.key code { font-size: 12px; color: var(--muted); }
  .pill { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; padding: 3px 9px; border-radius: 999px; }
  .pill.on { background: rgba(46,204,113,.14); color: var(--green); }
  .pill.off { background: rgba(255,92,108,.14); color: var(--red); }
  .rl { width: 88px; }
  .muted { color: var(--muted); }
  .toast {
    position: fixed; bottom: 18px; left: 50%; transform: translateX(-50%);
    background: var(--panel-2); border: 1px solid var(--border); border-radius: 8px;
    padding: 10px 16px; opacity: 0; transition: opacity .2s; pointer-events: none;
  }
  .toast.show { opacity: 1; }
  .actions { display: flex; gap: 6px; flex-wrap: wrap; }
  .empty { color: var(--muted); padding: 20px; text-align: center; }
  /* modal */
  .overlay {
    position: fixed; inset: 0; background: rgba(0,0,0,.6); display: none;
    align-items: flex-start; justify-content: center; padding: 40px 16px; z-index: 10;
    overflow-y: auto;
  }
  .overlay.show { display: flex; }
  .modal {
    background: var(--panel); border: 1px solid var(--border); border-radius: 12px;
    width: 100%; max-width: 900px; padding: 18px;
  }
  .modal-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
  .modal-head h3 { margin: 0; font-size: 15px; }
  .modal-head .sub { color: var(--muted); font-size: 12px; }
  .x { background: transparent; border: 1px solid var(--border); color: var(--muted); padding: 4px 10px; }
  .err-row { cursor: pointer; }
  .err-row:hover { background: var(--panel-2); }
  .src { font-size: 11px; padding: 2px 7px; border-radius: 999px; background: var(--panel-2); color: var(--muted); }
  .badge { font-size: 11px; padding: 2px 7px; border-radius: 999px; }
  .badge.new { background: rgba(245,166,35,.16); color: var(--amber); }
  .badge.resolved { background: rgba(46,204,113,.14); color: var(--green); }
  .badge.ignored { background: rgba(138,147,166,.16); color: var(--muted); }
  .lvl { font-size: 11px; padding: 2px 7px; border-radius: 999px; text-transform: uppercase; letter-spacing: .3px; }
  .lvl.fatal, .lvl.error { background: rgba(255,92,108,.16); color: var(--red); }
  .lvl.warning { background: rgba(245,166,35,.16); color: var(--amber); }
  .lvl.info { background: rgba(91,140,255,.16); color: var(--accent); }
  .lvl.debug { background: rgba(138,147,166,.16); color: var(--muted); }
  .det-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 6px; flex-wrap: wrap; }
  pre {
    background: var(--bg); border: 1px solid var(--border); border-radius: 8px;
    padding: 12px; overflow-x: auto; font-size: 12px; margin: 8px 0 0; white-space: pre;
  }
  .back { margin-bottom: 12px; }
  .lognav { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; flex-wrap: wrap; }
  .tabs { display: flex; gap: 6px; }
  .tab { text-transform: capitalize; padding: 5px 12px; }
  .tab.active { border-color: var(--accent); color: var(--accent); }
  .pager { display: flex; align-items: center; gap: 8px; }
  .pager button[disabled] { opacity: .4; cursor: default; }
  .crumbs { list-style: none; margin: 8px 0 0; padding: 0; border-left: 2px solid var(--border); }
  .crumb { display: flex; gap: 10px; padding: 5px 0 5px 12px; position: relative; font-size: 12px; }
  .crumb::before { content: ''; position: absolute; left: -5px; top: 11px; width: 8px; height: 8px; border-radius: 50%; background: var(--muted); }
  .crumb.click::before { background: var(--accent); }
  .crumb.input::before { background: var(--green); }
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
    <span class="dot" id="status"></span>
    <h1>Observer · Admin</h1>
    <span class="muted" id="statusText" style="font-size:12px"></span>
  </header>

  <div class="card">
    <h2>Admin token</h2>
    <div class="row">
      <div style="flex:3">
        <label>X-Admin-Token (stored in this browser only)</label>
        <input type="password" id="token" placeholder="paste ADMIN_TOKEN" autocomplete="off" />
      </div>
      <div style="flex:0 0 auto">
        <button id="saveToken">Save &amp; load</button>
      </div>
    </div>
  </div>

  <div class="card">
    <h2>Create project</h2>
    <div class="row">
      <div><label>Name</label><input type="text" id="newName" placeholder="my-app" /></div>
      <div style="flex:2"><label>Allowed origins (comma-separated, empty = any)</label>
        <input type="text" id="newOrigins" placeholder="https://app.example.com, http://localhost:3000" /></div>
      <div style="flex:0 0 auto"><button id="create">Create</button></div>
    </div>
  </div>

  <div class="card">
    <h2>Projects</h2>
    <table>
      <thead><tr>
        <th>ID</th><th>Name</th><th>Public key</th><th>Status</th><th>Rate/min</th><th>Origins</th><th></th>
      </tr></thead>
      <tbody id="rows"><tr><td colspan="7" class="empty">Enter token to load.</td></tr></tbody>
    </table>
  </div>
</div>

<div class="overlay" id="overlay">
  <div class="modal">
    <div class="modal-head">
      <div><h3 id="mTitle">Errors</h3><span class="sub" id="mSub"></span></div>
      <button class="x" id="mClose">✕ Close</button>
    </div>
    <div id="mBody"></div>
  </div>
</div>

<div class="toast" id="toast"></div>

<script>
const $ = (s) => document.querySelector(s)
const rowsEl = $('#rows')
let token = localStorage.getItem('observer_admin_token') || ''
$('#token').value = token

function toast(msg, bad) {
  const t = $('#toast'); t.textContent = msg
  t.style.borderColor = bad ? 'var(--red)' : 'var(--border)'
  t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2200)
}
function setStatus(ok, text) {
  $('#status').className = 'dot ' + (ok ? 'ok' : 'bad')
  $('#statusText').textContent = text || ''
}
async function api(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: { 'X-Admin-Token': token, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(res.status === 401 ? 'Unauthorized — bad token' : 'HTTP ' + res.status)
  return res.status === 204 ? null : res.json()
}
function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])) }

function render(projects) {
  if (!projects.length) { rowsEl.innerHTML = '<tr><td colspan="7" class="empty">No projects yet.</td></tr>'; return }
  rowsEl.innerHTML = projects.map((p) => {
    const origins = (p.allowedOrigins && p.allowedOrigins.length) ? p.allowedOrigins.join(', ') : '<span class="muted">any</span>'
    return \`<tr data-key="\${esc(p.publicKey)}">
      <td class="muted">\${p.id}</td>
      <td>\${esc(p.name)}</td>
      <td class="key"><code>\${esc(p.publicKey)}</code>
        <button class="ghost" style="padding:2px 6px;font-size:11px" data-copy="\${esc(p.publicKey)}">copy</button></td>
      <td><span class="pill \${p.isActive ? 'on' : 'off'}">\${p.isActive ? 'active' : 'inactive'}</span></td>
      <td><input class="rl" type="number" min="1" value="\${p.rateLimitPerMinute}" data-rl /></td>
      <td style="max-width:200px;font-size:12px" class="muted">\${origins}</td>
      <td><div class="actions">
        <button class="ghost" data-logs data-name="\${esc(p.name)}">Logs</button>
        <button class="ghost" data-save>Save rate</button>
        <button class="ghost" data-flush>Flush cache</button>
        <button class="\${p.isActive ? 'danger' : ''}" data-toggle>\${p.isActive ? 'Deactivate' : 'Activate'}</button>
      </div></td>
    </tr>\`
  }).join('')
}

async function load() {
  if (!token) { setStatus(false, 'no token'); return }
  try {
    const projects = await api('GET', '/admin/projects')
    render(projects); setStatus(true, projects.length + ' project(s)')
  } catch (e) { setStatus(false, e.message); rowsEl.innerHTML = '<tr><td colspan="7" class="empty">' + esc(e.message) + '</td></tr>' }
}

$('#saveToken').onclick = () => {
  token = $('#token').value.trim()
  localStorage.setItem('observer_admin_token', token)
  toast('Token saved'); load()
}
$('#create').onclick = async () => {
  const name = $('#newName').value.trim()
  if (!name) return toast('Name required', true)
  const origins = $('#newOrigins').value.split(',').map((s) => s.trim()).filter(Boolean)
  try {
    await api('POST', '/admin/projects', { name, allowedOrigins: origins })
    $('#newName').value = ''; $('#newOrigins').value = ''
    toast('Created'); load()
  } catch (e) { toast(e.message, true) }
}
rowsEl.addEventListener('click', async (ev) => {
  const btn = ev.target.closest('button'); if (!btn) return
  const tr = btn.closest('tr'); const key = tr && tr.dataset.key
  if (btn.dataset.copy !== undefined) {
    navigator.clipboard.writeText(btn.dataset.copy).then(() => toast('Copied'))
    return
  }
  try {
    if (btn.hasAttribute('data-save')) {
      const rl = Number(tr.querySelector('[data-rl]').value)
      await api('PATCH', '/admin/projects/' + encodeURIComponent(key), { rateLimitPerMinute: rl })
      toast('Rate limit updated')
    } else if (btn.hasAttribute('data-toggle')) {
      const activate = btn.textContent.trim() === 'Activate'
      await api('PATCH', '/admin/projects/' + encodeURIComponent(key), { isActive: activate })
      toast(activate ? 'Activated' : 'Deactivated'); load()
    } else if (btn.hasAttribute('data-flush')) {
      await api('POST', '/admin/projects/' + encodeURIComponent(key) + '/flush-cache')
      toast('Cache flushed')
    } else if (btn.hasAttribute('data-logs')) {
      openLogs(key, btn.dataset.name)
    }
  } catch (e) { toast(e.message, true) }
})

// --- Error logs modal ---
const overlay = $('#overlay')
function closeModal() { overlay.classList.remove('show') }
$('#mClose').onclick = closeModal
overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal() })
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal() })

function fmtDate(s) { try { return new Date(s).toLocaleString() } catch { return s } }

const PAGE_SIZE = 25
let currentKey = '', currentName = ''
const logState = { status: '', offset: 0, total: 0 }
const STATUSES = ['', 'new', 'resolved', 'ignored']

async function openLogs(key, name) {
  currentKey = key; currentName = name || ''
  logState.status = ''; logState.offset = 0; logState.total = 0
  $('#mTitle').textContent = 'Errors · ' + (name || key)
  $('#mSub').textContent = key
  overlay.classList.add('show')
  await loadErrors()
}

async function loadErrors() {
  $('#mBody').innerHTML = '<div class="empty">Loading…</div>'
  const params = new URLSearchParams({
    limit: String(PAGE_SIZE),
    offset: String(logState.offset),
  })
  if (logState.status) params.set('status', logState.status)
  try {
    const res = await api('GET', '/admin/projects/' + encodeURIComponent(currentKey) + '/errors?' + params)
    logState.total = res.total
    renderErrorList(res.items)
  } catch (e) { $('#mBody').innerHTML = '<div class="empty">' + esc(e.message) + '</div>' }
}

function renderNav() {
  const from = logState.total ? logState.offset + 1 : 0
  const to = Math.min(logState.offset + PAGE_SIZE, logState.total)
  const hasPrev = logState.offset > 0
  const hasNext = to < logState.total
  const tabs = STATUSES.map((s) =>
    \`<button class="ghost tab \${logState.status === s ? 'active' : ''}" data-status="\${s}">\${s || 'all'}</button>\`
  ).join('')
  return \`<div class="lognav">
    <div class="tabs">\${tabs}</div>
    <div class="pager">
      <span class="muted" style="font-size:12px">\${from}–\${to} of \${logState.total}</span>
      <button class="ghost" data-prev \${hasPrev ? '' : 'disabled'}>← Prev</button>
      <button class="ghost" data-next \${hasNext ? '' : 'disabled'}>Next →</button>
    </div>
  </div>\`
}

function renderErrorList(errors) {
  const nav = renderNav()
  const table = !errors.length
    ? '<div class="empty">No errors' + (logState.status ? ' with status "' + esc(logState.status) + '"' : '') + '.</div>'
    : \`<table><thead><tr>
        <th>Count</th><th>Level</th><th>Source</th><th>Status</th><th>Message</th><th>Last seen</th>
        </tr></thead><tbody>\` + errors.map((e) => \`
        <tr class="err-row" data-err="\${e.id}">
          <td>\${e.occurrences_count}</td>
          <td><span class="lvl \${esc(e.level || 'error')}">\${esc(e.level || 'error')}</span></td>
          <td><span class="src">\${esc(e.source)}</span></td>
          <td><span class="badge \${esc(e.status)}">\${esc(e.status)}</span>\${e.jira_key ? ' <span class="muted" style="font-size:11px">' + esc(e.jira_key) + '</span>' : ''}</td>
          <td style="max-width:360px">\${esc(e.message)}</td>
          <td class="muted" style="font-size:12px">\${fmtDate(e.last_seen)}</td>
        </tr>\`).join('') + '</tbody></table>'
  $('#mBody').innerHTML = nav + table

  $('#mBody').querySelectorAll('.err-row').forEach((row) => {
    row.onclick = () => openErrorDetail(row.dataset.err)
  })
  $('#mBody').querySelectorAll('.tab').forEach((b) => {
    b.onclick = () => { logState.status = b.dataset.status; logState.offset = 0; loadErrors() }
  })
  const prev = $('#mBody').querySelector('[data-prev]')
  const next = $('#mBody').querySelector('[data-next]')
  if (prev) prev.onclick = () => { if (logState.offset > 0) { logState.offset -= PAGE_SIZE; loadErrors() } }
  if (next) next.onclick = () => {
    if (logState.offset + PAGE_SIZE < logState.total) { logState.offset += PAGE_SIZE; loadErrors() }
  }
}

async function openErrorDetail(id) {
  $('#mBody').innerHTML = '<div class="empty">Loading…</div>'
  try {
    const d = await api('GET', '/admin/errors/' + id)
    const e = d.error
    const occ = d.occurrences || []
    const crumbs = (occ[0] && occ[0].breadcrumbs) || []
    const crumbHtml = crumbs.length ? \`
      <h2 style="margin-top:16px">User trail before error <span class="muted" style="font-weight:400">· latest occurrence</span></h2>
      <ul class="crumbs">\` + crumbs.map((c) => {
        const t = (c.type || 'log')
        const time = c.timestamp ? new Date(c.timestamp).toLocaleTimeString() : ''
        return \`<li class="crumb \${esc(t)}">
          <span class="ct">\${esc(time)}</span>
          <span class="cc">\${esc(c.category || t)}</span>
          <span class="cm">\${esc(c.message || '')}</span>
        </li>\`
      }).join('') + '</ul>' : ''
    const occRows = occ.length ? occ.map((o) => \`<tr>
      <td class="muted" style="font-size:12px">\${fmtDate(o.occurred_at)}</td>
      <td style="font-size:12px">\${esc(o.route || '—')}</td>
      <td class="muted" style="font-size:12px">\${esc(o.user_id || '—')}</td>
      <td class="muted" style="font-size:12px">\${esc(o.app_version || '—')}</td>
    </tr>\`).join('') : '<tr><td colspan="4" class="empty">No occurrences.</td></tr>'
    $('#mBody').innerHTML = \`
      <button class="ghost back" id="mBack">← Back to list</button>
      <div class="det-head">
        <div>
          <span class="lvl \${esc(e.level || 'error')}">\${esc(e.level || 'error')}</span>
          <span class="src">\${esc(e.source)}</span>
          <span class="badge \${esc(e.status)}">\${esc(e.status)}</span>
          <span class="muted" style="font-size:12px">· \${e.occurrences_count} occurrence(s) · first \${fmtDate(e.first_seen)}</span>
        </div>
        <div class="actions" data-status-actions data-id="\${e.id}">
          <button class="ghost" data-set="resolved" \${e.status === 'resolved' ? 'disabled' : ''}>Resolve</button>
          <button class="ghost" data-set="ignored" \${e.status === 'ignored' ? 'disabled' : ''}>Ignore</button>
          <button class="ghost" data-set="new" \${e.status === 'new' ? 'disabled' : ''}>Reopen</button>
        </div>
      </div>
      <div style="font-weight:600;margin-bottom:2px">\${esc(e.message)}</div>
      <pre>\${esc(e.stack || '(no stack)')}</pre>
      \${crumbHtml}
      <h2 style="margin-top:16px">Recent occurrences</h2>
      <table><thead><tr><th>When</th><th>Route</th><th>User</th><th>App ver</th></tr></thead>
        <tbody>\${occRows}</tbody></table>\`
    $('#mBack').onclick = () => loadErrors()
    $('#mBody').querySelectorAll('[data-status-actions] button').forEach((b) => {
      b.onclick = async () => {
        const wrap = b.closest('[data-status-actions]')
        try {
          await api('PATCH', '/admin/errors/' + wrap.dataset.id, { status: b.dataset.set })
          toast('Status → ' + b.dataset.set)
          openErrorDetail(wrap.dataset.id)
        } catch (err) { toast(err.message, true) }
      }
    })
  } catch (e) { $('#mBody').innerHTML = '<div class="empty">' + esc(e.message) + '</div>' }
}

load()
</script>
</body>
</html>`
