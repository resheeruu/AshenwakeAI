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
var remediation_exports = {};
__export(remediation_exports, {
  generateRemediationId: () => generateRemediationId,
  generateRemediationPlan: () => generateRemediationPlan
});
module.exports = __toCommonJS(remediation_exports);
var import_protection = require("../discord/protection");
let planCounter = 0;
function generateRemediationId() {
  return `rem_${Date.now().toString(36)}_${++planCounter}`;
}
function generateRemediationPlan(guildId, drift) {
  const steps = generateSteps(guildId, drift);
  if (steps.length === 0) return null;
  const riskLevel = classifyRemediationRisk(drift, steps);
  return {
    id: generateRemediationId(),
    guildId,
    driftEntry: drift,
    steps,
    riskLevel,
    requiresConfirmation: riskLevel !== "low",
    createdAt: Date.now(),
    expiresAt: Date.now() + 5 * 60 * 1e3
  };
}
function generateSteps(guildId, drift) {
  switch (drift.ruleType) {
    case "channel_permission":
      return generatePermissionSteps(guildId, drift);
    case "channel_type":
      return generateTypeSteps(drift);
    case "required_channel":
      return generateMissingChannelSteps(drift);
    case "required_category":
      return generateMissingCategorySteps(drift);
    case "category_protected":
      return generateCategoryProtectionSteps(guildId, drift);
    case "channel_restricted":
      return generateRestrictedSteps(guildId, drift);
    default:
      return [];
  }
}
function generatePermissionSteps(guildId, drift) {
  if (!drift.channelId) return [];
  if ((0, import_protection.isChannelProtected)(guildId, drift.channelId)) return [];
  const isAllow = drift.actual === "allowed" || drift.actual === "neutral";
  const action = isAllow ? "remove_permission" : "add_permission";
  const permission = extractPermissionFromDrift(drift);
  return [{
    action,
    targetId: drift.channelId,
    targetName: `channel ${drift.channelId}`,
    description: `Fix permission drift: ${drift.expected} (was ${drift.actual})`,
    toolName: "manage_channel_permissions",
    toolArgs: {
      channelId: drift.channelId,
      roleId: "role_everyone",
      permission,
      allow: !isAllow
    },
    payload: {
      channelId: drift.channelId,
      permission,
      effect: drift.expected
    }
  }];
}
function generateTypeSteps(drift) {
  if (!drift.channelId) return [];
  return [{
    action: "rename_channel",
    targetId: drift.channelId,
    targetName: `channel ${drift.channelId}`,
    description: `Channel type mismatch: expected ${drift.expected}, found ${drift.actual}. Manual intervention required.`,
    toolName: "rename_channel",
    toolArgs: { channelId: drift.channelId, newName: "manual_rename_required" },
    payload: {
      channelId: drift.channelId,
      note: "Channel type cannot be changed programmatically. Recreate the channel."
    }
  }];
}
function generateMissingChannelSteps(drift) {
  const channelName = drift.expected === "present" ? drift.actual : "unknown";
  return [{
    action: "create_channel",
    targetId: "",
    targetName: channelName,
    description: `Create missing channel: #${channelName}`,
    toolName: "create_channel",
    toolArgs: { name: channelName, type: "text" },
    payload: {
      name: channelName,
      type: "text"
    }
  }];
}
function generateMissingCategorySteps(drift) {
  const catName = drift.expected === "present" ? drift.actual : "unknown";
  return [{
    action: "create_category",
    targetId: "",
    targetName: catName,
    description: `Create missing category: ${catName}`,
    toolName: "create_category",
    toolArgs: { name: catName },
    payload: {
      name: catName,
      type: "category"
    }
  }];
}
function generateCategoryProtectionSteps(guildId, drift) {
  if (!drift.categoryName) return [];
  if ((0, import_protection.isProtectedCategory)(guildId, drift.categoryName)) return [];
  return [{
    action: "modify_permissions",
    targetId: drift.categoryName,
    targetName: `category ${drift.categoryName}`,
    description: `Protect category: ${drift.categoryName}`,
    toolName: "protect_category",
    toolArgs: { categoryId: drift.categoryName },
    payload: {
      categoryId: drift.categoryName,
      action: "protect"
    }
  }];
}
function generateRestrictedSteps(guildId, drift) {
  if (!drift.channelId) return [];
  if ((0, import_protection.isChannelProtected)(guildId, drift.channelId)) return [];
  return [{
    action: "remove_permission",
    targetId: drift.channelId,
    targetName: `channel ${drift.channelId}`,
    description: `Remove restricted permission: ${drift.actual}`,
    toolName: "manage_channel_permissions",
    toolArgs: {
      channelId: drift.channelId,
      roleId: "role_everyone",
      permission: extractPermissionFromDrift(drift),
      allow: false
    },
    payload: {
      channelId: drift.channelId,
      permission: extractPermissionFromDrift(drift),
      effect: "deny"
    }
  }];
}
function classifyRemediationRisk(drift, steps) {
  for (const step of steps) {
    if (step.action === "modify_permissions") return "critical";
    if (step.action === "delete_channel") return "critical";
  }
  const baseSeverity = drift.severity;
  for (const step of steps) {
    if (step.action === "remove_permission" || step.action === "add_permission") {
      if (baseSeverity === "low") return "medium";
    }
    if (step.action === "create_channel" || step.action === "create_category") {
      if (baseSeverity === "low") return "medium";
    }
  }
  return baseSeverity === "none" ? "low" : baseSeverity;
}
function extractPermissionFromDrift(_drift) {
  return "Unknown";
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  generateRemediationId,
  generateRemediationPlan
});
