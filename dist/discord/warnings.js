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
var warnings_exports = {};
__export(warnings_exports, {
  addWarning: () => addWarning,
  getWarnings: () => getWarnings
});
module.exports = __toCommonJS(warnings_exports);
var import_node_fs = __toESM(require("node:fs"));
var import_node_path = __toESM(require("node:path"));
const DATA_DIR = import_node_path.default.join(process.cwd(), "data");
const DATA_FILE = import_node_path.default.join(DATA_DIR, "warnings.json");
function ensureStorage() {
  if (!import_node_fs.default.existsSync(DATA_DIR)) {
    import_node_fs.default.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!import_node_fs.default.existsSync(DATA_FILE)) {
    import_node_fs.default.writeFileSync(DATA_FILE, "[]", "utf8");
  }
}
function readWarnings() {
  ensureStorage();
  try {
    const raw = import_node_fs.default.readFileSync(DATA_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
function writeWarnings(warnings) {
  ensureStorage();
  import_node_fs.default.writeFileSync(
    DATA_FILE,
    JSON.stringify(warnings, null, 2),
    "utf8"
  );
}
function addWarning(guildId, userId, moderatorId, reason) {
  const warnings = readWarnings();
  const warning = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    guildId,
    userId,
    moderatorId,
    reason,
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  warnings.push(warning);
  writeWarnings(warnings);
  return warning;
}
function getWarnings(guildId, userId) {
  return readWarnings().filter(
    (warning) => warning.guildId === guildId && warning.userId === userId
  );
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  addWarning,
  getWarnings
});
