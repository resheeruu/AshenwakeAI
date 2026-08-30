import type { Client, GuildChannel, ChannelType as DiscordChannelType } from "discord.js";
import type { ToolDefinition, ToolContext, ToolResult } from "../types";
import type { ChannelInfo, ChannelType } from "./types";
import { loadGuildAIConfig } from "../channel-scope";

function mapChannelType(type: DiscordChannelType): ChannelType {
  switch (type) {
    case 0: return "text";
    case 2: return "voice";
    case 4: return "category";
    case 15: return "forum";
    default: return "unknown";
  }
}

/**
 * list_channels — Safely list guild channels with optional filters.
 *
 * Read-only. LOW risk. No confirmation required.
 */
export function createListChannelsTool(getClient: () => Client | null): ToolDefinition {
  return {
    name: "list_channels",
    description: "List channels in the current server with optional type/category/scope filters.",
    category: "discord",
    requiredRole: "member",
    requiredDiscordPermissions: [],
    allowedScopes: ["AI_CHAT", "AI_MANAGEMENT"],
    confirmationRequired: false,
    riskLevel: "low",
    parameters: [
      {
        name: "type",
        type: "string",
        description: "Filter by channel type: text, voice, category, forum",
        required: false,
        allowedValues: ["text", "voice", "category", "forum"],
      },
      {
        name: "category",
        type: "string",
        description: "Filter by category ID",
        required: false,
      },
      {
        name: "scope",
        type: "string",
        description: "Filter by AI scope: AI_CHAT, AI_MANAGEMENT, AI_GAMES",
        required: false,
        allowedValues: ["AI_CHAT", "AI_MANAGEMENT", "AI_GAMES"],
      },
    ],
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
        const channels = await guild.channels.fetch();
        const aiConfig = loadGuildAIConfig(context.guildId);
        const filterType = context.arguments.type as string | undefined;
        const filterCategory = context.arguments.category as string | undefined;
        const filterScope = context.arguments.scope as string | undefined;

        const categoryMap = new Map<string, string>();
        for (const [, ch] of channels) {
          if (ch && ch.type === 4) {
            categoryMap.set(ch.id, ch.name);
          }
        }

        let channelList: ChannelInfo[] = [];

        for (const [, ch] of channels) {
          if (!ch || ch.type === 4) continue; // skip categories in listing

          const info: ChannelInfo = {
            id: ch.id,
            name: ch.name,
            type: mapChannelType(ch.type),
            categoryId: ch.parentId,
            categoryName: ch.parentId ? categoryMap.get(ch.parentId) ?? null : null,
            position: ch.position,
            aiScopes: aiConfig.channelScopes[ch.id] || [],
            isManagedByBot: ch.manageable,
          };

          // Apply filters
          if (filterType && info.type !== filterType) continue;
          if (filterCategory && info.categoryId !== filterCategory) continue;
          if (filterScope && !info.aiScopes.includes(filterScope as any)) continue;

          channelList.push(info);
        }

        channelList.sort((a, b) => a.position - b.position);

        const lines = [
          `📡 **Channels** (${channelList.length})`,
          "",
        ];

        for (const ch of channelList) {
          const scopeText = ch.aiScopes.length > 0 ? ` [${ch.aiScopes.join(", ")}]` : "";
          const catText = ch.categoryName ? ` (${ch.categoryName})` : "";
          lines.push(`**#${ch.name}** — ${ch.type}${catText}${scopeText}`);
        }

        if (channelList.length === 0) {
          lines.push("No channels match the given filters.");
        }

        return {
          status: "success",
          message: lines.join("\n"),
          data: channelList,
        };
      } catch (error) {
        return {
          status: "error",
          message: `Failed to list channels. The issue has been logged.`,
        };
      }
    },
  };
}
