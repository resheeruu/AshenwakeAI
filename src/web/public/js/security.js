/* ==================== SECURITY MODULE ==================== */

async function loadSecurity() {
  try {
    const authRes = await API.get('/api/account/security');
    const sessionsRes = await API.get('/api/account/sessions');
    const rateLimitsRes = await API.get('/api/security/rate-limits');

    const authEl = document.getElementById('securityAuth');
    if (authRes.ok && authRes.security && authEl) {
      const sec = authRes.security;
      authEl.innerHTML = `
        <div class="provider-row"><span class="provider-name">Password</span><span class="badge ${sec.hasPassword ? 'badge-green' : 'badge-red'}">${sec.hasPassword ? 'Set' : 'Not set'}</span></div>
        <div class="provider-row"><span class="provider-name">MFA</span><span class="badge ${sec.mfaEnabled ? 'badge-green' : 'badge-yellow'}">${sec.mfaEnabled ? 'Enabled' : 'Disabled'}</span></div>
        <div class="provider-row"><span class="provider-name">Email</span><span class="badge ${sec.emailVerified ? 'badge-green' : 'badge-muted'}">${sec.emailVerified ? 'Verified' : 'Unverified'}</span></div>
      `;
    }

    const sessionsEl = document.getElementById('securitySessions');
    if (sessionsRes.ok && sessionsRes.sessions && sessionsEl) {
      sessionsEl.innerHTML = `
        <div style="margin-bottom:8px"><button class="btn btn-danger btn-sm" onclick="revokeAllSessions()">Revoke All Other Sessions</button></div>
        ${sessionsRes.sessions.map(s => `
          <div class="provider-row"><span class="provider-name">Session ${escapeHtml(s.sessionId)}</span><span class="badge ${s.isCurrent ? 'badge-green' : 'badge-muted'}">${s.isCurrent ? 'Current' : 'Other'}</span></div>
        `).join('')}
      `;
    }
  } catch (error) {
    // Silently handle
  }
}

async function revokeAllSessions() {
  try {
    await API.post('/api/security/sessions/revoke-all', {});
    showToast('All other sessions revoked.', 'success');
    loadSecurity();
  } catch (error) {
    showToast('Failed to revoke sessions.', 'error');
  }
}

document.addEventListener('DOMContentLoaded', function() {
  if (typeof loadSecurity === 'function') loadSecurity();
});
