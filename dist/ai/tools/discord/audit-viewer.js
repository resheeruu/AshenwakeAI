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
var audit_viewer_exports = {};
__export(audit_viewer_exports, {
  createViewToolAuditTool: () => createViewToolAuditTool
});
module.exports = __toCommonJS(audit_viewer_exports);
var import_audit = require("../audit");
var import_audit2 = require("../audit");
function sanitizeEntry(entry) {
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
    dryRun: entry.dryRun
  };
}
function createViewToolAuditTool(getClient) {
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
        defaultValue: 20
      },
      {
        name: "toolName",
        type: "string",
        description: "Filter by tool name",
        required: false
      },
      {
        name: "result",
        type: "string",
        description: "Filter by result status",
        required: false,
        allowedValues: ["success", "denied", "validation_error", "confirmation_required", "risk_blocked", "scope_denied", "rate_limited", "error"]
      },
      {
        name: "requesterId",
        type: "string",
        description: "Filter by requester user ID",
        required: false
      },
      {
        name: "channelId",
        type: "string",
        description: "Filter by channel ID",
        required: false
      },
      {
        name: "riskLevel",
        type: "string",
        description: "Filter by risk level",
        required: false,
        allowedValues: ["safe", "low", "medium", "high", "critical"]
      },
      {
        name: "since",
        type: "string",
        description: "ISO timestamp or relative time (e.g. '1h', '24h', '7d')",
        required: false
      }
    ],
    execute: async (context) => {
      const startTime = Date.now();
      let limit = 20;
      if (context.arguments.limit !== void 0) {
        limit = Math.min(Math.max(1, Number(context.arguments.limit) || 20), 100);
      }
      const toolNameFilter = context.arguments.toolName ? String(context.arguments.toolName).trim() : void 0;
      const resultFilter = context.arguments.result ? String(context.arguments.result).trim() : void 0;
      const requesterIdFilter = context.arguments.requesterId ? String(context.arguments.requesterId).trim() : void 0;
      const channelIdFilter = context.arguments.channelId ? String(context.arguments.channelId).trim() : void 0;
      const riskLevelFilter = context.arguments.riskLevel ? String(context.arguments.riskLevel).trim() : void 0;
      let sinceFilter;
      if (context.arguments.since) {
        const sinceStr = String(context.arguments.since).trim();
        const relativeMatch = sinceStr.match(/^(\d+)(m|h|d)$/);
        if (relativeMatch) {
          const amount = parseInt(relativeMatch[1], 10);
          const unit = relativeMatch[2];
          const now = Date.now();
          if (unit === "m") sinceFilter = now - amount * 60 * 1e3;
          else if (unit === "h") sinceFilter = now - amount * 60 * 60 * 1e3;
          else if (unit === "d") sinceFilter = now - amount * 24 * 60 * 60 * 1e3;
        } else {
          const parsed = new Date(sinceStr).getTime();
          if (!isNaN(parsed)) sinceFilter = parsed;
        }
      }
      let entries = (0, import_audit.getToolAuditLog)({
        guildId: context.guildId,
        limit,
        since: sinceFilter
      });
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
      const sanitized = entries.map(sanitizeEntry);
      if (sanitized.length === 0) {
        (0, import_audit2.recordToolAudit)(context, "success", void 0, startTime, false);
        return {
          status: "success",
          message: "\u{1F4DC} No audit entries found matching the specified filters.",
          data: { entries: [], count: 0 }
        };
      }
      const lines = [
        `\u{1F4DC} **AI Tool Audit Log** (${sanitized.length} entries)`,
        "",
        ...sanitized.map((entry) => {
          const date = new Date(entry.timestamp).toISOString().replace("T", " ").slice(0, 19);
          const risk = String(entry.riskLevel).toUpperCase();
          const status = entry.result === "success" ? "\u2705" : entry.result === "denied" ? "\u{1F6AB}" : "\u26A0\uFE0F";
          return [
            `${status} \`${entry.toolName}\` \u2014 ${entry.result} [${risk}]`,
            `   <#${entry.channelId}> by <@${entry.requesterId}> \u2014 ${date}`,
            entry.denialReason ? `   Reason: ${entry.denialReason}` : ""
          ].filter(Boolean).join("\n");
        })
      ];
      (0, import_audit2.recordToolAudit)(context, "success", void 0, startTime, false);
      return {
        status: "success",
        message: lines.join("\n"),
        data: { entries: sanitized, count: sanitized.length }
      };
    }
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  createViewToolAuditTool
});
