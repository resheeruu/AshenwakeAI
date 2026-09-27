/* ==================== SETTINGS SECTION ==================== */

AshenSection('settings', { mount: mountSettings });

function mountSettings(ctx) {
  const general = document.getElementById('settingsGeneral');
  const channels = document.getElementById('settingsChannels');
  const roles = document.getElementById('settingsRoles');
  if (!general || !channels || !roles) return;

  if (!ctx.guildId) {
    general.innerHTML = AshenUI.empty('Select a server', 'Settings are stored per server.', '⚒');
    channels.innerHTML = AshenUI.empty('Select a server', '', '⚒');
    roles.innerHTML = AshenUI.empty('Select a server', '', '⚒');
    return;
  }

  general.innerHTML = AshenUI.loading('Loading general settings…');
  channels.innerHTML = AshenUI.loading('Loading channels…');
  roles.innerHTML = AshenUI.loading('Loading staff roles…');
  loadSettings(ctx, general, channels, roles);
}

async function loadSettings(ctx, general, channels, roles) {
  const base = '/api/guilds/' + encodeURIComponent(ctx.guildId) + '/settings';
  let config;
  try {
    const data = await API.get(base);
    if (ctx.stale()) return;
    config = (data && data.config) || {};
  } catch (err) {
    if (ctx.stale()) return;
    const html = AshenUI.failure(err, 'Settings unavailable');
    general.innerHTML = html;
    channels.innerHTML = html;
    roles.innerHTML = html;
    return;
  }

  const readOnly = !ctx.canEdit;
  const staff = config.staff || {};

  general.innerHTML =
    AshenUI.text('setName', 'Server label', 'How this server appears in the control center.', config.guildName || '', readOnly ? ' disabled maxlength="100"' : ' maxlength="100"') +
    AshenUI.toggle('setEnabled', 'Bot enabled here', 'When off, the bot stays silent in this server.', config.enabled !== false, readOnly) +
    '<div class="hint">Server id: ' + escapeHtml(ctx.guildId) + '</div>' +
    AshenUI.formActions('Save general', 'general', readOnly ? 'Owner only' : '', readOnly);

  channels.innerHTML =
    AshenUI.text('chAssistant', 'Assistant channel', 'Channel id where the AI answers by default.', config.assistantChannelId || '', readOnly ? ' disabled' : '') +
    AshenUI.text('chLog', 'Log channel', 'Moderation and system events are posted here.', config.logChannelId || '', readOnly ? ' disabled' : '') +
    AshenUI.text('chTicket', 'Ticket category', 'Category that holds open support tickets.', config.ticketCategoryId || '', readOnly ? ' disabled' : '') +
    AshenUI.text('chWelcome', 'Welcome channel', 'Greetings are posted here when enabled.', config.welcomeChannelId || '', readOnly ? ' disabled' : '') +
    AshenUI.text('chVerify', 'Verification role', 'Role granted once a member passes verification.', config.verificationRoleId || '', readOnly ? ' disabled' : '') +
    '<div class="hint">Paste the numeric channel or role id from Discord\'s developer mode.</div>' +
    AshenUI.formActions('Save channels', 'channels', readOnly ? 'Owner only' : '', readOnly);

  const roleIds = Array.isArray(staff.roleIds) ? staff.roleIds : [];
  roles.innerHTML =
    AshenUI.text('staffRoles', 'Staff role ids', 'Comma-separated role ids allowed to act on queues.', roleIds.join(', '), readOnly ? ' disabled' : '') +
    '<div class="info-note">These roles only grant in-Discord staff powers. Control-center access is governed by the owner, admin and member roles on your account.</div>' +
    AshenUI.formActions('Save staff roles', 'roles', readOnly ? 'Owner only' : '', readOnly);

  AshenUI.bindSave(general, async function (gate) {
    if (gate !== 'general') return;
    await API.put(base, {
      guildName: document.getElementById('setName').value.trim(),
      enabled: document.getElementById('setEnabled').checked
    });
    await refreshGuildList();
    showToast('General settings saved.', 'success');
  });

  AshenUI.bindSave(channels, async function (gate) {
    if (gate !== 'channels') return;
    await API.put(base, {
      assistantChannelId: document.getElementById('chAssistant').value.trim(),
      logChannelId: document.getElementById('chLog').value.trim(),
      ticketCategoryId: document.getElementById('chTicket').value.trim(),
      welcomeChannelId: document.getElementById('chWelcome').value.trim(),
      verificationRoleId: document.getElementById('chVerify').value.trim()
    });
    showToast('Channel targets saved.', 'success');
  });

  AshenUI.bindSave(roles, async function (gate) {
    if (gate !== 'roles') return;
    const raw = document.getElementById('staffRoles').value;
    const roleIds = raw.split(',').map((s) => s.trim()).filter(Boolean);
    const invalid = roleIds.find((id) => !/^\d{17,20}$/.test(id));
    if (invalid) throw { message: '"' + invalid + '" is not a Discord role id.' };
    await API.put(base, { staff: { roleIds: roleIds } });
    showToast('Staff roles saved.', 'success');
  });
}

async function refreshGuildList() {
  if (!Ashen.isStaff()) return;
  try {
    const data = await API.get('/api/guilds');
    Ashen.setGuilds((data && data.guilds) || []);
  } catch (_) { /* the selector keeps its previous list */ }
}
