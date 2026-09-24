/* ==================== MODELS MODULE ==================== */

document.addEventListener('DOMContentLoaded', function() {
  loadModels();
});

async function loadModels() {
  try {
    const selector = document.getElementById('serverSelector');
    const guildId = selector && selector.value ? selector.value : (function() {
      try { return localStorage.getItem('selectedGuildId') || ''; } catch { return ''; }
    })();

    let allModels = [];
    if (guildId) {
      try {
        const guildData = await API.get(`/api/guilds/${guildId}/models`);
        if (guildData.ok && Array.isArray(guildData.models)) {
          allModels = guildData.models;
        }
      } catch { /* fall through to provider list */ }
    }

    if (allModels.length === 0) {
      const data = await API.get('/api/providers/manage');
      if (data.ok && data.providers) {
        for (const p of data.providers) {
          if (p.models) {
            allModels.push(...p.models.map(m => ({
              ...m,
              provider: p.name || p.displayName,
            })));
          }
        }
      }
    }

    const listEl = document.getElementById('modelList');
    if (!listEl) return;

    if (allModels.length === 0) {
      listEl.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">&#128196;</div>
          <div class="empty-title">No models discovered</div>
          <div class="empty-desc">Discover models from a configured provider.</div>
        </div>
      `;
      return;
    }
    listEl.innerHTML = `
      <table class="data-table">
        <thead><tr><th>Model</th><th>Provider</th><th>Capabilities</th><th>Context</th><th>Status</th></tr></thead>
        <tbody>${allModels.map(m => `
          <tr>
            <td><strong>${escapeHtml(m.displayName || m.modelId)}</strong></td>
            <td>${escapeHtml(m.provider || 'N/A')}</td>
            <td>${escapeHtml((m.capabilities || []).join(', ') || 'N/A')}</td>
            <td>${escapeHtml(m.contextLength || 'N/A')}</td>
            <td><span class="badge badge-green">Active</span></td>
          </tr>
        `).join('')}</tbody>
      </table>
    `;
  } catch (error) {
    const listEl = document.getElementById('modelList');
    if (listEl) listEl.innerHTML = '<div class="empty-state"><div class="empty-title">Failed to load models</div></div>';
  }
}