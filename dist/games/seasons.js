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
var seasons_exports = {};
__export(seasons_exports, {
  endCurrentSeason: () => endCurrentSeason,
  getArchivedSeasons: () => getArchivedSeasons,
  getCurrentSeason: () => getCurrentSeason,
  getSeasonLeaderboard: () => getSeasonLeaderboard,
  startNewSeason: () => startNewSeason
});
module.exports = __toCommonJS(seasons_exports);
var import_fs = __toESM(require("fs"));
var import_path = __toESM(require("path"));
var import_config = require("./config");
var import_store = require("./store");
const DATA_DIR = import_path.default.join(process.cwd(), "data");
const SEASONS_FILE = import_path.default.join(DATA_DIR, "seasons.json");
const CURRENT_SEASON_FILE = import_path.default.join(DATA_DIR, "current-season.json");
async function ensureSeasonStore() {
  await import_fs.default.promises.mkdir(DATA_DIR, { recursive: true });
  if (!import_fs.default.existsSync(SEASONS_FILE)) {
    await import_fs.default.promises.writeFile(SEASONS_FILE, "[]", "utf8");
  }
  if (!import_fs.default.existsSync(CURRENT_SEASON_FILE)) {
    await import_fs.default.promises.writeFile(CURRENT_SEASON_FILE, "null", "utf8");
  }
}
async function getCurrentSeason() {
  await ensureSeasonStore();
  try {
    const raw = await import_fs.default.promises.readFile(CURRENT_SEASON_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    if (Date.now() > parsed.endDate) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
async function startNewSeason(name, theme, emoji) {
  await ensureSeasonStore();
  const current = await getCurrentSeason();
  if (current && current.active) {
    await endCurrentSeason();
  }
  const durationDays = import_config.GAME_CONFIG.seasons.durationDays;
  const now = Date.now();
  const season = {
    id: `season_${now}`,
    name,
    theme,
    emoji,
    startDate: now,
    endDate: now + durationDays * 24 * 60 * 60 * 1e3,
    active: true
  };
  await import_fs.default.promises.writeFile(
    CURRENT_SEASON_FILE,
    JSON.stringify(season, null, 2),
    "utf8"
  );
  return season;
}
async function endCurrentSeason() {
  await ensureSeasonStore();
  const current = await getCurrentSeason();
  if (!current) return null;
  const stats = await calculateSeasonStats(current);
  const snapshots = await buildPlayerSnapshots();
  const archived = {
    config: { ...current, active: false },
    stats,
    playerSnapshots: snapshots
  };
  const raw = await import_fs.default.promises.readFile(SEASONS_FILE, "utf8");
  const seasons = JSON.parse(raw);
  seasons.push(archived);
  await import_fs.default.promises.writeFile(
    SEASONS_FILE,
    JSON.stringify(seasons, null, 2),
    "utf8"
  );
  await import_fs.default.promises.writeFile(CURRENT_SEASON_FILE, "null", "utf8");
  return archived;
}
async function calculateSeasonStats(season) {
  const players = await (0, import_store.loadPlayers)();
  const playerList = Object.values(players);
  let highestLevel = 0;
  let richestPlayer = "";
  let richestCoins = 0;
  let mostBossKills = "";
  let bossKills = 0;
  let highestDamage = "";
  let damage = 0;
  let mostAchievements = "";
  let achievementCount = 0;
  for (const player of playerList) {
    if (player.level > highestLevel) {
      highestLevel = player.level;
    }
    if (player.coins > richestCoins) {
      richestCoins = player.coins;
      richestPlayer = player.username;
    }
    const stats = player.statistics;
    if (stats) {
      if (stats.worldBossesKilled > bossKills) {
        bossKills = stats.worldBossesKilled;
        mostBossKills = player.username;
      }
      if (stats.highestDamage > damage) {
        damage = stats.highestDamage;
        highestDamage = player.username;
      }
    }
    if (player.achievements.length > achievementCount) {
      achievementCount = player.achievements.length;
      mostAchievements = player.username;
    }
  }
  return {
    highestLevel,
    richestPlayer,
    richestCoins,
    mostBossKills,
    bossKills,
    highestDamage,
    damage,
    mostAchievements,
    achievementCount,
    guildRankings: []
  };
}
async function buildPlayerSnapshots() {
  const players = await (0, import_store.loadPlayers)();
  const playerList = Object.values(players);
  const sorted = [...playerList].sort((a, b) => b.level - a.level || b.xp - a.xp);
  const snapshots = {};
  sorted.forEach((player, index) => {
    snapshots[player.userId] = {
      level: player.level,
      coins: player.coins,
      bossKills: player.statistics?.worldBossesKilled ?? 0,
      achievements: player.achievements.length,
      rank: index + 1
    };
  });
  return snapshots;
}
async function getArchivedSeasons() {
  await ensureSeasonStore();
  try {
    const raw = await import_fs.default.promises.readFile(SEASONS_FILE, "utf8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}
async function getSeasonLeaderboard(type, limit = 10) {
  const players = await (0, import_store.loadPlayers)();
  const playerList = Object.values(players);
  let sorted;
  switch (type) {
    case "level":
      sorted = playerList.map((p) => ({ name: p.username, value: p.level })).sort((a, b) => b.value - a.value);
      break;
    case "coins":
      sorted = playerList.map((p) => ({ name: p.username, value: p.coins })).sort((a, b) => b.value - a.value);
      break;
    case "achievements":
      sorted = playerList.map((p) => ({ name: p.username, value: p.achievements.length })).sort((a, b) => b.value - a.value);
      break;
    case "bossKills":
      sorted = playerList.map((p) => ({
        name: p.username,
        value: p.statistics?.worldBossesKilled ?? 0
      })).sort((a, b) => b.value - a.value);
      break;
    default:
      sorted = [];
  }
  return sorted.slice(0, limit).map((entry, index) => ({
    rank: index + 1,
    ...entry
  }));
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  endCurrentSeason,
  getArchivedSeasons,
  getCurrentSeason,
  getSeasonLeaderboard,
  startNewSeason
});
