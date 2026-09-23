"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
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
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var permission_presets_exports = {};
__export(permission_presets_exports, {
  createApplyChannelPresetTool: () => createApplyChannelPresetTool,
  executeApplyChannelPreset: () => executeApplyChannelPreset,
  getPresetDefinition: () => getPresetDefinition,
  getValidPresetNames: () => getValidPresetNames,
  isValidPreset: () => isValidPreset
});
module.exports = __toCommonJS(permission_presets_exports);
var import_discord = require("discord.js");
var import_executor = require("../../executor");
var import_confirmation_store = require("../../confirmation-store");
var import_audit = require("../../audit");
var import_logger = require("../../../../logger");
var import_protection = require("../protection");
function hasManageChannels(member) {
  return member.permissions.has(import_discord.PermissionFlagsBits.ManageChannels);
}
const PROHIBITED_FLAGS = [
  import_discord.PermissionFlagsBits.Administrator,
  import_discord.PermissionFlagsBits.ManageGuild,
  import_discord.PermissionFlagsBits.ManageRoles,
  import_discord.PermissionFlagsBits.ManageChannels,
  import_discord.PermissionFlagsBits.BanMembers,
  import_discord.PermissionFlagsBits.KickMembers,
  import_discord.PermissionFlagsBits.MentionEveryone
];
function hasProhibitedFlags(permissions) {
  return PROHIBITED_FLAGS.some((flag) => (permissions & flag) === flag);
}
const VALID_PRESETS = [
  "read-only",
  "announcement",
  "text-chat",
  "voice-only",
  "staff-only",
  "public"
];
const PRESETS = {
  "read-only": {
    name: "read-only",
    description: "Members can view and read but cannot send messages.",
    allowedChannelTypes: [import_discord.ChannelType.GuildText, import_discord.ChannelType.GuildAnnouncement],
    everyoneOverwrites: {
      allow: import_discord.PermissionFlagsBits.ViewChannel | import_discord.PermissionFlagsBits.ReadMessageHistory,
      deny: import_discord.PermissionFlagsBits.SendMessages | import_discord.PermissionFlagsBits.SendMessagesInThreads
    }
  },
  "announcement": {
    name: "announcement",
    description: "Optimized for announcement/news channels. Members can view and read history but cannot send.",
    allowedChannelTypes: [import_discord.ChannelType.GuildText, import_discord.ChannelType.GuildAnnouncement],
    everyoneOverwrites: {
      allow: import_discord.PermissionFlagsBits.ViewChannel | import_discord.PermissionFlagsBits.ReadMessageHistory,
      deny: import_discord.PermissionFlagsBits.SendMessages | import_discord.PermissionFlagsBits.SendMessagesInThreads
    }
  },
  "text-chat": {
    name: "text-chat",
    description: "Standard text chat. Members can view, read, and send messages.",
    allowedChannelTypes: [import_discord.ChannelType.GuildText, import_discord.ChannelType.GuildAnnouncement],
    everyoneOverwrites: {
      allow: import_discord.PermissionFlagsBits.ViewChannel | import_discord.PermissionFlagsBits.ReadMessageHistory | import_discord.PermissionFlagsBits.SendMessages | import_discord.PermissionFlagsBits.SendMessagesInThreads | import_discord.PermissionFlagsBits.EmbedLinks | import_discord.PermissionFlagsBits.AttachFiles | import_discord.PermissionFlagsBits.AddReactions,
      deny: 0n
    }
  },
  "voice-only": {
    name: "voice-only",
    description: "Voice channel with standard voice permissions.",
    allowedChannelTypes: [import_discord.ChannelType.GuildVoice],
    everyoneOverwrites: {
      allow: import_discord.PermissionFlagsBits.ViewChannel | import_discord.PermissionFlagsBits.Connect | import_discord.PermissionFlagsBits.Speak | import_discord.PermissionFlagsBits.UseVAD,
      deny: import_discord.PermissionFlagsBits.SendMessages | import_discord.PermissionFlagsBits.SendMessagesInThreads
    }
  },
  "staff-only": {
    name: "staff-only",
    description: "Hidden from members. Only staff/management roles can view.",
    allowedChannelTypes: [import_discord.ChannelType.GuildText, import_discord.ChannelType.GuildAnnouncement, import_discord.ChannelType.GuildVoice],
    everyoneOverwrites: {
      allow: 0n,
      deny: import_discord.PermissionFlagsBits.ViewChannel
    }
  },
  "public": {
    name: "public",
    description: "Normal public access. Members can view, read, and send.",
    allowedChannelTypes: [import_discord.ChannelType.GuildText, import_discord.ChannelType.GuildAnnouncement, import_discord.ChannelType.GuildVoice],
    everyoneOverwrites: {
      allow: import_discord.PermissionFlagsBits.ViewChannel | import_discord.PermissionFlagsBits.ReadMessageHistory | import_discord.PermissionFlagsBits.SendMessages | import_discord.PermissionFlagsBits.SendMessagesInThreads | import_discord.PermissionFlagsBits.EmbedLinks | import_discord.PermissionFlagsBits.AttachFiles | import_discord.PermissionFlagsBits.AddReactions,
      deny: 0n
    }
  }
};
function isValidPreset(name) {
  return VALID_PRESETS.includes(name);
}
function getPresetDefinition(name) {
  return PRESETS[name];
}
function getValidPresetNames() {
  return [...VALID_PRESETS];
}
function createApplyChannelPresetTool(getClient) {
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
        required: true
      },
      {
        name: "preset",
        type: "string",
        description: "Preset name",
        required: true,
        allowedValues: VALID_PRESETS
      }
    ],
    execute: async (context) => {
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
      const targetChannel = guild.channels.cache.get(channelId);
      if (!targetChannel) return { status: "denied", message: `Channel "${channelId}" not found.`, denialReason: "RESOURCE_NOT_FOUND" };
      if (targetChannel.guild.id !== guild.id) return { status: "denied", message: "Channel belongs to a different guild.", denialReason: "GUILD_ONLY" };
      if ((0, import_protection.isChannelProtected)(context.guildId, channelId, targetChannel.parentId)) {
        return { status: "denied", message: `\u274C Cannot apply preset to protected channel #${targetChannel.name}.`, denialReason: "PROTECTED_RESOURCE" };
      }
      const preset = PRESETS[presetName];
      if (!preset.allowedChannelTypes.includes(targetChannel.type)) {
        const typeNames = preset.allowedChannelTypes.map((t) => {
          if (t === import_discord.ChannelType.GuildText) return "text";
          if (t === import_discord.ChannelType.GuildAnnouncement) return "announcement";
          if (t === import_discord.ChannelType.GuildVoice) return "voice";
          return String(t);
        }).join("/");
        return { status: "validation_error", message: `Preset "${presetName}" is not compatible with this channel type. Requires: ${typeNames}` };
      }
      if (hasProhibitedFlags(preset.everyoneOverwrites.allow)) {
        return { status: "denied", message: "\u274C Preset would grant prohibited permissions.", denialReason: "MISSING_DISCORD_PERMISSION" };
      }
      const requesterMember = context.requesterId ? await guild.members.fetch(context.requesterId).catch(() => null) : null;
      if (!requesterMember || !hasManageChannels(requesterMember)) {
        const result = { status: "denied", message: "\u274C You do not have **ManageChannels** permission.", denialReason: "MISSING_DISCORD_PERMISSION" };
        (0, import_audit.recordToolAudit)(context, result.status, result.denialReason, startTime, false);
        return result;
      }
      const botMember = await guild.members.me;
      if (!botMember || !hasManageChannels(botMember)) {
        const result = { status: "denied", message: "\u274C Bot does not have **ManageChannels** permission.", denialReason: "MISSING_DISCORD_PERMISSION" };
        (0, import_audit.recordToolAudit)(context, result.status, result.denialReason, startTime, false);
        return result;
      }
      if (presetName === "staff-only") {
        const { loadGuildAIConfig } = await import("../../channel-scope");
        const guildConfig = loadGuildAIConfig(context.guildId);
        if (guildConfig.managementRoleIds.length === 0) {
          return {
            status: "validation_error",
            message: "\u274C Staff-only preset requires management roles to be configured. No management role IDs found in guild AI config."
          };
        }
      }
      const allowPerms = new import_discord.PermissionsBitField(preset.everyoneOverwrites.allow).toArray();
      const denyPerms = new import_discord.PermissionsBitField(preset.everyoneOverwrites.deny).toArray();
      const changeDesc = [];
      if (allowPerms.length) changeDesc.push(`Allow: ${allowPerms.join(", ")}`);
      if (denyPerms.length) changeDesc.push(`Deny: ${denyPerms.join(", ")}`);
      const plan = (0, import_executor.createActionPlan)(
        context,
        "high",
        [{
          type: "modify",
          target: `#${targetChannel.name}`,
          description: `Apply "${presetName}" preset: ${changeDesc.join("; ")}`,
          permissions: "ManageChannels"
        }],
        true
      );
      plan.toolName = "apply_channel_preset";
      plan.arguments = { ...context.arguments };
      (0, import_confirmation_store.storePendingPlan)(plan);
      const lines = [
        "\u{1F4CB} **ACTION PLAN**",
        "",
        `**Action:** Apply Channel Preset`,
        `**Channel:** #${targetChannel.name}`,
        `**Preset:** ${presetName}`,
        `**Changes:**`,
        ...allowPerms.map((p) => `\u2022 \u2705 Allow ${p}`),
        ...denyPerms.map((p) => `\u2022 \u274C Deny ${p}`),
        "",
        `**Risk:** HIGH`,
        `**Required:** ManageChannels`,
        `**Requested by:** <@${context.requesterId}>`,
        "",
        `**Action ID:** \`${plan.id}\``,
        `**Expires:** 5 minutes`
      ];
      return { status: "confirmation_required", message: lines.join("\n"), plan };
    }
  };
}
async function executeApplyChannelPreset(plan, getClient) {
  const startTime = Date.now();
  const client = getClient();
  if (!client) return { status: "error", message: "Discord client is not connected." };
  const guild = await client.guilds.fetch(plan.guildId).catch(() => null);
  if (!guild) return { status: "denied", message: "Guild not found.", denialReason: "GUILD_ONLY" };
  const requesterMember = await guild.members.fetch(plan.requesterId).catch(() => null);
  if (!requesterMember || !hasManageChannels(requesterMember)) {
    return { status: "denied", message: "\u274C Permission revoked.", denialReason: "MISSING_DISCORD_PERMISSION" };
  }
  const botMember = await guild.members.me;
  if (!botMember || !hasManageChannels(botMember)) {
    return { status: "denied", message: "\u274C Bot lost ManageChannels.", denialReason: "MISSING_DISCORD_PERMISSION" };
  }
  const channelId = String(plan.arguments.channelId || "").trim();
  const presetName = String(plan.arguments.preset || "").trim();
  const targetChannel = guild.channels.cache.get(channelId);
  if (!targetChannel) return { status: "error", message: "Channel no longer exists." };
  if ((0, import_protection.isChannelProtected)(plan.guildId, channelId, targetChannel.parentId)) {
    return { status: "denied", message: "\u274C Channel is now protected.", denialReason: "PROTECTED_RESOURCE" };
  }
  if (!isValidPreset(presetName)) {
    return { status: "error", message: `Invalid preset: ${presetName}` };
  }
  const preset = PRESETS[presetName];
  if (!preset.allowedChannelTypes.includes(targetChannel.type)) {
    return { status: "error", message: "Channel type no longer compatible with preset." };
  }
  if (hasProhibitedFlags(preset.everyoneOverwrites.allow)) {
    return { status: "denied", message: "\u274C Preset grants prohibited permissions.", denialReason: "MISSING_DISCORD_PERMISSION" };
  }
  if (presetName === "staff-only") {
    const { loadGuildAIConfig } = await import("../../channel-scope");
    const guildConfig = loadGuildAIConfig(plan.guildId);
    if (guildConfig.managementRoleIds.length === 0) {
      return { status: "error", message: "\u274C No management roles configured." };
    }
  }
  try {
    const ch = targetChannel;
    const everyoneRole = guild.roles.everyone;
    await ch.permissionOverwrites?.edit(everyoneRole.id, {
      allow: preset.everyoneOverwrites.allow,
      deny: preset.everyoneOverwrites.deny
    });
    const allowPerms = new import_discord.PermissionsBitField(preset.everyoneOverwrites.allow).toArray();
    const denyPerms = new import_discord.PermissionsBitField(preset.everyoneOverwrites.deny).toArray();
    const result = {
      status: "success",
      message: `\u2705 **Preset applied**
Channel: #${targetChannel.name}
Preset: ${presetName}
Allow: ${allowPerms.length ? allowPerms.join(", ") : "none"}
Deny: ${denyPerms.length ? denyPerms.join(", ") : "none"}
Action ID: \`${plan.id}\``,
      data: { channelId, name: targetChannel.name, preset: presetName, allow: allowPerms, deny: denyPerms }
    };
    (0, import_audit.recordToolAudit)(
      { ...plan, channelId: plan.channelId, requesterName: "confirmed" },
      "success",
      void 0,
      startTime,
      false
    );
    return result;
  } catch (error) {
    import_logger.logger.error(`apply_channel_preset execution failed: ${error instanceof Error ? error.message : String(error)}`);
    return { status: "error", message: `\u274C Preset application failed. The issue has been logged.` };
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  createApplyChannelPresetTool,
  executeApplyChannelPreset,
  getPresetDefinition,
  getValidPresetNames,
  isValidPreset
});
