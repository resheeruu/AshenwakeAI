/* ==================== PUBLIC STATUS PAGE ==================== */
/* Reads the same /api/health payload the dashboard health pill uses.
   Only fields the endpoint actually returns are displayed. */

(function () {
  function esc(value) {
    return escapeHtml(value);
  }

  function dotFor(tone) {
    return '<span class="status-dot status-dot-' + tone + '" aria-hidden="true"></span>';
  }

  function label(value) {
    const s = String(value == null ? '' : value);
    if (s === 'ok' || s === 'ready' || s === 'passed' || s === 'pass') return 'Operational';
    if (s === 'error' || s === 'failed' || s === 'BLOCKED') return 'Down';
    if (s === 'degraded' || s === 'warn' || s === 'warning' || s === 'pending') return 'Degraded';
    return s || 'Unknown';
  }

  function toneFor(value) {
    const s = String(value == null ? '' : value);
    if (s === 'ok' || s === 'ready' || s === 'passed' || s === 'pass') return 'green';
    if (s === 'error' || s === 'failed' || s === 'BLOCKED') return 'red';
    if (s === 'degraded' || s === 'warn' || s === 'warning' || s === 'pending') return 'yellow';
    return 'yellow';
  }

  function row(name, value, detail) {
    const tone = toneFor(value);
    return '<div class="provider-row">' +
      '<div class="provider-main">' +
      '<div class="provider-name">' + esc(name) + '</div>' +
      '<div class="provider-meta"><span>' + esc(detail || '') + '</span></div>' +
      '</div>' +
      '<div class="inline-actions">' + dotFor(tone) +
      '<strong class="text-' + (tone === 'green' ? 'green' : tone === 'red' ? 'red' : 'yellow') + '">' +
      esc(label(value)) + '</strong></div>' +
      '</div>';
  }

  async function paint() {
    const host = document.getElementById('statusRows');
    const meta = document.getElementById('statusMeta');
    const pill = document.getElementById('statusPill');
    const pillText = document.getElementById('statusPillText');
    if (!host) return;

    host.innerHTML = '<div class="hint">Checking…</div>';

    let data;
    let failed = false;
    try {
      const res = await fetch('/api/health', { headers: { Accept: 'application/json' } });
      data = await res.json();
      if (!res.ok) failed = true;
    } catch (err) {
      failed = true;
      data = null;
    }

    if (pill && pillText) {
      if (failed) {
        pill.classList.add('is-down');
        pill.classList.remove('is-degraded');
        pillText.textContent = 'Status unavailable';
      } else if (data && data.ok) {
        pill.classList.remove('is-degraded', 'is-down');
        pillText.textContent = 'All systems operational';
      } else {
        pill.classList.add('is-degraded');
        pill.classList.remove('is-down');
        pillText.textContent = 'Some systems degraded';
      }
    }

    if (!data) {
      host.innerHTML = '<div class="unauthorized"><p>The health endpoint did not respond. Try again shortly.</p></div>';
      if (meta) meta.textContent = '';
      return;
    }

    host.innerHTML =
      row('AshenAI overall', data.ok ? 'ok' : 'degraded', data.ok ? 'Health gate passing' : 'Health gate not passing') +
      row('HTTP dashboard', 'ok', 'This page was served by the dashboard process') +
      row('Database', data.database, 'SQLite store') +
      row('Startup preflight', data.preflight, 'Boot-time dependency checks');

    if (meta) {
      const checked = data.timestamp ? new Date(data.timestamp) : null;
      meta.textContent = 'Version ' + esc(String(data.version || 'unknown')) +
        (checked && !isNaN(checked) ? ' · checked ' + esc(checked.toLocaleString()) : '');
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    paint();
    const retry = document.getElementById('statusRetry');
    if (retry) retry.addEventListener('click', paint);
  });
})();
