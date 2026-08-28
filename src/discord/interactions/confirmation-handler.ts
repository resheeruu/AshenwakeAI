import type { ButtonInteraction, Client } from "discord.js";
import { PermissionFlagsBits, ChannelType } from "discord.js";
import { logger } from "../../logger";
import {
  getPendingPlan,
  removePendingPlan,
  verifyPlan,
  markPlanExecuted,
  isPlanExpired,
} from "../../ai/tools/confirmation-store";
import { recordToolAudit } from "../../ai/tools/audit";
import { loadGuildAIConfig } from "../../ai/tools/channel-scope";
import { validateToolRequest } from "../../ai/tools/validator";
import { toolRegistry } from "../../ai/tools/registry";
import { isChannelProtected, isProtectedResource } from "../../ai/tools/discord/protection";
import { executeCreateChannel } from "../../ai/tools/discord/create-channel";
import { executeCreateCategory } from "../../ai/tools/discord/create-category";
import { executeRenameChannel } from "../../ai/tools/discord/rename-channel";
import { executeMoveChannel } from "../../ai/tools/discord/move-channel";
import { executeEditChannel } from "../../ai/tools/discord/channels/edit-channel";
import { executeDeleteChannel } from "../../ai/tools/discord/channels/delete-channel";
import { executeDeleteCategory } from "../../ai/tools/discord/channels/delete-category";
import { executeManageChannelPermissions } from "../../ai/tools/discord/channels/permissions";
import { executeProtectChannel, executeUnprotectChannel, executeProtectCategory, executeUnprotectCategory } from "../../ai/tools/discord/protection-tools";
import { executeApplyChannelPreset } from "../../ai/tools/discord/channels/permission-presets";
import { executeCreateGuildPolicyPlan, executeUpdateGuildPolicyPlan, executeApplyPolicyTemplatePlan } from "../../ai/tools/governance";
import { executeWarnUserPlan, executeTimeoutUserPlan, executeUntimeoutUserPlan, executeKickUserPlan, executeBanUserPlan, executePurgeMessagesPlan } from "../../ai/tools/discord/moderation";
import type { ToolContext, ActionPlan } from "../../ai/tools/types";

/* ================================================================
 * U5 CONFIRMATION HANDLER
 *
 * Handles ashen_tool_confirm:<planId> and ashen_tool_cancel:<planId>
 * button interactions for all U4+ write tool confirmations.
 *
 * Custom IDs:
 *   ashen_tool_confirm:<planId>
 *   ashen_tool_cancel:<planId>
 * ================================================================ */

const CONFIRM_PREFIX = "ashen_tool_confirm:";
const CANCEL_PREFIX = "ashen_tool_cancel:";

export function isToolConfirmationId(customId: string): boolean {
  return customId.startsWith(CONFIRM_PREFIX) || customId.startsWith(CANCEL_PREFIX);
}

/* ================================================================
 * CLIENT REFERENCE
 * ================================================================ */

let discordClient: Client | null = null;

export function setDiscordClient(client: Client): void {
  discordClient = client;
}

function getClient(): Client | null {
  return discordClient;
}

/* ================================================================
 * EXECUTE PLAN DISPATCHER
 * ================================================================ */

async function executePlan(plan: ActionPlan): Promise<{ status: string; message: string }> {
  const client = getClient();
  if (!client) {
    return { status: "error", message: "Discord client is not connected." };
  }

  const toolName = plan.toolName;

  switch (toolName) {
    case "create_channel":
      return executeCreateChannel(plan, () => client);
    case "create_category":
      return executeCreateCategory(plan, () => client);
    case "rename_channel":
      return executeRenameChannel(plan, () => client);
    case "move_channel":
      return executeMoveChannel(plan, () => client);
    case "edit_channel":
      return executeEditChannel(plan, () => client);
    case "delete_channel":
      return executeDeleteChannel(plan, () => client);
    case "delete_category":
      return executeDeleteCategory(plan, () => client);
    case "manage_channel_permissions":
      return executeManageChannelPermissions(plan, () => client);
    case "protect_channel":
      return executeProtectChannel(plan, () => client);
    case "unprotect_channel":
      return executeUnprotectChannel(plan, () => client);
    case "protect_category":
      return executeProtectCategory(plan, () => client);
    case "unprotect_category":
      return executeUnprotectCategory(plan, () => client);
    case "apply_channel_preset":
      return executeApplyChannelPreset(plan, () => client);
    case "create_guild_policy":
      return executeCreateGuildPolicyPlan(plan);
    case "update_guild_policy":
      return executeUpdateGuildPolicyPlan(plan);
    case "apply_policy_template":
      return executeApplyPolicyTemplatePlan(plan);
    case "warn_user":
      return executeWarnUserPlan(plan, () => client);
    case "timeout_user":
      return executeTimeoutUserPlan(plan, () => client);
    case "untimeout_user":
      return executeUntimeoutUserPlan(plan, () => client);
    case "kick_user":
      return executeKickUserPlan(plan, () => client);
    case "ban_user":
      return executeBanUserPlan(plan, () => client);
    case "purge_messages":
      return executePurgeMessagesPlan(plan, () => client);
    default:
      return { status: "error", message: `Unknown tool: ${toolName}` };
  }
}

/* ================================================================
 * CONFIRM BUTTON HANDLER
 * ================================================================ */

async function handleConfirm(interaction: ButtonInteraction): Promise<void> {
  const planId = interaction.customId.slice(CONFIRM_PREFIX.length);
  const startTime = Date.now();

  const plan = getPendingPlan(planId);

  // 1. Plan exists?
  if (!plan) {
    await interaction.reply({
      content: "❌ This confirmation has expired or is invalid.",
      ephemeral: true,
    });
    return;
  }

  // 2. Not expired?
  if (isPlanExpired(plan)) {
    removePendingPlan(planId);
    recordToolAudit(
      { ...plan, channelId: plan.channelId, requesterName: interaction.user.username } as any,
      "denied",
      "CONFIRMATION_EXPIRED",
      Date.now(),
      false,
    );
    await interaction.reply({
      content: "⏱️ This action has expired. Please ask AshenAI to create a new action plan.",
      ephemeral: true,
    });
    return;
  }

  // 3. Not already executed?
  const verification = verifyPlan(plan, interaction.user.id, interaction.guildId || "");
  if (!verification.valid) {
    const reason = verification.reason || "CONFIRMATION_INVALID";
    let message = "❌ This confirmation is invalid.";
    if (reason === "CONFIRMATION_EXPIRED") message = "❌ This action has expired.";
    else if (reason === "ALREADY_EXECUTED") message = "❌ This action was already executed.";
    else if (reason === "CONFIRMATION_INVALID") {
      if (plan.requesterId !== interaction.user.id) {
        message = "❌ Only the original requester can confirm this action.";
      } else if (plan.guildId !== (interaction.guildId || "")) {
        message = "❌ This action belongs to a different server.";
      }
    }
    await interaction.reply({ content: message, ephemeral: true });
    return;
  }

  // 4. Re-check application role
  const tool = toolRegistry.get(plan.toolName);
  if (!tool) {
    removePendingPlan(planId);
    await interaction.reply({
      content: "❌ This tool is no longer available.",
      ephemeral: true,
    });
    return;
  }

  // 5. Re-check Discord permissions
  const guild = await interaction.guild?.fetch();
  if (!guild) {
    await interaction.reply({
      content: "❌ Could not fetch guild information.",
      ephemeral: true,
    });
    return;
  }

  const requesterMember = await guild.members.fetch(interaction.user.id).catch(() => null);
  if (!requesterMember) {
    await interaction.reply({
      content: "❌ You are not a member of this server.",
      ephemeral: true,
    });
    return;
  }

  const hasManageChannels = requesterMember.permissions.has(PermissionFlagsBits.ManageChannels);
  if (!hasManageChannels) {
    removePendingPlan(planId);
    const result = { status: "denied", message: "❌ You no longer have ManageChannels permission." };
    recordToolAudit(
      { ...plan, channelId: plan.channelId, requesterName: interaction.user.username } as any,
      "denied",
      "MISSING_DISCORD_PERMISSION",
      startTime,
      false,
    );
    await interaction.reply({ content: result.message, ephemeral: true });
    return;
  }

  // 6. Re-check bot permissions
  const botMember = await guild.members.me;
  if (!botMember || !botMember.permissions.has(PermissionFlagsBits.ManageChannels)) {
    removePendingPlan(planId);
    const result = { status: "denied", message: "❌ Bot no longer has ManageChannels permission." };
    recordToolAudit(
      { ...plan, channelId: plan.channelId, requesterName: interaction.user.username } as any,
      "denied",
      "MISSING_DISCORD_PERMISSION",
      startTime,
      false,
    );
    await interaction.reply({ content: result.message, ephemeral: true });
    return;
  }

  // 7. Re-check channel scope
  const guildConfig = loadGuildAIConfig(plan.guildId);
  const validation = validateToolRequest(tool, {
    guildId: plan.guildId,
    channelId: plan.channelId,
    requesterId: interaction.user.id,
    requesterName: interaction.user.username,
    requesterRole: "moderator",
    arguments: plan.arguments,
    dryRun: false,
  }, guildConfig, false);

  if (!validation.allowed) {
    removePendingPlan(planId);
    const result = {
      status: "denied",
      message: `❌ ${validation.message || "Access denied."}`,
    };
    recordToolAudit(
      { ...plan, channelId: plan.channelId, requesterName: interaction.user.username } as any,
      "denied",
      validation.denialReason,
      startTime,
      false,
    );
    await interaction.reply({ content: result.message, ephemeral: true });
    return;
  }

  // 8. Re-check protected resources for destructive tools (including category inheritance)
  const toolsWithProtection = [
    "delete_channel", "delete_category", "rename_channel",
    "move_channel", "edit_channel", "manage_channel_permissions",
    "apply_channel_preset",
  ];
  if (toolsWithProtection.includes(plan.toolName)) {
    const targetId = String(plan.arguments.channelId || plan.arguments.categoryId || "").trim();
    if (targetId) {
      // For channel tools, fetch parentId to check category inheritance
      let parentId: string | null | undefined;
      const isChannelTool = plan.arguments.channelId && !plan.arguments.categoryId;
      if (isChannelTool && interaction.guild) {
        const ch = interaction.guild.channels.cache.get(targetId);
        parentId = ch?.parentId;
      }
      const isProtected = isChannelTool
        ? isChannelProtected(plan.guildId, targetId, parentId)
        : isProtectedResource(plan.guildId, targetId);
      if (isProtected) {
        removePendingPlan(planId);
        const result = {
          status: "denied",
          message: "❌ This resource is now protected. Protection was added after this plan was created.",
        };
        recordToolAudit(
          { ...plan, channelId: plan.channelId, requesterName: interaction.user.username } as any,
          "denied",
          "PROTECTED_RESOURCE",
          startTime,
          false,
        );
        await interaction.reply({ content: result.message, ephemeral: true });
        return;
      }
    }
  }

  // 9. Defer reply (execution may take time)
  await interaction.deferReply();

  // 10. Mark executed BEFORE execution (prevents double-execution)
  markPlanExecuted(planId);

  // 10. Execute
  try {
    const result = await executePlan(plan);
    const durationMs = Date.now() - startTime;

    if (result.status === "success") {
      await interaction.editReply({
        content: result.message,
      });
      recordToolAudit(
        { ...plan, channelId: plan.channelId, requesterName: interaction.user.username } as any,
        "success",
        undefined,
        startTime,
        false,
      );
    } else {
      await interaction.editReply({
        content: result.message || `❌ ${result.status}`,
      });
      recordToolAudit(
        { ...plan, channelId: plan.channelId, requesterName: interaction.user.username } as any,
        result.status as any,
        undefined,
        startTime,
        false,
      );
    }

    // 11. Remove plan from store
    removePendingPlan(planId);

    logger.info(
      `Tool confirmation executed: ${plan.toolName} [${result.status}] guild=${plan.guildId} by=${interaction.user.id} (${durationMs}ms)`,
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`Tool confirmation execution failed: ${plan.toolName} — ${msg}`);
    removePendingPlan(planId);

    try {
      await interaction.editReply({
        content: `❌ Execution failed: ${msg}`,
      });
    } catch {
      // Interaction may have been deleted
    }

    recordToolAudit(
      { ...plan, channelId: plan.channelId, requesterName: interaction.user.username } as any,
      "error",
      undefined,
      startTime,
      false,
    );
  }
}

/* ================================================================
 * CANCEL BUTTON HANDLER
 * ================================================================ */

async function handleCancel(interaction: ButtonInteraction): Promise<void> {
  const planId = interaction.customId.slice(CANCEL_PREFIX.length);
  const startTime = Date.now();

  const plan = getPendingPlan(planId);

  if (!plan) {
    await interaction.reply({
      content: "❌ This confirmation has expired or is invalid.",
      ephemeral: true,
    });
    return;
  }

  // Verify requester
  if (plan.requesterId !== interaction.user.id) {
    await interaction.reply({
      content: "❌ Only the original requester can cancel this action.",
      ephemeral: true,
    });
    return;
  }

  // Verify guild
  if (plan.guildId !== (interaction.guildId || "")) {
    await interaction.reply({
      content: "❌ This action belongs to a different server.",
      ephemeral: true,
    });
    return;
  }

  // Remove plan
  removePendingPlan(planId);

  // Audit cancellation
  recordToolAudit(
    { ...plan, channelId: plan.channelId, requesterName: interaction.user.username } as any,
    "denied",
    undefined,
    startTime,
    false,
  );

  await interaction.reply({
    content: "❌ Action cancelled.",
    ephemeral: true,
  });

  logger.info(
    `Tool confirmation cancelled: ${plan.toolName} guild=${plan.guildId} by=${interaction.user.id}`,
  );
}

/* ================================================================
 * MAIN HANDLER
 * ================================================================ */

export async function handleToolConfirmation(interaction: ButtonInteraction): Promise<void> {
  const { customId } = interaction;

  if (customId.startsWith(CONFIRM_PREFIX)) {
    await handleConfirm(interaction);
  } else if (customId.startsWith(CANCEL_PREFIX)) {
    await handleCancel(interaction);
  }
}
