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
var channel_scope_exports = {};
__export(channel_scope_exports, {
  addChannelScope: () => addChannelScope,
  addChatRole: () => addChatRole,
  addManagementRole: () => addManagementRole,
  addTrustedUser: () => addTrustedUser,
  assertGuildIsolation: () => assertGuildIsolation,
  deleteGuildAIConfig: () => deleteGuildAIConfig,
  getAllGuildAIConfigs: () => getAllGuildAIConfigs,
  getChannelScopes: () => getChannelScopes,
  getTrustedUsers: () => getTrustedUsers,
  isChannelAllowed: () => isChannelAllowed,
  isTrustedUser: () => isTrustedUser,
  loadGuildAIConfig: () => loadGuildAIConfig,
  removeChannelScope: () => removeChannelScope,
  removeChatRole: () => removeChatRole,
  removeManagementRole: () => removeManagementRole,
  removeSingleChannelScope: () => removeSingleChannelScope,
  removeTrustedUser: () => removeTrustedUser,
  saveGuildAIConfig: () => saveGuildAIConfig,
  setChannelScope: () => setChannelScope
});
module.exports = __toCommonJS(channel_scope_exports);
var import_database = require("../../database");
const CURRENT_VERSION = 1;
function defaultGuildAIConfig(guildId) {
  return {
    guildId,
    enabled: true,
    managementEnabled: false,
    channelScopes: {},
    managementRoleIds: [],
    chatRoleIds: [],
    protectedChannels: [],
    protectedCategories: [],
    trustedUserIds: [],
    version: CURRENT_VERSION,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
}
function loadGuildAIConfig(guildId) {
  return (0, import_database.loadGuildAIConfigDB)(guildId);
}
function saveGuildAIConfig(config) {
  (0, import_database.saveGuildAIConfigDB)(config);
}
function getAllGuildAIConfigs() {
  return (0, import_database.getAllGuildAIConfigsDB)();
}
function deleteGuildAIConfig(guildId) {
  return (0, import_database.deleteGuildAIConfigDB)(guildId);
}
function setChannelScope(config, channelId, scopes) {
  config.channelScopes[channelId] = [...new Set(scopes)];
  config.updatedAt = Date.now();
}
function removeChannelScope(config, channelId) {
  delete config.channelScopes[channelId];
  config.updatedAt = Date.now();
}
function addChannelScope(config, channelId, scope) {
  const existing = config.channelScopes[channelId] || [];
  if (!existing.includes(scope)) {
    existing.push(scope);
    config.channelScopes[channelId] = existing;
    config.updatedAt = Date.now();
  }
}
function removeSingleChannelScope(config, channelId, scope) {
  const existing = config.channelScopes[channelId];
  if (!existing) return;
  const filtered = existing.filter((s) => s !== scope);
  if (filtered.length === 0) {
    delete config.channelScopes[channelId];
  } else {
    config.channelScopes[channelId] = filtered;
  }
  config.updatedAt = Date.now();
}
function getChannelScopes(config, channelId) {
  return config.channelScopes[channelId] || [];
}
function isChannelAllowed(config, channelId, requiredScope) {
  if (!config.enabled) return false;
  const scopes = config.channelScopes[channelId] || [];
  return scopes.includes(requiredScope);
}
function addManagementRole(config, roleId) {
  if (!config.managementRoleIds.includes(roleId)) {
    config.managementRoleIds.push(roleId);
    config.updatedAt = Date.now();
  }
}
function removeManagementRole(config, roleId) {
  config.managementRoleIds = config.managementRoleIds.filter((id) => id !== roleId);
  config.updatedAt = Date.now();
}
function addChatRole(config, roleId) {
  if (!config.chatRoleIds.includes(roleId)) {
    config.chatRoleIds.push(roleId);
    config.updatedAt = Date.now();
  }
}
function removeChatRole(config, roleId) {
  config.chatRoleIds = config.chatRoleIds.filter((id) => id !== roleId);
  config.updatedAt = Date.now();
}
function assertGuildIsolation(configGuildId, requestGuildId) {
  return configGuildId === requestGuildId;
}
function addTrustedUser(config, userId) {
  if (config.trustedUserIds.includes(userId)) {
    return false;
  }
  config.trustedUserIds.push(userId);
  config.updatedAt = Date.now();
  return true;
}
function removeTrustedUser(config, userId) {
  const before = config.trustedUserIds.length;
  config.trustedUserIds = config.trustedUserIds.filter((id) => id !== userId);
  config.updatedAt = Date.now();
  return config.trustedUserIds.length < before;
}
function isTrustedUser(config, userId) {
  return config.trustedUserIds.includes(userId);
}
function getTrustedUsers(config) {
  return [...config.trustedUserIds];
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  addChannelScope,
  addChatRole,
  addManagementRole,
  addTrustedUser,
  assertGuildIsolation,
  deleteGuildAIConfig,
  getAllGuildAIConfigs,
  getChannelScopes,
  getTrustedUsers,
  isChannelAllowed,
  isTrustedUser,
  loadGuildAIConfig,
  removeChannelScope,
  removeChatRole,
  removeManagementRole,
  removeSingleChannelScope,
  removeTrustedUser,
  saveGuildAIConfig,
  setChannelScope
});
