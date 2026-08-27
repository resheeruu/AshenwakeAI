import type { Client } from "discord.js";
import { PermissionFlagsBits, PermissionsBitField } from "discord.js";
import type { ToolDefinition, ToolContext, ToolResult, ActionPlan } from "../../types";
import { createActionPlan } from "../../executor";
import { storePendingPlan } from "../../confirmation-store";
import { recordToolAudit } from "../../audit";
import { logger } from "../../../../logger";
import { isChannelProtected } from "../protection";

/* ================================================================
 * PROHIBITED PERMISSIONS — never grant these via AI tools
 * ================================================================ */

const PROHIBITED_PERMISSIONS = [
  "Administrator",
  "ManageGuild",
  "ManageRoles",
  "ManageChannels",
];

const PROHIBITED_FLAGS: bigint[] = [
  PermissionFlagsBits.Administrator,
  PermissionFlagsBits.ManageGuild,
  PermissionFlagsBits.ManageRoles,
  PermissionFlagsBits.ManageChannels,
];

/* ================================================================
 * VALID PERMISSION FLAGS
 * ================================================================ */

const VALID_FLAGS: Record<string, bigint> = {
  ViewChannel: PermissionFlagsBits.ViewChannel,
  SendMessages: PermissionFlagsBits.SendMessages,
  SendMessagesInThreads: PermissionFlagsBits.SendMessagesInThreads,
  ReadMessageHistory: PermissionFlagsBits.ReadMessageHistory,
  EmbedLinks: PermissionFlagsBits.EmbedLinks,
  AttachFiles: PermissionFlagsBits.AttachFiles,
  AddReactions: PermissionFlagsBits.AddReactions,
  UseExternalEmojis: PermissionFlagsBits.UseExternalEmojis,
  Connect: PermissionFlagsBits.Connect,
  Speak: PermissionFlagsBits.Speak,
  UseVAD: PermissionFlagsBits.UseVAD,
};

function hasManageChannels(member: { permissions: { has: (perm: bigint) => boolean } }): boolean {
  return member.permissions.has(PermissionFlagsBits.ManageChannels);
}

/* ================================================================
 * manage_channel_permissions — Set channel permission overwrites.
 *
 * HIGH risk. Confirmation required. Admin+ role.
 * ================================================================ */

export function createManageChannelPermissionsTool(getClient: () => Client | null): ToolDefinition {
  return {
    name: "manage_channel_permissions",
    description: "Allow or deny a role's permissions on a channel.",
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
        name: "roleId",
        type: "string",
        description: "ID of the role",
        required: true,
      },
      {
        name: "permission",
        type: "string",
        description: "Permission flag name",
        required: true,
        allowedValues: Object.keys(VALID_FLAGS),
      },
      {
        name: "allow",
        type: "boolean",
        description: "true = allow, false = deny",
        required: true,
      },
    ],
    execute: async (context: ToolContext): Promise<ToolResult> => {
      const startTime = Date.now();
      const client = getClient();

      if (!client) return { status: "error", message: "Discord client is not connected." };

      const guild = await client.guilds.fetch(context.guildId).catch(() => null);
      if (!guild) return { status: "denied", message: "Could not fetch guild.", denialReason: "GUILD_ONLY" };

      const channelId = String(context.arguments.channelId || "").trim();
      const roleId = String(context.arguments.roleId || "").trim();
      const permission = String(context.arguments.permission || "").trim();
      const allow = Boolean(context.arguments.allow);

      if (!channelId) return { status: "validation_error", message: "Missing required parameter: channelId" };
      if (!roleId) return { status: "validation_error", message: "Missing required parameter: roleId" };
      if (!permission) return { status: "validation_error", message: "Missing required parameter: permission" };

      // ── Validate permission flag ─────────────────────────────────
      const flag = VALID_FLAGS[permission];
      if (!flag) {
        return { status: "validation_error", message: `Invalid permission "${permission}". Allowed: ${Object.keys(VALID_FLAGS).join(", ")}` };
      }

      // ── Check prohibited permissions ─────────────────────────────
      if (PROHIBITED_FLAGS.includes(flag)) {
        return {
          status: "denied",
          message: `❌ Cannot modify **${permission}** via AI tools. This is a prohibited permission.`,
          denialReason: "MISSING_DISCORD_PERMISSION",
        };
      }

      // ── Target channel check ─────────────────────────────────────
      const targetChannel = guild.channels.cache.get(channelId);
      if (!targetChannel) return { status: "denied", message: `Channel "${channelId}" not found.`, denialReason: "RESOURCE_NOT_FOUND" };
      if (targetChannel.guild.id !== guild.id) return { status: "denied", message: "Channel belongs to a different guild.", denialReason: "GUILD_ONLY" };

      // ── Protected channel check (including category inheritance) ──
      if (isChannelProtected(context.guildId, channelId, targetChannel.parentId)) {
        return { status: "denied", message: `❌ Cannot modify permissions on protected channel #${targetChannel.name}.`, denialReason: "PROTECTED_RESOURCE" };
      }

      // ── Target role check ────────────────────────────────────────
      const targetRole = guild.roles.cache.get(roleId);
      if (!targetRole) return { status: "denied", message: `Role "${roleId}" not found.`, denialReason: "RESOURCE_NOT_FOUND" };

      // ── Role hierarchy check ─────────────────────────────────────
      const botMember = await guild.members.me;
      if (!botMember) return { status: "error", message: "Bot member not found." };

      if (targetRole.position >= botMember.roles.highest.position) {
        return {
          status: "denied",
          message: "❌ Cannot modify a role equal to or higher than the bot's highest role.",
          denialReason: "MISSING_DISCORD_PERMISSION",
        };
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

      if (!botMember.permissions.has(PermissionFlagsBits.ManageChannels)) {
        const result: ToolResult = { status: "denied", message: "❌ Bot does not have **ManageChannels** permission.", denialReason: "MISSING_DISCORD_PERMISSION" };
        recordToolAudit(context, result.status, result.denialReason, startTime, false);
        return result;
      }

      // ── Build ActionPlan ─────────────────────────────────────────
      const plan = createActionPlan(
        context,
        "high",
        [{
          type: "modify",
          target: `#${targetChannel.name}`,
          description: `${allow ? "Allow" : "Deny"} ${permission} for @${targetRole.name}`,
          permissions: "ManageChannels",
        }],
        true,
      );
      (plan as any).toolName = "manage_channel_permissions";
      plan.arguments = { ...context.arguments };

      storePendingPlan(plan);

      const lines = [
        "📋 **ACTION PLAN**",
        "",
        `**Action:** Channel Permissions`,
        `**Channel:** #${targetChannel.name}`,
        `**Target Role:** @${targetRole.name}`,
        `**Permission:** ${permission}`,
        `**Effect:** ${allow ? "✅ Allow" : "❌ Deny"}`,
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

export async function executeManageChannelPermissions(
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
  const roleId = String(plan.arguments.roleId || "").trim();
  const permission = String(plan.arguments.permission || "").trim();
  const allow = Boolean(plan.arguments.allow);

  const targetChannel = guild.channels.cache.get(channelId);
  if (!targetChannel) return { status: "error", message: "Channel no longer exists." };

  // Re-check protected (including category inheritance)
  if (isChannelProtected(plan.guildId, channelId, targetChannel.parentId)) {
    return { status: "denied", message: "❌ Channel is now protected.", denialReason: "PROTECTED_RESOURCE" };
  }

  const targetRole = guild.roles.cache.get(roleId);
  if (!targetRole) return { status: "error", message: "Role no longer exists." };

  const flag = VALID_FLAGS[permission];
  if (!flag) return { status: "error", message: `Invalid permission: ${permission}` };

  // Re-check prohibited
  if (PROHIBITED_FLAGS.includes(flag)) {
    return { status: "denied", message: `❌ Cannot modify ${permission}.`, denialReason: "MISSING_DISCORD_PERMISSION" };
  }

  // Re-check hierarchy
  if (targetRole.position >= botMember.roles.highest.position) {
    return { status: "denied", message: "❌ Role hierarchy conflict.", denialReason: "MISSING_DISCORD_PERMISSION" };
  }

  try {
    const ch = targetChannel as any;
    const currentOverwrite = ch.permissionOverwrites?.cache?.get(roleId);
    const currentAllowed = currentOverwrite?.allow?.bitfield ?? 0n;
    const currentDenied = currentOverwrite?.deny?.bitfield ?? 0n;

    const newAllowed = new PermissionsBitField(currentAllowed);
    const newDenied = new PermissionsBitField(currentDenied);

    if (allow) {
      newAllowed.add(flag);
      newDenied.remove(flag);
    } else {
      newDenied.add(flag);
      newAllowed.remove(flag);
    }

    await ch.permissionOverwrites?.edit(roleId, {
      allow: newAllowed,
      deny: newDenied,
    });

    const result: ToolResult = {
      status: "success",
      message:
        `✅ **Permission updated**\n` +
        `Channel: #${targetChannel.name}\n` +
        `Role: @${targetRole.name}\n` +
        `${permission}: ${allow ? "Allowed" : "Denied"}\n` +
        `Action ID: \`${plan.id}\``,
      data: { channelId, roleId, permission, allow },
    };

    recordToolAudit(
      { ...plan, channelId: plan.channelId, requesterName: "confirmed" } as any,
      "success", undefined, startTime, false,
    );
    return result;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`manage_channel_permissions execution failed: ${msg}`);
    return { status: "error", message: `❌ Permission update failed: ${msg}` };
  }
}
