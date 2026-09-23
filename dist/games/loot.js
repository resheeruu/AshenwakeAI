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
var loot_exports = {};
__export(loot_exports, {
  LOOT_ITEMS: () => LOOT_ITEMS,
  addItem: () => addItem,
  addItemAndSave: () => addItemAndSave,
  getInventory: () => getInventory,
  getLootForRarity: () => getLootForRarity
});
module.exports = __toCommonJS(loot_exports);
var import_store = require("./store");
const LOOT_ITEMS = {
  wolf_fang: {
    name: "\u{1F43A} Wolf Fang",
    description: "A fang collected from a dangerous wolf.",
    rarity: "common"
  },
  fox_charm: {
    name: "\u{1F98A} Fox Charm",
    description: "A mysterious charm discovered in a fox den.",
    rarity: "uncommon"
  },
  crystal_shard: {
    name: "\u{1F48E} Crystal Shard",
    description: "A rare crystal fragment from a hidden cave.",
    rarity: "rare"
  },
  ancient_relic: {
    name: "\u{1F451} Ancient Relic",
    description: "A legendary relic recovered from ancient ruins.",
    rarity: "legendary"
  }
};
function addItem(player, itemId, amount = 1) {
  if (!player.inventory) {
    player.inventory = {};
  }
  player.inventory[itemId] = (player.inventory[itemId] ?? 0) + amount;
}
async function addItemAndSave(player, itemId, amount = 1) {
  addItem(player, itemId, amount);
  await (0, import_store.updatePlayer)(player);
}
function getInventory(player) {
  return player.inventory ?? {};
}
function getLootForRarity(rarity) {
  switch (rarity) {
    case "common":
      return "wolf_fang";
    case "uncommon":
      return "fox_charm";
    case "rare":
      return "crystal_shard";
    case "legendary":
      return "ancient_relic";
    default:
      return null;
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  LOOT_ITEMS,
  addItem,
  addItemAndSave,
  getInventory,
  getLootForRarity
});
