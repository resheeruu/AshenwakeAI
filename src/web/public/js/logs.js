/* ==================== LOGS SECTION ==================== */

AshenSection('logs', { mount: mountLogs, unmount: unmountLogs });

let logsStream = null;
let logsCtx = null;
let logsRendered = [];

function mountLogs(ctx) {
  logsCtx = ctx;
  stopLogStream();

  const list = document.getElementById('logsList');
  const audit = document.getElementById('auditList');
  if (list) list.innerHTML = AshenUI.loading('Loading system log…');
  if (audit) audit.innerHTML = AshenUI.loading('Loading audit trail…');

  wireLiveTail(ctx);

  if (!ctx.isStaff) {
    if (list) list.innerHTML = AshenUI.denied('The system log is visible to admin and owner accounts.');
    if (audit) audit.innerHTML = AshenUI.denied('The audit trail is visible to owner accounts.');
    return;
  }

  loadLogSnapshot(ctx, list);
  loadAudit(ctx, audit);
}

function unmountLogs() {
  stopLogStream();
  logsCtx = null;
  logsRendered = [];
}

function stopLogStream() {
  if (logsStream) {
    try { logsStream.close(); } catch (_) { /* already closed */ }
    logsStream = null;
  }
  const btn = document.getElementById('logsLiveBtn');
  if (btn) { btn.setAttribute('aria-pressed', 'false'); btn.textContent = 'Live tail'; }
  const badge = document.getElementById('logsLiveBadge');
  if (badge) { badge.textContent = 'snapshot'; badge.className = 'badge badge-muted'; }
}

function wireLiveTail(ctx) {
  const btn = document.getElementById('logsLiveBtn');
  if (!btn) return;
  btn.hidden = !ctx.isStaff;
  btn.onclick = function () {
    if (logsStream) { stopLogStream(); return; }
    if (!ctx.isStaff) return;
    startLogStream(ctx);
  };
}

function startLogStream(ctx) {
  const list = document.getElementById('logsList');
  if (!list || typeof EventSource === 'undefined') return;

  stopLogStream();
  logsRendered = [];
  list.innerHTML = '';

  try {
    logsStream = new EventSource('/api/logs/stream');
  } catch (err) {
    list.innerHTML = AshenUI.failure(err, 'Live tail unavailable');
    return;
  }

  const btn = document.getElementById('logsLiveBtn');
  if (btn) { btn.setAttribute('aria-pressed', 'true'); btn.textContent = 'Stop live tail'; }
  const badge = document.getElementById('logsLiveBadge');
  if (badge) { badge.textContent = 'live'; badge.className = 'badge badge-accent'; }

  logsStream.addEventListener('log', function (event) {
    if (!logsCtx || ctx.stale()) { stopLogStream(); return; }
    let entry;
    try { entry = JSON.parse(event.data); } catch (_) { return; }
    if (!entry || logsRendered.some((e) => e.id === entry.id)) return;
    logsRendered.unshift(entry);
    if (logsRendered.length > 200) logsRendered.length = 200;
    list.innerHTML = renderLogEntries(logsRendered);
  });

  logsStream.onerror = function () {
    /* EventSource reconnects on its own; surface the state in the badge. */
    const b = document.getElementById('logsLiveBadge');
    if (b) { b.textContent = 'reconnecting'; b.className = 'badge badge-yellow'; }
  };
}

async function loadLogSnapshot(ctx, list) {
  try {
    const data = await API.get('/api/logs?limit=100');
    if (!logsCtx || ctx.stale()) return;
    const entries = (data && data.logs && data.logs.entries) || [];
    logsRendered = entries.slice().reverse();
    if (list) list.innerHTML = logsRendered.length
      ? renderLogEntries(logsRendered)
      : AshenUI.empty('Nothing logged yet', 'Newest events appear at the top.', '≣');
  } catch (err) {
    if (!logsCtx || ctx.stale()) return;
    if (list) list.innerHTML = AshenUI.failure(err, 'System log unavailable');
  }
}

async function loadAudit(ctx, audit) {
  if (!audit) return;
  if (!ctx.isOwner) {
    audit.innerHTML = AshenUI.denied('The audit trail is owner-only. Admins can read the system log above.');
    return;
  }
  try {
    const data = await API.get('/api/audit?limit=50');
    if (!logsCtx || ctx.stale()) return;
    const entries = (data && data.entries) || [];
    if (!entries.length) {
      audit.innerHTML = AshenUI.empty('No audit entries yet', 'Account, configuration and provider actions are recorded here.', '⛉');
      return;
    }
    audit.innerHTML = '<div class="table-wrap"><table class="data-table"><thead><tr>' +
      '<th>When</th><th>Who</th><th>What</th><th>Where</th><th>Result</th>' +
      '</tr></thead><tbody>' +
      entries.map((e) => {
        const ts = e.timestamp ? new Date(e.timestamp) : null;
        const when = ts && !isNaN(ts) ? ts.toLocaleString() : '—';
        const tone = e.result === 'success' ? 'badge-green'
          : e.result === 'failure' || e.result === 'error' ? 'badge-red'
          : e.result === 'denied' ? 'badge-yellow' : 'badge-muted';
        return '<tr>' +
          '<td>' + escapeHtml(when) + '</td>' +
          '<td>' + escapeHtml(e.whoName || e.who || '—') + '</td>' +
          '<td>' + escapeHtml(redact(e.what || '')) +
          (e.details ? '<div class="cell-sub">' + escapeHtml(redact(e.details)) + '</div>' : '') + '</td>' +
          '<td>' + escapeHtml(e.where || '—') + '</td>' +
          '<td><span class="badge ' + tone + '">' + escapeHtml(e.result || '—') + '</span></td>' +
          '</tr>';
      }).join('') +
      '</tbody></table></div>';
  } catch (err) {
    if (!logsCtx || ctx.stale()) return;
    audit.innerHTML = AshenUI.failure(err, 'Audit trail unavailable');
  }
}

function renderLogEntries(entries) {
  return '<div class="log-list">' + entries.map((e) => {
    const ts = e.timestamp ? new Date(e.timestamp) : null;
    const stamp = ts && !isNaN(ts) ? ts.toLocaleTimeString() : '';
    const level = String(e.level || 'info').toLowerCase();
    return '<div class="log-entry">' +
      '<span class="log-ts">' + escapeHtml(stamp) + '</span>' +
      '<span class="log-level ' + escapeHtml(level) + '">' + escapeHtml(String(e.level || 'info').toUpperCase()) + '</span>' +
      '<span class="log-msg">' + escapeHtml(redact(e.message || '')) + '</span>' +
      '</div>';
  }).join('') + '</div>';
}
