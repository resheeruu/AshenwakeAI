/* ==================== SETTINGS · SUPPORT CASES + CONFIG ==================== */

AshenSection('settings', { mount: mountSupport });

const CASE_STATUSES = ['open', 'investigating', 'waiting_user', 'waiting_staff', 'escalated', 'resolved', 'closed'];

function mountSupport(ctx) {
  const host = document.getElementById('settingsSupport');
  if (!host) return;

  if (!ctx.guildId) {
    host.innerHTML = AshenUI.empty('Select a server', 'Support cases are stored per server.', '◫');
    return;
  }

  host.innerHTML = AshenUI.loading('Loading support cases…');
  loadSupport(ctx, host);
}

async function loadSupport(ctx, host) {
  const base = '/api/guilds/' + encodeURIComponent(ctx.guildId);
  let config = {};
  let cases = [];
  let loadError = null;

  await Promise.all([
    API.get(base + '/settings')
      .then((d) => { config = (d && d.config && d.config.support) || {}; })
      .catch((err) => { loadError = err; }),
    API.get(base + '/support')
      .then((d) => { cases = (d && d.cases) || []; })
      .catch(() => { cases = []; })
  ]);
  if (ctx.stale()) return;

  const readOnly = !ctx.canEdit;
  const s = config || {};

  let html = '<div class="card form-card">' +
    '<div class="card-head"><div><div class="card-title">Support configuration</div>' +
    '<div class="card-sub">Where tickets land and which request types are accepted</div></div></div>' +
    AshenUI.toggle('supportEnabled', 'Support enabled', 'Allow members to open tickets from Discord.', s.enabled !== false, readOnly) +
    AshenUI.text('supportChannel', 'Ticket channel', 'Channel id that receives new tickets.', s.channelId || '', readOnly ? ' disabled' : '') +
    AshenUI.text('supportCategory', 'Ticket category', 'Category that holds open tickets.', s.categoryId || '', readOnly ? ' disabled' : '') +
    AshenUI.toggle('supportHelp', 'General help', 'Accept "I need help" tickets.', s.allowGeneralHelp !== false, readOnly) +
    AshenUI.toggle('supportReports', 'Reports', 'Accept reports against other members.', s.allowReports !== false, readOnly) +
    AshenUI.toggle('supportAppeals', 'Appeals', 'Accept appeals of moderation actions.', s.allowAppeals !== false, readOnly) +
    AshenUI.formActions('Save support config', 'support', readOnly ? 'Owner only' : '', readOnly) +
    '</div>';

  html += '<div class="inline-actions">' +
    AshenUI.badge(cases.length + ' cases', cases.length ? 'badge-blue' : 'badge-muted') +
    '<span class="spacer"></span>' +
    '<span class="text-dim">Cases created in Discord appear here</span>' +
    '</div>';

  if (loadError) {
    html += AshenUI.failure(loadError, 'Support cases unavailable');
  } else if (!cases.length) {
    html += AshenUI.empty('No support cases', 'Open a ticket in Discord with /support to create one.', '◫');
  } else {
    html += '<div class="table-wrap"><table class="data-table"><thead><tr>' +
      '<th>Case</th><th>Type</th><th>Status</th><th>Summary</th><th>Updated</th><th></th>' +
      '</tr></thead><tbody>' +
      cases.map((c) => {
        const statusTone = c.status === 'closed' || c.status === 'resolved' ? 'badge-muted'
          : c.status === 'escalated' ? 'badge-red'
          : c.status.indexOf('waiting') === 0 ? 'badge-yellow'
          : 'badge-green';
        const updated = c.updatedAt ? new Date(c.updatedAt) : null;
        const editable = ctx.isStaff && ctx.canEdit;
        return '<tr>' +
          '<td><code>' + escapeHtml(String(c.id).slice(0, 12)) + '</code></td>' +
          '<td>' + escapeHtml(c.type || 'support') + '</td>' +
          '<td><span class="badge ' + statusTone + '">' + escapeHtml(String(c.status || '').replace('_', ' ')) + '</span></td>' +
          '<td>' + escapeHtml(c.summary || '—') + '</td>' +
          '<td>' + escapeHtml(updated && !isNaN(updated) ? updated.toLocaleString() : '—') + '</td>' +
          '<td class="row-actions">' +
          (editable
            ? '<select class="select input-text" data-case-status="' + escapeHtml(c.id) + '">' +
              CASE_STATUSES.map((st) => '<option value="' + st + '"' + (st === c.status ? ' selected' : '') + '>' +
                st.replace('_', ' ') + '</option>').join('') +
              '</select>' +
              '<button class="btn btn-sm btn-secondary" type="button" data-case-save="' + escapeHtml(c.id) + '">Update</button>'
            : '<span class="text-dim">Read-only</span>') +
          '</td></tr>';
      }).join('') +
      '</tbody></table></div>';
  }

  host.innerHTML = html;

  AshenUI.bindSave(host, async function (gate) {
    if (gate !== 'support') return;
    await API.put(base + '/settings', {
      support: Object.assign({}, s, {
        enabled: document.getElementById('supportEnabled').checked,
        channelId: document.getElementById('supportChannel').value.trim(),
        categoryId: document.getElementById('supportCategory').value.trim(),
        allowGeneralHelp: document.getElementById('supportHelp').checked,
        allowReports: document.getElementById('supportReports').checked,
        allowAppeals: document.getElementById('supportAppeals').checked
      })
    });
    showToast('Support configuration saved.', 'success');
  });

  host.querySelectorAll('[data-case-save]').forEach((btn) => {
    btn.addEventListener('click', async function () {
      const id = this.getAttribute('data-case-save');
      const select = host.querySelector('[data-case-status="' + id + '"]');
      if (!select) return;
      try {
        await API.put(base + '/support/' + encodeURIComponent(id), { status: select.value });
        showToast('Case status updated.', 'success');
        await loadSupport(ctx, host);
      } catch (err) {
        showToast(Ashen.describeError(err), 'error');
      }
    });
  });
}
