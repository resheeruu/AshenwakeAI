/* ================================================================
 * AI TOOL FRAMEWORK — U1 + U2
 *
 * U1: Tool Registry — centralized registration, validation, execution
 * U2: Channel Scoping — per-guild channel allowlists with scopes
 * ================================================================ */

// Types
export type {
  ChannelScope,
  ToolParameter,
  ToolDefinition,
  ToolContext,
  ToolResult,
  ToolResultStatus,
  DenialReason,
  ActionPlan,
  ActionPlanChange,
  ToolAuditEntry,
} from "./types";

// Registry
export { ToolRegistry, toolRegistry } from "./registry";

// Validator
export {
  validateArguments,
  validateRole,
  validateChannelScope,
  validateRisk,
  validateToolRequest,
  type ValidationResult,
  type FullValidationResult,
} from "./validator";

// Executor
export {
  executeTool,
  createActionPlan,
  validateBatch,
  type ExecutorOptions,
  type BatchValidationItem,
  type BatchValidationResult,
} from "./executor";

// Channel Scope (U2)
export {
  loadGuildAIConfig,
  saveGuildAIConfig,
  getAllGuildAIConfigs,
  deleteGuildAIConfig,
  setChannelScope,
  removeChannelScope,
  addChannelScope,
  removeSingleChannelScope,
  getChannelScopes,
  isChannelAllowed,
  addManagementRole,
  removeManagementRole,
  addChatRole,
  removeChatRole,
  assertGuildIsolation,
  type GuildAIConfig,
} from "./channel-scope";

// Audit
export { recordToolAudit, getToolAuditLog } from "./audit";
