/* ==================== AUTOMATION MODULE ==================== */

function getSelectedGuildId() {
  const selector = document.getElementById('serverSelector');
  if (selector && selector.value) return selector.value;
  try {
    return localStorage.getItem('selectedGuildId') || '';
  } catch {
    return '';
  }
}

document.addEventListener('DOMContentLoaded', function() {
  if (typeof loadAutomation === 'function') loadAutomation();
});

async function loadAutomation() {
  const builderEl = document.getElementById('automationBuilder');
  if (!builderEl) return;

  const guildId = getSelectedGuildId();
  if (!guildId) {
    builderEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">&#9881;</div>
        <div class="empty-title">Select a server</div>
        <div class="empty-desc">Choose a server to manage automations.</div>
      </div>
    `;
    return;
  }

  try {
    const data = await API.get(`/api/guilds/${guildId}/automation/rules`);
    const rules = (data.ok && Array.isArray(data.rules)) ? data.rules : [];
    if (rules.length > 0) {
      builderEl.innerHTML = `
        <table class="data-table">
          <thead><tr><th>Name</th><th>Trigger</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>${rules.map((r) => `
            <tr data-rule-id="${escapeHtml(r.id)}">
              <td>${escapeHtml(r.name)}</td>
              <td>${escapeHtml(r.triggerType)}</td>
              <td><span class="badge ${r.enabled ? 'badge-green' : 'badge-gray'}">${r.enabled ? 'Enabled' : 'Disabled'}</span></td>
              <td>
                <button class="btn btn-sm btn-outline" data-action="edit" data-rule-id="${escapeHtml(r.id)}">Edit</button>
                <button class="btn btn-sm btn-danger" data-action="delete" data-rule-id="${escapeHtml(r.id)}">Delete</button>
              </td>
            </tr>
          `).join('')}</tbody>
        </table>
      `;
      builderEl.querySelectorAll('button[data-action]').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const target = e.currentTarget as HTMLButtonElement;
          const ruleId = target.getAttribute('data-rule-id');
          if (!ruleId) return;
          if (target.getAttribute('data-action') === 'delete') {
            await deleteAutomation(guildId, ruleId);
          } else {
            showToast('Edit automation coming soon.', 'info');
          }
        });
      });
    } else {
      builderEl.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">&#9881;</div>
          <div class="empty-title">No automations</div>
          <div class="empty-desc">Create an automation to get started.</div>
        </div>
        <div style="margin-top:12px">
          <button class="btn btn-primary btn-sm" id="createAutomationBtn">+ Create Automation</button>
        </div>
      `;
      const createBtn = document.getElementById('createAutomationBtn');
      if (createBtn) {
        createBtn.addEventListener('click', () => createAutomation(guildId));
      }
    }
  } catch (error) {
    builderEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">&#9881;</div>
        <div class="empty-title">Failed to load automations</div>
        <div class="empty-desc">${escapeHtml(error && error.message ? error.message : 'Unknown error')}</div>
      </div>
    `;
  }
}

async function createAutomation(guildId) {
  try {
    await API.post(`/api/guilds/${guildId}/automation/rules`, {
      name: `Automation ${new Date().toLocaleString()}`,
      triggerType: 'message',
      enabled: true,
      conditions: [],
      actions: [],
    });
    showToast('Automation created.', 'success');
    await loadAutomation();
  } catch (error) {
    showToast(error && error.message ? error.message : 'Failed to create automation.', 'error');
  }
}

async function deleteAutomation(guildId, ruleId) {
  try {
    await API.delete(`/api/guilds/${guildId}/automation/rules/${encodeURIComponent(ruleId)}`);
    showToast('Automation deleted.', 'success');
    await loadAutomation();
  } catch (error) {
    showToast(error && error.message ? error.message : 'Failed to delete automation.', 'error');
  }
}

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
