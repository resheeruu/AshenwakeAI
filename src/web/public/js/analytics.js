/* ==================== ANALYTICS SECTION ==================== */

AshenSection('analytics', { mount: mountAnalytics });

function mountAnalytics(ctx) {
  const stats = document.getElementById('analyticsStats');
  const detail = document.getElementById('analyticsDetail');
  if (!stats || !detail) return;

  if (!ctx.isStaff) {
    stats.innerHTML = AshenUI.stat('—', 'Requests') + AshenUI.stat('—', 'Tokens') + AshenUI.stat('—', 'Credits') + AshenUI.stat('—', 'Failures');
    detail.innerHTML = AshenUI.denied('Usage counters are visible to admin and owner accounts.');
    return;
  }

  stats.innerHTML = AshenUI.skeleton(4);
  detail.innerHTML = AshenUI.loading('Loading counters…');
  loadAnalytics(ctx, stats, detail);
}

async function loadAnalytics(ctx, stats, detail) {
  let usage = null;
  let system = null;
  let errors = null;

  const jobs = [
    API.get('/api/usage/global').then((d) => { usage = d && d.usage; }).catch((err) => { usage = { __error: err }; }),
    API.get('/api/usage/system').then((d) => { system = d && d.systemUsage; }).catch(() => { system = null; }),
    API.get('/api/logs/errors?limit=8').then((d) => { errors = d && d.errors && d.errors.entries; }).catch(() => { errors = null; })
  ];
  await Promise.all(jobs);
  if (ctx.stale()) return;

  if (usage && usage.__error) {
    stats.innerHTML = AshenUI.failure(usage.__error, 'Usage counters unavailable');
    detail.innerHTML = AshenUI.failure(usage.__error, 'Usage breakdown unavailable');
    return;
  }

  const g = (usage && usage.global) || {};
  const failureRate = g.totalRequests ? Math.round((g.failures / g.totalRequests) * 1000) / 10 : 0;

  stats.innerHTML =
    AshenUI.stat(formatCount(g.totalRequests), 'Requests', '', 'All routed AI calls') +
    AshenUI.stat(formatCount(g.totalTokens), 'Tokens', '', 'Prompt + completion') +
    AshenUI.stat(formatCount(g.totalCredits), 'Credits', '', 'Weighted cost units') +
    AshenUI.stat(formatCount(g.failures), 'Failures', g.failures ? 'red' : 'green', failureRate + '% of requests');

  let html = '';

  const providers = usage && usage.providers ? Object.keys(usage.providers) : [];
  if (providers.length) {
    html += '<div class="table-wrap"><table class="data-table"><thead><tr>' +
      '<th>Provider</th><th>Requests</th><th>Credits</th><th>Avg latency</th>' +
      '</tr></thead><tbody>' +
      providers.sort((a, b) => (usage.providers[b].requests || 0) - (usage.providers[a].requests || 0))
        .map((name) => {
          const p = usage.providers[name] || {};
          return '<tr>' +
            '<td><strong>' + escapeHtml(name) + '</strong></td>' +
            '<td>' + escapeHtml(formatCount(p.requests)) + '</td>' +
            '<td>' + escapeHtml(formatCount(p.credits)) + '</td>' +
            '<td>' + escapeHtml(Math.round(Number(p.latency) || 0) + ' ms') + '</td>' +
            '</tr>';
        }).join('') +
      '</tbody></table></div>';
  } else {
    html += AshenUI.empty('No provider traffic yet', 'Counters start as soon as a request is routed.', '▥');
  }

  if (system && system.global) {
    const sg = system.global;
    html += '<div class="subpanel"><div class="kv-grid">' +
      AshenUI.kvCell('Credits today', sg.totalCreditsToday) +
      AshenUI.kvCell('Daily budget', sg.dailyLimit) +
      AshenUI.kvCell('Budget used', sg.dailyLimit ? Math.round((sg.totalCreditsToday / sg.dailyLimit) * 100) + '%' : '—') +
      AshenUI.kvCell('Tracked systems', sg.bySystem ? Object.keys(sg.bySystem).length : 0) +
      '</div></div>';

    if (sg.bySystem && Object.keys(sg.bySystem).length) {
      html += '<div class="subpanel"><div class="table-wrap"><table class="data-table"><thead><tr>' +
        '<th>System</th><th>Operations</th><th>Credits</th><th>Failures</th>' +
        '</tr></thead><tbody>' +
        Object.keys(sg.bySystem).map((name) => {
          const s = sg.bySystem[name] || {};
          return '<tr><td><strong>' + escapeHtml(name) + '</strong></td>' +
            '<td>' + escapeHtml(formatCount(s.operations)) + '</td>' +
            '<td>' + escapeHtml(formatCount(s.credits)) + '</td>' +
            '<td>' + escapeHtml(formatCount(s.failures)) + '</td></tr>';
        }).join('') +
        '</tbody></table></div></div>';
    }
  }

  if (errors && errors.length) {
    html += '<div class="subpanel"><div class="kv-k">Recent failures</div><div class="log-list">' +
      errors.map((e) => {
        const when = e.timestamp ? new Date(e.timestamp) : null;
        const stamp = when && !isNaN(when) ? when.toLocaleString() : '';
        return '<div class="log-entry">' +
          '<span class="log-ts">' + escapeHtml(stamp) + '</span>' +
          '<span class="log-level error">ERROR</span>' +
          '<span class="log-msg">' + escapeHtml(redact(e.message || '')) + '</span>' +
          '</div>';
      }).join('') +
      '</div></div>';
  }

  detail.innerHTML = html;
}

function formatCount(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0';
  if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return String(n);
}
