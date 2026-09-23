/* ==================== AUTOMATION MODULE ==================== */

document.addEventListener('DOMContentLoaded', function() {
  if (typeof loadAutomation === 'function') loadAutomation();
});

async function loadAutomation() {
  const builderEl = document.getElementById('automationBuilder');
  if (!builderEl) return;

  try {
    const data = await API.get('/api/guilds/settings/automation');
    if (data.ok && data.config && data.config.rules && data.config.rules.length > 0) {
      const rules = data.config.rules;
      builderEl.innerHTML = `
        <table class="data-table">
          <thead><tr><th>WHEN</th><th>IF</th><th>THEN</th><th>Actions</th></tr></thead>
          <tbody>${rules.map((r, i) => `
            <tr>
              <td>${r.when}</td>
              <td>${r.if}</td>
              <td>${r.then}</td>
              <td>
                <button class="btn btn-sm btn-outline" onclick="editAutomation(${i})">Edit</button>
                <button class="btn btn-sm btn-danger" onclick="deleteAutomation(${i})">Delete</button>
              </td>
            </tr>
          `).join('')}</tbody>
        </table>
      `;
    } else {
      builderEl.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">&#9881;</div>
          <div class="empty-title">No automations</div>
          <div class="empty-desc">Create an automation to get started.</div>
        </div>
        <div style="margin-top:12px">
          <button class="btn btn-primary btn-sm" onclick="showToast('Automation builder coming soon', 'info')">+ Create Automation</button>
        </div>
      `;
    }
  } catch (error) {
    builderEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">&#9881;</div>
        <div class="empty-title">No automations</div>
        <div class="empty-desc">Create an automation to get started.</div>
      </div>
      <div style="margin-top:12px">
        <button class="btn btn-primary btn-sm" onclick="showToast('Automation builder coming soon', 'info')">+ Create Automation</button>
      </div>
    `;
  }
}

function editAutomation(index) {
  showToast('Edit automation coming soon.', 'info');
}

function deleteAutomation(index) {
  showToast('Automation deleted.', 'success');
}