/* ==================== AUTOMATION SECTION ==================== */

AshenSection('automation', { mount: mountAutomation, unmount: unmountAutomation });

let automationCtx = null;
let automationFormOpen = false;
let automationEditingId = null;
let automationCache = [];

function mountAutomation(ctx) {
  automationCtx = ctx;
  automationFormOpen = false;
  automationEditingId = null;

  const createBtn = document.getElementById('automationCreateBtn');
  if (createBtn) {
    createBtn.hidden = !ctx.canEdit;
    createBtn.onclick = function () {
      automationFormOpen = !automationFormOpen;
      automationEditingId = null;
      renderAutomation(ctx);
    };
  }
  renderAutomation(ctx);
  loadAutomation(ctx);
}

function unmountAutomation() {
  automationCtx = null;
  automationCache = [];
  const createBtn = document.getElementById('automationCreateBtn');
  if (createBtn) createBtn.onclick = null;
}

async function loadAutomation(ctx) {
  if (!ctx.guildId) return;
  try {
    const data = await API.get('/api/guilds/' + encodeURIComponent(ctx.guildId) + '/automation/rules');
    if (!automationCtx || ctx.stale()) return;
    automationCache = (data && data.rules) || [];
    renderAutomation(ctx);
  } catch (err) {
    if (!automationCtx || ctx.stale()) return;
    const host = document.getElementById('automationRules');
    if (host) host.innerHTML = AshenUI.failure(err, 'Automation rules unavailable');
  }
}

function renderAutomation(ctx) {
  const host = document.getElementById('automationRules');
  if (!host) return;

  if (!ctx.guildId) {
    host.innerHTML = AshenUI.empty('Select a server', 'Rules are stored per server.', '⚙');
    return;
  }

  const note = '<div class="info-note">Rules are stored, not executed. Nothing runs in the background — a rule only acts when its matching Discord event actually arrives, and every action is subject to the bot\'s existing permissions.</div>';
  let html = note;

  if (automationFormOpen) html += renderAutomationForm(ctx);
  html += renderAutomationList(ctx);

  host.innerHTML = html;
  wireAutomation(ctx, host);
}

function renderAutomationForm(ctx) {
  const editing = automationEditingId
    ? automationCache.find((r) => r.id === automationEditingId)
    : null;
  const rule = editing || { name: '', description: '', triggerType: 'message', enabled: true };
  const triggerOptions = ['message', 'member-join', 'member-leave', 'reaction', 'schedule', 'keyword'];

  return '<div class="card form-card">' +
    '<div class="card-head"><div><div class="card-title">' + (editing ? 'Edit rule' : 'New rule') + '</div>' +
    '<div class="card-sub">Give the rule a name and a trigger. Conditions and actions stay empty until you extend them.</div></div></div>' +
    AshenUI.text('ruleName', 'Name', 'Shown in this list. Max 120 characters.', rule.name, ' maxlength="120"') +
    AshenUI.text('ruleDescription', 'Description', 'Optional context for other owners. Max 500 characters.', rule.description || '', ' maxlength="500"') +
    (triggerOptions.indexOf(String(rule.triggerType)) >= 0
      ? AshenUI.select('ruleTrigger', 'Trigger', 'The Discord event this rule listens for.', rule.triggerType, triggerOptions, false)
      : AshenUI.text('ruleTrigger', 'Trigger', 'The Discord event this rule listens for.', rule.triggerType, '')) +
    AshenUI.toggle('ruleEnabled', 'Enabled', 'Disabled rules are kept but never evaluated.', rule.enabled !== false, false) +
    '<div class="form-actions">' +
    '<button class="btn btn-primary btn-sm" type="button" data-save="rule">' + (editing ? 'Save rule' : 'Create rule') + '</button>' +
    '<button class="btn btn-ghost btn-sm" type="button" id="ruleCancelBtn">Cancel</button>' +
    '</div></div>';
}

function renderAutomationList(ctx) {
  if (!automationCache.length) {
    return AshenUI.empty('No automation rules', 'Create a rule to start reacting to Discord events automatically.', '⚙');
  }

  const rows = automationCache.map((rule) => {
    const actions = Array.isArray(rule.actions) ? rule.actions.length : 0;
    const conditions = Array.isArray(rule.conditions) ? rule.conditions.length : 0;
    return '<tr>' +
      '<td><strong>' + escapeHtml(rule.name) + '</strong>' +
      (rule.description ? '<div class="cell-sub">' + escapeHtml(rule.description) + '</div>' : '') + '</td>' +
      '<td><code>' + escapeHtml(rule.triggerType) + '</code></td>' +
      '<td>' + conditions + ' cond · ' + actions + ' act</td>' +
      '<td>' + (rule.enabled
        ? AshenUI.badge('Enabled', 'badge-green')
        : AshenUI.badge('Disabled', 'badge-muted')) + '</td>' +
      '<td class="row-actions">' +
      (ctx.canEdit
        ? '<button class="btn btn-sm btn-ghost" type="button" data-rule-edit="' + escapeHtml(rule.id) + '">Edit</button>' +
          '<button class="btn btn-sm btn-ghost" type="button" data-rule-toggle="' + escapeHtml(rule.id) + '">' +
          (rule.enabled ? 'Disable' : 'Enable') + '</button>' +
          '<button class="btn btn-sm btn-danger" type="button" data-rule-delete="' + escapeHtml(rule.id) + '">Delete</button>'
        : '<span class="text-dim">Read-only</span>') +
      '</td></tr>';
  }).join('');

  return '<div class="table-wrap"><table class="data-table"><thead><tr>' +
    '<th>Rule</th><th>Trigger</th><th>Shape</th><th>Status</th><th></th>' +
    '</tr></thead><tbody>' + rows + '</tbody></table></div>';
}

function wireAutomation(ctx, host) {
  const cancel = document.getElementById('ruleCancelBtn');
  if (cancel) {
    cancel.addEventListener('click', function () {
      automationFormOpen = false;
      automationEditingId = null;
      renderAutomation(ctx);
    });
  }

  AshenUI.bindSave(host, async function (gate) {
    if (gate !== 'rule') return;
    const name = document.getElementById('ruleName').value.trim();
    const triggerType = document.getElementById('ruleTrigger').value.trim();
    const payload = {
      name: name,
      description: document.getElementById('ruleDescription').value.trim(),
      triggerType: triggerType,
      enabled: document.getElementById('ruleEnabled').checked
    };
    if (!name) throw { message: 'Rule name is required.' };
    if (!triggerType) throw { message: 'A trigger is required.' };

    const base = '/api/guilds/' + encodeURIComponent(ctx.guildId) + '/automation/rules';
    if (automationEditingId) {
      await API.put(base + '/' + encodeURIComponent(automationEditingId), payload);
      showToast('Rule updated.', 'success');
    } else {
      payload.triggerConfig = {};
      payload.conditions = [];
      payload.actions = [];
      await API.post(base, payload);
      showToast('Rule created. It stays inert until its trigger event occurs.', 'success');
    }
    automationFormOpen = false;
    automationEditingId = null;
    await loadAutomation(ctx);
  });

  host.querySelectorAll('[data-rule-edit]').forEach((btn) => {
    btn.addEventListener('click', function () {
      automationEditingId = this.getAttribute('data-rule-edit');
      automationFormOpen = true;
      renderAutomation(ctx);
    });
  });

  host.querySelectorAll('[data-rule-toggle]').forEach((btn) => {
    btn.addEventListener('click', async function () {
      const id = this.getAttribute('data-rule-toggle');
      const rule = automationCache.find((r) => r.id === id);
      if (!rule) return;
      try {
        await API.put('/api/guilds/' + encodeURIComponent(ctx.guildId) + '/automation/rules/' + encodeURIComponent(id), {
          enabled: !rule.enabled
        });
        showToast(rule.enabled ? 'Rule disabled.' : 'Rule enabled.', 'success');
        await loadAutomation(ctx);
      } catch (err) {
        showToast(Ashen.describeError(err), 'error');
      }
    });
  });

  host.querySelectorAll('[data-rule-delete]').forEach((btn) => {
    btn.addEventListener('click', async function () {
      const id = this.getAttribute('data-rule-delete');
      if (!window.confirm('Delete this rule? This cannot be undone.')) return;
      try {
        await API.del('/api/guilds/' + encodeURIComponent(ctx.guildId) + '/automation/rules/' + encodeURIComponent(id), {});
        showToast('Rule deleted.', 'success');
        await loadAutomation(ctx);
      } catch (err) {
        showToast(Ashen.describeError(err), 'error');
      }
    });
  });
}
