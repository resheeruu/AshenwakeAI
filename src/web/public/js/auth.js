/* ==================== AUTH MODULE ==================== */

const Auth = {
  challengeToken: null,
  booted: false,
  bound: false,

  /* ---------- screens ---------- */

  screen(id) {
    ['bootScreen', 'loginScreen', 'mfaChallengeScreen'].forEach((name) => {
      const el = document.getElementById(name);
      if (el) el.classList.toggle('open', name === id);
    });
    const app = document.getElementById('app');
    if (app) app.classList.toggle('open', id === null);
    document.body.classList.toggle('auth-locked', id !== null);
  },

  showBoot() { this.screen('bootScreen'); },

  showLogin(message, tone) {
    this.screen('loginScreen');
    const errorEl = document.getElementById('loginError');
    if (errorEl) {
      errorEl.textContent = message || '';
      errorEl.className = 'auth-error' + (message && tone !== 'error' ? ' is-info' : '');
    }
    const btn = document.getElementById('loginBtn');
    if (btn) { btn.disabled = false; btn.textContent = 'Sign in'; }
  },

  showMfa(subtitle) {
    this.screen('mfaChallengeScreen');
    const el = document.getElementById('mfaChallengeSubtitle');
    if (el && subtitle) el.textContent = subtitle;
    const err = document.getElementById('mfaError');
    if (err) err.textContent = '';
    const code = document.getElementById('mfaCode');
    if (code) { code.value = ''; setTimeout(() => code.focus(), 60); }
  },

  /* ---------- session ---------- */

  paintIdentity(role) {
    const labels = { owner: 'Owner', admin: 'Admin', user: 'Member' };
    const classes = { owner: 'role-owner', admin: 'role-admin', user: 'role-user' };
    const label = labels[role] || 'Member';
    const badge = document.getElementById('topRoleBadge');
    if (badge) {
      badge.textContent = label.toUpperCase();
      badge.className = 'role-badge ' + (classes[role] || 'role-user');
    }
    const user = document.getElementById('sidebarUser');
    if (user) {
      user.textContent = Ashen.username || 'Not signed in';
      user.title = (Ashen.username || '') + ' · ' + label;
    }
    document.querySelectorAll('.nav-badge.neutral').forEach((node) => {
      node.hidden = !Ashen.isStaff();
    });
  },

  async loadGuilds() {
    if (!Ashen.isStaff()) {
      Ashen.setGuilds([]);
      return;
    }
    try {
      const data = await API.get('/api/guilds');
      Ashen.setGuilds((data && data.guilds) || []);
    } catch (err) {
      console.error('guild list failed', err);
      Ashen.setGuilds([]);
    }
    const recalled = Ashen.recalledGuild();
    if (recalled && Ashen.guilds.some((g) => g.guildId === recalled)) Ashen.setGuild(recalled);
  },

  /* Bring up the authenticated shell. */
  async enter(username, role, csrfToken, options) {
    const opts = options || {};
    Ashen.setSession(username, role, csrfToken);
    this.paintIdentity(role);
    this.screen(null);
    await this.loadGuilds();
    AshenShell.go(opts.section || this.hashSection() || 'overview');
    if (opts.toast) showToast(opts.toast, 'success');
    this.watchHealth();
  },

  hashSection() {
    const raw = (window.location.hash || '').replace(/^#/, '');
    return /^[a-z]+$/.test(raw) ? raw : '';
  },

  /* ---------- boot ---------- */

  async boot() {
    if (this.booted) return;
    this.booted = true;
    this.bind();
    this.showBoot();

    const params = new URLSearchParams(window.location.search);

    if (params.get('mfa_required') === 'true' && params.get('challengeToken')) {
      this.challengeToken = params.get('challengeToken');
      const name = params.get('username') || '';
      this.showMfa(name
        ? 'Enter the code from your authenticator app for ' + name
        : 'Enter the code from your authenticator app');
      this.cleanUrl();
      this.loadMethods();
      return;
    }

    let session = null;
    try {
      const data = await API.get('/api/me');
      if (data && data.authenticated && data.user) session = data;
    } catch (_) { session = null; }

    if (session) {
      const provider = params.get('provider');
      await this.enter(session.user.username, session.user.role, session.csrfToken, {
        toast: params.get('login') === 'success'
          ? ('Signed in with ' + (provider ? provider[0].toUpperCase() + provider.slice(1) : 'AshenAI') + '.')
          : null
      });
      this.cleanUrl();
      return;
    }

    const message = params.get('message');
    if (params.get('link_required') === 'true') {
      this.showLogin(message || 'That social account is not linked yet. Sign in with your AshenAI account first, then link it from Security.');
    } else if (params.get('login') === 'error' || params.get('error')) {
      this.showLogin(message || params.get('error') || 'Sign-in failed. Please try again.');
    } else if (message) {
      this.showLogin(message);
    } else {
      this.showLogin('');
    }
    this.cleanUrl();
    this.loadMethods();
  },

  cleanUrl() {
    if (!window.history || !window.history.replaceState) return;
    window.history.replaceState(null, '', window.location.pathname);
  },

  async loadMethods() {
    const stack = document.getElementById('oauthButtons');
    if (!stack) return;
    try {
      const data = await API.get('/api/auth/methods');
      const discord = !!(data && data.discord);
      const google = !!(data && data.google);
      const dBtn = document.getElementById('discordBtn');
      const gBtn = document.getElementById('googleBtn');
      if (dBtn) dBtn.hidden = !discord;
      if (gBtn) gBtn.hidden = !google;
      stack.hidden = !(discord || google);
      const divider = document.getElementById('loginDivider');
      if (divider) divider.hidden = stack.hidden;
    } catch (_) {
      stack.hidden = true;
    }
  },

  /* ---------- events ---------- */

  bind() {
    if (this.bound) return;
    this.bound = true;

    const form = document.getElementById('loginForm');
    if (form) form.addEventListener('submit', (e) => this.submitLogin(e));

    const mfaBtn = document.getElementById('mfaVerifyBtn');
    if (mfaBtn) mfaBtn.addEventListener('click', () => this.submitMfa());
    const mfaCode = document.getElementById('mfaCode');
    if (mfaCode) mfaCode.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); this.submitMfa(); }
    });

    const discord = document.getElementById('discordBtn');
    if (discord) discord.addEventListener('click', () => { window.location.href = '/auth/discord'; });
    const google = document.getElementById('googleBtn');
    if (google) google.addEventListener('click', () => { window.location.href = '/auth/google'; });

    const logout = document.getElementById('logoutBtn');
    if (logout) logout.addEventListener('click', () => this.logout());

    Ashen.on('unauthorized', () => this.expire());
  },

  async submitLogin(event) {
    event.preventDefault();
    const btn = document.getElementById('loginBtn');
    const errorEl = document.getElementById('loginError');
    const username = (document.getElementById('loginUser') || {}).value || '';
    const password = (document.getElementById('loginPass') || {}).value || '';

    if (!username.trim() || !password) {
      if (errorEl) errorEl.textContent = 'Username and password are required.';
      return;
    }
    if (btn) { btn.disabled = true; btn.textContent = 'Signing in…'; }
    if (errorEl) errorEl.textContent = '';

    try {
      const data = await API.post('/auth/login', { username: username.trim(), password: password });
      if (data && data.mfaRequired) {
        this.challengeToken = data.challengeToken;
        this.showMfa(data.username
          ? 'Enter the code from your authenticator app for ' + data.username
          : 'Enter the code from your authenticator app');
        return;
      }
      await this.enter(data.user.username, data.user.role, data.csrfToken, { toast: 'Welcome back.' });
    } catch (err) {
      if (errorEl) errorEl.textContent = Ashen.describeError(err);
      if (btn) { btn.disabled = false; btn.textContent = 'Sign in'; }
    }
  },

  async submitMfa() {
    const errorEl = document.getElementById('mfaError');
    const code = ((document.getElementById('mfaCode') || {}).value || '').trim();
    const recovery = ((document.getElementById('mfaRecoveryCode') || {}).value || '').trim();
    if (errorEl) errorEl.textContent = '';

    if (!code && !recovery) {
      if (errorEl) errorEl.textContent = 'Enter your 6-digit code, or a recovery code.';
      return;
    }
    if (!this.challengeToken) {
      if (errorEl) errorEl.textContent = 'This challenge expired. Sign in again.';
      return;
    }

    try {
      const data = await API.post('/auth/mfa/challenge', {
        challengeToken: this.challengeToken,
        code: code || null,
        recoveryCode: recovery || null
      });
      this.challengeToken = null;
      await this.enter(data.user.username, data.user.role, data.csrfToken, { toast: 'Two-factor verified.' });
    } catch (err) {
      if (errorEl) errorEl.textContent = Ashen.describeError(err);
    }
  },

  async logout() {
    try { await API.post('/auth/logout', {}); } catch (_) { /* already gone */ }
    Ashen.clearSession();
    window.location.href = '/login';
  },

  /* Session rejected mid-flight: drop back to the sign-in screen. */
  expire() {
    if (!this.booted) return;
    Ashen.clearSession();
    this.challengeToken = null;
    this.showLogin('Your session ended. Sign in again to continue.');
    this.loadMethods();
  },

  /* ---------- platform health pill ---------- */

  async watchHealth() {
    const paint = (state, text) => {
      const pill = document.getElementById('topStatusPill');
      const label = document.getElementById('topStatus');
      if (pill) {
        pill.classList.toggle('is-degraded', state === 'degraded');
        pill.classList.toggle('is-down', state === 'down');
      }
      if (label) label.textContent = text;
    };
    const probe = async () => {
      try {
        const data = await API.get('/api/health');
        if (data && data.ok) return paint('ok', 'Online');
        const detail = [];
        if (data && data.database && data.database !== 'ok') detail.push('db ' + data.database);
        if (data && data.preflight && data.preflight !== 'ok') detail.push(data.preflight);
        return paint('degraded', detail.length ? detail.join(' · ') : 'Degraded');
      } catch (err) {
        /* /api/health answers 503 with a body when degraded — read it. */
        if (err && err.status === 503 && err.body) {
          const body = err.body;
          if (body.database && body.database !== 'ok') return paint('down', 'Database ' + body.database);
          return paint('degraded', body.preflight || 'Degraded');
        }
        if (err && err.status === 429) return paint('ok', 'Online');
        return paint('down', 'Offline');
      }
    };
    await probe();
    if (this._healthTimer) clearInterval(this._healthTimer);
    this._healthTimer = setInterval(probe, 60000);
  }
};

window.Auth = Auth;
