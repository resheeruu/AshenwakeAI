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
        .setName("question")
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
    .setDescription("Show AshenAI health and your AI usage"),

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

];
