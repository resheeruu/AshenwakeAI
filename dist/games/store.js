"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
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
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var store_exports = {};
__export(store_exports, {
  getLeaderboard: () => getLeaderboard,
  getPlayer: () => getPlayer,
  loadPlayers: () => loadPlayers,
  mutatePlayer: () => mutatePlayer,
  savePlayers: () => savePlayers,
  updatePlayer: () => updatePlayer
});
module.exports = __toCommonJS(store_exports);
var import_fs = __toESM(require("fs"));
var import_path = __toESM(require("path"));
var import_lock = require("./lock");
const DATA_DIR = import_path.default.join(process.cwd(), "data");
const FILE = import_path.default.join(DATA_DIR, "game-players.json");
async function ensureStore() {
  await import_fs.default.promises.mkdir(DATA_DIR, { recursive: true });
  try {
    await import_fs.default.promises.access(FILE);
  } catch {
    await import_fs.default.promises.writeFile(FILE, "{}", "utf8");
  }
}
async function loadPlayersUnlocked() {
  await ensureStore();
  try {
    const raw = await import_fs.default.promises.readFile(FILE, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}
async function savePlayersUnlocked(players) {
  await ensureStore();
  await import_fs.default.promises.writeFile(
    FILE,
    JSON.stringify(players, null, 2),
    "utf8"
  );
}
async function loadPlayers() {
  return (0, import_lock.withGlobalLock)("game-players-store", async () => {
    return loadPlayersUnlocked();
  });
}
async function savePlayers(players) {
  return (0, import_lock.withGlobalLock)("game-players-store", async () => {
    await savePlayersUnlocked(players);
  });
}
function normalizePlayer(player, userId, username) {
  return {
    userId,
    username,
    coins: player.coins ?? 100,
    xp: player.xp ?? 0,
    level: player.level ?? 1,
    totalXpEarned: player.totalXpEarned ?? 0,
    wins: player.wins ?? 0,
    losses: player.losses ?? 0,
    draws: player.draws ?? 0,
    streak: player.streak ?? 0,
    bestStreak: player.bestStreak ?? 0,
    gamesPlayed: player.gamesPlayed ?? 0,
    dailyClaimedAt: player.dailyClaimedAt,
    dailyStreak: player.dailyStreak ?? 0,
    bestDailyStreak: player.bestDailyStreak ?? 0,
    achievements: player.achievements ?? [],
    classId: player.classId,
    regionId: player.regionId,
    unlockedRegions: player.unlockedRegions ?? (player.regionId ? [player.regionId] : ["ashen_village"]),
    hp: player.hp ?? 100,
    maxHp: player.maxHp ?? 100,
    attack: player.attack ?? 15,
    defense: player.defense ?? 5,
    duelWins: player.duelWins ?? 0,
    duelLosses: player.duelLosses ?? 0,
    luck: player.luck ?? 0,
    deaths: player.deaths ?? 0,
    reputation: player.reputation ?? 0,
    titles: player.titles ?? [],
    activeTitle: player.activeTitle,
    huntLastAt: player.huntLastAt,
    huntStreak: player.huntStreak ?? 0,
    bestHuntStreak: player.bestHuntStreak ?? 0,
    huntsCompleted: player.huntsCompleted ?? 0,
    legendaryHunts: player.legendaryHunts ?? 0,
    epicHunts: player.epicHunts ?? 0,
    inventory: player.inventory ?? {},
    equipment: player.equipment ?? [],
    pets: player.pets ?? [],
    activePetId: player.activePetId,
    quests: player.quests ?? [],
    statistics: player.statistics ?? {
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
      totalPlayTimeMs: 0,
      lastActiveAt: Date.now()
    },
    guildId: player.guildId,
    xpBoostActive: player.xpBoostActive ?? false,
    luckyTokenActive: player.luckyTokenActive ?? false,
    casinoWagered: player.casinoWagered ?? 0,
    casinoWon: player.casinoWon ?? 0,
    casinoLost: player.casinoLost ?? 0,
    casinoWins: player.casinoWins ?? 0,
    casinoLosses: player.casinoLosses ?? 0
  };
}
async function getPlayer(userId, username = "Unknown") {
  return (0, import_lock.withPlayerLock)(userId, async () => {
    const players = await loadPlayers();
    if (!players[userId]) {
      players[userId] = normalizePlayer({}, userId, username);
      await savePlayers(players);
    } else {
      players[userId] = normalizePlayer(
        players[userId],
        userId,
        username
      );
    }
    return players[userId];
  });
}
async function updatePlayer(player) {
  return (0, import_lock.withPlayerLock)(player.userId, async () => {
    const players = await loadPlayers();
    players[player.userId] = normalizePlayer(
      player,
      player.userId,
      player.username
    );
    await savePlayers(players);
  });
}
async function mutatePlayer(userId, mutator, username = "Unknown") {
  return (0, import_lock.withGlobalLock)("game-players-store", async () => {
    const players = await loadPlayersUnlocked();
    let player = players[userId];
    if (!player) {
      player = normalizePlayer({}, userId, username);
    } else {
      player = normalizePlayer(player, userId, username);
    }
    const result = await mutator(player);
    players[userId] = normalizePlayer(
      player,
      userId,
      player.username
    );
    await savePlayersUnlocked(players);
    return {
      player: players[userId],
      result
    };
  });
}
async function getLeaderboard(limit = 10, sortBy = "level") {
  const players = await loadPlayers();
  return Object.values(players).map(
    (player) => normalizePlayer(player, player.userId, player.username)
  ).sort((a, b) => {
    if (sortBy === "xp") {
      if (b.xp !== a.xp) {
        return b.xp - a.xp;
      }
      if (b.level !== a.level) {
        return b.level - a.level;
      }
      return b.coins - a.coins;
    }
    if (sortBy === "coins") {
      if (b.coins !== a.coins) {
        return b.coins - a.coins;
      }
      if (b.level !== a.level) {
        return b.level - a.level;
      }
      return b.xp - a.xp;
    }
    if (b.level !== a.level) {
      return b.level - a.level;
    }
    if (b.xp !== a.xp) {
      return b.xp - a.xp;
    }
    return b.coins - a.coins;
  }).slice(0, limit);
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  getLeaderboard,
  getPlayer,
  loadPlayers,
  mutatePlayer,
  savePlayers,
  updatePlayer
});
