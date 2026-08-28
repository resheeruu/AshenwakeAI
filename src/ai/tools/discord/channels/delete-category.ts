import type { Client } from "discord.js";
import { PermissionFlagsBits, ChannelType } from "discord.js";
import type { ToolDefinition, ToolContext, ToolResult, ActionPlan } from "../../types";
import { createActionPlan } from "../../executor";
import { storePendingPlan } from "../../confirmation-store";
import { recordToolAudit } from "../../audit";
import { logger } from "../../../../logger";
import { isProtectedResource } from "../protection";

function hasManageChannels(member: { permissions: { has: (perm: bigint) => boolean } }): boolean {
  return member.permissions.has(PermissionFlagsBits.ManageChannels);
}

/* ================================================================
 * delete_category — Delete a category and list affected channels.
 *
 * CRITICAL risk. Confirmation required. Admin+ role.
 * ================================================================ */

export function createDeleteCategoryTool(getClient: () => Client | null): ToolDefinition {
  return {
    name: "delete_category",
    description: "Delete a category. Lists affected channels before confirmation.",
    category: "discord",
    requiredRole: "admin",
    requiredDiscordPermissions: ["ManageChannels"],
    allowedScopes: ["AI_MANAGEMENT"],
    confirmationRequired: true,
    riskLevel: "critical",
    parameters: [
      {
        name: "categoryId",
        type: "string",
        description: "ID of the category to delete",
        required: true,
      },
    ],
    execute: async (context: ToolContext): Promise<ToolResult> => {
      const startTime = Date.now();
      const client = getClient();

      if (!client) return { status: "error", message: "Discord client is not connected." };

      const guild = await client.guilds.fetch(context.guildId).catch(() => null);
      if (!guild) return { status: "denied", message: "Could not fetch guild.", denialReason: "GUILD_ONLY" };

      const categoryId = String(context.arguments.categoryId || "").trim();
      if (!categoryId) return { status: "validation_error", message: "Missing required parameter: categoryId" };

      const category = guild.channels.cache.get(categoryId);
      if (!category || category.type !== ChannelType.GuildCategory) {
        return { status: "denied", message: `Category "${categoryId}" not found.`, denialReason: "RESOURCE_NOT_FOUND" };
      }
      if (category.guild.id !== guild.id) {
        return { status: "denied", message: "Category belongs to a different guild.", denialReason: "GUILD_ONLY" };
      }

      // ── Protected category check ─────────────────────────────────
      if (isProtectedResource(context.guildId, categoryId)) {
        return { status: "denied", message: `❌ Cannot delete protected category ${category.name}.`, denialReason: "PROTECTED_RESOURCE" };
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

      // ── List affected channels ───────────────────────────────────
      const affectedChannels = guild.channels.cache.filter((ch) => ch.parentId === categoryId);
      const affectedNames = affectedChannels.map((ch) => `• <#${ch.id}>`).join("\n") || "• None";

      const plan = createActionPlan(
        context,
        "critical",
        [{
          type: "delete",
          target: category.name,
          description: `Delete category and ${affectedChannels.size} channel(s)`,
          permissions: "ManageChannels",
        }],
        true,
      );
      (plan as any).toolName = "delete_category";
      plan.arguments = { ...context.arguments };

      storePendingPlan(plan);

      const lines = [
        "⚠️ **CRITICAL ACTION**",
        "",
        `**Action:** Delete Category`,
        `**Category:** ${category.name}`,
        `**Guild:** ${guild.name}`,
        "",
        `**Channels affected (${affectedChannels.size}):**`,
        affectedNames,
        "",
        "The category and its channels may be removed.",
        "",
        `**Risk:** CRITICAL`,
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

export async function executeDeleteCategory(
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

  const categoryId = String(plan.arguments.categoryId || "").trim();
  const category = guild.channels.cache.get(categoryId);
  if (!category || category.type !== ChannelType.GuildCategory) {
    return { status: "error", message: "Category no longer exists." };
  }

  // Re-check protected
  if (isProtectedResource(plan.guildId, categoryId)) {
    return { status: "denied", message: "❌ Category is now protected.", denialReason: "PROTECTED_RESOURCE" };
  }

  // Re-check affected channels (they may have changed)
  const affectedChannels = guild.channels.cache.filter((ch) => ch.parentId === categoryId);
  const affectedNames = affectedChannels.map((ch) => `#${ch.name}`).join(", ") || "None";

  try {
    // Discord.js deletes the category and uncategorizes child channels
    await category.delete();

    const result: ToolResult = {
      status: "success",
      message:
        `✅ **Category deleted** ${category.name}\n` +
        `Affected channels: ${affectedNames}\n` +
        `Action ID: \`${plan.id}\``,
      data: { categoryId, name: category.name, affectedChannels: affectedChannels.size },
    };

    recordToolAudit(
      { ...plan, channelId: plan.channelId, requesterName: "confirmed" } as any,
      "success", undefined, startTime, false,
    );
    return result;
  } catch (error) {
    logger.error(`delete_category execution failed: ${error instanceof Error ? error.message : String(error)}`);
    return { status: "error", message: `❌ Delete failed. The issue has been logged.` };
  }
}
