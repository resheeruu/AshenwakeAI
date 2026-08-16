import { GamePlayer } from "./types";
import { getRegion, unlockAvailableRegion } from "./world";

export type ProgressionResult = {
  xpGained: number;
  levelsGained: number;
  previousLevel: number;
  newLevel: number;
  regionUnlocked?: string;
  titlesUnlocked: string[];
};

function xpRequired(level: number): number {
  return Math.floor(100 * Math.pow(level, 1.35));
}

export function getXpRequired(level: number): number {
  return xpRequired(level);
}

export function getTotalPower(player: GamePlayer): number {
  const equipment = player.equipment ?? [];

  const equipmentAttack = equipment
    .filter((item) => item.equipped)
    .reduce((sum, item) => sum + item.attack, 0);

  const equipmentDefense = equipment
    .filter((item) => item.equipped)
    .reduce((sum, item) => sum + item.defense, 0);

  const equipmentHp = equipment
    .filter((item) => item.equipped)
    .reduce((sum, item) => sum + item.hp, 0);

  return (
    player.attack +
    equipmentAttack +
    (player.defense + equipmentDefense) +
    Math.floor((player.maxHp + equipmentHp) / 10) +
    player.luck
  );
}

export function addXp(
  player: GamePlayer,
  amount: number,
): ProgressionResult {
  const xpGained = Math.max(0, Math.floor(amount));

  const previousLevel = player.level;
  const titlesUnlocked: string[] = [];

  player.xp += xpGained;
  player.totalXpEarned = (player.totalXpEarned ?? 0) + xpGained;

  while (player.xp >= xpRequired(player.level)) {
    player.xp -= xpRequired(player.level);
    player.level += 1;

    player.maxHp += 10;
    player.hp = player.maxHp;
    player.attack += 2;
    player.defense += 1;

    const title = getLevelTitle(player.level);

    if (title && !player.titles.includes(title)) {
      player.titles.push(title);
      titlesUnlocked.push(title);
    }
  }

  const regionBefore = getRegion(player.regionId);
  const unlocked = unlockAvailableRegion(player);

  return {
    xpGained,
    levelsGained: player.level - previousLevel,
    previousLevel,
    newLevel: player.level,
    regionUnlocked:
      unlocked && unlocked.id !== regionBefore.id
        ? unlocked.name
        : undefined,
    titlesUnlocked,
  };
}

function getLevelTitle(level: number): string | undefined {
  if (level >= 50) return "Godslayer";
  if (level >= 30) return "Abyss Walker";
  if (level >= 20) return "Dragon Slayer";
  if (level >= 10) return "Hunter";
  if (level >= 5) return "Adventurer";
  return undefined;
}

export function addReputation(
  player: GamePlayer,
  amount: number,
): string | undefined {
  player.reputation = Math.max(
    0,
    player.reputation + Math.floor(amount),
  );

  const before = player.regionId;
  const unlocked = unlockAvailableRegion(player);

  if (unlocked && unlocked.id !== before) {
    return unlocked.name;
  }

  return undefined;
}

export function applyDeath(player: GamePlayer): void {
  player.deaths = (player.deaths ?? 0) + 1;
  player.hp = player.maxHp;
  player.huntStreak = 0;

  if (!player.titles.includes("The Unlucky") && player.deaths >= 10) {
    player.titles.push("The Unlucky");
  }
}

export function healPlayer(
  player: GamePlayer,
  amount: number,
): number {
  const before = player.hp;

  player.hp = Math.min(
    player.maxHp,
    player.hp + Math.max(0, Math.floor(amount)),
  );

  return player.hp - before;
}

export function getProgressionSummary(player: GamePlayer): {
  region: string;
  xp: number;
  xpRequired: number;
  level: number;
  power: number;
  reputation: number;
} {
  return {
    region: getRegion(player.regionId).name,
    xp: player.xp,
    xpRequired: xpRequired(player.level),
    level: player.level,
    power: getTotalPower(player),
    reputation: player.reputation,
  };
}
