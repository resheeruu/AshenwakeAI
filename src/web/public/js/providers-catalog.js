/* ==================== INTEGRATIONS · PROVIDER CATALOG ==================== */

AshenSection('integrations', { mount: mountProviderCatalog });

let catalogActiveFilter = 'all';

function mountProviderCatalog(ctx) {
  const listEl = document.getElementById('providerCatalogList');
  if (!listEl) return;

  if (!ctx.isStaff) {
    listEl.innerHTML = AshenUI.denied('The provider catalog is visible to admin and owner accounts.');
    return;
  }

  listEl.innerHTML = AshenUI.skeleton(6);
  wireCatalogTabs(ctx);
  loadProviderCatalog(ctx);
}

function wireCatalogTabs(ctx) {
  const tabs = document.getElementById('catalogFilters');
  if (!tabs) return;
  tabs.querySelectorAll('.tab').forEach((tab) => {
    tab.onclick = function () {
      catalogActiveFilter = this.getAttribute('data-pricing') || 'all';
      tabs.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t === this));
      applyCatalogFilter();
    };
  });
}

function applyCatalogFilter() {
  document.querySelectorAll('#providerCatalogList .provider-card').forEach((card) => {
    const match = catalogActiveFilter === 'all' || card.getAttribute('data-pricing') === catalogActiveFilter;
    card.hidden = !match;
  });
}

async function loadProviderCatalog(ctx) {
  const listEl = document.getElementById('providerCatalogList');
  if (!listEl) return;

  try {
    const data = await API.get('/api/providers/catalog');
    if (ctx.stale()) return;
    const catalog = (data && data.catalog) || [];
    const total = (data && data.total) || catalog.length;

    if (!catalog.length) {
      listEl.innerHTML = AshenUI.empty('Catalog unavailable', 'The provider catalog could not be read from this build.', '⧉');
      return;
    }

    const toneFor = (pricing) => {
      if (pricing === 'free' || pricing === 'free-tier') return 'badge-green';
      if (pricing === 'trial') return 'badge-yellow';
      if (pricing === 'local') return 'badge-purple';
      if (pricing === 'custom') return 'badge-blue';
      return 'badge-muted';
    };
    const availClass = (availability) => {
      if (availability === 'available') return 'text-green';
      if (availability === 'unknown') return 'text-yellow';
      return 'text-red';
    };

    listEl.innerHTML = catalog.map((p) => {
      const pricing = String(p.pricingClass || 'custom');
      return '<div class="provider-card" data-pricing="' + escapeHtml(pricing) + '">' +
        '<div class="provider-header">' +
        '<h4>' + escapeHtml(p.displayName || p.name || p.id) + '</h4>' +
        '<span class="badge ' + toneFor(pricing) + '">' + escapeHtml(pricing.toUpperCase()) + '</span>' +
        '</div>' +
        '<div class="provider-meta">' +
        '<span>' + escapeHtml(p.category || '—') + '</span>' +
        '<span>' + escapeHtml((p.capabilities || []).join(', ') || 'chat') + '</span>' +
        '<span>Key: ' + (p.credentialRequired ? 'required' : 'not required') + '</span>' +
        '</div>' +
        (p.quota ? '<div class="hint">' + escapeHtml(p.quota) + '</div>' : '') +
        '<div class="provider-footer">' +
        '<span class="availability ' + availClass(p.availability) + '">' + escapeHtml(p.availability || 'unknown') + '</span>' +
        '<span class="text-dim">' + escapeHtml(p.protocol || '') + '</span>' +
        '</div>' +
        '</div>';
    }).join('');

    const counter = document.getElementById('catalogCount');
    if (counter) counter.textContent = total + ' entries — filter by pricing class';
    applyCatalogFilter();
  } catch (err) {
    if (ctx.stale()) return;
    listEl.innerHTML = AshenUI.failure(err, 'Provider catalog unavailable');
  }
}
