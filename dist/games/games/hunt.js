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
var hunt_exports = {};
__export(hunt_exports, {
  HUNT_COOLDOWN_MS: () => HUNT_COOLDOWN_MS,
  getHuntCooldown: () => getHuntCooldown,
  hunt: () => hunt
});
module.exports = __toCommonJS(hunt_exports);
var import_store = require("../store");
var import_loot = require("../loot");
var import_rewards = require("../rewards");
const HUNT_COOLDOWN_MS = 3e4;
const HUNT_EVENTS = [
  {
    title: "\u{1F43A} Wolf Encounter",
    description: "You tracked a wild wolf and found a valuable reward.",
    coins: 20,
    xp: 15,
    rarity: "common"
  },
  {
    title: "\u{1F98A} Fox Den",
    description: "You discovered a hidden fox den containing old coins.",
    coins: 35,
    xp: 25,
    rarity: "uncommon"
  },
  {
    title: "\u{1F48E} Crystal Cave",
    description: "You discovered a rare crystal deep inside a cave.",
    coins: 75,
    xp: 50,
    rarity: "rare"
  },
  {
    title: "\u{1F451} Ancient Treasure",
    description: "You uncovered an ancient treasure hidden beneath the ruins!",
    coins: 200,
    xp: 100,
    rarity: "legendary"
  },
  {
    title: "\u{1F480} Dangerous Trap",
    description: "You triggered a trap during the hunt and escaped with almost nothing.",
    coins: 5,
    xp: 5,
    rarity: "danger"
  }
];
function randomEvent(lucky = false) {
  const roll = Math.random();
  if (!lucky) {
    if (roll < 0.55) return HUNT_EVENTS[0];
    if (roll < 0.8) return HUNT_EVENTS[1];
    if (roll < 0.95) return HUNT_EVENTS[2];
    if (roll < 0.99) return HUNT_EVENTS[3];
    return HUNT_EVENTS[4];
  }
  if (roll < 0.35) return HUNT_EVENTS[0];
  if (roll < 0.65) return HUNT_EVENTS[1];
  if (roll < 0.9) return HUNT_EVENTS[2];
  if (roll < 0.99) return HUNT_EVENTS[3];
  return HUNT_EVENTS[4];
}
function getHuntCooldown(player, now = Date.now()) {
  const lastAt = player.huntLastAt ?? 0;
  const remainingMs = Math.max(
    0,
    lastAt + HUNT_COOLDOWN_MS - now
  );
  return {
    available: remainingMs <= 0,
    remainingMs
  };
}
async function hunt(player) {
  const cooldown = getHuntCooldown(player);
  if (!cooldown.available) {
    throw new Error(
      `HUNT_COOLDOWN:${cooldown.remainingMs}`
    );
  }
  if (!player.inventory) {
    player.inventory = {};
  }
  const xpBoostUsed = player.xpBoostActive === true;
  const luckyTokenUsed = player.luckyTokenActive === true;
  const event = randomEvent(luckyTokenUsed);
  const earnedXp = xpBoostUsed ? event.xp * 2 : event.xp;
  player.xpBoostActive = false;
  player.luckyTokenActive = false;
  player.huntLastAt = Date.now();
  player.huntsCompleted = (player.huntsCompleted ?? 0) + 1;
  player.huntStreak = (player.huntStreak ?? 0) + 1;
  if (player.huntStreak > (player.bestHuntStreak ?? 0)) {
    player.bestHuntStreak = player.huntStreak;
  }
  player.gamesPlayed++;
  const vipBadgeActive = (player.inventory.vip_badge ?? 0) > 0;
  const earnedCoins = vipBadgeActive ? Math.floor(event.coins * 1.25) : event.coins;
  player.coins += earnedCoins;
  player.xp += earnedXp;
  const levelUp = (0, import_rewards.applyLevelUp)(player);
  if (event.rarity === "legendary") {
    player.legendaryHunts = (player.legendaryHunts ?? 0) + 1;
  }
  const beforeAchievements = new Set(player.achievements);
  (0, import_rewards.updateAchievements)(player);
  const newAchievements = player.achievements.filter(
    (id) => !beforeAchievements.has(id)
  );
  const lootItem = (0, import_loot.getLootForRarity)(event.rarity);
  if (lootItem) {
    (0, import_loot.addItem)(player, lootItem);
  }
  await (0, import_store.updatePlayer)(player);
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
    newAchievements
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  HUNT_COOLDOWN_MS,
  getHuntCooldown,
  hunt
});
