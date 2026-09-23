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
var settlement_exports = {};
__export(settlement_exports, {
  isClaimSettled: () => isClaimSettled,
  settleCasinoPayout: () => settleCasinoPayout,
  settleDailyClaim: () => settleDailyClaim,
  settleEquipmentChange: () => settleEquipmentChange,
  settleExactlyOnce: () => settleExactlyOnce,
  settleGameResult: () => settleGameResult,
  settleInventoryChange: () => settleInventoryChange,
  settleWagerDeduction: () => settleWagerDeduction
});
module.exports = __toCommonJS(settlement_exports);
var import_lock = require("./lock");
var import_store = require("./store");
var import_rewards = require("./rewards");
var import_progression = require("./progression");
const processedClaims = /* @__PURE__ */ new Map();
const CLAIM_TTL_MS = 60 * 60 * 1e3;
function cleanupOldClaims() {
  const now = Date.now();
  for (const [key, val] of processedClaims.entries()) {
    if (now - val.settledAt > CLAIM_TTL_MS) {
      processedClaims.delete(key);
    }
  }
}
function isClaimSettled(claimId) {
  cleanupOldClaims();
  return processedClaims.has(claimId);
}
async function settleExactlyOnce(userId, claimId, handler, username = "Unknown") {
  cleanupOldClaims();
  return (0, import_lock.withLock)(`claim:${claimId}`, async () => {
    if (processedClaims.has(claimId)) {
      const cached = processedClaims.get(claimId);
      const player2 = await (0, import_store.getPlayer)(userId, username);
      return {
        player: player2,
        data: {
          claimId,
          alreadyClaimed: true,
          data: cached.result
        }
      };
    }
    const { player, result } = await (0, import_store.mutatePlayer)(
      userId,
      async (p) => {
        return await handler(p);
      },
      username
    );
    processedClaims.set(claimId, {
      settledAt: Date.now(),
      result
    });
    return {
      player,
      data: {
        claimId,
        alreadyClaimed: false,
        data: result
      }
    };
  });
}
async function settleWagerDeduction(userId, wager, minWager = 10, maxWager = 1e5, username = "Unknown", claimId) {
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
    const player2 = await (0, import_store.getPlayer)(userId, username);
    return {
      player: player2,
      data: {
        success: true,
        wager,
        remainingCoins: player2.coins
      }
    };
  }
  const { player, result } = await (0, import_store.mutatePlayer)(
    userId,
    (p) => {
      if (p.coins < wager) {
        throw new Error("INSUFFICIENT_COINS");
      }
      p.coins -= wager;
      return {
        success: true,
        wager,
        remainingCoins: p.coins
      };
    },
    username
  );
  if (claimId) {
    processedClaims.set(claimId, {
      settledAt: Date.now(),
      result
    });
  }
  return { player, data: result };
}
async function settleCasinoPayout(userId, params) {
  const { game, wager, payout, won, xp = 10, username = "Unknown", claimId } = params;
  if (claimId && isClaimSettled(claimId)) {
    const cached = processedClaims.get(claimId);
    const player2 = await (0, import_store.getPlayer)(userId, username);
    return { player: player2, data: cached.result };
  }
  const { player, result } = await (0, import_store.mutatePlayer)(
    userId,
    (p) => {
      p.coins += payout;
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
      const prog = (0, import_progression.addXp)(p, xp);
      const levelUp = prog.levelsGained > 0;
      const beforeAchievements = new Set(p.achievements);
      (0, import_rewards.updateAchievements)(p);
      const newAchievements = p.achievements.filter(
        (id) => !beforeAchievements.has(id)
      );
      return {
        game,
        wager,
        payout,
        net: payout - wager,
        won,
        levelUp,
        newAchievements,
        progression: prog
      };
    },
    username
  );
  if (claimId) {
    processedClaims.set(claimId, {
      settledAt: Date.now(),
      result
    });
  }
  return { player, data: result };
}
async function settleGameResult(userId, params) {
  const { result, coinsReward, xpReward, username = "Unknown", claimId } = params;
  if (claimId && isClaimSettled(claimId)) {
    const cached = processedClaims.get(claimId);
    const player2 = await (0, import_store.getPlayer)(userId, username);
    return { player: player2, data: cached.result };
  }
  const { player, result: data } = await (0, import_store.mutatePlayer)(
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
      const prog = (0, import_progression.addXp)(p, xpReward);
      const levelUp = prog.levelsGained > 0;
      const before = new Set(p.achievements);
      (0, import_rewards.updateAchievements)(p);
      const newAchievements = p.achievements.filter((id) => !before.has(id));
      return {
        coinsChange: coinsReward,
        xpGained: xpReward,
        levelUp,
        newAchievements,
        progression: prog
      };
    },
    username
  );
  if (claimId) {
    processedClaims.set(claimId, {
      settledAt: Date.now(),
      result: data
    });
  }
  return { player, data };
}
async function settleDailyClaim(userId, coins = 100, xp = 25, username = "Unknown") {
  const { player, result: data } = await (0, import_store.mutatePlayer)(
    userId,
    (p) => {
      const now = Date.now();
      if (p.dailyClaimedAt) {
        const last = new Date(p.dailyClaimedAt).getTime();
        const remaining = 24 * 60 * 60 * 1e3 - (now - last);
        if (remaining > 0) {
          const hours = Math.ceil(remaining / 36e5);
          throw new Error(`DAILY_COOLDOWN:${hours}`);
        }
      }
      p.dailyClaimedAt = new Date(now).toISOString();
      p.dailyStreak = (p.dailyStreak ?? 0) + 1;
      if (p.dailyStreak > (p.bestDailyStreak ?? 0)) {
        p.bestDailyStreak = p.dailyStreak;
      }
      p.coins += coins;
      const prog = (0, import_progression.addXp)(p, xp);
      const levelUp = prog.levelsGained > 0;
      const before = new Set(p.achievements);
      (0, import_rewards.updateAchievements)(p);
      const newAchievements = p.achievements.filter((id) => !before.has(id));
      return {
        coinsAwarded: coins,
        xpAwarded: xp,
        streak: p.dailyStreak,
        levelUp,
        newAchievements,
        progression: prog
      };
    },
    username
  );
  return { player, data };
}
async function settleInventoryChange(userId, itemId, quantityDelta, username = "Unknown") {
  const { player, result: data } = await (0, import_store.mutatePlayer)(
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
        newQuantity: Math.max(0, updated)
      };
    },
    username
  );
  return { player, data };
}
async function settleEquipmentChange(userId, action, equipment, username = "Unknown") {
  const { player, result: data } = await (0, import_store.mutatePlayer)(
    userId,
    (p) => {
      p.equipment = p.equipment ?? [];
      if (action === "add") {
        p.equipment.push(equipment);
      } else if (action === "remove") {
        p.equipment = p.equipment.filter((item) => item.id !== equipment.id);
      } else if (action === "equip") {
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
    username
  );
  return { player, data };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  isClaimSettled,
  settleCasinoPayout,
  settleDailyClaim,
  settleEquipmentChange,
  settleExactlyOnce,
  settleGameResult,
  settleInventoryChange,
  settleWagerDeduction
});
