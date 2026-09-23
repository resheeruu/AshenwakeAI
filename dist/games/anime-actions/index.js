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
var anime_actions_exports = {};
__export(anime_actions_exports, {
  buildDiscordResponse: () => import_engine.buildDiscordResponse,
  clearAnimationCache: () => import_providers.clearAnimationCache,
  executeAction: () => import_engine.executeAction,
  fetchAnimation: () => import_providers.fetchAnimation,
  followRedirectsSafe: () => import_media_security.followRedirectsSafe,
  getAction: () => import_definitions.getAction,
  getActionsByCategory: () => import_definitions.getActionsByCategory,
  getAllActions: () => import_definitions.getAllActions,
  getAnimationCacheStats: () => import_providers.getAnimationCacheStats,
  handleAnimeAction: () => import_prefix_handler.handleAnimeAction,
  isAnimeActionPrefix: () => import_prefix_handler.isAnimeActionPrefix,
  resolveResponse: () => import_definitions.resolveResponse,
  safeMediaFetch: () => import_media_security.safeMediaFetch,
  validateMediaUrl: () => import_media_security.validateMediaUrl
});
module.exports = __toCommonJS(anime_actions_exports);
var import_definitions = require("./definitions");
var import_providers = require("./providers");
var import_media_security = require("./media-security");
var import_engine = require("./engine");
var import_prefix_handler = require("./prefix-handler");
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  buildDiscordResponse,
  clearAnimationCache,
  executeAction,
  fetchAnimation,
  followRedirectsSafe,
  getAction,
  getActionsByCategory,
  getAllActions,
  getAnimationCacheStats,
  handleAnimeAction,
  isAnimeActionPrefix,
  resolveResponse,
  safeMediaFetch,
  validateMediaUrl
});
