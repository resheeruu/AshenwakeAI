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
var service_exports = {};
__export(service_exports, {
  applySettingChange: () => applySettingChange,
  applySettingValue: () => applySettingValue,
  ensureConfigSections: () => ensureConfigSections,
  formatChannelMention: () => formatChannelMention,
  formatRoleMention: () => formatRoleMention,
  formatValue: () => formatValue,
  getCategoryValues: () => getCategoryValues,
  getOverviewData: () => getOverviewData,
  getRecentAuditEntries: () => getRecentAuditEntries,
  getRecentLogEntries: () => getRecentLogEntries,
  getSettingValue: () => getSettingValue,
  resetSetting: () => resetSetting,
  saveSettingChange: () => saveSettingChange,
  validateSettingValue: () => validateSettingValue
});
module.exports = __toCommonJS(service_exports);
var import_guild_config = require("../core/guild-config");
var import_audit = require("../security/audit");
var import_logger = require("../logger");
var import_log_stream = require("../log-stream");
var import_audit2 = require("../security/audit");
var import_definitions = require("./definitions");
var import_types = require("./types");
const DISCORD_ID_RE = /^\d{17,20}$/;
function validateSettingValue(descriptor, rawValue, guildId) {
  switch (descriptor.type) {
    case "boolean": {
      const lower = rawValue.toLowerCase().trim();
      if (lower === "true" || lower === "1" || lower === "yes" || lower === "on") {
        return { valid: true, normalized: true };
      }
      if (lower === "false" || lower === "0" || lower === "no" || lower === "off") {
        return { valid: true, normalized: false };
      }
      if (lower === "none" || lower === "unset" || lower === "reset") {
        return { valid: true, normalized: descriptor.defaultValue };
      }
      return { valid: false, error: `Expected true/false, got "${rawValue}"` };
    }
    case "number": {
      const lower = rawValue.toLowerCase().trim();
      if (lower === "none" || lower === "unset" || lower === "reset") {
        return { valid: true, normalized: descriptor.defaultValue };
      }
      const num = Number(rawValue);
      if (!Number.isFinite(num) || !Number.isInteger(num)) {
        return { valid: false, error: `Expected a whole number, got "${rawValue}"` };
      }
      if (descriptor.min !== void 0 && num < descriptor.min) {
        return { valid: false, error: `Minimum value is ${descriptor.min}` };
      }
      if (descriptor.max !== void 0 && num > descriptor.max) {
        return { valid: false, error: `Maximum value is ${descriptor.max}` };
      }
      return { valid: true, normalized: num };
    }
    case "channel": {
      const lower = rawValue.toLowerCase().trim();
      if (lower === "none" || lower === "unset" || lower === "reset" || lower === "clear") {
        return { valid: true, normalized: void 0 };
      }
      if (!DISCORD_ID_RE.test(rawValue)) {
        return { valid: false, error: `Invalid channel ID format: "${rawValue}"` };
      }
      return { valid: true, normalized: rawValue };
    }
    case "role": {
      const lower = rawValue.toLowerCase().trim();
      if (lower === "none" || lower === "unset" || lower === "reset" || lower === "clear") {
        return { valid: true, normalized: void 0 };
      }
      if (!DISCORD_ID_RE.test(rawValue)) {
        return { valid: false, error: `Invalid role ID format: "${rawValue}"` };
      }
      return { valid: true, normalized: rawValue };
    }
    case "roles": {
      const lower = rawValue.toLowerCase().trim();
      if (lower === "none" || lower === "unset" || lower === "reset" || lower === "clear") {
        return { valid: true, normalized: [] };
      }
      if (!DISCORD_ID_RE.test(rawValue)) {
        return { valid: false, error: `Invalid role ID format: "${rawValue}"` };
      }
      return { valid: true, normalized: rawValue };
    }
    case "string": {
      const trimmed = rawValue.trim();
      if (trimmed === "none" || trimmed === "unset" || trimmed === "reset") {
        return { valid: true, normalized: descriptor.defaultValue };
      }
      if (trimmed.length === 0) {
        return { valid: false, error: `String value cannot be empty` };
      }
      if (descriptor.max !== void 0 && trimmed.length > descriptor.max) {
        return { valid: false, error: `Maximum length is ${descriptor.max} characters` };
      }
      if (descriptor.min !== void 0 && trimmed.length < descriptor.min) {
        return { valid: false, error: `Minimum length is ${descriptor.min} characters` };
      }
      return { valid: true, normalized: trimmed };
    }
    default:
      return { valid: false, error: `Unknown setting type: "${descriptor.type}"` };
  }
}
function getSettingValue(config, settingId) {
  const descriptor = (0, import_definitions.getSettingById)(settingId);
  if (!descriptor) return void 0;
  return (0, import_types.getConfigValue)(config, descriptor.path);
}
function getCategoryValues(config, category) {
  const settings = (0, import_definitions.getSettingsByCategory)(category);
  const values = /* @__PURE__ */ new Map();
  for (const setting of settings) {
    values.set(setting.id, (0, import_types.getConfigValue)(config, setting.path));
  }
  return values;
}
function applySettingChange(config, settingId, newValue) {
  const descriptor = (0, import_definitions.getSettingById)(settingId);
  if (!descriptor) return null;
  const oldValue = (0, import_types.getConfigValue)(config, descriptor.path);
  (0, import_types.setConfigValue)(config, descriptor.path, newValue);
  return {
    settingId,
    category: descriptor.category,
    path: descriptor.path,
    label: descriptor.label,
    oldValue,
    newValue,
    guildId: config.guildId,
    userId: "",
    userName: "",
    timestamp: Date.now()
  };
}
function saveSettingChange(config, change, userId, userName) {
  change.userId = userId;
  change.userName = userName;
  change.timestamp = Date.now();
  (0, import_guild_config.saveGuildConfig)(config);
  const details = `${change.label}: ${formatValue(change.oldValue)} \u2192 ${formatValue(change.newValue)}`;
  (0, import_audit.recordAudit)({
    who: userId,
    whoName: userName,
    what: `Settings updated: ${details}`,
    where: "discord",
    guildId: config.guildId,
    result: "success"
  });
  import_logger.logger.info(`\u2699\uFE0F Settings updated by ${userName}: ${change.path} = ${formatValue(change.newValue)}`);
}
function applySettingValue(config, settingId, newValue) {
  const descriptor = (0, import_definitions.getSettingById)(settingId);
  if (!descriptor) return null;
  const oldValue = (0, import_types.getConfigValue)(config, descriptor.path);
  if (newValue !== void 0) {
    (0, import_types.setConfigValue)(config, descriptor.path, newValue);
  }
  return oldValue;
}
function resetSetting(config, settingId) {
  const descriptor = (0, import_definitions.getSettingById)(settingId);
  if (!descriptor) return null;
  return applySettingChange(config, settingId, descriptor.defaultValue);
}
function getOverviewData(config) {
  const enabledModules = [];
  if (config.moderation?.enabled) enabledModules.push("Moderation");
  if (config.support?.enabled) enabledModules.push("Support");
  if (config.reports?.enabled) enabledModules.push("Reports");
  if (config.appeals?.enabled) enabledModules.push("Appeals");
  if (config.supportAi?.enabled) enabledModules.push("AI");
  if (config.supportLogging?.enabled) enabledModules.push("Logging");
  const configuredChannels = [];
  if (config.support?.channelId) configuredChannels.push({ label: "Support Channel", id: config.support.channelId });
  if (config.support?.categoryId) configuredChannels.push({ label: "Support Category", id: config.support.categoryId });
  if (config.reports?.categoryId) configuredChannels.push({ label: "Report Category", id: config.reports.categoryId });
  if (config.appeals?.categoryId) configuredChannels.push({ label: "Appeal Category", id: config.appeals.categoryId });
  if (config.supportLogging?.channelId) configuredChannels.push({ label: "Log Channel", id: config.supportLogging.channelId });
  const staffRoles = config.staff?.roleIds ?? [];
  return {
    enabledModules,
    configuredChannels,
    staffRoles,
    loggingEnabled: config.supportLogging?.enabled ?? false,
    lastConfigChange: config.updatedAt
  };
}
function getRecentAuditEntries(guildId, limit = 20) {
  const entries = (0, import_audit2.getAuditLog)({ guildId, limit });
  return entries.map((e) => ({
    id: e.id,
    timestamp: e.timestamp,
    who: e.who,
    whoName: e.whoName,
    what: e.what,
    result: e.result,
    details: e.details
  }));
}
function getRecentLogEntries(limit = 30) {
  return (0, import_log_stream.getRecentLogs)(limit).map((e) => ({
    id: e.id,
    timestamp: e.timestamp,
    level: e.level,
    message: e.message
  }));
}
function formatValue(value) {
  if (value === void 0 || value === null) return "Not set";
  if (typeof value === "boolean") return value ? "Enabled" : "Disabled";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    if (value.length === 0) return "None";
    return value.map((v) => typeof v === "string" ? v : String(v)).join(", ");
  }
  return String(value);
}
function formatChannelMention(id) {
  return id ? `<#${id}>` : "Not set";
}
function formatRoleMention(id) {
  return `<@&${id}>`;
}
function ensureConfigSections(config) {
  if (!config.support) {
    config.support = {
      enabled: false,
      allowGeneralHelp: true,
      allowReports: true,
      allowAppeals: true
    };
  }
  if (!config.reports) {
    config.reports = {
      enabled: false,
      requireEvidence: false,
      aiAnalysisEnabled: true,
      autoEscalateHighRisk: true
    };
  }
  if (!config.appeals) {
    config.appeals = {
      enabled: false,
      aiAnalysisEnabled: true
    };
  }
  if (!config.supportAi) {
    config.supportAi = {
      enabled: true,
      allowModerationActions: false,
      requireConfirmation: true,
      allowWebResearch: false
    };
  }
  if (!config.supportLogging) {
    config.supportLogging = {
      enabled: false,
      includeModeration: true,
      includeTickets: true,
      includeReports: true,
      includeAppeals: true,
      includeAiActions: true
    };
  }
  if (!config.staff) {
    config.staff = { roleIds: [] };
  }
  if (!config.social) {
    config.social = {
      enabled: false,
      channels: {},
      animeActions: true,
      customReactions: true,
      customEmoji: true,
      rivalryMode: false,
      debateMode: false,
      globalCooldownMs: 3e4,
      maxResponsesPerHour: 10
    };
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  applySettingChange,
  applySettingValue,
  ensureConfigSections,
  formatChannelMention,
  formatRoleMention,
  formatValue,
  getCategoryValues,
  getOverviewData,
  getRecentAuditEntries,
  getRecentLogEntries,
  getSettingValue,
  resetSetting,
  saveSettingChange,
  validateSettingValue
});
