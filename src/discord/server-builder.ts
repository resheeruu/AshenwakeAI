import { Guild, ChannelType, EmbedBuilder } from "discord.js";
import { logger } from "../logger";
import { recordAudit } from "../security/audit";
import { resolveRole, hasPermission } from "../security/permissions";
import { config } from "../config/env";

export interface ServerTemplate {
  name: string;
  description: string;
  categories: Array<{
    name: string;
    channels: Array<{ name: string; type: "text" | "voice"; description?: string }>;
  }>;
  roles: Array<{ name: string; color?: string; hoist?: boolean }>;
}

export const TEMPLATES: Record<string, ServerTemplate> = {
  gaming: {
    name: "Gaming Server",
    description: "A gaming community server with voice channels, game discussion, and LFG.",
    categories: [
      { name: "📋 INFORMATION", channels: [{ name: "rules", type: "text" }, { name: "announcements", type: "text" }] },
      { name: "💬 GENERAL", channels: [{ name: "general", type: "text" }, { name: "memes", type: "text" }, { name: "off-topic", type: "text" }] },
      { name: "🎮 GAMING", channels: [{ name: "looking-for-group", type: "text" }, { name: "game-clips", type: "text" }, { name: "lfg-voice", type: "voice" }] },
      { name: "🔊 VOICE", channels: [{ name: "General Voice", type: "voice" }, { name: "Gaming Voice", type: "voice" }, { name: "AFK", type: "voice" }] },
    ],
    roles: [
      { name: "Admin", color: "#ff0000", hoist: true },
      { name: "Moderator", color: "#00aa00", hoist: true },
      { name: "Member", color: "#0066ff" },
      { name: "Gamer", color: "#aa00ff" },
    ],
  },
  community: {
    name: "Community Server",
    description: "A general community server with discussions, events, and support.",
    categories: [
      { name: "📋 INFORMATION", channels: [{ name: "rules", type: "text" }, { name: "announcements", type: "text" }, { name: "roles", type: "text" }] },
      { name: "💬 GENERAL", channels: [{ name: "general", type: "text" }, { name: "introductions", type: "text" }, { name: "off-topic", type: "text" }] },
      { name: "🎯 TOPICS", channels: [{ name: "discussions", type: "text" }, { name: "suggestions", type: "text" }, { name: "events", type: "text" }] },
      { name: "🔊 VOICE", channels: [{ name: "General", type: "voice" }, { name: "Music", type: "voice" }] },
    ],
    roles: [
      { name: "Admin", color: "#ff0000", hoist: true },
      { name: "Moderator", color: "#00aa00", hoist: true },
      { name: "Member", color: "#0066ff" },
    ],
  },
  minecraft: {
    name: "Minecraft Server",
    description: "A Minecraft community with build showcases, LFG, and server info.",
    categories: [
      { name: "📋 INFORMATION", channels: [{ name: "rules", type: "text" }, { name: "server-info", type: "text" }, { name: "announcements", type: "text" }] },
      { name: "💬 GENERAL", channels: [{ name: "general", type: "text" }, { name: "screenshots", type: "text" }, { name: "builds", type: "text" }] },
      { name: "🎮 MINECRAFT", channels: [{ name: "looking-for-group", type: "text" }, { name: "trading", type: "text" }, { name: "mc-voice", type: "voice" }] },
    ],
    roles: [
      { name: "Admin", color: "#ff0000", hoist: true },
      { name: "Moderator", color: "#00aa00", hoist: true },
      { name: "Builder", color: "#aa8800" },
      { name: "Member", color: "#0066ff" },
    ],
  },
  support: {
    name: "Support Server",
    description: "A support/help desk server with ticketing and staff channels.",
    categories: [
      { name: "📋 INFORMATION", channels: [{ name: "rules", type: "text" }, { name: "announcements", type: "text" }] },
      { name: "💬 GENERAL", channels: [{ name: "general", type: "text" }, { name: "faq", type: "text" }] },
      { name: "🎫 SUPPORT", channels: [{ name: "create-ticket", type: "text" }, { name: "faq", type: "text" }] },
      { name: "🔒 STAFF", channels: [{ name: "staff-chat", type: "text" }, { name: "staff-voice", type: "voice" }] },
    ],
    roles: [
      { name: "Admin", color: "#ff0000", hoist: true },
      { name: "Support Staff", color: "#00aa00", hoist: true },
      { name: "Member", color: "#0066ff" },
    ],
  },
};

export async function buildFromTemplate(
  guild: Guild,
  template: ServerTemplate,
  executorId: string,
): Promise<{ success: boolean; message: string; details: string[] }> {
  const role = resolveRole({
    userId: executorId,
    guildOwnerId: guild.ownerId,
    adminIds: config.admin.discordIds,
  });
  const perm = hasPermission(role, "admin");
  if (!perm.allowed) {
    return { success: false, message: `❌ Permission denied: ${perm.reason}`, details: [] };
  }

  const details: string[] = [];
  try {
    for (const roleData of template.roles) {
      const role = await guild.roles.create({
        name: roleData.name,
        color: roleData.color as any,
        hoist: roleData.hoist || false,
        reason: `Server Builder: ${template.name}`,
      });
      details.push(`Created role: ${role.name}`);
    }

    for (const catData of template.categories) {
      const category = await guild.channels.create({
        name: catData.name,
        type: ChannelType.GuildCategory,
      });
      details.push(`Created category: ${category.name}`);

      for (const chData of catData.channels) {
        const channel = await guild.channels.create({
          name: chData.name,
          type: chData.type === "voice" ? ChannelType.GuildVoice : ChannelType.GuildText,
          parent: category.id,
          topic: chData.description,
          reason: `Server Builder: ${template.name}`,
        });
        details.push(`Created ${chData.type}: #${channel.name}`);
      }
    }

    recordAudit({
      who: executorId, what: `Built server from template: ${template.name}`,
      where: "discord", guildId: guild.id, result: "success",
      details: details.join("; "),
    });

    return { success: true, message: `✅ Server built from "${template.name}" template!`, details };
  } catch (error) {
    recordAudit({
      who: executorId, what: `Failed to build server from template: ${template.name}`,
      where: "discord", guildId: guild.id, result: "failure",
      details: error instanceof Error ? error.message : String(error),
    });
    return {
      success: false,
      message: `❌ Failed to build server: ${error instanceof Error ? error.message : "unknown error"}`,
      details,
    };
  }
}

export function listTemplates(): EmbedBuilder[] {
  return Object.entries(TEMPLATES).map(([key, template]) =>
    new EmbedBuilder()
      .setTitle(`📦 ${template.name}`)
      .setDescription(template.description)
      .addFields(
        { name: "Categories", value: String(template.categories.length), inline: true },
        { name: "Total Channels", value: String(template.categories.reduce((a, c) => a + c.channels.length, 0)), inline: true },
        { name: "Roles", value: String(template.roles.length), inline: true },
      )
      .setFooter({ text: `Template ID: ${key}` })
  );
}
