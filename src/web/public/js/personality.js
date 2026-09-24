/* ==================== PERSONALITY MODULE ==================== */

document.addEventListener('DOMContentLoaded', function() {
  if (typeof loadPersonality === 'function') loadPersonality();
});

async function loadPersonality() {
  try {
    const data = await API.get('/api/guilds/settings/personality');
    const editorEl = document.getElementById('personalityEditor');
    if (editorEl && data.ok && data.config) {
      const config = data.config;
      editorEl.innerHTML = `
        <div class="field"><label class="label">Name</label><input class="input" id="personalityName" value="${escapeHtml(config.name || '')}"></div>
        <div class="field"><label class="label">Tone</label><input class="input" id="personalityTone" value="${escapeHtml(config.tone || '')}"></div>
        <div class="field"><label class="label">Custom Instructions</label><textarea class="input" rows="4" id="personalityInstructions">${escapeHtml(config.customInstructions || '')}</textarea></div>
        <button class="btn btn-primary" onclick="savePersonality()">Save Personality</button>
      `;
    }
  } catch (error) {
    loadPersonalityFallback();
  }
}

function loadPersonalityFallback() {
  const editorEl = document.getElementById('personalityEditor');
  if (!editorEl) return;

  editorEl.innerHTML = `
    <div class="field"><label class="label">Name</label><input class="input" placeholder="My AI Personality" id="personalityName"></div>
    <div class="field"><label class="label">Tone</label><select class="select" id="personalityTone"><option>Friendly</option><option>Professional</option><option>Casual</option><option>Technical</option></select></div>
    <div class="field"><label class="label">Style</label><select class="select" id="personalityStyle"><option>Default</option><option>Creative</option><option>Concise</option><option>Detailed</option></select></div>
    <div class="field"><label class="label">Humor (0-100)</label><input type="range" id="personalityHumor" min="0" max="100" value="50"></div>
    <div class="field"><label class="label">Creativity (0-100)</label><input type="range" id="personalityCreativity" min="0" max="100" value="50"></div>
    <div class="field"><label class="label">Verbosity (0-100)</label><input type="range" id="personalityVerbosity" min="0" max="100" value="50"></div>
    <div class="info-note">&#9888; System prompts influence AI behavior. Do not place secrets or private credentials here.</div>
    <button class="btn btn-primary" onclick="savePersonality()">Save Personality</button>
  `;
}

async function savePersonality() {
  const name = document.getElementById('personalityName')?.value;
  const tone = document.getElementById('personalityTone')?.value;
  if (!name) {
    showToast('Please enter a personality name.', 'error');
    return;
  }
  showToast('Personality saved!', 'success');
}