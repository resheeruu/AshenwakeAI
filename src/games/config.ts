import { Rarity, EquipmentSlot } from "./types";

export const GAME_CONFIG = {
  xp: {
    basePerLevel: 100,
    curveExponent: 1.35,
    huntDeathXpPercent: 0.25,
    adventureDeathXpPercent: 0.25,
  },

  level: {
    hpPerLevel: 10,
    attackPerLevel: 2,
    defensePerLevel: 1,
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
    monthlyBonusXp: 100,
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
    deathStreakReset: true,
  },

  hunt: {
    cooldownMs: 15_000,
    rareEncounterChance: 0.01,
    lootDropByRarity: {
      common: 0.12,
      uncommon: 0.18,
      rare: 0.30,
      epic: 0.45,
      legendary: 0.65,
      mythic: 0.90,
    } as Record<Rarity, number>,
  },

  pets: {
    xpPerLevel: 100,
    evolutionLevel: 10,
    evolutionBonusMultiplier: 1.25,
    levelBonusPerLevel: 0.05,
  },

  dungeon: {
    fleeChance: 0.35,
    bossDefenseReduction: 0.5,
    playerDefenseReduction: 0.5,
    defendDamageReduction: 0.5,
  },

  worldBoss: {
    durationMs: 60 * 60 * 1000,
    attackCooldownMs: 30 * 1000,
    rankMultipliers: {
      1: 3,
      2: 2,
      3: 1.5,
    } as Record<number, number>,
  },

  casino: {
    minWager: 10 as number,
    maxWager: 100_000 as number,
    jackpotRate: 0.05,
    defaultJackpot: 10_000 as number,
  },

  trading: {
    maxPendingTrades: 3,
    tradeExpirationMs: 5 * 60 * 1000,
  },

  guild: {
    xpPerGuildLevel: 1000,
    maxMembers: 50,
    upgradeCostMultiplier: 1,
  },

  seasons: {
    durationDays: 30,
    archiveOnEnd: true,
  },

  reputation: {
    regionUnlockThresholds: {
      ashen_village: 0,
      blackwood: 25,
      crimson_wastes: 100,
      abyss: 300,
      celestial_realm: 750,
    },
  },

  rarityMultipliers: {
    common: 1,
    uncommon: 1.25,
    rare: 1.6,
    epic: 2.1,
    legendary: 2.8,
    mythic: 3.8,
    divine: 5.0,
  } as Record<Rarity, number>,

  rarityDropChances: {
    common: 0.40,
    uncommon: 0.25,
    rare: 0.18,
    epic: 0.10,
    legendary: 0.05,
    mythic: 0.015,
    divine: 0.005,
  } as Record<Rarity, number>,

  equipmentSlots: [
    "weapon",
    "armor",
    "helmet",
    "boots",
    "ring",
    "amulet",
  ] as EquipmentSlot[],
} as const;

export type GameConfig = typeof GAME_CONFIG;
