/* ==================== SUPPORT MODULE ==================== */

function getSupportGuildId() {
  const selector = document.getElementById('serverSelector');
  if (selector && selector.value) return selector.value;
  try {
    return localStorage.getItem('selectedGuildId') || '';
  } catch {
    return '';
  }
}

function escapeSupportHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function loadSupport() {
  const el = document.getElementById('supportCases');
  if (!el) return;

  const guildId = getSupportGuildId();
  if (!guildId) {
    el.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">&#128172;</div>
        <div class="empty-title">Select a server</div>
        <div class="empty-desc">Choose a server to view support cases.</div>
      </div>
    `;
    return;
  }

  try {
    const data = await API.get(`/api/guilds/${guildId}/support`);
    const cases = (data.ok && Array.isArray(data.cases)) ? data.cases : [];
    if (cases.length === 0) {
      el.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">&#128172;</div>
          <div class="empty-title">No support cases</div>
          <div class="empty-desc">Cases created in Discord will appear here.</div>
        </div>
      `;
      return;
    }
    el.innerHTML = `
      <table class="data-table">
        <thead><tr><th>ID</th><th>Type</th><th>Status</th><th>Summary</th><th>Updated</th></tr></thead>
        <tbody>${cases.map(c => `
          <tr>
            <td><code>${escapeSupportHtml(c.id)}</code></td>
            <td>${escapeSupportHtml(c.type)}</td>
            <td><span class="badge badge-green">${escapeSupportHtml(c.status)}</span></td>
            <td>${escapeSupportHtml(c.summary || '—')}</td>
            <td>${c.updatedAt ? new Date(c.updatedAt).toLocaleString() : '—'}</td>
          </tr>
        `).join('')}</tbody>
      </table>
    `;
  } catch (error) {
    el.innerHTML = `
      <div class="empty-state">
        <div class="empty-title">Failed to load support cases</div>
        <div class="empty-desc">${escapeSupportHtml(error && error.message ? error.message : 'Unknown error')}</div>
      </div>
    `;
  }
}

document.addEventListener('DOMContentLoaded', function() {
  if (typeof loadSupport === 'function') loadSupport();
});
