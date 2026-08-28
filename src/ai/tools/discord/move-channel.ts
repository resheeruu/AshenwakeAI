import type { Client } from "discord.js";
import { PermissionFlagsBits, ChannelType } from "discord.js";
import type { ToolDefinition, ToolContext, ToolResult, ActionPlan } from "../types";
import { createActionPlan } from "../executor";
import { storePendingPlan } from "../confirmation-store";
import { recordToolAudit } from "../audit";
import { logger } from "../../../logger";
import { isChannelProtected, isProtectedCategory } from "./protection";

/* ================================================================
 * HELPER
 * ================================================================ */

function hasManageChannels(member: { permissions: { has: (perm: bigint) => boolean } }): boolean {
  return member.permissions.has(PermissionFlagsBits.ManageChannels);
}

/* ================================================================
 * move_channel — Move a channel to a different category.
 *
 * MEDIUM risk. Confirmation required. AI_MANAGEMENT scope.
 * ================================================================ */

export function createMoveChannelTool(getClient: () => Client | null): ToolDefinition {
  return {
    name: "move_channel",
    description: "Move a channel to a different category (or uncategorize it).",
    category: "discord",
    requiredRole: "moderator",
    requiredDiscordPermissions: ["ManageChannels"],
    allowedScopes: ["AI_MANAGEMENT"],
    confirmationRequired: true,
    riskLevel: "medium",
    parameters: [
      {
        name: "channelId",
        type: "string",
        description: "ID of the channel to move",
        required: true,
      },
      {
        name: "categoryId",
        type: "string",
        description: "Target category ID (empty string to uncategorize)",
        required: true,
      },
    ],
    execute: async (context: ToolContext): Promise<ToolResult> => {
      const startTime = Date.now();
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

      // ── Argument validation ──────────────────────────────────────
      const channelId = String(context.arguments.channelId || "").trim();
      const categoryId = String(context.arguments.categoryId || "").trim();

      if (!channelId) {
        return { status: "validation_error", message: "Missing required parameter: channelId" };
      }

      // ── Target channel check ─────────────────────────────────────
      const targetChannel = guild.channels.cache.get(channelId);
      if (!targetChannel) {
        return {
          status: "denied",
          message: `Channel "${channelId}" not found in this guild.`,
          denialReason: "RESOURCE_NOT_FOUND",
        };
      }

      if (targetChannel.guild.id !== guild.id) {
        return {
          status: "denied",
          message: "Channel belongs to a different guild.",
          denialReason: "GUILD_ONLY",
        };
      }

      // ── Protected channel check (including category inheritance) ──
      if (isChannelProtected(context.guildId, channelId, targetChannel.parentId)) {
        return {
          status: "denied",
          message: `❌ Cannot move protected channel #${targetChannel.name}.`,
          denialReason: "PROTECTED_RESOURCE",
        };
      }

      // ── Target category check ────────────────────────────────────
      if (categoryId) {
        const targetCategory = guild.channels.cache.get(categoryId);
        if (!targetCategory || targetCategory.type !== ChannelType.GuildCategory) {
          return {
            status: "validation_error",
            message: `Category "${categoryId}" not found or is not a category.`,
          };
        }
        if (targetCategory.guild.id !== guild.id) {
          return {
            status: "denied",
            message: "Category belongs to a different guild.",
            denialReason: "GUILD_ONLY",
          };
        }
        // Deny moving INTO a protected category
        if (isProtectedCategory(context.guildId, categoryId)) {
          return {
            status: "denied",
            message: `❌ Cannot move channel into protected category "${targetCategory.name}".`,
            denialReason: "PROTECTED_RESOURCE",
          };
        }
      }

      // ── Requester permission check ───────────────────────────────
      const requesterMember = context.requesterId
        ? await guild.members.fetch(context.requesterId).catch(() => null)
        : null;

      if (!requesterMember || !hasManageChannels(requesterMember)) {
        const result: ToolResult = {
          status: "denied",
          message: "❌ You do not have the **ManageChannels** permission required to move channels.",
          denialReason: "MISSING_DISCORD_PERMISSION",
        };
        recordToolAudit(context, result.status, result.denialReason, startTime, false);
        return result;
      }

      // ── Bot permission check ─────────────────────────────────────
      const botMember = await guild.members.me;
      if (!botMember || !hasManageChannels(botMember)) {
        const result: ToolResult = {
          status: "denied",
          message: "❌ The bot does not have the **ManageChannels** permission required to move channels.",
          denialReason: "MISSING_DISCORD_PERMISSION",
        };
        recordToolAudit(context, result.status, result.denialReason, startTime, false);
        return result;
      }

      // ── Already in target? ───────────────────────────────────────
      if (targetChannel.parentId === (categoryId || null)) {
        return {
          status: "validation_error",
          message: `Channel **#${targetChannel.name}** is already in the target category.`,
        };
      }

      // ── Generate ActionPlan ──────────────────────────────────────
      const currentCategoryName = targetChannel.parent?.name || "Uncategorized";
      const newCategoryName = categoryId
        ? guild.channels.cache.get(categoryId)?.name || "Unknown"
        : "Uncategorized";

      const plan = createActionPlan(
        context,
        "medium",
        [
          {
            type: "modify",
            target: `#${targetChannel.name}`,
            description: `Move from ${currentCategoryName} to ${newCategoryName}`,
            before: currentCategoryName,
            after: newCategoryName,
            permissions: "ManageChannels",
          },
        ],
        true,
      );
      (plan as any).toolName = "move_channel";

      storePendingPlan(plan);

      const lines = [
        "📋 **ACTION PLAN**",
        "",
        `**Action:** Move Channel`,
        `**Channel:** #${targetChannel.name}`,
        `**From:** ${currentCategoryName}`,
        `**To:** ${newCategoryName}`,
        `**Risk:** MEDIUM`,
        `**Required:** ManageChannels`,
        `**Requested by:** <@${context.requesterId}>`,
        "",
        `**Action ID:** \`${plan.id}\``,
        `**Expires:** 5 minutes`,
      ];

      return {
        status: "confirmation_required",
        message: lines.join("\n"),
        plan,
      };
    },
  };
}

/* ================================================================
 * EXECUTE CONFIRMED PLAN
 * ================================================================ */

export async function executeMoveChannel(
  plan: ActionPlan,
  getClient: () => Client | null,
): Promise<ToolResult> {
  const startTime = Date.now();
  const client = getClient();
  if (!client) {
    return { status: "error", message: "Discord client is not connected." };
  }

  const guild = await client.guilds.fetch(plan.guildId).catch(() => null);
  if (!guild) {
    return { status: "denied", message: "Guild not found.", denialReason: "GUILD_ONLY" };
  }

  const requesterMember = await guild.members.fetch(plan.requesterId).catch(() => null);
  if (!requesterMember || !hasManageChannels(requesterMember)) {
    return {
      status: "denied",
      message: "❌ Permission revoked.",
      denialReason: "MISSING_DISCORD_PERMISSION",
    };
  }

  const botMember = await guild.members.me;
  if (!botMember || !hasManageChannels(botMember)) {
    return {
      status: "denied",
      message: "❌ Bot no longer has ManageChannels permission.",
      denialReason: "MISSING_DISCORD_PERMISSION",
    };
  }

  const channelId = String(plan.arguments.channelId || "").trim();
  const categoryId = String(plan.arguments.categoryId || "").trim();

  const targetChannel = guild.channels.cache.get(channelId);
  if (!targetChannel) {
    return { status: "error", message: "Channel no longer exists." };
  }

  // Re-check protected (including category inheritance)
  if (isChannelProtected(plan.guildId, channelId, targetChannel.parentId)) {
    return { status: "denied", message: "❌ Channel is now protected.", denialReason: "PROTECTED_RESOURCE" };
  }

  if (categoryId) {
    const targetCategory = guild.channels.cache.get(categoryId);
    if (!targetCategory || targetCategory.type !== ChannelType.GuildCategory) {
      return { status: "error", message: "Target category no longer exists." };
    }
    // Re-check: deny moving into a protected category
    if (isProtectedCategory(plan.guildId, categoryId)) {
      return { status: "denied", message: "❌ Target category is now protected.", denialReason: "PROTECTED_RESOURCE" };
    }
  }

  // Re-check already in target
  if (targetChannel.parentId === (categoryId || null)) {
    return {
      status: "validation_error",
      message: `Channel is already in the target category.`,
    };
  }

  const oldCategoryName = targetChannel.parent?.name || "Uncategorized";

  try {
    await (targetChannel as any).setParent(categoryId || undefined);

    const newCategoryName = targetChannel.parent?.name || "Uncategorized";

    const result: ToolResult = {
      status: "success",
      message:
        `✅ **Channel moved**\n` +
        `#${targetChannel.name}\n` +
        `From: ${oldCategoryName}\n` +
        `To: ${newCategoryName}\n` +
        `Action ID: \`${plan.id}\``,
      data: {
        channelId: targetChannel.id,
        name: targetChannel.name,
        oldCategory: oldCategoryName,
        newCategory: newCategoryName,
      },
    };

    recordToolAudit(
      { ...plan, arguments: plan.arguments, channelId: plan.channelId, requesterName: "confirmed" } as any,
      "success",
      undefined,
      startTime,
      false,
    );

    return result;
  } catch (error) {
    logger.error(`move_channel execution failed: ${error instanceof Error ? error.message : String(error)}`);
    return {
      status: "error",
      message: `❌ Move failed. The issue has been logged.`,
    };
  }
}
