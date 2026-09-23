/* ==================== APP MODULE ==================== */

document.addEventListener('DOMContentLoaded', function() {
  initApp();
});

function initApp() {
  const params = new URLSearchParams(window.location.search);
  const isDashboard = window.location.pathname === '/dashboard' || params.get('login') === 'success';

  if (isDashboard && !window.location.hash) {
    window.history.replaceState(null, '', '/dashboard');
  }

  initNavigation();
  initDashboard();
  loadManagedProviders();

  // Load section-specific modules
  if (typeof loadSettings === 'function') loadSettings();
  if (typeof loadSecurity === 'function') loadSecurity();
  if (typeof loadModels === 'function') loadModels();
  if (typeof loadAutomation === 'function') loadAutomation();
  if (typeof loadAnalytics === 'function') loadAnalytics();

  // Load provider catalog
  loadProviderCatalog();

  // SSE connection for real-time updates
  initSSE();
}

function initSSE() {
  const source = new EventSource('/api/logs/stream');

  source.addEventListener('log', function(event) {
    try {
      const data = JSON.parse(event.data);
      // Could update real-time logs in the UI
    } catch (e) { /* ignore */ }
  });

  source.onerror = function() {
    // Connection lost, will auto-reconnect via EventSource
    console.log('SSE connection lost, reconnecting...');
  };
}

async function loadManagedProviders() {
  try {
    const data = await API.get('/api/providers/manage');
    const listEl = document.getElementById('managedProviders');
    if (listEl && data.ok && data.providers) {
      listEl.innerHTML = data.providers.map(p => `
        <div class="provider-row">
          <div>
            <div class="provider-name">${p.displayName || p.name}</div>
            <div class="provider-meta"><span>${p.protocol || 'N/A'}</span><span>${p.health?.healthState || 'N/A'}</span></div>
          </div>
          <span class="badge ${p.enabled ? 'badge-green' : 'badge-muted'}">${p.enabled ? 'Active' : 'Inactive'}</span>
        </div>
      `).join('');
    }
  } catch (error) {
    const listEl = document.getElementById('managedProviders');
    if (listEl) listEl.innerHTML = '<div class="empty-state"><div class="empty-title">No providers configured</div></div>';
  }
}