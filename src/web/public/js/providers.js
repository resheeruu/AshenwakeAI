/* ==================== INTEGRATIONS · CONNECTED PROVIDERS ==================== */

AshenSection('integrations', { mount: mountIntegrations });

let integrationsFormOpen = false;
let connectedProviders = [];

function mountIntegrations(ctx) {
  const providersHost = document.getElementById('integrationProviders');
  const healthHost = document.getElementById('integrationHealth');
  if (!providersHost || !healthHost) return;

  integrationsFormOpen = false;

  if (!ctx.isStaff) {
    providersHost.innerHTML = AshenUI.denied('Provider management is visible to admin and owner accounts.');
    healthHost.innerHTML = AshenUI.denied('Provider health is visible to admin and owner accounts.');
    return;
  }

  providersHost.innerHTML = AshenUI.loading('Loading providers…');
  healthHost.innerHTML = AshenUI.loading('Loading health…');
  loadConnectedProviders(ctx, providersHost);
  loadProviderHealth(ctx, healthHost);
}

async function loadConnectedProviders(ctx, host) {
  try {
    const data = await API.get('/api/providers/manage');
    if (ctx.stale()) return;
    connectedProviders = (data && data.providers) || [];
  } catch (err) {
    if (ctx.stale()) return;
    host.innerHTML = AshenUI.failure(err, 'Provider list unavailable');
    return;
  }

  let html = '<div class="inline-actions">' +
    AshenUI.badge(connectedProviders.length + ' connected', connectedProviders.length ? 'badge-green' : 'badge-muted') +
    '<span class="spacer"></span>' +
    (ctx.canEdit
      ? '<button class="btn btn-primary btn-sm" type="button" id="providerAddBtn">' +
        (integrationsFormOpen ? 'Close form' : 'Add provider') + '</button>'
      : '<span class="text-dim">Adding and removing providers is owner-only</span>') +
    '</div>';

  if (integrationsFormOpen && ctx.canEdit) html += renderProviderForm();

  if (!connectedProviders.length) {
    html += AshenUI.empty('No providers connected',
      'Add an OpenAI-compatible, Anthropic, Gemini or Ollama endpoint to start routing requests.', '⧉');
  } else {
    html += '<div class="provider-list">' + connectedProviders.map((p) => renderProviderRow(p, ctx)).join('') + '</div>';
  }

  host.innerHTML = html;
  wireProviderActions(ctx, host);
}

function renderProviderRow(p, ctx) {
  const health = p.health || {};
  const models = p.models || [];
  const stateTone = p.enabled
    ? (health.available ? 'badge-green' : 'badge-yellow')
    : 'badge-muted';
  const stateLabel = !p.enabled ? 'Disabled' : (health.available ? 'Available' : 'Degraded');
  const latency = Math.round(Number(health.averageLatencyMs) || 0);

  let actions = '<button class="btn btn-sm btn-ghost" type="button" data-p-test="' + escapeHtml(p.id) + '">Test</button>';
  if (ctx.isStaff) {
    actions += '<button class="btn btn-sm btn-ghost" type="button" data-p-discover="' + escapeHtml(p.id) + '">Discover models</button>';
  }
  if (ctx.canEdit) {
    actions += '<button class="btn btn-sm btn-ghost" type="button" data-p-toggle="' + escapeHtml(p.id) + '">' +
      (p.enabled ? 'Disable' : 'Enable') + '</button>';
    actions += '<button class="btn btn-sm btn-danger" type="button" data-p-delete="' + escapeHtml(p.id) + '">Remove</button>';
  }

  let defaultRow = '';
  if (ctx.canEdit && models.length) {
    defaultRow = '<div class="field-line"><div class="fl-text">' +
      '<label class="fl-title" for="pdef-' + escapeHtml(p.id) + '">Default model</label>' +
      '<div class="fl-desc">Tried first for this provider.</div></div>' +
      '<span class="inline-actions">' +
      '<select class="select input-text" id="pdef-' + escapeHtml(p.id) + '">' +
      models.map((m) => '<option value="' + escapeHtml(m.modelId) + '"' +
        (m.modelId === p.defaultModel ? ' selected' : '') + '>' +
        escapeHtml(m.displayName || m.modelId) + '</option>').join('') +
      '</select>' +
      '<button class="btn btn-sm btn-secondary" type="button" data-p-default="' + escapeHtml(p.id) + '">Set</button>' +
      '</span></div>';
  }

  return '<div class="provider-row">' +
    '<div class="provider-main">' +
    '<div class="provider-name">' + escapeHtml(p.displayName || p.name) +
    (p.enabled ? '' : ' ' + AshenUI.badge('Disabled', 'badge-muted')) + '</div>' +
    '<div class="provider-meta">' +
    '<span>' + escapeHtml(p.protocol || '—') + '</span>' +
    '<span>' + escapeHtml(p.endpointHostname || 'custom endpoint') + '</span>' +
    '<span>' + escapeHtml(String(p.modelCount != null ? p.modelCount : models.length) + ' models') + '</span>' +
    '<span>' + escapeHtml(latency + ' ms avg') + '</span>' +
    (health.lastError ? '<span class="text-red">' + escapeHtml(health.lastError) + '</span>' : '') +
    '</div>' +
    defaultRow +
    '<div class="inline-actions">' + actions + '</div>' +
    '</div>' +
    '<span class="badge ' + stateTone + '">' + stateLabel + '</span>' +
    '</div>';
}

function renderProviderForm() {
  return '<div class="card form-card">' +
    '<div class="card-head"><div><div class="card-title">Add a provider</div>' +
    '<div class="card-sub">The key is stored server-side and is never rendered back to the browser.</div></div></div>' +
    AshenUI.text('pvName', 'Name', 'Lowercase identifier, e.g. my-proxy. Used as the API id.', '', ' maxlength="64"') +
    AshenUI.text('pvDisplayName', 'Display name', 'Shown in this list.', '', ' maxlength="128"') +
    AshenUI.select('pvType', 'Type', 'Where the endpoint runs.', 'custom', [
      { value: 'custom', label: 'Custom — your own endpoint or proxy' },
      { value: 'local', label: 'Local — running on this machine' },
      { value: 'builtin', label: 'Built-in — shipped with AshenAI' }
    ], false) +
    AshenUI.select('pvProtocol', 'Protocol', 'Wire format the endpoint speaks.', 'openai_compatible', [
      { value: 'openai_compatible', label: 'OpenAI compatible' },
      { value: 'anthropic', label: 'Anthropic' },
      { value: 'gemini', label: 'Google Gemini' },
      { value: 'ollama', label: 'Ollama' }
    ], false) +
    AshenUI.text('pvEndpoint', 'Endpoint URL', 'Absolute http(s) URL. Leave empty for provider defaults.', '', ' maxlength="2048"') +
    AshenUI.text('pvKey', 'API key', 'Sent only to your configured endpoint, never echoed back.', '', ' type="password" autocomplete="off"') +
    AshenUI.text('pvModel', 'Default model', 'Optional model id to try first.', '', ' maxlength="256"') +
    '<div class="form-actions">' +
    '<button class="btn btn-primary btn-sm" type="button" data-save="provider">Save provider</button>' +
    '<button class="btn btn-ghost btn-sm" type="button" id="providerCancelBtn">Cancel</button>' +
    '</div></div>';
}

function findProvider(id) {
  return connectedProviders.find((p) => p.id === id) || null;
}

function wireProviderActions(ctx, host) {
  const addBtn = document.getElementById('providerAddBtn');
  if (addBtn) {
    addBtn.addEventListener('click', function () {
      integrationsFormOpen = !integrationsFormOpen;
      loadConnectedProviders(ctx, host);
    });
  }
  const cancel = document.getElementById('providerCancelBtn');
  if (cancel) {
    cancel.addEventListener('click', function () {
      integrationsFormOpen = false;
      loadConnectedProviders(ctx, host);
    });
  }

  AshenUI.bindSave(host, async function (gate) {
    if (gate !== 'provider') return;
    const name = document.getElementById('pvName').value.trim();
    const displayName = document.getElementById('pvDisplayName').value.trim();
    if (!/^[a-z0-9_-]{1,64}$/.test(name)) throw { message: 'Name must use lowercase letters, digits, hyphen or underscore.' };
    if (!displayName) throw { message: 'Display name is required.' };

    const payload = {
      name: name,
      displayName: displayName,
      providerType: document.getElementById('pvType').value,
      protocol: document.getElementById('pvProtocol').value
    };
    const endpoint = document.getElementById('pvEndpoint').value.trim();
    const key = document.getElementById('pvKey').value;
    const model = document.getElementById('pvModel').value.trim();
    if (endpoint) payload.endpoint = endpoint;
    if (key) payload.apiKey = key;
    if (model) payload.defaultModel = model;

    await API.post('/api/providers/manage', payload);
    integrationsFormOpen = false;
    showToast('Provider added. Run Test to verify the connection.', 'success');
    await loadConnectedProviders(ctx, host);
    await loadProviderHealth(ctx, document.getElementById('integrationHealth'));
  });

  host.querySelectorAll('[data-p-test]').forEach((btn) => {
    btn.addEventListener('click', async function () {
      const id = this.getAttribute('data-p-test');
      const original = this.textContent;
      this.disabled = true;
      this.textContent = 'Testing…';
      try {
        await API.post('/api/providers/manage/' + encodeURIComponent(id) + '/test', {});
        showToast('Connection succeeded.', 'success');
      } catch (err) {
        showToast(Ashen.describeError(err), 'error');
      } finally {
        this.disabled = false;
        this.textContent = original;
        await loadConnectedProviders(ctx, host);
        await loadProviderHealth(ctx, document.getElementById('integrationHealth'));
      }
    });
  });

  host.querySelectorAll('[data-p-discover]').forEach((btn) => {
    btn.addEventListener('click', async function () {
      const id = this.getAttribute('data-p-discover');
      const original = this.textContent;
      this.disabled = true;
      this.textContent = 'Discovering…';
      try {
        await API.post('/api/providers/manage/' + encodeURIComponent(id) + '/discover-models', {});
        showToast('Model list refreshed.', 'success');
      } catch (err) {
        showToast(Ashen.describeError(err), 'error');
      } finally {
        this.disabled = false;
        this.textContent = original;
        await loadConnectedProviders(ctx, host);
      }
    });
  });

  host.querySelectorAll('[data-p-toggle]').forEach((btn) => {
    btn.addEventListener('click', async function () {
      const id = this.getAttribute('data-p-toggle');
      const provider = findProvider(id);
      const enabled = !(provider && provider.enabled);
      try {
        await API.post('/api/providers/manage/' + encodeURIComponent(id) + '/toggle', { enabled: enabled });
        showToast(enabled ? 'Provider enabled.' : 'Provider disabled.', 'success');
        await loadConnectedProviders(ctx, host);
        await loadProviderHealth(ctx, document.getElementById('integrationHealth'));
      } catch (err) {
        showToast(Ashen.describeError(err), 'error');
      }
    });
  });

  host.querySelectorAll('[data-p-default]').forEach((btn) => {
    btn.addEventListener('click', async function () {
      const id = this.getAttribute('data-p-default');
      const select = document.getElementById('pdef-' + id);
      if (!select || !select.value) { showToast('Pick a model first.', 'error'); return; }
      try {
        await API.put('/api/providers/manage/' + encodeURIComponent(id) + '/default-model', { modelId: select.value });
        showToast('Default model set to ' + select.value + '.', 'success');
        await loadConnectedProviders(ctx, host);
      } catch (err) {
        showToast(Ashen.describeError(err), 'error');
      }
    });
  });

  host.querySelectorAll('[data-p-delete]').forEach((btn) => {
    btn.addEventListener('click', async function () {
      const id = this.getAttribute('data-p-delete');
      if (!window.confirm('Remove this provider? Requests will fail over to the next provider.')) return;
      try {
        await API.del('/api/providers/manage/' + encodeURIComponent(id), {});
        showToast('Provider removed.', 'success');
        await loadConnectedProviders(ctx, host);
        await loadProviderHealth(ctx, document.getElementById('integrationHealth'));
      } catch (err) {
        showToast(Ashen.describeError(err), 'error');
      }
    });
  });
}

async function loadProviderHealth(ctx, host) {
  if (!host) return;
  try {
    const status = await API.get('/api/providers/status');
    if (ctx.stale()) return;
    const health = (status && status.providers) || [];
    if (!health.length) {
      host.innerHTML = AshenUI.empty('No health samples', 'Health appears after the first routed request.', '◇');
      return;
    }
    host.innerHTML = '<div class="table-wrap"><table class="data-table"><thead><tr>' +
      '<th>Provider</th><th>State</th><th>Success rate</th><th>Failures</th><th>Avg latency</th><th>Last error</th>' +
      '</tr></thead><tbody>' +
      health.map((h) => {
        const tone = h.available ? 'badge-green' : (h.disabledUntil ? 'badge-yellow' : 'badge-red');
        const label = h.available ? 'Available' : (h.disabledUntil ? 'Cooling down' : 'Offline');
        const total = (h.successes || 0) + (h.failures || 0);
        const rate = total ? Math.round(((h.successes || 0) / total) * 100) + '%' : '—';
        return '<tr>' +
          '<td><strong>' + escapeHtml(h.name || '') + '</strong></td>' +
          '<td><span class="badge ' + tone + '">' + label + '</span></td>' +
          '<td>' + escapeHtml(rate) + '</td>' +
          '<td>' + escapeHtml(String(h.failures || 0)) + '</td>' +
          '<td>' + escapeHtml(Math.round(Number(h.averageLatencyMs) || 0) + ' ms') + '</td>' +
          '<td>' + (h.lastError ? '<span class="text-red">' + escapeHtml(h.lastError) + '</span>' : '<span class="text-dim">—</span>') + '</td>' +
          '</tr>';
      }).join('') +
      '</tbody></table></div>';
  } catch (err) {
    if (ctx.stale()) return;
    host.innerHTML = AshenUI.failure(err, 'Provider health unavailable');
  }
}
