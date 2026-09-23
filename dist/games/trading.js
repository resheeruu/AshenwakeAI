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
var trading_exports = {};
__export(trading_exports, {
  cancelTrade: () => cancelTrade,
  cleanupExpiredTrades: () => cleanupExpiredTrades,
  confirmTrade: () => confirmTrade,
  createTrade: () => createTrade,
  executeTrade: () => executeTrade,
  getPendingTradeForPlayer: () => getPendingTradeForPlayer
});
module.exports = __toCommonJS(trading_exports);
var import_config = require("./config");
const activeTrades = /* @__PURE__ */ new Map();
function generateTradeId() {
  return `trade_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
function createTrade(fromPlayer, toPlayer, fromItems, toItems) {
  if (fromPlayer.userId === toPlayer.userId) {
    throw new Error("CANNOT_TRADE_WITH_SELF");
  }
  const fromPending = [...activeTrades.values()].filter(
    (t) => t.fromUserId === fromPlayer.userId || t.toUserId === fromPlayer.userId
  );
  if (fromPending.length >= import_config.GAME_CONFIG.trading.maxPendingTrades) {
    throw new Error("MAX_TRADES_REACHED");
  }
  validateTradeItems(fromPlayer, fromItems);
  validateTradeItems(toPlayer, toItems);
  const trade = {
    id: generateTradeId(),
    fromUserId: fromPlayer.userId,
    toUserId: toPlayer.userId,
    fromItems,
    toItems,
    fromConfirmed: false,
    toConfirmed: false,
    createdAt: Date.now(),
    expiresAt: Date.now() + import_config.GAME_CONFIG.trading.tradeExpirationMs
  };
  activeTrades.set(trade.id, trade);
  return trade;
}
function validateTradeItems(player, items) {
  for (const item of items) {
    if (item.type === "coins") {
      if (item.value > player.coins) {
        throw new Error("INSUFFICIENT_COINS");
      }
    } else if (item.type === "equipment") {
      const equipment = player.equipment?.find(
        (e) => e.id === item.equipmentId && !e.equipped
      );
      if (!equipment) {
        throw new Error("EQUIPMENT_NOT_FOUND");
      }
    } else if (item.type === "material") {
      const qty = player.inventory?.[item.itemId ?? ""] ?? 0;
      if (qty < item.quantity) {
        throw new Error("INSUFFICIENT_ITEMS");
      }
    }
  }
}
function confirmTrade(tradeId, playerId) {
  const trade = activeTrades.get(tradeId);
  if (!trade) {
    return { success: false, message: "Trade not found." };
  }
  if (Date.now() > trade.expiresAt) {
    activeTrades.delete(tradeId);
    return { success: false, message: "Trade has expired." };
  }
  if (playerId === trade.fromUserId) {
    trade.fromConfirmed = true;
  } else if (playerId === trade.toUserId) {
    trade.toConfirmed = true;
  } else {
    return { success: false, message: "You are not part of this trade." };
  }
  if (trade.fromConfirmed && trade.toConfirmed) {
    return { success: true, completed: true, message: "Trade confirmed by both parties." };
  }
  return { success: true, message: "Trade confirmed. Waiting for the other player." };
}
function executeTrade(tradeId, fromPlayer, toPlayer) {
  const trade = activeTrades.get(tradeId);
  if (!trade) {
    return { success: false, message: "Trade not found." };
  }
  if (!trade.fromConfirmed || !trade.toConfirmed) {
    return { success: false, message: "Both players must confirm the trade." };
  }
  if (Date.now() > trade.expiresAt) {
    activeTrades.delete(tradeId);
    return { success: false, message: "Trade has expired." };
  }
  try {
    for (const item of trade.fromItems) {
      if (item.type === "coins") {
        if (fromPlayer.coins < item.value) {
          throw new Error("INSUFFICIENT_COINS");
        }
        fromPlayer.coins -= item.value;
        toPlayer.coins += item.value;
      } else if (item.type === "equipment") {
        const equipment = fromPlayer.equipment?.find(
          (e) => e.id === item.equipmentId && !e.equipped
        );
        if (!equipment) throw new Error("EQUIPMENT_NOT_FOUND");
        fromPlayer.equipment = fromPlayer.equipment.filter((e) => e.id !== item.equipmentId);
        toPlayer.equipment = toPlayer.equipment ?? [];
        toPlayer.equipment.push(equipment);
      } else if (item.type === "material") {
        const qty = fromPlayer.inventory?.[item.itemId ?? ""] ?? 0;
        if (qty < item.quantity) throw new Error("INSUFFICIENT_ITEMS");
        fromPlayer.inventory[item.itemId] = qty - item.quantity;
        if (fromPlayer.inventory[item.itemId] <= 0) {
          delete fromPlayer.inventory[item.itemId];
        }
        toPlayer.inventory[item.itemId] = (toPlayer.inventory?.[item.itemId ?? ""] ?? 0) + item.quantity;
      }
    }
    for (const item of trade.toItems) {
      if (item.type === "coins") {
        if (toPlayer.coins < item.value) {
          throw new Error("INSUFFICIENT_COINS");
        }
        toPlayer.coins -= item.value;
        fromPlayer.coins += item.value;
      } else if (item.type === "equipment") {
        const equipment = toPlayer.equipment?.find(
          (e) => e.id === item.equipmentId && !e.equipped
        );
        if (!equipment) throw new Error("EQUIPMENT_NOT_FOUND");
        toPlayer.equipment = toPlayer.equipment.filter((e) => e.id !== item.equipmentId);
        fromPlayer.equipment = fromPlayer.equipment ?? [];
        fromPlayer.equipment.push(equipment);
      } else if (item.type === "material") {
        const qty = toPlayer.inventory?.[item.itemId ?? ""] ?? 0;
        if (qty < item.quantity) throw new Error("INSUFFICIENT_ITEMS");
        toPlayer.inventory[item.itemId] = qty - item.quantity;
        if (toPlayer.inventory[item.itemId] <= 0) {
          delete toPlayer.inventory[item.itemId];
        }
        fromPlayer.inventory[item.itemId] = (fromPlayer.inventory?.[item.itemId ?? ""] ?? 0) + item.quantity;
      }
    }
    fromPlayer.statistics = fromPlayer.statistics ?? {
      totalDamageDealt: 0,
      totalDamageTaken: 0,
      totalHealing: 0,
      bossesKilled: 0,
      worldBossesKilled: 0,
      dungeonsCompleted: 0,
      dungeonsFailed: 0,
      questsCompleted: 0,
      itemsSold: 0,
      itemsBought: 0,
      coinsEarned: 0,
      coinsSpent: 0,
      tradesCompleted: 0,
      gamblesPlayed: 0,
      gamblesWon: 0,
      highestDamage: 0,
      longestStreak: 0,
      totalPlayTimeMs: 0
    };
    toPlayer.statistics = toPlayer.statistics ?? {
      totalDamageDealt: 0,
      totalDamageTaken: 0,
      totalHealing: 0,
      bossesKilled: 0,
      worldBossesKilled: 0,
      dungeonsCompleted: 0,
      dungeonsFailed: 0,
      questsCompleted: 0,
      itemsSold: 0,
      itemsBought: 0,
      coinsEarned: 0,
      coinsSpent: 0,
      tradesCompleted: 0,
      gamblesPlayed: 0,
      gamblesWon: 0,
      highestDamage: 0,
      longestStreak: 0,
      totalPlayTimeMs: 0
    };
    fromPlayer.statistics.tradesCompleted++;
    toPlayer.statistics.tradesCompleted++;
    activeTrades.delete(tradeId);
    return { success: true, message: "Trade completed successfully!" };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Trade failed."
    };
  }
}
function cancelTrade(tradeId, playerId) {
  const trade = activeTrades.get(tradeId);
  if (!trade) {
    return { success: false, message: "Trade not found." };
  }
  if (trade.fromUserId !== playerId && trade.toUserId !== playerId) {
    return { success: false, message: "You are not part of this trade." };
  }
  activeTrades.delete(tradeId);
  return { success: true, message: "Trade cancelled." };
}
function getPendingTradeForPlayer(playerId) {
  for (const trade of activeTrades.values()) {
    if (trade.fromUserId === playerId || trade.toUserId === playerId) {
      if (Date.now() <= trade.expiresAt) {
        return trade;
      }
    }
  }
  return void 0;
}
function cleanupExpiredTrades() {
  const now = Date.now();
  let cleaned = 0;
  for (const [id, trade] of activeTrades) {
    if (now > trade.expiresAt) {
      activeTrades.delete(id);
      cleaned++;
    }
  }
  return cleaned;
}
setInterval(cleanupExpiredTrades, 6e4).unref();
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  cancelTrade,
  cleanupExpiredTrades,
  confirmTrade,
  createTrade,
  executeTrade,
  getPendingTradeForPlayer
});
