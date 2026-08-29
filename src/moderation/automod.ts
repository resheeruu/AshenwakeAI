import { Message, GuildMember, TextChannel, PermissionFlagsBits } from "discord.js";
import { logger } from "../logger";
import { loadGuildConfig, GuildConfig } from "../core/guild-config";
import { recordAudit } from "../security/audit";

interface FloodTracker {
  messages: Array<{ content: string; timestamp: number }>;
}

const floodTrackers = new Map<string, FloodTracker>();
const raidTracker = new Map<string, Array<{ userId: string; timestamp: number }>>();

export interface AutomodResult {
  flagged: boolean;
  action?: "delete" | "warn" | "timeout" | "kick";
  reason?: string;
  detail?: string;
}

export function checkAutomod(message: Message, member: GuildMember): AutomodResult {
  if (!message.guild) return { flagged: false };
  const config = loadGuildConfig(message.guild.id);
  if (!config.automod.enabled) return { flagged: false };
  const content = message.content;
  const guildId = message.guild.id;
  const userId = member.id;

  if (config.automod.antiSpam) {
    const floodKey = `${guildId}:${userId}`;
    let tracker = floodTrackers.get(floodKey);
    if (!tracker) {
      tracker = { messages: [] };
      floodTrackers.set(floodKey, tracker);
    }
    const now = Date.now();
    tracker.messages.push({ content, timestamp: now });
    tracker.messages = tracker.messages.filter((m) => now - m.timestamp < config.automod.floodWindowMs);
    if (tracker.messages.length > config.automod.maxMessages) {
      return { flagged: true, action: "timeout", reason: "Spam detected", detail: `${tracker.messages.length} messages in ${config.automod.floodWindowMs}ms` };
    }
  }

  if (config.automod.mentionSpam) {
    const mentionCount = message.mentions.users.size + message.mentions.roles.size;
    if (mentionCount > config.automod.maxMentions) {
      return { flagged: true, action: "delete", reason: "Mention spam", detail: `${mentionCount} mentions` };
    }
  }

  if (config.automod.antiInvite && /discord\.gg\/|discordapp\.com\/invite\//i.test(content)) {
    if (!member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      return { flagged: true, action: "delete", reason: "Invite link detected" };
    }
  }

  if (config.automod.antiLink && /https?:\/\/[^\s]+/i.test(content)) {
    if (!member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      return { flagged: true, action: "delete", reason: "Link detected" };
    }
  }

  if (config.automod.antiCaps) {
    const letters = content.replace(/[^a-zA-Z]/g, "");
    if (letters.length > 10) {
      const upper = letters.replace(/[^A-Z]/g, "").length;
      if (upper / letters.length > 0.7) {
        return { flagged: true, action: "warn", reason: "Excessive caps" };
      }
    }
  }

  if (config.automod.antiZalgo) {
    const zalgoRegex = /[\u0300-\u036f\u0489]/g;
    const zalgoCount = (content.match(zalgoRegex) || []).length;
    if (zalgoCount > 10) {
      return { flagged: true, action: "delete", reason: "Zalgo text detected" };
    }
  }

  if (config.automod.raidMode) {
    const raidKey = guildId;
    let raid = raidTracker.get(raidKey);
    if (!raid) {
      raid = [];
      raidTracker.set(raidKey, raid);
    }
    const now = Date.now();
    raid.push({ userId, timestamp: now });
    const recentJoins = raid.filter((r) => now - r.timestamp < 60_000);
    raidTracker.set(raidKey, recentJoins);
    const userRecentCount = recentJoins.filter((r) => r.userId === userId).length;
    if (userRecentCount > 5) {
      return { flagged: true, action: "kick", reason: "Raid detected", detail: `${userRecentCount} actions from same user in 60s` };
    }
    if (recentJoins.length > 20) {
      return { flagged: true, action: "warn", reason: "High activity detected", detail: `${recentJoins.length} total actions in 60s` };
    }
  }

  return { flagged: false };
}

export const automodCleanupInterval = setInterval(() => {
  for (const [key, tracker] of floodTrackers) {
    if (tracker.messages.length === 0) {
      floodTrackers.delete(key);
    }
  }
  for (const [key, entries] of raidTracker) {
    if (entries.length === 0) {
      raidTracker.delete(key);
    }
  }
}, 5 * 60 * 1000).unref();

export async function handleAutomodResult(
  message: Message,
  member: GuildMember,
  result: AutomodResult,
): Promise<void> {
  if (!result.flagged || !message.guild) return;

  try {
    if (result.action === "delete") {
      await message.delete().catch(() => {});
    }

    if (result.action === "timeout") {
      await member.timeout(5 * 60 * 1000, `AshenAI AutoMod: ${result.reason}`).catch(() => {});
    }

    if (result.action === "kick") {
      await member.kick(`AshenAI AutoMod: ${result.reason}`).catch(() => {});
    }

    const logChannel = message.guild.channels.cache.find(
      (ch) => ch.name === "mod-logs" || ch.name === "automod-logs"
    );

    if (logChannel && "send" in logChannel) {
      await logChannel.send({
        content: `🛡️ **AutoMod** | ${result.action?.toUpperCase() || "FLAGGED"}\n**User:** <@${member.id}>\n**Reason:** ${result.reason}\n**Detail:** ${result.detail || "N/A"}\n**Channel:** <#${message.channel.id}>`,
      }).catch(() => {});
    }

    recordAudit({
      who: "automod", what: `AutoMod: ${result.action} - ${result.reason}`,
      where: "discord", guildId: message.guild.id, result: "success",
      details: `User: ${member.id}, Channel: ${message.channel.id}`,
    });
  } catch (error) {
    logger.error(`❌ AutoMod handler failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}
