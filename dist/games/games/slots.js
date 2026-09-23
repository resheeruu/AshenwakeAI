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
var slots_exports = {};
__export(slots_exports, {
  playSlots: () => playSlots
});
module.exports = __toCommonJS(slots_exports);
var import_store = require("../store");
var import_rewards = require("../rewards");
const COST = 10;
const SYMBOLS = [
  "\u{1F352}",
  "\u{1F34B}",
  "\u{1F514}",
  "\u{1F48E}",
  "\u{1F525}",
  "\u2B50"
];
function randomSymbol() {
  return SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
}
async function playSlots(player) {
  if (player.coins < COST) {
    throw new Error("NOT_ENOUGH_COINS");
  }
  player.coins -= COST;
  const symbols = [
    randomSymbol(),
    randomSymbol(),
    randomSymbol()
  ];
  let coinsWon = 0;
  let xp = 10;
  let message = "Nothing matched.";
  const [a, b, c] = symbols;
  if (a === b && b === c) {
    if (a === "\u{1F48E}") {
      coinsWon = 500;
      xp = 100;
      message = "\u{1F48E}\u{1F48E}\u{1F48E} JACKPOT! Massive diamond jackpot!";
    } else if (a === "\u{1F525}") {
      coinsWon = 300;
      xp = 75;
      message = "\u{1F525}\u{1F525}\u{1F525} ASHEN JACKPOT! The realm is burning!";
    } else if (a === "\u2B50") {
      coinsWon = 200;
      xp = 60;
      message = "\u2B50\u2B50\u2B50 STAR JACKPOT!";
    } else {
      coinsWon = 100;
      xp = 40;
      message = `${a}${a}${a} Triple match!`;
    }
  } else if (a === b || b === c || a === c) {
    coinsWon = 25;
    xp = 20;
    message = "\u2728 Two symbols matched!";
  } else {
    coinsWon = 0;
    xp = 5;
    message = "\u{1F4A8} No match. Better luck next spin!";
  }
  player.coins += coinsWon;
  player.xp += xp;
  const levelUp = (0, import_rewards.applyLevelUp)(player);
  (0, import_rewards.updateAchievements)(player);
  await (0, import_store.updatePlayer)(player);
  return {
    symbols,
    coinsSpent: COST,
    coinsWon,
    xp,
    levelUp,
    message
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  playSlots
});
