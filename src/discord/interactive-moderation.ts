import {
  GuildMember,
  PermissionFlagsBits,
} from "discord.js";

import { canModerate, canTarget } from "./moderation";
import { addWarning } from "./warnings";
import { recordAudit } from "../security/audit";

export interface InteractiveModerationResult {
  success: boolean;
  message: string;
}

export async function executeInteractiveModeration(
  requester: GuildMember,
  target: GuildMember,
  botMember: GuildMember,
  action: string,
  durationMinutes?: number,
  reason = "Interactive moderation action"
): Promise<InteractiveModerationResult> {
  const requiredPermission =
    PermissionFlagsBits.ModerateMembers;

  if (!canModerate(requester, requiredPermission)) {
    recordAudit({
      who: requester.id,
      whoName: requester.user.tag,
      what: `Interactive ${action} denied: insufficient permissions`,
      where: "discord",
      guildId: target.guild.id,
      result: "denied",
    });
    return {
      success: false,
      message:
        "❌ You don't have permission to perform this moderation action.",
    };
  }

  const targetCheck = canTarget(
    requester,
    target,
    botMember
  );

  if (!targetCheck.allowed) {
    return {
      success: false,
      message: `❌ ${targetCheck.reason}`,
    };
  }

  if (action === "warn") {
    const warning = addWarning(
      target.guild.id,
      target.id,
      requester.id,
      reason
    );

    recordAudit({
      who: requester.id,
      whoName: requester.user.tag,
      what: `Warned ${target.user.tag}: ${reason}`,
      where: "discord",
      guildId: target.guild.id,
      result: "success",
    });

    return {
      success: true,
      message:
        `⚠️ **Warning issued**\n` +
        `Member: ${target}\n` +
        `Reason: ${reason}\n` +
        `Warning ID: ${warning.id}`,
    };
  }

  if (action === "timeout") {
    if (
      !durationMinutes ||
      !Number.isFinite(durationMinutes) ||
      durationMinutes < 1 ||
      durationMinutes > 40320
    ) {
      return {
        success: false,
        message:
          "❌ Timeout duration must be between 1 minute and 28 days.",
      };
    }

    if (
      !botMember.permissions.has(
        PermissionFlagsBits.ModerateMembers
      )
    ) {
      return {
        success: false,
        message:
          "❌ I don't have permission to timeout members.",
      };
    }

    try {
      await target.timeout(
        durationMinutes * 60 * 1000,
        reason
      );

      recordAudit({
        who: requester.id,
        whoName: requester.user.tag,
        what: `Timed out ${target.user.tag} for ${durationMinutes}m: ${reason}`,
        where: "discord",
        guildId: target.guild.id,
        result: "success",
      });

      return {
        success: true,
        message:
          `🔇 **Member timed out**\n` +
          `Member: ${target}\n` +
          `Duration: ${durationMinutes} minute(s)\n` +
          `Reason: ${reason}`,
      };
    } catch {
      recordAudit({
        who: requester.id,
        whoName: requester.user.tag,
        what: `Timed out ${target.user.tag} failed: Discord rejected`,
        where: "discord",
        guildId: target.guild.id,
        result: "failure",
      });
      return {
        success: false,
        message:
          "❌ Discord rejected the timeout. Check my role position and permissions.",
      };
    }
  }

  return {
    success: false,
    message:
      "❌ This interactive moderation action is not supported yet.",
  };
}
