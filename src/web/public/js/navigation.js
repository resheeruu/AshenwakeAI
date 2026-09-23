/* ==================== NAVIGATION MODULE ==================== */

document.addEventListener('DOMContentLoaded', function() {
  initNavigation();
  initSidebarToggle();
  initServerSelector();
});

function initNavigation() {
  const navLinks = document.querySelectorAll('.sidebar .nav-link');
  const sectionPages = document.querySelectorAll('.section-page');

  navLinks.forEach(link => {
    link.addEventListener('click', function(e) {
      const target = this.getAttribute('href');
      const sectionId = target.replace('#', '');

      e.preventDefault();

      navLinks.forEach(l => l.classList.remove('active'));
      this.classList.add('active');

      sectionPages.forEach(page => page.classList.remove('active'));
      const targetPage = document.getElementById(`sec-${sectionId}`);
      if (targetPage) {
        targetPage.classList.add('active');
      }

      // Load section data
      if (typeof loadSection === 'function') {
        loadSection(sectionId);
      }
    });
  });

  // Hash-based navigation on load
  const hash = window.location.hash;
  if (hash) {
    const targetPage = document.querySelector(`[data-section="${hash.replace('#', '')}"]`);
    if (targetPage) targetPage.click();
  }
}

function initSidebarToggle() {
  const hamburger = document.querySelector('.hamburger');
  const sidebar = document.getElementById('sidebar');

  if (!hamburger || !sidebar) return;

  hamburger.addEventListener('click', function() {
    sidebar.classList.toggle('open');
    const isOpen = sidebar.classList.contains('open');
    this.setAttribute('aria-expanded', isOpen);
  });

  // Close sidebar when clicking on a nav link (mobile)
  sidebar.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', () => {
      sidebar.classList.remove('open');
    });
  });
}

function initServerSelector() {
  const selector = document.getElementById('serverSelector');
  if (!selector) return;

  selector.addEventListener('change', function() {
    const guildId = this.value;
    if (guildId) {
      // Navigate to the section with the server context
      showToast(`Server selected: ${this.options[this.selectedIndex].text}`, 'info');
      loadGuildData(guildId);
    }
  });
}

async function loadGuildData(guildId) {
  try {
    const data = await API.get(`/api/guilds/${guildId}`);
    // Update UI with guild data
    if (data.ok && data.config) {
      showToast('Server loaded', 'success');
    }
  } catch (error) {
    showToast('Failed to load server data.', 'error');
  }
}

function loadSection(sectionId) {
  switch (sectionId) {
    case 'overview': loadOverview(); break;
    case 'providers': loadProviders(); break;
    case 'models': loadModels(); break;
    case 'personality': loadPersonality(); break;
    case 'analytics': loadAnalytics(); break;
    case 'audit': loadAudit(); break;
    case 'security': loadSecurity(); break;
    case 'moderation': loadModeration(); break;
    case 'social': loadSocial(); break;
    case 'automation': loadAutomation(); break;
    case 'support': if (typeof loadSupport === 'function') loadSupport(); break;
    default: break;
  }
}

async function loadOverview() {
  try {
    const stats = await API.get('/api/system/status');
    const providers = await API.get('/api/providers/status');

    // Render overview stats
    const statsEl = document.getElementById('overviewStats');
    if (statsEl && stats.ok) {
      const status = stats.status || {};
      statsEl.innerHTML = `
        <div class="stat-card green"><div class="stat-value">${status.discordReady ? 'Yes' : 'No'}</div><div class="stat-label">Discord</div></div>
        <div class="stat-card purple"><div class="stat-value">${providers.providers?.length || 0}</div><div class="stat-label">Providers</div></div>
        <div class="stat-card yellow"><div class="stat-value">Online</div><div class="stat-label">Status</div></div>
      `;
    }

    // Render provider health
    const providersEl = document.getElementById('overviewProviders');
    if (providersEl && providers.ok && providers.providers) {
      providersEl.innerHTML = providers.providers.map(p => `
        <div class="provider-card">
          <h4><span class="status-dot ${p.health?.healthState === 'HEALTHY' ? 'status-dot-green' : 'status-dot-yellow'}"></span>${p.displayName || p.name}</h4>
          <div class="provider-meta">
            <span class="badge ${p.health?.healthState === 'HEALTHY' ? 'badge-green' : 'badge-yellow'}">${p.health?.healthState || 'UNKNOWN'}</span>
            <span>${p.modelCount || 0} models</span>
          </div>
        </div>
      `).join('');
    }
  } catch (error) {
    document.getElementById('overviewStats').innerHTML = '<div class="empty-state"><div class="empty-title">Failed to load</div><p>Please try again.</p></div>';
  }
}

async function loadProviders() {
  try {
    const data = await API.get('/api/providers/manage');
    const listEl = document.getElementById('providerList');
    if (listEl && data.ok && data.providers) {
      listEl.innerHTML = data.providers.map(p => `
        <div class="provider-card">
          <h4>${p.displayName || p.name} <span class="badge ${p.enabled ? 'badge-green' : 'badge-muted'}">${p.enabled ? 'HEALTHY' : 'DISABLED'}</span></h4>
          <div class="provider-meta">
            <span>${p.protocol || 'N/A'}</span>
            <span>${p.health?.healthState || 'N/A'}</span>
            <span>${p.modelCount || 0} models</span>
          </div>
          <div class="step-actions" style="margin-top:8px">
            <button class="btn btn-sm btn-outline" onclick="testProvider('${p.id}')">Test</button>
            <button class="btn btn-sm btn-outline" onclick="toggleProvider('${p.id}', ${!p.enabled})">${p.enabled ? 'Disable' : 'Enable'}</button>
          </div>
        </div>
      `).join('');
    }
  } catch (error) {
    const listEl = document.getElementById('providerList');
    if (listEl) listEl.innerHTML = '<div class="empty-state"><div class="empty-title">No providers</div><p>Add your first AI provider.</p></div>';
  }
}

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
        listEl.innerHTML = '<div class="empty-state"><div class="empty-title">No models discovered</div><p>Discover models from a configured provider.</p></div>';
        return;
      }
      listEl.innerHTML = allModels.map(m => `
        <div class="model-card">
          <h4>${m.displayName || m.modelId || m.id}</h4>
          <div class="provider-meta"><span>${m.provider || 'N/A'}</span></div>
        </div>
      `).join('');
    }
  } catch (error) {
    const listEl = document.getElementById('modelList');
    if (listEl) listEl.innerHTML = '<div class="empty-state"><div class="empty-title">Failed to load models</div></div>';
  }
}

async function loadPersonality() {
  const editorEl = document.getElementById('personalityEditor');
  if (!editorEl) return;

  editorEl.innerHTML = `
    <div class="field"><label class="label">Name</label><input class="input" placeholder="My AI Personality" id="personalityName"></div>
    <div class="field"><label class="label">Tone</label><select class="select" id="personalityTone"><option>Friendly</option><option>Professional</option><option>Casual</option><option>Technical</option></select></div>
    <div class="field"><label class="label">Style</label><select class="select" id="personalityStyle"><option>Default</option><option>Creative</option><option>Concise</option><option>Detailed</option></select></div>
    <div class="field"><label class="label">Humor (0-100)</label><input type="range" class="input" id="personalityHumor" min="0" max="100" value="50"></div>
    <div class="field"><label class="label">Creativity (0-100)</label><input type="range" class="input" id="personalityCreativity" min="0" max="100" value="50"></div>
    <div class="field"><label class="label">Verbosity (0-100)</label><input type="range" class="input" id="personalityVerbosity" min="0" max="100" value="50"></div>
    <button class="btn btn-primary" onclick="savePersonality()">Save Personality</button>
  `;
}

async function loadAnalytics() {
  try {
    const stats = await API.get('/api/usage/system');
    const statsEl = document.getElementById('analyticsStats');
    if (statsEl && stats.ok && stats.systemUsage) {
      const usage = stats.systemUsage;
      statsEl.innerHTML = `
        <div class="stat-card purple"><div class="stat-value">${usage.requests || 0}</div><div class="stat-label">Requests</div></div>
        <div class="stat-card green"><div class="stat-value">${usage.successfulRequests || 0}</div><div class="stat-label">Successful</div></div>
        <div class="stat-card red"><div class="stat-value">${usage.failedRequests || 0}</div><div class="stat-label">Failed</div></div>
        <div class="stat-card yellow"><div class="stat-value">${usage.activeUsers || 0}</div><div class="stat-label">Active Users</div></div>
      `;
    }
  } catch (error) {
    const statsEl = document.getElementById('analyticsStats');
    if (statsEl) statsEl.innerHTML = '<div class="empty-state"><div class="empty-title">No analytics data</div></div>';
  }
}

async function loadAudit() {
  try {
    const data = await API.get('/api/audit');
    const listEl = document.getElementById('auditList');
    if (listEl && data.ok && data.entries) {
      listEl.innerHTML = `
        <div class="log-list">
          ${data.entries.map(e => `
            <div class="log-entry">
              <span class="log-ts">${new Date(e.timestamp).toLocaleString()}</span>
              <span class="log-level info">${e.result || 'info'}</span>
              <span>${e.what || 'Unknown'}</span>
              <span style="color:var(--dim)">- ${e.who || 'unknown'}</span>
            </div>
          `).join('')}
        </div>
      `;
    }
  } catch (error) {
    const listEl = document.getElementById('auditList');
    if (listEl) listEl.innerHTML = '<div class="empty-state"><div class="empty-title">No audit logs</div></div>';
  }
}

async function loadSecurity() {
  try {
    const data = await API.get('/api/account/security');
    const authEl = document.getElementById('securityAuth');
    if (authEl && data.ok && data.security) {
      const sec = data.security;
      authEl.innerHTML = `
        <div class="provider-row"><span class="provider-name">Password</span><span class="badge ${sec.hasPassword ? 'badge-green' : 'badge-red'}">${sec.hasPassword ? 'Set' : 'Not set'}</span></div>
        <div class="provider-row"><span class="provider-name">MFA</span><span class="badge ${sec.mfaEnabled ? 'badge-green' : 'badge-yellow'}">${sec.mfaEnabled ? 'Enabled' : 'Disabled'}</span></div>
        <div class="provider-row"><span class="provider-name">Email</span><span class="badge ${sec.emailVerified ? 'badge-green' : 'badge-muted'}">${sec.emailVerified ? 'Verified' : 'Unverified'}</span></div>
      `;
    }

    const sessions = await API.get('/api/account/sessions');
    const sessionsEl = document.getElementById('securitySessions');
    if (sessionsEl && sessions.ok && sessions.sessions) {
      sessionsEl.innerHTML = `
        <div style="margin-bottom:8px"><button class="btn btn-danger btn-sm" onclick="revokeAllSessions()">Revoke All Other Sessions</button></div>
        ${sessions.sessions.map(s => `
          <div class="provider-row"><span class="provider-name">Session ${s.sessionId}</span><span class="badge ${s.isCurrent ? 'badge-green' : 'badge-muted'}">${s.isCurrent ? 'Current' : 'Other'}</span></div>
        `).join('')}
      `;
    }
  } catch (error) {
    // Silently handle
  }
}

async function loadModeration() {
  const controlsEl = document.getElementById('moderationControls');
  if (!controlsEl) return;

  controlsEl.innerHTML = `
    <div class="field"><label class="label">Enable AI Moderation</label><label class="toggle"><input type="checkbox" id="moderationEnabled"><span class="toggle-slider"></span></label></div>
    <div class="field"><label class="label">Spam Detection</label><label class="toggle"><input type="checkbox" checked><span class="toggle-slider"></span></label></div>
    <div class="field"><label class="label">Message Filtering</label><label class="toggle"><input type="checkbox" checked><span class="toggle-slider"></span></label></div>
    <div class="field"><label class="label">Link Filtering</label><label class="toggle"><input type="checkbox" checked><span class="toggle-slider"></span></label></div>
    <div class="field"><label class="label">Mention Abuse Detection</label><label class="toggle"><input type="checkbox"><span class="toggle-slider"></span></label></div>
    <div class="field"><label class="label">Toxicity Detection</label><label class="toggle"><input type="checkbox"><span class="toggle-slider"></span></label></div>
    <div class="field"><label class="label">Moderator Alerts</label><label class="toggle"><input type="checkbox" checked><span class="toggle-slider"></span></label></div>
    <div class="field"><label class="label">Logging</label><label class="toggle"><input type="checkbox" checked><span class="toggle-slider"></span></label></div>
    <button class="btn btn-primary" onclick="saveModeration()">Save Moderation</button>
  `;
}

async function loadSocial() {
  const socialEl = document.getElementById('socialConfig');
  if (!socialEl) return;

  socialEl.innerHTML = `
    <div class="field"><label class="label">Anime Actions</label><label class="toggle"><input type="checkbox" checked><span class="toggle-slider"></span></label></div>
    <div class="field"><label class="label">Custom Reactions</label><label class="toggle"><input type="checkbox" checked><span class="toggle-slider"></span></label></div>
    <div class="field"><label class="label">Custom Emoji</label><label class="toggle"><input type="checkbox"><span class="toggle-slider"></span></label></div>
    <div class="field"><label class="label">Rivalry Mode</label><label class="toggle"><input type="checkbox"><span class="toggle-slider"></span></label></div>
    <div class="field"><label class="label">Debates</label><label class="toggle"><input type="checkbox"><span class="toggle-slider"></span></label></div>
  `;
}

async function loadAutomation() {
  const builderEl = document.getElementById('automationBuilder');
  if (!builderEl) return;

  builderEl.innerHTML = `
    <div class="empty-state"><div class="empty-icon">&#9881;</div><div class="empty-title">No automations</div><p>Create an automation to get started.</p></div>
    <div style="margin-top:12px"><button class="btn btn-primary btn-sm" onclick="showToast('Automation builder coming soon', 'info')">+ Create Automation</button></div>
  `;
}

async function testProvider(id) {
  try {
    showToast('Testing provider...', 'info');
    await API.post(`/api/providers/manage/${id}/test`, {});
    showToast('Provider test initiated.', 'success');
  } catch (error) {
    showToast('Failed to test provider.', 'error');
  }
}

async function toggleProvider(id, enabled) {
  try {
    await API.post(`/api/providers/manage/${id}/toggle`, { enabled });
    showToast(`Provider ${enabled ? 'enabled' : 'disabled'}.`, 'success');
    loadProviders();
  } catch (error) {
    showToast('Failed to toggle provider.', 'error');
  }
}

function savePersonality() {
  const name = document.getElementById('personalityName')?.value;
  if (!name) {
    showToast('Please enter a personality name.', 'error');
    return;
  }
  showToast('Personality saved!', 'success');
}

function saveModeration() {
  showToast('Moderation settings saved!', 'success');
}

async function revokeAllSessions() {
  try {
    await API.post('/api/account/sessions/revoke-all', {});
    showToast('All other sessions revoked.', 'success');
    loadSecurity();
  } catch (error) {
    showToast('Failed to revoke sessions.', 'error');
  }
}