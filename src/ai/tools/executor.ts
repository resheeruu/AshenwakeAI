import { createHash } from "node:crypto";
import { logger } from "../../logger";
import { recordAudit } from "../../security/audit";
import { sanitizeToolError } from "../../security/sanitize";
import type { GuildAIConfig } from "./channel-scope";
import { loadGuildAIConfig } from "./channel-scope";
import { validateToolRequest } from "./validator";
import { recordToolAudit } from "./audit";
import { toolRegistry } from "./registry";
import { toolRateLimiter } from "./tool-rate-limit";
import type {
  ToolContext,
  ToolResult,
  ActionPlan,
} from "./types";

/* ================================================================
 * EXECUTOR OPTIONS
 * ================================================================ */

export interface ExecutorOptions {
  /** If true, only produce a plan without executing */
  dryRun?: boolean;
  /** Bot owner override (bypasses some risk checks) */
  isBotOwner?: boolean;
  /** If true, skip rate limit check (used for confirmed executions) */
  skipRateLimit?: boolean;
  /** If true, skip confirmation prompt and execute immediately (used for pre-confirmed multi-step plans) */
  skipConfirmation?: boolean;
}

/* ================================================================
 * ACTION PLAN CREATION
 * ================================================================ */

let planCounter = 0;

export function createActionPlan(
  context: ToolContext,
  riskLevel: string,
  changes: ActionPlan["changes"],
  requiresConfirmation: boolean,
): ActionPlan {
  const id = `plan_${Date.now().toString(36)}_${++planCounter}`;

  // Compute arguments hash for tamper detection
  const argsForHash = { ...context.arguments };
  delete argsForHash._toolName;
  delete argsForHash._sessionId;
  const argsHash = createHash("sha256")
    .update(JSON.stringify(argsForHash))
    .digest("hex")
    .slice(0, 16);

  // Extract session ID from arguments if present (browser tools)
  const sessionId = typeof context.arguments._sessionId === "string"
    ? context.arguments._sessionId
    : undefined;

  return {
    id,
    guildId: context.guildId,
    channelId: context.channelId,
    requesterId: context.requesterId,
    toolName: context.arguments._toolName as string || "unknown",
    arguments: context.arguments,
    riskLevel: riskLevel as any,
    changes,
    requiresConfirmation,
    createdAt: Date.now(),
    expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes
    sessionId,
    argumentsHash: argsHash,
  };
}

/* ================================================================
 * TOOL EXECUTION PIPELINE
 *
 * The safe pipeline for every AI management request:
 *   1. Look up tool in registry
 *   2. Validate arguments
 *   3. Validate role
 *   4. Validate channel scope
 *   5. Validate risk level
 *   6. Check + consume rate limit (skipped for dry-run, confirmed executions, and confirmation-required tools)
 *   7. If dry-run → return plan only
 *   8. If confirmation required → reserve rate limit with plan ID, return confirmation prompt
 *   9. Execute tool
 *  10. Audit the result
 * ================================================================ */

export async function executeTool(
  toolName: string,
  context: ToolContext,
  options: ExecutorOptions = {},
): Promise<ToolResult> {
  const startTime = Date.now();
  const dryRun = options.dryRun ?? false;
  const isBotOwner = options.isBotOwner ?? false;
  const skipRateLimit = options.skipRateLimit ?? false;

  // 1. Look up tool
  const tool = toolRegistry.get(toolName);
  if (!tool) {
    const result: ToolResult = {
      status: "denied",
      message: `Tool "${toolName}" is not registered.`,
      denialReason: "TOOL_NOT_ALLOWED",
    };
    recordToolAudit(context, "denied", result.denialReason, startTime, dryRun);
    return result;
  }

  // 2–5. Full validation (rate limit check included unless skipped)
  const guildConfig = loadGuildAIConfig(context.guildId);
  const validation = validateToolRequest(tool, context, guildConfig, isBotOwner, skipRateLimit);

  if (!validation.allowed) {
    const result: ToolResult = {
      status: validation.denialReason === "RATE_LIMITED" ? "rate_limited" : "denied",
      message: validation.message || "Access denied.",
      denialReason: validation.denialReason,
    };
    recordToolAudit(context, result.status, result.denialReason, startTime, dryRun);
    return result;
  }

  // 6. Rate limit consumption (skip for dry-run, confirmed executions, and confirmation-required tools)
  // Confirmation-required tools handle their own reservation at step 8 with the actual plan ID.
  if (!dryRun && !skipRateLimit && !tool.confirmationRequired) {
    try {
      const consumed = toolRateLimiter.reserve(
        context.guildId,
        context.requesterId,
        context.requesterRole,
        "pending",
        toolName,
      );

      if (!consumed) {
        // Rate limit exceeded at consumption time
        const isMutation = tool.riskLevel !== "safe" && tool.riskLevel !== "low";

        if (isMutation) {
          // Fail closed for mutation tools
          const result: ToolResult = {
            status: "rate_limited",
            message: "Rate limit exceeded for this action. Try again later.",
            denialReason: "RATE_LIMITED",
          };
          recordToolAudit(context, "rate_limited", "RATE_LIMITED", startTime, dryRun);
          return result;
        }

        // Fail open for read-only/low-risk tools (log but allow)
        logger.warn(
          `Rate limit check failed for read-only tool ${toolName} in guild=${context.guildId} — failing open`,
        );
      }
    } catch (error) {
      // Rate limiter itself failed
      const isMutation = tool.riskLevel !== "safe" && tool.riskLevel !== "low";

      if (isMutation) {
        // Fail closed for mutation tools
        logger.error(`Rate limiter error for mutation tool ${toolName}: ${error instanceof Error ? error.message : String(error)}`);
        const result: ToolResult = {
          status: "error",
          message: "Rate limit service unavailable. Action blocked for safety.",
          denialReason: "RATE_LIMITED",
        };
        recordToolAudit(context, "error", "RATE_LIMITED", startTime, dryRun);
        return result;
      }

      // Fail open for read-only/low-risk tools
      logger.warn(
        `Rate limiter error for read-only tool ${toolName} — failing open: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // 7. Dry-run mode
  if (dryRun) {
    const plan = createActionPlan(
      context,
      tool.riskLevel,
      [{
        type: "create",
        target: toolName,
        description: `Execute ${toolName} (dry run)`,
      }],
      tool.confirmationRequired,
    );

    const result: ToolResult = {
      status: "success",
      message: `📋 **PLAN ONLY** — No changes were made.\nTool: ${toolName}\nRisk: ${tool.riskLevel}`,
      plan,
    };
    recordToolAudit(context, "success", undefined, startTime, dryRun);
    return result;
  }

  // 8. Confirmation required — reserve rate limit with actual plan ID
  // Skip if skipConfirmation is set (used for pre-confirmed multi-step template plans)
  if (tool.confirmationRequired && !options.skipConfirmation) {
    const plan = createActionPlan(
      context,
      tool.riskLevel,
      [{
        type: "create",
        target: toolName,
        description: `Execute ${toolName}`,
      }],
      true,
    );

    // Reserve rate limit with actual plan ID (only token consumption for confirmation tools)
    try {
      toolRateLimiter.reserve(
        context.guildId,
        context.requesterId,
        context.requesterRole,
        plan.id,
        toolName,
      );
    } catch {
      // Reservation failed — log but don't block plan creation
      // The initial "pending" reservation provides baseline protection
      logger.warn(`Failed to create rate limit reservation for plan ${plan.id}`);
    }

    const result: ToolResult = {
      status: "confirmation_required",
      message:
        `⚠️ **Confirm Action**\n` +
        `Action: ${toolName}\n` +
        `Risk: ${tool.riskLevel.toUpperCase()}\n` +
        `Channel: <#${context.channelId}>\n\n` +
        `This action requires confirmation.`,
      plan,
    };
    recordToolAudit(context, "confirmation_required", undefined, startTime, dryRun);
    return result;
  }

  // 9. Execute
  try {
    const result = await tool.execute(context);
    const durationMs = Date.now() - startTime;

    // 10. Audit
    recordToolAudit(context, result.status, result.denialReason, startTime, dryRun);

    logger.info(
      `Tool executed: ${toolName} [${result.status}] in guild=${context.guildId} by=${context.requesterId} (${durationMs}ms)`,
    );

    return result;
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.error(`Tool execution failed: ${toolName} — ${errorMessage}`);

    recordToolAudit(context, "error", undefined, startTime, dryRun);

    return {
      status: "error",
      message: sanitizeToolError(toolName, error),
    };
  }
}

/* ================================================================
 * BATCH VALIDATION (for checking multiple tools at once)
 * ================================================================ */

export interface BatchValidationItem {
  toolName: string;
  context: ToolContext;
}

export interface BatchValidationResult {
  toolName: string;
  allowed: boolean;
  denialReason?: string;
  message?: string;
}

export function validateBatch(
  items: BatchValidationItem[],
  isBotOwner = false,
): BatchValidationResult[] {
  return items.map(({ toolName, context }) => {
    const tool = toolRegistry.get(toolName);
    if (!tool) {
      return {
        toolName,
        allowed: false,
        denialReason: "TOOL_NOT_ALLOWED",
        message: `Tool "${toolName}" is not registered.`,
      };
    }

    const guildConfig = loadGuildAIConfig(context.guildId);
    const validation = validateToolRequest(tool, context, guildConfig, isBotOwner);

    return {
      toolName,
      allowed: validation.allowed,
      denialReason: validation.denialReason,
      message: validation.message,
    };
  });
}
