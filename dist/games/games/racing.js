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
var racing_exports = {};
__export(racing_exports, {
  RACERS: () => RACERS,
  RACING_MAX_BET: () => RACING_MAX_BET,
  RACING_MIN_BET: () => RACING_MIN_BET,
  chooseWinner: () => chooseWinner,
  race: () => race
});
module.exports = __toCommonJS(racing_exports);
var import_store = require("../store");
var import_rewards = require("../rewards");
const MIN_BET = 10;
const MAX_BET = 1e3;
const RACERS = [
  {
    id: 1,
    name: "Ashfang",
    emoji: "\u{1F43A}",
    odds: 2
  },
  {
    id: 2,
    name: "Ember",
    emoji: "\u{1F525}",
    odds: 3
  },
  {
    id: 3,
    name: "Shadow",
    emoji: "\u{1F311}",
    odds: 4
  },
  {
    id: 4,
    name: "Storm",
    emoji: "\u26A1",
    odds: 5
  },
  {
    id: 5,
    name: "Phantom",
    emoji: "\u{1F47B}",
    odds: 7
  }
];
function chooseWinner() {
  const totalWeight = RACERS.reduce(
    (sum, racer) => sum + 1 / racer.odds,
    0
  );
  let roll = Math.random() * totalWeight;
  for (const racer of RACERS) {
    roll -= 1 / racer.odds;
    if (roll <= 0) {
      return racer;
    }
  }
  return RACERS[RACERS.length - 1];
}
async function race(player, racerId, bet) {
  if (!Number.isInteger(bet) || bet < MIN_BET || bet > MAX_BET) {
    throw new Error("INVALID_RACING_BET");
  }
  if (player.coins < bet) {
    throw new Error("NOT_ENOUGH_COINS");
  }
  const selected = RACERS.find(
    (racer) => racer.id === racerId
  );
  if (!selected) {
    throw new Error("INVALID_RACER");
  }
  player.coins -= bet;
  const winner = chooseWinner();
  const won = winner.id === selected.id;
  const payout = won ? bet * selected.odds : 0;
  const xp = won ? 30 : 5;
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
    winner,
    selected,
    bet,
    payout,
    won,
    xp,
    levelUp
  };
}
const RACING_MIN_BET = MIN_BET;
const RACING_MAX_BET = MAX_BET;
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  RACERS,
  RACING_MAX_BET,
  RACING_MIN_BET,
  chooseWinner,
  race
});
