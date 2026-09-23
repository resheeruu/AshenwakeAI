"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var worldBosses_exports = {};
__export(worldBosses_exports, {
  WORLD_BOSSES: () => WORLD_BOSSES,
  attackWorldBoss: () => attackWorldBoss,
  canAttackWorldBoss: () => canAttackWorldBoss,
  claimWorldBossReward: () => claimWorldBossReward,
  createWorldBoss: () => createWorldBoss,
  getWorldBoss: () => getWorldBoss,
  getWorldBossLeaderboard: () => getWorldBossLeaderboard,
  getWorldBossMvp: () => getWorldBossMvp,
  isWorldBossActive: () => isWorldBossActive
});
module.exports = __toCommonJS(worldBosses_exports);
var import_equipment = require("./equipment");
var import_config = require("./config");
const WORLD_BOSSES = [
  {
    id: "infernal_dragon",
    name: "Infernal Dragon",
    emoji: "\u{1F409}",
    minLevel: 10,
    maxHp: 1e7,
    attack: 120,
    defense: 50,
    rewardCoins: [500, 1500],
    rewardXp: [250, 750],
    rewardRarity: "epic"
  },
  {
    id: "abyss_titan",
    name: "Abyss Titan",
    emoji: "\u{1F311}",
    minLevel: 30,
    maxHp: 5e7,
    attack: 250,
    defense: 100,
    rewardCoins: [1500, 5e3],
    rewardXp: [750, 2e3],
    rewardRarity: "legendary"
  },
  {
    id: "celestial_god",
    name: "Celestial God",
    emoji: "\u2728",
    minLevel: 50,
    maxHp: 1e8,
    attack: 500,
    defense: 200,
    rewardCoins: [5e3, 15e3],
    rewardXp: [2e3, 5e3],
    rewardRarity: "mythic"
  }
];
const BOSS_DURATION_MS = import_config.GAME_CONFIG.worldBoss.durationMs;
const ATTACK_COOLDOWN_MS = import_config.GAME_CONFIG.worldBoss.attackCooldownMs;
function randomInt(min, max) {
  return Math.floor(
    Math.random() * (max - min + 1)
  ) + min;
}
function getWorldBoss(bossId) {
  return WORLD_BOSSES.find(
    (boss) => boss.id === bossId
  );
}
function createWorldBoss(bossId, now = Date.now()) {
  const boss = getWorldBoss(bossId);
  if (!boss) {
    throw new Error("INVALID_WORLD_BOSS");
  }
  return {
    id: `worldboss_${now}_${randomInt(1e3, 9999)}`,
    bossId,
    hp: boss.maxHp,
    maxHp: boss.maxHp,
    spawnedAt: now,
    expiresAt: now + BOSS_DURATION_MS,
    status: "active",
    contributions: []
  };
}
function isWorldBossActive(state, now = Date.now()) {
  if (state.status !== "active") {
    return false;
  }
  if (now >= state.expiresAt) {
    state.status = "expired";
    return false;
  }
  return state.hp > 0;
}
function getContribution(state, userId) {
  let contribution = state.contributions.find(
    (entry) => entry.userId === userId
  );
  if (!contribution) {
    contribution = {
      userId,
      damage: 0,
      attacks: 0,
      lastAttackAt: 0
    };
    state.contributions.push(contribution);
  }
  return contribution;
}
function canAttackWorldBoss(state, player, now = Date.now()) {
  if (!isWorldBossActive(state, now)) {
    return false;
  }
  const boss = getWorldBoss(state.bossId);
  if (!boss) {
    return false;
  }
  if (player.level < boss.minLevel) {
    return false;
  }
  const contribution = getContribution(
    state,
    player.userId
  );
  return now - contribution.lastAttackAt >= ATTACK_COOLDOWN_MS;
}
function attackWorldBoss(state, player, now = Date.now()) {
  if (!canAttackWorldBoss(state, player, now)) {
    throw new Error("WORLD_BOSS_ATTACK_NOT_AVAILABLE");
  }
  const boss = getWorldBoss(state.bossId);
  if (!boss) {
    throw new Error("INVALID_WORLD_BOSS");
  }
  const contribution = getContribution(
    state,
    player.userId
  );
  const damage = Math.max(
    1,
    player.attack - Math.floor(boss.defense * 0.5) + randomInt(0, Math.max(1, player.luck))
  );
  state.hp = Math.max(
    0,
    state.hp - damage
  );
  contribution.damage += damage;
  contribution.attacks += 1;
  contribution.lastAttackAt = now;
  if (state.hp <= 0) {
    state.status = "defeated";
  }
  const ranking = [...state.contributions].sort((a, b) => b.damage - a.damage);
  const rank = ranking.findIndex(
    (entry) => entry.userId === player.userId
  ) + 1;
  return {
    damage,
    remainingHp: state.hp,
    defeated: state.status === "defeated",
    rank,
    totalDamage: contribution.damage
  };
}
function getWorldBossLeaderboard(state) {
  return [...state.contributions].sort(
    (a, b) => b.damage - a.damage
  );
}
async function claimWorldBossReward(state, player) {
  if (state.status !== "defeated") {
    throw new Error("WORLD_BOSS_NOT_DEFEATED");
  }
  const boss = getWorldBoss(state.bossId);
  if (!boss) {
    throw new Error("INVALID_WORLD_BOSS");
  }
  const contribution = state.contributions.find(
    (entry) => entry.userId === player.userId
  );
  if (!contribution || contribution.damage <= 0) {
    throw new Error("NO_WORLD_BOSS_CONTRIBUTION");
  }
  const ranking = getWorldBossLeaderboard(state);
  const rank = ranking.findIndex(
    (entry) => entry.userId === player.userId
  ) + 1;
  const rankMultiplier = import_config.GAME_CONFIG.worldBoss.rankMultipliers[rank] ?? 1;
  const coins = Math.floor(
    randomInt(
      boss.rewardCoins[0],
      boss.rewardCoins[1]
    ) * rankMultiplier
  );
  const xp = Math.floor(
    randomInt(
      boss.rewardXp[0],
      boss.rewardXp[1]
    ) * rankMultiplier
  );
  const templates = [
    "ashen_blade",
    "ashen_plate",
    "iron_helmet",
    "traveler_boots",
    "lucky_ring",
    "ashen_amulet"
  ];
  const templateId = templates[randomInt(0, templates.length - 1)];
  const loot = (0, import_equipment.createEquipment)(
    templateId,
    boss.rewardRarity
  );
  player.coins += coins;
  player.xp += xp;
  player.totalXpEarned = (player.totalXpEarned ?? 0) + xp;
  (0, import_equipment.addEquipment)(player, loot);
  return {
    coins,
    xp,
    loot,
    rank
  };
}
function getWorldBossMvp(state) {
  return getWorldBossLeaderboard(state)[0];
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  WORLD_BOSSES,
  attackWorldBoss,
  canAttackWorldBoss,
  claimWorldBossReward,
  createWorldBoss,
  getWorldBoss,
  getWorldBossLeaderboard,
  getWorldBossMvp,
  isWorldBossActive
});
