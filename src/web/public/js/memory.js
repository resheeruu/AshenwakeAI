/* ==================== MEMORY SECTION ==================== */

AshenSection('memory', { mount: mountMemory });

function mountMemory(ctx) {
  const stats = document.getElementById('memoryStats');
  const config = document.getElementById('memoryConfig');
  if (!stats || !config) return;

  if (!ctx.isStaff) {
    stats.innerHTML = AshenUI.stat('—', 'Conversations') + AshenUI.stat('—', 'Stored messages') + AshenUI.stat('—', 'Persistence');
    config.innerHTML = AshenUI.denied('Memory controls are visible to admin and owner accounts.');
    return;
  }

  stats.innerHTML = AshenUI.skeleton(3);
  config.innerHTML = AshenUI.loading('Loading memory settings…');
  loadMemory(ctx, stats, config);
}

async function loadMemory(ctx, stats, config) {
  const settingsBase = '/api/guilds/' + encodeURIComponent(ctx.guildId) + '/settings';

  let statsData = null;
  let cfg = null;
  const jobs = [];

  jobs.push(API.get('/api/memory/stats')
    .then((d) => { statsData = d; })
    .catch(() => { statsData = null; }));

  if (ctx.guildId) {
    jobs.push(API.get(settingsBase)
      .then((d) => { cfg = (d && d.config && d.config.memory) || {}; })
      .catch((err) => { cfg = { __error: err }; }));
  } else {
    cfg = null;
  }

  await Promise.all(jobs);
  if (ctx.stale()) return;

  const mem = (statsData && statsData.memory) || {};
  stats.innerHTML =
    AshenUI.stat(numberOr(mem.conversations, 0), 'Conversations', '', 'Distinct threads the model remembers') +
    AshenUI.stat(numberOr(mem.messages, 0), 'Stored messages', '', 'Rolling window across all servers') +
    AshenUI.stat(mem.persistent ? 'Persistent' : 'In memory', 'Storage', mem.persistent ? 'green' : 'amber',
      mem.persistent ? 'Survives a restart' : 'Cleared on restart');

  if (!ctx.guildId) {
    config.innerHTML = AshenUI.empty('Select a server', 'Memory settings are stored per server.', '◍');
    return;
  }
  if (cfg && cfg.__error) {
    config.innerHTML = AshenUI.failure(cfg.__error, 'Memory settings unavailable');
    return;
  }

  const m = cfg || {};
  const readOnly = !ctx.canEdit;
  config.innerHTML =
    AshenUI.toggle('memoryEnabled', 'Remember conversations', 'Keep recent context so follow-up messages make sense.', m.enabled !== false, readOnly) +
    AshenUI.number('memoryMaxMessages', 'Messages per conversation', 'How much history is pulled into the prompt.', m.maxMessages || 40, readOnly ? ' disabled min="1" max="500"' : ' min="1" max="500"') +
    '<div class="info-note">Memory is scoped to this server. Messages from other servers are never merged into this context window.</div>' +
    AshenUI.formActions('Save memory settings', 'memory', readOnly ? 'Owner only' : '', readOnly);

  AshenUI.bindSave(config, async function (gate) {
    if (gate !== 'memory') return;
    await API.put(settingsBase, {
      memory: {
        enabled: document.getElementById('memoryEnabled').checked,
        maxMessages: Number(document.getElementById('memoryMaxMessages').value) || 40
      }
    });
    showToast('Memory settings saved.', 'success');
  });
}

function numberOr(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
