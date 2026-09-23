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
var data_store_exports = {};
__export(data_store_exports, {
  dataPath: () => dataPath,
  ensureDataDir: () => ensureDataDir,
  readJSON: () => readJSON,
  writeJSON: () => writeJSON
});
module.exports = __toCommonJS(data_store_exports);
var import_fs = __toESM(require("fs"));
var import_path = __toESM(require("path"));
var import_logger = require("../logger");
const DATA_DIR = import_path.default.join(process.cwd(), "data");
function ensureDataDir() {
  import_fs.default.mkdirSync(DATA_DIR, { recursive: true });
}
function readJSON(filename, fallback) {
  const filePath = import_path.default.join(DATA_DIR, filename);
  try {
    if (!import_fs.default.existsSync(filePath)) return fallback;
    const raw = import_fs.default.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    import_logger.logger.warn(`\u26A0\uFE0F Could not parse ${filename}, using fallback: ${error instanceof Error ? error.message : String(error)}`);
    return fallback;
  }
}
function writeJSON(filename, data) {
  ensureDataDir();
  const filePath = import_path.default.join(DATA_DIR, filename);
  const tmpPath = filePath + ".tmp";
  try {
    import_fs.default.writeFileSync(tmpPath, JSON.stringify(data, null, 2), "utf8");
    import_fs.default.renameSync(tmpPath, filePath);
  } catch (error) {
    import_logger.logger.warn(`\u26A0\uFE0F Could not write ${filename}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
function dataPath(filename) {
  return import_path.default.join(DATA_DIR, filename);
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  dataPath,
  ensureDataDir,
  readJSON,
  writeJSON
});
