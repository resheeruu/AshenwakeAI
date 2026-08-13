import {
  Guild,
  GuildMember,
  PermissionFlagsBits,
} from "discord.js";

export function canManageServer(member: GuildMember | null): boolean {
  if (!member) return false;

  return (
    member.permissions.has(PermissionFlagsBits.Administrator) ||
    member.permissions.has(PermissionFlagsBits.ManageGuild)
  );
}

export function getServerSummary(guild: Guild): string {
  return [
    `Server: ${guild.name}`,
    `Server ID: ${guild.id}`,
    `Members: ${guild.memberCount}`,
    `Roles: ${guild.roles.cache.size}`,
    `Channels: ${guild.channels.cache.size}`,
  ].join("\n");
}

export function getMemberSummary(member: GuildMember): string {
  const roles = member.roles.cache
    .filter((role) => role.id !== member.guild.id)
    .map((role) => role.name)
    .slice(0, 20);

  return [
    `User: ${member.user.tag}`,
    `User ID: ${member.id}`,
    `Roles: ${roles.length ? roles.join(", ") : "none"}`,
    `Administrator: ${
      member.permissions.has(PermissionFlagsBits.Administrator)
        ? "yes"
        : "no"
    }`,
    `Manage Server: ${
      member.permissions.has(PermissionFlagsBits.ManageGuild)
        ? "yes"
        : "no"
    }`,
  ].join("\n");
}
