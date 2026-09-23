/* ==================== MODELS MODULE ==================== */

document.addEventListener('DOMContentLoaded', function() {
  loadModels();
});

async function loadModels() {
  try {
    const data = await API.get('/api/providers/manage');
    const listEl = document.getElementById('modelList');
    if (listEl && data.ok && data.providers) {
      let allModels = [];
      for (const p of data.providers) {
        if (p.models) allModels.push(...p.models);
      }
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
              <td><strong>${m.displayName || m.modelId}</strong></td>
              <td>${m.provider || 'N/A'}</td>
              <td>${(m.capabilities || []).join(', ') || 'N/A'}</td>
              <td>${m.contextLength || 'N/A'}</td>
              <td><span class="badge badge-green">Active</span></td>
            </tr>
          `).join('')}</tbody>
        </table>
      `;
    }
  } catch (error) {
    const listEl = document.getElementById('modelList');
    if (listEl) listEl.innerHTML = '<div class="empty-state"><div class="empty-title">Failed to load models</div></div>';
  }
}