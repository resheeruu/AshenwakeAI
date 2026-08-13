import {
  GuildMember,
  Message,
  PermissionFlagsBits,
} from "discord.js";

export function getServerContext(
  message: Message,
  targetMember?: GuildMember | null
): string {
  if (!message.guild) {
    return "This conversation is happening in a direct message.";
  }

  const guild = message.guild;
  const member = message.member;

  const lines = [
    `Server: ${guild.name}`,
    `Server ID: ${guild.id}`,
    `Channel: ${message.channel.isDMBased() ? "DM" : message.channel.id}`,
  ];

  if (member) {
    lines.push(
      `Requester: ${member.user.tag}`,
      `Requester ID: ${member.id}`,
      `Requester administrator: ${
        member.permissions.has(PermissionFlagsBits.Administrator)
          ? "yes"
          : "no"
      }`,
      `Requester manage server: ${
        member.permissions.has(PermissionFlagsBits.ManageGuild)
          ? "yes"
          : "no"
      }`,
      `Requester manage messages: ${
        member.permissions.has(PermissionFlagsBits.ManageMessages)
          ? "yes"
          : "no"
      }`
    );
  }

  if (targetMember) {
    const roles = targetMember.roles.cache
      .filter((role) => role.id !== guild.id)
      .map((role) => role.name)
      .slice(0, 20);

    lines.push(
      `Mentioned user: ${targetMember.user.tag}`,
      `Mentioned user ID: ${targetMember.id}`,
      `Mentioned user roles: ${
        roles.length ? roles.join(", ") : "none"
      }`
    );
  }

  return lines.join("\n");
}
