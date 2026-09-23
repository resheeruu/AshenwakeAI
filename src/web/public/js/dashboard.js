/* ==================== DASHBOARD MODULE ==================== */

document.addEventListener('DOMContentLoaded', function() {
  if (typeof initNavigation !== 'undefined') return;
});

function initDashboard() {
  loadOverview();
  loadServerList();
}

async function loadServerList() {
  try {
    const data = await API.get('/api/guilds');
    const selector = document.getElementById('serverSelector');
    if (selector && data.ok && data.guilds) {
      const guilds = data.guilds;
      selector.innerHTML = '<option value="">Select Server</option>' +
        guilds.map(g => `<option value="${g.guildId}">${g.guildName || g.guildId}</option>`).join('');
    }
  } catch (error) {
    // Silently handle
  }
}