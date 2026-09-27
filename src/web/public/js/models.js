/* ==================== AI · ROUTING, LIMITS, MODELS ==================== */

AshenSection('ai', { mount: mountAiModels });

function mountAiModels(ctx) {
  const routing = document.getElementById('aiRouting');
  const limits = document.getElementById('aiLimits');
  const models = document.getElementById('aiModels');
  if (!routing || !limits || !models) return;

  if (!ctx.guildId) {
    routing.innerHTML = AshenUI.empty('Select a server', 'Routing is stored per server.', '⚡');
    limits.innerHTML = AshenUI.empty('Select a server', 'Limits are stored per server.', '⚡');
    models.innerHTML = AshenUI.empty('Select a server', 'Model choices are stored per server.', '⚡');
    return;
  }

  routing.innerHTML = AshenUI.loading('Loading routing…');
  limits.innerHTML = AshenUI.loading('Loading limits…');
  models.innerHTML = AshenUI.loading('Loading models…');

  loadAiCore(ctx, models);
  loadRouting(ctx, routing);
  loadLimits(ctx, limits);
}

/* ---------- routing ---------- */

async function loadRouting(ctx, host) {
  const base = '/api/guilds/' + encodeURIComponent(ctx.guildId) + '/ai/routing';
  let config;
  try {
    const data = await API.get(base);
    if (ctx.stale()) return;
    config = (data && data.config) || {};
  } catch (err) {
    if (ctx.stale()) return;
    host.innerHTML = AshenUI.failure(err, 'Routing unavailable');
    return;
  }

  const readOnly = !ctx.canEdit;
  host.innerHTML =
    AshenUI.select('aiRoutingMode', 'Mode', 'How requests pick a provider.', config.mode || 'automatic', [
      { value: 'automatic', label: 'Automatic — balance cost and health' },
      { value: 'fastest', label: 'Fastest — lowest observed latency' },
      { value: 'lowest-cost', label: 'Lowest cost' },
      { value: 'free-first', label: 'Free first, paid as fallback' },
      { value: 'custom', label: 'Custom fallback order' }
    ], readOnly) +
    AshenUI.text('aiRoutingPrimary', 'Primary provider', 'Provider tried first. Leave empty to auto-select.', config.primaryProvider || '', readOnly ? ' disabled' : '') +
    AshenUI.text('aiRoutingFallback', 'Fallback provider', 'Used when the primary provider fails.', config.fallbackProvider || '', readOnly ? ' disabled' : '') +
    AshenUI.number('aiRoutingTimeout', 'Timeout (ms)', 'Hard ceiling for a single provider attempt.', config.timeoutMs || 15000, readOnly ? ' disabled min="1000" max="120000"' : ' min="1000" max="120000"') +
    AshenUI.select('aiRoutingRetry', 'Retry policy', 'What happens after a failed attempt.', config.retryPolicy || 'exponential', [
      { value: 'none', label: 'No retry — fail over immediately' },
      { value: 'exponential', label: 'Exponential backoff' },
      { value: 'fixed', label: 'Fixed delay' }
    ], readOnly) +
    AshenUI.formActions('Save routing', 'routing', readOnly ? 'Owner only' : '', readOnly);

  AshenUI.bindSave(host, async function (gate) {
    if (gate !== 'routing') return;
    await API.put(base, {
      mode: document.getElementById('aiRoutingMode').value,
      primaryProvider: document.getElementById('aiRoutingPrimary').value.trim(),
      fallbackProvider: document.getElementById('aiRoutingFallback').value.trim(),
      timeoutMs: Number(document.getElementById('aiRoutingTimeout').value) || 15000,
      retryPolicy: document.getElementById('aiRoutingRetry').value
    });
    showToast('Routing saved.', 'success');
  });
}

/* ---------- limits ---------- */

async function loadLimits(ctx, host) {
  const base = '/api/guilds/' + encodeURIComponent(ctx.guildId) + '/ai/limits';
  let config;
  try {
    const data = await API.get(base);
    if (ctx.stale()) return;
    config = (data && data.config) || {};
  } catch (err) {
    if (ctx.stale()) return;
    host.innerHTML = AshenUI.failure(err, 'Limits unavailable');
    return;
  }

  const readOnly = !ctx.canEdit;
  const num = (v, d) => (typeof v === 'number' && v > 0 ? v : d);
  host.innerHTML =
    AshenUI.number('aiLimitDaily', 'Daily limit', 'Requests per server, per day.', num(config.dailyLimit, 500), readOnly ? ' disabled min="0"' : ' min="0"') +
    AshenUI.number('aiLimitMonthly', 'Monthly limit', 'Requests per server, per month.', num(config.monthlyLimit, 8000), readOnly ? ' disabled min="0"' : ' min="0"') +
    AshenUI.number('aiLimitUser', 'Per-user limit', 'Requests one member can make per day.', num(config.perUserLimit, 60), readOnly ? ' disabled min="0"' : ' min="0"') +
    AshenUI.number('aiLimitRole', 'Per-role limit', 'Requests one role can make per day.', num(config.perRoleLimit, 200), readOnly ? ' disabled min="0"' : ' min="0"') +
    AshenUI.number('aiLimitChannel', 'Per-channel limit', 'Requests one channel can make per day.', num(config.perChannelLimit, 200), readOnly ? ' disabled min="0"' : ' min="0"') +
    AshenUI.formActions('Save limits', 'limits', readOnly ? 'Owner only' : '', readOnly);

  AshenUI.bindSave(host, async function (gate) {
    if (gate !== 'limits') return;
    const value = (id, fallback) => {
      const raw = document.getElementById(id).value;
      const parsed = Number(raw);
      return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
    };
    await API.put(base, {
      dailyLimit: value('aiLimitDaily', 500),
      monthlyLimit: value('aiLimitMonthly', 8000),
      perUserLimit: value('aiLimitUser', 60),
      perRoleLimit: value('aiLimitRole', 200),
      perChannelLimit: value('aiLimitChannel', 200)
    });
    showToast('Limits saved.', 'success');
  });
}

/* ---------- core settings + model list ---------- */

let aiModelDraft = null;

async function loadAiCore(ctx, host) {
  const base = '/api/guilds/' + encodeURIComponent(ctx.guildId) + '/ai';
  const modelsBase = '/api/guilds/' + encodeURIComponent(ctx.guildId) + '/models';

  let core = {};
  let discovered = [];
  let configured = [];
  try {
    const [coreRes, modelsRes] = await Promise.all([API.get(base), API.get(modelsBase)]);
    if (ctx.stale()) return;
    core = (coreRes && coreRes.config) || {};
    discovered = (modelsRes && modelsRes.models) || [];
    configured = (modelsRes && modelsRes.configured) || [];
  } catch (err) {
    if (ctx.stale()) return;
    host.innerHTML = AshenUI.failure(err, 'Model settings unavailable');
    return;
  }

  aiModelDraft = configured.map((m) => Object.assign({}, m));
  const readOnly = !ctx.canEdit;

  const coreHtml =
    AshenUI.toggle('aiCoreEnabled', 'AI enabled', 'Master switch for AI responses in this server.', core.enabled !== false, readOnly) +
    AshenUI.toggle('aiCoreStreaming', 'Streaming responses', 'Send tokens to Discord as they arrive.', core.streaming !== false, readOnly) +
    AshenUI.number('aiCoreContext', 'Context window', 'Tokens of history kept in the prompt.', core.contextSize || 8192, readOnly ? ' disabled min="512"' : ' min="512"') +
    AshenUI.number('aiCoreOutput', 'Max output tokens', 'Upper bound for a single reply.', core.maxOutput || 1024, readOnly ? ' disabled min="64"' : ' min="64"') +
    AshenUI.select('aiCoreResponse', 'Response mode', 'Default reply style when no command overrides it.', core.responseMode || 'balanced', [
      { value: 'concise', label: 'Concise' },
      { value: 'balanced', label: 'Balanced' },
      { value: 'detailed', label: 'Detailed' }
    ], readOnly);

  host.innerHTML = coreHtml + '<div class="subpanel" id="aiModelList"></div>' +
    AshenUI.formActions('Save AI settings', 'core', readOnly ? 'Owner only' : '', readOnly);

  const list = document.getElementById('aiModelList');
  if (list) renderAiModelList(list, discovered, readOnly, ctx);

  AshenUI.bindSave(host, async function (gate) {
    if (gate !== 'core') return;
    await API.put(base, {
      enabled: document.getElementById('aiCoreEnabled').checked,
      streaming: document.getElementById('aiCoreStreaming').checked,
      contextSize: Number(document.getElementById('aiCoreContext').value) || 8192,
      maxOutput: Number(document.getElementById('aiCoreOutput').value) || 1024,
      responseMode: document.getElementById('aiCoreResponse').value,
      defaultModel: core.defaultModel,
      defaultProvider: core.defaultProvider
    });
    await API.put(modelsBase, aiModelDraft || []);
    showToast('AI settings and model list saved.', 'success');
  });
}

function renderAiModelList(list, discovered, readOnly, ctx) {
  if (!aiModelDraft || !aiModelDraft.length) {
    list.innerHTML = AshenUI.empty(
      'No models pinned yet',
      discovered.length
        ? 'Add a discovered model to control which ones this server can use.'
        : 'Configure a provider in Integrations and discover its models first.',
      '◇');
    if (discovered.length && !readOnly) {
      list.innerHTML += '<div class="field-line"><div class="fl-text">' +
        '<label class="fl-title" for="aiModelAdd">Add a discovered model</label>' +
        '<div class="fl-desc">Discovered models come from your configured providers.</div></div>' +
        '<select class="select input-text" id="aiModelAdd">' +
        discovered.map((m) => '<option value="' + escapeHtml(m.modelId) + '">' +
          escapeHtml((m.displayName || m.modelId) + ' · ' + (m.provider || m.providerId || 'unknown')) + '</option>').join('') +
        '</select></div>' +
        '<div class="form-actions"><button class="btn btn-secondary btn-sm" type="button" id="aiModelAddBtn">Add model</button></div>';
    }
    wireAiModelAdd(list, discovered, readOnly, ctx);
    return;
  }

  const rows = aiModelDraft.map((m, index) => {
    const meta = discovered.find((d) => d.modelId === m.modelId) || {};
    const caps = (meta.capabilities || []).join(', ');
    return '<tr>' +
      '<td><strong>' + escapeHtml(meta.displayName || m.modelId) + '</strong><div class="cell-sub">' + escapeHtml(m.modelId) + '</div></td>' +
      '<td>' + escapeHtml(meta.provider || meta.providerId || '—') + '</td>' +
      '<td>' + escapeHtml(caps || '—') + '</td>' +
      '<td>' + (m.isDefault ? '<span class="badge badge-accent">Default</span>' : AshenUI.badge('Enabled', m.enabled === false ? 'badge-muted' : 'badge-green')) + '</td>' +
      '<td class="row-actions">' +
      '<button class="btn btn-sm btn-ghost" type="button" data-model-toggle="' + index + '"' + (readOnly ? ' disabled' : '') + '>' +
      (m.enabled === false ? 'Enable' : 'Disable') + '</button>' +
      '<button class="btn btn-sm btn-ghost" type="button" data-model-default="' + index + '"' + (readOnly || m.isDefault ? ' disabled' : '') + '>Make default</button>' +
      '<button class="btn btn-sm btn-ghost" type="button" data-model-remove="' + index + '"' + (readOnly ? ' disabled' : '') + '>Remove</button>' +
      '</td></tr>';
  }).join('');

  list.innerHTML = '<div class="table-wrap"><table class="data-table"><thead><tr>' +
    '<th>Model</th><th>Provider</th><th>Capabilities</th><th>Status</th><th></th>' +
    '</tr></thead><tbody>' + rows + '</tbody></table></div>' +
    (discovered.length && !readOnly
      ? '<div class="field-line"><div class="fl-text"><label class="fl-title" for="aiModelAdd">Add another model</label>' +
        '<div class="fl-desc">Discovered models come from your configured providers.</div></div>' +
        '<select class="select input-text" id="aiModelAdd"><option value="">Choose a model</option>' +
        discovered.filter((d) => !aiModelDraft.some((m) => m.modelId === d.modelId))
          .map((m) => '<option value="' + escapeHtml(m.modelId) + '">' +
            escapeHtml((m.displayName || m.modelId) + ' · ' + (m.provider || m.providerId || 'unknown')) + '</option>').join('') +
        '</select></div><div class="form-actions"><button class="btn btn-secondary btn-sm" type="button" id="aiModelAddBtn">Add model</button></div>'
      : '');

  wireAiModelAdd(list, discovered, readOnly, ctx);

  list.querySelectorAll('[data-model-toggle]').forEach((btn) => {
    btn.addEventListener('click', function () {
      const i = Number(this.getAttribute('data-model-toggle'));
      aiModelDraft[i].enabled = aiModelDraft[i].enabled === false;
      renderAiModelList(list, discovered, readOnly, ctx);
    });
  });
  list.querySelectorAll('[data-model-default]').forEach((btn) => {
    btn.addEventListener('click', function () {
      const i = Number(this.getAttribute('data-model-default'));
      aiModelDraft.forEach((m, idx) => { m.isDefault = idx === i; m.enabled = true; });
      renderAiModelList(list, discovered, readOnly, ctx);
    });
  });
  list.querySelectorAll('[data-model-remove]').forEach((btn) => {
    btn.addEventListener('click', function () {
      const i = Number(this.getAttribute('data-model-remove'));
      aiModelDraft.splice(i, 1);
      renderAiModelList(list, discovered, readOnly, ctx);
    });
  });
}

function wireAiModelAdd(list, discovered, readOnly, ctx) {
  const addBtn = document.getElementById('aiModelAddBtn');
  const select = document.getElementById('aiModelAdd');
  if (!addBtn || !select) return;
  addBtn.addEventListener('click', function () {
    const modelId = select.value;
    if (!modelId) { showToast('Pick a model first.', 'error'); return; }
    aiModelDraft.push({
      modelId: modelId,
      enabled: true,
      priority: (aiModelDraft.length + 1) * 10,
      isDefault: aiModelDraft.length === 0
    });
    renderAiModelList(list, discovered, readOnly, ctx);
  });
}
