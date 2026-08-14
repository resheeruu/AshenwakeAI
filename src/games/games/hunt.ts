import { GamePlayer } from "../types";
import { updatePlayer } from "../store";
import { addItem, getLootForRarity } from "../loot";
import { applyLevelUp, updateAchievements } from "../rewards";

export interface HuntResult {
  title: string;
  description: string;
  coins: number;
  xp: number;
  rarity:
    | "common"
    | "uncommon"
    | "rare"
    | "legendary"
    | "danger";
  streak: number;
  huntsCompleted: number;
  levelUp?: boolean;
  xpBoostUsed?: boolean;
  luckyTokenUsed?: boolean;
  vipBadgeActive?: boolean;
  newAchievements?: string[];
}

export interface HuntCooldown {
  available: boolean;
  remainingMs: number;
}

export const HUNT_COOLDOWN_MS = 30_000;

const HUNT_EVENTS: Omit<
  HuntResult,
  "streak" | "huntsCompleted" | "levelUp" | "xpBoostUsed" | "luckyTokenUsed"
>[] = [
  {
    title: "🐺 Wolf Encounter",
    description:
      "You tracked a wild wolf and found a valuable reward.",
    coins: 20,
    xp: 15,
    rarity: "common",
  },
  {
    title: "🦊 Fox Den",
    description:
      "You discovered a hidden fox den containing old coins.",
    coins: 35,
    xp: 25,
    rarity: "uncommon",
  },
  {
    title: "💎 Crystal Cave",
    description:
      "You discovered a rare crystal deep inside a cave.",
    coins: 75,
    xp: 50,
    rarity: "rare",
  },
  {
    title: "👑 Ancient Treasure",
    description:
      "You uncovered an ancient treasure hidden beneath the ruins!",
    coins: 200,
    xp: 100,
    rarity: "legendary",
  },
  {
    title: "💀 Dangerous Trap",
    description:
      "You triggered a trap during the hunt and escaped with almost nothing.",
    coins: 5,
    xp: 5,
    rarity: "danger",
  },
];

function randomEvent(lucky = false) {
  const roll = Math.random();

  if (!lucky) {
    if (roll < 0.55) return HUNT_EVENTS[0];
    if (roll < 0.80) return HUNT_EVENTS[1];
    if (roll < 0.95) return HUNT_EVENTS[2];
    if (roll < 0.99) return HUNT_EVENTS[3];
    return HUNT_EVENTS[4];
  }

  // Lucky Token improves the odds of rare/legendary rewards.
  if (roll < 0.35) return HUNT_EVENTS[0];
  if (roll < 0.65) return HUNT_EVENTS[1];
  if (roll < 0.90) return HUNT_EVENTS[2];
  if (roll < 0.99) return HUNT_EVENTS[3];
  return HUNT_EVENTS[4];
}

export function getHuntCooldown(
  player: GamePlayer,
  now = Date.now(),
): HuntCooldown {
  const lastAt = player.huntLastAt ?? 0;

  const remainingMs = Math.max(
    0,
    lastAt + HUNT_COOLDOWN_MS - now,
  );

  return {
    available: remainingMs <= 0,
    remainingMs,
  };
}

export async function hunt(
  player: GamePlayer,
): Promise<HuntResult> {
  const cooldown = getHuntCooldown(player);

  if (!cooldown.available) {
    throw new Error(
      `HUNT_COOLDOWN:${cooldown.remainingMs}`,
    );
  }

  if (!player.inventory) {
    player.inventory = {};
  }

  // Temporary effects are activated with /game use
  // and consumed by the next successful hunt.
  const xpBoostUsed = player.xpBoostActive === true;
  const luckyTokenUsed = player.luckyTokenActive === true;

  const event = randomEvent(luckyTokenUsed);

  const earnedXp = xpBoostUsed
    ? event.xp * 2
    : event.xp;

  // Consume temporary effects after the successful hunt.
  player.xpBoostActive = false;
  player.luckyTokenActive = false;

  player.huntLastAt = Date.now();

  player.huntsCompleted =
    (player.huntsCompleted ?? 0) + 1;

  player.huntStreak =
    (player.huntStreak ?? 0) + 1;

  if (
    player.huntStreak >
    (player.bestHuntStreak ?? 0)
  ) {
    player.bestHuntStreak = player.huntStreak;
  }

  player.gamesPlayed++;

  const vipBadgeActive =
    (player.inventory.vip_badge ?? 0) > 0;

  const earnedCoins = vipBadgeActive
    ? Math.floor(event.coins * 1.25)
    : event.coins;

  player.coins += earnedCoins;
  player.xp += earnedXp;

  const levelUp = applyLevelUp(player);

  if (event.rarity === "legendary") {
    player.legendaryHunts =
      (player.legendaryHunts ?? 0) + 1;
  }


  const beforeAchievements = new Set(player.achievements);
  updateAchievements(player);
  const newAchievements = player.achievements.filter(
    (id) => !beforeAchievements.has(id),
  );

  const lootItem = getLootForRarity(event.rarity);

  if (lootItem) {
    addItem(player, lootItem);
  }

  await updatePlayer(player);

  return {
    ...event,
    coins: earnedCoins,
    xp: earnedXp,
    streak: player.huntStreak,
    huntsCompleted: player.huntsCompleted,
    levelUp,
    xpBoostUsed,
    luckyTokenUsed,
    vipBadgeActive,
    newAchievements,
  };
}
