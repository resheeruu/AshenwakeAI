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
var roulette_exports = {};
__export(roulette_exports, {
  ROULETTE_MAX_BET: () => ROULETTE_MAX_BET,
  ROULETTE_MIN_BET: () => ROULETTE_MIN_BET,
  getRouletteColor: () => getRouletteColor,
  playRoulette: () => playRoulette,
  spinRoulette: () => spinRoulette
});
module.exports = __toCommonJS(roulette_exports);
var import_store = require("../store");
var import_rewards = require("../rewards");
const RED_NUMBERS = /* @__PURE__ */ new Set([
  1,
  3,
  5,
  7,
  9,
  12,
  14,
  16,
  18,
  19,
  21,
  23,
  25,
  27,
  30,
  32,
  34,
  36
]);
const MIN_BET = 10;
const MAX_BET = 1e3;
function getRouletteColor(number) {
  if (number === 0) {
    return "green";
  }
  return RED_NUMBERS.has(number) ? "red" : "black";
}
function spinRoulette() {
  return Math.floor(Math.random() * 37);
}
async function playRoulette(player, betType, bet, selectedNumber) {
  if (!Number.isInteger(bet) || bet < MIN_BET || bet > MAX_BET) {
    throw new Error("INVALID_ROULETTE_BET");
  }
  if (player.coins < bet) {
    throw new Error("NOT_ENOUGH_COINS");
  }
  if (betType === "number" && (selectedNumber === void 0 || !Number.isInteger(selectedNumber) || selectedNumber < 0 || selectedNumber > 36)) {
    throw new Error("INVALID_ROULETTE_NUMBER");
  }
  player.coins -= bet;
  const number = spinRoulette();
  const color = getRouletteColor(number);
  let won = false;
  let payout = 0;
  if (betType === "red" || betType === "black") {
    won = color === betType;
    if (won) {
      payout = bet * 2;
    }
  } else {
    won = number === selectedNumber;
    if (won) {
      payout = bet * 35;
    }
  }
  const xp = won ? betType === "number" ? 50 : 25 : 5;
  player.coins += payout;
  player.xp += xp;
  player.gamesPlayed++;
  if (won) {
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
  const levelUp = (0, import_rewards.applyLevelUp)(player);
  (0, import_rewards.updateAchievements)(player);
  await (0, import_store.updatePlayer)(player);
  return {
    number,
    color,
    betType,
    bet,
    payout,
    won,
    xp,
    levelUp
  };
}
const ROULETTE_MIN_BET = MIN_BET;
const ROULETTE_MAX_BET = MAX_BET;
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  ROULETTE_MAX_BET,
  ROULETTE_MIN_BET,
  getRouletteColor,
  playRoulette,
  spinRoulette
});
