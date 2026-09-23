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
var settings_exports = {};
__export(settings_exports, {
  ALL_SETTINGS: () => import_definitions.ALL_SETTINGS,
  SETTINGS_CATEGORIES: () => import_definitions.SETTINGS_CATEGORIES,
  applySettingChange: () => import_service.applySettingChange,
  applySettingValue: () => import_service.applySettingValue,
  ensureConfigSections: () => import_service.ensureConfigSections,
  ensureSection: () => import_types.ensureSection,
  formatChannelMention: () => import_service.formatChannelMention,
  formatRoleMention: () => import_service.formatRoleMention,
  formatValue: () => import_service.formatValue,
  getCategoryMeta: () => import_definitions.getCategoryMeta,
  getCategoryValues: () => import_service.getCategoryValues,
  getConfigValue: () => import_types.getConfigValue,
  getOverviewData: () => import_service.getOverviewData,
  getRecentAuditEntries: () => import_service.getRecentAuditEntries,
  getRecentLogEntries: () => import_service.getRecentLogEntries,
  getSettingById: () => import_definitions.getSettingById,
  getSettingValue: () => import_service.getSettingValue,
  getSettingsByCategory: () => import_definitions.getSettingsByCategory,
  resetSetting: () => import_service.resetSetting,
  saveSettingChange: () => import_service.saveSettingChange,
  setConfigValue: () => import_types.setConfigValue,
  validateSettingValue: () => import_service.validateSettingValue
});
module.exports = __toCommonJS(settings_exports);
var import_types = require("./types");
var import_definitions = require("./definitions");
var import_service = require("./service");
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  ALL_SETTINGS,
  SETTINGS_CATEGORIES,
  applySettingChange,
  applySettingValue,
  ensureConfigSections,
  ensureSection,
  formatChannelMention,
  formatRoleMention,
  formatValue,
  getCategoryMeta,
  getCategoryValues,
  getConfigValue,
  getOverviewData,
  getRecentAuditEntries,
  getRecentLogEntries,
  getSettingById,
  getSettingValue,
  getSettingsByCategory,
  resetSetting,
  saveSettingChange,
  setConfigValue,
  validateSettingValue
});
