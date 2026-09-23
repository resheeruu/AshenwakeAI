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
var quickdraw_exports = {};
__export(quickdraw_exports, {
  QUICKDRAW_MAX_REACTION: () => QUICKDRAW_MAX_REACTION,
  QUICKDRAW_MIN_REACTION: () => QUICKDRAW_MIN_REACTION,
  cancelQuickDraw: () => cancelQuickDraw,
  getQuickDraw: () => getQuickDraw,
  reactQuickDraw: () => reactQuickDraw,
  startQuickDraw: () => startQuickDraw
});
module.exports = __toCommonJS(quickdraw_exports);
var import_store = require("../store");
var import_rewards = require("../rewards");
const MIN_REACTION_MS = 100;
const MAX_REACTION_MS = 3e3;
const sessions = /* @__PURE__ */ new Map();
const CLEANUP_INTERVAL_MS = 5 * 60 * 1e3;
const SESSION_MAX_AGE_MS = 10 * 60 * 1e3;
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [id, game] of sessions) {
    if (game.finished || now - game.startedAt > SESSION_MAX_AGE_MS) {
      sessions.delete(id);
    }
  }
}, CLEANUP_INTERVAL_MS);
cleanupTimer.unref();
function getQuickDraw(playerId) {
  return sessions.get(playerId);
}
function startQuickDraw(playerId) {
  if (sessions.has(playerId)) {
    throw new Error("QUICKDRAW_ALREADY_ACTIVE");
  }
  const startedAt = Date.now();
  const drawDelay = 1500 + Math.floor(Math.random() * 3500);
  const game = {
    playerId,
    startedAt,
    drawAt: startedAt + drawDelay,
    finished: false
  };
  sessions.set(playerId, game);
  return game;
}
async function reactQuickDraw(player, game) {
  if (game.finished) {
    throw new Error("QUICKDRAW_FINISHED");
  }
  const now = Date.now();
  if (now < game.drawAt) {
    game.finished = true;
    sessions.delete(player.userId);
    player.gamesPlayed++;
    player.losses++;
    player.streak = 0;
    player.coins = Math.max(
      0,
      player.coins - 10
    );
    player.xp += 5;
    const levelUp2 = (0, import_rewards.applyLevelUp)(player);
    (0, import_rewards.updateAchievements)(player);
    await (0, import_store.updatePlayer)(player);
    return {
      won: false,
      reactionTime: 0,
      coins: -10,
      xp: 5,
      levelUp: levelUp2
    };
  }
  const reactionTime = now - game.drawAt;
  const won = reactionTime >= MIN_REACTION_MS && reactionTime <= MAX_REACTION_MS;
  let coins = 0;
  let xp = 5;
  if (won) {
    const speedBonus = Math.max(
      0,
      100 - Math.floor(reactionTime / 10)
    );
    coins = 25 + speedBonus;
    xp = 25;
    player.wins++;
    player.streak++;
    player.bestStreak = Math.max(
      player.bestStreak,
      player.streak
    );
  } else {
    player.losses++;
    player.streak = 0;
  }
  player.gamesPlayed++;
  player.coins += coins;
  player.xp += xp;
  game.finished = true;
  sessions.delete(player.userId);
  const levelUp = (0, import_rewards.applyLevelUp)(player);
  (0, import_rewards.updateAchievements)(player);
  await (0, import_store.updatePlayer)(player);
  return {
    won,
    reactionTime,
    coins,
    xp,
    levelUp
  };
}
function cancelQuickDraw(playerId) {
  sessions.delete(playerId);
}
const QUICKDRAW_MIN_REACTION = MIN_REACTION_MS;
const QUICKDRAW_MAX_REACTION = MAX_REACTION_MS;
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  QUICKDRAW_MAX_REACTION,
  QUICKDRAW_MIN_REACTION,
  cancelQuickDraw,
  getQuickDraw,
  reactQuickDraw,
  startQuickDraw
});
