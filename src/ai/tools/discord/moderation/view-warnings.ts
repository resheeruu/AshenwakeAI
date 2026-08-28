import type { Client } from "discord.js";
import type { ToolDefinition, ToolContext, ToolResult } from "../../types";
import { getWarnings } from "../../../../discord/warnings";

/* ================================================================
 * view_warnings — View warning history for a guild member.
 *
 * LOW risk. No confirmation required. Moderator+ role.
 * Read-only — does not modify Discord or warnings.
 * ================================================================ */

export function createViewWarningsTool(getClient: () => Client | null): ToolDefinition {
  return {
    name: "view_warnings",
    description: "View the warning history for a member in this server.",
    category: "discord",
    requiredRole: "moderator",
    requiredDiscordPermissions: [],
    allowedScopes: ["AI_MANAGEMENT"],
    confirmationRequired: false,
    riskLevel: "low",
    parameters: [
      {
        name: "userId",
        type: "string",
        description: "ID of the user to check",
        required: true,
      },
    ],
    execute: async (context: ToolContext): Promise<ToolResult> => {
      const client = getClient();
      if (!client) {
        return { status: "error", message: "Discord client is not connected." };
      }

      const guild = await client.guilds.fetch(context.guildId).catch(() => null);
      if (!guild) {
        return { status: "denied", message: "Could not fetch guild.", denialReason: "GUILD_ONLY" };
      }

      const userId = String(context.arguments.userId || "").trim();
      if (!userId) {
        return { status: "validation_error", message: "Missing required parameter: userId" };
      }

      // Fetch target to verify they exist
      const target = await guild.members.fetch(userId).catch(() => null);
      if (!target) {
        return { status: "validation_error", message: `User "${userId}" not found in this server.` };
      }

      // Get warnings from existing warning storage
      const warnings = getWarnings(context.guildId, userId);

      if (warnings.length === 0) {
        return {
          status: "success",
          message: `📋 **Warnings for ${target.user.tag}**\n\nNo warnings found.`,
          data: { userId, warnings: [] },
        };
      }

      const lines = [
        `📋 **Warnings for ${target.user.tag}**`,
        `**Total:** ${warnings.length}`,
        "",
      ];

      for (const w of warnings) {
        lines.push(`• **${w.id}** — ${w.reason} (<@${w.moderatorId}>, ${w.createdAt})`);
      }

      return {
        status: "success",
        message: lines.join("\n"),
        data: { userId, warnings },
      };
    },
  };
}
