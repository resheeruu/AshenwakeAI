/* ==================== MODERATION SECTION ==================== */

AshenSection('moderation', { mount: mountModeration });

function mountModeration(ctx) {
  const automod = document.getElementById('moderationAutomod');
  const thresholds = document.getElementById('moderationThresholds');
  const policy = document.getElementById('moderationPolicy');
  if (!automod || !thresholds || !policy) return;

  if (!ctx.guildId) {
    automod.innerHTML = AshenUI.empty('Select a server', 'Moderation rules are stored per server.', '⚑');
    thresholds.innerHTML = AshenUI.empty('Select a server', '', '⚑');
    policy.innerHTML = AshenUI.empty('Select a server', '', '⚑');
    return;
  }

  automod.innerHTML = AshenUI.loading('Loading filters…');
  thresholds.innerHTML = AshenUI.loading('Loading thresholds…');
  policy.innerHTML = AshenUI.loading('Loading policy…');
  loadModeration(ctx, automod, thresholds, policy);
}

async function loadModeration(ctx, automod, thresholds, policy) {
  const settingsBase = '/api/guilds/' + encodeURIComponent(ctx.guildId) + '/settings';
  const moderationBase = '/api/guilds/' + encodeURIComponent(ctx.guildId) + '/moderation';

  let full;
  try {
    const data = await API.get(settingsBase);
    if (ctx.stale()) return;
    full = (data && data.config) || {};
  } catch (err) {
    if (ctx.stale()) return;
    const html = AshenUI.failure(err, 'Moderation settings unavailable');
    automod.innerHTML = html;
    thresholds.innerHTML = html;
    policy.innerHTML = html;
    return;
  }

  const a = full.automod || {};
  const m = full.moderation || {};
  const readOnly = !ctx.canEdit;

  automod.innerHTML =
    AshenUI.toggle('automodEnabled', 'Filters enabled', 'Master switch for automatic content filtering.', a.enabled !== false, readOnly) +
    AshenUI.toggle('automodAntiSpam', 'Anti-spam', 'Repeated near-identical messages in a short window.', !!a.antiSpam, readOnly) +
    AshenUI.toggle('automodAntiFlood', 'Anti-flood', 'Message bursts faster than a human would send.', !!a.antiFlood, readOnly) +
    AshenUI.toggle('automodMentionSpam', 'Mention spam', 'Blocks mass pings used for raid harassment.', !!a.mentionSpam, readOnly) +
    AshenUI.toggle('automodAntiInvite', 'Invite links', 'Strips Discord server invites from chat.', !!a.antiInvite, readOnly) +
    AshenUI.toggle('automodAntiLink', 'Raw links', 'Blocks unsolicited links from new accounts.', !!a.antiLink, readOnly) +
    AshenUI.toggle('automodAntiScam', 'Scam signals', 'Flags known phishing and crypto-scam phrasing.', !!a.antiScam, readOnly) +
    AshenUI.toggle('automodAntiCaps', 'Caps flooding', 'Excessive all-caps messages.', !!a.antiCaps, readOnly) +
    AshenUI.toggle('automodAntiZalgo', 'Zalgo text', 'Combining characters used to break rendering.', !!a.antiZalgo, readOnly) +
    AshenUI.toggle('automodRaidMode', 'Raid mode', 'Locks new joins to slow-mode during an attack.', !!a.raidMode, readOnly) +
    AshenUI.formActions('Save filters', 'automod', readOnly ? 'Owner only' : '', readOnly);

  thresholds.innerHTML =
    AshenUI.number('modMaxMentions', 'Max mentions', 'Mentions allowed in one message.', a.maxMentions || 5, readOnly ? ' disabled min="1" max="50"' : ' min="1" max="50"') +
    AshenUI.number('modMaxMessages', 'Max messages', 'Messages allowed inside the flood window.', a.maxMessages || 6, readOnly ? ' disabled min="2" max="50"' : ' min="2" max="50"') +
    AshenUI.number('modFloodWindow', 'Flood window (ms)', 'Rolling window the message count applies to.', a.floodWindowMs || 5000, readOnly ? ' disabled min="500" max="60000"' : ' min="500" max="60000"') +
    AshenUI.number('modDefaultTimeout', 'Default timeout (minutes)', 'Applied when a moderator does not pick a duration.', m.defaultTimeoutMinutes || 10, readOnly ? ' disabled min="1" max="40320"' : ' min="1" max="40320"') +
    AshenUI.number('modMaxWarn', 'Warnings before action', 'Auto-action after this many recorded warnings.', m.maxWarnBeforeAction || 3, readOnly ? ' disabled min="1" max="20"' : ' min="1" max="20"') +
    AshenUI.formActions('Save thresholds', 'thresholds', readOnly ? 'Owner only' : '', readOnly);

  policy.innerHTML =
    AshenUI.toggle('modEnabled', 'Moderation enabled', 'Turns on warnings, timeouts and auto-actions.', m.enabled !== false, readOnly) +
    AshenUI.toggle('modAutoBan', 'Auto-ban at warning cap', 'Ban instead of timeout when the warning limit is reached.', !!m.autoBanOnMaxWarn, readOnly) +
    '<div class="info-note">Least privilege: the bot only acts with the moderation permissions it already holds in this server. Nothing is executed from stored rules without a matching Discord event.</div>' +
    AshenUI.formActions('Save policy', 'policy', readOnly ? 'Owner only' : '', readOnly);

  AshenUI.bindSave(automod, async function (gate) {
    if (gate !== 'automod') return;
    const next = Object.assign({}, a, {
      enabled: document.getElementById('automodEnabled').checked,
      antiSpam: document.getElementById('automodAntiSpam').checked,
      antiFlood: document.getElementById('automodAntiFlood').checked,
      mentionSpam: document.getElementById('automodMentionSpam').checked,
      antiInvite: document.getElementById('automodAntiInvite').checked,
      antiLink: document.getElementById('automodAntiLink').checked,
      antiScam: document.getElementById('automodAntiScam').checked,
      antiCaps: document.getElementById('automodAntiCaps').checked,
      antiZalgo: document.getElementById('automodAntiZalgo').checked,
      raidMode: document.getElementById('automodRaidMode').checked
    });
    await API.put(settingsBase, { automod: next });
    showToast('Filters saved.', 'success');
  });

  AshenUI.bindSave(thresholds, async function (gate) {
    if (gate !== 'thresholds') return;
    const num = (id, fallback) => {
      const parsed = Number(document.getElementById(id).value);
      return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
    };
    const nextFilters = Object.assign({}, a, {
      maxMentions: num('modMaxMentions', 5),
      maxMessages: num('modMaxMessages', 6),
      floodWindowMs: num('modFloodWindow', 5000)
    });
    const nextModeration = Object.assign({}, m, {
      defaultTimeoutMinutes: num('modDefaultTimeout', 10),
      maxWarnBeforeAction: num('modMaxWarn', 3)
    });
    await API.put(settingsBase, { automod: nextFilters });
    await API.put(moderationBase, nextModeration);
    showToast('Thresholds saved.', 'success');
  });

  AshenUI.bindSave(policy, async function (gate) {
    if (gate !== 'policy') return;
    await API.put(moderationBase, Object.assign({}, m, {
      enabled: document.getElementById('modEnabled').checked,
      autoBanOnMaxWarn: document.getElementById('modAutoBan').checked
    }));
    showToast('Moderation policy saved.', 'success');
  });
}
