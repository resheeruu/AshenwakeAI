"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
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
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var agent_orchestrator_exports = {};
__export(agent_orchestrator_exports, {
  checkBotPermissions: () => checkBotPermissions,
  checkFullAuthorization: () => checkFullAuthorization,
  checkRoleHierarchy: () => checkRoleHierarchy,
  checkTargetProtection: () => checkTargetProtection,
  executeMultiStep: () => executeMultiStep,
  executeWithFullPipeline: () => executeWithFullPipeline,
  formatServerState: () => formatServerState,
  inspectServerState: () => inspectServerState,
  resolveUserContext: () => resolveUserContext
});
module.exports = __toCommonJS(agent_orchestrator_exports);
var import_discord = require("discord.js");
var import_channel_scope = require("../channel-scope");
var import_permissions = require("../../../security/permissions");
var import_audit = require("../../../security/audit");
var import_registry = require("../registry");
var import_executor = require("../executor");
async function resolveUserContext(guild, userId, botOwnerIds) {
  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) return null;
  const aiConfig = (0, import_channel_scope.loadGuildAIConfig)(guild.id);
  const ashenRole = (0, import_permissions.resolveRole)({
    userId,
    guildId: guild.id,
    guildOwnerId: guild.ownerId,
    ownerIds: botOwnerIds,
    managementRoleIds: aiConfig.managementRoleIds,
    userRoleIds: [...member.roles.cache.keys()],
    trustedUserIds: aiConfig.trustedUserIds
  });
  return {
    userId,
    username: member.user.tag,
    guildId: guild.id,
    ashenRole,
    discordPermissions: member.permissions.bitfield,
    isGuildOwner: userId === guild.ownerId,
    roleIds: [...member.roles.cache.keys()]
  };
}
function checkBotPermissions(guild, requiredPermissions) {
  const botMember = guild.members.me;
  if (!botMember) {
    return { hasPermission: false, missing: ["Bot not in guild"] };
  }
  const missing = [];
  for (const permName of requiredPermissions) {
    const flag = import_discord.PermissionFlagsBits[permName];
    if (flag && !botMember.permissions.has(flag)) {
      missing.push(permName);
    }
  }
  return {
    hasPermission: missing.length === 0,
    missing
  };
}
function checkRoleHierarchy(guild, targetRoleId, requesterId) {
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
      reason: "That role is higher than or equal to my highest role."
    };
  }
  return { allowed: true };
}
function checkTargetProtection(guildId, targetId, targetType) {
  const aiConfig = (0, import_channel_scope.loadGuildAIConfig)(guildId);
  if (targetType === "channel" && aiConfig.protectedChannels.includes(targetId)) {
    return { protected: true, reason: "This channel is protected and cannot be modified." };
  }
  if (targetType === "category" && aiConfig.protectedCategories.includes(targetId)) {
    return { protected: true, reason: "This category is protected and cannot be modified." };
  }
  return { protected: false };
}
async function checkFullAuthorization(guild, userContext, toolName, targetId, targetType) {
  const tool = import_registry.toolRegistry.get(toolName);
  if (!tool) {
    return {
      authorized: false,
      denialReason: "TOOL_NOT_FOUND",
      denialMessage: `Tool "${toolName}" is not registered.`
    };
  }
  const roleHierarchy = ["owner", "admin", "moderator", "member", "guest"];
  const userLevel = roleHierarchy.indexOf(userContext.ashenRole);
  const requiredLevel = roleHierarchy.indexOf(tool.requiredRole);
  if (userLevel > requiredLevel) {
    return {
      authorized: false,
      denialReason: "INSUFFICIENT_ROLE",
      denialMessage: `This action requires **${tool.requiredRole}** role or higher. Your role: **${userContext.ashenRole}**.`
    };
  }
  for (const permName of tool.requiredDiscordPermissions) {
    const flag = import_discord.PermissionFlagsBits[permName];
    if (flag && !(userContext.discordPermissions & flag)) {
      return {
        authorized: false,
        denialReason: "MISSING_DISCORD_PERMISSION",
        denialMessage: `You need the **${permName}** Discord permission to do this.`
      };
    }
  }
  const botPermCheck = checkBotPermissions(guild, tool.requiredDiscordPermissions);
  if (!botPermCheck.hasPermission) {
    return {
      authorized: false,
      denialReason: "MISSING_BOT_PERMISSION",
      denialMessage: `I don't have the **${botPermCheck.missing.join(", ")}** permission(s) to do this.`
    };
  }
  if (targetId && targetType) {
    const protectionCheck = checkTargetProtection(userContext.guildId, targetId, targetType);
    if (protectionCheck.protected) {
      return {
        authorized: false,
        denialReason: "PROTECTED_RESOURCE",
        denialMessage: `\u274C ${protectionCheck.reason}`
      };
    }
  }
  if (targetId && targetType === "role") {
    const hierarchyCheck = checkRoleHierarchy(guild, targetId, userContext.userId);
    if (!hierarchyCheck.allowed) {
      return {
        authorized: false,
        denialReason: "ROLE_HIERARCHY",
        denialMessage: `\u274C ${hierarchyCheck.reason}`
      };
    }
  }
  return { authorized: true };
}
async function executeWithFullPipeline(guild, userContext, toolName, args, channelId, targetId, targetType, executorOptions) {
  const authResult = await checkFullAuthorization(guild, userContext, toolName, targetId, targetType);
  if (!authResult.authorized) {
    (0, import_audit.recordAudit)({
      who: userContext.userId,
      whoName: userContext.username,
      what: `${toolName} denied: ${authResult.denialReason}`,
      where: "agent-orchestrator",
      guildId: userContext.guildId,
      result: "denied"
    });
    return {
      status: "denied",
      message: authResult.denialMessage || "Authorization failed.",
      denialReason: authResult.denialReason
    };
  }
  const context = {
    guildId: userContext.guildId,
    channelId,
    requesterId: userContext.userId,
    requesterName: userContext.username,
    requesterRole: userContext.ashenRole,
    arguments: { ...args, _toolName: toolName },
    dryRun: false
  };
  const result = await (0, import_executor.executeTool)(toolName, context, {
    ...executorOptions
  });
  return result;
}
async function executeMultiStep(guild, userContext, steps, channelId, stepExecutorOptions) {
  const results = [];
  for (const step of steps) {
    const result = await executeWithFullPipeline(
      guild,
      userContext,
      step.toolName,
      step.args,
      channelId,
      step.targetId,
      step.targetType,
      stepExecutorOptions
    );
    results.push({
      toolName: step.toolName,
      result
    });
    if (result.status !== "success" && result.status !== "confirmation_required") {
      break;
    }
  }
  const allSucceeded = results.every(
    (r) => r.result.status === "success" || r.result.status === "confirmation_required"
  );
  const summary = results.map((r) => `${r.toolName}: ${r.result.status}`).join("\n");
  return {
    steps: results,
    allSucceeded,
    summary
  };
}
async function inspectServerState(guild) {
  const [members, channels, roles] = await Promise.all([
    guild.members.fetch().catch(() => /* @__PURE__ */ new Map()),
    guild.channels.fetch().catch(() => /* @__PURE__ */ new Map()),
    guild.roles.fetch().catch(() => /* @__PURE__ */ new Map())
  ]);
  const aiConfig = (0, import_channel_scope.loadGuildAIConfig)(guild.id);
  const channelArray = [...channels.values()];
  const categories = channelArray.filter((c) => c?.type === 4).map((c) => ({
    id: c.id,
    name: c.name,
    channelCount: channelArray.filter((ch) => ch?.parentId === c.id).length
  }));
  const channelList = channelArray.filter((c) => c && c.type !== 4).map((c) => ({
    id: c.id,
    name: c.name,
    type: c.type === 0 ? "text" : c.type === 2 ? "voice" : c.type === 15 ? "forum" : "other",
    categoryId: c.parentId
  }));
  const roleList = [...roles.values()].filter((r) => r.id !== guild.id).sort((a, b) => b.position - a.position).map((r) => ({
    id: r.id,
    name: r.name,
    position: r.position,
    memberCount: r.members.size,
    color: r.hexColor
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
    protectedCategories: aiConfig.protectedCategories
  };
}
function formatServerState(state) {
  const lines = [
    `**Server: ${state.guildName}**`,
    `Members: ${state.memberCount} | Channels: ${state.channelCount} | Roles: ${state.roleCount}`,
    "",
    "**Categories:**"
  ];
  for (const cat of state.categories) {
    lines.push(`  ${cat.name} (${cat.channelCount} channels)`);
  }
  lines.push("", "**Channels:**");
  for (const ch of state.channels.slice(0, 30)) {
    const catName = state.categories.find((c) => c.id === ch.categoryId)?.name || "none";
    lines.push(`  #${ch.name} (${ch.type}) \u2014 category: ${catName}`);
  }
  if (state.channels.length > 30) {
    lines.push(`  ... and ${state.channels.length - 30} more`);
  }
  lines.push("", "**Roles:**");
  for (const role of state.roles.slice(0, 20)) {
    lines.push(`  ${role.name} \u2014 ${role.memberCount} members, position: ${role.position}`);
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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  checkBotPermissions,
  checkFullAuthorization,
  checkRoleHierarchy,
  checkTargetProtection,
  executeMultiStep,
  executeWithFullPipeline,
  formatServerState,
  inspectServerState,
  resolveUserContext
});
