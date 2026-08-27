import type { Client } from "discord.js";
import { PermissionFlagsBits, ChannelType, PermissionsBitField } from "discord.js";
import type { ToolDefinition, ToolContext, ToolResult, ActionPlan } from "../../types";
import { createActionPlan } from "../../executor";
import { storePendingPlan } from "../../confirmation-store";
import { recordToolAudit } from "../../audit";
import { logger } from "../../../../logger";
import { isChannelProtected } from "../protection";

/* ================================================================
 * HELPER
 * ================================================================ */

function hasManageChannels(member: { permissions: { has: (perm: bigint) => boolean } }): boolean {
  return member.permissions.has(PermissionFlagsBits.ManageChannels);
}

/* ================================================================
 * PROHIBITED PERMISSIONS — never grant these via presets
 * ================================================================ */

const PROHIBITED_FLAGS: bigint[] = [
  PermissionFlagsBits.Administrator,
  PermissionFlagsBits.ManageGuild,
  PermissionFlagsBits.ManageRoles,
  PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.BanMembers,
  PermissionFlagsBits.KickMembers,
  PermissionFlagsBits.MentionEveryone,
];

function hasProhibitedFlags(permissions: bigint): boolean {
  return PROHIBITED_FLAGS.some((flag) => (permissions & flag) === flag);
}

/* ================================================================
 * PRESET DEFINITIONS
 *
 * Each preset defines exact permission overwrites for @everyone.
 * All presets are deterministic and documented.
 * ================================================================ */

export type PresetName =
  | "read-only"
  | "announcement"
  | "text-chat"
  | "voice-only"
  | "staff-only"
  | "public";

const VALID_PRESETS: PresetName[] = [
  "read-only",
  "announcement",
  "text-chat",
  "voice-only",
  "staff-only",
  "public",
];

interface PresetDefinition {
  name: PresetName;
  description: string;
  allowedChannelTypes: ChannelType[];
  everyoneOverwrites: {
    allow: bigint;
    deny: bigint;
  };
}

const PRESETS: Record<PresetName, PresetDefinition> = {
  "read-only": {
    name: "read-only",
    description: "Members can view and read but cannot send messages.",
    allowedChannelTypes: [ChannelType.GuildText, ChannelType.GuildAnnouncement],
    everyoneOverwrites: {
      allow: PermissionFlagsBits.ViewChannel | PermissionFlagsBits.ReadMessageHistory,
      deny: PermissionFlagsBits.SendMessages | PermissionFlagsBits.SendMessagesInThreads,
    },
  },
  "announcement": {
    name: "announcement",
    description: "Optimized for announcement/news channels. Members can view and read history but cannot send.",
    allowedChannelTypes: [ChannelType.GuildText, ChannelType.GuildAnnouncement],
    everyoneOverwrites: {
      allow: PermissionFlagsBits.ViewChannel | PermissionFlagsBits.ReadMessageHistory,
      deny: PermissionFlagsBits.SendMessages | PermissionFlagsBits.SendMessagesInThreads,
    },
  },
  "text-chat": {
    name: "text-chat",
    description: "Standard text chat. Members can view, read, and send messages.",
    allowedChannelTypes: [ChannelType.GuildText, ChannelType.GuildAnnouncement],
    everyoneOverwrites: {
      allow: PermissionFlagsBits.ViewChannel | PermissionFlagsBits.ReadMessageHistory | PermissionFlagsBits.SendMessages | PermissionFlagsBits.SendMessagesInThreads | PermissionFlagsBits.EmbedLinks | PermissionFlagsBits.AttachFiles | PermissionFlagsBits.AddReactions,
      deny: 0n,
    },
  },
  "voice-only": {
    name: "voice-only",
    description: "Voice channel with standard voice permissions.",
    allowedChannelTypes: [ChannelType.GuildVoice],
    everyoneOverwrites: {
      allow: PermissionFlagsBits.ViewChannel | PermissionFlagsBits.Connect | PermissionFlagsBits.Speak | PermissionFlagsBits.UseVAD,
      deny: PermissionFlagsBits.SendMessages | PermissionFlagsBits.SendMessagesInThreads,
    },
  },
  "staff-only": {
    name: "staff-only",
    description: "Hidden from members. Only staff/management roles can view.",
    allowedChannelTypes: [ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildVoice],
    everyoneOverwrites: {
      allow: 0n,
      deny: PermissionFlagsBits.ViewChannel,
    },
  },
  "public": {
    name: "public",
    description: "Normal public access. Members can view, read, and send.",
    allowedChannelTypes: [ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildVoice],
    everyoneOverwrites: {
      allow: PermissionFlagsBits.ViewChannel | PermissionFlagsBits.ReadMessageHistory | PermissionFlagsBits.SendMessages | PermissionFlagsBits.SendMessagesInThreads | PermissionFlagsBits.EmbedLinks | PermissionFlagsBits.AttachFiles | PermissionFlagsBits.AddReactions,
      deny: 0n,
    },
  },
};

export function isValidPreset(name: string): name is PresetName {
  return VALID_PRESETS.includes(name as PresetName);
}

export function getPresetDefinition(name: PresetName): PresetDefinition {
  return PRESETS[name];
}

export function getValidPresetNames(): PresetName[] {
  return [...VALID_PRESETS];
}

/* ================================================================
 * apply_channel_preset — Apply a permission preset to a channel.
 *
 * HIGH risk. Confirmation required. Admin+ role.
 * ================================================================ */

export function createApplyChannelPresetTool(getClient: () => Client | null): ToolDefinition {
  return {
    name: "apply_channel_preset",
    description: "Apply a permission preset to a channel (read-only, announcement, text-chat, voice-only, staff-only, public).",
    category: "discord",
    requiredRole: "admin",
    requiredDiscordPermissions: ["ManageChannels"],
    allowedScopes: ["AI_MANAGEMENT"],
    confirmationRequired: true,
    riskLevel: "high",
    parameters: [
      {
        name: "channelId",
        type: "string",
        description: "ID of the channel",
        required: true,
      },
      {
        name: "preset",
        type: "string",
        description: "Preset name",
        required: true,
        allowedValues: VALID_PRESETS,
      },
    ],
    execute: async (context: ToolContext): Promise<ToolResult> => {
      const startTime = Date.now();
      const client = getClient();

      if (!client) return { status: "error", message: "Discord client is not connected." };

      const guild = await client.guilds.fetch(context.guildId).catch(() => null);
      if (!guild) return { status: "denied", message: "Could not fetch guild.", denialReason: "GUILD_ONLY" };

      const channelId = String(context.arguments.channelId || "").trim();
      const presetName = String(context.arguments.preset || "").trim();

      if (!channelId) return { status: "validation_error", message: "Missing required parameter: channelId" };
      if (!presetName) return { status: "validation_error", message: "Missing required parameter: preset" };

      if (!isValidPreset(presetName)) {
        return { status: "validation_error", message: `Invalid preset "${presetName}". Valid presets: ${VALID_PRESETS.join(", ")}` };
      }

      // ── Target channel check ─────────────────────────────────────
      const targetChannel = guild.channels.cache.get(channelId);
      if (!targetChannel) return { status: "denied", message: `Channel "${channelId}" not found.`, denialReason: "RESOURCE_NOT_FOUND" };
      if (targetChannel.guild.id !== guild.id) return { status: "denied", message: "Channel belongs to a different guild.", denialReason: "GUILD_ONLY" };

      // ── Protected channel check (including category inheritance) ──
      if (isChannelProtected(context.guildId, channelId, targetChannel.parentId)) {
        return { status: "denied", message: `❌ Cannot apply preset to protected channel #${targetChannel.name}.`, denialReason: "PROTECTED_RESOURCE" };
      }

      // ── Channel type check ───────────────────────────────────────
      const preset = PRESETS[presetName];
      if (!preset.allowedChannelTypes.includes(targetChannel.type)) {
        const typeNames = preset.allowedChannelTypes.map((t) => {
          if (t === ChannelType.GuildText) return "text";
          if (t === ChannelType.GuildAnnouncement) return "announcement";
          if (t === ChannelType.GuildVoice) return "voice";
          return String(t);
        }).join("/");
        return { status: "validation_error", message: `Preset "${presetName}" is not compatible with this channel type. Requires: ${typeNames}` };
      }

      // ── Dangerous permission check ───────────────────────────────
      if (hasProhibitedFlags(preset.everyoneOverwrites.allow)) {
        return { status: "denied", message: "❌ Preset would grant prohibited permissions.", denialReason: "MISSING_DISCORD_PERMISSION" };
      }

      // ── Requester permission check ───────────────────────────────
      const requesterMember = context.requesterId
        ? await guild.members.fetch(context.requesterId).catch(() => null)
        : null;

      if (!requesterMember || !hasManageChannels(requesterMember)) {
        const result: ToolResult = { status: "denied", message: "❌ You do not have **ManageChannels** permission.", denialReason: "MISSING_DISCORD_PERMISSION" };
        recordToolAudit(context, result.status, result.denialReason, startTime, false);
        return result;
      }

      const botMember = await guild.members.me;
      if (!botMember || !hasManageChannels(botMember)) {
        const result: ToolResult = { status: "denied", message: "❌ Bot does not have **ManageChannels** permission.", denialReason: "MISSING_DISCORD_PERMISSION" };
        recordToolAudit(context, result.status, result.denialReason, startTime, false);
        return result;
      }

      // ── Staff-only requires management roles configured ──────────
      if (presetName === "staff-only") {
        const { loadGuildAIConfig } = await import("../../channel-scope");
        const guildConfig = loadGuildAIConfig(context.guildId);
        if (guildConfig.managementRoleIds.length === 0) {
          return {
            status: "validation_error",
            message: "❌ Staff-only preset requires management roles to be configured. No management role IDs found in guild AI config.",
          };
        }
      }

      // ── Build change description ─────────────────────────────────
      const allowPerms = new PermissionsBitField(preset.everyoneOverwrites.allow).toArray();
      const denyPerms = new PermissionsBitField(preset.everyoneOverwrites.deny).toArray();

      const changeDesc: string[] = [];
      if (allowPerms.length) changeDesc.push(`Allow: ${allowPerms.join(", ")}`);
      if (denyPerms.length) changeDesc.push(`Deny: ${denyPerms.join(", ")}`);

      // ── Build ActionPlan ─────────────────────────────────────────
      const plan = createActionPlan(
        context,
        "high",
        [{
          type: "modify",
          target: `#${targetChannel.name}`,
          description: `Apply "${presetName}" preset: ${changeDesc.join("; ")}`,
          permissions: "ManageChannels",
        }],
        true,
      );
      (plan as any).toolName = "apply_channel_preset";
      plan.arguments = { ...context.arguments };

      storePendingPlan(plan);

      const lines = [
        "📋 **ACTION PLAN**",
        "",
        `**Action:** Apply Channel Preset`,
        `**Channel:** #${targetChannel.name}`,
        `**Preset:** ${presetName}`,
        `**Changes:**`,
        ...allowPerms.map((p) => `• ✅ Allow ${p}`),
        ...denyPerms.map((p) => `• ❌ Deny ${p}`),
        "",
        `**Risk:** HIGH`,
        `**Required:** ManageChannels`,
        `**Requested by:** <@${context.requesterId}>`,
        "",
        `**Action ID:** \`${plan.id}\``,
        `**Expires:** 5 minutes`,
      ];

      return { status: "confirmation_required", message: lines.join("\n"), plan };
    },
  };
}

export async function executeApplyChannelPreset(
  plan: ActionPlan,
  getClient: () => Client | null,
): Promise<ToolResult> {
  const startTime = Date.now();
  const client = getClient();
  if (!client) return { status: "error", message: "Discord client is not connected." };

  const guild = await client.guilds.fetch(plan.guildId).catch(() => null);
  if (!guild) return { status: "denied", message: "Guild not found.", denialReason: "GUILD_ONLY" };

  const requesterMember = await guild.members.fetch(plan.requesterId).catch(() => null);
  if (!requesterMember || !hasManageChannels(requesterMember)) {
    return { status: "denied", message: "❌ Permission revoked.", denialReason: "MISSING_DISCORD_PERMISSION" };
  }

  const botMember = await guild.members.me;
  if (!botMember || !hasManageChannels(botMember)) {
    return { status: "denied", message: "❌ Bot lost ManageChannels.", denialReason: "MISSING_DISCORD_PERMISSION" };
  }

  const channelId = String(plan.arguments.channelId || "").trim();
  const presetName = String(plan.arguments.preset || "").trim() as PresetName;

  const targetChannel = guild.channels.cache.get(channelId);
  if (!targetChannel) return { status: "error", message: "Channel no longer exists." };

  // Re-check protected (including category inheritance)
  if (isChannelProtected(plan.guildId, channelId, targetChannel.parentId)) {
    return { status: "denied", message: "❌ Channel is now protected.", denialReason: "PROTECTED_RESOURCE" };
  }

  if (!isValidPreset(presetName)) {
    return { status: "error", message: `Invalid preset: ${presetName}` };
  }

  const preset = PRESETS[presetName];

  // Re-check channel type
  if (!preset.allowedChannelTypes.includes(targetChannel.type)) {
    return { status: "error", message: "Channel type no longer compatible with preset." };
  }

  // Re-check prohibited permissions
  if (hasProhibitedFlags(preset.everyoneOverwrites.allow)) {
    return { status: "denied", message: "❌ Preset grants prohibited permissions.", denialReason: "MISSING_DISCORD_PERMISSION" };
  }

  // Re-check staff-only role config
  if (presetName === "staff-only") {
    const { loadGuildAIConfig } = await import("../../channel-scope");
    const guildConfig = loadGuildAIConfig(plan.guildId);
    if (guildConfig.managementRoleIds.length === 0) {
      return { status: "error", message: "❌ No management roles configured." };
    }
  }

  try {
    const ch = targetChannel as any;
    const everyoneRole = guild.roles.everyone;

    await ch.permissionOverwrites?.edit(everyoneRole.id, {
      allow: preset.everyoneOverwrites.allow,
      deny: preset.everyoneOverwrites.deny,
    });

    const allowPerms = new PermissionsBitField(preset.everyoneOverwrites.allow).toArray();
    const denyPerms = new PermissionsBitField(preset.everyoneOverwrites.deny).toArray();

    const result: ToolResult = {
      status: "success",
      message:
        `✅ **Preset applied**\n` +
        `Channel: #${targetChannel.name}\n` +
        `Preset: ${presetName}\n` +
        `Allow: ${allowPerms.length ? allowPerms.join(", ") : "none"}\n` +
        `Deny: ${denyPerms.length ? denyPerms.join(", ") : "none"}\n` +
        `Action ID: \`${plan.id}\``,
      data: { channelId, name: targetChannel.name, preset: presetName, allow: allowPerms, deny: denyPerms },
    };

    recordToolAudit(
      { ...plan, channelId: plan.channelId, requesterName: "confirmed" } as any,
      "success", undefined, startTime, false,
    );
    return result;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`apply_channel_preset execution failed: ${msg}`);
    return { status: "error", message: `❌ Preset application failed: ${msg}` };
  }
}
