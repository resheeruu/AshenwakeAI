import type { AshenRole } from "../../security/permissions";
import type { RiskLevel } from "../../security/risk-engine";

/* ================================================================
 * CHANNEL SCOPES
 * ================================================================ */

export type ChannelScope =
  | "AI_CHAT"
  | "AI_MANAGEMENT"
  | "AI_MUSIC"
  | "AI_GAMES";

/* ================================================================
 * TOOL DEFINITION
 * ================================================================ */

export interface ToolParameter {
  name: string;
  type: "string" | "number" | "boolean" | "channel" | "user" | "role";
  description: string;
  required: boolean;
  defaultValue?: unknown;
  allowedValues?: unknown[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  category: string;
  requiredRole: AshenRole;
  requiredDiscordPermissions: string[];
  allowedScopes: ChannelScope[];
  confirmationRequired: boolean;
  riskLevel: RiskLevel;
  parameters: ToolParameter[];
  execute: (context: ToolContext) => Promise<ToolResult>;
}

/* ================================================================
 * TOOL CONTEXT (passed to every tool execution)
 * ================================================================ */

export interface ToolContext {
  guildId: string;
  channelId: string;
  requesterId: string;
  requesterName: string;
  requesterRole: AshenRole;
  arguments: Record<string, unknown>;
  dryRun: boolean;
  confirmationId?: string;
}

/* ================================================================
 * TOOL RESULT
 * ================================================================ */

export type ToolResultStatus =
  | "success"
  | "denied"
  | "validation_error"
  | "confirmation_required"
  | "risk_blocked"
  | "scope_denied"
  | "rate_limited"
  | "error";

export interface ToolResult {
  status: ToolResultStatus;
  message: string;
  denialReason?: DenialReason;
  plan?: ActionPlan;
  data?: unknown;
}

/* ================================================================
 * DENIAL REASONS
 * ================================================================ */

export type DenialReason =
  | "CHANNEL_NOT_ALLOWED"
  | "INSUFFICIENT_ROLE"
  | "MISSING_DISCORD_PERMISSION"
  | "AI_MANAGEMENT_DISABLED"
  | "TOOL_NOT_ALLOWED"
  | "CONFIRMATION_REQUIRED"
  | "INVALID_ARGUMENTS"
  | "GUILD_ONLY"
  | "RATE_LIMITED"
  | "RISK_BLOCKED"
  | "DRY_RUN_ONLY"
  | "CHANNEL_ALREADY_EXISTS"
  | "CATEGORY_ALREADY_EXISTS"
  | "RESOURCE_NOT_FOUND"
  | "CONFIRMATION_EXPIRED"
  | "CONFIRMATION_INVALID"
  | "ALREADY_EXECUTED"
  | "PROTECTED_RESOURCE";

/* ================================================================
 * ACTION PLAN (for dry-run / confirmation)
 * ================================================================ */

export interface ActionPlanChange {
  type: "create" | "modify" | "delete" | "assign" | "remove";
  target: string;
  description: string;
  before?: string;
  after?: string;
  permissions?: string;
}

export interface ActionPlan {
  id: string;
  guildId: string;
  channelId: string;
  requesterId: string;
  toolName: string;
  arguments: Record<string, unknown>;
  riskLevel: RiskLevel;
  changes: ActionPlanChange[];
  requiresConfirmation: boolean;
  createdAt: number;
  expiresAt: number;
}

/* ================================================================
 * TOOL AUDIT ENTRY
 * ================================================================ */

export interface ToolAuditEntry {
  id: string;
  timestamp: number;
  guildId: string;
  channelId: string;
  requesterId: string;
  requesterName: string;
  toolName: string;
  riskLevel: RiskLevel;
  result: ToolResultStatus;
  denialReason?: DenialReason;
  durationMs?: number;
  dryRun: boolean;
}
