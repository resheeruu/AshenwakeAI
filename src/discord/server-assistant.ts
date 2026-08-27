import { Guild, TextChannel, ChannelType, PermissionFlagsBits, EmbedBuilder } from "discord.js";
import { logger } from "../logger";
import { loadGuildConfig, saveGuildConfig } from "../core/guild-config";
import { assessRisk } from "../security/risk-engine";
import { recordAudit } from "../security/audit";
import { resolveRole, hasPermission } from "../security/permissions";
import { config as appConfig } from "../config/env";

export interface ServerAction {
  intent: string;
  action: string;
  target?: string;
  details?: string;
  riskLevel: "safe" | "low" | "medium" | "high" | "critical";
  requiresConfirmation: boolean;
}

export function parseServerIntent(content: string): ServerAction | null {
  const lower = content.toLowerCase();

  if (/\b(create|make|add)\b.*\b(channel|text|voice)\b/.test(lower)) {
    const nameMatch = content.match(/(?:channel|text|voice)\s+(?:called|named|channel)?\s*[`"']?(\S+)[`"']?/i);
    return {
      intent: "create_channel",
      action: "channel_create",
      target: nameMatch?.[1] || "new-channel",
      riskLevel: "medium",
      requiresConfirmation: true,
    };
  }

  if (/\b(create|make|add)\b.*\b(category|group|section)\b/.test(lower)) {
    const nameMatch = content.match(/(?:category|group|section)\s+(?:called|named)?\s*[`"']?(\S+)[`"']?/i);
    return {
      intent: "create_category",
      action: "channel_create",
      target: nameMatch?.[1] || "new-category",
      riskLevel: "medium",
      requiresConfirmation: true,
    };
  }

  if (/\b(create|make|add)\b.*\b(role)\b/.test(lower)) {
    const nameMatch = content.match(/role\s+(?:called|named)?\s*[`"']?(\S+)[`"']?/i);
    return {
      intent: "create_role",
      action: "role_create",
      target: nameMatch?.[1] || "new-role",
      riskLevel: "medium",
      requiresConfirmation: true,
    };
  }

  if (/\b(delete|remove|destroy)\b.*\b(channel)\b/.test(lower)) {
    return {
      intent: "delete_channel",
      action: "channel_delete",
      riskLevel: "critical",
      requiresConfirmation: true,
    };
  }

  if (/\b(lock|lockdown)\b/.test(lower)) {
    return {
      intent: "lock_channel",
      action: "lock",
      riskLevel: "medium",
      requiresConfirmation: true,
    };
  }

  if (/\b(unlock)\b/.test(lower)) {
    return {
      intent: "unlock_channel",
      action: "unlock",
      riskLevel: "low",
      requiresConfirmation: false,
    };
  }

  if (/\b(set\s*up|configure|setup)\b.*\b(ticket|support)\b/.test(lower)) {
    return {
      intent: "setup_tickets",
      action: "ticket_manage",
      riskLevel: "medium",
      requiresConfirmation: true,
    };
  }

  if (/\b(recommend|suggest|structure|organize)\b/.test(lower)) {
    return {
      intent: "recommend_structure",
      action: "none",
      riskLevel: "safe",
      requiresConfirmation: false,
    };
  }

  return null;
}

export async function executeServerAction(
  guild: Guild,
  action: ServerAction,
  executorId: string,
  executorName: string,
): Promise<{ success: boolean; message: string }> {
  const role = resolveRole({
    userId: executorId,
    guildOwnerId: guild.ownerId,
    adminIds: appConfig.admin.discordIds,
  });
  const perm = hasPermission(role, "admin");
  if (!perm.allowed) {
    return { success: false, message: `❌ Permission denied: ${perm.reason}` };
  }

  const config = loadGuildConfig(guild.id);

  const risk = assessRisk(action.action, action.target, false);
  if (risk.level === "critical") {
    return {
      success: false,
      message: `⚠️ This action requires explicit confirmation. Risk level: ${risk.level}. Reason: ${risk.reason}`,
    };
  }

  try {
    switch (action.action) {
      case "channel_create": {
        const channel = await guild.channels.create({
          name: action.target || "new-channel",
          type: ChannelType.GuildText,
        });
        recordAudit({
          who: executorId, whoName: executorName,
          what: `Created channel #${channel.name}`,
          where: "discord", guildId: guild.id, result: "success",
        });
        return { success: true, message: `✅ Created channel <#${channel.id}>.` };
      }

      case "role_create": {
        const role = await guild.roles.create({
          name: action.target || "new-role",
          reason: `Created by ${executorName} via Server Assistant`,
        });
        recordAudit({
          who: executorId, whoName: executorName,
          what: `Created role @${role.name}`,
          where: "discord", guildId: guild.id, result: "success",
        });
        return { success: true, message: `✅ Created role <@&${role.id}>.` };
      }

      case "lock": {
        const channel = guild.channels.cache.get(config.assistantChannelId || guild.systemChannelId || "");
        if (channel && "permissionOverwrites" in channel) {
          await channel.permissionOverwrites.edit(guild.id, {
            SendMessages: false,
          });
          recordAudit({
            who: executorId, whoName: executorName,
            what: `Locked channel #${channel.name}`,
            where: "discord", guildId: guild.id, result: "success",
          });
          return { success: true, message: `🔒 Locked <#${channel.id}>.` };
        }
        return { success: false, message: "❌ Could not find a channel to lock." };
      }

      case "unlock": {
        const channel = guild.channels.cache.get(config.assistantChannelId || guild.systemChannelId || "");
        if (channel && "permissionOverwrites" in channel) {
          await channel.permissionOverwrites.edit(guild.id, {
            SendMessages: null,
          });
          recordAudit({
            who: executorId, whoName: executorName,
            what: `Unlocked channel #${channel.name}`,
            where: "discord", guildId: guild.id, result: "success",
          });
          return { success: true, message: `🔓 Unlocked <#${channel.id}>.` };
        }
        return { success: false, message: "❌ Could not find a channel to unlock." };
      }

      default:
        return { success: false, message: `❌ Unknown action: ${action.action}` };
    }
  } catch (error) {
    recordAudit({
      who: executorId, whoName: executorName,
      what: `Failed: ${action.action}`,
      where: "discord", guildId: guild.id, result: "failure",
      details: error instanceof Error ? error.message : String(error),
    });
    return {
      success: false,
      message: `❌ Failed to execute ${action.action}: ${error instanceof Error ? error.message : "unknown error"}`,
    };
  }
}

export function buildServerAssistantEmbed(action: ServerAction): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle("🛠️ Server Assistant")
    .setDescription(`I detected a server management intent: **${action.intent}**`)
    .addFields(
      { name: "Action", value: action.action, inline: true },
      { name: "Target", value: action.target || "N/A", inline: true },
      { name: "Risk Level", value: action.riskLevel, inline: true },
    )
    .setColor(action.riskLevel === "critical" ? 0xff0000 : action.riskLevel === "medium" ? 0xffaa00 : 0x00aa00)
    .setTimestamp();
}
