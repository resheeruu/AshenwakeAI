import type { Client, GuildMember } from "discord.js";
import { PermissionFlagsBits, type PermissionFlags } from "discord.js";
import type { ToolDefinition, ToolContext, ToolResult } from "../types";
import type { PermissionReport, PermissionSet } from "./types";

function extractPermissions(member: GuildMember): PermissionSet {
  const p = member.permissions;
  return {
    viewChannel: p.has(PermissionFlagsBits.ViewChannel),
    sendMessages: p.has(PermissionFlagsBits.SendMessages),
    embedLinks: p.has(PermissionFlagsBits.EmbedLinks),
    manageChannels: p.has(PermissionFlagsBits.ManageChannels),
    manageRoles: p.has(PermissionFlagsBits.ManageRoles),
    manageMessages: p.has(PermissionFlagsBits.ManageMessages),
    moderateMembers: p.has(PermissionFlagsBits.ModerateMembers),
    moveMembers: p.has(PermissionFlagsBits.MoveMembers),
    connect: p.has(PermissionFlagsBits.Connect),
    speak: p.has(PermissionFlagsBits.Speak),
  };
}

function emptyPermissions(): PermissionSet {
  return {
    viewChannel: false,
    sendMessages: false,
    embedLinks: false,
    manageChannels: false,
    manageRoles: false,
    manageMessages: false,
    moderateMembers: false,
    moveMembers: false,
    connect: false,
    speak: false,
  };
}

/**
 * check_permissions — Show the requesting user's and the bot's permission set.
 *
 * Read-only. LOW risk. No confirmation required.
 */
export function createCheckPermissionsTool(getClient: () => Client | null): ToolDefinition {
  return {
    name: "check_permissions",
    description: "Show your application role and Discord permissions, plus the bot's permissions.",
    category: "discord",
    requiredRole: "guest",
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
          message: "Could not fetch guild.",
          denialReason: "GUILD_ONLY",
        };
      }

      try {
        const member: GuildMember | null = context.requesterId
          ? await guild.members.fetch(context.requesterId).catch(() => null)
          : null;

        const userPermissions = member
          ? extractPermissions(member)
          : emptyPermissions();

        const botMember = await guild.members.me;
        const botPermissions = botMember
          ? extractPermissions(botMember)
          : emptyPermissions();

        const report: PermissionReport = {
          user: {
            applicationRole: context.requesterRole,
            discordPermissions: userPermissions,
          },
          bot: {
            discordPermissions: botPermissions,
          },
          summary: {
            canCreateChannels: botPermissions.manageChannels,
            canManageRoles: botPermissions.manageRoles,
            canTimeoutMembers: botPermissions.moderateMembers,
            canDeleteMessages: botPermissions.manageMessages,
            canMoveMembers: botPermissions.moveMembers,
          },
        };

        const lines = [
          "🔐 **Permission Report**",
          "",
          "**You:**",
          `  • Application role: **${context.requesterRole}**`,
          `  • View channel: ${userPermissions.viewChannel ? "✅" : "❌"}`,
          `  • Send messages: ${userPermissions.sendMessages ? "✅" : "❌"}`,
          `  • Manage channels: ${userPermissions.manageChannels ? "✅" : "❌"}`,
          `  • Manage roles: ${userPermissions.manageRoles ? "✅" : "❌"}`,
          `  • Timeout members: ${userPermissions.moderateMembers ? "✅" : "❌"}`,
          `  • Manage messages: ${userPermissions.manageMessages ? "✅" : "❌"}`,
          "",
          "**Bot:**",
          `  • View channel: ${botPermissions.viewChannel ? "✅" : "❌"}`,
          `  • Send messages: ${botPermissions.sendMessages ? "✅" : "❌"}`,
          `  • Embed links: ${botPermissions.embedLinks ? "✅" : "❌"}`,
          `  • Manage channels: ${botPermissions.manageChannels ? "✅" : "❌"}`,
          `  • Manage roles: ${botPermissions.manageRoles ? "✅" : "❌"}`,
          `  • Timeout members: ${botPermissions.moderateMembers ? "✅" : "❌"}`,
          `  • Manage messages: ${botPermissions.manageMessages ? "✅" : "❌"}`,
        ];

        return {
          status: "success",
          message: lines.join("\n"),
          data: report,
        };
      } catch (error) {
        return {
          status: "error",
          message: `Failed to check permissions. The issue has been logged.`,
        };
      }
    },
  };
}
