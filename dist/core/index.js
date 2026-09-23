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
var core_exports = {};
__export(core_exports, {
  dataPath: () => import_data_store.dataPath,
  ensureDataDir: () => import_data_store.ensureDataDir,
  readJSON: () => import_data_store.readJSON,
  writeJSON: () => import_data_store.writeJSON
});
module.exports = __toCommonJS(core_exports);
var import_data_store = require("./data-store");
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  dataPath,
  ensureDataDir,
  readJSON,
  writeJSON
});
