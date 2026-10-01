import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  UserSelectMenuBuilder,
  RoleSelectMenuBuilder,
  StringSelectMenuBuilder,
  type ChatInputCommandInteraction,
  type GuildMember,
} from "discord.js";

import { getServerSummary } from "../server-actions";
import { getAuditLog } from "../../security/audit";
import { UserRateLimiter } from "../../security/rate-limit";
import { logger } from "../../logger";
import {
  BRAND,
  closedPanelEmbed,
  panelNavRow,
  PANEL_PREFIXES,
} from "./shared";

const serverRateLimiter = new UserRateLimiter(5, 60_000);

const SERVER_PANEL_PREFIX = PANEL_PREFIXES.server;

function nav(opts: { home?: boolean; back?: boolean } = {}): ActionRowBuilder<ButtonBuilder> {
  return panelNavRow(SERVER_PANEL_PREFIX, opts);
}

function serverHomePayload(guild: any): {
  embeds: EmbedBuilder[];
  components: ActionRowBuilder<any>[];
} {
  const summary = getServerSummary(guild);

  const embed = new EmbedBuilder()
    .setTitle("🏰 SERVER CENTER")
    .setDescription(`**${guild.name}**\n${summary}`)
    .setColor(BRAND)
    .setFooter({ text: "Select a section below to explore." });

  if (guild.iconURL()) {
    embed.setThumbnail(guild.iconURL());
  }

  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`${SERVER_PANEL_PREFIX}info`).setLabel("🏠 Info").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`${SERVER_PANEL_PREFIX}roles`).setLabel("🛡️ Roles").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`${SERVER_PANEL_PREFIX}user`).setLabel("👤 User").setStyle(ButtonStyle.Secondary),
      ),
      nav({ home: false }),
    ],
  };
}

function serverInfoPayload(guild: any): {
  embeds: EmbedBuilder[];
  components: ActionRowBuilder<any>[];
} {
  const createdAt = guild.createdTimestamp;
  const createdStr = createdAt ? `<t:${Math.floor(createdAt / 1000)}:F>` : "Unknown";

  const owner = guild.ownerId ? `<@${guild.ownerId}>` : "Unknown";

  const boostLevel = guild.premiumTier ?? 0;
  const boostCount = guild.premiumSubscriptionCount ?? 0;

  const verificationLevels = ["None", "Low", "Medium", "High", "Very High"];
  const verificationStr = verificationLevels[guild.verificationLevel] ?? "Unknown";

  const features = guild.features?.length
    ? guild.features.slice(0, 10).map((f: string) => `• ${f}`).join("\n")
    : "None";

  const summary = getServerSummary(guild);

  const embed = new EmbedBuilder()
    .setTitle("🏠 Server Information")
    .setColor(BRAND)
    .setDescription(summary)
    .addFields(
      { name: "👑 Owner", value: owner, inline: true },
      { name: "📅 Created", value: createdStr, inline: true },
      { name: "🚀 Boost Level", value: `Level ${boostLevel} (${boostCount} boosts)`, inline: true },
      { name: "🔐 Verification", value: verificationStr, inline: true },
      { name: "✨ Features", value: features, inline: false },
    )
    .setFooter({ text: `Server ID: ${guild.id}` });

  if (guild.iconURL()) {
    embed.setThumbnail(guild.iconURL());
  }

  return {
    embeds: [embed],
    components: [nav({ back: true })],
  };
}

function serverRolesPayload(guild: any): {
  embeds: EmbedBuilder[];
  components: ActionRowBuilder<any>[];
} {
  const roles = guild.roles.cache
    .filter((r: any) => r.id !== guild.id)
    .sort((a: any, b: any) => b.position - a.position);

  const roleCount = roles.size;
  const displayRoles = roles.first(20);

  let roleList = displayRoles
    .map((r: any) => `${r.mentionable ? "📢 " : ""}${r.name} ${r.managed ? "🤖" : ""} (${r.members.size})`)
    .join("\n");

  if (roleCount > 20) {
    roleList += `\n… and ${roleCount - 20} more roles`;
  }

  const embed = new EmbedBuilder()
    .setTitle("🛡️ Server Roles")
    .setColor(BRAND)
    .setDescription(`Total roles: **${roleCount}** (excluding @everyone)\n\n${roleList}`)
    .setFooter({ text: "Select a role to view details." });

  const selectRow = new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(
    new RoleSelectMenuBuilder()
      .setCustomId(`${SERVER_PANEL_PREFIX}role:pick`)
      .setPlaceholder("Select a role to view details")
      .setMinValues(1)
      .setMaxValues(1),
  );

  return {
    embeds: [embed],
    components: [selectRow, nav({ back: true })],
  };
}

function roleDetailPayload(role: any): {
  embeds: EmbedBuilder[];
  components: ActionRowBuilder<any>[];
} {
  const position = role.position;
  const memberCount = role.members.size;
  const mentionable = role.mentionable ? "Yes" : "No";
  const managed = role.managed ? "Yes (integration)" : "No";
  const colorStr = role.hexColor;
  const createdAt = role.createdTimestamp
    ? `<t:${Math.floor(role.createdTimestamp / 1000)}:F>`
    : "Unknown";

  const permissions = role.permissions.toArray().slice(0, 15).join(", ") || "None";
  const permDisplay = role.permissions.toArray().length > 15
    ? `${permissions}, … (+${role.permissions.toArray().length - 15} more)`
    : permissions;

  const embed = new EmbedBuilder()
    .setTitle(`🛡️ ${role.name}`)
    .setColor(role.color)
    .addFields(
      { name: "🆔 ID", value: role.id, inline: true },
      { name: "📍 Position", value: `${position}`, inline: true },
      { name: "👥 Members", value: `${memberCount}`, inline: true },
      { name: "📢 Mentionable", value: mentionable, inline: true },
      { name: "🤖 Managed", value: managed, inline: true },
      { name: "🎨 Color", value: colorStr, inline: true },
      { name: "📅 Created", value: createdAt, inline: true },
      { name: "🔐 Permissions", value: permDisplay, inline: false },
    )
    .setFooter({ text: `Role ID: ${role.id}` });

  return {
    embeds: [embed],
    components: [nav({ back: true })],
  };
}

function serverUserPayload(guild: any): {
  embeds: EmbedBuilder[];
  components: ActionRowBuilder<any>[];
} {
  const embed = new EmbedBuilder()
    .setTitle("👤 User Lookup")
    .setColor(BRAND)
    .setDescription("Select a member to view their server-specific information.")
    .setFooter({ text: "Use the dropdown below to select a member." });

  const selectRow = new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
    new UserSelectMenuBuilder()
      .setCustomId(`${SERVER_PANEL_PREFIX}user:pick`)
      .setPlaceholder("Select a member")
      .setMinValues(1)
      .setMaxValues(1),
  );

  return {
    embeds: [embed],
    components: [selectRow, nav({ back: true })],
  };
}

function userDetailPayload(member: GuildMember): {
  embeds: EmbedBuilder[];
  components: ActionRowBuilder<any>[];
} {
  const displayName = member.displayName;
  const username = member.user.tag;
  const userId = member.id;
  const joinedAt = member.joinedTimestamp
    ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:F>`
    : "Unknown";
  const createdAt = member.user.createdTimestamp
    ? `<t:${Math.floor(member.user.createdTimestamp / 1000)}:F>`
    : "Unknown";

  const roles = member.roles.cache
    .filter((r) => r.id !== member.guild.id)
    .sort((a, b) => b.position - a.position)
    .map((r) => r.name);

  const avatarURL = member.user.displayAvatarURL({ size: 256 });

  const embed = new EmbedBuilder()
    .setTitle("👤 User Information")
    .setColor(BRAND)
    .setThumbnail(avatarURL)
    .addFields(
      { name: "Display Name", value: displayName, inline: true },
      { name: "Username", value: username, inline: true },
      { name: "User ID", value: userId, inline: true },
      { name: "Joined Server", value: joinedAt, inline: true },
      { name: "Account Created", value: createdAt, inline: true },
      { name: "Bot", value: member.user.bot ? "Yes" : "No", inline: true },
    );

  if (roles.length > 0) {
    embed.addFields({ name: "Roles", value: roles.slice(0, 20).join(", ") + (roles.length > 20 ? ` … (+${roles.length - 20} more)` : "") });
  }

  return {
    embeds: [embed],
    components: [nav({ back: true })],
  };
}

const activeSessions = new Map<string, { guildId: string; userId: string; channelId: string; messageId: string; currentView: string }>();

function sessionKey(guildId: string, userId: string): string {
  return `${guildId}:${userId}`;
}

function registerSession(guildId: string, userId: string, channelId: string, messageId: string): void {
  const key = sessionKey(guildId, userId);
  activeSessions.set(key, { guildId, userId, channelId, messageId, currentView: "home" });
}

function getSession(guildId: string, userId: string): { guildId: string; userId: string; channelId: string; messageId: string; currentView: string } | undefined {
  const key = sessionKey(guildId, userId);
  const session = activeSessions.get(key);
  if (!session) return undefined;
  if (Date.now() - (session as any).createdAt > 300_000) {
    activeSessions.delete(key);
    return undefined;
  }
  return session;
}

function removeSession(guildId: string, userId: string): void {
  activeSessions.delete(sessionKey(guildId, userId));
}

function updateSessionView(guildId: string, userId: string, view: string): void {
  const key = sessionKey(guildId, userId);
  const session = activeSessions.get(key);
  if (session) {
    session.currentView = view;
  }
}

const EXPIRED_PANEL_MSG = "This panel has expired. Use `/server` to open a new one.";
const NO_PERM_PANEL_MSG = "You need the Manage Server permission to use this panel.";

function panelDenyReason(
  interaction: { memberPermissions?: { has?: (perm: bigint) => boolean } | null },
  session: { guildId: string; userId: string; channelId: string; messageId: string } | undefined,
  opts: { requireMessageBinding?: boolean } = {},
): string | undefined {
  const perms = interaction.memberPermissions;
  if (!perms || typeof perms.has !== "function" || !perms.has(PermissionFlagsBits.ManageGuild)) {
    return NO_PERM_PANEL_MSG;
  }
  if (!session) return EXPIRED_PANEL_MSG;
  if (opts.requireMessageBinding) {
    const messageId = (interaction as { message?: { id?: string } }).message?.id;
    if (!messageId || messageId !== session.messageId) return EXPIRED_PANEL_MSG;
  }
  return undefined;
}

import { PermissionFlagsBits } from "discord.js";

async function handleRolePick(interaction: any, guild: any, session: any): Promise<void> {
  const deny = panelDenyReason(interaction, session, { requireMessageBinding: true });
  if (deny) {
    await interaction.reply({ content: deny, flags: MessageFlags.Ephemeral });
    return;
  }

  const roleId = interaction.values?.[0];
  if (!roleId) {
    await interaction.reply({ content: "❌ No role selected.", flags: MessageFlags.Ephemeral });
    return;
  }

  const role = guild.roles.cache.get(roleId);
  if (!role) {
    await interaction.reply({ content: "❌ Role not found.", flags: MessageFlags.Ephemeral });
    return;
  }

  updateSessionView(session.guildId, session.userId, "role_detail");
  await interaction.update(roleDetailPayload(role));
}

async function handleUserPick(interaction: any, guild: any, session: any): Promise<void> {
  const deny = panelDenyReason(interaction, session, { requireMessageBinding: true });
  if (deny) {
    await interaction.reply({ content: deny, flags: MessageFlags.Ephemeral });
    return;
  }

  const userId = interaction.values?.[0];
  if (!userId) {
    await interaction.reply({ content: "❌ No member selected.", flags: MessageFlags.Ephemeral });
    return;
  }

  let member: GuildMember | null = null;
  try {
    member = await guild.members.fetch(userId);
  } catch {
    member = null;
  }

  if (!member) {
    await interaction.reply({ content: "❌ Member not found in this server.", flags: MessageFlags.Ephemeral });
    return;
  }

  updateSessionView(session.guildId, session.userId, "user_detail");
  await interaction.update(userDetailPayload(member));
}

export async function openServerPanel(interaction: ChatInputCommandInteraction): Promise<void> {
  try {
    if (!interaction.guild) {
      await interaction.editReply("❌ This command can only be used in a server.");
      return;
    }

    const guildId = interaction.guild.id;
    const userId = interaction.user.id;
    const channelId = interaction.channelId;

    removeSession(guildId, userId);
    registerSession(guildId, userId, channelId, "");

    const payload = serverHomePayload(interaction.guild);
    const response = await interaction.editReply(payload);

    const session = getSession(guildId, userId);
    if (session && response?.id) {
      session.messageId = response.id;
    }

    logger.info(`🏰 Opened /server panel for ${interaction.user.tag} in ${interaction.guild.name}`);
  } catch (error) {
    logger.error("/server failed:", error instanceof Error ? error.message : String(error));
    try { await interaction.editReply("Failed to load server panel. Please try again."); } catch {}
  }
}

export async function handleServerComponent(interaction: any): Promise<void> {
  try {
    const guildId = interaction.guildId as string | null;
    if (!guildId) {
      await interaction.reply({ content: "Must be used in a server.", flags: MessageFlags.Ephemeral });
      return;
    }

    const guild = interaction.guild;
    if (!guild) {
      await interaction.reply({ content: "Server not accessible.", flags: MessageFlags.Ephemeral });
      return;
    }

    const customId: string = interaction.customId;
    const session = getSession(guildId, interaction.user.id);
    const deny = panelDenyReason(interaction, session, { requireMessageBinding: true });
    if (deny) {
      await interaction.reply({ content: deny, flags: MessageFlags.Ephemeral });
      return;
    }

    // Navigation
    if (customId === `${SERVER_PANEL_PREFIX}home`) {
      updateSessionView(guildId, interaction.user.id, "home");
      await interaction.update(serverHomePayload(guild));
      return;
    }

    if (customId === `${SERVER_PANEL_PREFIX}close`) {
      removeSession(guildId, interaction.user.id);
      await interaction.update({ embeds: [closedPanelEmbed("Server Center")], components: [] });
      return;
    }

    if (customId === `${SERVER_PANEL_PREFIX}back`) {
      const view = session?.currentView ?? "home";
      if (view === "role_detail" || view === "user_detail") {
        updateSessionView(guildId, interaction.user.id, view === "role_detail" ? "roles" : "user");
        await interaction.update(view === "role_detail" ? serverRolesPayload(guild) : serverUserPayload(guild));
      } else {
        updateSessionView(guildId, interaction.user.id, "home");
        await interaction.update(serverHomePayload(guild));
      }
      return;
    }

    // Main section navigation
    if (customId === `${SERVER_PANEL_PREFIX}info`) {
      updateSessionView(guildId, interaction.user.id, "info");
      await interaction.update(serverInfoPayload(guild));
      return;
    }

    if (customId === `${SERVER_PANEL_PREFIX}roles`) {
      updateSessionView(guildId, interaction.user.id, "roles");
      await interaction.update(serverRolesPayload(guild));
      return;
    }

    if (customId === `${SERVER_PANEL_PREFIX}user`) {
      updateSessionView(guildId, interaction.user.id, "user");
      await interaction.update(serverUserPayload(guild));
      return;
    }

    // Role selection
    if (customId === `${SERVER_PANEL_PREFIX}role:pick`) {
      await handleRolePick(interaction, guild, session);
      return;
    }

    // User selection
    if (customId === `${SERVER_PANEL_PREFIX}user:pick`) {
      await handleUserPick(interaction, guild, session);
      return;
    }
  } catch (error) {
    logger.error("Server panel error:", error instanceof Error ? error.message : String(error));
    await replyPanelError(interaction);
  }
}

async function replyPanelError(interaction: { replied?: boolean; deferred?: boolean; reply?: (p: any) => Promise<unknown>; editReply?: (p: any) => Promise<unknown> }): Promise<void> {
  try {
    if (interaction.deferred && !interaction.replied) {
      await interaction.editReply?.("An error occurred.");
    } else if (!interaction.replied) {
      await interaction.reply?.({ content: "An error occurred.", flags: MessageFlags.Ephemeral });
    }
  } catch {
    // Interaction may have expired
  }
}

export { SERVER_PANEL_PREFIX };