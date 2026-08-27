import { GamePlayer, Equipment } from "./types";
import { withLock } from "./lock";
import { GAME_CONFIG } from "./config";

export type TradeItem = {
  type: "coins" | "equipment" | "material";
  itemId?: string;
  equipmentId?: string;
  quantity: number;
  value: number;
};

export type PendingTrade = {
  id: string;
  fromUserId: string;
  toUserId: string;
  fromItems: TradeItem[];
  toItems: TradeItem[];
  fromConfirmed: boolean;
  toConfirmed: boolean;
  createdAt: number;
  expiresAt: number;
};

const activeTrades = new Map<string, PendingTrade>();

function generateTradeId(): string {
  return `trade_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createTrade(
  fromPlayer: GamePlayer,
  toPlayer: GamePlayer,
  fromItems: TradeItem[],
  toItems: TradeItem[],
): PendingTrade {
  if (fromPlayer.userId === toPlayer.userId) {
    throw new Error("CANNOT_TRADE_WITH_SELF");
  }

  const fromPending = [...activeTrades.values()].filter(
    (t) => t.fromUserId === fromPlayer.userId || t.toUserId === fromPlayer.userId,
  );

  if (fromPending.length >= GAME_CONFIG.trading.maxPendingTrades) {
    throw new Error("MAX_TRADES_REACHED");
  }

  validateTradeItems(fromPlayer, fromItems);
  validateTradeItems(toPlayer, toItems);

  const trade: PendingTrade = {
    id: generateTradeId(),
    fromUserId: fromPlayer.userId,
    toUserId: toPlayer.userId,
    fromItems,
    toItems,
    fromConfirmed: false,
    toConfirmed: false,
    createdAt: Date.now(),
    expiresAt: Date.now() + GAME_CONFIG.trading.tradeExpirationMs,
  };

  activeTrades.set(trade.id, trade);

  return trade;
}

function validateTradeItems(player: GamePlayer, items: TradeItem[]): void {
  for (const item of items) {
    if (item.type === "coins") {
      if (item.value > player.coins) {
        throw new Error("INSUFFICIENT_COINS");
      }
    } else if (item.type === "equipment") {
      const equipment = player.equipment?.find(
        (e) => e.id === item.equipmentId && !e.equipped,
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

export function confirmTrade(
  tradeId: string,
  playerId: string,
): { success: boolean; completed?: boolean; message: string } {
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

export function executeTrade(
  tradeId: string,
  fromPlayer: GamePlayer,
  toPlayer: GamePlayer,
): { success: boolean; message: string } {
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
          (e) => e.id === item.equipmentId && !e.equipped,
        );
        if (!equipment) throw new Error("EQUIPMENT_NOT_FOUND");
        fromPlayer.equipment = fromPlayer.equipment.filter((e) => e.id !== item.equipmentId);
        toPlayer.equipment = toPlayer.equipment ?? [];
        toPlayer.equipment.push(equipment);
      } else if (item.type === "material") {
        const qty = fromPlayer.inventory?.[item.itemId ?? ""] ?? 0;
        if (qty < item.quantity) throw new Error("INSUFFICIENT_ITEMS");
        fromPlayer.inventory[item.itemId!] = qty - item.quantity;
        if (fromPlayer.inventory[item.itemId!] <= 0) {
          delete fromPlayer.inventory[item.itemId!];
        }
        toPlayer.inventory[item.itemId!] = (toPlayer.inventory?.[item.itemId ?? ""] ?? 0) + item.quantity;
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
          (e) => e.id === item.equipmentId && !e.equipped,
        );
        if (!equipment) throw new Error("EQUIPMENT_NOT_FOUND");
        toPlayer.equipment = toPlayer.equipment.filter((e) => e.id !== item.equipmentId);
        fromPlayer.equipment = fromPlayer.equipment ?? [];
        fromPlayer.equipment.push(equipment);
      } else if (item.type === "material") {
        const qty = toPlayer.inventory?.[item.itemId ?? ""] ?? 0;
        if (qty < item.quantity) throw new Error("INSUFFICIENT_ITEMS");
        toPlayer.inventory[item.itemId!] = qty - item.quantity;
        if (toPlayer.inventory[item.itemId!] <= 0) {
          delete toPlayer.inventory[item.itemId!];
        }
        fromPlayer.inventory[item.itemId!] = (fromPlayer.inventory?.[item.itemId ?? ""] ?? 0) + item.quantity;
      }
    }

    fromPlayer.statistics = fromPlayer.statistics ?? {
      totalDamageDealt: 0, totalDamageTaken: 0, totalHealing: 0, bossesKilled: 0,
      worldBossesKilled: 0, dungeonsCompleted: 0, dungeonsFailed: 0, questsCompleted: 0,
      itemsSold: 0, itemsBought: 0, coinsEarned: 0, coinsSpent: 0, tradesCompleted: 0,
      gamblesPlayed: 0, gamblesWon: 0, highestDamage: 0, longestStreak: 0, totalPlayTimeMs: 0,
    };
    toPlayer.statistics = toPlayer.statistics ?? {
      totalDamageDealt: 0, totalDamageTaken: 0, totalHealing: 0, bossesKilled: 0,
      worldBossesKilled: 0, dungeonsCompleted: 0, dungeonsFailed: 0, questsCompleted: 0,
      itemsSold: 0, itemsBought: 0, coinsEarned: 0, coinsSpent: 0, tradesCompleted: 0,
      gamblesPlayed: 0, gamblesWon: 0, highestDamage: 0, longestStreak: 0, totalPlayTimeMs: 0,
    };
    fromPlayer.statistics.tradesCompleted++;
    toPlayer.statistics.tradesCompleted++;

    activeTrades.delete(tradeId);

    return { success: true, message: "Trade completed successfully!" };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Trade failed.",
    };
  }
}

export function cancelTrade(tradeId: string, playerId: string): { success: boolean; message: string } {
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

export function getPendingTradeForPlayer(playerId: string): PendingTrade | undefined {
  for (const trade of activeTrades.values()) {
    if (trade.fromUserId === playerId || trade.toUserId === playerId) {
      if (Date.now() <= trade.expiresAt) {
        return trade;
      }
    }
  }
  return undefined;
}

export function cleanupExpiredTrades(): number {
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

setInterval(cleanupExpiredTrades, 60_000).unref();
