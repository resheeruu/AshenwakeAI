/* ==================== APP MODULE ==================== */

document.addEventListener('DOMContentLoaded', function () {
  initApp();
});

/*
 * index.html loads this file too so that the escape.js-before-app.js ordering
 * contract holds everywhere. On public pages there is no shell to boot, so we
 * bail before touching anything dashboard-specific.
 */
function initApp() {
  if (typeof Ashen === 'undefined' || typeof Auth === 'undefined') return;
  const shell = document.getElementById('app');
  if (!shell) return;

  initHashRouting();
  Ashen.on('session', paintAppContext);
  Ashen.on('guild:change', paintAppContext);
  Ashen.on('guilds', paintAppContext);

  Auth.boot();
}

/* Mirror the active server into the topbar subtitle. */
function paintAppContext() {
  const target = document.getElementById('topRoleLabel');
  if (!target || typeof Ashen === 'undefined') return;

  const labels = { owner: 'Owner', admin: 'Admin', user: 'Member' };
  const who = Ashen.username || 'Signed in';
  const role = labels[Ashen.role] || 'Member';
  const guild = typeof Ashen.guild === 'function' ? Ashen.guild() : null;
  const server = guild ? (guild.guildName || guild.guildId) : '';

  target.innerHTML = escapeHtml(who + ' · ' + role + (server ? ' · ' + server : ''));
}

function initHashRouting() {
  window.addEventListener('hashchange', function () {
    const id = (window.location.hash || '').replace('#', '');
    if (id && document.getElementById('sec-' + id)) AshenShell.go(id);
  });
}
