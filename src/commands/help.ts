import {
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  SlashCommandBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
  ComponentType,
} from "discord.js";
import { AshenCommand } from "./definitions";

interface HelpCategory {
  id: string;
  name: string;
  emoji: string;
  description: string;
  commands: Array<{ name: string; description: string; ownerOnly?: boolean; modOnly?: boolean; adminOnly?: boolean }>;
}

const ALL_CATEGORIES: HelpCategory[] = [
  {
    id: "ai",
    name: "AI & Chat",
    emoji: "\u{1F916}",
    description: "Talk to the assistant and manage your server.",
    commands: [
      { name: "/ask", description: "Ask AshenAI anything" },
      { name: "/reset", description: "Reset your conversation memory" },
    ],
  },
  {
    id: "moderation",
    name: "Moderation",
    emoji: "\u{1F6E1}\uFE0F",
    description: "Keep the server safe, warn, punish, and manage channels.",
    commands: [
      { name: "/warn", description: "Warn a member", modOnly: true },
      { name: "/warnings", description: "Check warnings for a member", modOnly: true },
      { name: "/timeout", description: "Timeout a member", modOnly: true },
      { name: "/untimeout", description: "Remove timeout from a member", modOnly: true },
    ],
  },
  {
    id: "server",
    name: "Server",
    emoji: "\u{1F3D7}\uFE0F",
    description: "Templates, server improvements, roles, categories, channels.",
    commands: [
      { name: "Templates", description: "Set up your server with a template (gaming, community, etc.)" },
      { name: "Server improvements", description: "Fix and organize your server" },
      { name: "Role management", description: "Create roles, manage permissions" },
      { name: "Channel management", description: "Create, delete, lock, unlock channels" },
      { name: "Protection", description: "Protect important channels and categories" },
    ],
  },
  {
    id: "community",
    name: "Community",
    emoji: "\u{1F3AB}",
    description: "Tickets, welcome/leave, events, suggestions.",
    commands: [
      { name: "Ticket system", description: "Create and manage support tickets" },
      { name: "XP & Levels", description: "Leveling system for active members" },
      { name: "Leaderboard", description: "View top members by XP" },
      { name: "Suggestions", description: "Community suggestion system" },
      { name: "Events", description: "Create and manage server events" },
      { name: "Reaction Roles", description: "Self-assign roles via reactions" },
    ],
  },
  {
    id: "access",
    name: "Access Control",
    emoji: "\u{1F510}",
    description: "Trusted users, permissions, owner/admin controls.",
    commands: [
      { name: "/trusted add", description: "Add a trusted user", adminOnly: true },
      { name: "/trusted list", description: "List trusted users" },
      { name: "/trusted remove", description: "Remove a trusted user", adminOnly: true },
    ],
  },
  {
    id: "games",
    name: "Games",
    emoji: "\u{1F3AE}",
    description: "Play games with the bot.",
    commands: [
      { name: "/game", description: "Play games (RPG, economy, blackjack, mines, quickdraw)" },
      { name: "/hunt", description: "Hunt for items and creatures" },
      { name: "/adventure", description: "Go on an adventure" },
      { name: "/profile", description: "View your game profile" },
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
      { name: "/server", description: "Server information" },
      { name: "/userinfo", description: "User information" },
      { name: "/roles", description: "List server roles" },
    ],
  },
];

const TRY_ASKING = [
  "How do I set up my server?",
  "Create a gaming server template",
  "Fix my server organization",
  "Protect my announcements channel",
  "Make my server better",
  "Set up a Minecraft server structure",
  "Show me my server health",
  "Delete all channels except general",
];

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

        // Build the initial help message
        const lines: string[] = [];
        lines.push("**Hi! I'm AshenAI, your AI-powered server assistant.**");
        lines.push("");
        lines.push("Pick a category from the menu below to see what I can do.");

        // Build select menu options
        const options = ALL_CATEGORIES
          .filter(cat => {
            // Filter categories based on permissions
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
          .setPlaceholder("Select a category to learn more")
          .addOptions(options);

        const row = new ActionRowBuilder<StringSelectMenuBuilder>()
          .addComponents(selectMenu);

        // Add some example prompts
        lines.push("");
        lines.push("**Try asking me...**");
        const shuffled = [...TRY_ASKING].sort(() => Math.random() - 0.5);
        for (const ex of shuffled.slice(0, 4)) {
          lines.push(`\u2022 "${ex}"`);
        }

        await interaction.editReply({
          content: lines.join("\n"),
          components: [row],
        });

        // Wait for category selection
        const collector = interaction.channel?.createMessageComponentCollector({
          componentType: ComponentType.StringSelect,
          time: 60_000,
          filter: (i) => i.user.id === interaction.user.id,
        });

        collector?.on("collect", async (selectInteraction: StringSelectMenuInteraction) => {
          const categoryId = selectInteraction.values[0];
          const category = ALL_CATEGORIES.find(c => c.id === categoryId);

          if (!category) {
            await selectInteraction.reply({ content: "Category not found.", ephemeral: true });
            return;
          }

          const catLines: string[] = [];
          catLines.push(`${category.emoji} **${category.name}**`);
          catLines.push(category.description);
          catLines.push("");

          const visibleCmds = category.commands.filter(cmd => {
            if (cmd.ownerOnly && !isOwner) return false;
            if (cmd.modOnly && !isMod && !isOwner) return false;
            if (cmd.adminOnly && !isOwner) return false;
            return true;
          });

          if (visibleCmds.length === 0) {
            catLines.push("No commands available for your permission level.");
          } else {
            for (const cmd of visibleCmds) {
              catLines.push(`\`${cmd.name}\` \u2014 ${cmd.description}`);
            }
          }

          catLines.push("");
          catLines.push("*Use `/help` to go back to the main menu.*");

          await selectInteraction.reply({
            content: catLines.join("\n"),
            ephemeral: true,
          });
        });

        collector?.on("end", () => {
          // Disable the select menu after timeout
          selectMenu.setDisabled(true);
          selectMenu.setPlaceholder("Session expired. Use /help again.");
        });

      } catch (error) {
        console.error("❌ /help failed:", error);
        try {
          if (interaction.deferred || interaction.replied) {
            await interaction.editReply("❌ Help command failed. Check the Termux logs.");
          }
        } catch (replyError) {
          console.error("❌ Could not edit /help response:", replyError);
        }
      }
    },
  };
}
