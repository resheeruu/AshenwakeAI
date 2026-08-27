import type { Client } from "discord.js";
import type { ToolDefinition, ToolContext, ToolResult } from "../types";
import { getToolAuditLog } from "../audit";
import { recordToolAudit } from "../audit";
import type { ToolAuditEntry } from "../types";

/* ================================================================
 * SANITIZE AUDIT ENTRY
 *
 * Remove any potentially sensitive data before returning to user.
 * Never expose: passwords, tokens, API keys, .env values,
 * raw user messages, or secrets.
 * ================================================================ */

function sanitizeEntry(entry: ToolAuditEntry): ToolAuditEntry {
  return {
    id: entry.id,
    timestamp: entry.timestamp,
    guildId: entry.guildId,
    channelId: entry.channelId,
    requesterId: entry.requesterId,
    requesterName: entry.requesterName,
    toolName: entry.toolName,
    riskLevel: entry.riskLevel,
    result: entry.result,
    denialReason: entry.denialReason,
    durationMs: entry.durationMs,
    dryRun: entry.dryRun,
  };
}

/* ================================================================
 * view_tool_audit — View AI tool audit log.
 *
 * LOW risk. No confirmation. Moderator+ role.
 * ================================================================ */

export function createViewToolAuditTool(getClient: () => Client | null): ToolDefinition {
  return {
    name: "view_tool_audit",
    description: "View the AI tool audit log with optional filters.",
    category: "discord",
    requiredRole: "moderator",
    requiredDiscordPermissions: [],
    allowedScopes: ["AI_MANAGEMENT"],
    confirmationRequired: false,
    riskLevel: "low",
    parameters: [
      {
        name: "limit",
        type: "number",
        description: "Number of entries to return (default: 20, max: 100)",
        required: false,
        defaultValue: 20,
      },
      {
        name: "toolName",
        type: "string",
        description: "Filter by tool name",
        required: false,
      },
      {
        name: "result",
        type: "string",
        description: "Filter by result status",
        required: false,
        allowedValues: ["success", "denied", "validation_error", "confirmation_required", "risk_blocked", "scope_denied", "rate_limited", "error"],
      },
      {
        name: "requesterId",
        type: "string",
        description: "Filter by requester user ID",
        required: false,
      },
      {
        name: "channelId",
        type: "string",
        description: "Filter by channel ID",
        required: false,
      },
      {
        name: "riskLevel",
        type: "string",
        description: "Filter by risk level",
        required: false,
        allowedValues: ["safe", "low", "medium", "high", "critical"],
      },
      {
        name: "since",
        type: "string",
        description: "ISO timestamp or relative time (e.g. '1h', '24h', '7d')",
        required: false,
      },
    ],
    execute: async (context: ToolContext): Promise<ToolResult> => {
      const startTime = Date.now();

      // ── Parse filters ─────────────────────────────────────────────
      let limit = 20;
      if (context.arguments.limit !== undefined) {
        limit = Math.min(Math.max(1, Number(context.arguments.limit) || 20), 100);
      }

      const toolNameFilter = context.arguments.toolName
        ? String(context.arguments.toolName).trim()
        : undefined;

      const resultFilter = context.arguments.result
        ? String(context.arguments.result).trim()
        : undefined;

      const requesterIdFilter = context.arguments.requesterId
        ? String(context.arguments.requesterId).trim()
        : undefined;

      const channelIdFilter = context.arguments.channelId
        ? String(context.arguments.channelId).trim()
        : undefined;

      const riskLevelFilter = context.arguments.riskLevel
        ? String(context.arguments.riskLevel).trim()
        : undefined;

      let sinceFilter: number | undefined;
      if (context.arguments.since) {
        const sinceStr = String(context.arguments.since).trim();
        // Parse relative time
        const relativeMatch = sinceStr.match(/^(\d+)(m|h|d)$/);
        if (relativeMatch) {
          const amount = parseInt(relativeMatch[1], 10);
          const unit = relativeMatch[2];
          const now = Date.now();
          if (unit === "m") sinceFilter = now - amount * 60 * 1000;
          else if (unit === "h") sinceFilter = now - amount * 60 * 60 * 1000;
          else if (unit === "d") sinceFilter = now - amount * 24 * 60 * 60 * 1000;
        } else {
          // Try ISO parse
          const parsed = new Date(sinceStr).getTime();
          if (!isNaN(parsed)) sinceFilter = parsed;
        }
      }

      // ── Query audit log ──────────────────────────────────────────
      let entries = getToolAuditLog({
        guildId: context.guildId,
        limit: limit,
        since: sinceFilter,
      });

      // Apply additional filters
      if (toolNameFilter) {
        entries = entries.filter((e) => e.toolName === toolNameFilter);
      }
      if (resultFilter) {
        entries = entries.filter((e) => e.result === resultFilter);
      }
      if (requesterIdFilter) {
        entries = entries.filter((e) => e.requesterId === requesterIdFilter);
      }
      if (channelIdFilter) {
        entries = entries.filter((e) => e.channelId === channelIdFilter);
      }
      if (riskLevelFilter) {
        entries = entries.filter((e) => e.riskLevel === riskLevelFilter);
      }

      // ── Sanitize and format ──────────────────────────────────────
      const sanitized = entries.map(sanitizeEntry);

      if (sanitized.length === 0) {
        recordToolAudit(context, "success", undefined, startTime, false);
        return {
          status: "success",
          message: "📜 No audit entries found matching the specified filters.",
          data: { entries: [], count: 0 },
        };
      }

      const lines = [
        `📜 **AI Tool Audit Log** (${sanitized.length} entries)`,
        "",
        ...sanitized.map((entry) => {
          const date = new Date(entry.timestamp).toISOString().replace("T", " ").slice(0, 19);
          const risk = String(entry.riskLevel).toUpperCase();
          const status = entry.result === "success" ? "✅" : entry.result === "denied" ? "🚫" : "⚠️";
          return [
            `${status} \`${entry.toolName}\` — ${entry.result} [${risk}]`,
            `   <#${entry.channelId}> by <@${entry.requesterId}> — ${date}`,
            entry.denialReason ? `   Reason: ${entry.denialReason}` : "",
          ].filter(Boolean).join("\n");
        }),
      ];

      recordToolAudit(context, "success", undefined, startTime, false);

      return {
        status: "success",
        message: lines.join("\n"),
        data: { entries: sanitized, count: sanitized.length },
      };
    },
  };
}
