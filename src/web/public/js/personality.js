/* ==================== AI · PERSONALITY ==================== */

AshenSection('ai', { mount: mountPersonality });

function mountPersonality(ctx) {
  const host = document.getElementById('aiPersonality');
  if (!host) return;
  if (!ctx.guildId) { host.innerHTML = AshenUI.empty('Select a server', 'Personality is stored per server.', '⚡'); return; }

  host.innerHTML = AshenUI.loading('Loading personality…');
  loadPersonality(ctx, host);
}

async function loadPersonality(ctx, host) {
  let config;
  try {
    const data = await API.get('/api/guilds/' + encodeURIComponent(ctx.guildId) + '/personality');
    if (ctx.stale()) return;
    config = (data && data.config) || {};
  } catch (err) {
    if (ctx.stale()) return;
    host.innerHTML = AshenUI.failure(err, 'Personality unavailable');
    return;
  }

  const readOnly = !ctx.canEdit;
  host.innerHTML =
    AshenUI.text('aiPersonaName', 'Display name', 'Shown when the assistant speaks in chat.', config.name || '', readOnly ? ' disabled' : '') +
    AshenUI.select('aiPersonaTone', 'Tone', 'How the assistant comes across.', config.tone || 'friendly', [
      { value: 'friendly', label: 'Friendly' },
      { value: 'professional', label: 'Professional' },
      { value: 'casual', label: 'Casual' },
      { value: 'technical', label: 'Technical' },
      { value: 'playful', label: 'Playful' },
      { value: 'concise', label: 'Concise' }
    ], readOnly) +
    AshenUI.textarea('aiPersonaInstructions', 'Custom instructions',
      'Behavioural guidance injected into the system prompt. Never paste secrets or tokens here.',
      config.customInstructions || '', readOnly ? ' disabled rows="4"' : ' rows="4"') +
    '<div class="subpanel">' +
    '<div class="kv-k">Prompt preview</div>' +
    '<div class="hint" id="aiPersonaPreview"></div>' +
    '</div>' +
    AshenUI.formActions('Save personality', 'personality', readOnly ? 'Owner only' : '', readOnly);

  const nameInput = document.getElementById('aiPersonaName');
  const toneInput = document.getElementById('aiPersonaTone');
  const instructionsInput = document.getElementById('aiPersonaInstructions');
  const preview = document.getElementById('aiPersonaPreview');

  function paintPersonaPreview() {
    if (!preview) return;
    const personaName = (nameInput && nameInput.value ? nameInput.value : '').trim() || 'Assistant';
    const tone = toneInput && toneInput.value ? toneInput.value : 'friendly';
    const instructions = (instructionsInput && instructionsInput.value ? instructionsInput.value : '').trim();
    const snippet = instructions
      ? instructions.length > 240 ? instructions.slice(0, 240) + '…' : instructions
      : 'No custom instructions yet — the built-in profile for this tone applies.';
    preview.innerHTML = '<b>' + escapeHtml(personaName) + '</b> speaks in a <b>' + escapeHtml(tone) + '</b> tone. ' +
      escapeHtml(snippet);
  }

  paintPersonaPreview();
  [nameInput, toneInput, instructionsInput].forEach(function (el) {
    if (el) el.addEventListener('input', paintPersonaPreview);
  });

  AshenUI.bindSave(host, async function (gate) {
    if (gate !== 'personality') return;
    const payload = {
      name: nameInput.value.trim(),
      tone: toneInput.value,
      customInstructions: instructionsInput.value
    };
    if (!payload.name) throw { message: 'Display name is required.' };
    await API.put('/api/guilds/' + encodeURIComponent(ctx.guildId) + '/personality', payload);
    showToast('Personality saved for this server.', 'success');
  });
}
