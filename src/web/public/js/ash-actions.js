/* ==================== ASH ACTIONS SECTION ==================== */

AshenSection('ash-actions', { mount: mountAshActions });

function mountAshActions(ctx) {
  const switches = document.getElementById('ashActionsSwitches');
  const catalog = document.getElementById('ashActionsCatalog');
  if (!switches || !catalog) return;

  if (!ctx.guildId) {
    switches.innerHTML = AshenUI.empty('Select a server', 'Social switches are stored per server.', '⚔');
    catalog.innerHTML = AshenUI.empty('Select a server', '', '⚔');
    return;
  }

  const base = '/api/guilds/' + encodeURIComponent(ctx.guildId) + '/social/config';
  loadAshActionsConfig(ctx, ctx.guildId);
  loadAshActionsCatalog(ctx);
}

async function loadAshActionsConfig(ctx, guildId) {
  const host = document.getElementById('ashActionsSwitches');
  if (!host) return;

  const base = '/api/guilds/' + encodeURIComponent(guildId) + '/social/config';
  host.innerHTML = AshenUI.loading('Loading social switches…');
  let social;
  try {
    const data = await API.get(base);
    if (ctx.stale()) return;
    social = (data && data.config) || {};
  } catch (err) {
    if (ctx.stale()) return;
    host.innerHTML = AshenUI.failure(err, 'Social switches unavailable');
    return;
  }

  const readOnly = !ctx.canEdit;
  host.innerHTML =
    AshenUI.toggle('socialEnabled', 'Social responses', 'Master switch for the bot\'s chatty behaviour.', social.enabled !== false, readOnly) +
    AshenUI.toggle('socialAnimeActions', 'Anime actions', 'Allow the 32 roleplay actions via the ash prefix.', social.animeActions !== false, readOnly) +
    AshenUI.toggle('socialCustomReactions', 'Custom reactions', 'React to messages with configured emotes.', !!social.customReactions, readOnly) +
    AshenUI.toggle('socialCustomEmoji', 'Custom emoji', 'Use server emoji instead of Unicode fallbacks.', !!social.customEmoji, readOnly) +
    AshenUI.toggle('socialRivalry', 'Rivalry mode', 'Track and escalate rivalries between members.', !!social.rivalryMode, readOnly) +
    AshenUI.toggle('socialDebate', 'Debate mode', 'Let members queue structured debates.', !!social.debateMode, readOnly) +
    AshenUI.toggle('socialAfkClear', 'Clear AFK on message', 'Automatically lift AFK when a member talks.', social.afkAutoClear !== false, readOnly) +
    AshenUI.number('socialCooldown', 'Global cooldown (ms)', 'Minimum gap between two social replies.', social.globalCooldownMs || 45000, readOnly ? ' disabled min="0" max="600000"' : ' min="0" max="600000"') +
    AshenUI.number('socialHourlyCap', 'Replies per hour', 'Hard cap so the bot never floods a channel.', social.maxResponsesPerHour || 30, readOnly ? ' disabled min="0" max="500"' : ' min="0" max="500"') +
    AshenUI.formActions('Save social switches', 'social', readOnly ? 'Owner only' : '', readOnly);

  AshenUI.bindSave(host, async function (gate) {
    if (gate !== 'social') return;
    const base = '/api/guilds/' + encodeURIComponent(ctx.guildId) + '/social/config';
    await API.put(base, Object.assign({}, social, {
      enabled: document.getElementById('socialEnabled').checked,
      animeActions: document.getElementById('socialAnimeActions').checked,
      customReactions: document.getElementById('socialCustomReactions').checked,
      customEmoji: document.getElementById('socialCustomEmoji').checked,
      rivalryMode: document.getElementById('socialRivalry').checked,
      debateMode: document.getElementById('socialDebate').checked,
      afkAutoClear: document.getElementById('socialAfkClear').checked,
      globalCooldownMs: Number(document.getElementById('socialCooldown').value) || 0,
      maxResponsesPerHour: Number(document.getElementById('socialHourlyCap').value) || 30
    }));
    showToast('Social switches saved.', 'success');
  });
}

async function loadAshActionsCatalog(ctx) {
  const host = document.getElementById('ashActionsCatalog');
  if (!host) return;

  let list = [];
  let total = 0;
  try {
    const data = await API.get('/api/games/anime-actions');
    if (ctx.stale()) return;
    list = (data && data.actions) || [];
    total = (data && data.total) || list.length;
  } catch (err) {
    if (ctx.stale()) return;
    host.innerHTML = AshenUI.failure(err, 'Action catalog unavailable');
    return;
  }

  if (!list.length) {
    host.innerHTML = AshenUI.empty('No actions registered', 'The catalog could not be read from the build.', '⚔');
    return;
  }

  const categories = {};
  list.forEach((a) => {
    const key = a.category || 'other';
    if (!categories[key]) categories[key] = [];
    categories[key].push(a);
  });

  let html = '<div class="inline-actions">' +
    AshenUI.badge(total + ' actions', 'badge-accent') +
    Object.keys(categories).map((key) => AshenUI.badge(categories[key].length + ' ' + key, 'badge-muted')).join('') +
    '<span class="spacer"></span>' +
    '<span class="text-dim">Invoked with <code class="code-inline">ash <action> @user</code></span>' +
    '</div>';

  Object.keys(categories).sort().forEach((key) => {
    html += '<div class="subpanel"><div class="kv-k">' + escapeHtml(key) + '</div>' +
      '<div class="chipline">' + categories[key].map((a) => {
        const cd = Math.round((Number(a.cooldownMs) || 0) / 1000);
        const aliases = a.aliases && a.aliases.length ? ' [' + a.aliases.join(', ') + ']' : '';
        return '<span class="chip" title="' + escapeHtml(a.description || a.name) + '">' +
          escapeHtml((a.emoji || '') + ' ' + a.name) + aliases +
          (cd ? '<span class="chip-meta">' + cd + 's</span>' : '') +
          '</span>';
      }).join('') + '</div></div>';
  });

  const host = document.getElementById('ashActionsCatalog');
  if (host) host.innerHTML = html;
}

function loadAshActionsSwitches(ctx) {
  // This is now handled in loadAshActionsConfig
}

AshenSection('ash-actions', { mount: mountAshActions });