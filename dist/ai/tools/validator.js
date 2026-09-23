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
var validator_exports = {};
__export(validator_exports, {
  validateArguments: () => validateArguments,
  validateChannelScope: () => validateChannelScope,
  validateRateLimit: () => validateRateLimit,
  validateRisk: () => validateRisk,
  validateRole: () => validateRole,
  validateToolRequest: () => validateToolRequest
});
module.exports = __toCommonJS(validator_exports);
var import_permissions = require("../../security/permissions");
var import_tool_rate_limit = require("./tool-rate-limit");
function validateArguments(tool, args) {
  for (const param of tool.parameters) {
    const value = args[param.name];
    if (param.required && (value === void 0 || value === null || value === "")) {
      return {
        allowed: false,
        denialReason: "INVALID_ARGUMENTS",
        message: `Missing required parameter: ${param.name}`
      };
    }
    if (value !== void 0 && value !== null && param.allowedValues) {
      if (!param.allowedValues.includes(value)) {
        return {
          allowed: false,
          denialReason: "INVALID_ARGUMENTS",
          message: `Invalid value for ${param.name}. Allowed: ${param.allowedValues.join(", ")}`
        };
      }
    }
  }
  return { allowed: true };
}
function validateRole(tool, requesterRole) {
  const check = (0, import_permissions.hasPermission)(requesterRole, tool.requiredRole);
  if (check.allowed) return { allowed: true };
  return {
    allowed: false,
    denialReason: "INSUFFICIENT_ROLE",
    message: check.reason
  };
}
function validateChannelScope(tool, channelId, guildConfig) {
  if (!guildConfig.enabled) {
    return {
      allowed: false,
      denialReason: "AI_MANAGEMENT_DISABLED",
      message: "AI management is disabled for this server."
    };
  }
  if (tool.allowedScopes.length === 0) {
    return { allowed: true };
  }
  const channelScopes = guildConfig.channelScopes[channelId];
  if (!channelScopes || channelScopes.length === 0) {
    return {
      allowed: false,
      denialReason: "CHANNEL_NOT_ALLOWED",
      message: `This channel is not configured for AI management.
Use an allowed channel or ask an admin to configure one.`
    };
  }
  const hasMatchingScope = tool.allowedScopes.some(
    (required) => channelScopes.includes(required)
  );
  if (!hasMatchingScope) {
    return {
      allowed: false,
      denialReason: "CHANNEL_NOT_ALLOWED",
      message: `This channel does not have the required scope.
Required: ${tool.allowedScopes.join(" or ")}
Current: ${channelScopes.join(", ")}`
    };
  }
  return { allowed: true };
}
function validateRisk(tool, isBotOwner) {
  if (isBotOwner) {
    return { allowed: true };
  }
  if ((tool.riskLevel === "critical" || tool.riskLevel === "high") && tool.confirmationRequired) {
    return {
      allowed: false,
      denialReason: "RISK_BLOCKED",
      message: `\u26A0\uFE0F **Confirm Action**
Action: ${tool.name}
Risk: ${tool.riskLevel.toUpperCase()}

This action requires confirmation.`
    };
  }
  return { allowed: true };
}
function validateRateLimit(tool, context) {
  if (context.requesterRole === "owner") {
    return { allowed: true };
  }
  const result = import_tool_rate_limit.toolRateLimiter.isLimited(
    context.guildId,
    context.requesterId,
    context.requesterRole,
    tool.name
  );
  if (!result.allowed) {
    const retrySeconds = Math.ceil(result.retryAfterMs / 1e3);
    return {
      allowed: false,
      denialReason: "RATE_LIMITED",
      message: `Rate limit exceeded for this action.
Try again in ${retrySeconds} second${retrySeconds !== 1 ? "s" : ""}.`
    };
  }
  return { allowed: true };
}
function validateToolRequest(tool, context, guildConfig, isBotOwner, skipRateLimit = false) {
  const base = {
    tool,
    riskRequiresConfirmation: false
  };
  const argsCheck = validateArguments(tool, context.arguments);
  if (!argsCheck.allowed) {
    return { ...base, allowed: false, denialReason: argsCheck.denialReason, message: argsCheck.message };
  }
  const roleCheck = validateRole(tool, context.requesterRole);
  if (!roleCheck.allowed) {
    return { ...base, allowed: false, denialReason: roleCheck.denialReason, message: roleCheck.message };
  }
  const scopeCheck = validateChannelScope(tool, context.channelId, guildConfig);
  if (!scopeCheck.allowed) {
    return { ...base, allowed: false, denialReason: scopeCheck.denialReason, message: scopeCheck.message };
  }
  const riskCheck = validateRisk(tool, isBotOwner);
  if (!riskCheck.allowed) {
    return {
      ...base,
      allowed: false,
      denialReason: riskCheck.denialReason,
      message: riskCheck.message,
      riskRequiresConfirmation: tool.confirmationRequired
    };
  }
  if (!skipRateLimit) {
    const rateLimitCheck = validateRateLimit(tool, context);
    if (!rateLimitCheck.allowed) {
      return { ...base, allowed: false, denialReason: rateLimitCheck.denialReason, message: rateLimitCheck.message };
    }
  }
  return { ...base, allowed: true };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  validateArguments,
  validateChannelScope,
  validateRateLimit,
  validateRisk,
  validateRole,
  validateToolRequest
});
