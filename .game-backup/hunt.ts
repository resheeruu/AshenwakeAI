import {
  GamePlayer,
  HuntResult,
  Rarity,
} from "../types";

import {
  ACHIEVEMENTS,
  updateAchievements,
} from "../rewards";

import { updatePlayer } from "../store";

const HUNT_COOLDOWN_MS = 30 * 1000;

type LootEntry = {
  rarity: Rarity;
  chance: number;
  coins: [number, number];
  xp: [number, number];
  loot: string;
};

const LOOT_TABLE: LootEntry[] = [
  {
    rarity: "common",
    chance: 0.55,
    coins: [10, 25],
    xp: [10, 20],
    loot: "ashen_shard",
  },
  {
    rarity: "uncommon",
    chance: 0.25,
    coins: [25, 50],
    xp: [20, 35],
    loot: "mystic_herb",
  },
  {
    rarity: "rare",
    chance: 0.12,
    coins: [50, 100],
    xp: [35, 60],
    loot: "rare_crystal",
  },
  {
    rarity: "epic",
    chance: 0.06,
    coins: [100, 175],
    xp: [60, 100],
    loot: "epic_core",
  },
  {
    rarity: "legendary",
    chance: 0.02,
    coins: [200, 400],
    xp: [100, 200],
    loot: "legendary_relic",
  },
];

function randomInt(min: number, max: number): number {
  return Math.floor(
    Math.random() * (max - min + 1),
  ) + min;
}

function chooseLoot(
  lucky: boolean,
): LootEntry {
  let roll = Math.random();

  if (lucky) {
    roll *= 0.7;
  }

  let cumulative = 0;

  for (const entry of LOOT_TABLE) {
    cumulative += entry.chance;

    if (roll <= cumulative) {
      return entry;
    }
  }

  return LOOT_TABLE[0];
}

export async function hunt(
  player: GamePlayer,
): Promise<HuntResult> {
  const now = Date.now();

  if (
    player.huntLastAt &&
    now - player.huntLastAt < HUNT_COOLDOWN_MS
  ) {
    const remaining =
      HUNT_COOLDOWN_MS -
      (now - player.huntLastAt);

    throw new Error(
      `HUNT_COOLDOWN:${remaining}`,
    );
  }

  player.huntLastAt = now;

  player.huntStreak =
    (player.huntStreak ?? 0) + 1;

  player.bestHuntStreak = Math.max(
    player.bestHuntStreak ?? 0,
    player.huntStreak,
  );

  player.huntsCompleted =
    (player.huntsCompleted ?? 0) + 1;

  const lucky =
    player.luckyTokenActive === true;

  player.luckyTokenActive = false;

  const entry = chooseLoot(lucky);

  const coins = randomInt(
    entry.coins[0],
    entry.coins[1],
  );

  const xp = randomInt(
    entry.xp[0],
    entry.xp[1],
  );

  player.coins += coins;
  player.xp += xp;

  if (player.xpBoostActive) {
    player.xp += xp;
    player.xpBoostActive = false;
  }

  if (entry.rarity === "legendary") {
    player.legendaryHunts =
      (player.legendaryHunts ?? 0) + 1;
  }

  if (!player.inventory) {
    player.inventory = {};
  }

  player.inventory[entry.loot] =
    (player.inventory[entry.loot] ?? 0) + 1;

  const before =
    new Set(player.achievements);

  updateAchievements(player);

  const newAchievements =
    player.achievements.filter(
      (id) => !before.has(id),
    );

  await updatePlayer(player);

  const titles: Record<Rarity, string> = {
    danger: "Dangerous Encounter",
    common: "Common Discovery",
    uncommon: "Uncommon Discovery",
    rare: "Rare Discovery",
    epic: "Epic Discovery",
    legendary: "Legendary Discovery",
  };

  const descriptions: Record<Rarity, string> = {
    danger: "Something dangerous found you during the hunt.",
    common:
      "You discovered something useful in the Ashen realm.",
    uncommon:
      "Your hunt uncovered an unusual treasure.",
    rare:
      "You discovered a rare and valuable find.",
    epic:
      "An incredible treasure appeared during your hunt!",
    legendary:
      "The realm itself seems to have rewarded you.",
  };

  return {
    title: titles[entry.rarity],
    description: descriptions[entry.rarity],
    rarity: entry.rarity,
    coins,
    xp: player.xpBoostActive ? xp * 2 : xp,
    streak: player.huntStreak,
    huntsCompleted: player.huntsCompleted,
    newAchievements,
  };
}
