import type { Client } from "discord.js";
import type { ToolDefinition, ToolContext, ToolResult } from "../../types";

/* ================================================================
 * inspect_roles — Return a structured overview of guild roles.
 *
 * Read-only. LOW risk. No confirmation required.
 * ================================================================ */

export function createInspectRolesTool(getClient: () => Client | null): ToolDefinition {
  return {
    name: "inspect_roles",
    description: "Return a structured overview of all roles in the current server.",
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
        return { status: "denied", message: "Could not fetch guild.", denialReason: "GUILD_ONLY" };
      }

      try {
        const roles = await guild.roles.fetch();

        const sorted = [...roles.values()]
          .filter((r) => r.id !== guild.id)
          .sort((a, b) => b.position - a.position);

        const lines = [
          `📋 **Roles in ${guild.name}** (${sorted.length})`,
          "",
        ];

        for (const role of sorted.slice(0, 30)) {
          const memberCount = role.members.size;
          const flags: string[] = [];
          if (role.hoist) flags.push("hoist");
          if (role.mentionable) flags.push("mentionable");
          if (role.managed) flags.push("managed");

          lines.push(
            `**${role.name}** — ${memberCount} members, color: ${role.hexColor}${flags.length ? ` (${flags.join(", ")})` : ""}`,
          );
        }

        if (sorted.length > 30) {
          lines.push(`\n... and ${sorted.length - 30} more roles.`);
        }

        return {
          status: "success",
          message: lines.join("\n"),
          data: {
            roles: sorted.map((r) => ({
              id: r.id,
              name: r.name,
              color: r.hexColor,
              position: r.position,
              hoist: r.hoist,
              mentionable: r.mentionable,
              managed: r.managed,
              memberCount: r.members.size,
            })),
          },
        };
      } catch (error) {
        return { status: "error", message: "Failed to inspect roles. The issue has been logged." };
      }
    },
  };
}
