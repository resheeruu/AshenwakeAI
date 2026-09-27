/* ==================== OVERVIEW SECTION ==================== */

AshenSection('overview', { mount: mountOverview });

function mountOverview(ctx) {
  const stats = document.getElementById('overviewStats');
  const health = document.getElementById('overviewProviderHealth');
  const activity = document.getElementById('overviewActivity');
  if (!stats || !health || !activity) return;

  if (!ctx.isStaff) {
    stats.innerHTML =
      AshenUI.stat(Ashen.username || '—', 'Signed in as') +
      AshenUI.stat(Ashen.role === 'user' ? 'Member' : 'Staff', 'Role') +
      AshenUI.stat('0', 'Servers') +
      AshenUI.stat('—', 'Platform');
    health.innerHTML = AshenUI.denied('Platform health is visible to admin and owner accounts.');
    activity.innerHTML = AshenUI.denied('Activity logs are visible to admin and owner accounts.');
    return;
  }

  stats.innerHTML = AshenUI.skeleton(4);
  health.innerHTML = AshenUI.loading('Reading provider health…');
  activity.innerHTML = AshenUI.loading('Reading recent activity…');

  loadOverviewStats(ctx, stats, activity);
  loadOverviewProviders(ctx, health);
}

async function loadOverviewStats(ctx, stats, activity) {
  const jobs = [];

  jobs.push(API.get('/api/system/status')
    .then((d) => ({ kind: 'status', data: d }))
    .catch((err) => ({ kind: 'status', error: err })));

  jobs.push(API.get('/api/system/health')
    .then((d) => ({ kind: 'health', data: d }))
    .catch((err) => ({ kind: 'health', error: err })));

  jobs.push(API.get('/api/logs?limit=6')
    .then((d) => ({ kind: 'logs', data: d }))
    .catch((err) => ({ kind: 'logs', error: err })));

  const results = await Promise.all(jobs);
  if (ctx.stale()) return;

  const status = results.find((r) => r.kind === 'status');
  const check = results.find((r) => r.kind === 'health');
  const logs = results.find((r) => r.kind === 'logs');

  let uptime = '—';
  let version = '—';
  let gateway = '—';
  if (status && status.data && status.data.status) {
    const s = status.data.status;
    uptime = AshenUI.esc(formatUptime(s.uptime));
    version = AshenUI.esc(s.version || '—');
    gateway = s.discord ? (s.discord.ready ? 'Ready' : 'Reconnecting') : 'Unknown';
  }

  let platform = '—';
  let checksPassed = '—';
  if (check && check.data && check.data.health) {
    const h = check.data.health;
    platform = AshenUI.esc(String(h.overall || 'unknown'));
    const list = h.checks || [];
    const passed = list.filter((c) => c.status === 'pass').length;
    checksPassed = list.length ? (passed + '/' + list.length) : '—';
  }

  stats.innerHTML =
    AshenUI.stat(uptime, 'Process uptime', '', version === '—' ? '' : 'v' + version) +
    AshenUI.stat(platform, 'Platform health', toneFor(platform), checksPassed + ' checks passed') +
    AshenUI.stat(gateway, 'Discord gateway', gateway === 'Ready' ? 'green' : 'amber') +
    AshenUI.stat(Ashen.guilds.length, 'Servers authorized', '');

  if (logs) {
    if (logs.error) {
      activity.innerHTML = AshenUI.failure(logs.error, 'Recent activity unavailable');
    } else {
      const entries = (logs.data && logs.data.logs && logs.data.logs.entries) || [];
      activity.innerHTML = entries.length
        ? '<div class="log-list">' + entries.map((e) => {
            const when = e.timestamp ? new Date(e.timestamp) : null;
            const stamp = when && !isNaN(when) ? when.toLocaleTimeString() : '';
            return '<div class="log-entry">' +
              '<span class="log-ts">' + AshenUI.esc(stamp) + '</span>' +
              '<span class="log-level ' + AshenUI.esc(String(e.level || 'info').toLowerCase()) + '">' +
              AshenUI.esc(String(e.level || 'info').toUpperCase()) + '</span>' +
              '<span class="log-msg">' + escapeHtml(e.message || '') + '</span>' +
              '</div>';
          }).join('') + '</div>'
        : AshenUI.empty('Nothing logged yet', 'Newest platform events appear here as they happen.', '≣');
    }
  }
}

async function loadOverviewProviders(ctx, container) {
  if (!ctx.isStaff) return;
  try {
    const data = await API.get('/api/providers/status');
    if (ctx.stale()) return;
    const list = (data && data.providers) || [];
    if (!list.length) {
      container.innerHTML = AshenUI.empty('No providers configured', 'Add a provider from Integrations to route AI requests.', '⧉');
      return;
    }
    container.innerHTML = '<div class="provider-list">' + list.map((p) => {
      const state = p.available ? 'available' : (p.disabledUntil ? 'disabled' : 'offline');
      const tone = state === 'available' ? 'badge-green' : (state === 'disabled' ? 'badge-yellow' : 'badge-red');
      const label = state === 'available' ? 'Available' : (state === 'disabled' ? 'Cooling down' : 'Offline');
      const latency = p.averageLatencyMs ? (Math.round(p.averageLatencyMs) + ' ms avg') : 'no samples';
      return '<div class="provider-row">' +
        '<div class="provider-main">' +
        '<div class="provider-name">' + escapeHtml(p.name || '') + '</div>' +
        '<div class="provider-meta"><span>' + AshenUI.esc(latency) + '</span>' +
        '<span>' + AshenUI.esc(p.successes + ' ok · ' + p.failures + ' failed') + '</span></div>' +
        '</div>' +
        '<span class="badge ' + tone + '">' + label + '</span>' +
        '</div>';
    }).join('') + '</div>';
  } catch (err) {
    if (ctx.stale()) return;
    container.innerHTML = AshenUI.failure(err, 'Provider health unavailable');
  }
}

function toneFor(value) {
  if (value === 'healthy') return 'green';
  if (value === 'degraded') return 'amber';
  if (value === 'unhealthy') return 'red';
  return '';
}

function formatUptime(seconds) {
  const total = Number(seconds) || 0;
  if (total < 60) return Math.floor(total) + 's';
  const mins = Math.floor(total / 60);
  if (mins < 60) return mins + 'm ' + Math.floor(total % 60) + 's';
  const hours = Math.floor(mins / 60);
  if (hours < 24) return hours + 'h ' + (mins % 60) + 'm';
  return Math.floor(hours / 24) + 'd ' + (hours % 24) + 'h';
}
