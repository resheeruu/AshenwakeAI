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
var mines_exports = {};
__export(mines_exports, {
  MINES_COUNT: () => MINES_COUNT,
  MINES_GRID_SIZE: () => MINES_GRID_SIZE,
  MINES_MAX_BET: () => MINES_MAX_BET,
  MINES_MIN_BET: () => MINES_MIN_BET,
  cancelMines: () => cancelMines,
  cashOutMines: () => cashOutMines,
  getMinesGame: () => getMinesGame,
  revealMinesTile: () => revealMinesTile,
  startMines: () => startMines
});
module.exports = __toCommonJS(mines_exports);
var import_store = require("../store");
var import_rewards = require("../rewards");
const GRID_SIZE = 16;
const MINE_COUNT = 3;
const MIN_BET = 10;
const MAX_BET = 1e3;
const sessions = /* @__PURE__ */ new Map();
const CLEANUP_INTERVAL_MS = 5 * 60 * 1e3;
const cleanupTimer = setInterval(() => {
  for (const [id, game] of sessions) {
    if (game.finished) {
      sessions.delete(id);
    }
  }
}, CLEANUP_INTERVAL_MS);
cleanupTimer.unref();
function createMines() {
  const mines = /* @__PURE__ */ new Set();
  while (mines.size < MINE_COUNT) {
    mines.add(
      Math.floor(Math.random() * GRID_SIZE)
    );
  }
  return mines;
}
function getMinesGame(playerId) {
  return sessions.get(playerId);
}
async function startMines(player, bet) {
  if (sessions.has(player.userId)) {
    throw new Error("MINES_ALREADY_ACTIVE");
  }
  if (!Number.isInteger(bet) || bet < MIN_BET || bet > MAX_BET) {
    throw new Error("INVALID_MINES_BET");
  }
  if (player.coins < bet) {
    throw new Error("NOT_ENOUGH_COINS");
  }
  player.coins -= bet;
  const game = {
    playerId: player.userId,
    bet,
    mines: createMines(),
    revealed: /* @__PURE__ */ new Set(),
    multiplier: 1,
    finished: false
  };
  sessions.set(player.userId, game);
  await (0, import_store.updatePlayer)(player);
  return game;
}
async function revealMinesTile(player, game, tile) {
  if (game.finished) {
    throw new Error("MINES_FINISHED");
  }
  if (!Number.isInteger(tile) || tile < 0 || tile >= GRID_SIZE) {
    throw new Error("INVALID_MINES_TILE");
  }
  if (game.revealed.has(tile)) {
    throw new Error("MINES_TILE_ALREADY_REVEALED");
  }
  game.revealed.add(tile);
  if (game.mines.has(tile)) {
    game.finished = true;
    game.multiplier = 0;
    player.gamesPlayed++;
    player.losses++;
    player.streak = 0;
    player.xp += 5;
    (0, import_rewards.applyLevelUp)(player);
    (0, import_rewards.updateAchievements)(player);
    await (0, import_store.updatePlayer)(player);
    sessions.delete(player.userId);
    return {
      tile,
      mine: true,
      multiplier: 0,
      payout: 0,
      finished: true,
      levelUp: false
    };
  }
  game.multiplier = 1 + game.revealed.size * 0.25;
  return {
    tile,
    mine: false,
    multiplier: game.multiplier,
    payout: Math.floor(
      game.bet * game.multiplier
    ),
    finished: false,
    levelUp: false
  };
}
async function cashOutMines(player, game) {
  if (game.finished) {
    throw new Error("MINES_FINISHED");
  }
  if (game.revealed.size === 0) {
    throw new Error("MINES_NO_REVEALS");
  }
  const payout = Math.floor(
    game.bet * game.multiplier
  );
  const xp = Math.max(
    10,
    Math.floor(game.multiplier * 20)
  );
  game.finished = true;
  player.coins += payout;
  player.xp += xp;
  player.gamesPlayed++;
  player.wins++;
  player.streak++;
  player.bestStreak = Math.max(
    player.bestStreak,
    player.streak
  );
  const levelUp = (0, import_rewards.applyLevelUp)(player);
  (0, import_rewards.updateAchievements)(player);
  await (0, import_store.updatePlayer)(player);
  sessions.delete(player.userId);
  return {
    payout,
    xp,
    levelUp
  };
}
function cancelMines(playerId) {
  sessions.delete(playerId);
}
const MINES_GRID_SIZE = GRID_SIZE;
const MINES_COUNT = MINE_COUNT;
const MINES_MIN_BET = MIN_BET;
const MINES_MAX_BET = MAX_BET;
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  MINES_COUNT,
  MINES_GRID_SIZE,
  MINES_MAX_BET,
  MINES_MIN_BET,
  cancelMines,
  cashOutMines,
  getMinesGame,
  revealMinesTile,
  startMines
});
