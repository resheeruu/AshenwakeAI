import { getPlayer, updatePlayer } from "./store";
import { ACHIEVEMENTS } from "./rewards";

const DAILY_COINS = 100;
const DAILY_XP = 25;
const DAY_MS = 24 * 60 * 60 * 1000;
const STREAK_WINDOW_MS = 48 * 60 * 60 * 1000;

export async function claimDaily(
  userId: string,
  username: string,
): Promise<{
  claimed: boolean;
  coins: number;
  xp: number;
  level: number;
  levelUp: boolean;
  newAchievements: string[];
  nextClaimAt?: number;
}> {
  const player = await getPlayer(userId, username);
  const now = Date.now();

  if (player.dailyClaimedAt) {
    const lastClaim = new Date(player.dailyClaimedAt).getTime();
    const nextClaimAt = lastClaim + DAY_MS;

    if (now < nextClaimAt) {
      return {
        claimed: false,
        coins: 0,
        xp: 0,
        level: player.level,
        levelUp: false,
        newAchievements: [],
        nextClaimAt,
      };
    }
  }

  const oldLevel = player.level;
  const oldAchievements = new Set(player.achievements);

  const previousClaimAt = player.dailyClaimedAt
    ? new Date(player.dailyClaimedAt).getTime()
    : 0;

  if (
    previousClaimAt > 0 &&
    now - previousClaimAt <= STREAK_WINDOW_MS
  ) {
    player.dailyStreak = (player.dailyStreak ?? 0) + 1;
  } else {
    player.dailyStreak = 1;
  }

  if (
    player.dailyStreak >
    (player.bestDailyStreak ?? 0)
  ) {
    player.bestDailyStreak = player.dailyStreak;
  }

  player.dailyClaimedAt = new Date(now).toISOString();

  const streakBonusCoins =
    Math.min(player.dailyStreak, 7) * 10;

  const streakBonusXp =
    Math.min(player.dailyStreak, 7) * 5;

  let bonusCoins = streakBonusCoins;
  let bonusXp = streakBonusXp;

  if (player.dailyStreak % 7 === 0) {
    bonusCoins += 100;
    bonusXp += 25;
  }

  if (player.dailyStreak % 30 === 0) {
    bonusCoins += 500;
    bonusXp += 100;
  }

  const totalCoins = DAILY_COINS + bonusCoins;
  const totalXp = DAILY_XP + bonusXp;

  player.coins += totalCoins;
  player.xp += totalXp;

  while (player.xp >= player.level * 100) {
    player.xp -= player.level * 100;
    player.level++;
  }

  if (
    player.gamesPlayed >= 1 &&
    !player.achievements.includes("first_game")
  ) {
    player.achievements.push("first_game");
  }

  if (
    player.wins >= 1 &&
    !player.achievements.includes("first_win")
  ) {
    player.achievements.push("first_win");
  }

  if (
    player.bestStreak >= 5 &&
    !player.achievements.includes("five_streak")
  ) {
    player.achievements.push("five_streak");
  }

  if (
    player.coins >= 500 &&
    !player.achievements.includes("five_hundred_coins")
  ) {
    player.achievements.push("five_hundred_coins");
  }

  if (
    player.level >= 5 &&
    !player.achievements.includes("level_five")
  ) {
    player.achievements.push("level_five");
  }

  if (
    player.gamesPlayed >= 25 &&
    !player.achievements.includes("twenty_five_games")
  ) {
    player.achievements.push("twenty_five_games");
  }

  const newAchievements = player.achievements.filter(
    (id) => !oldAchievements.has(id),
  );

  await updatePlayer(player);

  return {
    claimed: true,
    coins: totalCoins,
    xp: totalXp,
    level: player.level,
    levelUp: player.level > oldLevel,
    newAchievements,
  };
}
