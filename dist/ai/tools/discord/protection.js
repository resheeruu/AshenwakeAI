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
var protection_exports = {};
__export(protection_exports, {
  getProtectedResources: () => getProtectedResources,
  isChannelProtected: () => isChannelProtected,
  isProtectedCategory: () => isProtectedCategory,
  isProtectedChannel: () => isProtectedChannel,
  isProtectedResource: () => isProtectedResource,
  protectCategory: () => protectCategory,
  protectChannel: () => protectChannel,
  unprotectCategory: () => unprotectCategory,
  unprotectChannel: () => unprotectChannel
});
module.exports = __toCommonJS(protection_exports);
var import_logger = require("../../../logger");
var import_channel_scope = require("../channel-scope");
function isProtectedChannel(guildId, channelId) {
  const config = (0, import_channel_scope.loadGuildAIConfig)(guildId);
  return config.protectedChannels.includes(channelId);
}
function isProtectedCategory(guildId, categoryId) {
  const config = (0, import_channel_scope.loadGuildAIConfig)(guildId);
  return config.protectedCategories.includes(categoryId);
}
function isProtectedResource(guildId, channelIdOrCategoryId) {
  return isProtectedChannel(guildId, channelIdOrCategoryId) || isProtectedCategory(guildId, channelIdOrCategoryId);
}
function isChannelProtected(guildId, channelId, parentId) {
  if (isProtectedChannel(guildId, channelId)) return true;
  if (parentId && isProtectedCategory(guildId, parentId)) return true;
  return false;
}
function protectChannel(guildId, channelId) {
  const config = (0, import_channel_scope.loadGuildAIConfig)(guildId);
  if (config.protectedChannels.includes(channelId)) return false;
  config.protectedChannels.push(channelId);
  (0, import_channel_scope.saveGuildAIConfig)(config);
  import_logger.logger.info(`Channel ${channelId} protected in guild ${guildId}`);
  return true;
}
function unprotectChannel(guildId, channelId) {
  const config = (0, import_channel_scope.loadGuildAIConfig)(guildId);
  const idx = config.protectedChannels.indexOf(channelId);
  if (idx === -1) return false;
  config.protectedChannels.splice(idx, 1);
  (0, import_channel_scope.saveGuildAIConfig)(config);
  import_logger.logger.info(`Channel ${channelId} unprotected in guild ${guildId}`);
  return true;
}
function protectCategory(guildId, categoryId) {
  const config = (0, import_channel_scope.loadGuildAIConfig)(guildId);
  if (config.protectedCategories.includes(categoryId)) return false;
  config.protectedCategories.push(categoryId);
  (0, import_channel_scope.saveGuildAIConfig)(config);
  import_logger.logger.info(`Category ${categoryId} protected in guild ${guildId}`);
  return true;
}
function unprotectCategory(guildId, categoryId) {
  const config = (0, import_channel_scope.loadGuildAIConfig)(guildId);
  const idx = config.protectedCategories.indexOf(categoryId);
  if (idx === -1) return false;
  config.protectedCategories.splice(idx, 1);
  (0, import_channel_scope.saveGuildAIConfig)(config);
  import_logger.logger.info(`Category ${categoryId} unprotected in guild ${guildId}`);
  return true;
}
function getProtectedResources(guildId) {
  const config = (0, import_channel_scope.loadGuildAIConfig)(guildId);
  return {
    channels: [...config.protectedChannels],
    categories: [...config.protectedCategories]
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  getProtectedResources,
  isChannelProtected,
  isProtectedCategory,
  isProtectedChannel,
  isProtectedResource,
  protectCategory,
  protectChannel,
  unprotectCategory,
  unprotectChannel
});
