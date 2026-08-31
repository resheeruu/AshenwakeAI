import type { Client, Guild, GuildMember, Message } from "discord.js";
import { PermissionFlagsBits } from "discord.js";
import { logger } from "../../../logger";
import { loadGuildAIConfig } from "../channel-scope";
import { resolveRole } from "../../../security/permissions";
import type { AshenRole } from "../../../security/permissions";
import { assessRisk } from "../../../security/risk-engine";
import { recordAudit } from "../../../security/audit";
import { toolRegistry } from "../registry";
import { validateToolRequest } from "../validator";
import { executeTool, type ExecutorOptions } from "../executor";
import type { ToolContext, ToolResult, ActionPlan } from "../types";
import { storePendingPlan } from "../confirmation-store";
import { createActionPlan } from "../executor";

/* ================================================================
 * UNIFIED AGENT ORCHESTRATOR
 *
 * Natural language → Intent → Inspect → Authorize → Risk → Plan
 * → Confirm → Tool → Verify → Audit
 *
 * This orchestrator is the bridge between conversational AI and
 * the existing tool framework. It resolves user roles using actual
 * Discord state, enforces permissions, and delegates to registered tools.
 * ================================================================ */

/* ================================================================
 * RESOLVED USER CONTEXT
 * ================================================================ */

export interface ResolvedUserContext {
  userId: string;
  username: string;
  guildId: string;
  ashenRole: AshenRole;
  discordPermissions: bigint;
  isGuildOwner: boolean;
  isBotOwner: boolean;
  roleIds: string[];
}

/* ================================================================
 * RESOLVE USER CONTEXT
 *
 * Resolves a user's actual role using Discord state + AshenAI config.
 * This is the single source of truth for authorization.
 * ================================================================ */

export async function resolveUserContext(
  guild: Guild,
  userId: string,
  botOwnerIds: string[],
): Promise<ResolvedUserContext | null> {
  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) return null;

  const aiConfig = loadGuildAIConfig(guild.id);

  const ashenRole = resolveRole({
    userId,
    guildId: guild.id,
    guildOwnerId: guild.ownerId,
    ownerIds: botOwnerIds,
    managementRoleIds: aiConfig.managementRoleIds,
    userRoleIds: [...member.roles.cache.keys()],
  });

  return {
    userId,
    username: member.user.tag,
    guildId: guild.id,
    ashenRole,
    discordPermissions: member.permissions.bitfield,
    isGuildOwner: userId === guild.ownerId,
    isBotOwner: botOwnerIds.includes(userId),
    roleIds: [...member.roles.cache.keys()],
  };
}

/* ================================================================
 * CHECK BOT PERMISSIONS
 * ================================================================ */

export interface BotPermissionStatus {
  hasPermission: boolean;
  missing: string[];
}

export function checkBotPermissions(
  guild: Guild,
  requiredPermissions: string[],
): BotPermissionStatus {
  const botMember = guild.members.me;
  if (!botMember) {
    return { hasPermission: false, missing: ["Bot not in guild"] };
  }

  const missing: string[] = [];
  for (const permName of requiredPermissions) {
    const flag = (PermissionFlagsBits as Record<string, bigint>)[permName];
    if (flag && !botMember.permissions.has(flag)) {
      missing.push(permName);
    }
  }

  return {
    hasPermission: missing.length === 0,
    missing,
  };
}

/* ================================================================
 * CHECK ROLE HIERARCHY
 * ================================================================ */

export interface HierarchyCheck {
  allowed: boolean;
  reason?: string;
}

export function checkRoleHierarchy(
  guild: Guild,
  targetRoleId: string,
  requesterId: string,
): HierarchyCheck {
  const targetRole = guild.roles.cache.get(targetRoleId);
  if (!targetRole) {
    return { allowed: true };
  }

  const botMember = guild.members.me;
  if (!botMember) {
    return { allowed: false, reason: "Bot member not found." };
  }

  if (targetRole.position >= botMember.roles.highest.position) {
    return {
      allowed: false,
      reason: "That role is higher than or equal to my highest role.",
    };
  }

  return { allowed: true };
}

/* ================================================================
 * CHECK TARGET PROTECTION
 * ================================================================ */

export function checkTargetProtection(
  guildId: string,
  targetId: string,
  targetType: "channel" | "category" | "role",
): { protected: boolean; reason?: string } {
  const aiConfig = loadGuildAIConfig(guildId);

  if (targetType === "channel" && aiConfig.protectedChannels.includes(targetId)) {
    return { protected: true, reason: "This channel is protected and cannot be modified." };
  }

  if (targetType === "category" && aiConfig.protectedCategories.includes(targetId)) {
    return { protected: true, reason: "This category is protected and cannot be modified." };
  }

  return { protected: false };
}

/* ================================================================
 * FULL AUTHORIZATION CHECK
 *
 * Combines all authorization checks into a single call.
 * ================================================================ */

export interface AuthorizationResult {
  authorized: boolean;
  denialReason?: string;
  denialMessage?: string;
}

export async function checkFullAuthorization(
  guild: Guild,
  userContext: ResolvedUserContext,
  toolName: string,
  targetId?: string,
  targetType?: "channel" | "category" | "role",
): Promise<AuthorizationResult> {
  const tool = toolRegistry.get(toolName);
  if (!tool) {
    return {
      authorized: false,
      denialReason: "TOOL_NOT_FOUND",
      denialMessage: `Tool "${toolName}" is not registered.`,
    };
  }

  // 1. Check AshenAI role requirement
  const roleHierarchy: AshenRole[] = ["owner", "admin", "moderator", "member", "guest"];
  const userLevel = roleHierarchy.indexOf(userContext.ashenRole);
  const requiredLevel = roleHierarchy.indexOf(tool.requiredRole);

  if (userLevel > requiredLevel) {
    return {
      authorized: false,
      denialReason: "INSUFFICIENT_ROLE",
      denialMessage: `This action requires **${tool.requiredRole}** role or higher. Your role: **${userContext.ashenRole}**.`,
    };
  }

  // 2. Check Discord permissions
  for (const permName of tool.requiredDiscordPermissions) {
    const flag = (PermissionFlagsBits as Record<string, bigint>)[permName];
    if (flag && !(userContext.discordPermissions & flag)) {
      return {
        authorized: false,
        denialReason: "MISSING_DISCORD_PERMISSION",
        denialMessage: `You need the **${permName}** Discord permission to do this.`,
      };
    }
  }

  // 3. Check bot permissions
  const botPermCheck = checkBotPermissions(guild, tool.requiredDiscordPermissions);
  if (!botPermCheck.hasPermission) {
    return {
      authorized: false,
      denialReason: "MISSING_BOT_PERMISSION",
      denialMessage: `I don't have the **${botPermCheck.missing.join(", ")}** permission(s) to do this.`,
    };
  }

  // 4. Check target protection
  if (targetId && targetType) {
    const protectionCheck = checkTargetProtection(userContext.guildId, targetId, targetType);
    if (protectionCheck.protected) {
      return {
        authorized: false,
        denialReason: "PROTECTED_RESOURCE",
        denialMessage: `❌ ${protectionCheck.reason}`,
      };
    }
  }

  // 5. Check role hierarchy for role-related operations
  if (targetId && targetType === "role") {
    const hierarchyCheck = checkRoleHierarchy(guild, targetId, userContext.userId);
    if (!hierarchyCheck.allowed) {
      return {
        authorized: false,
        denialReason: "ROLE_HIERARCHY",
        denialMessage: `❌ ${hierarchyCheck.reason}`,
      };
    }
  }

  return { authorized: true };
}

/* ================================================================
 * EXECUTE WITH FULL PIPELINE
 *
 * Runs the complete authorization → risk → plan → execute pipeline.
 * Returns a ToolResult or an ActionPlan for confirmation.
 * ================================================================ */

export async function executeWithFullPipeline(
  guild: Guild,
  userContext: ResolvedUserContext,
  toolName: string,
  args: Record<string, unknown>,
  channelId: string,
  targetId?: string,
  targetType?: "channel" | "category" | "role",
  executorOptions?: ExecutorOptions,
): Promise<ToolResult> {
  // 1. Full authorization check
  const authResult = await checkFullAuthorization(guild, userContext, toolName, targetId, targetType);
  if (!authResult.authorized) {
    recordAudit({
      who: userContext.userId,
      whoName: userContext.username,
      what: `${toolName} denied: ${authResult.denialReason}`,
      where: "agent-orchestrator",
      guildId: userContext.guildId,
      result: "denied",
    });

    return {
      status: "denied",
      message: authResult.denialMessage || "Authorization failed.",
      denialReason: authResult.denialReason as any,
    };
  }

  // 2. Build tool context
  const context: ToolContext = {
    guildId: userContext.guildId,
    channelId,
    requesterId: userContext.userId,
    requesterName: userContext.username,
    requesterRole: userContext.ashenRole,
    arguments: { ...args, _toolName: toolName },
    dryRun: false,
  };

  // 3. Execute through the existing tool framework
  const result = await executeTool(toolName, context, {
    isBotOwner: userContext.isBotOwner,
    ...executorOptions,
  });

  return result;
}

/* ================================================================
 * MULTI-STEP EXECUTION
 *
 * Executes multiple tools as a single logical operation.
 * Returns all results.
 * ================================================================ */

export interface MultiStepResult {
  steps: Array<{
    toolName: string;
    result: ToolResult;
  }>;
  allSucceeded: boolean;
  summary: string;
}

export async function executeMultiStep(
  guild: Guild,
  userContext: ResolvedUserContext,
  steps: Array<{
    toolName: string;
    args: Record<string, unknown>;
    targetId?: string;
    targetType?: "channel" | "category" | "role";
  }>,
  channelId: string,
  stepExecutorOptions?: ExecutorOptions,
): Promise<MultiStepResult> {
  const results: MultiStepResult["steps"] = [];

  for (const step of steps) {
    const result = await executeWithFullPipeline(
      guild,
      userContext,
      step.toolName,
      step.args,
      channelId,
      step.targetId,
      step.targetType,
      stepExecutorOptions,
    );

    results.push({
      toolName: step.toolName,
      result,
    });

    // Stop on first failure
    if (result.status !== "success" && result.status !== "confirmation_required") {
      break;
    }
  }

  const allSucceeded = results.every(
    (r) => r.result.status === "success" || r.result.status === "confirmation_required",
  );

  const summary = results
    .map((r) => `${r.toolName}: ${r.result.status}`)
    .join("\n");

  return {
    steps: results,
    allSucceeded,
    summary,
  };
}

/* ================================================================
 * INSPECT SERVER STATE
 *
 * Returns a comprehensive server state summary for the AI to use
 * when making decisions about what to create/modify.
 * ================================================================ */

export interface ServerState {
  guildName: string;
  guildId: string;
  memberCount: number;
  channelCount: number;
  roleCount: number;
  categories: Array<{ id: string; name: string; channelCount: number }>;
  channels: Array<{ id: string; name: string; type: string; categoryId: string | null }>;
  roles: Array<{ id: string; name: string; position: number; memberCount: number; color: string }>;
  protectedChannels: string[];
  protectedCategories: string[];
}

export async function inspectServerState(guild: Guild): Promise<ServerState> {
  const [members, channels, roles] = await Promise.all([
    guild.members.fetch().catch(() => new Map()),
    guild.channels.fetch().catch(() => new Map()),
    guild.roles.fetch().catch(() => new Map()),
  ]);

  const aiConfig = loadGuildAIConfig(guild.id);

  const channelArray = [...channels.values()];
  const categories = channelArray
    .filter((c) => c?.type === 4)
    .map((c) => ({
      id: c!.id,
      name: c!.name,
      channelCount: channelArray.filter((ch) => ch?.parentId === c!.id).length,
    }));

  const channelList = channelArray
    .filter((c) => c && c.type !== 4)
    .map((c) => ({
      id: c!.id,
      name: c!.name,
      type: c!.type === 0 ? "text" : c!.type === 2 ? "voice" : c!.type === 15 ? "forum" : "other",
      categoryId: c!.parentId,
    }));

  const roleList = [...roles.values()]
    .filter((r) => r.id !== guild.id)
    .sort((a, b) => b.position - a.position)
    .map((r) => ({
      id: r.id,
      name: r.name,
      position: r.position,
      memberCount: r.members.size,
      color: r.hexColor,
    }));

  return {
    guildName: guild.name,
    guildId: guild.id,
    memberCount: members.size,
    channelCount: channelList.length,
    roleCount: roleList.length,
    categories,
    channels: channelList,
    roles: roleList,
    protectedChannels: aiConfig.protectedChannels,
    protectedCategories: aiConfig.protectedCategories,
  };
}

/* ================================================================
 * FORMAT SERVER STATE FOR AI
 *
 * Converts ServerState into a readable string for the AI prompt.
 * ================================================================ */

export function formatServerState(state: ServerState): string {
  const lines = [
    `**Server: ${state.guildName}**`,
    `Members: ${state.memberCount} | Channels: ${state.channelCount} | Roles: ${state.roleCount}`,
    "",
    "**Categories:**",
  ];

  for (const cat of state.categories) {
    lines.push(`  ${cat.name} (${cat.channelCount} channels)`);
  }

  lines.push("", "**Channels:**");
  for (const ch of state.channels.slice(0, 30)) {
    const catName = state.categories.find((c) => c.id === ch.categoryId)?.name || "none";
    lines.push(`  #${ch.name} (${ch.type}) — category: ${catName}`);
  }

  if (state.channels.length > 30) {
    lines.push(`  ... and ${state.channels.length - 30} more`);
  }

  lines.push("", "**Roles:**");
  for (const role of state.roles.slice(0, 20)) {
    lines.push(`  ${role.name} — ${role.memberCount} members, position: ${role.position}`);
  }

  if (state.roles.length > 20) {
    lines.push(`  ... and ${state.roles.length - 20} more`);
  }

  if (state.protectedChannels.length > 0) {
    lines.push("", `**Protected channels:** ${state.protectedChannels.length}`);
  }
  if (state.protectedCategories.length > 0) {
    lines.push(`**Protected categories:** ${state.protectedCategories.length}`);
  }

  return lines.join("\n");
}
