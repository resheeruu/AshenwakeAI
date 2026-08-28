import type { ToolDefinition, ToolContext, ToolResult } from "../types";
import type { AIConfigInfo } from "./types";
import { loadGuildAIConfig } from "../channel-scope";

/**
 * inspect_ai_config — Show the AI configuration for this guild.
 *
 * Read-only. LOW risk. No confirmation required.
 */
export function createInspectAIConfigTool(): ToolDefinition {
  return {
    name: "inspect_ai_config",
    description: "Show the AI configuration for this guild: enabled, scopes, roles, version.",
    category: "discord",
    requiredRole: "member",
    requiredDiscordPermissions: [],
    allowedScopes: ["AI_CHAT", "AI_MANAGEMENT"],
    confirmationRequired: false,
    riskLevel: "low",
    parameters: [],
    execute: async (context: ToolContext): Promise<ToolResult> => {
      try {
        const aiConfig = loadGuildAIConfig(context.guildId);

        const channelList = Object.entries(aiConfig.channelScopes).map(([channelId, scopes]) => ({
          channelId,
          channelName: null as string | null,
          scopes,
        }));

        const configInfo: AIConfigInfo = {
          enabled: aiConfig.enabled,
          managementEnabled: aiConfig.managementEnabled,
          channelScopes: aiConfig.channelScopes,
          managementRoleCount: aiConfig.managementRoleIds.length,
          chatRoleCount: aiConfig.chatRoleIds.length,
          version: aiConfig.version,
        };

        const lines = [
          "⚙️ **AI Configuration**",
          "",
          `**Enabled:** ${configInfo.enabled ? "✅ Yes" : "❌ No"}`,
          `**Management Enabled:** ${configInfo.managementEnabled ? "✅ Yes" : "❌ No"}`,
          `**Config Version:** ${configInfo.version}`,
          "",
          "**Channel Scopes:**",
        ];

        if (channelList.length === 0) {
          lines.push("  No channels configured.");
        } else {
          for (const ch of channelList) {
            lines.push(`  • <#${ch.channelId}> → ${ch.scopes.join(", ")}`);
          }
        }

        lines.push("");
        lines.push(`**Management Roles:** ${aiConfig.managementRoleIds.length > 0 ? aiConfig.managementRoleIds.map((id) => `<@&${id}>`).join(", ") : "None configured"}`);
        lines.push(`**Chat Roles:** ${aiConfig.chatRoleIds.length > 0 ? aiConfig.chatRoleIds.map((id) => `<@&${id}>`).join(", ") : "None configured"}`);

        return {
          status: "success",
          message: lines.join("\n"),
          data: configInfo,
        };
      } catch (error) {
        return {
          status: "error",
          message: `Failed to inspect AI config. The issue has been logged.`,
        };
      }
    },
  };
}
