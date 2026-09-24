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
var executor_exports = {};
__export(executor_exports, {
  createActionPlan: () => createActionPlan,
  executeTool: () => executeTool,
  validateBatch: () => validateBatch
});
module.exports = __toCommonJS(executor_exports);
var import_node_crypto = require("node:crypto");
var import_logger = require("../../logger");
var import_sanitize = require("../../security/sanitize");
var import_channel_scope = require("./channel-scope");
var import_validator = require("./validator");
var import_audit2 = require("./audit");
var import_registry = require("./registry");
var import_tool_rate_limit = require("./tool-rate-limit");
let planCounter = 0;
function createActionPlan(context, riskLevel, changes, requiresConfirmation) {
  const id = `plan_${Date.now().toString(36)}_${++planCounter}`;
  const argsForHash = { ...context.arguments };
  delete argsForHash._toolName;
  delete argsForHash._sessionId;
  const argsHash = (0, import_node_crypto.createHash)("sha256").update(JSON.stringify(argsForHash)).digest("hex").slice(0, 16);
  const sessionId = typeof context.arguments._sessionId === "string" ? context.arguments._sessionId : void 0;
  return {
    id,
    guildId: context.guildId,
    channelId: context.channelId,
    requesterId: context.requesterId,
    toolName: context.arguments._toolName || "unknown",
    arguments: context.arguments,
    riskLevel,
    changes,
    requiresConfirmation,
    createdAt: Date.now(),
    expiresAt: Date.now() + 5 * 60 * 1e3,
    // 5 minutes
    sessionId,
    argumentsHash: argsHash
  };
}
async function executeTool(toolName, context, options = {}) {
  const startTime = Date.now();
  const dryRun = options.dryRun ?? false;
  const skipRateLimit = options.skipRateLimit ?? false;
  const tool = import_registry.toolRegistry.get(toolName);
  if (!tool) {
    const result = {
      status: "denied",
      message: `Tool "${toolName}" is not registered.`,
      denialReason: "TOOL_NOT_ALLOWED"
    };
    (0, import_audit2.recordToolAudit)(context, "denied", result.denialReason, startTime, dryRun);
    return result;
  }
  const guildConfig = (0, import_channel_scope.loadGuildAIConfig)(context.guildId);
  const validation = (0, import_validator.validateToolRequest)(tool, context, guildConfig, skipRateLimit);
  if (!validation.allowed) {
    const result = {
      status: validation.denialReason === "RATE_LIMITED" ? "rate_limited" : "denied",
      message: validation.message || "Access denied.",
      denialReason: validation.denialReason
    };
    (0, import_audit2.recordToolAudit)(context, result.status, result.denialReason, startTime, dryRun);
    return result;
  }
  if (!dryRun && !skipRateLimit && !tool.confirmationRequired) {
    try {
      const consumed = import_tool_rate_limit.toolRateLimiter.reserve(
        context.guildId,
        context.requesterId,
        context.requesterRole,
        "pending",
        toolName
      );
      if (!consumed) {
        const isMutation = tool.riskLevel !== "safe" && tool.riskLevel !== "low";
        if (isMutation) {
          const result = {
            status: "rate_limited",
            message: "Rate limit exceeded for this action. Try again later.",
            denialReason: "RATE_LIMITED"
          };
          (0, import_audit2.recordToolAudit)(context, "rate_limited", "RATE_LIMITED", startTime, dryRun);
          return result;
        }
        import_logger.logger.warn(
          `Rate limit check failed for read-only tool ${toolName} in guild=${context.guildId} \u2014 failing open`
        );
      }
    } catch (error) {
      const isMutation = tool.riskLevel !== "safe" && tool.riskLevel !== "low";
      if (isMutation) {
        import_logger.logger.error(`Rate limiter error for mutation tool ${toolName}: ${error instanceof Error ? error.message : String(error)}`);
        const result = {
          status: "error",
          message: "Rate limit service unavailable. Action blocked for safety.",
          denialReason: "RATE_LIMITED"
        };
        (0, import_audit2.recordToolAudit)(context, "error", "RATE_LIMITED", startTime, dryRun);
        return result;
      }
      import_logger.logger.warn(
        `Rate limiter error for read-only tool ${toolName} \u2014 failing open: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
  if (dryRun) {
    const plan = createActionPlan(
      context,
      tool.riskLevel,
      [{
        type: "create",
        target: toolName,
        description: `Execute ${toolName} (dry run)`
      }],
      tool.confirmationRequired
    );
    const result = {
      status: "success",
      message: `\u{1F4CB} **PLAN ONLY** \u2014 No changes were made.
Tool: ${toolName}
Risk: ${tool.riskLevel}`,
      plan
    };
    (0, import_audit2.recordToolAudit)(context, "success", void 0, startTime, dryRun);
    return result;
  }
  if (tool.confirmationRequired && !options.skipConfirmation) {
    const plan = createActionPlan(
      context,
      tool.riskLevel,
      [{
        type: "create",
        target: toolName,
        description: `Execute ${toolName}`
      }],
      true
    );
    try {
      import_tool_rate_limit.toolRateLimiter.reserve(
        context.guildId,
        context.requesterId,
        context.requesterRole,
        plan.id,
        toolName
      );
    } catch {
      import_logger.logger.warn(`Failed to create rate limit reservation for plan ${plan.id}`);
    }
    const result = {
      status: "confirmation_required",
      message: `\u26A0\uFE0F **Confirm Action**
Action: ${toolName}
Risk: ${tool.riskLevel.toUpperCase()}
Channel: <#${context.channelId}>

This action requires confirmation.`,
      plan
    };
    (0, import_audit2.recordToolAudit)(context, "confirmation_required", void 0, startTime, dryRun);
    return result;
  }
  try {
    const result = await tool.execute(context);
    const durationMs = Date.now() - startTime;
    (0, import_audit2.recordToolAudit)(context, result.status, result.denialReason, startTime, dryRun);
    import_logger.logger.info(
      `Tool executed: ${toolName} [${result.status}] in guild=${context.guildId} by=${context.requesterId} (${durationMs}ms)`
    );
    return result;
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    import_logger.logger.error(`Tool execution failed: ${toolName} \u2014 ${errorMessage}`);
    (0, import_audit2.recordToolAudit)(context, "error", void 0, startTime, dryRun);
    return {
      status: "error",
      message: (0, import_sanitize.sanitizeToolError)(toolName, error)
    };
  }
}
function validateBatch(items) {
  return items.map(({ toolName, context }) => {
    const tool = import_registry.toolRegistry.get(toolName);
    if (!tool) {
      return {
        toolName,
        allowed: false,
        denialReason: "TOOL_NOT_ALLOWED",
        message: `Tool "${toolName}" is not registered.`
      };
    }
    const guildConfig = (0, import_channel_scope.loadGuildAIConfig)(context.guildId);
    const validation = (0, import_validator.validateToolRequest)(tool, context, guildConfig);
    return {
      toolName,
      allowed: validation.allowed,
      denialReason: validation.denialReason,
      message: validation.message
    };
  });
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  createActionPlan,
  executeTool,
  validateBatch
});
