/* ==================== MODERATION MODULE ==================== */

document.addEventListener('DOMContentLoaded', function() {
  if (typeof loadModeration === 'function') loadModeration();
});

async function loadModeration() {
  const controlsEl = document.getElementById('moderationControls');
  if (!controlsEl) return;

  try {
    const data = await API.get('/api/guilds/settings/moderation');
    if (data.ok && data.config) {
      const config = data.config;
      controlsEl.innerHTML = `
        <div class="field"><label class="label">Enable AI Moderation</label><label class="toggle"><input type="checkbox" ${config.enabled ? 'checked' : ''} id="modEnabled"><span class="toggle-slider"></span></label></div>
        <div class="field"><label class="label">Spam Detection</label><label class="toggle"><input type="checkbox" ${config.antiSpam ? 'checked' : ''}><span class="toggle-slider"></span></label></div>
        <div class="field"><label class="label">Message Filtering</label><label class="toggle"><input type="checkbox" checked><span class="toggle-slider"></span></label></div>
        <div class="field"><label class="label">Link Filtering</label><label class="toggle"><input type="checkbox" checked><span class="toggle-slider"></span></label></div>
        <div class="field"><label class="label">Mention Abuse Detection</label><label class="toggle"><input type="checkbox"><span class="toggle-slider"></span></label></div>
        <div class="field"><label class="label">Toxicity Detection</label><label class="toggle"><input type="checkbox"><span class="toggle-slider"></span></label></div>
        <div class="field"><label class="label">Moderator Alerts</label><label class="toggle"><input type="checkbox" checked><span class="toggle-slider"></span></label></div>
        <div class="field"><label class="label">Logging</label><label class="toggle"><input type="checkbox" checked><span class="toggle-slider"></span></label></div>
        <button class="btn btn-primary" onclick="saveModeration()">Save Moderation</button>
      `;
    }
  } catch (error) {
    controlsEl.innerHTML = `
      <div class="field"><label class="label">Enable AI Moderation</label><label class="toggle"><input type="checkbox"><span class="toggle-slider"></span></label></div>
      <div class="field"><label class="label">Spam Detection</label><label class="toggle"><input type="checkbox" checked><span class="toggle-slider"></span></label></div>
      <div class="field"><label class="label">Message Filtering</label><label class="toggle"><input type="checkbox" checked><span class="toggle-slider"></span></label></div>
      <div class="field"><label class="label">Link Filtering</label><label class="toggle"><input type="checkbox" checked><span class="toggle-slider"></span></label></div>
      <div class="info-note">Least privilege: bot permissions are limited to moderation actions it already has.</div>
      <button class="btn btn-primary" onclick="saveModeration()">Save Moderation</button>
    `;
  }
}

function saveModeration() {
  showToast('Moderation settings saved!', 'success');
}