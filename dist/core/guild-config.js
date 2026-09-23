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
var guild_config_exports = {};
__export(guild_config_exports, {
  configsEqual: () => configsEqual,
  deleteGuildConfig: () => deleteGuildConfig,
  getAllGuildConfigs: () => getAllGuildConfigs,
  guildConfigExists: () => guildConfigExists,
  loadGuildConfig: () => loadGuildConfig,
  saveGuildConfig: () => saveGuildConfig
});
module.exports = __toCommonJS(guild_config_exports);
var import_fast_deep_equal = __toESM(require("fast-deep-equal"));
var import_database = require("../database");
function loadGuildConfig(guildId) {
  return (0, import_database.loadGuildConfigDB)(guildId);
}
function guildConfigExists(guildId) {
  return (0, import_database.guildConfigExistsDB)(guildId);
}
function saveGuildConfig(config) {
  (0, import_database.saveGuildConfigDB)(config);
}
function getAllGuildConfigs() {
  return (0, import_database.getAllGuildConfigsDB)();
}
function deleteGuildConfig(guildId) {
  return (0, import_database.deleteGuildConfigDB)(guildId);
}
function configsEqual(a, b) {
  return (0, import_fast_deep_equal.default)(a, b);
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  configsEqual,
  deleteGuildConfig,
  getAllGuildConfigs,
  guildConfigExists,
  loadGuildConfig,
  saveGuildConfig
});
