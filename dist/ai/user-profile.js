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
var user_profile_exports = {};
__export(user_profile_exports, {
  UserProfileMemory: () => UserProfileMemory
});
module.exports = __toCommonJS(user_profile_exports);
var import_fs = __toESM(require("fs"));
var import_path = __toESM(require("path"));
var import_logger = require("../logger");
const DATA_DIR = import_path.default.join(process.cwd(), "data");
const PROFILE_FILE = import_path.default.join(DATA_DIR, "user-profiles.json");
const MAX_PROFILES = 1e4;
const STALE_DAYS = 90;
class UserProfileMemory {
  profiles = /* @__PURE__ */ new Map();
  dirty = false;
  saveTimer = null;
  pruneTimer = null;
  constructor() {
    this.load();
    this.saveTimer = setInterval(() => this.flush(), 6e4);
    this.saveTimer.unref();
    this.pruneTimer = setInterval(() => this.pruneStale(), 24 * 60 * 60 * 1e3);
    this.pruneTimer.unref();
  }
  load() {
    try {
      if (!import_fs.default.existsSync(PROFILE_FILE)) {
        return;
      }
      const raw = import_fs.default.readFileSync(PROFILE_FILE, "utf8");
      const stored = JSON.parse(raw);
      for (const [userId, profile] of Object.entries(stored)) {
        if (!profile || profile.userId !== userId || typeof profile.username !== "string" || typeof profile.displayName !== "string" || typeof profile.firstSeen !== "number" || typeof profile.lastSeen !== "number") {
          continue;
        }
        this.profiles.set(userId, profile);
      }
      this.pruneStale();
      import_logger.logger.info(
        `\u{1F464} User profiles loaded: ${this.profiles.size} profile(s).`
      );
    } catch (error) {
      import_logger.logger.warn(
        "\u26A0\uFE0F Could not load user profiles:",
        error instanceof Error ? error.message : String(error)
      );
    }
  }
  pruneStale() {
    const cutoff = Date.now() - STALE_DAYS * 24 * 60 * 60 * 1e3;
    let pruned = 0;
    for (const [userId, profile] of this.profiles) {
      if (profile.lastSeen < cutoff) {
        this.profiles.delete(userId);
        pruned++;
      }
    }
    if (pruned > 0) {
      import_logger.logger.info(`\u{1F464} Pruned ${pruned} stale user profiles (>${STALE_DAYS} days inactive).`);
      this.dirty = true;
    }
  }
  save() {
    this.dirty = true;
  }
  flush() {
    if (!this.dirty) return;
    this.dirty = false;
    try {
      import_fs.default.mkdirSync(DATA_DIR, {
        recursive: true
      });
      const stored = {};
      for (const [userId, profile] of this.profiles) {
        stored[userId] = profile;
      }
      const tmpPath = PROFILE_FILE + ".tmp";
      import_fs.default.writeFileSync(
        tmpPath,
        JSON.stringify(stored, null, 2),
        "utf8"
      );
      import_fs.default.renameSync(tmpPath, PROFILE_FILE);
    } catch (error) {
      import_logger.logger.warn(
        "\u26A0\uFE0F Could not save user profiles:",
        error instanceof Error ? error.message : String(error)
      );
    }
  }
  get(userId) {
    const profile = this.profiles.get(userId);
    return profile ? { ...profile } : void 0;
  }
  upsert(userId, username, displayName) {
    const existing = this.profiles.get(userId);
    const now = Date.now();
    if (!existing && this.profiles.size >= MAX_PROFILES) {
      let oldestKey = "";
      let oldestSeen = Infinity;
      for (const [key, p] of this.profiles) {
        if (p.lastSeen < oldestSeen) {
          oldestSeen = p.lastSeen;
          oldestKey = key;
        }
      }
      if (oldestKey) this.profiles.delete(oldestKey);
    }
    const profile = {
      userId,
      username,
      displayName,
      firstSeen: existing?.firstSeen ?? now,
      lastSeen: now,
      language: existing?.language,
      humor: existing?.humor,
      formality: existing?.formality,
      verbosity: existing?.verbosity,
      emoji: existing?.emoji,
      technicalLevel: existing?.technicalLevel
    };
    this.profiles.set(userId, profile);
    this.save();
    return { ...profile };
  }
  setLanguage(userId, language) {
    const profile = this.profiles.get(userId);
    if (!profile) {
      return;
    }
    profile.language = language;
    profile.lastSeen = Date.now();
    this.profiles.set(userId, profile);
    this.save();
  }
  updateSignals(userId, signals) {
    const profile = this.profiles.get(userId);
    if (!profile) {
      return;
    }
    Object.assign(profile, signals);
    profile.lastSeen = Date.now();
    this.profiles.set(userId, profile);
    this.save();
  }
  size() {
    return this.profiles.size;
  }
  clear() {
    this.profiles.clear();
    this.save();
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  UserProfileMemory
});
