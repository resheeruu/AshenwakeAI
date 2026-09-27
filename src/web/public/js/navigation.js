/* ==================== NAVIGATION / APP SHELL ==================== */

const AshenSections = Object.create(null);
let AshenCurrentSection = 'overview';
let AshenCurrentUnmounts = null;
let AshenMountedOnce = false;

/*
 * A section can be contributed to by several files (the AI panel is written by
 * both personality.js and models.js), so registration merges instead of
 * overwriting. Modules call this at evaluation time:
 *   AshenSection('ai', { mount, unmount })
 */
function AshenSection(id, definition) {
  if (!AshenSections[id]) AshenSections[id] = { mounts: [], unmounts: [] };
  const slot = AshenSections[id];
  if (definition && typeof definition.mount === 'function') slot.mounts.push(definition.mount);
  if (definition && typeof definition.unmount === 'function') slot.unmounts.push(definition.unmount);
}
window.AshenSection = AshenSection;

const AshenShell = {
  current() { return AshenCurrentSection; },

  list() {
    return Object.keys(AshenSections);
  },

  go(id, options) {
    const opts = options || {};
    const requested = document.getElementById('sec-' + id) ? id : 'overview';
    const activePage = document.getElementById('sec-' + requested);
    if (!activePage) return;

    if (requested === AshenCurrentSection && AshenMountedOnce && !opts.force) return;

    this._teardown();

    document.querySelectorAll('.sidebar .nav-link').forEach((link) => {
      link.classList.toggle('active', link.getAttribute('data-section') === requested);
    });
    document.querySelectorAll('.section-page').forEach((sec) => {
      sec.classList.toggle('active', sec === activePage);
    });

    AshenCurrentSection = requested;
    if (window.history && window.history.replaceState) {
      window.history.replaceState(null, '', '#' + requested);
    }
    this.closeSidebar();
    Ashen.emit('section:change', requested);
    this._mount(requested, activePage, opts.force === true);
  },

  refresh() {
    const page = document.getElementById('sec-' + AshenCurrentSection);
    if (!page) return;
    this._teardown();
    this._mount(AshenCurrentSection, page, true);
  },

  /* Re-mount the active section after the selected server changes. */
  reloadForGuild() {
    const page = document.getElementById('sec-' + AshenCurrentSection);
    if (!page) return;
    this._teardown();
    this._mount(AshenCurrentSection, page, true);
  },

  _teardown() {
    if (AshenCurrentUnmounts) {
      AshenCurrentUnmounts.forEach((fn) => {
        try { fn(); } catch (err) { console.error('section unmount failed', err); }
      });
      AshenCurrentUnmounts = null;
    }
  },

  _mount(id, page, force) {
    const slot = AshenSections[id];
    AshenMountedOnce = true;
    if (!slot || !slot.mounts.length) {
      page.innerHTML = '';
      return;
    }
    const ctx = {
      id: id,
      root: page,
      guildId: Ashen.guildId,
      role: Ashen.role,
      canEdit: Ashen.canEdit(),
      isStaff: Ashen.isStaff(),
      isOwner: Ashen.isOwner(),
      force: !!force,
      stale: function () { return AshenCurrentSection !== id; }
    };
    const unmounts = [];
    slot.mounts.forEach((mount) => {
      try {
        const result = mount(ctx);
        if (result && typeof result.then === 'function') {
          result.catch((err) => console.error('section ' + id + ' failed to load', err));
        }
      } catch (err) {
        console.error('section ' + id + ' threw', err);
      }
    });
    slot.unmounts.forEach((fn) => unmounts.push(fn));
    AshenCurrentUnmounts = unmounts;
  },

  openSidebar() {
    const sidebar = document.getElementById('sidebar');
    const scrim = document.getElementById('sidebarScrim');
    const toggle = document.getElementById('sidebarToggle');
    if (sidebar) sidebar.classList.add('open');
    if (scrim) scrim.classList.add('open');
    if (toggle) toggle.setAttribute('aria-expanded', 'true');
  },

  closeSidebar() {
    const sidebar = document.getElementById('sidebar');
    const scrim = document.getElementById('sidebarScrim');
    const toggle = document.getElementById('sidebarToggle');
    if (sidebar) sidebar.classList.remove('open');
    if (scrim) scrim.classList.remove('open');
    if (toggle) toggle.setAttribute('aria-expanded', 'false');
  }
};
window.AshenShell = AshenShell;

/* ---------- Shell wiring ---------- */
document.addEventListener('DOMContentLoaded', function () {
  initSectionNav();
  initSidebarChrome();
  initServerSelector();
  initRefreshButtons();
  initSectionChangeBadge();
});

function initSectionNav() {
  document.querySelectorAll('.sidebar .nav-link').forEach((link) => {
    link.addEventListener('click', function (e) {
      e.preventDefault();
      const id = this.getAttribute('data-section');
      if (id) AshenShell.go(id);
    });
  });

  /* Section mounting waits for a confirmed session — never render data
     behind the sign-in screen. Auth.enter() performs the first go(). */
  if (typeof Ashen !== 'undefined' && !Ashen.authenticated) return;

  const hash = (window.location.hash || '').replace('#', '');
  if (hash && document.getElementById('sec-' + hash)) {
    AshenShell.go(hash);
  }
}

function initSidebarChrome() {
  const toggle = document.getElementById('sidebarToggle');
  const scrim = document.getElementById('sidebarScrim');
  if (toggle) {
    toggle.addEventListener('click', function () {
      const sidebar = document.getElementById('sidebar');
      if (sidebar && sidebar.classList.contains('open')) AshenShell.closeSidebar();
      else AshenShell.openSidebar();
    });
  }
  if (scrim) scrim.addEventListener('click', () => AshenShell.closeSidebar());

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') AshenShell.closeSidebar();
  });

  window.addEventListener('resize', function () {
    if (window.innerWidth > 1024) AshenShell.closeSidebar();
  });
}

function initServerSelector() {
  const selector = document.getElementById('serverSelector');
  if (!selector) return;

  selector.addEventListener('change', function () {
    Ashen.rememberGuild(this.value);
    Ashen.setGuild(this.value);
    AshenShell.reloadForGuild();
  });

  Ashen.on('guilds', function () { paintServerSelector(); });
  Ashen.on('session', function () { paintServerSelector(); });
}

function paintServerSelector() {
  const selector = document.getElementById('serverSelector');
  if (!selector) return;
  const wrap = selector.closest('.server-select');
  if (wrap) wrap.hidden = !Ashen.isStaff();
  if (!Ashen.isStaff()) return;

  const placeholder = Ashen.guilds.length ? 'Select server' : 'No servers authorized';

  let html = '<option value="">' + escapeHtml(placeholder) + '</option>';
  Ashen.guilds.forEach((g) => {
    const id = String(g.guildId || '');
    const label = g.guildName || id;
    const selected = id === Ashen.guildId ? ' selected' : '';
    html += '<option value="' + escapeHtml(id) + '"' + selected + '>' + escapeHtml(label) + '</option>';
  });
  selector.innerHTML = html;
  selector.disabled = !Ashen.guilds.length;
  selector.value = Ashen.guildId || '';
}

function initRefreshButtons() {
  document.querySelectorAll('[data-refresh]').forEach((btn) => {
    btn.addEventListener('click', function () {
      btn.disabled = true;
      AshenShell.refresh();
      window.setTimeout(() => { btn.disabled = false; }, 600);
    });
  });
}

/* Reflect read-only / no-access state in each section header so an admin
 * never stares at disabled controls without knowing why. */
function initSectionChangeBadge() {
  Ashen.on('section:change', function () { paintPermissionNotes(); });
  Ashen.on('session', function () { paintPermissionNotes(); });
}

function paintPermissionNotes() {
  const ownerOnly = Ashen.role === 'owner';
  const staff = Ashen.isStaff();

  document.querySelectorAll('[data-perm="owner"]').forEach((el) => {
    el.hidden = ownerOnly;
    el.className = 'perm-note ro';
    el.innerHTML = ownerOnly ? '' :
      '<strong>Read-only.</strong> <span>Configuration writes require the owner role; your role is ' +
      escapeHtml(Ashen.role || 'user') + '.</span>';
  });

  document.querySelectorAll('[data-perm="staff"]').forEach((el) => {
    el.hidden = staff;
    el.className = 'perm-note ro';
    el.innerHTML = staff ? '' :
      '<strong>Staff only.</strong> <span>This view is available to admin and owner accounts.</span>';
  });
}

window.AshenPaintPermissionNotes = paintPermissionNotes;

/* ==================== SHARED RENDER HELPERS ==================== */

const AshenUI = {
  esc: function (value) {
    return escapeHtml(value == null ? '' : value);
  },

  loading: function (label) {
    return '<div class="loading"><span class="spinner" aria-hidden="true"></span>' +
      this.esc(label || 'Loading…') + '</div>';
  },

  skeleton: function (rows) {
    let html = '<div class="skeleton-row">';
    for (let i = 0; i < (rows || 3); i++) html += '<div class="skeleton"></div>';
    return html + '</div>';
  },

  empty: function (title, desc, icon) {
    return '<div class="empty-state empty-compact">' +
      '<div class="empty-icon" aria-hidden="true">' + this.esc(icon || '◇') + '</div>' +
      '<div class="empty-title">' + this.esc(title) + '</div>' +
      (desc ? '<div class="empty-desc">' + this.esc(desc) + '</div>' : '') +
      '</div>';
  },

  failure: function (err, what) {
    const message = Ashen.describeError(err);
    return '<div class="empty-state empty-compact">' +
      '<div class="empty-icon" aria-hidden="true">!</div>' +
      '<div class="empty-title">' + this.esc(what || 'Could not load') + '</div>' +
      '<div class="empty-desc">' + this.esc(message) + '</div>' +
      '</div>';
  },

  denied: function (detail) {
    return '<div class="unauthorized"><div>' +
      '<div class="ua-title">Not available for your role</div>' +
      '<div class="ua-desc">' + this.esc(detail || 'Ask an owner or admin for access.') + '</div>' +
      '</div></div>';
  },

  kvCell: function (label, value) {
    const text = value === undefined || value === null ? '-' : String(value);
    return '<div class="kv-cell"><div class="kv-k">' + this.esc(label) + '</div>' +
      '<div class="kv-v">' + this.esc(text) + '</div></div>';
  },

  stat: function (value, label, tone, note) {
    return '<div class="stat-card ' + (tone || '') + '">' +
      '<div class="stat-value">' + this.esc(value) + '</div>' +
      '<div class="stat-label">' + this.esc(label) + '</div>' +
      (note ? '<div class="stat-delta">' + this.esc(note) + '</div>' : '') +
      '</div>';
  },

  row: function (title, desc, rightHtml) {
    return '<div class="field-line">' +
      '<div class="fl-text"><div class="fl-title">' + this.esc(title) + '</div>' +
      (desc ? '<div class="fl-desc">' + this.esc(desc) + '</div>' : '') + '</div>' +
      (rightHtml === undefined ? '' : rightHtml) +
      '</div>';
  },

  badge: function (label, tone) {
    return '<span class="badge ' + (tone || '') + '">' + this.esc(label) + '</span>';
  },

  toggle: function (id, title, desc, checked, disabled) {
    return '<div class="field-line">' +
      '<div class="fl-text"><label class="fl-title" for="' + this.esc(id) + '">' + this.esc(title) + '</label>' +
      (desc ? '<div class="fl-desc">' + this.esc(desc) + '</div>' : '') + '</div>' +
      '<label class="toggle"><input type="checkbox" id="' + this.esc(id) + '"' +
      (checked ? ' checked' : '') + (disabled ? ' disabled' : '') +
      '><span class="toggle-slider"></span></label>' +
      '</div>';
  },

  number: function (id, title, desc, value, attrs) {
    const parts = this.inputAttrs(attrs, 'number');
    return '<div class="field-line">' +
      '<div class="fl-text"><label class="fl-title" for="' + this.esc(id) + '">' + this.esc(title) + '</label>' +
      (desc ? '<div class="fl-desc">' + this.esc(desc) + '</div>' : '') + '</div>' +
      '<input class="input input-num" type="' + this.esc(parts.type) + '" id="' + this.esc(id) +
      '" value="' + this.esc(value == null ? '' : value) + '"' + parts.rest + '>' +
      '</div>';
  },

  /* Splits a type="..." out of an attrs string so duplicate type attributes
     never reach the DOM (the browser keeps the first one and ignores the rest). */
  inputAttrs: function (attrs, defaultType) {
    const extra = attrs || '';
    const match = extra.match(/\btype="([^"]+)"/);
    if (!match) return { type: defaultType || 'text', rest: extra };
    return { type: match[1], rest: extra.replace(match[0], '') };
  },

  text: function (id, title, desc, value, attrs) {
    const parts = this.inputAttrs(attrs);
    return '<div class="field-line">' +
      '<div class="fl-text"><label class="fl-title" for="' + this.esc(id) + '">' + this.esc(title) + '</label>' +
      (desc ? '<div class="fl-desc">' + this.esc(desc) + '</div>' : '') + '</div>' +
      '<input class="input input-text" type="' + this.esc(parts.type) + '" id="' + this.esc(id) +
      '" value="' + this.esc(value == null ? '' : value) + '"' + parts.rest + '>' +
      '</div>';
  },

  select: function (id, title, desc, value, options, disabled) {
    let html = '<div class="field-line">' +
      '<div class="fl-text"><label class="fl-title" for="' + this.esc(id) + '">' + this.esc(title) + '</label>' +
      (desc ? '<div class="fl-desc">' + this.esc(desc) + '</div>' : '') + '</div>' +
      '<select class="select input-text" id="' + this.esc(id) + '"' + (disabled ? ' disabled' : '') + '>';
    options.forEach((opt) => {
      const val = typeof opt === 'string' ? opt : opt.value;
      const label = typeof opt === 'string' ? opt : opt.label;
      html += '<option value="' + this.esc(val) + '"' + (String(value) === String(val) ? ' selected' : '') + '>' +
        this.esc(label) + '</option>';
    });
    return html + '</select></div>';
  },

  textarea: function (id, title, desc, value, attrs) {
    return '<div class="field">' +
      '<label class="label" for="' + this.esc(id) + '">' + this.esc(title) + '</label>' +
      '<textarea class="input" id="' + this.esc(id) + '"' + (attrs || '') + '>' + this.esc(value) + '</textarea>' +
      (desc ? '<div class="hint">' + this.esc(desc) + '</div>' : '') +
      '</div>';
  },

  formActions: function (label, gate, note, disabled) {
    return '<div class="form-actions">' +
      '<button class="btn btn-primary btn-sm" type="button" data-save="' + this.esc(gate) + '"' +
      (disabled ? ' disabled' : '') + '>' + this.esc(label || 'Save changes') + '</button>' +
      (note ? '<span class="fa-note">' + this.esc(note) + '</span>' : '') +
      '</div>';
  },

  /* Wire every [data-save] button inside a container to a handler. */
  bindSave: function (container, handler) {
    if (!container) return;
    container.querySelectorAll('[data-save]').forEach((btn) => {
      btn.addEventListener('click', async function () {
        const original = btn.textContent;
        btn.disabled = true;
        btn.textContent = 'Saving…';
        try {
          await handler(btn.getAttribute('data-save'));
        } catch (err) {
          showToast(Ashen.describeError(err), 'error');
        } finally {
          btn.disabled = false;
          btn.textContent = original;
        }
      });
    });
  },

  readOnly: function () { return !Ashen.canEdit(); }
};

window.AshenUI = AshenUI;
