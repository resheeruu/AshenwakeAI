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
var economy_exports = {};
__export(economy_exports, {
  addCoins: () => addCoins,
  canAfford: () => canAfford,
  spendCoins: () => spendCoins,
  transferCoins: () => transferCoins
});
module.exports = __toCommonJS(economy_exports);
var import_store = require("./store");
function canAfford(player, amount) {
  return Number.isFinite(amount) && amount >= 0 && player.coins >= amount;
}
async function addCoins(player, amount, _reason = "reward") {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error("INVALID_COIN_AMOUNT");
  }
  player.coins += Math.floor(amount);
  await (0, import_store.updatePlayer)(player);
  return player.coins;
}
async function spendCoins(player, amount, _reason = "purchase") {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error("INVALID_COIN_AMOUNT");
  }
  if (!canAfford(player, amount)) {
    throw new Error("INSUFFICIENT_COINS");
  }
  player.coins -= Math.floor(amount);
  await (0, import_store.updatePlayer)(player);
  return player.coins;
}
async function transferCoins(from, to, amount) {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("INVALID_TRANSFER_AMOUNT");
  }
  const value = Math.floor(amount);
  if (!canAfford(from, value)) {
    throw new Error("INSUFFICIENT_COINS");
  }
  from.coins -= value;
  to.coins += value;
  await (0, import_store.updatePlayer)(from);
  await (0, import_store.updatePlayer)(to);
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  addCoins,
  canAfford,
  spendCoins,
  transferCoins
});
