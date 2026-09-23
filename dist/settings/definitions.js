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
var definitions_exports = {};
__export(definitions_exports, {
  ALL_SETTINGS: () => ALL_SETTINGS,
  SETTINGS_CATEGORIES: () => SETTINGS_CATEGORIES,
  getCategoryMeta: () => getCategoryMeta,
  getSettingById: () => getSettingById,
  getSettingsByCategory: () => getSettingsByCategory
});
module.exports = __toCommonJS(definitions_exports);
const SETTINGS_CATEGORIES = [
  { id: "overview", label: "Overview", emoji: "\u{1F3E0}" },
  { id: "moderation", label: "Moderation", emoji: "\u{1F6E1}\uFE0F" },
  { id: "support", label: "Support", emoji: "\u{1F3AB}" },
  { id: "reports", label: "Reports", emoji: "\u{1F6A8}" },
  { id: "appeals", label: "Appeals", emoji: "\u{1F528}" },
  { id: "ai", label: "AI", emoji: "\u{1F916}" },
  { id: "social", label: "AI Social", emoji: "\u{1F4AC}" },
  { id: "personality", label: "Personality", emoji: "\u{1F3AD}" },
  { id: "logging", label: "Logging", emoji: "\u{1F4CB}" },
  { id: "staff", label: "Staff", emoji: "\u{1F465}" },
  { id: "audit", label: "Audit/Logs", emoji: "\u{1F4DC}" }
];
const ALL_SETTINGS = [
  // ── Moderation ──
  {
    id: "moderation.enabled",
    label: "Moderation Enabled",
    description: "Enable or disable the moderation system",
    type: "boolean",
    category: "moderation",
    path: "moderation.enabled",
    defaultValue: true
  },
  {
    id: "moderation.defaultTimeoutMinutes",
    label: "Default Timeout (minutes)",
    description: "Default timeout duration in minutes (1-40320)",
    type: "number",
    category: "moderation",
    path: "moderation.defaultTimeoutMinutes",
    defaultValue: 5,
    min: 1,
    max: 40320
  },
  {
    id: "moderation.maxWarnBeforeAction",
    label: "Max Warnings Before Action",
    description: "Number of warnings before automatic action (1-50)",
    type: "number",
    category: "moderation",
    path: "moderation.maxWarnBeforeAction",
    defaultValue: 3,
    min: 1,
    max: 50
  },
  {
    id: "moderation.autoBanOnMaxWarn",
    label: "Auto Ban on Max Warn",
    description: "Automatically ban when max warnings reached",
    type: "boolean",
    category: "moderation",
    path: "moderation.autoBanOnMaxWarn",
    defaultValue: false
  },
  // ── Support ──
  {
    id: "support.enabled",
    label: "Support Enabled",
    description: "Enable or disable the support ticket system",
    type: "boolean",
    category: "support",
    path: "support.enabled",
    defaultValue: false
  },
  {
    id: "support.channelId",
    label: "Support Channel",
    description: "Channel where users open support tickets",
    type: "channel",
    category: "support",
    path: "support.channelId",
    defaultValue: void 0,
    channelTypes: ["Text"]
  },
  {
    id: "support.categoryId",
    label: "Support Category",
    description: "Category for support ticket channels",
    type: "channel",
    category: "support",
    path: "support.categoryId",
    defaultValue: void 0,
    channelTypes: ["Category"]
  },
  {
    id: "support.allowGeneralHelp",
    label: "Allow General Help",
    description: "Allow general help requests in support",
    type: "boolean",
    category: "support",
    path: "support.allowGeneralHelp",
    defaultValue: true
  },
  {
    id: "support.allowReports",
    label: "Allow Reports via Support",
    description: "Allow report submissions through the support system",
    type: "boolean",
    category: "support",
    path: "support.allowReports",
    defaultValue: true
  },
  {
    id: "support.allowAppeals",
    label: "Allow Appeals via Support",
    description: "Allow ban appeals through the support system",
    type: "boolean",
    category: "support",
    path: "support.allowAppeals",
    defaultValue: true
  },
  // ── Reports ──
  {
    id: "reports.enabled",
    label: "Reports Enabled",
    description: "Enable or disable the user report system",
    type: "boolean",
    category: "reports",
    path: "reports.enabled",
    defaultValue: false
  },
  {
    id: "reports.categoryId",
    label: "Report Category",
    description: "Category for report ticket channels",
    type: "channel",
    category: "reports",
    path: "reports.categoryId",
    defaultValue: void 0,
    channelTypes: ["Category"]
  },
  {
    id: "reports.requireEvidence",
    label: "Require Evidence",
    description: "Require evidence when submitting a report",
    type: "boolean",
    category: "reports",
    path: "reports.requireEvidence",
    defaultValue: false
  },
  {
    id: "reports.aiAnalysisEnabled",
    label: "AI Analysis",
    description: "Use AI to analyze reports",
    type: "boolean",
    category: "reports",
    path: "reports.aiAnalysisEnabled",
    defaultValue: true
  },
  {
    id: "reports.autoEscalateHighRisk",
    label: "Auto Escalate High Risk",
    description: "Automatically escalate high-risk reports",
    type: "boolean",
    category: "reports",
    path: "reports.autoEscalateHighRisk",
    defaultValue: true
  },
  // ── Appeals ──
  {
    id: "appeals.enabled",
    label: "Appeals Enabled",
    description: "Enable or disable the ban appeal system",
    type: "boolean",
    category: "appeals",
    path: "appeals.enabled",
    defaultValue: false
  },
  {
    id: "appeals.categoryId",
    label: "Appeal Category",
    description: "Category for appeal ticket channels",
    type: "channel",
    category: "appeals",
    path: "appeals.categoryId",
    defaultValue: void 0,
    channelTypes: ["Category"]
  },
  {
    id: "appeals.aiAnalysisEnabled",
    label: "AI Analysis",
    description: "Use AI to analyze ban appeals",
    type: "boolean",
    category: "appeals",
    path: "appeals.aiAnalysisEnabled",
    defaultValue: true
  },
  // ── AI ──
  {
    id: "supportAi.enabled",
    label: "AI Enabled",
    description: "Enable AI assistance in support cases",
    type: "boolean",
    category: "ai",
    path: "supportAi.enabled",
    defaultValue: true
  },
  {
    id: "supportAi.allowModerationActions",
    label: "Allow Mod Actions",
    description: "Allow AI to perform moderation actions",
    type: "boolean",
    category: "ai",
    path: "supportAi.allowModerationActions",
    defaultValue: false
  },
  {
    id: "supportAi.requireConfirmation",
    label: "Require Confirmation",
    description: "Require human confirmation before AI takes action",
    type: "boolean",
    category: "ai",
    path: "supportAi.requireConfirmation",
    defaultValue: true
  },
  {
    id: "supportAi.allowWebResearch",
    label: "Allow Web Research",
    description: "Allow AI to research topics on the web",
    type: "boolean",
    category: "ai",
    path: "supportAi.allowWebResearch",
    defaultValue: false
  },
  // ── Social ──
  {
    id: "social.enabled",
    label: "AI Social Enabled",
    description: "Enable AI Social mode (autonomous conversation participation)",
    type: "boolean",
    category: "social",
    path: "social.enabled",
    defaultValue: false
  },
  {
    id: "social.globalCooldownMs",
    label: "Global Cooldown (ms)",
    description: "Minimum time between any social responses (10000-300000ms)",
    type: "number",
    category: "social",
    path: "social.globalCooldownMs",
    defaultValue: 3e4,
    min: 1e4,
    max: 3e5
  },
  {
    id: "social.maxResponsesPerHour",
    label: "Max Responses Per Hour",
    description: "Maximum social responses per hour across all channels (1-50)",
    type: "number",
    category: "social",
    path: "social.maxResponsesPerHour",
    defaultValue: 10,
    min: 1,
    max: 50
  },
  // ── Personality ──
  {
    id: "personality.name",
    label: "Bot Name",
    description: "How the bot refers to itself (1-50 characters)",
    type: "string",
    category: "personality",
    path: "personality.name",
    defaultValue: "AshenAI",
    min: 1,
    max: 50
  },
  {
    id: "personality.tone",
    label: "Tone",
    description: "Default tone: professional, casual, friendly, neutral, or stern",
    type: "string",
    category: "personality",
    path: "personality.tone",
    defaultValue: "friendly",
    min: 1,
    max: 30
  },
  // ── Logging ──
  {
    id: "supportLogging.enabled",
    label: "Logging Enabled",
    description: "Enable support event logging",
    type: "boolean",
    category: "logging",
    path: "supportLogging.enabled",
    defaultValue: false
  },
  {
    id: "supportLogging.channelId",
    label: "Log Channel",
    description: "Channel for support event logs",
    type: "channel",
    category: "logging",
    path: "supportLogging.channelId",
    defaultValue: void 0,
    channelTypes: ["Text"]
  },
  {
    id: "supportLogging.includeModeration",
    label: "Log Moderation Events",
    description: "Log moderation actions to the log channel",
    type: "boolean",
    category: "logging",
    path: "supportLogging.includeModeration",
    defaultValue: true
  },
  {
    id: "supportLogging.includeTickets",
    label: "Log Ticket Events",
    description: "Log support ticket events",
    type: "boolean",
    category: "logging",
    path: "supportLogging.includeTickets",
    defaultValue: true
  },
  {
    id: "supportLogging.includeReports",
    label: "Log Report Events",
    description: "Log report events",
    type: "boolean",
    category: "logging",
    path: "supportLogging.includeReports",
    defaultValue: true
  },
  {
    id: "supportLogging.includeAppeals",
    label: "Log Appeal Events",
    description: "Log appeal events",
    type: "boolean",
    category: "logging",
    path: "supportLogging.includeAppeals",
    defaultValue: true
  },
  {
    id: "supportLogging.includeAiActions",
    label: "Log AI Actions",
    description: "Log AI actions in support cases",
    type: "boolean",
    category: "logging",
    path: "supportLogging.includeAiActions",
    defaultValue: true
  }
];
function getSettingsByCategory(category) {
  return ALL_SETTINGS.filter((s) => s.category === category);
}
function getSettingById(id) {
  return ALL_SETTINGS.find((s) => s.id === id);
}
function getCategoryMeta(category) {
  return SETTINGS_CATEGORIES.find((c) => c.id === category);
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  ALL_SETTINGS,
  SETTINGS_CATEGORIES,
  getCategoryMeta,
  getSettingById,
  getSettingsByCategory
});
