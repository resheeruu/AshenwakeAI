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
var config_exports = {};
__export(config_exports, {
  GAME_CONFIG: () => GAME_CONFIG
});
module.exports = __toCommonJS(config_exports);
const GAME_CONFIG = {
  xp: {
    basePerLevel: 100,
    curveExponent: 1.35,
    huntDeathXpPercent: 0.25,
    adventureDeathXpPercent: 0.25
  },
  level: {
    hpPerLevel: 10,
    attackPerLevel: 2,
    defensePerLevel: 1
  },
  economy: {
    startingCoins: 100,
    dailyCoins: 100,
    dailyXp: 25,
    maxDailyStreakBonus: 7,
    dailyStreakCoinBonus: 10,
    dailyStreakXpBonus: 5,
    weeklyBonusCoins: 100,
    weeklyBonusXp: 25,
    monthlyBonusCoins: 500,
    monthlyBonusXp: 100
  },
  combat: {
    baseCritChance: 0.05,
    critMultiplier: 1.5,
    baseDodgeChance: 0.03,
    fleeBaseChance: 0.15,
    defendDamageReduction: 0.5,
    abilityDamageMultiplier: 1.75,
    abilityDefenseReduction: 0.5,
    deathHpRestorePercent: 0.5,
    deathStreakReset: true
  },
  hunt: {
    cooldownMs: 15e3,
    rareEncounterChance: 0.01,
    lootDropByRarity: {
      common: 0.12,
      uncommon: 0.18,
      rare: 0.3,
      epic: 0.45,
      legendary: 0.65,
      mythic: 0.9
    }
  },
  pets: {
    xpPerLevel: 100,
    evolutionLevel: 10,
    evolutionBonusMultiplier: 1.25,
    levelBonusPerLevel: 0.05
  },
  dungeon: {
    fleeChance: 0.35,
    bossDefenseReduction: 0.5,
    playerDefenseReduction: 0.5,
    defendDamageReduction: 0.5
  },
  worldBoss: {
    durationMs: 60 * 60 * 1e3,
    attackCooldownMs: 30 * 1e3,
    rankMultipliers: {
      1: 3,
      2: 2,
      3: 1.5
    }
  },
  casino: {
    minWager: 10,
    maxWager: 1e5,
    jackpotRate: 0.05,
    defaultJackpot: 1e4
  },
  trading: {
    maxPendingTrades: 3,
    tradeExpirationMs: 5 * 60 * 1e3
  },
  guild: {
    xpPerGuildLevel: 1e3,
    maxMembers: 50,
    upgradeCostMultiplier: 1
  },
  seasons: {
    durationDays: 30,
    archiveOnEnd: true
  },
  reputation: {
    regionUnlockThresholds: {
      ashen_village: 0,
      blackwood: 25,
      crimson_wastes: 100,
      abyss: 300,
      celestial_realm: 750
    }
  },
  rarityMultipliers: {
    common: 1,
    uncommon: 1.25,
    rare: 1.6,
    epic: 2.1,
    legendary: 2.8,
    mythic: 3.8,
    divine: 5
  },
  rarityDropChances: {
    common: 0.4,
    uncommon: 0.25,
    rare: 0.18,
    epic: 0.1,
    legendary: 0.05,
    mythic: 0.015,
    divine: 5e-3
  },
  equipmentSlots: [
    "weapon",
    "armor",
    "helmet",
    "boots",
    "ring",
    "amulet"
  ]
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  GAME_CONFIG
});
