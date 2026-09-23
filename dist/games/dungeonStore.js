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
var dungeonStore_exports = {};
__export(dungeonStore_exports, {
  createDungeonState: () => createDungeonState,
  deleteDungeonState: () => deleteDungeonState,
  findActiveDungeonForPlayer: () => findActiveDungeonForPlayer,
  getCompletedDungeonForPlayer: () => getCompletedDungeonForPlayer,
  getDungeonState: () => getDungeonState,
  loadDungeons: () => loadDungeons,
  saveDungeons: () => saveDungeons,
  updateDungeonState: () => updateDungeonState
});
module.exports = __toCommonJS(dungeonStore_exports);
var import_fs = __toESM(require("fs"));
var import_path = __toESM(require("path"));
const DATA_DIR = import_path.default.join(process.cwd(), "data");
const FILE = import_path.default.join(DATA_DIR, "dungeons.json");
async function ensureStore() {
  await import_fs.default.promises.mkdir(DATA_DIR, { recursive: true });
  if (!import_fs.default.existsSync(FILE)) {
    await import_fs.default.promises.writeFile(FILE, "{}", "utf8");
  }
}
async function loadDungeons() {
  await ensureStore();
  try {
    const raw = await import_fs.default.promises.readFile(FILE, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}
async function saveDungeons(dungeons) {
  await ensureStore();
  const temporary = `${FILE}.tmp`;
  await import_fs.default.promises.writeFile(
    temporary,
    JSON.stringify(dungeons, null, 2),
    "utf8"
  );
  await import_fs.default.promises.rename(temporary, FILE);
}
async function getDungeonState(dungeonId) {
  const dungeons = await loadDungeons();
  return dungeons[dungeonId];
}
async function createDungeonState(state) {
  const dungeons = await loadDungeons();
  dungeons[state.id] = state;
  await saveDungeons(dungeons);
}
async function updateDungeonState(state) {
  const dungeons = await loadDungeons();
  dungeons[state.id] = state;
  await saveDungeons(dungeons);
}
async function deleteDungeonState(dungeonId) {
  const dungeons = await loadDungeons();
  delete dungeons[dungeonId];
  await saveDungeons(dungeons);
}
async function findActiveDungeonForPlayer(userId) {
  const dungeons = await loadDungeons();
  return Object.values(dungeons).find(
    (state) => state.status !== "completed" && state.status !== "failed" && state.playerIds.includes(userId)
  );
}
async function getCompletedDungeonForPlayer(userId) {
  const dungeons = await loadDungeons();
  return Object.values(dungeons).reverse().find(
    (state) => state.status === "completed" && state.playerIds.includes(userId) && state.members.some(
      (member) => member.userId === userId && !member.rewardClaimed
    )
  );
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  createDungeonState,
  deleteDungeonState,
  findActiveDungeonForPlayer,
  getCompletedDungeonForPlayer,
  getDungeonState,
  loadDungeons,
  saveDungeons,
  updateDungeonState
});
