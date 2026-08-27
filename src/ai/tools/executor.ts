import { logger } from "../../logger";
import { recordAudit } from "../../security/audit";
import type { GuildAIConfig } from "./channel-scope";
import { loadGuildAIConfig } from "./channel-scope";
import { validateToolRequest } from "./validator";
import { recordToolAudit } from "./audit";
import { toolRegistry } from "./registry";
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
 *   6. If dry-run → return plan only
 *   7. If confirmation required → return confirmation prompt
 *   8. Execute tool
 *   9. Audit the result
 * ================================================================ */

export async function executeTool(
  toolName: string,
  context: ToolContext,
  options: ExecutorOptions = {},
): Promise<ToolResult> {
  const startTime = Date.now();
  const dryRun = options.dryRun ?? false;
  const isBotOwner = options.isBotOwner ?? false;

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

  // 2–5. Full validation
  const guildConfig = loadGuildAIConfig(context.guildId);
  const validation = validateToolRequest(tool, context, guildConfig, isBotOwner);

  if (!validation.allowed) {
    const result: ToolResult = {
      status: "denied",
      message: validation.message || "Access denied.",
      denialReason: validation.denialReason,
    };
    recordToolAudit(context, result.status, result.denialReason, startTime, dryRun);
    return result;
  }

  // 6. Dry-run mode
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

  // 7. Confirmation required
  if (tool.confirmationRequired) {
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

  // 8. Execute
  try {
    const result = await tool.execute(context);
    const durationMs = Date.now() - startTime;

    // 9. Audit
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
      message: `Tool "${toolName}" failed: ${errorMessage}`,
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
