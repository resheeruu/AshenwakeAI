/* ==================== API CLIENT + SHARED STATE ==================== */

function ApiError(message, status, body) {
  const err = new Error(message);
  err.name = 'ApiError';
  err.status = status;
  err.body = body;
  return err;
}

/*
 * Single source of truth for who is signed in and which server is selected.
 * Section modules read from here instead of re-deriving permission checks,
 * so a role change can never leave one card thinking it is editable.
 */
const Ashen = {
  authenticated: false,
  username: null,
  role: null,
  csrfToken: null,
  guilds: [],
  guildId: '',
  booting: true,
  _subs: Object.create(null),

  on(event, fn) {
    if (!this._subs[event]) this._subs[event] = [];
    this._subs[event].push(fn);
    return () => this.off(event, fn);
  },

  off(event, fn) {
    const list = this._subs[event];
    if (!list) return;
    const i = list.indexOf(fn);
    if (i >= 0) list.splice(i, 1);
  },

  emit(event, detail) {
    (this._subs[event] || []).slice().forEach((fn) => {
      try { fn(detail); } catch (err) { console.error('listener failed for ' + event, err); }
    });
  },

  setSession(username, role, csrfToken) {
    this.authenticated = true;
    this.username = username || null;
    this.role = role || 'user';
    this.csrfToken = csrfToken || null;
    this.emit('session', this);
  },

  clearSession() {
    const wasAuthed = this.authenticated;
    this.authenticated = false;
    this.username = null;
    this.role = null;
    this.csrfToken = null;
    this.guilds = [];
    this.guildId = '';
    if (wasAuthed) this.emit('session', this);
  },

  isStaff() { return this.role === 'owner' || this.role === 'admin'; },
  isOwner() { return this.role === 'owner'; },
  /* Writes are owner-only everywhere in the API; admins get a read-only shell. */
  canEdit() { return this.role === 'owner'; },
  canManageProviders() { return this.isStaff(); },

  setGuilds(list) {
    this.guilds = Array.isArray(list) ? list : [];
    if (this.guildId && !this.guilds.some((g) => g.guildId === this.guildId)) {
      this.guildId = '';
    }
    if (!this.guildId && this.guilds.length) this.guildId = this.guilds[0].guildId;
    this.emit('guilds', this.guilds);
  },

  setGuild(guildId) {
    if (this.guildId === guildId) return;
    this.guildId = guildId || '';
    try {
      if (this.guildId) localStorage.setItem('selectedGuildId', this.guildId);
      else localStorage.removeItem('selectedGuildId');
    } catch (_) { /* storage may be blocked */ }
    this.emit('guild:change', this.guildId);
  },

  rememberGuild(guildId) {
    try { if (guildId) localStorage.setItem('selectedGuildId', guildId); } catch (_) { /* noop */ }
  },

  recalledGuild() {
    try { return localStorage.getItem('selectedGuildId') || ''; } catch (_) { return ''; }
  },

  guild() {
    return this.guilds.find((g) => g.guildId === this.guildId) || null;
  },

  describeError(err) {
    if (!err) return 'Something went wrong.';
    if (err.status === 401) return 'Your session expired. Please sign in again.';
    if (err.status === 403) return 'Your role does not allow this action.';
    if (err.status === 404) return 'Not found.';
    if (err.status === 429) return 'Too many requests — try again shortly.';
    if (err.status >= 500) return 'The server reported an error.';
    return err.message || 'Request failed.';
  }
};

const API = {
  base: '',

  setAuth(token, csrf) {
    /* Legacy signature kept for callers that predate the session model. */
    this.csrfToken = csrf == null ? token : csrf;
    Ashen.csrfToken = this.csrfToken;
  },

  async request(method, path, body, options) {
    const verb = (method || 'GET').toUpperCase();
    const headers = Object.assign({
      'Accept': 'application/json'
    }, options && options.headers ? options.headers : {});

    if (body !== undefined && body !== null) headers['Content-Type'] = 'application/json';

    const csrf = Ashen.csrfToken || this.csrfToken;
    if (csrf && verb !== 'GET' && verb !== 'HEAD' && verb !== 'OPTIONS') {
      headers['X-CSRF-Token'] = csrf;
    }

    const config = Object.assign({}, options, {
      method: verb,
      headers: headers,
      credentials: 'same-origin'
    });
    if (body !== undefined && body !== null && verb !== 'GET') {
      config.body = JSON.stringify(body);
    }

    let response;
    try {
      response = await fetch(this.base + path, config);
    } catch (networkErr) {
      throw ApiError('Network error. Check your connection and try again.', 0, null);
    }

    let data = null;
    const text = await response.text();
    if (text) {
      try { data = JSON.parse(text); }
      catch (_) { data = { ok: response.ok, raw: text }; }
    }

    if (!response.ok) {
      if (response.status === 401) {
        Ashen.emit('unauthorized', { status: 401 });
      }
      let message = '';
      if (data && typeof data.error === 'string') message = data.error;
      else if (data && data.error && typeof data.error.message === 'string') message = data.error.message;
      else if (data && typeof data.message === 'string') message = data.message;
      throw ApiError(message || ('Request failed (' + response.status + ').'), response.status, data);
    }

    return data === null ? { ok: true } : data;
  },

  get(path, options) { return this.request('GET', path, undefined, options); },
  post(path, body, options) { return this.request('POST', path, body === undefined ? {} : body, options); },
  put(path, body, options) { return this.request('PUT', path, body === undefined ? {} : body, options); },
  del(path, body, options) { return this.request('DELETE', path, body, options); },
  patch(path, body, options) { return this.request('PATCH', path, body, options); }
};
