/**
 * AshenAI Transactional Settlement Engine
 *
 * Provides atomic, race-condition-free balance adjustments, wager settlements,
 * progression updates, and exactly-once reward distributions.
 */

import { GamePlayer, Equipment } from "./types";
import { withPlayerLock, withLock } from "./lock";
import { mutatePlayer, getPlayer } from "./store";
import { applyLevelUp, updateAchievements, ACHIEVEMENTS } from "./rewards";
import { addXp, addReputation, applyDeath, healPlayer, ProgressionResult } from "./progression";

export type SettlementResult<T = void> = {
  player: GamePlayer;
  data: T;
};

export type WagerSettlement = {
  success: boolean;
  wager: number;
  remainingCoins: number;
};

export type GameSettlement = {
  coinsChange: number;
  xpGained: number;
  levelUp: boolean;
  newAchievements: string[];
  progression: ProgressionResult;
};

export type CasinoSettlement = {
  game: string;
  wager: number;
  payout: number;
  net: number;
  won: boolean;
  levelUp: boolean;
  newAchievements: string[];
  progression: ProgressionResult;
};

export type DailySettlement = {
  coinsAwarded: number;
  xpAwarded: number;
  streak: number;
  levelUp: boolean;
  newAchievements: string[];
  progression: ProgressionResult;
};

export type ClaimSettlement<T = any> = {
  claimId: string;
  alreadyClaimed: boolean;
  data?: T;
};

// In-memory idempotency registry for settled transactions & claims
const processedClaims = new Map<string, { settledAt: number; result: any }>();

// Retain claim history for 1 hour to prevent duplicate replays
const CLAIM_TTL_MS = 60 * 60 * 1000;

function cleanupOldClaims(): void {
  const now = Date.now();
  for (const [key, val] of processedClaims.entries()) {
    if (now - val.settledAt > CLAIM_TTL_MS) {
      processedClaims.delete(key);
    }
  }
}

/**
 * Check if a claim ID was already settled.
 */
export function isClaimSettled(claimId: string): boolean {
  cleanupOldClaims();
  return processedClaims.has(claimId);
}

/**
 * Execute an exactly-once transactional claim for a player.
 * If claimId was already settled, returns the existing result without re-executing.
 */
export async function settleExactlyOnce<T>(
  userId: string,
  claimId: string,
  handler: (player: GamePlayer) => Promise<T> | T,
  username = "Unknown",
): Promise<SettlementResult<ClaimSettlement<T>>> {
  cleanupOldClaims();

  return withLock(`claim:${claimId}`, async () => {
    if (processedClaims.has(claimId)) {
      const cached = processedClaims.get(claimId)!;
      const player = await getPlayer(userId, username);
      return {
        player,
        data: {
          claimId,
          alreadyClaimed: true,
          data: cached.result,
        },
      };
    }

    const { player, result } = await mutatePlayer(
      userId,
      async (p) => {
        return await handler(p);
      },
      username,
    );

    processedClaims.set(claimId, {
      settledAt: Date.now(),
      result,
    });

    return {
      player,
      data: {
        claimId,
        alreadyClaimed: false,
        data: result,
      },
    };
  });
}

/**
 * Deducts a wager atomically from the player's balance.
 * Throws an error if funds are insufficient or wager is invalid.
 */
export async function settleWagerDeduction(
  userId: string,
  wager: number,
  minWager = 10,
  maxWager = 100000,
  username = "Unknown",
  claimId?: string,
): Promise<SettlementResult<WagerSettlement>> {
  if (!Number.isInteger(wager)) {
    throw new Error("WAGER_MUST_BE_WHOLE_NUMBER");
  }
  if (wager < minWager) {
    throw new Error(`MINIMUM_WAGER:${minWager}`);
  }
  if (wager > maxWager) {
    throw new Error(`MAXIMUM_WAGER:${maxWager}`);
  }

  if (claimId && isClaimSettled(claimId)) {
    const player = await getPlayer(userId, username);
    return {
      player,
      data: {
        success: true,
        wager,
        remainingCoins: player.coins,
      },
    };
  }

  const { player, result } = await mutatePlayer(
    userId,
    (p) => {
      if (p.coins < wager) {
        throw new Error("INSUFFICIENT_COINS");
      }
      p.coins -= wager;
      return {
        success: true,
        wager,
        remainingCoins: p.coins,
      };
    },
    username,
  );

  if (claimId) {
    processedClaims.set(claimId, {
      settledAt: Date.now(),
      result,
    });
  }

  return { player, data: result };
}

/**
 * Settles a completed casino game outcome atomically.
 */
export async function settleCasinoPayout(
  userId: string,
  params: {
    game: string;
    wager: number;
    payout: number;
    won: boolean;
    xp?: number;
    username?: string;
    claimId?: string;
  },
): Promise<SettlementResult<CasinoSettlement>> {
  const { game, wager, payout, won, xp = 10, username = "Unknown", claimId } = params;

  if (claimId && isClaimSettled(claimId)) {
    const cached = processedClaims.get(claimId)!;
    const player = await getPlayer(userId, username);
    return { player, data: cached.result };
  }

  const { player, result } = await mutatePlayer(
    userId,
    (p) => {
      // Balance update
      p.coins += payout;

      // Stats update
      p.casinoWagered = (p.casinoWagered ?? 0) + wager;
      p.gamesPlayed = (p.gamesPlayed ?? 0) + 1;

      if (won) {
        p.casinoWins = (p.casinoWins ?? 0) + 1;
        p.casinoWon = (p.casinoWon ?? 0) + payout;
        p.wins = (p.wins ?? 0) + 1;
        p.streak = (p.streak ?? 0) + 1;
        if (p.streak > (p.bestStreak ?? 0)) {
          p.bestStreak = p.streak;
        }
      } else {
        p.casinoLosses = (p.casinoLosses ?? 0) + 1;
        p.casinoLost = (p.casinoLost ?? 0) + wager;
        p.losses = (p.losses ?? 0) + 1;
        p.streak = 0;
      }

      // XP & Progression
      const prog = addXp(p, xp);
      const levelUp = prog.levelsGained > 0;

      // Achievements
      const beforeAchievements = new Set(p.achievements);
      updateAchievements(p);
      const newAchievements = p.achievements.filter(
        (id) => !beforeAchievements.has(id),
      );

      return {
        game,
        wager,
        payout,
        net: payout - wager,
        won,
        levelUp,
        newAchievements,
        progression: prog,
      };
    },
    username,
  );

  if (claimId) {
    processedClaims.set(claimId, {
      settledAt: Date.now(),
      result,
    });
  }

  return { player, data: result };
}

/**
 * Settles a general game result (win/loss/draw) with reward distribution.
 */
export async function settleGameResult(
  userId: string,
  params: {
    result: "win" | "loss" | "draw";
    coinsReward: number;
    xpReward: number;
    username?: string;
    claimId?: string;
  },
): Promise<SettlementResult<GameSettlement>> {
  const { result, coinsReward, xpReward, username = "Unknown", claimId } = params;

  if (claimId && isClaimSettled(claimId)) {
    const cached = processedClaims.get(claimId)!;
    const player = await getPlayer(userId, username);
    return { player, data: cached.result };
  }

  const { player, result: data } = await mutatePlayer(
    userId,
    (p) => {
      p.gamesPlayed = (p.gamesPlayed ?? 0) + 1;
      p.coins += coinsReward;

      if (result === "win") {
        p.wins = (p.wins ?? 0) + 1;
        p.streak = (p.streak ?? 0) + 1;
        if (p.streak > (p.bestStreak ?? 0)) {
          p.bestStreak = p.streak;
        }
      } else if (result === "loss") {
        p.losses = (p.losses ?? 0) + 1;
        p.streak = 0;
      } else {
        p.draws = (p.draws ?? 0) + 1;
      }

      const prog = addXp(p, xpReward);
      const levelUp = prog.levelsGained > 0;

      const before = new Set(p.achievements);
      updateAchievements(p);
      const newAchievements = p.achievements.filter((id) => !before.has(id));

      return {
        coinsChange: coinsReward,
        xpGained: xpReward,
        levelUp,
        newAchievements,
        progression: prog,
      };
    },
    username,
  );

  if (claimId) {
    processedClaims.set(claimId, {
      settledAt: Date.now(),
      result: data,
    });
  }

  return { player, data };
}

/**
 * Settles a daily reward claim with 24-hour cooldown validation.
 */
export async function settleDailyClaim(
  userId: string,
  coins = 100,
  xp = 25,
  username = "Unknown",
): Promise<SettlementResult<DailySettlement>> {
  const { player, result: data } = await mutatePlayer(
    userId,
    (p) => {
      const now = Date.now();
      if (p.dailyClaimedAt) {
        const last = new Date(p.dailyClaimedAt).getTime();
        const remaining = 24 * 60 * 60 * 1000 - (now - last);
        if (remaining > 0) {
          const hours = Math.ceil(remaining / 3600000);
          throw new Error(`DAILY_COOLDOWN:${hours}`);
        }
      }

      p.dailyClaimedAt = new Date(now).toISOString();
      p.dailyStreak = (p.dailyStreak ?? 0) + 1;
      if (p.dailyStreak > (p.bestDailyStreak ?? 0)) {
        p.bestDailyStreak = p.dailyStreak;
      }

      p.coins += coins;
      const prog = addXp(p, xp);
      const levelUp = prog.levelsGained > 0;

      const before = new Set(p.achievements);
      updateAchievements(p);
      const newAchievements = p.achievements.filter((id) => !before.has(id));

      return {
        coinsAwarded: coins,
        xpAwarded: xp,
        streak: p.dailyStreak,
        levelUp,
        newAchievements,
        progression: prog,
      };
    },
    username,
  );

  return { player, data };
}

/**
 * Settles player inventory modification.
 */
export async function settleInventoryChange(
  userId: string,
  itemId: string,
  quantityDelta: number,
  username = "Unknown",
): Promise<SettlementResult<{ itemId: string; newQuantity: number }>> {
  const { player, result: data } = await mutatePlayer(
    userId,
    (p) => {
      p.inventory = p.inventory ?? {};
      const current = p.inventory[itemId] ?? 0;
      const updated = current + quantityDelta;

      if (updated < 0) {
        throw new Error("INSUFFICIENT_ITEM_QUANTITY");
      }

      if (updated === 0) {
        delete p.inventory[itemId];
      } else {
        p.inventory[itemId] = updated;
      }

      return {
        itemId,
        newQuantity: Math.max(0, updated),
      };
    },
    username,
  );

  return { player, data };
}

/**
 * Settles equipment addition/removal.
 */
export async function settleEquipmentChange(
  userId: string,
  action: "add" | "remove" | "equip" | "unequip",
  equipment: Equipment,
  username = "Unknown",
): Promise<SettlementResult<{ action: string; equipment: Equipment }>> {
  const { player, result: data } = await mutatePlayer(
    userId,
    (p) => {
      p.equipment = p.equipment ?? [];

      if (action === "add") {
        p.equipment.push(equipment);
      } else if (action === "remove") {
        p.equipment = p.equipment.filter((item) => item.id !== equipment.id);
      } else if (action === "equip") {
        // Unequip current item in same slot
        for (const item of p.equipment) {
          if (item.slot === equipment.slot) {
            item.equipped = false;
          }
        }
        const target = p.equipment.find((item) => item.id === equipment.id);
        if (target) {
          target.equipped = true;
        } else {
          equipment.equipped = true;
          p.equipment.push(equipment);
        }
      } else if (action === "unequip") {
        const target = p.equipment.find((item) => item.id === equipment.id);
        if (target) {
          target.equipped = false;
        }
      }

      return { action, equipment };
    },
    username,
  );

  return { player, data };
}
