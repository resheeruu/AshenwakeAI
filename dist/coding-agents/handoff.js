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
var handoff_exports = {};
__export(handoff_exports, {
  getHandoffsForTask: () => getHandoffsForTask,
  getLatestHandoff: () => getLatestHandoff,
  loadHandoffs: () => loadHandoffs,
  recordHandoff: () => recordHandoff,
  saveHandoffs: () => saveHandoffs
});
module.exports = __toCommonJS(handoff_exports);
var import_node_fs = __toESM(require("node:fs"));
var import_node_path = __toESM(require("node:path"));
const ROOT = process.cwd();
const DATA_DIR = import_node_path.default.join(ROOT, "data");
const HANDOFF_FILE = import_node_path.default.join(DATA_DIR, "coding-agent-handoffs.json");
async function ensureStore() {
  await import_node_fs.default.promises.mkdir(DATA_DIR, { recursive: true });
  if (!import_node_fs.default.existsSync(HANDOFF_FILE)) {
    await import_node_fs.default.promises.writeFile(
      HANDOFF_FILE,
      "[]",
      "utf8"
    );
  }
}
async function loadHandoffs() {
  await ensureStore();
  try {
    const raw = await import_node_fs.default.promises.readFile(
      HANDOFF_FILE,
      "utf8"
    );
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
async function saveHandoffs(handoffs) {
  await ensureStore();
  const temporary = `${HANDOFF_FILE}.tmp`;
  await import_node_fs.default.promises.writeFile(
    temporary,
    JSON.stringify(handoffs, null, 2),
    "utf8"
  );
  await import_node_fs.default.promises.rename(
    temporary,
    HANDOFF_FILE
  );
}
async function recordHandoff(handoff) {
  const handoffs = await loadHandoffs();
  handoffs.push(handoff);
  await saveHandoffs(handoffs);
}
async function getHandoffsForTask(taskId) {
  const handoffs = await loadHandoffs();
  return handoffs.filter(
    (handoff) => handoff.taskId === taskId
  );
}
async function getLatestHandoff(taskId) {
  const handoffs = await getHandoffsForTask(taskId);
  return handoffs.length > 0 ? handoffs[handoffs.length - 1] : void 0;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  getHandoffsForTask,
  getLatestHandoff,
  loadHandoffs,
  recordHandoff,
  saveHandoffs
});
