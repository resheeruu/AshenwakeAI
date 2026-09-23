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
var health_check_exports = {};
__export(health_check_exports, {
  createHealthCheckTool: () => createHealthCheckTool
});
module.exports = __toCommonJS(health_check_exports);
var import_health_checker = require("../../../core/health-checker");
function createHealthCheckTool() {
  return {
    name: "health_check",
    description: "Show the system health for this guild: uptime, memory, subsystems.",
    category: "discord",
    requiredRole: "guest",
    requiredDiscordPermissions: [],
    allowedScopes: ["AI_CHAT", "AI_MANAGEMENT"],
    confirmationRequired: false,
    riskLevel: "low",
    parameters: [],
    execute: async (context) => {
      try {
        const report = (0, import_health_checker.runHealthCheck)(context.guildId);
        const subsystems = report.checks.map((check) => ({
          name: check.name,
          status: check.status === "pass" ? "healthy" : check.status === "warn" ? "degraded" : "unhealthy",
          message: check.message
        }));
        const healthReport = {
          overall: report.overall,
          subsystems
        };
        const lines = [
          "\u{1F3E5} **System Health**",
          "",
          `**Overall:** ${statusEmoji(healthReport.overall)} ${healthReport.overall}`,
          "",
          "**Subsystems:**"
        ];
        for (const sub of subsystems) {
          lines.push(`  ${statusEmoji(sub.status)} **${sub.name}:** ${sub.message}`);
        }
        lines.push("");
        lines.push(`**Score:** ${report.score}/100`);
        return {
          status: "success",
          message: lines.join("\n"),
          data: healthReport
        };
      } catch (error) {
        return {
          status: "error",
          message: `Failed to run health check. The issue has been logged.`
        };
      }
    }
  };
}
function statusEmoji(status) {
  switch (status) {
    case "healthy":
      return "\u2705";
    case "degraded":
      return "\u26A0\uFE0F";
    case "unhealthy":
      return "\u274C";
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  createHealthCheckTool
});
