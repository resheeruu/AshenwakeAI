import { GamePlayer } from "./types";
import { updatePlayer } from "./store";

const XP_PER_LEVEL = 100;

export const ACHIEVEMENTS: Record<string, string> = {
  first_game: "🎮 First Game",
  first_win: "🏆 First Victory",
  five_streak: "🔥 Unstoppable — 5 Win Streak",
  five_hundred_coins: "🪙 Big Saver — 500 Coins",
  level_five: "⭐ Rising Star — Level 5",
  twenty_five_games: "🎮 Veteran — 25 Games",
  first_hunt: "🎯 First Hunt",
  ten_hunts: "🏹 Hunter — 10 Hunts",
  five_hunt_streak: "🔥 Hunt Master — 5 Hunt Streak",
  legendary_hunt: "👑 Legendary Hunter",
};

export function updateAchievements(player: GamePlayer): void {
  const achievements = [
    {
      id: "first_game",
      unlocked: player.gamesPlayed >= 1,
    },
    {
      id: "first_win",
      unlocked: player.wins >= 1,
    },
    {
      id: "five_streak",
      unlocked: player.bestStreak >= 5,
    },
    {
      id: "five_hundred_coins",
      unlocked: player.coins >= 500,
    },
    {
      id: "level_five",
      unlocked: player.level >= 5,
    },
    {
      id: "twenty_five_games",
      unlocked: player.gamesPlayed >= 25,
    },
    {
      id: "first_hunt",
      unlocked: (player.huntsCompleted ?? 0) >= 1,
    },
    {
      id: "ten_hunts",
      unlocked: (player.huntsCompleted ?? 0) >= 10,
    },
    {
      id: "five_hunt_streak",
      unlocked: (player.bestHuntStreak ?? 0) >= 5,
    },
    {
      id: "legendary_hunt",
      unlocked: (player.legendaryHunts ?? 0) >= 1,
    },
  ];

  for (const achievement of achievements) {
    if (
      achievement.unlocked &&
      !player.achievements.includes(achievement.id)
    ) {
      player.achievements.push(achievement.id);
    }
  }
}

export function applyLevelUp(player: GamePlayer): boolean {
  const oldLevel = player.level;

  while (player.xp >= player.level * XP_PER_LEVEL) {
    player.xp -= player.level * XP_PER_LEVEL;
    player.level++;
  }

  return player.level > oldLevel;
}

export async function awardResult(
  player: GamePlayer,
  result: "win" | "loss" | "draw",
): Promise<{
  coins: number;
  xp: number;
  levelUp: boolean;
  newAchievements: string[];
}> {
  let coins = 0;
  let xp = 0;

  player.gamesPlayed++;

  if (result === "win") {
    coins = 25;
    xp = 40;
    player.wins++;
    player.streak++;

    if (player.streak > player.bestStreak) {
      player.bestStreak = player.streak;
    }
  } else if (result === "loss") {
    coins = 5;
    xp = 10;
    player.losses++;
    player.streak = 0;
  } else {
    coins = 10;
    xp = 20;
    player.draws++;
  }

  player.coins += coins;
  player.xp += xp;

  const levelUp = applyLevelUp(player);

  const before = new Set(player.achievements);

  updateAchievements(player);

  const newAchievements = player.achievements.filter(
    (id) => !before.has(id),
  );

  await updatePlayer(player);

  return {
    coins,
    xp,
    levelUp,
    newAchievements,
  };
}

export async function awardDailyReward(
  player: GamePlayer,
): Promise<{
  coins: number;
  xp: number;
  levelUp: boolean;
  newAchievements: string[];
}> {
  const coins = 100;
  const xp = 25;

  player.coins += coins;
  player.xp += xp;
  player.dailyClaimedAt = new Date().toISOString();

  const levelUp = applyLevelUp(player);

  const before = new Set(player.achievements);

  updateAchievements(player);

  const newAchievements = player.achievements.filter(
    (id) => !before.has(id),
  );

  await updatePlayer(player);

  return {
    coins,
    xp,
    levelUp,
    newAchievements,
  };
}
