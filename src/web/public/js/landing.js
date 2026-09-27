/* ==================== LANDING PAGE BEHAVIOUR ==================== */

document.addEventListener('DOMContentLoaded', function () {
  initHealthPill();
  initActiveNav();
  initHeroTyping();
});

/* ---------- Live status from /api/health ---------- */
function initHealthPill() {
  var pill = document.getElementById('healthPill');
  var text = document.getElementById('healthText');
  if (!pill || !text) return;

  function paint(state, label) {
    pill.classList.remove('is-degraded', 'is-down');
    if (state) pill.classList.add(state);
    text.textContent = label;
  }

  function read() {
    return fetch('/api/health', {
      headers: { 'Accept': 'application/json' },
      cache: 'no-store'
    }).then(function (res) {
      if (!res.ok && res.status !== 503) throw new Error('health ' + res.status);
      return res.json();
    });
  }

  function apply(data) {
    var version = data.version ? ' · v' + data.version : '';
    if (data.ok) {
      paint('', 'All systems operational' + version);
      return;
    }
    var detail = [];
    if (data.database && data.database !== 'ok') detail.push('database ' + data.database);
    if (data.preflight && data.preflight !== 'ok') detail.push('preflight ' + data.preflight);
    var suffix = detail.length ? ' — ' + detail.join(', ') : '';
    paint('is-down', 'Degraded' + version + suffix);
  }

  read().then(apply).catch(function () {
    paint('is-degraded', 'Status unavailable');
  });
}

/* ---------- Highlight the section currently in view ---------- */
function initActiveNav() {
  var links = Array.prototype.slice.call(document.querySelectorAll('.nav-links a[href^="#"]'));
  if (!links.length || typeof window.IntersectionObserver !== 'function') return;

  var map = {};
  var sections = [];
  links.forEach(function (link) {
    var id = link.getAttribute('href');
    var section = id ? document.querySelector(id) : null;
    if (!section) return;
    map[id] = link;
    sections.push(section);
  });
  if (!sections.length) return;

  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      var id = '#' + entry.target.id;
      links.forEach(function (l) { l.classList.remove('active'); });
      if (map[id]) map[id].classList.add('active');
    });
  }, { rootMargin: '-45% 0px -50% 0px', threshold: 0 });

  sections.forEach(function (s) { observer.observe(s); });
}

/* ---------- Rotating prompt in the hero mock ---------- */
function initHeroTyping() {
  var field = document.querySelector('.msg-input');
  if (!field) return;

  var target = field.querySelector('span');
  if (!target) return;

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) return;

  var prompts = [
    'Message #general',
    '/ask what changed in the raid policy?',
    'ash mine 50',
    '/settings panel',
    'ash battle @rival'
  ];

  var index = 0;
  var char = 0;
  var deleting = false;

  function tick() {
    var full = prompts[index];
    char += deleting ? -1 : 1;
    target.textContent = full.slice(0, char);

    var delay = deleting ? 34 : 62;
    if (!deleting && char === full.length) {
      deleting = true;
      delay = 1900;
    } else if (deleting && char === 0) {
      deleting = false;
      index = (index + 1) % prompts.length;
      delay = 420;
    }
    window.setTimeout(tick, delay);
  }

  window.setTimeout(tick, 900);
}
