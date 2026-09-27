/* ==================== SCROLL REVEAL ==================== */
/*
 * Progressive enhancement only: if IntersectionObserver is missing or the
 * visitor asked for reduced motion, every element is shown immediately.
 * Never hide content behind an animation that may not run.
 */

(function () {
  'use strict';

  function prefersReducedMotion() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function showAll(root) {
    var nodes = root.querySelectorAll('.reveal');
    for (var i = 0; i < nodes.length; i++) nodes[i].classList.add('is-visible');
  }

  function initReveal(root) {
    var scope = root || document;
    var nodes = scope.querySelectorAll('.reveal:not(.is-visible)');
    if (!nodes.length) return;

    if (prefersReducedMotion() || typeof window.IntersectionObserver !== 'function') {
      showAll(scope);
      return;
    }

    var observer = new IntersectionObserver(function (entries, obs) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        obs.unobserve(entry.target);
      });
    }, { root: null, rootMargin: '0px 0px -6% 0px', threshold: 0.1 });

    for (var i = 0; i < nodes.length; i++) observer.observe(nodes[i]);
  }

  window.AshenReveal = { init: initReveal };

  document.addEventListener('DOMContentLoaded', function () {
    initReveal(document);
  });
})();
