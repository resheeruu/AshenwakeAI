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
var rewards_exports = {};
__export(rewards_exports, {
  ACHIEVEMENTS: () => ACHIEVEMENTS,
  applyLevelUp: () => applyLevelUp,
  awardDailyReward: () => awardDailyReward,
  awardResult: () => awardResult,
  updateAchievements: () => updateAchievements
});
module.exports = __toCommonJS(rewards_exports);
var import_store = require("./store");
const XP_PER_LEVEL = 100;
const ACHIEVEMENTS = {
  first_game: "\u{1F3AE} First Game",
  first_win: "\u{1F3C6} First Victory",
  five_streak: "\u{1F525} Unstoppable \u2014 5 Win Streak",
  five_hundred_coins: "\u{1FA99} Big Saver \u2014 500 Coins",
  level_five: "\u2B50 Rising Star \u2014 Level 5",
  twenty_five_games: "\u{1F3AE} Veteran \u2014 25 Games",
  first_hunt: "\u{1F3AF} First Hunt",
  ten_hunts: "\u{1F3F9} Hunter \u2014 10 Hunts",
  five_hunt_streak: "\u{1F525} Hunt Master \u2014 5 Hunt Streak",
  legendary_hunt: "\u{1F451} Legendary Hunter"
};
function updateAchievements(player) {
  const achievements = [
    {
      id: "first_game",
      unlocked: player.gamesPlayed >= 1
    },
    {
      id: "first_win",
      unlocked: player.wins >= 1
    },
    {
      id: "five_streak",
      unlocked: player.bestStreak >= 5
    },
    {
      id: "five_hundred_coins",
      unlocked: player.coins >= 500
    },
    {
      id: "level_five",
      unlocked: player.level >= 5
    },
    {
      id: "twenty_five_games",
      unlocked: player.gamesPlayed >= 25
    },
    {
      id: "first_hunt",
      unlocked: (player.huntsCompleted ?? 0) >= 1
    },
    {
      id: "ten_hunts",
      unlocked: (player.huntsCompleted ?? 0) >= 10
    },
    {
      id: "five_hunt_streak",
      unlocked: (player.bestHuntStreak ?? 0) >= 5
    },
    {
      id: "legendary_hunt",
      unlocked: (player.legendaryHunts ?? 0) >= 1
    }
  ];
  for (const achievement of achievements) {
    if (achievement.unlocked && !player.achievements.includes(achievement.id)) {
      player.achievements.push(achievement.id);
    }
  }
}
function applyLevelUp(player) {
  const oldLevel = player.level;
  while (player.xp >= player.level * XP_PER_LEVEL) {
    player.xp -= player.level * XP_PER_LEVEL;
    player.level++;
  }
  return player.level > oldLevel;
}
async function awardResult(player, result) {
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
    (id) => !before.has(id)
  );
  await (0, import_store.updatePlayer)(player);
  return {
    coins,
    xp,
    levelUp,
    newAchievements
  };
}
async function awardDailyReward(player) {
  const coins = 100;
  const xp = 25;
  player.coins += coins;
  player.xp += xp;
  player.dailyClaimedAt = (/* @__PURE__ */ new Date()).toISOString();
  const levelUp = applyLevelUp(player);
  const before = new Set(player.achievements);
  updateAchievements(player);
  const newAchievements = player.achievements.filter(
    (id) => !before.has(id)
  );
  await (0, import_store.updatePlayer)(player);
  return {
    coins,
    xp,
    levelUp,
    newAchievements
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  ACHIEVEMENTS,
  applyLevelUp,
  awardDailyReward,
  awardResult,
  updateAchievements
});
