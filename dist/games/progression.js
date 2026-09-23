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
var progression_exports = {};
__export(progression_exports, {
  addReputation: () => addReputation,
  addXp: () => addXp,
  applyDeath: () => applyDeath,
  getProgressionSummary: () => getProgressionSummary,
  getTotalPower: () => getTotalPower,
  getXpRequired: () => getXpRequired,
  healPlayer: () => healPlayer
});
module.exports = __toCommonJS(progression_exports);
var import_world = require("./world");
var import_quests = require("./quests");
function xpRequired(level) {
  return Math.floor(100 * Math.pow(level, 1.35));
}
function getXpRequired(level) {
  return xpRequired(level);
}
function getTotalPower(player) {
  const equipment = player.equipment ?? [];
  const equipmentAttack = equipment.filter((item) => item.equipped).reduce((sum, item) => sum + item.attack, 0);
  const equipmentDefense = equipment.filter((item) => item.equipped).reduce((sum, item) => sum + item.defense, 0);
  const equipmentHp = equipment.filter((item) => item.equipped).reduce((sum, item) => sum + item.hp, 0);
  return player.attack + equipmentAttack + (player.defense + equipmentDefense) + Math.floor((player.maxHp + equipmentHp) / 10) + player.luck;
}
function addXp(player, amount) {
  const xpGained = Math.max(0, Math.floor(amount));
  const previousLevel = player.level;
  const titlesUnlocked = [];
  player.xp += xpGained;
  player.totalXpEarned = (player.totalXpEarned ?? 0) + xpGained;
  while (player.xp >= xpRequired(player.level)) {
    player.xp -= xpRequired(player.level);
    player.level += 1;
    player.maxHp += 10;
    player.hp = player.maxHp;
    player.attack += 2;
    player.defense += 1;
  }
  const autoTitles = (0, import_quests.checkAutoTitles)(player);
  titlesUnlocked.push(...autoTitles);
  const regionBefore = (0, import_world.getRegion)(player.regionId);
  const unlocked = (0, import_world.unlockAvailableRegion)(player);
  return {
    xpGained,
    levelsGained: player.level - previousLevel,
    previousLevel,
    newLevel: player.level,
    regionUnlocked: unlocked && unlocked.id !== regionBefore.id ? unlocked.name : void 0,
    titlesUnlocked
  };
}
function addReputation(player, amount) {
  player.reputation = Math.max(
    0,
    player.reputation + Math.floor(amount)
  );
  const before = player.regionId;
  const unlocked = (0, import_world.unlockAvailableRegion)(player);
  if (unlocked && unlocked.id !== before) {
    return unlocked.name;
  }
  return void 0;
}
function applyDeath(player) {
  player.deaths = (player.deaths ?? 0) + 1;
  player.hp = player.maxHp;
  player.huntStreak = 0;
  (0, import_quests.checkAutoTitles)(player);
}
function healPlayer(player, amount) {
  const before = player.hp;
  player.hp = Math.min(
    player.maxHp,
    player.hp + Math.max(0, Math.floor(amount))
  );
  return player.hp - before;
}
function getProgressionSummary(player) {
  return {
    region: (0, import_world.getRegion)(player.regionId).name,
    xp: player.xp,
    xpRequired: xpRequired(player.level),
    level: player.level,
    power: getTotalPower(player),
    reputation: player.reputation
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  addReputation,
  addXp,
  applyDeath,
  getProgressionSummary,
  getTotalPower,
  getXpRequired,
  healPlayer
});
