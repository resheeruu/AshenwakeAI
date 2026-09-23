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
var policy_templates_exports = {};
__export(policy_templates_exports, {
  VALID_TEMPLATES: () => VALID_TEMPLATES,
  applyTemplate: () => applyTemplate,
  getAllTemplateDefinitions: () => getAllTemplateDefinitions,
  getProhibitedPermissions: () => getProhibitedPermissions,
  getTemplateDefinition: () => getTemplateDefinition,
  getValidTemplateNames: () => getValidTemplateNames,
  isValidTemplate: () => isValidTemplate,
  templateHasProhibitedPermissions: () => templateHasProhibitedPermissions
});
module.exports = __toCommonJS(policy_templates_exports);
var import_policy_engine = require("./policy-engine");
const VALID_TEMPLATES = [
  "community",
  "gaming",
  "moderated",
  "staff-managed",
  "private"
];
const PROHIBITED_PERMISSIONS = [
  "Administrator",
  "ManageGuild",
  "ManageRoles",
  "ManageChannels",
  "BanMembers",
  "KickMembers",
  "MentionEveryone"
];
function getProhibitedPermissions() {
  return [...PROHIBITED_PERMISSIONS];
}
function isValidTemplate(name) {
  return VALID_TEMPLATES.includes(name);
}
function getValidTemplateNames() {
  return [...VALID_TEMPLATES];
}
const COMMUNITY_RULES = [
  {
    type: "required_channel",
    enabled: true,
    description: "Server must have an announcements channel",
    requiredName: "announcements",
    expectedType: "announcement",
    riskIfViolated: "medium"
  },
  {
    type: "channel_type",
    enabled: true,
    description: "#announcements must be an announcement channel",
    channelPattern: "#announcements",
    expectedType: "announcement",
    riskIfViolated: "medium"
  },
  {
    type: "channel_permission",
    enabled: true,
    description: "#announcements: @everyone must not send messages",
    channelPattern: "#announcements",
    permission: "SendMessages",
    permissionOp: "must_deny",
    riskIfViolated: "high"
  },
  {
    type: "channel_permission",
    enabled: true,
    description: "#announcements: @everyone must view channel",
    channelPattern: "#announcements",
    permission: "ViewChannel",
    permissionOp: "must_allow",
    riskIfViolated: "medium"
  },
  {
    type: "required_channel",
    enabled: true,
    description: "Server must have a general chat channel",
    requiredName: "general",
    riskIfViolated: "low"
  },
  {
    type: "channel_permission",
    enabled: true,
    description: "#general: @everyone must be able to send messages",
    channelPattern: "#general",
    permission: "SendMessages",
    permissionOp: "must_allow",
    riskIfViolated: "medium"
  }
];
const GAMING_RULES = [
  {
    type: "required_category",
    enabled: true,
    description: "Server must have a 'Voice' category",
    requiredName: "Voice",
    riskIfViolated: "low"
  },
  {
    type: "required_category",
    enabled: true,
    description: "Server must have a 'Text' category",
    requiredName: "Text",
    riskIfViolated: "low"
  },
  {
    type: "category_protected",
    enabled: true,
    description: "Voice category should be protected",
    categoryPattern: "Voice",
    riskIfViolated: "high"
  },
  {
    type: "channel_permission",
    enabled: true,
    description: "Voice channels: @everyone must be able to connect",
    channelPattern: "#*",
    permission: "Connect",
    permissionOp: "allow",
    riskIfViolated: "low"
  }
];
const MODERATED_RULES = [
  {
    type: "required_channel",
    enabled: true,
    description: "Server must have a #moderation channel",
    requiredName: "moderation",
    riskIfViolated: "high"
  },
  {
    type: "required_channel",
    enabled: true,
    description: "Server must have a #mod-logs channel",
    requiredName: "mod-logs",
    riskIfViolated: "high"
  },
  {
    type: "required_channel",
    enabled: true,
    description: "Server must have an #announcements channel",
    requiredName: "announcements",
    riskIfViolated: "medium"
  },
  {
    type: "channel_permission",
    enabled: true,
    description: "#moderation: @everyone must not send messages",
    channelPattern: "#moderation",
    permission: "SendMessages",
    permissionOp: "must_deny",
    riskIfViolated: "critical"
  },
  {
    type: "channel_permission",
    enabled: true,
    description: "#mod-logs: @everyone must not send messages",
    channelPattern: "#mod-logs",
    permission: "SendMessages",
    permissionOp: "must_deny",
    riskIfViolated: "critical"
  },
  {
    type: "channel_type",
    enabled: true,
    description: "#announcements must be announcement type",
    channelPattern: "#announcements",
    expectedType: "announcement",
    riskIfViolated: "medium"
  }
];
const STAFF_MANAGED_RULES = [
  {
    type: "required_channel",
    enabled: true,
    description: "Server must have a #staff channel",
    requiredName: "staff",
    riskIfViolated: "critical"
  },
  {
    type: "required_channel",
    enabled: true,
    description: "Server must have a #admin channel",
    requiredName: "admin",
    riskIfViolated: "critical"
  },
  {
    type: "channel_permission",
    enabled: true,
    description: "#staff: @everyone must not view channel",
    channelPattern: "#staff",
    permission: "ViewChannel",
    permissionOp: "must_deny",
    riskIfViolated: "critical"
  },
  {
    type: "channel_permission",
    enabled: true,
    description: "#admin: @everyone must not view channel",
    channelPattern: "#admin",
    permission: "ViewChannel",
    permissionOp: "must_deny",
    riskIfViolated: "critical"
  },
  {
    type: "category_protected",
    enabled: true,
    description: "Staff category should be protected",
    categoryPattern: "Staff",
    riskIfViolated: "high"
  }
];
const PRIVATE_RULES = [
  {
    type: "channel_restricted",
    enabled: true,
    description: "All text channels: @everyone must not have default access",
    channelPattern: "#*",
    permission: "ViewChannel",
    riskIfViolated: "high"
  },
  {
    type: "required_channel",
    enabled: true,
    description: "Server must have a #rules channel",
    requiredName: "rules",
    riskIfViolated: "medium"
  }
];
const TEMPLATES = {
  community: {
    name: "community",
    description: "Standard community server with public channels, announcements, and general chat.",
    rules: COMMUNITY_RULES
  },
  gaming: {
    name: "gaming",
    description: "Gaming server with voice channels, game categories, and team coordination.",
    rules: GAMING_RULES
  },
  moderated: {
    name: "moderated",
    description: "Moderation-focused server with mod channels, logs, and strict permissions.",
    rules: MODERATED_RULES
  },
  "staff-managed": {
    name: "staff-managed",
    description: "Staff-only server with restricted channels and protected categories.",
    rules: STAFF_MANAGED_RULES
  },
  private: {
    name: "private",
    description: "Private server with restricted access and minimal public channels.",
    rules: PRIVATE_RULES
  }
};
function getTemplateDefinition(name) {
  return TEMPLATES[name];
}
function getAllTemplateDefinitions() {
  return Object.values(TEMPLATES);
}
function applyTemplate(templateName, guildId) {
  const template = TEMPLATES[templateName];
  const now = Date.now();
  const rules = template.rules.map((r) => ({
    ...r,
    id: (0, import_policy_engine.generateRuleId)()
  }));
  return {
    id: `policy_${guildId}`,
    guildId,
    name: `${template.description.split(".")[0]} Policy`,
    description: `Governance policy based on the "${templateName}" template. ${template.description}`,
    template: templateName,
    rules,
    protectedChannels: [],
    protectedCategories: [],
    exemptChannels: [],
    exemptCategories: [],
    driftDetection: {
      enabled: true,
      intervalMs: 36e5
    },
    version: 1,
    createdAt: now,
    updatedAt: now
  };
}
function templateHasProhibitedPermissions(templateName) {
  const template = TEMPLATES[templateName];
  if (!template) return false;
  for (const rule of template.rules) {
    if (rule.permission && PROHIBITED_PERMISSIONS.includes(rule.permission)) {
      return true;
    }
  }
  return false;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  VALID_TEMPLATES,
  applyTemplate,
  getAllTemplateDefinitions,
  getProhibitedPermissions,
  getTemplateDefinition,
  getValidTemplateNames,
  isValidTemplate,
  templateHasProhibitedPermissions
});
