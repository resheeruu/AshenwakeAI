import {
  GuildMember,
  PermissionFlagsBits,
} from "discord.js";

export function canModerate(
  requester: GuildMember,
  requiredPermission: bigint
): boolean {
  return requester.permissions.has(
    PermissionFlagsBits.Administrator
  ) || requester.permissions.has(requiredPermission);
}

export function canTarget(
  requester: GuildMember,
  target: GuildMember,
  botMember: GuildMember
): { allowed: boolean; reason?: string } {
  if (target.id === requester.id) {
    return {
      allowed: false,
      reason: "You cannot use this action on yourself.",
    };
  }

  if (target.id === botMember.id) {
    return {
      allowed: false,
      reason: "I cannot moderate myself.",
    };
  }

  if (target.id === target.guild.ownerId) {
    return {
      allowed: false,
      reason: "The server owner cannot be moderated by this system.",
    };
  }

  if (target.roles.highest.position >= requester.roles.highest.position) {
    return {
      allowed: false,
      reason: "Your highest role must be above the target's highest role.",
    };
  }

  if (target.roles.highest.position >= botMember.roles.highest.position) {
    return {
      allowed: false,
      reason: "My highest role must be above the target's highest role.",
    };
  }

  return { allowed: true };
}
