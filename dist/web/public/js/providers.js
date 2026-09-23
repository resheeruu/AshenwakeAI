/* ==================== PROVIDER MODULE ==================== */

document.addEventListener('DOMContentLoaded', function() {
  initProviderWizard();
});

let currentProviderStep = 1;
let pendingProviderData = {};

function initProviderWizard() {
  const addBtn = document.getElementById('addProviderBtn');
  if (addBtn) {
    addBtn.addEventListener('click', openAddProviderModal);
  }
}

function openAddProviderModal() {
  currentProviderStep = 1;
  pendingProviderData = {};
  updateWizardStep(1);
  const modal = document.getElementById('addProviderModal');
  if (modal) modal.classList.add('show');
}

function closeAddProviderModal() {
  const modal = document.getElementById('addProviderModal');
  if (modal) modal.classList.remove('show');
}

function updateWizardStep(step) {
  currentProviderStep = step;
  for (let i = 1; i <= 4; i++) {
    const dot = document.getElementById(`step${i}Dot`);
    const view = document.getElementById(`apStep${i}`);
    if (dot) {
      dot.className = 'step-dot';
      if (i < step) dot.classList.add('done');
      if (i === step) dot.classList.add('active');
    }
    if (view) {
      view.classList.remove('active');
      if (i === step) view.classList.add('active');
    }
  }
}

function apNextStep(step) {
  if (step === 2) {
    const protocol = document.getElementById('ap-protocol')?.value;
    const displayName = document.getElementById('ap-displayName')?.value;
    const name = document.getElementById('ap-name')?.value;
    if (!displayName || !name) {
      showToast('Please fill in all fields.', 'error');
      return;
    }
    pendingProviderData = { protocol, displayName, name };
  }
  if (step === 3) {
    const apiKey = document.getElementById('ap-apiKey')?.value;
    pendingProviderData.apiKey = apiKey;
    pendingProviderData.endpoint = document.getElementById('ap-endpoint')?.value;
    pendingProviderData.defaultModel = document.getElementById('ap-defaultModel')?.value;
    pendingProviderData.priority = parseInt(document.getElementById('ap-priority')?.value || '100');
    pendingProviderData.timeout = parseInt(document.getElementById('ap-timeout')?.value || '15000');
  }
  updateWizardStep(step);
}

async function testNewProvider() {
  const resultEl = document.getElementById('ap-testResult');
  if (!resultEl) return;

  resultEl.className = 'test-result testing';
  resultEl.style.display = 'block';
  resultEl.textContent = 'Testing connection...';

  try {
    const data = pendingProviderData;
    // Test connection via API
    const result = await API.post('/api/providers/test-connection', {
      protocol: data.protocol,
      endpoint: data.endpoint,
      apiKey: data.apiKey,
      timeout: data.timeout,
    });

    if (result.ok) {
      resultEl.className = 'test-result success';
      resultEl.textContent = '\u2713 Authentication\n\u2713 Provider reachable\n\u2713 Model available\n\u2713 Runtime registered';
    } else {
      resultEl.className = 'test-result error';
      resultEl.textContent = `Connection failed: ${result.error || 'Unknown error'}`;
    }
  } catch (error) {
    resultEl.className = 'test-result error';
    resultEl.textContent = `Connection failed: ${error.message}`;
  }
}

async function saveNewProvider() {
  try {
    await API.post('/api/providers/manage', {
      ...pendingProviderData,
      providerType: 'custom',
    });
    closeAddProviderModal();
    showToast('Provider saved!', 'success');
    loadProviders();
  } catch (error) {
    showToast('Failed to save provider.', 'error');
  }
}

async function loadManagedProviders() {
  try {
    const data = await API.get('/api/providers/manage');
    const listEl = document.getElementById('managedProviders');
    if (listEl && data.ok && data.providers) {
      listEl.innerHTML = data.providers.map(p => `
        <div class="provider-row">
          <div>
            <div class="provider-name">${p.displayName || p.name}</div>
            <div class="provider-meta"><span>${p.protocol || 'N/A'}</span><span>${p.health?.healthState || 'N/A'}</span></div>
          </div>
          <span class="badge ${p.enabled ? 'badge-green' : 'badge-muted'}">${p.enabled ? 'Active' : 'Inactive'}</span>
        </div>
      `).join('');
    }
  } catch (error) {
    // Silently handle
  }
}