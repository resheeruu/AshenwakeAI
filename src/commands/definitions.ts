import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  SlashCommandOptionsOnlyBuilder,
  SlashCommandSubcommandsOnlyBuilder,
} from "discord.js";

export type CommandBuilder =
  | SlashCommandBuilder
  | SlashCommandOptionsOnlyBuilder
  | SlashCommandSubcommandsOnlyBuilder;

export interface AshenCommand {
  data: CommandBuilder;

  execute(
    interaction: ChatInputCommandInteraction
  ): Promise<void>;
}

export const commandBuilders: CommandBuilder[] = [
  new SlashCommandBuilder()
    .setName("ask")
    .setDescription("Ask AshenAI a question")
    .addStringOption((option) =>
      option
        .setName("prompt")
        .setDescription("Your question")
        .setRequired(true)
        .setMaxLength(4000)
    ),

  new SlashCommandBuilder()
    .setName("reset")
    .setDescription("Reset your AshenAI conversation"),

  new SlashCommandBuilder()
    .setName("help")
    .setDescription("Show AshenAI commands"),

  new SlashCommandBuilder()
    .setName("status")
    .setDescription("Show AshenAI system status"),

  new SlashCommandBuilder()
    .setName("task")
    .setDescription("Create and run a safe autonomous AshenAI task")
    .addStringOption((option) =>
      option
        .setName("goal")
        .setDescription("What should AshenAI diagnose or investigate?")
        .setRequired(true)
        .setMaxLength(1000)
    ),

  new SlashCommandBuilder()
    .setName("config")
    .setDescription("Manage safe AshenAI runtime configuration")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("status")
        .setDescription("Show safe runtime configuration")
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("reload")
        .setDescription("Reload safe runtime configuration")
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("ratelimit")
        .setDescription("Show rate limit status for a user")
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("resetuser")
        .setDescription("Reset rate limits for a user")
        .addStringOption((option) =>
          option.setName("user_id").setDescription("Target user ID").setRequired(true)
        )
    ),
];
