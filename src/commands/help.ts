import {
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import { AshenCommand } from "./definitions";

interface HelpCategory {
  name: string;
  emoji: string;
  commands: Array<{ name: string; description: string; ownerOnly?: boolean; modOnly?: boolean; adminOnly?: boolean }>;
}

const ALL_CATEGORIES: HelpCategory[] = [
  {
    name: "AI",
    emoji: "\u2728",
    commands: [
      { name: "/ask", description: "Ask AshenAI anything" },
      { name: "/reset", description: "Reset your conversation memory" },
      { name: "/usage", description: "Check your AI usage stats" },
    ],
  },
  {
    name: "Moderation",
    emoji: "\u{1F6E1}\uFE0F",
    commands: [
      { name: "/warn", description: "Warn a member", modOnly: true },
      { name: "/warnings", description: "Check warnings for a member", modOnly: true },
      { name: "/timeout", description: "Timeout a member", modOnly: true },
      { name: "/untimeout", description: "Remove timeout from a member", modOnly: true },
    ],
  },
  {
    name: "Server Assistant",
    emoji: "\u{1F3D7}\uFE0F",
    commands: [
      { name: "Channel management", description: "Create, delete, lock, unlock channels" },
      { name: "Role management", description: "Create roles, manage permissions" },
      { name: "Server structure", description: "Set up categories, organize channels" },
      { name: "Troubleshooting", description: "Diagnose server issues" },
    ],
  },
  {
    name: "Tickets",
    emoji: "\u{1F4AC}",
    commands: [
      { name: "Ticket system", description: "Create and manage support tickets" },
    ],
  },
  {
    name: "Community",
    emoji: "\u{1F465}",
    commands: [
      { name: "XP & Levels", description: "Leveling system for active members" },
      { name: "Leaderboard", description: "View top members by XP" },
      { name: "Suggestions", description: "Community suggestion system" },
      { name: "Events", description: "Create and manage server events" },
      { name: "Reaction Roles", description: "Self-assign roles via reactions" },
    ],
  },
  {
    name: "Games",
    emoji: "\u{1F3AE}",
    commands: [
      { name: "/game", description: "Play games (RPG, economy, blackjack, mines, quickdraw)" },
      { name: "/hunt", description: "Hunt for items and creatures" },
      { name: "/adventure", description: "Go on an adventure" },
      { name: "/profile", description: "View your game profile" },
      { name: "/casino", description: "Casino games" },
    ],
  },
  {
    name: "Utility",
    emoji: "\u{1F527}",
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

const OWNER_COMMANDS: HelpCategory = {
  name: "Owner",
  emoji: "\u{1F451}",
  commands: [
    { name: "Web Dashboard", description: "Full control center at your domain", ownerOnly: true },
    { name: "Termux CLI", description: "ashen status/start/stop/restart/doctor", ownerOnly: true },
    { name: "Provider Control", description: "Enable/disable AI providers", ownerOnly: true },
    { name: "System Maintenance", description: "Restart, reload, backup", ownerOnly: true },
  ],
};

const TRY_ASKING = [
  "Explain this server rule.",
  "How do I set up my server?",
  "Help me fix my bot.",
  "Create a ticket system.",
  "Recommend roles for my community.",
  "Why is my bot not responding?",
  "Set up a Minecraft server structure.",
  "Translate this message.",
  "Analyze this image.",
  "Check my server configuration.",
];

export function createHelpCommand(): AshenCommand {
  return {
    data: new SlashCommandBuilder()
      .setName("help")
      .setDescription("Show AshenAI commands and guide"),

    async execute(
      interaction: ChatInputCommandInteraction,
    ): Promise<void> {
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

      const lines: string[] = [];
      lines.push("**AshenAI Help** \u2014 Your guide to everything AshenAI can do");
      lines.push("");

      for (const cat of ALL_CATEGORIES) {
        const visibleCmds = cat.commands.filter((cmd) => {
          if (cmd.ownerOnly && !isOwner) return false;
          if (cmd.modOnly && !isMod && !isOwner) return false;
          if (cmd.adminOnly && !isOwner) return false;
          return true;
        });
        if (visibleCmds.length === 0) continue;
        lines.push(`${cat.emoji} **${cat.name}**`);
        for (const cmd of visibleCmds) {
          lines.push(`\`${cmd.name}\` \u2014 ${cmd.description}`);
        }
        lines.push("");
      }

      if (isOwner) {
        const cat = OWNER_COMMANDS;
        lines.push(`${cat.emoji} **${cat.name}**`);
        for (const cmd of cat.commands) {
          lines.push(`\`${cmd.name}\` \u2014 ${cmd.description}`);
        }
        lines.push("");
      }

      lines.push("**Try asking me...**");
      const shuffled = [...TRY_ASKING].sort(() => Math.random() - 0.5);
      for (const ex of shuffled.slice(0, 5)) {
        lines.push(`\u2022 "${ex}"`);
      }
      lines.push("");
      lines.push("*Just mention me with your question and I'll help!*");

      await interaction.editReply({ content: lines.join("\n") });
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
