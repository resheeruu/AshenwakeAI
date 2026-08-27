import type { Client } from "discord.js";
import { PermissionFlagsBits, ChannelType } from "discord.js";
import type { ToolDefinition, ToolContext, ToolResult, ActionPlan } from "../types";
import { createActionPlan } from "../executor";
import { storePendingPlan } from "../confirmation-store";
import { recordToolAudit } from "../audit";
import { logger } from "../../../logger";
import {
  protectChannel,
  unprotectChannel,
  protectCategory,
  unprotectCategory,
  getProtectedResources,
  isProtectedResource,
} from "./protection";

/* ================================================================
 * HELPER
 * ================================================================ */

function hasManageChannels(member: { permissions: { has: (perm: bigint) => boolean } }): boolean {
  return member.permissions.has(PermissionFlagsBits.ManageChannels);
}

/* ================================================================
 * protect_channel — Protect a channel from AI modifications.
 *
 * MEDIUM risk. Confirmation required. Admin+ role.
 * ================================================================ */

export function createProtectChannelTool(getClient: () => Client | null): ToolDefinition {
  return {
    name: "protect_channel",
    description: "Protect a channel from being deleted, renamed, moved, or modified by AI tools.",
    category: "discord",
    requiredRole: "admin",
    requiredDiscordPermissions: ["ManageChannels"],
    allowedScopes: ["AI_MANAGEMENT"],
    confirmationRequired: true,
    riskLevel: "medium",
    parameters: [
      {
        name: "channelId",
        type: "string",
        description: "ID of the channel to protect",
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
      if (!channelId) return { status: "validation_error", message: "Missing required parameter: channelId" };

      const targetChannel = guild.channels.cache.get(channelId);
      if (!targetChannel) return { status: "denied", message: `Channel "${channelId}" not found.`, denialReason: "RESOURCE_NOT_FOUND" };
      if (targetChannel.guild.id !== guild.id) return { status: "denied", message: "Channel belongs to a different guild.", denialReason: "GUILD_ONLY" };

      // ── Requester permission check ───────────────────────────────
      const requesterMember = context.requesterId
        ? await guild.members.fetch(context.requesterId).catch(() => null)
        : null;

      if (!requesterMember || !hasManageChannels(requesterMember)) {
        const result: ToolResult = { status: "denied", message: "❌ You do not have **ManageChannels** permission.", denialReason: "MISSING_DISCORD_PERMISSION" };
        recordToolAudit(context, result.status, result.denialReason, startTime, false);
        return result;
      }

      // ── Bot permission check ─────────────────────────────────────
      const botMember = await guild.members.me;
      if (!botMember || !hasManageChannels(botMember)) {
        const result: ToolResult = { status: "denied", message: "❌ Bot does not have **ManageChannels** permission.", denialReason: "MISSING_DISCORD_PERMISSION" };
        recordToolAudit(context, result.status, result.denialReason, startTime, false);
        return result;
      }

      // ── Already protected? ───────────────────────────────────────
      if (isProtectedResource(context.guildId, channelId)) {
        return { status: "validation_error", message: `Channel #${targetChannel.name} is already protected.` };
      }

      // ── Build ActionPlan ─────────────────────────────────────────
      const plan = createActionPlan(
        context,
        "medium",
        [{
          type: "assign",
          target: `#${targetChannel.name}`,
          description: "Protect channel from AI modifications",
          permissions: "ManageChannels",
        }],
        true,
      );
      (plan as any).toolName = "protect_channel";
      plan.arguments = { ...context.arguments };

      storePendingPlan(plan);

      const lines = [
        "📋 **ACTION PLAN**",
        "",
        `**Action:** Protect Channel`,
        `**Channel:** #${targetChannel.name}`,
        `**Effect:** Channel cannot be deleted, renamed, moved, or have permissions modified by AI`,
        `**Risk:** MEDIUM`,
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

export async function executeProtectChannel(
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
  const targetChannel = guild.channels.cache.get(channelId);
  if (!targetChannel) return { status: "error", message: "Channel no longer exists." };

  const added = protectChannel(plan.guildId, channelId);
  if (!added) {
    return { status: "validation_error", message: `Channel #${targetChannel.name} is already protected.` };
  }

  const result: ToolResult = {
    status: "success",
    message: `✅ **Channel protected** #${targetChannel.name}\nAction ID: \`${plan.id}\``,
    data: { channelId, name: targetChannel.name, protected: true },
  };

  recordToolAudit(
    { ...plan, channelId: plan.channelId, requesterName: "confirmed" } as any,
    "success", undefined, startTime, false,
  );
  return result;
}

/* ================================================================
 * unprotect_channel — Remove protection from a channel.
 *
 * MEDIUM risk. Confirmation required. Admin+ role.
 * ================================================================ */

export function createUnprotectChannelTool(getClient: () => Client | null): ToolDefinition {
  return {
    name: "unprotect_channel",
    description: "Remove protection from a channel, allowing AI tools to modify it.",
    category: "discord",
    requiredRole: "admin",
    requiredDiscordPermissions: ["ManageChannels"],
    allowedScopes: ["AI_MANAGEMENT"],
    confirmationRequired: true,
    riskLevel: "medium",
    parameters: [
      {
        name: "channelId",
        type: "string",
        description: "ID of the channel to unprotect",
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
      if (!channelId) return { status: "validation_error", message: "Missing required parameter: channelId" };

      const targetChannel = guild.channels.cache.get(channelId);
      if (!targetChannel) return { status: "denied", message: `Channel "${channelId}" not found.`, denialReason: "RESOURCE_NOT_FOUND" };
      if (targetChannel.guild.id !== guild.id) return { status: "denied", message: "Channel belongs to a different guild.", denialReason: "GUILD_ONLY" };

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

      if (!isProtectedResource(context.guildId, channelId)) {
        return { status: "validation_error", message: `Channel #${targetChannel.name} is not protected.` };
      }

      const plan = createActionPlan(
        context,
        "medium",
        [{
          type: "remove",
          target: `#${targetChannel.name}`,
          description: "Remove channel protection",
          permissions: "ManageChannels",
        }],
        true,
      );
      (plan as any).toolName = "unprotect_channel";
      plan.arguments = { ...context.arguments };

      storePendingPlan(plan);

      const lines = [
        "📋 **ACTION PLAN**",
        "",
        `**Action:** Unprotect Channel`,
        `**Channel:** #${targetChannel.name}`,
        `**Effect:** Channel can now be modified by AI tools`,
        `**Risk:** MEDIUM`,
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

export async function executeUnprotectChannel(
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
  const targetChannel = guild.channels.cache.get(channelId);
  if (!targetChannel) return { status: "error", message: "Channel no longer exists." };

  const removed = unprotectChannel(plan.guildId, channelId);
  if (!removed) {
    return { status: "validation_error", message: `Channel #${targetChannel.name} is not protected.` };
  }

  const result: ToolResult = {
    status: "success",
    message: `✅ **Channel unprotected** #${targetChannel.name}\nAction ID: \`${plan.id}\``,
    data: { channelId, name: targetChannel.name, protected: false },
  };

  recordToolAudit(
    { ...plan, channelId: plan.channelId, requesterName: "confirmed" } as any,
    "success", undefined, startTime, false,
  );
  return result;
}

/* ================================================================
 * protect_category — Protect a category from AI modifications.
 *
 * MEDIUM risk. Confirmation required. Admin+ role.
 * ================================================================ */

export function createProtectCategoryTool(getClient: () => Client | null): ToolDefinition {
  return {
    name: "protect_category",
    description: "Protect a category from being deleted or modified by AI tools.",
    category: "discord",
    requiredRole: "admin",
    requiredDiscordPermissions: ["ManageChannels"],
    allowedScopes: ["AI_MANAGEMENT"],
    confirmationRequired: true,
    riskLevel: "medium",
    parameters: [
      {
        name: "categoryId",
        type: "string",
        description: "ID of the category to protect",
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

      const targetCategory = guild.channels.cache.get(categoryId);
      if (!targetCategory || targetCategory.type !== ChannelType.GuildCategory) {
        return { status: "denied", message: `Category "${categoryId}" not found.`, denialReason: "RESOURCE_NOT_FOUND" };
      }
      if (targetCategory.guild.id !== guild.id) return { status: "denied", message: "Category belongs to a different guild.", denialReason: "GUILD_ONLY" };

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

      if (isProtectedResource(context.guildId, categoryId)) {
        return { status: "validation_error", message: `Category ${targetCategory.name} is already protected.` };
      }

      const plan = createActionPlan(
        context,
        "medium",
        [{
          type: "assign",
          target: targetCategory.name,
          description: "Protect category from AI modifications",
          permissions: "ManageChannels",
        }],
        true,
      );
      (plan as any).toolName = "protect_category";
      plan.arguments = { ...context.arguments };

      storePendingPlan(plan);

      const lines = [
        "📋 **ACTION PLAN**",
        "",
        `**Action:** Protect Category`,
        `**Category:** ${targetCategory.name}`,
        `**Effect:** Category cannot be deleted or modified by AI`,
        `**Risk:** MEDIUM`,
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

export async function executeProtectCategory(
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
  const targetCategory = guild.channels.cache.get(categoryId);
  if (!targetCategory || targetCategory.type !== ChannelType.GuildCategory) {
    return { status: "error", message: "Category no longer exists." };
  }

  const added = protectCategory(plan.guildId, categoryId);
  if (!added) {
    return { status: "validation_error", message: `Category ${targetCategory.name} is already protected.` };
  }

  const result: ToolResult = {
    status: "success",
    message: `✅ **Category protected** ${targetCategory.name}\nAction ID: \`${plan.id}\``,
    data: { categoryId, name: targetCategory.name, protected: true },
  };

  recordToolAudit(
    { ...plan, channelId: plan.channelId, requesterName: "confirmed" } as any,
    "success", undefined, startTime, false,
  );
  return result;
}

/* ================================================================
 * unprotect_category — Remove protection from a category.
 *
 * MEDIUM risk. Confirmation required. Admin+ role.
 * ================================================================ */

export function createUnprotectCategoryTool(getClient: () => Client | null): ToolDefinition {
  return {
    name: "unprotect_category",
    description: "Remove protection from a category, allowing AI tools to modify it.",
    category: "discord",
    requiredRole: "admin",
    requiredDiscordPermissions: ["ManageChannels"],
    allowedScopes: ["AI_MANAGEMENT"],
    confirmationRequired: true,
    riskLevel: "medium",
    parameters: [
      {
        name: "categoryId",
        type: "string",
        description: "ID of the category to unprotect",
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

      const targetCategory = guild.channels.cache.get(categoryId);
      if (!targetCategory || targetCategory.type !== ChannelType.GuildCategory) {
        return { status: "denied", message: `Category "${categoryId}" not found.`, denialReason: "RESOURCE_NOT_FOUND" };
      }
      if (targetCategory.guild.id !== guild.id) return { status: "denied", message: "Category belongs to a different guild.", denialReason: "GUILD_ONLY" };

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

      if (!isProtectedResource(context.guildId, categoryId)) {
        return { status: "validation_error", message: `Category ${targetCategory.name} is not protected.` };
      }

      const plan = createActionPlan(
        context,
        "medium",
        [{
          type: "remove",
          target: targetCategory.name,
          description: "Remove category protection",
          permissions: "ManageChannels",
        }],
        true,
      );
      (plan as any).toolName = "unprotect_category";
      plan.arguments = { ...context.arguments };

      storePendingPlan(plan);

      const lines = [
        "📋 **ACTION PLAN**",
        "",
        `**Action:** Unprotect Category`,
        `**Category:** ${targetCategory.name}`,
        `**Effect:** Category can now be modified by AI tools`,
        `**Risk:** MEDIUM`,
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

export async function executeUnprotectCategory(
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
  const targetCategory = guild.channels.cache.get(categoryId);
  if (!targetCategory || targetCategory.type !== ChannelType.GuildCategory) {
    return { status: "error", message: "Category no longer exists." };
  }

  const removed = unprotectCategory(plan.guildId, categoryId);
  if (!removed) {
    return { status: "validation_error", message: `Category ${targetCategory.name} is not protected.` };
  }

  const result: ToolResult = {
    status: "success",
    message: `✅ **Category unprotected** ${targetCategory.name}\nAction ID: \`${plan.id}\``,
    data: { categoryId, name: targetCategory.name, protected: false },
  };

  recordToolAudit(
    { ...plan, channelId: plan.channelId, requesterName: "confirmed" } as any,
    "success", undefined, startTime, false,
  );
  return result;
}

/* ================================================================
 * list_protected_resources — List all protected channels/categories.
 *
 * LOW risk. No confirmation. Moderator+ role.
 * ================================================================ */

export function createListProtectedResourcesTool(getClient: () => Client | null): ToolDefinition {
  return {
    name: "list_protected_resources",
    description: "List all protected channels and categories in this server.",
    category: "discord",
    requiredRole: "moderator",
    requiredDiscordPermissions: [],
    allowedScopes: ["AI_MANAGEMENT"],
    confirmationRequired: false,
    riskLevel: "low",
    parameters: [],
    execute: async (context: ToolContext): Promise<ToolResult> => {
      const startTime = Date.now();
      const client = getClient();

      if (!client) return { status: "error", message: "Discord client is not connected." };

      const guild = await client.guilds.fetch(context.guildId).catch(() => null);
      if (!guild) return { status: "denied", message: "Could not fetch guild.", denialReason: "GUILD_ONLY" };

      const resources = getProtectedResources(context.guildId);

      const channelNames = resources.channels.map((id) => {
        const ch = guild.channels.cache.get(id);
        return ch ? `<#${id}>` : `#${id} (not found)`;
      });

      const categoryNames = resources.categories.map((id) => {
        const cat = guild.channels.cache.get(id);
        return cat ? cat.name : `${id} (not found)`;
      });

      const lines = [
        "**🔒 Protected Resources**",
        "",
        `**Channels (${resources.channels.length}):**`,
        ...channelNames.length ? channelNames.map((n) => `• ${n}`) : ["• None"],
        "",
        `**Categories (${resources.categories.length}):**`,
        ...categoryNames.length ? categoryNames.map((n) => `• ${n}`) : ["• None"],
      ];

      recordToolAudit(context, "success", undefined, startTime, false);

      return {
        status: "success",
        message: lines.join("\n"),
        data: resources,
      };
    },
  };
}
