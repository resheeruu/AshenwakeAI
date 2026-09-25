/* ==================== AUTH MODULE ==================== */

document.addEventListener('DOMContentLoaded', function() {
  const params = new URLSearchParams(window.location.search);
  const loginSuccess = params.get('login');
  const loginError = params.get('error');

  initLoginForm();
  initMFACChallenge();
  initOAuthButtons();

  if (loginSuccess) {
    showToast('Login successful!', 'success');
    window.history.replaceState(null, '', '/dashboard');
  }
  if (loginError) {
    showToast(decodeURIComponent(loginError), 'error');
  }
});

function initLoginForm() {
  const form = document.getElementById('loginForm');
  if (!form) return;

  form.addEventListener('submit', async function(e) {
    e.preventDefault();
    const btn = document.getElementById('loginBtn');
    const errorEl = document.getElementById('loginError');
    const username = document.getElementById('loginUser').value;
    const password = document.getElementById('loginPass').value;

    if (!username || !password) {
      errorEl.textContent = 'Username and password are required.';
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Signing in...';
    errorEl.textContent = '';

    try {
      const data = await API.post('/auth/login', { username, password });

      if (data.mfaRequired) {
        showMFACChallenge(data.challengeToken, data.username, data.role);
        return;
      }

      API.setAuth(data.csrfToken, null);
      const role = data.user?.role || 'user';
      showApp(role);
      showToast('Welcome back!', 'success');
    } catch (error) {
      errorEl.textContent = error.message || 'Login failed.';
      btn.disabled = false;
      btn.textContent = 'Sign In';
    }
  });
}

function initMFACChallenge() {
  const btn = document.getElementById('mfaVerifyBtn');
  if (!btn) return;
  btn.addEventListener('click', verifyMfaChallenge);
}

let pendingMfaChallengeToken = null;

async function verifyMfaChallenge() {
  const code = document.getElementById('mfaCode')?.value;
  const recoveryCode = document.getElementById('mfaRecoveryCode')?.value;
  const errorEl = document.getElementById('mfaError');

  if (!code && !recoveryCode) {
    errorEl.textContent = 'Please enter a code.';
    return;
  }
  if (!pendingMfaChallengeToken) {
    errorEl.textContent = 'MFA challenge expired. Please sign in again.';
    return;
  }

  try {
    const data = await API.post('/auth/mfa/challenge', {
      challengeToken: pendingMfaChallengeToken,
      code: code || null,
      recoveryCode: recoveryCode || null,
    });

    const role = data.user?.role || 'user';
    pendingMfaChallengeToken = null;
    API.setAuth(data.csrfToken, null);
    showApp(role);
    showToast('MFA verified!', 'success');
  } catch (error) {
    errorEl.textContent = error.message || 'Invalid code.';
  }
}

function showMFACChallenge(token, username, role) {
  pendingMfaChallengeToken = token;
  const loginScreen = document.getElementById('loginScreen');
  const mfaScreen = document.getElementById('mfaChallengeScreen');
  const titleEl = document.getElementById('mfaChallengeSubtitle');

  if (loginScreen) loginScreen.style.display = 'none';
  if (mfaScreen) mfaScreen.style.display = 'flex';
  if (titleEl) titleEl.textContent = `Enter the code from your authenticator app for ${username || 'your account'}`;
}

function initOAuthButtons() {
  // Check for OAuth callbacks
  const params = new URLSearchParams(window.location.search);
  if (params.get('mfa_required') && params.get('challengeToken')) {
    // OAuth login for an MFA-enabled account — prompt for the code.
    showMFACChallenge(params.get('challengeToken'), params.get('username') || '', null);
    return;
  }
  if (params.get('link_required')) {
    const msg = params.get('message') || 'Please link your account';
    showToast(msg, 'error');
  }
}

function showApp(role) {
  const loginScreen = document.getElementById('loginScreen');
  const mfaScreen = document.getElementById('mfaChallengeScreen');
  const app = document.getElementById('app');
  const topRoleLabel = document.getElementById('topRoleLabel');
  const topRoleBadge = document.getElementById('topRoleBadge');

  if (loginScreen) loginScreen.style.display = 'none';
  if (mfaScreen) mfaScreen.style.display = 'none';
  if (app) app.style.display = 'block';

  const roleLabels = { owner: 'Owner', admin: 'Admin', user: 'User' };
  const roleClass = { owner: 'role-owner', admin: 'role-admin', user: 'role-user' };

  if (topRoleLabel) topRoleLabel.textContent = roleLabels[role] || 'Control Center';
  if (topRoleBadge) {
    topRoleBadge.textContent = (roleLabels[role] || 'User').toUpperCase();
    topRoleBadge.className = `role-badge ${roleClass[role] || 'role-user'}`;
  }

  if (typeof initDashboard === 'function') {
    initDashboard();
  }
}

function logout() {
  API.post('/auth/logout', {}).then(() => {
    window.location.href = '/dashboard';
  }).catch(() => {
    window.location.href = '/dashboard';
  });
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('removing');
    setTimeout(() => container.removeChild(toast), 200);
  }, 3000);
}