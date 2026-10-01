import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle,
  UserSelectMenuBuilder,
  type ChatInputCommandInteraction,
  type GuildMember,
} from "discord.js";

import { canModerate } from "../moderation";
import { getWarnings } from "../warnings";
import { executeInteractiveModeration } from "../interactive-moderation";
import { getAuditLog } from "../../security/audit";
import { UserRateLimiter } from "../../security/rate-limit";
import { logger } from "../../logger";
import {
  BRAND,
  closedPanelEmbed,
  panelNavRow,
} from "./shared";

const moderationRateLimiter = new UserRateLimiter(5, 60_000);

type ModVerb = "warn" | "timeout" | "untimeout" | "warnings" | "history";

function nav(): ActionRowBuilder<ButtonBuilder> {
  return panelNavRow("mod", { back: false });
}

function rateLimitMessage(retryAfterMs: number): string {
  const seconds = Math.ceil(retryAfterMs / 1000);
  return `⚠️ Rate limit exceeded. Please wait ${seconds} second(s) before using moderation commands again.`;
}

function modHomePayload(): {
  embeds: EmbedBuilder[];
  components: ActionRowBuilder<any>[];
} {
  const embed = new EmbedBuilder()
    .setTitle("🛡️ ASHENAI MODERATION CENTER")
    .setColor(BRAND)
    .setDescription(
      "Warn, timeout, or review members. Every action re-checks your permissions and role hierarchy before it runs.",
    )
    .addFields(
      { name: "⚠️ Warn", value: "Issue a formal warning.", inline: true },
      { name: "🔇 Timeout", value: "Temporarily mute a member.", inline: true },
      { name: "🔊 Remove Timeout", value: "Lift a timeout.", inline: true },
      { name: "📋 Warnings", value: "View warning history.", inline: true },
      { name: "📜 History", value: "Recent moderation actions.", inline: true },
    )
    .setFooter({ text: "Moderator permission required." });

  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId("mod:warn").setLabel("⚠️ Warn").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId("mod:timeout").setLabel("🔇 Timeout").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId("mod:untimeout").setLabel("🔊 Remove Timeout").setStyle(ButtonStyle.Secondary),
      ),
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId("mod:warnings").setLabel("📋 Warnings").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("mod:history").setLabel("📜 History").setStyle(ButtonStyle.Secondary),
      ),
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId("mod:home").setLabel("🏠 Home").setStyle(ButtonStyle.Secondary).setDisabled(true),
        new ButtonBuilder().setCustomId("mod:close").setLabel("✖ Close").setStyle(ButtonStyle.Danger),
      ),
    ],
  };
}

const PROMPT_TEXT: Record<ModVerb, { title: string; description: string }> = {
  warn: {
    title: "⚠️ Warn a member",
    description: "Select the member to warn, then provide a reason.",
  },
  timeout: {
    title: "🔇 Timeout a member",
    description: "Select the member to timeout, then set the duration and reason.",
  },
  untimeout: {
    title: "🔊 Remove a timeout",
    description: "Select the member whose timeout should be removed.",
  },
  warnings: {
    title: "📋 Warning history",
    description: "Select the member whose warnings you want to view.",
  },
  history: {
    title: "📜 Moderation history",
    description: "Select the member to review recent moderation actions for.",
  },
};

function promptPayload(verb: ModVerb): {
  embeds: EmbedBuilder[];
  components: ActionRowBuilder<any>[];
} {
  const text = PROMPT_TEXT[verb];
  const embed = new EmbedBuilder().setTitle(text.title).setDescription(text.description).setColor(BRAND);
  const selectRow = new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
    new UserSelectMenuBuilder()
      .setCustomId(`mod:pick:${verb}`)
      .setPlaceholder("Select a member")
      .setMinValues(1)
      .setMaxValues(1),
  );
  return { embeds: [embed], components: [selectRow, nav()] };
}

function buildActionModal(verb: "warn" | "timeout" | "untimeout", targetId: string): ModalBuilder {
  const modal = new ModalBuilder().setCustomId(`mod:m:${verb}:${targetId}`);
  const reasonInput = new TextInputBuilder()
    .setCustomId("reason")
    .setLabel(verb === "warn" ? "Reason for the warning" : verb === "timeout" ? "Reason for the timeout" : "Reason for removing the timeout")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(500);

  if (verb === "timeout") {
    modal.setTitle("Timeout a member");
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("minutes")
          .setLabel("Duration in minutes (1-40320)")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(5)
          .setPlaceholder("e.g. 60"),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(reasonInput),
    );
  } else {
    modal.setTitle(verb === "warn" ? "Warn a member" : "Remove timeout");
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(reasonInput));
  }
  return modal;
}

/**
 * Shared gate for panel actions: guild + rate limit + fresh member
 * fetch + ModerateMembers. Responds (deny) on failure and returns
 * null so callers stop.
 */
async function gatePanelAction(interaction: any): Promise<GuildMember | null> {
  if (!interaction.guild || !interaction.guildId) {
    await interaction.reply({ content: "❌ This command can only be used inside a server.", ephemeral: true });
    return null;
  }

  const rate = moderationRateLimiter.check(interaction.user.id);
  if (!rate.allowed) {
    await interaction.reply({ content: rateLimitMessage(rate.retryAfterMs), ephemeral: true });
    return null;
  }

  let requester: GuildMember;
  try {
    requester = (await interaction.guild.members.fetch(interaction.user.id)) as GuildMember;
  } catch {
    await interaction.reply({ content: "❌ I couldn't resolve your member record.", ephemeral: true });
    return null;
  }

  if (!canModerate(requester, PermissionFlagsBits.ModerateMembers)) {
    await interaction.reply({
      content: "❌ You don't have permission to use moderation commands.",
      ephemeral: true,
    });
    return null;
  }

  return requester;
}

async function fetchTarget(interaction: any, targetId: string): Promise<GuildMember | null> {
  try {
    return (await interaction.guild.members.fetch(targetId)) as GuildMember;
  } catch {
    return null;
  }
}

export async function openModPanel(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild || !interaction.member) {
    await interaction.editReply("❌ This command can only be used inside a server.");
    return;
  }
  const rate = moderationRateLimiter.check(interaction.user.id);
  if (!rate.allowed) {
    await interaction.editReply(rateLimitMessage(rate.retryAfterMs));
    return;
  }
  const requester = (await interaction.guild.members.fetch(interaction.user.id).catch(() => null)) as GuildMember | null;
  if (!requester || !canModerate(requester, PermissionFlagsBits.ModerateMembers)) {
    await interaction.editReply("❌ You don't have permission to use moderation commands.");
    return;
  }
  await interaction.editReply(modHomePayload());
}

function handleComponentError(interaction: any, error: unknown): void {
  logger.error("❌ Moderation panel error:", error instanceof Error ? error.message : String(error));
  try {
    if (interaction.deferred && !interaction.replied) {
      void interaction.editReply("❌ Something went wrong. Please try again.");
    } else if (!interaction.replied) {
      void interaction.reply({ content: "❌ Something went wrong. Please try again.", ephemeral: true });
    }
  } catch {
    // Interaction may have expired
  }
}

export async function handleModComponent(interaction: any): Promise<void> {
  try {
    const parts = String(interaction.customId).split(":");
    const verb = parts[1] ?? "";
    const arg = parts.slice(2).join(":");

    switch (verb) {
      case "home":
      case "back": {
        await interaction.update(modHomePayload());
        return;
      }
      case "close": {
        await interaction.update({ embeds: [closedPanelEmbed("Moderation Center")], components: [] });
        return;
      }
      case "warn":
      case "timeout":
      case "untimeout":
      case "warnings":
      case "history": {
        const requester = await gatePanelAction(interaction);
        if (!requester) return;
        await interaction.update(promptPayload(verb as ModVerb));
        return;
      }
      case "pick": {
        const action = arg as ModVerb;
        if (!PROMPT_TEXT[action]) return;
        const targetId = interaction.values?.[0];
        if (!targetId) {
          await interaction.reply({ content: "❌ No member selected.", ephemeral: true });
          return;
        }

        if (action === "warn" || action === "timeout" || action === "untimeout") {
          await interaction.showModal(buildActionModal(action, targetId));
          return;
        }

        if (action === "warnings") {
          const warnings = getWarnings(interaction.guildId, targetId);
          if (warnings.length === 0) {
            await interaction.update({
              content: `📋 <@${targetId}> has no recorded warnings.`,
              components: [nav()],
            });
            return;
          }
          const recent = warnings.slice(-10);
          const lines = recent.map(
            (warning, index) =>
              `${index + 1}. **${warning.reason}**\n   ID: ${warning.id}\n   Date: ${warning.createdAt}`,
          );
          await interaction.update({
            content:
              `📋 **Warnings for <@${targetId}>**\nTotal warnings: **${warnings.length}**\n\n${lines.join("\n")}`,
            components: [nav()],
          });
          return;
        }

        // history
        const target = await fetchTarget(interaction, targetId);
        if (!target) {
          await interaction.reply({ content: "❌ I couldn't find that member.", ephemeral: true });
          return;
        }
        const entries = getAuditLog({ guildId: interaction.guildId, limit: 200 })
          .filter((e) => e.what.includes(targetId) || e.what.includes(target.user.tag))
          .slice(-15)
          .reverse();
        const lines =
          entries.length > 0
            ? entries
                .map((e) => {
                  const ts = `<t:${Math.floor(e.timestamp / 1000)}:R>`;
                  return `\`${ts}\` ${e.result === "denied" ? "⛔" : e.result === "failure" ? "❌" : "✅"} ${e.what}`;
                })
                .join("\n")
            : "No recent moderation actions recorded for this member.";

        const timeoutLine =
          target.isCommunicationDisabled() && target.communicationDisabledUntil
            ? `**Active timeout** until <t:${Math.floor(target.communicationDisabledUntil.getTime() / 1000)}:F>`
            : "No active timeout";

        const embed = new EmbedBuilder()
          .setTitle(`📜 Moderation history — ${target.user.tag}`)
          .setColor(BRAND)
          .setDescription(`${timeoutLine}\n\n${lines}`.slice(0, 4000));
        await interaction.update({ embeds: [embed], components: [nav()] });
        return;
      }
      default: {
        logger.debug(`Moderation panel: ignoring unknown custom id ${interaction.customId}`);
        return;
      }
    }
  } catch (error) {
    handleComponentError(interaction, error);
  }
}

export async function handleModModal(interaction: any): Promise<void> {
  try {
    if (!interaction.guildId || !interaction.guild) {
      await interaction.reply({ content: "❌ Must be used in a server.", ephemeral: true });
      return;
    }
    const parts = String(interaction.customId).split(":");
    const verb = parts[2] as "warn" | "timeout" | "untimeout";
    const targetId = parts.slice(3).join(":");
    if (!targetId || (verb !== "warn" && verb !== "timeout" && verb !== "untimeout")) return;

    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    }

    const guildId: string = interaction.guildId;
    const rate = moderationRateLimiter.check(interaction.user.id);
    if (!rate.allowed) {
      await interaction.editReply(rateLimitMessage(rate.retryAfterMs));
      return;
    }

    const requester = (await interaction.guild.members.fetch(interaction.user.id).catch(() => null)) as GuildMember | null;
    const target = (await interaction.guild.members.fetch(targetId).catch(() => null)) as GuildMember | null;
    const botMember = (await interaction.guild.members.fetchMe().catch(() => null)) as GuildMember | null;

    if (!requester || !target || !botMember) {
      await interaction.editReply("❌ I couldn't find that member.");
      return;
    }

    const reason = String(interaction.fields.getTextInputValue("reason") ?? "").trim() || "No reason provided";
    let durationMinutes: number | undefined;
    if (verb === "timeout") {
      const raw = String(interaction.fields.getTextInputValue("minutes") ?? "").trim();
      const minutes = Number.parseInt(raw, 10);
      if (!Number.isInteger(minutes) || minutes < 1 || minutes > 40320) {
        await interaction.editReply("❌ Timeout duration must be between 1 minute and 40320 minutes (28 days).");
        return;
      }
      durationMinutes = minutes;
    }

    const result = await executeInteractiveModeration(requester, target, botMember, verb, durationMinutes, reason);
    await interaction.editReply(result.message);
  } catch (error) {
    handleComponentError(interaction, error);
  }
}
