/* ==================== PUBLIC SITE JS ==================== */

/*
 * OAuth callbacks land on the marketing site (/?login=success…, /?mfa_required=…).
 * Hand those query params straight to the control center so the user never
 * sees a marketing page in the middle of signing in.
 */
(function forwardOAuthReturn() {
  try {
    var params = new URLSearchParams(window.location.search);
    var flags = ['login', 'error', 'mfa_required', 'link_required', 'challengeToken'];
    var hit = flags.some(function (key) { return params.has(key); });
    if (!hit) return;
    var path = window.location.pathname;
    if (path === '/login' || path === '/dashboard') return;
    window.location.replace('/login' + window.location.search + window.location.hash);
  } catch (_) { /* URL parsing unavailable — just stay put */ }
})();

document.addEventListener('DOMContentLoaded', function () {
  initToasts();
  initHeader();
  initNavToggle();
  initSmoothScroll();
});

function initToasts() {
  var container = document.getElementById('toastContainer');
  if (!container || typeof window.showToast === 'function') return;

  window.showToast = function (message, type) {
    var toast = document.createElement('div');
    toast.className = 'toast toast-' + (type || 'info');
    toast.textContent = String(message == null ? '' : message);
    container.appendChild(toast);

    setTimeout(function () {
      toast.classList.add('removing');
      setTimeout(function () {
        if (toast.parentNode === container) container.removeChild(toast);
      }, 220);
    }, 3400);
  };
}

function initHeader() {
  var header = document.getElementById('siteHeader') || document.querySelector('.site-header');
  if (!header) return;

  var ticking = false;
  function apply() {
    header.classList.toggle('is-stuck', window.scrollY > 12);
    ticking = false;
  }
  apply();
  window.addEventListener('scroll', function () {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(apply);
  }, { passive: true });
}

function initNavToggle() {
  var toggle = document.getElementById('navToggle');
  var menu = document.getElementById('mobileNav');
  if (!toggle || !menu) return;

  function close() {
    menu.classList.remove('open');
    toggle.setAttribute('aria-expanded', 'false');
  }

  toggle.addEventListener('click', function () {
    var open = menu.classList.toggle('open');
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  });

  menu.addEventListener('click', function (e) {
    if (e.target && e.target.tagName === 'A') close();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') close();
  });

  window.addEventListener('resize', function () {
    if (window.innerWidth > 760) close();
  });
}

function initSmoothScroll() {
  var header = document.getElementById('siteHeader') || document.querySelector('.site-header');
  var offset = header ? header.offsetHeight + 8 : 0;

  document.addEventListener('click', function (e) {
    var link = e.target && e.target.closest ? e.target.closest('a[href^="#"]') : null;
    if (!link) return;

    var id = link.getAttribute('href');
    if (!id || id === '#') return;

    var target = document.querySelector(id);
    if (!target) return;

    e.preventDefault();
    var top = target.getBoundingClientRect().top + window.scrollY - offset;
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: top, behavior: reduce ? 'auto' : 'smooth' });
    if (window.history && window.history.replaceState) {
      window.history.replaceState(null, '', id);
    }
  });
}
