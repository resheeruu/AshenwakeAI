import {
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  SlashCommandBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
  EmbedBuilder,
  ComponentType,
  MessageFlags,
} from "discord.js";
import { AshenCommand } from "./definitions";
import { logger } from "../logger";

interface HelpCategory {
  id: string;
  name: string;
  emoji: string;
  description: string;
  commands: Array<{ name: string; description: string; ownerOnly?: boolean; modOnly?: boolean; adminOnly?: boolean }>;
}

const EMBED_COLOR = 0x2c2f33;

const ALL_CATEGORIES: HelpCategory[] = [
  {
    id: "ai",
    name: "AI Chat",
    emoji: "\u{1F916}",
    description: "Chat naturally with AshenAI.",
    commands: [
      { name: "/ask", description: "Ask AshenAI anything" },
      { name: "/reset", description: "Reset your conversation memory" },
      { name: "@AshenAI", description: "Mention me in any channel for quick chat" },
    ],
  },
  {
    id: "server",
    name: "Server Management",
    emoji: "\u{1F6E0}\uFE0F",
    description: "Manage your Discord server using natural language.",
    commands: [
      { name: "/prompt", description: "Open a private Builder session for server management" },
      { name: "Templates", description: "Set up your server with a template (gaming, community, etc.)" },
      { name: "Server improvements", description: "Fix and organize your server" },
      { name: "Channel management", description: "Create, delete, rename, organize channels" },
      { name: "Role management", description: "Create roles, manage permissions" },
    ],
  },
  {
    id: "templates",
    name: "Templates",
    emoji: "\u{1F4CB}",
    description: "Generate server templates instantly.",
    commands: [
      { name: "Gaming", description: "Voice channels, game roles, LFG areas" },
      { name: "Community", description: "Discussion channels, events, welcome areas" },
      { name: "Study", description: "Study groups, resources, schedules" },
      { name: "Creator", description: "Portfolio, showcase, collaboration" },
      { name: "Clan", description: "Recruitment, ranks, war rooms" },
    ],
  },
  {
    id: "moderation",
    name: "Moderation",
    emoji: "\u{1F6E1}\uFE0F",
    description: "Keep the server safe and manage members.",
    commands: [
      { name: "/warn", description: "Warn a member", modOnly: true },
      { name: "/warnings", description: "Check warnings for a member", modOnly: true },
      { name: "/timeout", description: "Timeout a member", modOnly: true },
      { name: "/untimeout", description: "Remove timeout from a member", modOnly: true },
    ],
  },
  {
    id: "welcome",
    name: "Welcome & Leave",
    emoji: "\u{1F44B}",
    description: "Greet new members and track departures.",
    commands: [
      { name: "Welcome messages", description: "Custom greet messages for new members" },
      { name: "Leave messages", description: "Farewell messages when members leave" },
      { name: "Auto-roles", description: "Assign roles automatically on join" },
    ],
  },
  {
    id: "tickets",
    name: "Tickets",
    emoji: "\u{1F3AB}",
    description: "Support ticket system for your community.",
    commands: [
      { name: "Ticket creation", description: "Members can open support tickets" },
      { name: "Ticket management", description: "Close, transcript, and review tickets" },
    ],
  },
  {
    id: "access",
    name: "Access Control",
    emoji: "\u{1F510}",
    description: "Trusted users and permission management.",
    commands: [
      { name: "/trusted add", description: "Add a trusted user", adminOnly: true },
      { name: "/trusted list", description: "List trusted users" },
      { name: "/trusted remove", description: "Remove a trusted user", adminOnly: true },
      { name: "/send", description: "Send a message as AshenAI (trusted only)" },
    ],
  },
  {
    id: "system",
    name: "System",
    emoji: "\u2699\uFE0F",
    description: "Status, diagnostics, configuration.",
    commands: [
      { name: "/status", description: "Show system status" },
      { name: "/config", description: "Show server configuration" },
      { name: "/diagnose", description: "Run system diagnostics" },
    ],
  },
];

const TRY_ASKING = [
  "How do I set up my server?",
  "Create a gaming server template",
  "Fix my server organization",
  "Delete all channels except general",
];

function buildMainEmbed(isOwner: boolean, isMod: boolean): { embed: EmbedBuilder; components: ActionRowBuilder<StringSelectMenuBuilder>[] } {
  const embed = new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setTitle("AshenAI \u2014 Help")
    .setDescription(
      "Hi! I'm AshenAI, your AI-powered server assistant.\n\n" +
      "Pick a category below to see what I can do."
    );

  const shuffled = [...TRY_ASKING].sort(() => Math.random() - 0.5);
  const examples = shuffled.slice(0, 3).map(e => `\u2022 "${e}"`).join("\n");
  embed.addFields({ name: "Try asking me...", value: examples, inline: false });

  const options = ALL_CATEGORIES
    .filter(cat => {
      if (cat.commands.some(c => c.ownerOnly) && !isOwner) return false;
      return true;
    })
    .map(cat => ({
      label: cat.name,
      value: cat.id,
      description: cat.description.slice(0, 100),
      emoji: cat.emoji,
    }));

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId("help_category_select")
    .setPlaceholder("Choose a category...")
    .addOptions(options);

  const row = new ActionRowBuilder<StringSelectMenuBuilder>()
    .addComponents(selectMenu);

  return { embed, components: [row] };
}

function buildCategoryEmbed(category: HelpCategory, isOwner: boolean, isMod: boolean): { embed: EmbedBuilder; components: ActionRowBuilder<StringSelectMenuBuilder>[] } {
  const embed = new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setTitle(`${category.emoji} ${category.name}`)
    .setDescription(category.description);

  const visibleCmds = category.commands.filter(cmd => {
    if (cmd.ownerOnly && !isOwner) return false;
    if (cmd.modOnly && !isMod && !isOwner) return false;
    if (cmd.adminOnly && !isOwner) return false;
    return true;
  });

  if (visibleCmds.length === 0) {
    embed.addFields({ name: "Commands", value: "No commands available for your permission level." });
  } else {
    const lines = visibleCmds.map(cmd => `\`${cmd.name}\` \u2014 ${cmd.description}`).join("\n");
    embed.addFields({ name: "Commands", value: lines });
  }

  const backOption = { label: "\u2190 Back to categories", value: "__back__", description: "Return to the main help menu" };
  const categoryOptions = ALL_CATEGORIES
    .filter(cat => {
      if (cat.commands.some(c => c.ownerOnly) && !isOwner) return false;
      return true;
    })
    .map(cat => ({
      label: cat.name,
      value: cat.id,
      description: cat.description.slice(0, 100),
      emoji: cat.emoji,
    }));

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId("help_category_select")
    .setPlaceholder("Choose a category...")
    .addOptions([backOption, ...categoryOptions]);

  const row = new ActionRowBuilder<StringSelectMenuBuilder>()
    .addComponents(selectMenu);

  return { embed, components: [row] };
}

export function createHelpCommand(): AshenCommand {
  return {
    data: new SlashCommandBuilder()
      .setName("help")
      .setDescription("Show AshenAI commands and guide"),

    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
      try {
        const member = interaction.member;
        const isOwner = member && typeof member.permissions === "string"
          ? false
          : member && "permissions" in member
            ? (member.permissions as any).has?.(PermissionFlagsBits.Administrator) ?? false
            : false;
        const isMod = isOwner || (member && typeof member.permissions === "string"
          ? false
          : member && "permissions" in member
            ? (member.permissions as any).has?.(PermissionFlagsBits.ModerateMembers) ?? false
            : false);

        const { embed, components } = buildMainEmbed(isOwner, isMod);

        const reply = await interaction.editReply({
          embeds: [embed],
          components,
        });

        const collector = reply.createMessageComponentCollector({
          componentType: ComponentType.StringSelect,
          time: 120_000,
          filter: (i) => i.user.id === interaction.user.id,
        });

        collector.on("collect", async (selectInteraction: StringSelectMenuInteraction) => {
          try {
            const categoryId = selectInteraction.values[0];

            if (categoryId === "__back__") {
              const { embed: mainEmbed, components: mainComponents } = buildMainEmbed(isOwner, isMod);
              await selectInteraction.update({ embeds: [mainEmbed], components: mainComponents });
              return;
            }

            const category = ALL_CATEGORIES.find(c => c.id === categoryId);
            if (!category) {
              await selectInteraction.update({ content: "Category not found.", embeds: [], components: [] });
              return;
            }

            const { embed: catEmbed, components: catComponents } = buildCategoryEmbed(category, isOwner, isMod);
            await selectInteraction.update({ embeds: [catEmbed], components: catComponents });
          } catch (err) {
            try {
              if (!selectInteraction.replied && !selectInteraction.deferred) {
                await selectInteraction.reply({
                  content: "⚠️ Something went wrong. Please try again.",
                  flags: MessageFlags.Ephemeral,
                }).catch(() => {});
              }
            } catch {}
          }
        });

        collector.on("end", () => {
          const disabledMenu = new StringSelectMenuBuilder()
            .setCustomId("help_category_select")
            .setPlaceholder("Session expired. Use /help again.")
            .setDisabled(true)
            .addOptions({ label: "Expired", value: "expired" });

          const disabledRow = new ActionRowBuilder<StringSelectMenuBuilder>()
            .addComponents(disabledMenu);

          interaction.editReply({ components: [disabledRow] }).catch(() => {});
        });

      } catch (error) {
        logger.error("❌ /help failed:", error instanceof Error ? error.message : String(error));
        try {
          if (interaction.deferred || interaction.replied) {
            await interaction.editReply({
              embeds: [
                new EmbedBuilder()
                  .setColor(EMBED_COLOR)
                  .setDescription("\u26A0\uFE0F I couldn't open the help menu right now. Please try `/help` again."),
              ],
              components: [],
            });
          } else {
            await interaction.reply({
              embeds: [
                new EmbedBuilder()
                  .setColor(EMBED_COLOR)
                  .setDescription("\u26A0\uFE0F I couldn't open the help menu right now. Please try `/help` again."),
              ],
              components: [],
              flags: MessageFlags.Ephemeral,
            }).catch(() => {});
          }
        } catch {
          // Interaction may have expired
        }
      }
    },
  };
}
