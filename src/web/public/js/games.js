/* ==================== GAMES SECTION ==================== */

AshenSection('games', { mount: mountGames });

function mountGames(ctx) {
  const host = document.getElementById('gamesConfig');
  if (!host) return;
  host.innerHTML = AshenUI.loading('Loading economy policy…');
  loadGames(ctx, host);
}

async function loadGames(ctx, host) {
  const settingsBase = ctx.guildId
    ? '/api/guilds/' + encodeURIComponent(ctx.guildId) + '/settings'
    : null;

  let gameConfig = null;
  let community = null;

  const jobs = [
    API.get('/api/games/config').then((d) => { gameConfig = (d && d.config) || null; }).catch(() => { gameConfig = null; })
  ];
  if (settingsBase) {
    jobs.push(API.get(settingsBase)
      .then((d) => { community = (d && d.config && d.config.community) || {}; })
      .catch((err) => { community = { __error: err }; }));
  }

  await Promise.all(jobs);
  if (ctx.stale()) return;

  const readOnly = !ctx.canEdit;
  let html = '';

  if (!settingsBase) {
    html += AshenUI.empty('Select a server', 'XP and level settings are stored per server.', '◇');
  } else if (community && community.__error) {
    html += AshenUI.failure(community.__error, 'Server economy settings unavailable');
  } else {
    const c = community || {};
    html +=
      AshenUI.toggle('gameXp', 'XP gains', 'Members earn XP for participating in chat.', c.xpEnabled !== false, readOnly) +
      AshenUI.toggle('gameLevels', 'Levels & ranks', 'XP converts into visible server levels.', c.levelsEnabled !== false, readOnly) +
      '<div class="info-note">Game commands are always available through the <code class="code-inline">ash</code> prefix. XP and levels only control progression, not access.</div>' +
      AshenUI.formActions('Save economy policy', 'economy', readOnly ? 'Owner only' : '', readOnly);
  }

  if (gameConfig) {
    html += '<div class="subpanel"><div class="kv-grid">' +
      AshenUI.kvCell('Starting coins', gameConfig.economy && gameConfig.economy.startingCoins) +
      AshenUI.kvCell('Daily coins', gameConfig.economy && gameConfig.economy.dailyCoins) +
      AshenUI.kvCell('Daily XP', gameConfig.economy && gameConfig.economy.dailyXp) +
      AshenUI.kvCell('Max streak bonus', gameConfig.economy && gameConfig.economy.maxDailyStreakBonus) +
      AshenUI.kvCell('Hunt cooldown', gameConfig.hunt && formatSeconds(gameConfig.hunt.cooldownMs)) +
      AshenUI.kvCell('Crit chance', gameConfig.combat && formatPercent(gameConfig.combat.baseCritChance)) +
      AshenUI.kvCell('Crit multiplier', gameConfig.combat && gameConfig.combat.critMultiplier + '×') +
      AshenUI.kvCell('Dodge chance', gameConfig.combat && formatPercent(gameConfig.combat.baseDodgeChance)) +
      AshenUI.kvCell('XP per level', gameConfig.xp && gameConfig.xp.basePerLevel) +
      AshenUI.kvCell('HP per level', gameConfig.level && gameConfig.level.hpPerLevel) +
      '</div>' +
      '<div class="hint">Compiled constants — shown read-only so the panel can never disagree with the games.</div></div>';
  } else {
    html += '<div class="subpanel">' + AshenUI.empty('Economy constants unavailable', 'The shared game configuration could not be read.', '◇') + '</div>';
  }

  host.innerHTML = html;

  if (settingsBase && community && !community.__error) {
    AshenUI.bindSave(host, async function (gate) {
      if (gate !== 'economy') return;
      await API.put(settingsBase, {
        community: Object.assign({}, community, {
          xpEnabled: document.getElementById('gameXp').checked,
          levelsEnabled: document.getElementById('gameLevels').checked
        })
      });
      showToast('Economy policy saved.', 'success');
    });
  }
}

function formatSeconds(ms) {
  const seconds = Number(ms) / 1000;
  if (!Number.isFinite(seconds)) return '—';
  return (seconds >= 60 ? (seconds / 60) + ' min' : seconds + ' s');
}

function formatPercent(value) {
  const pct = Number(value) * 100;
  if (!Number.isFinite(pct)) return '—';
  return pct.toFixed(pct % 1 === 0 ? 0 : 1) + '%';
}
