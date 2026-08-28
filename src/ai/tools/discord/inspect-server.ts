import type { Client } from "discord.js";
import type { ToolDefinition, ToolContext, ToolResult } from "../types";
import type { ServerInfo } from "./types";
import { loadGuildAIConfig } from "../channel-scope";

/**
 * inspect_server — Returns a structured overview of the Discord guild.
 *
 * Read-only. LOW risk. No confirmation required.
 */
export function createInspectServerTool(getClient: () => Client | null): ToolDefinition {
  return {
    name: "inspect_server",
    description: "Return a structured overview of the current Discord server.",
    category: "discord",
    requiredRole: "member",
    requiredDiscordPermissions: [],
    allowedScopes: ["AI_CHAT", "AI_MANAGEMENT"],
    confirmationRequired: false,
    riskLevel: "low",
    parameters: [],
    execute: async (context: ToolContext): Promise<ToolResult> => {
      const client = getClient();
      if (!client) {
        return { status: "error", message: "Discord client is not connected." };
      }

      const guild = await client.guilds.fetch(context.guildId).catch(() => null);
      if (!guild) {
        return {
          status: "denied",
          message: "Could not fetch guild. The bot may not be in this server.",
          denialReason: "GUILD_ONLY",
        };
      }

      try {
        const [members, channels, roles] = await Promise.all([
          guild.members.fetch(),
          guild.channels.fetch(),
          guild.roles.fetch(),
        ]);

        const textChannels = channels.filter((c) => c?.type === 0).size;
        const voiceChannels = channels.filter((c) => c?.type === 2).size;
        const categories = channels.filter((c) => c?.type === 4).size;
        const forumChannels = channels.filter((c) => c?.type === 15).size;
        const botCount = members.filter((m) => m.user.bot).size;

        const aiConfig = loadGuildAIConfig(context.guildId);
        const managementChannels: string[] = [];
        const chatChannels: string[] = [];

        for (const [chId, scopes] of Object.entries(aiConfig.channelScopes)) {
          if (scopes.includes("AI_MANAGEMENT")) managementChannels.push(chId);
          if (scopes.includes("AI_CHAT")) chatChannels.push(chId);
        }

        const info: ServerInfo = {
          id: guild.id,
          name: guild.name,
          ownerId: guild.ownerId,
          memberCount: guild.memberCount,
          botCount,
          roleCount: roles.size,
          channelCount: channels.size,
          categoryCount: categories,
          textChannelCount: textChannels,
          voiceChannelCount: voiceChannels,
          forumChannelCount: forumChannels,
          boostLevel: guild.premiumTier,
          verificationLevel: String(guild.verificationLevel),
          aiEnabled: aiConfig.enabled,
          aiManagementEnabled: aiConfig.managementEnabled,
          aiManagementChannels: managementChannels,
          aiChatChannels: chatChannels,
        };

        const lines = [
          "📋 **Server Overview**",
          "",
          `**Name:** ${info.name}`,
          `**ID:** ${info.id}`,
          `**Owner:** <@${info.ownerId}>`,
          `**Members:** ${info.memberCount} (${info.botCount} bots)`,
          `**Channels:** ${info.channelCount} (${info.textChannelCount} text, ${info.voiceChannelCount} voice, ${info.forumChannelCount} forum)`,
          `**Categories:** ${info.categoryCount}`,
          `**Roles:** ${info.roleCount}`,
          `**Boost Level:** ${info.boostLevel}`,
          `**Verification:** ${info.verificationLevel}`,
          "",
          `**AI:** ${info.aiEnabled ? "Enabled" : "Disabled"}`,
          `**AI Management:** ${info.aiManagementEnabled ? "Enabled" : "Disabled"}`,
        ];

        if (managementChannels.length > 0) {
          lines.push(`**Management Channels:** ${managementChannels.map((id) => `<#${id}>`).join(", ")}`);
        }
        if (chatChannels.length > 0) {
          lines.push(`**AI Chat Channels:** ${chatChannels.map((id) => `<#${id}>`).join(", ")}`);
        }

        return {
          status: "success",
          message: lines.join("\n"),
          data: info,
        };
      } catch (error) {
        return {
          status: "error",
          message: `Failed to inspect server. The issue has been logged.`,
        };
      }
    },
  };
}
