/* ==================== SECURITY SECTION ==================== */

AshenSection('security', { mount: mountSecurity, unmount: unmountSecurity });

let securityCtx = null;
let pendingMfaSetup = null;

function mountSecurity(ctx) {
  securityCtx = ctx;
  const auth = document.getElementById('securityAuth');
  const password = document.getElementById('securityPassword');
  const sessions = document.getElementById('securitySessions');
  const identities = document.getElementById('securityIdentities');
  if (!auth || !password || !sessions || !identities) return;

  auth.innerHTML = AshenUI.loading('Loading account state…');
  password.innerHTML = renderPasswordForm();
  password.setAttribute('data-wired', '');
  sessions.innerHTML = AshenUI.loading('Loading sessions…');
  identities.innerHTML = AshenUI.loading('Loading linked providers…');
  wirePasswordChange();

  loadAccountSecurity(ctx, auth);
  loadSessions(ctx, sessions);
  loadIdentities(ctx, identities);
}

function unmountSecurity() {
  securityCtx = null;
}

/* ---------- authentication card ---------- */

async function loadAccountSecurity(ctx, host) {
  let security;
  try {
    const data = await API.get('/api/account/security');
    if (!securityCtx || ctx.stale()) return;
    security = (data && data.security) || {};
  } catch (err) {
    if (!securityCtx || ctx.stale()) return;
    host.innerHTML = AshenUI.failure(err, 'Account security unavailable');
    return;
  }

  const canMfa = ctx.role === 'owner' || ctx.role === 'admin';
  let html =
    AshenUI.row('Password', security.hasPassword ? 'Set on this account' : 'No password — sign in with a linked provider',
      AshenUI.badge(security.hasPassword ? 'Set' : 'Not set', security.hasPassword ? 'badge-green' : 'badge-yellow')) +
    AshenUI.row('Two-factor', security.mfaEnabled ? 'Authenticator app required at sign-in' : 'Not enabled yet',
      AshenUI.badge(security.mfaEnabled ? 'Enabled' : 'Disabled', security.mfaEnabled ? 'badge-green' : 'badge-yellow')) +
    AshenUI.row('Email', security.email || 'No email on file',
      AshenUI.badge(security.emailVerified ? 'Verified' : (security.email ? 'Unverified' : 'None'),
        security.emailVerified ? 'badge-green' : 'badge-muted'));

  if (!canMfa) {
    html += '<div class="info-note">Two-factor setup is available to owner and admin accounts.</div>';
    host.innerHTML = html;
    return;
  }

  if (pendingMfaSetup) {
    html += '<div class="subpanel">' +
      '<div class="kv-k">Step 1 — scan</div>' +
      (pendingMfaSetup.qrCode
        ? '<img class="mfa-qr" src="' + escapeHtml(pendingMfaSetup.qrCode) + '" alt="Authenticator QR code">'
        : '') +
      '<div class="hint">Secret: <code class="code-inline">' + escapeHtml(pendingMfaSetup.secret || '') + '</code></div>' +
      '<div class="hint">Add this key manually if you cannot scan.</div>' +
      '</div>' +
      '<div class="field-line"><div class="fl-text">' +
      '<label class="fl-title" for="mfaSetupCode">Step 2 — confirm</label>' +
      '<div class="fl-desc">Enter the 6-digit code your app shows now.</div></div>' +
      '<input class="input input-num" type="text" id="mfaSetupCode" maxlength="6" inputmode="numeric" autocomplete="one-time-code" placeholder="000000">' +
      '</div>' +
      '<div class="form-actions">' +
      '<button class="btn btn-primary btn-sm" type="button" data-save="mfa-verify">Enable two-factor</button>' +
      '<button class="btn btn-ghost btn-sm" type="button" id="mfaCancelSetup">Cancel</button>' +
      '</div>';
  } else if (security.mfaEnabled) {
    html += '<div class="subpanel">' +
      AshenUI.text('mfaPassword', 'Password', 'Required to change two-factor settings.', '', ' type="password" autocomplete="current-password"') +
      AshenUI.text('mfaCode', 'Current code', 'Six digits from your authenticator app.', '', ' maxlength="6" inputmode="numeric" autocomplete="one-time-code"') +
      '<div class="form-actions">' +
      '<button class="btn btn-secondary btn-sm" type="button" data-save="mfa-recovery">New recovery codes</button>' +
      '<button class="btn btn-danger btn-sm" type="button" data-save="mfa-disable">Disable two-factor</button>' +
      '</div></div>';
  } else {
    html += '<div class="form-actions">' +
      '<button class="btn btn-primary btn-sm" type="button" data-save="mfa-setup">Set up two-factor</button>' +
      '<span class="fa-note">Recommended for owner accounts</span>' +
      '</div>';
  }

  host.innerHTML = html;
  wireSecurityAuth(ctx, host, security);
}

function wireSecurityAuth(ctx, host, security) {
  const cancel = document.getElementById('mfaCancelSetup');
  if (cancel) {
    cancel.addEventListener('click', function () {
      pendingMfaSetup = null;
      loadAccountSecurity(ctx, host);
    });
  }

  AshenUI.bindSave(host, async function (gate) {
    if (gate === 'mfa-setup') {
      const data = await API.post('/auth/mfa/setup', {});
      pendingMfaSetup = {
        secret: data.secret,
        qrCode: data.qrCode
      };
      loadAccountSecurity(ctx, host);
      return;
    }
    if (gate === 'mfa-verify') {
      const code = (document.getElementById('mfaSetupCode').value || '').trim();
      if (!/^\d{6}$/.test(code)) throw { message: 'Enter the 6-digit code from your app.' };
      const data = await API.post('/auth/mfa/verify', { code: code, enable: true });
      pendingMfaSetup = null;
      if (data.recoveryCodes && data.recoveryCodes.length) {
        showRecoveryCodes(data.recoveryCodes, data.warning);
      } else {
        showToast(data.message || 'Two-factor enabled.', 'success');
      }
      await loadAccountSecurity(ctx, host);
      return;
    }
    if (gate === 'mfa-disable') {
      const password = document.getElementById('mfaPassword').value;
      const code = (document.getElementById('mfaCode').value || '').trim();
      if (!password) throw { message: 'Enter your password to disable two-factor.' };
      if (!/^\d{6}$/.test(code)) throw { message: 'Enter your current 6-digit code.' };
      if (!window.confirm('Disable two-factor authentication? Your account will be less protected.')) return;
      const data = await API.post('/auth/mfa/disable', { password: password, code: code });
      showToast(data.message || 'Two-factor disabled.', 'success');
      await loadAccountSecurity(ctx, host);
      return;
    }
    if (gate === 'mfa-recovery') {
      const password = document.getElementById('mfaPassword').value;
      if (!password) throw { message: 'Enter your password to regenerate recovery codes.' };
      const data = await API.post('/auth/mfa/recovery-codes', { password: password });
      const codes = data.recoveryCodes || [];
      if (codes.length) showRecoveryCodes(codes, data.warning);
      else showToast(data.message || 'Recovery codes regenerated.', 'success');
    }
  });
}

function showRecoveryCodes(codes, warning) {
  const existing = document.getElementById('recoveryCodeBox');
  if (existing) existing.remove();

  const box = document.createElement('div');
  box.id = 'recoveryCodeBox';
  box.className = 'info-note warn-note';

  const title = document.createElement('div');
  title.className = 'kv-k';
  title.textContent = warning || 'Save these recovery codes securely. They will not be shown again.';

  const grid = document.createElement('div');
  grid.className = 'chipline';
  codes.forEach((code) => {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = code;
    grid.appendChild(chip);
  });

  const copy = document.createElement('button');
  copy.type = 'button';
  copy.className = 'btn btn-sm btn-secondary';
  copy.textContent = 'Copy all';
  copy.addEventListener('click', function () {
    if (navigator.clipboard) navigator.clipboard.writeText(codes.join('\n'));
    showToast('Recovery codes copied.', 'success');
  });

  box.appendChild(title);
  box.appendChild(grid);
  box.appendChild(copy);

  const host = document.getElementById('securityAuth');
  if (host) host.insertBefore(box, host.firstChild);
}

/* ---------- password card ---------- */

function renderPasswordForm() {
  return '<div class="field">' +
    '<label class="label" for="pwCurrent">Current password</label>' +
    '<input class="input" type="password" id="pwCurrent" autocomplete="current-password">' +
    '</div>' +
    '<div class="field">' +
    '<label class="label" for="pwNew">New password</label>' +
    '<input class="input" type="password" id="pwNew" autocomplete="new-password">' +
    '<div class="hint">At least 8 characters.</div>' +
    '</div>' +
    '<div class="field">' +
    '<label class="label" for="pwConfirm">Confirm new password</label>' +
    '<input class="input" type="password" id="pwConfirm" autocomplete="new-password">' +
    '</div>' +
    '<div class="form-actions">' +
    '<button class="btn btn-primary btn-sm" type="button" data-save="password">Change password</button>' +
    '<span class="fa-note">Signing out everywhere</span>' +
    '</div>';
}

function wirePasswordChange() {
  const host = document.getElementById('securityPassword');
  if (!host || host.getAttribute('data-wired') === '1') return;
  host.setAttribute('data-wired', '1');
  AshenUI.bindSave(host, async function (gate) {
    if (gate !== 'password') return;
    const current = document.getElementById('pwCurrent').value;
    const next = document.getElementById('pwNew').value;
    const confirm = document.getElementById('pwConfirm').value;
    if (!current) throw { message: 'Enter your current password.' };
    if (next.length < 8) throw { message: 'New password must be at least 8 characters.' };
    if (next !== confirm) throw { message: 'New passwords do not match.' };

    await API.post('/auth/change-password', { currentPassword: current, newPassword: next });
    showToast('Password changed. Sign in again.', 'success');
    window.setTimeout(function () { window.location.href = '/login'; }, 900);
  });
}

/* ---------- sessions card ---------- */

async function loadSessions(ctx, host) {
  let sessions;
  try {
    const data = await API.get('/api/account/sessions');
    if (!securityCtx || ctx.stale()) return;
    sessions = (data && data.sessions) || [];
  } catch (err) {
    if (!securityCtx || ctx.stale()) return;
    host.innerHTML = AshenUI.failure(err, 'Sessions unavailable');
    return;
  }

  if (!sessions.length) {
    host.innerHTML = AshenUI.empty('No sessions recorded', 'Active sessions appear here.', '⛉');
    return;
  }

  host.innerHTML = '<div class="inline-actions">' +
    AshenUI.badge(sessions.length + ' active', 'badge-blue') +
    '<span class="spacer"></span>' +
    '<button class="btn btn-danger btn-sm" type="button" id="revokeAllSessions">Sign out everywhere else</button>' +
    '</div>' +
    '<div class="provider-list">' + sessions.map((s) => {
      const created = s.createdAt ? new Date(s.createdAt) : null;
      const expires = s.expiresAt ? new Date(s.expiresAt) : null;
      return '<div class="provider-row">' +
        '<div class="provider-main">' +
        '<div class="provider-name">' + escapeHtml(s.sessionId) +
        (s.isCurrent ? ' ' + AshenUI.badge('This device', 'badge-green') : '') + '</div>' +
        '<div class="provider-meta">' +
        '<span>IP ' + escapeHtml(s.lastSeenIp || '—') + '</span>' +
        '<span>started ' + escapeHtml(created && !isNaN(created) ? created.toLocaleString() : '—') + '</span>' +
        '<span>expires ' + escapeHtml(expires && !isNaN(expires) ? expires.toLocaleString() : '—') + '</span>' +
        '</div></div>' +
        (s.isCurrent
          ? '<span class="text-dim">current</span>'
          : '<button class="btn btn-sm btn-danger" type="button" data-revoke="' + escapeHtml(s.sessionId) + '">Revoke</button>') +
        '</div>';
    }).join('') + '</div>';

  const revokeAll = document.getElementById('revokeAllSessions');
  if (revokeAll) {
    revokeAll.addEventListener('click', async function () {
      if (!window.confirm('Sign out of every other device?')) return;
      try {
        const data = await API.post('/api/account/sessions/revoke-all', {});
        showToast((data && data.revoked != null ? data.revoked + ' session(s) revoked.' : 'Other sessions revoked.'), 'success');
        await loadSessions(ctx, host);
      } catch (err) {
        showToast(Ashen.describeError(err), 'error');
      }
    });
  }

  host.querySelectorAll('[data-revoke]').forEach((btn) => {
    btn.addEventListener('click', async function () {
      const id = this.getAttribute('data-revoke');
      try {
        await API.post('/api/account/sessions/' + encodeURIComponent(id) + '/revoke', {});
        showToast('Session revoked.', 'success');
        await loadSessions(ctx, host);
      } catch (err) {
        showToast(Ashen.describeError(err), 'error');
      }
    });
  });
}

/* ---------- linked providers card ---------- */

async function loadIdentities(ctx, host) {
  let security;
  try {
    const data = await API.get('/api/account/security');
    if (!securityCtx || ctx.stale()) return;
    security = (data && data.security) || {};
  } catch (err) {
    if (!securityCtx || ctx.stale()) return;
    host.innerHTML = AshenUI.failure(err, 'Linked providers unavailable');
    return;
  }

  const linked = security.linkedProviders || [];
  const providers = ['discord', 'google'];

  host.innerHTML = '<div class="provider-list">' + providers.map((name) => {
    const entry = linked.find((l) => l.provider === name);
    const linkedAt = entry && entry.linkedAt ? new Date(entry.linkedAt) : null;
    return '<div class="provider-row">' +
      '<div class="provider-main">' +
      '<div class="provider-name">' + escapeHtml(name === 'discord' ? 'Discord' : 'Google') + '</div>' +
      '<div class="provider-meta">' +
      (entry
        ? '<span>' + escapeHtml(entry.displayName || 'linked') + '</span>' +
          '<span>linked ' + escapeHtml(linkedAt && !isNaN(linkedAt) ? linkedAt.toLocaleDateString() : '—') + '</span>'
        : '<span class="text-dim">Not linked</span>') +
      '</div></div>' +
      (entry
        ? '<button class="btn btn-sm btn-danger" type="button" data-unlink="' + escapeHtml(name) + '">Unlink</button>'
        : '<button class="btn btn-sm btn-secondary" type="button" data-link="' + escapeHtml(name) + '">Link</button>') +
      '</div>';
  }).join('') + '</div>' +
  '<div class="hint">Unlinking is blocked while it would leave you with no way to sign in.</div>';

  host.querySelectorAll('[data-link]').forEach((btn) => {
    btn.addEventListener('click', async function () {
      const provider = this.getAttribute('data-link');
      try {
        const data = await API.post('/api/account/identities/' + encodeURIComponent(provider) + '/link', {});
        if (data && data.url) window.location.href = data.url;
        else showToast('Linking could not be started.', 'error');
      } catch (err) {
        showToast(Ashen.describeError(err), 'error');
      }
    });
  });

  host.querySelectorAll('[data-unlink]').forEach((btn) => {
    btn.addEventListener('click', async function () {
      const provider = this.getAttribute('data-unlink');
      if (!window.confirm('Unlink ' + provider + ' from this account?')) return;
      try {
        await API.post('/api/account/identities/' + encodeURIComponent(provider) + '/unlink', {});
        showToast(provider + ' unlinked.', 'success');
        await loadIdentities(ctx, host);
      } catch (err) {
        showToast(Ashen.describeError(err), 'error');
      }
    });
  });
}
