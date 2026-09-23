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
var xp_system_exports = {};
__export(xp_system_exports, {
  XPSystem: () => XPSystem
});
module.exports = __toCommonJS(xp_system_exports);
var import_data_store = require("../core/data-store");
const XP_FILE = "xp-data.json";
const XP_PER_MESSAGE = 15;
const XP_COOLDOWN_MS = 6e4;
const BASE_XP = 100;
const XP_MULTIPLIER = 1.5;
function xpForLevel(level) {
  return Math.floor(BASE_XP * Math.pow(XP_MULTIPLIER, level));
}
function profileKey(userId, guildId) {
  return `${guildId}:${userId}`;
}
class XPSystem {
  store;
  constructor() {
    this.store = (0, import_data_store.readJSON)(XP_FILE, { profiles: {} });
  }
  save() {
    (0, import_data_store.writeJSON)(XP_FILE, this.store);
  }
  addXP(userId, guildId, amount = XP_PER_MESSAGE) {
    const key = profileKey(userId, guildId);
    const now = Date.now();
    let profile = this.store.profiles[key];
    if (!profile) {
      profile = { userId, guildId, xp: 0, level: 0, totalMessages: 0, lastXpAt: 0, streak: 0, lastActiveDay: "" };
      this.store.profiles[key] = profile;
    }
    if (now - profile.lastXpAt < XP_COOLDOWN_MS) {
      return { xp: profile.xp, level: profile.level, leveledUp: false };
    }
    const today = new Date(now).toISOString().slice(0, 10);
    if (profile.lastActiveDay !== today) {
      if (profile.lastActiveDay === new Date(now - 864e5).toISOString().slice(0, 10)) {
        profile.streak++;
      } else {
        profile.streak = 1;
      }
      profile.lastActiveDay = today;
    }
    const streakBonus = Math.min(profile.streak, 7) * 2;
    profile.xp += amount + streakBonus;
    profile.totalMessages++;
    profile.lastXpAt = now;
    let leveledUp = false;
    while (profile.xp >= xpForLevel(profile.level)) {
      profile.xp -= xpForLevel(profile.level);
      profile.level++;
      leveledUp = true;
    }
    this.save();
    return { xp: profile.xp, level: profile.level, leveledUp };
  }
  getProfile(userId, guildId) {
    return this.store.profiles[profileKey(userId, guildId)] || {
      userId,
      guildId,
      xp: 0,
      level: 0,
      totalMessages: 0,
      lastXpAt: 0,
      streak: 0,
      lastActiveDay: ""
    };
  }
  getLeaderboard(guildId, limit = 10) {
    return Object.values(this.store.profiles).filter((p) => p.guildId === guildId).sort((a, b) => b.level - a.level || b.xp - a.xp).slice(0, limit);
  }
  getRank(userId, guildId) {
    const sorted = this.getLeaderboard(guildId, 1e3);
    const idx = sorted.findIndex((p) => p.userId === userId);
    return idx >= 0 ? idx + 1 : sorted.length + 1;
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  XPSystem
});
