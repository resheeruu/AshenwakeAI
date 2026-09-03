import type { AshenRole } from "../../security/permissions";
import type { RiskLevel } from "../../security/risk-engine";

/* ================================================================
 * CHANNEL SCOPES
 * ================================================================ */

export type ChannelScope =
  | "AI_CHAT"
  | "AI_MANAGEMENT"
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

export interface ToolRateLimit {
  /** Max requests allowed in the window for this tool */
  maxRequests: number;
  /** Window duration in milliseconds */
  windowMs: number;
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
  /** Optional per-tool rate limit (overrides global for this tool) */
  rateLimit?: ToolRateLimit;
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
  | "PROTECTED_RESOURCE"
  | "ROLE_HIERARCHY"
  | "ROLE_ALREADY_EXISTS"
  | "ROLE_NOT_FOUND";

/* ================================================================
 * ACTION PLAN (for dry-run / confirmation)
 * ================================================================ */

export interface ActionPlanChange {
  type: "create" | "modify" | "delete" | "assign" | "remove" | "update";
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
  /** Session identifier for browser operations — binds confirmation to exact session */
  sessionId?: string;
  /** SHA-256 hash of the serialized arguments for tamper detection */
  argumentsHash?: string;
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
