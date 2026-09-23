/* ==================== SETTINGS MODULE ==================== */

function loadSettings() {
  const el = document.getElementById('appSettings');
  if (!el) return;

  el.innerHTML = `
    <div class="field"><label class="label">AI Enabled</label><label class="toggle"><input type="checkbox" id="settingAiEnabled" checked><span class="toggle-slider"></span></label></div>
    <div class="field"><label class="label">Default Model</label><select class="select" id="settingDefaultModel"><option>auto</option><option>gemini-pro</option><option>gpt-4</option><option>claude-3-sonnet</option></select></div>
    <div class="field"><label class="label">Streaming</label><label class="toggle"><input type="checkbox" id="settingStreaming" checked><span class="toggle-slider"></span></label></div>
    <div class="field"><label class="label">Max Context</label><select class="select" id="settingContext"><option>4096</option><option>8192</option><option selected>16384</option><option>32768</option><option>128000</option></select></div>
    <div class="field"><label class="label">Max Output</label><select class="select" id="settingOutput"><option>512</option><option selected>2048</option><option>4096</option><option>8192</option></select></div>
    <div class="field"><label class="label">Temperature</label><input type="range" class="input" id="settingTemp" min="0" max="100" value="70"></div>
    <button class="btn btn-primary" onclick="saveSettings()">Save Settings</button>
  `;
}

function saveSettings() {
  showToast('Settings saved.', 'success');
}

document.addEventListener('DOMContentLoaded', function() {
  if (typeof loadSettings === 'function') loadSettings();
});
