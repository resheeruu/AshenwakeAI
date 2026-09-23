/* ==================== ANALYTICS MODULE ==================== */

document.addEventListener('DOMContentLoaded', function() {
  if (typeof loadAnalytics === 'function') loadAnalytics();
});

async function loadAnalytics() {
  try {
    const [systemUsage, logs] = await Promise.all([
      API.get('/api/usage/system'),
      API.get('/api/logs?limit=100'),
    ]);

    const statsEl = document.getElementById('analyticsStats');
    if (statsEl && systemUsage.ok && systemUsage.systemUsage) {
      const usage = systemUsage.systemUsage;
      statsEl.innerHTML = `
        <div class="stat-card purple"><div class="stat-value">${usage.requests || 0}</div><div class="stat-label">Requests</div></div>
        <div class="stat-card green"><div class="stat-value">${usage.successfulRequests || 0}</div><div class="stat-label">Successful</div></div>
        <div class="stat-card red"><div class="stat-value">${usage.failedRequests || 0}</div><div class="stat-label">Failed</div></div>
        <div class="stat-card yellow"><div class="stat-value">${usage.activeUsers || 0}</div><div class="stat-label">Active Users</div></div>
      `;
    }

    const chartEl = document.getElementById('analyticsChart');
    if (chartEl && logs.ok && logs.logs) {
      const recentLogs = logs.logs.slice(0, 20);
      chartEl.innerHTML = `
        <div class="log-list">
          ${recentLogs.map(e => `
            <div class="log-entry">
              <span class="log-ts">${new Date(e.timestamp).toLocaleString()}</span>
              <span class="log-level ${e.level || 'info'}">${e.level || 'INFO'}</span>
              <span>${e.message || e.what || 'Unknown'}</span>
            </div>
          `).join('')}
        </div>
      `;
    }
  } catch (error) {
    const statsEl = document.getElementById('analyticsStats');
    if (statsEl) {
      statsEl.innerHTML = `
        <div class="stat-card purple"><div class="stat-value">0</div><div class="stat-label">Requests</div></div>
        <div class="stat-card green"><div class="stat-value">0</div><div class="stat-label">Successful</div></div>
        <div class="stat-card red"><div class="stat-value">0</div><div class="stat-label">Failed</div></div>
      `;
    }
    const chartEl = document.getElementById('analyticsChart');
    if (chartEl) chartEl.innerHTML = '<div class="empty-state"><div class="empty-title">No analytics data</div></div>';
  }
}