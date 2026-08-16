import { GamePlayer, Rarity } from "./types";
import { getRegion } from "./world";
import {
  addEquipment,
  createEquipment,
  rollEquipmentRarity,
} from "./equipment";

export type HuntEncounterType =
  | "wolf"
  | "undead"
  | "demon"
  | "dragon"
  | "ancient_boss"
  | "world_event";

export type HuntEncounter = {
  id: HuntEncounterType;
  name: string;
  emoji: string;
  rarity: Rarity;
  minLevel: number;
  hp: number;
  attack: number;
  defense: number;
  rewardCoins: [number, number];
  rewardXp: [number, number];
  reputation: number;
  fleeChance: number;
  rare: boolean;
};

export type HuntResult = {
  encounter: HuntEncounter;
  victory: boolean;
  fled: boolean;
  died: boolean;
  damageTaken: number;
  coins: number;
  xp: number;
  reputation: number;
  loot?: ReturnType<typeof createEquipment>;
  rareEncounter: boolean;
};

export const HUNT_ENCOUNTERS: HuntEncounter[] = [
  {
    id: "wolf",
    name: "Ashen Wolf",
    emoji: "🐺",
    rarity: "common",
    minLevel: 1,
    hp: 35,
    attack: 8,
    defense: 3,
    rewardCoins: [15, 35],
    rewardXp: [20, 40],
    reputation: 2,
    fleeChance: 0.05,
    rare: false,
  },
  {
    id: "undead",
    name: "Rotting Undead",
    emoji: "🧟",
    rarity: "uncommon",
    minLevel: 3,
    hp: 60,
    attack: 14,
    defense: 7,
    rewardCoins: [30, 65],
    rewardXp: [35, 65],
    reputation: 4,
    fleeChance: 0.08,
    rare: false,
  },
  {
    id: "demon",
    name: "Crimson Demon",
    emoji: "👹",
    rarity: "rare",
    minLevel: 10,
    hp: 120,
    attack: 28,
    defense: 14,
    rewardCoins: [75, 150],
    rewardXp: [80, 130],
    reputation: 8,
    fleeChance: 0.12,
    rare: false,
  },
  {
    id: "dragon",
    name: "Ashen Dragon",
    emoji: "🐉",
    rarity: "epic",
    minLevel: 20,
    hp: 300,
    attack: 55,
    defense: 30,
    rewardCoins: [200, 450],
    rewardXp: [180, 300],
    reputation: 20,
    fleeChance: 0.18,
    rare: false,
  },
  {
    id: "ancient_boss",
    name: "Ancient Shadow",
    emoji: "👑",
    rarity: "legendary",
    minLevel: 30,
    hp: 750,
    attack: 95,
    defense: 55,
    rewardCoins: [500, 1200],
    rewardXp: [400, 700],
    reputation: 50,
    fleeChance: 0.25,
    rare: true,
  },
  {
    id: "world_event",
    name: "The World Devourer",
    emoji: "🌑",
    rarity: "mythic",
    minLevel: 50,
    hp: 2000,
    attack: 180,
    defense: 100,
    rewardCoins: [2000, 5000],
    rewardXp: [1000, 2000],
    reputation: 150,
    fleeChance: 0.35,
    rare: true,
  },
];

function randomInt(min: number, max: number): number {
  return Math.floor(
    Math.random() * (max - min + 1),
  ) + min;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function getHuntEncounter(
  player: GamePlayer,
): HuntEncounter {
  const region = getRegion(player.regionId);

  const available = HUNT_ENCOUNTERS.filter(
    (encounter) =>
      player.level >= encounter.minLevel &&
      encounter.minLevel <=
        Math.max(1, region.minLevel + region.danger * 3),
  );

  const pool =
    available.length > 0
      ? available
      : [HUNT_ENCOUNTERS[0]];

  /*
   * Rare encounters are intentionally uncommon.
   * The actual reward is still resolved by deterministic code.
   */
  const rareRoll = Math.random();

  if (rareRoll < 0.01) {
    const rarePool = pool.filter(
      (encounter) => encounter.rare,
    );

    if (rarePool.length > 0) {
      return rarePool[
        randomInt(0, rarePool.length - 1)
      ];
    }
  }

  return pool[
    randomInt(0, pool.length - 1)
  ];
}

export function resolveHunt(
  player: GamePlayer,
  encounter: HuntEncounter = getHuntEncounter(player),
): HuntResult {
  const region = getRegion(player.regionId);

  const effectiveAttack =
    player.attack +
    Math.floor(region.danger * 2);

  const effectiveDefense =
    player.defense +
    Math.floor(region.danger * 2);

  const playerDamage = Math.max(
    1,
    effectiveAttack - Math.floor(encounter.defense * 0.65),
  );

  const enemyDamage = Math.max(
    1,
    encounter.attack -
      Math.floor(effectiveDefense * 0.5),
  );

  const turnsToWin = Math.ceil(
    encounter.hp / playerDamage,
  );

  const damageTaken = Math.max(
    0,
    (turnsToWin - 1) * enemyDamage,
  );

  const survivalHp = player.hp - damageTaken;

  if (survivalHp <= 0) {
    const actualDamageTaken = Math.max(0, player.hp - survivalHp);

    player.deaths += 1;
    player.huntStreak = 0;
    player.hp = Math.max(1, Math.floor(player.maxHp * 0.5));

    return {
      encounter,
      victory: false,
      fled: false,
      died: true,
      damageTaken: actualDamageTaken,
      coins: 0,
      xp: 0,
      reputation: 0,
      rareEncounter: encounter.rare,
    };
  }

  player.hp = survivalHp;

  const fleeRoll = Math.random();

  if (fleeRoll < encounter.fleeChance) {
    return {
      encounter,
      victory: false,
      fled: true,
      died: false,
      damageTaken,
      coins: 0,
      xp: 0,
      reputation: 0,
      rareEncounter: encounter.rare,
    };
  }

  const coins = randomInt(
    encounter.rewardCoins[0],
    encounter.rewardCoins[1],
  );

  const xp = randomInt(
    encounter.rewardXp[0],
    encounter.rewardXp[1],
  );

  const lootChance =
    encounter.rarity === "mythic"
      ? 0.9
      : encounter.rarity === "legendary"
        ? 0.6
        : encounter.rarity === "epic"
          ? 0.35
          : 0.12;

  let loot:
    | ReturnType<typeof createEquipment>
    | undefined;

  if (Math.random() < lootChance) {
    const templateIds = [
      "iron_sword",
      "ashen_blade",
      "leather_armor",
      "ashen_plate",
      "iron_helmet",
      "traveler_boots",
      "lucky_ring",
      "ashen_amulet",
    ];

    const templateId =
      templateIds[
        randomInt(0, templateIds.length - 1)
      ];

    const rarity =
      encounter.rarity === "mythic"
        ? "mythic"
        : encounter.rarity === "legendary"
          ? "legendary"
          : encounter.rarity === "epic"
            ? "epic"
            : rollEquipmentRarity();

    loot = createEquipment(
      templateId,
      rarity,
    );

    addEquipment(player, loot);
  }

  const luckBonus = clamp(
    player.luck * 0.005,
    0,
    0.25,
  );

  const bonusCoins = Math.floor(
    coins * luckBonus,
  );

  const finalCoins = coins + bonusCoins;

  player.coins += finalCoins;
  player.xp += xp;
  player.totalXpEarned =
    (player.totalXpEarned ?? 0) + xp;
  player.reputation += encounter.reputation;

  player.huntsCompleted =
    (player.huntsCompleted ?? 0) + 1;

  if (encounter.rarity === "legendary") {
    player.legendaryHunts =
      (player.legendaryHunts ?? 0) + 1;
  }

  if (
    encounter.rarity === "epic" ||
    encounter.rarity === "legendary" ||
    encounter.rarity === "mythic"
  ) {
    player.epicHunts =
      (player.epicHunts ?? 0) + 1;
  }

  player.huntStreak =
    (player.huntStreak ?? 0) + 1;

  player.bestHuntStreak = Math.max(
    player.bestHuntStreak ?? 0,
    player.huntStreak,
  );

  return {
    encounter,
    victory: true,
    fled: false,
    died: false,
    damageTaken,
    coins: finalCoins,
    xp,
    reputation: encounter.reputation,
    loot,
    rareEncounter: encounter.rare,
  };
}

export function resetHuntStreak(
  player: GamePlayer,
): void {
  player.huntStreak = 0;
}
