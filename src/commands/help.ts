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

/**
 * Metadata for commands that appear in /help.
 * Categories and descriptions are defined here as the single
 * source of truth for help text. The actual visibility of each
 * command is determined by whether it appears in the registered
 * commands array passed to createHelpCommand().
 */
const COMMAND_METADATA: Record<string, { description: string; category: string; ownerOnly?: boolean; modOnly?: boolean; adminOnly?: boolean }> = {
  ask:    { description: "Ask AshenAI anything", category: "ai" },
  reset:  { description: "Reset your conversation memory", category: "ai" },
  game:   { description: "Play games, earn coins, level up", category: "ai" },
  prompt: { description: "Open a private Builder session for server management", category: "server" },
  serverinfo: { description: "View server structure and stats", category: "server" },
  userinfo:   { description: "View info about a member", category: "server" },
  roles:       { description: "List a member's roles", category: "server" },
  warn:     { description: "Warn a member", category: "moderation", modOnly: true },
  warnings: { description: "Check warnings for a member", category: "moderation", modOnly: true },
  timeout:  { description: "Timeout a member", category: "moderation", modOnly: true },
  untimeout: { description: "Remove timeout from a member", category: "moderation", modOnly: true },
  trusted: { description: "Manage trusted users", category: "access", adminOnly: true },
  send:    { description: "Send a message as AshenAI (trusted only)", category: "access" },
  status:  { description: "Show system status and your AI usage", category: "system" },
};

interface CategoryDef {
  id: string;
  name: string;
  emoji: string;
  description: string;
  /** Static non-command features to always show */
  features?: Array<{ name: string; description: string }>;
}

const CATEGORY_DEFS: CategoryDef[] = [
  { id: "ai", name: "AI Chat", emoji: "\u{1F916}", description: "Chat naturally with AshenAI." },
  { id: "server", name: "Server Management", emoji: "\u{1F6E0}\uFE0F", description: "Manage your Discord server using natural language.",
    features: [
      { name: "Templates", description: "Set up your server with a template (gaming, community, etc.)" },
      { name: "Server improvements", description: "Fix and organize your server" },
      { name: "Channel management", description: "Create, delete, rename, organize channels" },
      { name: "Role management", description: "Create roles, manage permissions" },
    ],
  },
  { id: "moderation", name: "Moderation", emoji: "\u{1F6E1}\uFE0F", description: "Keep the server safe and manage members." },
  { id: "access", name: "Access Control", emoji: "\u{1F510}", description: "Trusted users and permission management." },
  { id: "system", name: "System", emoji: "\u2699\uFE0F", description: "Status and diagnostics." },
];

const TRY_ASKING = [
  "How do I set up my server?",
  "Create a gaming server template",
  "Fix my server organization",
  "Delete all channels except general",
];

function buildCategories(registeredNames: Set<string>): HelpCategory[] {
  const categories: HelpCategory[] = [];

  for (const def of CATEGORY_DEFS) {
    const commands: HelpCategory["commands"] = [];

    for (const [name, meta] of Object.entries(COMMAND_METADATA)) {
      if (meta.category !== def.id) continue;
      if (!registeredNames.has(name)) continue;
      commands.push({ name: `/${name}`, description: meta.description, ownerOnly: meta.ownerOnly, modOnly: meta.modOnly, adminOnly: meta.adminOnly });
    }

    if (def.features) {
      for (const f of def.features) {
        commands.push({ name: f.name, description: f.description });
      }
    }

    // @AshenAI mention hint in AI Chat category
    if (def.id === "ai") {
      commands.push({ name: "@AshenAI", description: "Mention me in any channel for quick chat" });
    }

    categories.push({ id: def.id, name: def.name, emoji: def.emoji, description: def.description, commands });
  }

  return categories.filter(c => c.commands.length > 0);
}

function buildMainEmbed(registeredNames: Set<string>, isOwner: boolean, isMod: boolean): { embed: EmbedBuilder; components: ActionRowBuilder<StringSelectMenuBuilder>[] } {
  const categories = buildCategories(registeredNames);

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

  const options = categories
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

function buildCategoryEmbed(category: HelpCategory, registeredNames: Set<string>, isOwner: boolean, isMod: boolean): { embed: EmbedBuilder; components: ActionRowBuilder<StringSelectMenuBuilder>[] } {
  const categories = buildCategories(registeredNames);

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
  const categoryOptions = categories
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

export function createHelpCommand(registeredCommands?: AshenCommand[]): AshenCommand {
  const registeredNames = new Set(
    registeredCommands?.map(c => c.data.name) ?? []
  );

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

        const { embed, components } = buildMainEmbed(registeredNames, isOwner, isMod);

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
              const { embed: mainEmbed, components: mainComponents } = buildMainEmbed(registeredNames, isOwner, isMod);
              await selectInteraction.update({ embeds: [mainEmbed], components: mainComponents });
              return;
            }

            const categories = buildCategories(registeredNames);
            const category = categories.find(c => c.id === categoryId);
            if (!category) {
              await selectInteraction.update({ content: "Category not found.", embeds: [], components: [] });
              return;
            }

            const { embed: catEmbed, components: catComponents } = buildCategoryEmbed(category, registeredNames, isOwner, isMod);
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
