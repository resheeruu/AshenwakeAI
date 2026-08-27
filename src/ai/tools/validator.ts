import type { AshenRole } from "../../security/permissions";
import { hasPermission } from "../../security/permissions";
import type { GuildAIConfig } from "./channel-scope";
import type {
  ToolDefinition,
  ToolContext,
  ToolResult,
  DenialReason,
} from "./types";

/* ================================================================
 * VALIDATION RESULT
 * ================================================================ */

export interface ValidationResult {
  allowed: boolean;
  denialReason?: DenialReason;
  message?: string;
}

/* ================================================================
 * TOOL ARGUMENT VALIDATION
 * ================================================================ */

export function validateArguments(
  tool: ToolDefinition,
  args: Record<string, unknown>,
): ValidationResult {
  for (const param of tool.parameters) {
    const value = args[param.name];

    if (param.required && (value === undefined || value === null || value === "")) {
      return {
        allowed: false,
        denialReason: "INVALID_ARGUMENTS",
        message: `Missing required parameter: ${param.name}`,
      };
    }

    if (value !== undefined && value !== null && param.allowedValues) {
      if (!param.allowedValues.includes(value)) {
        return {
          allowed: false,
          denialReason: "INVALID_ARGUMENTS",
          message: `Invalid value for ${param.name}. Allowed: ${param.allowedValues.join(", ")}`,
        };
      }
    }
  }

  return { allowed: true };
}

/* ================================================================
 * ROLE VALIDATION
 * ================================================================ */

export function validateRole(
  tool: ToolDefinition,
  requesterRole: AshenRole,
): ValidationResult {
  const check = hasPermission(requesterRole, tool.requiredRole);
  if (check.allowed) return { allowed: true };

  return {
    allowed: false,
    denialReason: "INSUFFICIENT_ROLE",
    message: check.reason,
  };
}

/* ================================================================
 * CHANNEL SCOPE VALIDATION
 * ================================================================ */

export function validateChannelScope(
  tool: ToolDefinition,
  channelId: string,
  guildConfig: GuildAIConfig,
): ValidationResult {
  if (!guildConfig.enabled) {
    return {
      allowed: false,
      denialReason: "AI_MANAGEMENT_DISABLED",
      message: "AI management is disabled for this server.",
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
      message:
        `This channel is not configured for AI management.\n` +
        `Use an allowed channel or ask an admin to configure one.`,
    };
  }

  const hasMatchingScope = tool.allowedScopes.some((required) =>
    channelScopes.includes(required),
  );

  if (!hasMatchingScope) {
    return {
      allowed: false,
      denialReason: "CHANNEL_NOT_ALLOWED",
      message:
        `This channel does not have the required scope.\n` +
        `Required: ${tool.allowedScopes.join(" or ")}\n` +
        `Current: ${channelScopes.join(", ")}`,
    };
  }

  return { allowed: true };
}

/* ================================================================
 * RISK VALIDATION
 * ================================================================ */

export function validateRisk(
  tool: ToolDefinition,
  isBotOwner: boolean,
): ValidationResult {
  if (isBotOwner) {
    return { allowed: true };
  }

  if (
    (tool.riskLevel === "critical" || tool.riskLevel === "high") &&
    tool.confirmationRequired
  ) {
    return {
      allowed: false,
      denialReason: "RISK_BLOCKED",
      message:
        `⚠️ **Confirm Action**\n` +
        `Action: ${tool.name}\n` +
        `Risk: ${tool.riskLevel.toUpperCase()}\n\n` +
        `This action requires confirmation.`,
    };
  }

  return { allowed: true };
}

/* ================================================================
 * FULL VALIDATION PIPELINE
 * ================================================================ */

export interface FullValidationResult {
  allowed: boolean;
  tool: ToolDefinition;
  denialReason?: DenialReason;
  message?: string;
  riskRequiresConfirmation: boolean;
}

export function validateToolRequest(
  tool: ToolDefinition,
  context: ToolContext,
  guildConfig: GuildAIConfig,
  isBotOwner: boolean,
): FullValidationResult {
  const base = {
    tool,
    riskRequiresConfirmation: false,
  };

  // 1. Argument validation
  const argsCheck = validateArguments(tool, context.arguments);
  if (!argsCheck.allowed) {
    return { ...base, allowed: false, denialReason: argsCheck.denialReason, message: argsCheck.message };
  }

  // 2. Role validation
  const roleCheck = validateRole(tool, context.requesterRole);
  if (!roleCheck.allowed) {
    return { ...base, allowed: false, denialReason: roleCheck.denialReason, message: roleCheck.message };
  }

  // 3. Channel scope validation
  const scopeCheck = validateChannelScope(tool, context.channelId, guildConfig);
  if (!scopeCheck.allowed) {
    return { ...base, allowed: false, denialReason: scopeCheck.denialReason, message: scopeCheck.message };
  }

  // 4. Risk validation
  const riskCheck = validateRisk(tool, isBotOwner);
  if (!riskCheck.allowed) {
    return {
      ...base,
      allowed: false,
      denialReason: riskCheck.denialReason,
      message: riskCheck.message,
      riskRequiresConfirmation: tool.confirmationRequired,
    };
  }

  return { ...base, allowed: true };
}
