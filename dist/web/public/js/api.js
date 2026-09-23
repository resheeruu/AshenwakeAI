/* ==================== API CLIENT ==================== */

const API = {
  base: '',
  token: null,
  csrfToken: null,

  setAuth(token, csrf) {
    this.token = token;
    this.csrfToken = csrf;
  },

  async request(url, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }
    if (this.csrfToken && options.method !== 'GET') {
      headers['X-CSRF-Token'] = this.csrfToken;
    }

    const config = {
      ...options,
      headers: { ...headers, ...options.headers },
    };

    try {
      const response = await fetch(url, config);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || 'Request failed');
      }

      return data;
    } catch (error) {
      if (error.message === 'Failed to fetch') {
        throw new Error('Network error. Please check your connection.');
      }
      throw error;
    }
  },

  get(url) { return this.request(url, { method: 'GET' }); },
  post(url, data) { return this.request(url, { method: 'POST', body: JSON.stringify(data) }); },
  put(url, data) { return this.request(url, { method: 'PUT', body: JSON.stringify(data) }); },
  delete(url) { return this.request(url, { method: 'DELETE' }); },
};

document.addEventListener('DOMContentLoaded', function() {
  const sessionId = getCookie('session_id');
  const csrfToken = getCookie('csrf_token');
  if (sessionId && csrfToken) {
    API.setAuth(sessionId, csrfToken);
  }
});

function getCookie(name) {
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return match ? decodeURIComponent(match[2]) : null;
}