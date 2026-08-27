import type { ToolDefinition, ToolContext, ToolResult } from "../types";
import type { HealthReport, SubsystemHealth, HealthStatus } from "./types";
import { runHealthCheck } from "../../../core/health-checker";

/**
 * health_check — System health overview for the current guild context.
 *
 * Read-only. LOW risk. No confirmation required.
 */
export function createHealthCheckTool(): ToolDefinition {
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
    execute: async (context: ToolContext): Promise<ToolResult> => {
      try {
        const report = runHealthCheck(context.guildId);

        const subsystems: SubsystemHealth[] = report.checks.map((check) => ({
          name: check.name,
          status: check.status === "pass" ? "healthy" as const :
                  check.status === "warn" ? "degraded" as const : "unhealthy" as const,
          message: check.message,
        }));

        const healthReport: HealthReport = {
          overall: report.overall,
          subsystems,
        };

        const lines = [
          "🏥 **System Health**",
          "",
          `**Overall:** ${statusEmoji(healthReport.overall)} ${healthReport.overall}`,
          "",
          "**Subsystems:**",
        ];

        for (const sub of subsystems) {
          lines.push(`  ${statusEmoji(sub.status)} **${sub.name}:** ${sub.message}`);
        }

        lines.push("");
        lines.push(`**Score:** ${report.score}/100`);

        return {
          status: "success",
          message: lines.join("\n"),
          data: healthReport,
        };
      } catch (error) {
        return {
          status: "error",
          message: `Failed to run health check: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },
  };
}

function statusEmoji(status: HealthStatus): string {
  switch (status) {
    case "healthy": return "✅";
    case "degraded": return "⚠️";
    case "unhealthy": return "❌";
  }
}
