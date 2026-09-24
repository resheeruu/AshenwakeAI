/* ==================== PROVIDER CATALOG MODULE ==================== */

async function loadProviderCatalog() {
  try {
    const data = await API.get('/api/providers/catalog');
    const listEl = document.getElementById('providerCatalogList');
    if (listEl && data.ok && data.catalog) {
      const catalog = data.catalog;
      listEl.innerHTML = catalog.map(p => `
        <div class="provider-card" data-pricing="${escapeHtml(p.pricingClass)}">
          <div class="provider-header">
            <h4>${escapeHtml(p.displayName)}</h4>
            <span class="badge badge-${p.pricingClass === 'free' ? 'green' : p.pricingClass === 'local' ? 'purple' : p.pricingClass === 'trial' ? 'yellow' : 'muted'}">${escapeHtml(p.pricingClass.toUpperCase())}</span>
          </div>
          <div class="provider-meta">
            <span>${escapeHtml(p.category)}</span>
            <span>${escapeHtml(p.capabilities ? p.capabilities.join(', ') : 'N/A')}</span>
            <span>Key: ${p.credentialRequired ? 'Yes' : 'No'}</span>
          </div>
          <div class="provider-footer">
            <span class="availability ${p.availability === 'available' ? 'text-green' : p.availability === 'unknown' ? 'text-yellow' : 'text-red'}">${escapeHtml(p.availability)}</span>
          </div>
        </div>
      `).join('');
    }
  } catch (error) {
    const listEl = document.getElementById('providerCatalogList');
    if (listEl) listEl.innerHTML = '<div class="empty-state"><div class="empty-title">Failed to load catalog</div></div>';
  }
}

function filterProviders(pricingClass) {
  const cards = document.querySelectorAll('#providerCatalogList .provider-card');
  cards.forEach(card => {
    if (pricingClass === 'all' || card.dataset.pricing === pricingClass) {
      card.style.display = '';
    } else {
      card.style.display = 'none';
    }
  });
}

document.addEventListener('DOMContentLoaded', function() {
  if (typeof loadProviderCatalog === 'function') loadProviderCatalog();
});
