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
var list_channels_exports = {};
__export(list_channels_exports, {
  createListChannelsTool: () => createListChannelsTool
});
module.exports = __toCommonJS(list_channels_exports);
var import_channel_scope = require("../channel-scope");
function mapChannelType(type) {
  switch (type) {
    case 0:
      return "text";
    case 2:
      return "voice";
    case 4:
      return "category";
    case 15:
      return "forum";
    default:
      return "unknown";
  }
}
function createListChannelsTool(getClient) {
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
        allowedValues: ["text", "voice", "category", "forum"]
      },
      {
        name: "category",
        type: "string",
        description: "Filter by category ID",
        required: false
      },
      {
        name: "scope",
        type: "string",
        description: "Filter by AI scope: AI_CHAT, AI_MANAGEMENT, AI_GAMES",
        required: false,
        allowedValues: ["AI_CHAT", "AI_MANAGEMENT", "AI_GAMES"]
      }
    ],
    execute: async (context) => {
      const client = getClient();
      if (!client) {
        return { status: "error", message: "Discord client is not connected." };
      }
      const guild = await client.guilds.fetch(context.guildId).catch(() => null);
      if (!guild) {
        return {
          status: "denied",
          message: "Could not fetch guild.",
          denialReason: "GUILD_ONLY"
        };
      }
      try {
        const channels = await guild.channels.fetch();
        const aiConfig = (0, import_channel_scope.loadGuildAIConfig)(context.guildId);
        const filterType = context.arguments.type;
        const filterCategory = context.arguments.category;
        const filterScope = context.arguments.scope;
        const categoryMap = /* @__PURE__ */ new Map();
        for (const [, ch] of channels) {
          if (ch && ch.type === 4) {
            categoryMap.set(ch.id, ch.name);
          }
        }
        let channelList = [];
        for (const [, ch] of channels) {
          if (!ch || ch.type === 4) continue;
          const info = {
            id: ch.id,
            name: ch.name,
            type: mapChannelType(ch.type),
            categoryId: ch.parentId,
            categoryName: ch.parentId ? categoryMap.get(ch.parentId) ?? null : null,
            position: ch.position,
            aiScopes: aiConfig.channelScopes[ch.id] || [],
            isManagedByBot: ch.manageable
          };
          if (filterType && info.type !== filterType) continue;
          if (filterCategory && info.categoryId !== filterCategory) continue;
          if (filterScope && !info.aiScopes.includes(filterScope)) continue;
          channelList.push(info);
        }
        channelList.sort((a, b) => a.position - b.position);
        const lines = [
          `\u{1F4E1} **Channels** (${channelList.length})`,
          ""
        ];
        for (const ch of channelList) {
          const scopeText = ch.aiScopes.length > 0 ? ` [${ch.aiScopes.join(", ")}]` : "";
          const catText = ch.categoryName ? ` (${ch.categoryName})` : "";
          lines.push(`**#${ch.name}** \u2014 ${ch.type}${catText}${scopeText}`);
        }
        if (channelList.length === 0) {
          lines.push("No channels match the given filters.");
        }
        return {
          status: "success",
          message: lines.join("\n"),
          data: channelList
        };
      } catch (error) {
        return {
          status: "error",
          message: `Failed to list channels. The issue has been logged.`
        };
      }
    }
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  createListChannelsTool
});
