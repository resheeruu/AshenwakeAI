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
var worldBossStore_exports = {};
__export(worldBossStore_exports, {
  clearWorldBoss: () => clearWorldBoss,
  getActiveWorldBoss: () => getActiveWorldBoss,
  loadWorldBoss: () => loadWorldBoss,
  saveWorldBoss: () => saveWorldBoss,
  spawnWorldBoss: () => spawnWorldBoss
});
module.exports = __toCommonJS(worldBossStore_exports);
var import_fs = __toESM(require("fs"));
var import_path = __toESM(require("path"));
var import_worldBosses = require("./worldBosses");
const DATA_DIR = import_path.default.join(process.cwd(), "data");
const FILE = import_path.default.join(DATA_DIR, "world-boss.json");
async function ensureStore() {
  await import_fs.default.promises.mkdir(DATA_DIR, { recursive: true });
  if (!import_fs.default.existsSync(FILE)) {
    await import_fs.default.promises.writeFile(FILE, "null", "utf8");
  }
}
async function loadWorldBoss() {
  await ensureStore();
  try {
    const raw = await import_fs.default.promises.readFile(FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
async function saveWorldBoss(state) {
  await ensureStore();
  const temporary = `${FILE}.tmp`;
  await import_fs.default.promises.writeFile(
    temporary,
    JSON.stringify(state, null, 2),
    "utf8"
  );
  await import_fs.default.promises.rename(temporary, FILE);
}
async function clearWorldBoss() {
  await ensureStore();
  await import_fs.default.promises.writeFile(
    FILE,
    "null",
    "utf8"
  );
}
async function getActiveWorldBoss(now = Date.now()) {
  const state = await loadWorldBoss();
  if (!state) {
    return null;
  }
  if (!(0, import_worldBosses.isWorldBossActive)(state, now)) {
    await saveWorldBoss(state);
    return null;
  }
  return state;
}
async function spawnWorldBoss(bossId, now = Date.now()) {
  const existing = await getActiveWorldBoss(now);
  if (existing) {
    throw new Error("WORLD_BOSS_ALREADY_ACTIVE");
  }
  if (!(0, import_worldBosses.getWorldBoss)(bossId)) {
    throw new Error("INVALID_WORLD_BOSS");
  }
  const state = (0, import_worldBosses.createWorldBoss)(bossId, now);
  await saveWorldBoss(state);
  return state;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  clearWorldBoss,
  getActiveWorldBoss,
  loadWorldBoss,
  saveWorldBoss,
  spawnWorldBoss
});
