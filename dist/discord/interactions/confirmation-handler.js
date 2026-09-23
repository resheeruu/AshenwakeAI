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
var confirmation_handler_exports = {};
__export(confirmation_handler_exports, {
  handleToolConfirmation: () => handleToolConfirmation,
  isToolConfirmationId: () => isToolConfirmationId,
  setDiscordClient: () => setDiscordClient
});
module.exports = __toCommonJS(confirmation_handler_exports);
var import_discord = require("discord.js");
var import_logger = require("../../logger");
var import_permissions = require("../../security/permissions");
var import_env = require("../../config/env");
var import_sanitize = require("../../security/sanitize");
var import_confirmation_store = require("../../ai/tools/confirmation-store");
var import_audit = require("../../ai/tools/audit");
var import_channel_scope = require("../../ai/tools/channel-scope");
var import_validator = require("../../ai/tools/validator");
var import_registry = require("../../ai/tools/registry");
var import_protection = require("../../ai/tools/discord/protection");
var import_tool_rate_limit = require("../../ai/tools/tool-rate-limit");
var import_create_channel = require("../../ai/tools/discord/create-channel");
var import_create_category = require("../../ai/tools/discord/create-category");
var import_rename_channel = require("../../ai/tools/discord/rename-channel");
var import_move_channel = require("../../ai/tools/discord/move-channel");
var import_edit_channel = require("../../ai/tools/discord/channels/edit-channel");
var import_delete_channel = require("../../ai/tools/discord/channels/delete-channel");
var import_delete_category = require("../../ai/tools/discord/channels/delete-category");
var import_permissions2 = require("../../ai/tools/discord/channels/permissions");
var import_protection_tools = require("../../ai/tools/discord/protection-tools");
var import_permission_presets = require("../../ai/tools/discord/channels/permission-presets");
var import_governance = require("../../ai/tools/governance");
var import_moderation = require("../../ai/tools/discord/moderation");
var import_roles = require("../../ai/tools/discord/roles");
const CONFIRM_PREFIX = "ashen_tool_confirm:";
const CANCEL_PREFIX = "ashen_tool_cancel:";
function isToolConfirmationId(customId) {
  return customId.startsWith(CONFIRM_PREFIX) || customId.startsWith(CANCEL_PREFIX);
}
let discordClient = null;
function setDiscordClient(client) {
  discordClient = client;
}
function getClient() {
  return discordClient;
}
async function executePlan(plan) {
  const client = getClient();
  if (!client) {
    return { status: "error", message: "Discord client is not connected." };
  }
  const toolName = plan.toolName;
  switch (toolName) {
    case "create_channel":
      return (0, import_create_channel.executeCreateChannel)(plan, () => client);
    case "create_category":
      return (0, import_create_category.executeCreateCategory)(plan, () => client);
    case "rename_channel":
      return (0, import_rename_channel.executeRenameChannel)(plan, () => client);
    case "move_channel":
      return (0, import_move_channel.executeMoveChannel)(plan, () => client);
    case "edit_channel":
      return (0, import_edit_channel.executeEditChannel)(plan, () => client);
    case "delete_channel":
      return (0, import_delete_channel.executeDeleteChannel)(plan, () => client);
    case "delete_category":
      return (0, import_delete_category.executeDeleteCategory)(plan, () => client);
    case "manage_channel_permissions":
      return (0, import_permissions2.executeManageChannelPermissions)(plan, () => client);
    case "protect_channel":
      return (0, import_protection_tools.executeProtectChannel)(plan, () => client);
    case "unprotect_channel":
      return (0, import_protection_tools.executeUnprotectChannel)(plan, () => client);
    case "protect_category":
      return (0, import_protection_tools.executeProtectCategory)(plan, () => client);
    case "unprotect_category":
      return (0, import_protection_tools.executeUnprotectCategory)(plan, () => client);
    case "apply_channel_preset":
      return (0, import_permission_presets.executeApplyChannelPreset)(plan, () => client);
    case "create_guild_policy":
      return (0, import_governance.executeCreateGuildPolicyPlan)(plan);
    case "update_guild_policy":
      return (0, import_governance.executeUpdateGuildPolicyPlan)(plan);
    case "apply_policy_template":
      return (0, import_governance.executeApplyPolicyTemplatePlan)(plan);
    case "warn_user":
      return (0, import_moderation.executeWarnUserPlan)(plan, () => client);
    case "timeout_user":
      return (0, import_moderation.executeTimeoutUserPlan)(plan, () => client);
    case "untimeout_user":
      return (0, import_moderation.executeUntimeoutUserPlan)(plan, () => client);
    case "kick_user":
      return (0, import_moderation.executeKickUserPlan)(plan, () => client);
    case "ban_user":
      return (0, import_moderation.executeBanUserPlan)(plan, () => client);
    case "purge_messages":
      return (0, import_moderation.executePurgeMessagesPlan)(plan, () => client);
    case "create_role":
      return (0, import_roles.executeCreateRole)(plan, () => client);
    case "edit_role":
      return (0, import_roles.executeEditRole)(plan, () => client);
    case "delete_role":
      return (0, import_roles.executeDeleteRole)(plan, () => client);
    case "assign_role":
      return (0, import_roles.executeAssignRole)(plan, () => client);
    case "remove_role":
      return (0, import_roles.executeRemoveRole)(plan, () => client);
    case "configure_role_permissions":
      return (0, import_roles.executeConfigureRolePermissions)(plan, () => client);
    default:
      return { status: "error", message: `Unknown tool: ${toolName}` };
  }
}
function sanitizeStepError(step, error) {
  return (0, import_sanitize.sanitizeToolError)(step.toolName, error);
}
function sanitizeResultMessage(toolName, message) {
  if (!message) return `\u274C Tool "${toolName}" failed.`;
  if (/\/(?:home|var|etc|tmp|usr|data|src|dist|node_modules)\//.test(message)) {
    return (0, import_sanitize.sanitizeToolError)(toolName, message);
  }
  if (/(?:stack|at\s+\w+\s|\.ts:\d+|\.js:\d+|node_modules)/i.test(message)) {
    return (0, import_sanitize.sanitizeToolError)(toolName, message);
  }
  if (/(?:api[_-]?key|authorization|bearer\s|token=|secret)/i.test(message)) {
    return (0, import_sanitize.sanitizeToolError)(toolName, message);
  }
  return message.length > 400 ? (0, import_sanitize.sanitizeToolError)(toolName, message) : message;
}
function authorizeTemplateStep(plan, step, requesterAshenRole, guildConfig, guildOwnerId, requesterMemberPermissions) {
  const tool = import_registry.toolRegistry.get(step.toolName);
  if (!tool) {
    return {
      denied: true,
      reason: "TOOL_UNAVAILABLE",
      message: `\u274C Step tool unavailable: ${step.toolName}`
    };
  }
  if (plan.requesterId !== step.args.requesterId && step.args.requesterId !== void 0) {
    return {
      denied: true,
      reason: "IDENTITY_MISMATCH",
      message: "\u274C Step requester does not match the confirmed action."
    };
  }
  const stepGuild = typeof step.args.guildId === "string" ? step.args.guildId : plan.guildId;
  if (stepGuild !== plan.guildId) {
    return {
      denied: true,
      reason: "GUILD_MISMATCH",
      message: "\u274C Step targets a different server."
    };
  }
  const validation = (0, import_validator.validateToolRequest)(
    tool,
    {
      guildId: plan.guildId,
      channelId: plan.channelId,
      requesterId: plan.requesterId,
      requesterName: "template-confirm",
      requesterRole: requesterAshenRole,
      arguments: step.args,
      dryRun: false
    },
    guildConfig,
    false,
    true
    // skip rate limit — consumed at plan creation
  );
  if (!validation.allowed) {
    return {
      denied: true,
      reason: validation.denialReason || "STEP_DENIED",
      message: `\u274C ${validation.message || "Step access denied."}`
    };
  }
  const channelTools = /* @__PURE__ */ new Set([
    "create_channel",
    "create_category",
    "rename_channel",
    "move_channel",
    "edit_channel",
    "delete_channel",
    "delete_category",
    "manage_channel_permissions",
    "apply_channel_preset",
    "protect_channel",
    "unprotect_channel",
    "protect_category",
    "unprotect_category"
  ]);
  if (channelTools.has(step.toolName) && !requesterMemberPermissions.has(import_discord.PermissionFlagsBits.ManageChannels)) {
    return {
      denied: true,
      reason: "MISSING_DISCORD_PERMISSION",
      message: "\u274C You no longer have ManageChannels permission."
    };
  }
  const toolsWithProtection = /* @__PURE__ */ new Set([
    "delete_channel",
    "delete_category",
    "rename_channel",
    "move_channel",
    "edit_channel",
    "manage_channel_permissions",
    "apply_channel_preset"
  ]);
  if (toolsWithProtection.has(step.toolName)) {
    const targetId = String(step.args.channelId || step.args.categoryId || "").trim();
    if (targetId) {
      const isChannelTool = Boolean(step.args.channelId) && !step.args.categoryId;
      const isProtected = isChannelTool ? (0, import_protection.isChannelProtected)(plan.guildId, targetId, void 0) : (0, import_protection.isProtectedResource)(plan.guildId, targetId);
      if (isProtected) {
        return {
          denied: true,
          reason: "PROTECTED_RESOURCE",
          message: "\u274C This resource is now protected."
        };
      }
    }
  }
  if (typeof tool.execute !== "function") {
    return {
      denied: true,
      reason: "TOOL_UNAVAILABLE",
      message: `\u274C Tool no longer available: ${step.toolName}`
    };
  }
  void guildOwnerId;
  return { denied: false };
}
async function handleTemplateConfirm(plan, steps, interaction, startTime, planId) {
  const guild = await interaction.guild?.fetch();
  if (!guild) {
    await interaction.reply({
      content: "\u274C Could not fetch guild information.",
      ephemeral: true
    });
    return;
  }
  const requesterMember = await guild.members.fetch(interaction.user.id).catch(() => null);
  if (!requesterMember) {
    await interaction.reply({
      content: "\u274C You are not a member of this server.",
      ephemeral: true
    });
    return;
  }
  const hasManageChannels = requesterMember.permissions.has(import_discord.PermissionFlagsBits.ManageChannels);
  if (!hasManageChannels) {
    (0, import_confirmation_store.removePendingPlan)(planId);
    (0, import_audit.recordToolAudit)(
      { ...plan, channelId: plan.channelId, requesterName: interaction.user.username },
      "denied",
      "MISSING_DISCORD_PERMISSION",
      startTime,
      false
    );
    await interaction.reply({
      content: "\u274C You no longer have ManageChannels permission.",
      ephemeral: true
    });
    return;
  }
  const botMember = await guild.members.me;
  if (!botMember || !botMember.permissions.has(import_discord.PermissionFlagsBits.ManageChannels)) {
    (0, import_confirmation_store.removePendingPlan)(planId);
    (0, import_audit.recordToolAudit)(
      { ...plan, channelId: plan.channelId, requesterName: interaction.user.username },
      "denied",
      "MISSING_DISCORD_PERMISSION",
      startTime,
      false
    );
    await interaction.reply({
      content: "\u274C Bot no longer has ManageChannels permission.",
      ephemeral: true
    });
    return;
  }
  const guildConfig = (0, import_channel_scope.loadGuildAIConfig)(plan.guildId);
  const requesterAshenRole = (0, import_permissions.resolveRole)({
    userId: interaction.user.id,
    guildId: plan.guildId,
    guildOwnerId: guild.ownerId,
    ownerIds: import_env.config.admin.discordIds,
    managementRoleIds: guildConfig.managementRoleIds,
    userRoleIds: [...requesterMember.roles.cache.keys()],
    trustedUserIds: guildConfig.trustedUserIds
  });
  await interaction.deferReply();
  (0, import_confirmation_store.markPlanExecuted)(planId);
  const executedSteps = [];
  const failedSteps = [];
  for (const step of steps) {
    const auth = authorizeTemplateStep(
      plan,
      step,
      requesterAshenRole,
      guildConfig,
      guild.ownerId,
      requesterMember.permissions
    );
    if (auth.denied) {
      failedSteps.push({ step: step.description, error: auth.message });
      (0, import_audit.recordToolAudit)(
        {
          ...plan,
          toolName: step.toolName,
          channelId: plan.channelId,
          requesterName: interaction.user.username
        },
        "denied",
        auth.reason,
        startTime,
        false
      );
      break;
    }
    const stepPlan = {
      id: `${planId}_step_${executedSteps.length + failedSteps.length}`,
      guildId: plan.guildId,
      channelId: plan.channelId,
      requesterId: plan.requesterId,
      toolName: step.toolName,
      arguments: step.args,
      riskLevel: "medium",
      changes: [{
        type: "create",
        target: step.description,
        description: step.description
      }],
      requiresConfirmation: false,
      createdAt: plan.createdAt,
      expiresAt: plan.expiresAt
    };
    try {
      const result = await executePlan(stepPlan);
      if (result.status === "success") {
        executedSteps.push(step.description);
      } else {
        failedSteps.push({
          step: step.description,
          error: sanitizeResultMessage(step.toolName, result.message)
        });
        break;
      }
    } catch (error) {
      failedSteps.push({
        step: step.description,
        error: sanitizeStepError(step, error)
      });
      break;
    }
  }
  const durationMs = Date.now() - startTime;
  if (failedSteps.length === 0) {
    await interaction.editReply({
      content: `\u2705 **Template applied successfully!**

**Completed ${executedSteps.length} operations:**
${executedSteps.map((s) => `\u2022 ${s}`).join("\n")}`
    });
    (0, import_audit.recordToolAudit)(
      { ...plan, channelId: plan.channelId, requesterName: interaction.user.username },
      "success",
      void 0,
      startTime,
      false
    );
  } else {
    const lines = ["\u26A0\uFE0F **Template partially applied.**", ""];
    if (executedSteps.length > 0) {
      lines.push("**Succeeded:**");
      for (const s of executedSteps) lines.push(`\u2022 \u2705 ${s}`);
      lines.push("");
    }
    lines.push("**Failed:**");
    for (const f of failedSteps) lines.push(`\u2022 \u274C ${f.step}: ${f.error}`);
    await interaction.editReply({ content: lines.join("\n") });
    (0, import_audit.recordToolAudit)(
      { ...plan, channelId: plan.channelId, requesterName: interaction.user.username },
      executedSteps.length > 0 ? "success" : "denied",
      void 0,
      startTime,
      false
    );
  }
  (0, import_confirmation_store.removePendingPlan)(planId);
  import_tool_rate_limit.toolRateLimiter.release(plan.guildId, plan.requesterId, planId);
  import_logger.logger.info(
    `Template confirmation executed: ${failedSteps.length === 0 ? "success" : "partial"} guild=${plan.guildId} by=${interaction.user.id} (${durationMs}ms, ${executedSteps.length} succeeded, ${failedSteps.length} failed)`
  );
}
async function handleConfirm(interaction) {
  const planId = interaction.customId.slice(CONFIRM_PREFIX.length);
  const startTime = Date.now();
  const plan = (0, import_confirmation_store.getPendingPlan)(planId);
  if (!plan) {
    await interaction.reply({
      content: "\u274C This confirmation has expired or is invalid.",
      ephemeral: true
    });
    return;
  }
  if ((0, import_confirmation_store.isPlanExpired)(plan)) {
    (0, import_confirmation_store.removePendingPlan)(planId);
    (0, import_audit.recordToolAudit)(
      { ...plan, channelId: plan.channelId, requesterName: interaction.user.username },
      "denied",
      "CONFIRMATION_EXPIRED",
      Date.now(),
      false
    );
    await interaction.reply({
      content: "\u23F1\uFE0F This action has expired. Please ask AshenAI to create a new action plan.",
      ephemeral: true
    });
    return;
  }
  const verification = (0, import_confirmation_store.verifyPlan)(plan, interaction.user.id, interaction.guildId || "");
  if (!verification.valid) {
    const reason = verification.reason || "CONFIRMATION_INVALID";
    let message = "\u274C This confirmation is invalid.";
    if (reason === "CONFIRMATION_EXPIRED") message = "\u274C This action has expired.";
    else if (reason === "ALREADY_EXECUTED") message = "\u274C This action was already executed.";
    else if (reason === "CONFIRMATION_INVALID") {
      if (plan.requesterId !== interaction.user.id) {
        message = "\u274C Only the original requester can confirm this action.";
      } else if (plan.guildId !== (interaction.guildId || "")) {
        message = "\u274C This action belongs to a different server.";
      }
    }
    await interaction.reply({ content: message, ephemeral: true });
    return;
  }
  const templateSteps = plan.arguments?.templateSteps;
  if (Array.isArray(templateSteps) && templateSteps.length > 0) {
    await handleTemplateConfirm(plan, templateSteps, interaction, startTime, planId);
    return;
  }
  const tool = import_registry.toolRegistry.get(plan.toolName);
  if (!tool) {
    (0, import_confirmation_store.removePendingPlan)(planId);
    await interaction.reply({
      content: "\u274C This tool is no longer available.",
      ephemeral: true
    });
    return;
  }
  const guild = await interaction.guild?.fetch();
  if (!guild) {
    await interaction.reply({
      content: "\u274C Could not fetch guild information.",
      ephemeral: true
    });
    return;
  }
  const requesterMember = await guild.members.fetch(interaction.user.id).catch(() => null);
  if (!requesterMember) {
    await interaction.reply({
      content: "\u274C You are not a member of this server.",
      ephemeral: true
    });
    return;
  }
  const hasManageChannels = requesterMember.permissions.has(import_discord.PermissionFlagsBits.ManageChannels);
  if (!hasManageChannels) {
    (0, import_confirmation_store.removePendingPlan)(planId);
    const result = { status: "denied", message: "\u274C You no longer have ManageChannels permission." };
    (0, import_audit.recordToolAudit)(
      { ...plan, channelId: plan.channelId, requesterName: interaction.user.username },
      "denied",
      "MISSING_DISCORD_PERMISSION",
      startTime,
      false
    );
    await interaction.reply({ content: result.message, ephemeral: true });
    return;
  }
  const botMember = await guild.members.me;
  if (!botMember || !botMember.permissions.has(import_discord.PermissionFlagsBits.ManageChannels)) {
    (0, import_confirmation_store.removePendingPlan)(planId);
    const result = { status: "denied", message: "\u274C Bot no longer has ManageChannels permission." };
    (0, import_audit.recordToolAudit)(
      { ...plan, channelId: plan.channelId, requesterName: interaction.user.username },
      "denied",
      "MISSING_DISCORD_PERMISSION",
      startTime,
      false
    );
    await interaction.reply({ content: result.message, ephemeral: true });
    return;
  }
  const guildConfig = (0, import_channel_scope.loadGuildAIConfig)(plan.guildId);
  const requesterAshenRole = (0, import_permissions.resolveRole)({
    userId: interaction.user.id,
    guildId: plan.guildId,
    guildOwnerId: guild.ownerId,
    ownerIds: import_env.config.admin.discordIds,
    managementRoleIds: guildConfig.managementRoleIds,
    userRoleIds: [...requesterMember.roles.cache.keys()],
    trustedUserIds: guildConfig.trustedUserIds
  });
  const validation = (0, import_validator.validateToolRequest)(tool, {
    guildId: plan.guildId,
    channelId: plan.channelId,
    requesterId: interaction.user.id,
    requesterName: interaction.user.username,
    requesterRole: requesterAshenRole,
    arguments: plan.arguments,
    dryRun: false
  }, guildConfig, false, true);
  if (!validation.allowed) {
    (0, import_confirmation_store.removePendingPlan)(planId);
    const result = {
      status: "denied",
      message: `\u274C ${validation.message || "Access denied."}`
    };
    (0, import_audit.recordToolAudit)(
      { ...plan, channelId: plan.channelId, requesterName: interaction.user.username },
      "denied",
      validation.denialReason,
      startTime,
      false
    );
    await interaction.reply({ content: result.message, ephemeral: true });
    return;
  }
  const toolsWithProtection = [
    "delete_channel",
    "delete_category",
    "rename_channel",
    "move_channel",
    "edit_channel",
    "manage_channel_permissions",
    "apply_channel_preset"
  ];
  if (toolsWithProtection.includes(plan.toolName)) {
    const targetId = String(plan.arguments.channelId || plan.arguments.categoryId || "").trim();
    if (targetId) {
      let parentId;
      const isChannelTool = plan.arguments.channelId && !plan.arguments.categoryId;
      if (isChannelTool && interaction.guild) {
        const ch = interaction.guild.channels.cache.get(targetId);
        parentId = ch?.parentId;
      }
      const isProtected = isChannelTool ? (0, import_protection.isChannelProtected)(plan.guildId, targetId, parentId) : (0, import_protection.isProtectedResource)(plan.guildId, targetId);
      if (isProtected) {
        (0, import_confirmation_store.removePendingPlan)(planId);
        const result = {
          status: "denied",
          message: "\u274C This resource is now protected. Protection was added after this plan was created."
        };
        (0, import_audit.recordToolAudit)(
          { ...plan, channelId: plan.channelId, requesterName: interaction.user.username },
          "denied",
          "PROTECTED_RESOURCE",
          startTime,
          false
        );
        await interaction.reply({ content: result.message, ephemeral: true });
        return;
      }
    }
  }
  await interaction.deferReply();
  const hasReservation = import_tool_rate_limit.toolRateLimiter.confirmReservation(
    plan.guildId,
    plan.requesterId,
    planId
  );
  if (!hasReservation) {
    (0, import_confirmation_store.removePendingPlan)(planId);
    await interaction.editReply({
      content: "\u274C Rate limit reservation expired or not found. Please create a new action plan."
    });
    (0, import_audit.recordToolAudit)(
      { ...plan, channelId: plan.channelId, requesterName: interaction.user.username },
      "denied",
      "RATE_LIMITED",
      startTime,
      false
    );
    return;
  }
  (0, import_confirmation_store.markPlanExecuted)(planId);
  try {
    const result = await executePlan(plan);
    const durationMs = Date.now() - startTime;
    if (result.status === "success") {
      await interaction.editReply({
        content: result.message
      });
      (0, import_audit.recordToolAudit)(
        { ...plan, channelId: plan.channelId, requesterName: interaction.user.username },
        "success",
        void 0,
        startTime,
        false
      );
    } else {
      await interaction.editReply({
        content: sanitizeResultMessage(plan.toolName, result.message || `\u274C ${result.status}`)
      });
      (0, import_audit.recordToolAudit)(
        { ...plan, channelId: plan.channelId, requesterName: interaction.user.username },
        result.status,
        void 0,
        startTime,
        false
      );
    }
    (0, import_confirmation_store.removePendingPlan)(planId);
    import_tool_rate_limit.toolRateLimiter.release(plan.guildId, plan.requesterId, planId);
    import_logger.logger.info(
      `Tool confirmation executed: ${plan.toolName} [${result.status}] guild=${plan.guildId} by=${interaction.user.id} (${durationMs}ms)`
    );
  } catch (error) {
    import_logger.logger.error(`Tool confirmation execution failed: ${plan.toolName} \u2014 ${error instanceof Error ? error.message : String(error)}`);
    (0, import_confirmation_store.removePendingPlan)(planId);
    import_tool_rate_limit.toolRateLimiter.release(plan.guildId, plan.requesterId, planId);
    try {
      await interaction.editReply({
        content: (0, import_sanitize.sanitizeToolError)(plan.toolName, error)
      });
    } catch {
    }
    (0, import_audit.recordToolAudit)(
      { ...plan, channelId: plan.channelId, requesterName: interaction.user.username },
      "error",
      void 0,
      startTime,
      false
    );
  }
}
async function handleCancel(interaction) {
  const planId = interaction.customId.slice(CANCEL_PREFIX.length);
  const startTime = Date.now();
  const plan = (0, import_confirmation_store.getPendingPlan)(planId);
  if (!plan) {
    await interaction.reply({
      content: "\u274C This confirmation has expired or is invalid.",
      ephemeral: true
    });
    return;
  }
  if (plan.requesterId !== interaction.user.id) {
    await interaction.reply({
      content: "\u274C Only the original requester can cancel this action.",
      ephemeral: true
    });
    return;
  }
  if (plan.guildId !== (interaction.guildId || "")) {
    await interaction.reply({
      content: "\u274C This action belongs to a different server.",
      ephemeral: true
    });
    return;
  }
  (0, import_confirmation_store.removePendingPlan)(planId);
  import_tool_rate_limit.toolRateLimiter.release(plan.guildId, plan.requesterId, planId);
  (0, import_audit.recordToolAudit)(
    { ...plan, channelId: plan.channelId, requesterName: interaction.user.username },
    "denied",
    void 0,
    startTime,
    false
  );
  await interaction.reply({
    content: "\u274C Action cancelled.",
    ephemeral: true
  });
  import_logger.logger.info(
    `Tool confirmation cancelled: ${plan.toolName} guild=${plan.guildId} by=${interaction.user.id}`
  );
}
async function handleToolConfirmation(interaction) {
  const { customId } = interaction;
  if (customId.startsWith(CONFIRM_PREFIX)) {
    await handleConfirm(interaction);
  } else if (customId.startsWith(CANCEL_PREFIX)) {
    await handleCancel(interaction);
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  handleToolConfirmation,
  isToolConfirmationId,
  setDiscordClient
});
