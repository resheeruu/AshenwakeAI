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
var shop_exports = {};
__export(shop_exports, {
  SHOP_ITEMS: () => SHOP_ITEMS,
  buyItem: () => buyItem
});
module.exports = __toCommonJS(shop_exports);
var import_store = require("./store");
const SHOP_ITEMS = {
  xp_boost: {
    name: "\u{1F9EA} XP Boost",
    description: "Doubles XP from your next hunt.",
    price: 250
  },
  lucky_token: {
    name: "\u{1F340} Lucky Token",
    description: "Improves your next hunt's chance of finding rare loot.",
    price: 500
  },
  vip_badge: {
    name: "\u{1F451} VIP Badge",
    description: "A permanent prestigious AshenAI game badge.",
    price: 1e3
  }
};
async function buyItem(player, itemId) {
  const item = SHOP_ITEMS[itemId];
  if (!item) {
    return {
      success: false,
      message: "\u274C That shop item does not exist."
    };
  }
  if (!player.inventory) {
    player.inventory = {};
  }
  if (itemId === "vip_badge" && (player.inventory.vip_badge ?? 0) > 0) {
    return {
      success: false,
      message: "\u{1F451} You already own the VIP Badge."
    };
  }
  if (player.coins < item.price) {
    return {
      success: false,
      message: `\u274C You need **${item.price} coins**, but you only have **${player.coins}**.`
    };
  }
  player.coins -= item.price;
  player.inventory[itemId] = (player.inventory[itemId] ?? 0) + 1;
  await (0, import_store.updatePlayer)(player);
  return {
    success: true,
    message: `\u2705 You purchased **${item.name}** for **${item.price} coins**!`
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  SHOP_ITEMS,
  buyItem
});
