import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
} from "discord.js";
import { AshenCommand } from "./definitions";
import { loadGuildConfig, saveGuildConfig } from "../core/guild-config";
import { recordAudit } from "../security/audit";
import { logger } from "../logger";

/* ================================================================
 * /PROMPT COMMAND — Owner Personality Control
 *
 * Allows the guild owner or bot admin to set, view, or reset the
 * custom personality prompt that shapes AshenAI's behavior.
 *
 * Security: The custom prompt is appended AFTER system/security
 * rules and can NEVER override them.
 * ================================================================ */

const MAX_PROMPT_LENGTH = 2000;
const MIN_PROMPT_LENGTH = 2;

function isOwnerOrAdmin(
  userId: string,
  guildOwnerId: string,
  adminIds: string[],
): boolean {
  return userId === guildOwnerId || adminIds.includes(userId);
}

function truncatePreview(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 3) + "...";
}

export function createPersonalityCommand(): AshenCommand {
  return {
    data: new SlashCommandBuilder()
      .setName("prompt")
      .setDescription("Manage AshenAI's custom personality prompt for this server")
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addSubcommand((sub) =>
        sub
          .setName("set")
          .setDescription("Set a custom personality prompt")
          .addStringOption((opt) =>
            opt
              .setName("text")
              .setDescription("The custom prompt (2-2000 characters)")
              .setRequired(true)
              .setMaxLength(MAX_PROMPT_LENGTH)
          )
      )
      .addSubcommand((sub) =>
        sub
          .setName("view")
          .setDescription("View the current custom prompt")
      )
      .addSubcommand((sub) =>
        sub
          .setName("reset")
          .setDescription("Reset the custom prompt to default")
      ),

    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
      try {
        if (!interaction.guild) {
          await interaction.editReply("This command can only be used in a server.");
          return;
        }

        const guildId = interaction.guild.id;
        const userId = interaction.user.id;
        const guildOwnerId = interaction.guild.ownerId;
        const { config } = await import("../config/env");
        const adminIds = config.admin?.discordIds || [];

        if (!isOwnerOrAdmin(userId, guildOwnerId, adminIds)) {
          await interaction.editReply(
            "You need the Manage Server permission to use this command."
          );
          return;
        }

        const subcommand = interaction.options.getSubcommand();
        const guildConfig = loadGuildConfig(guildId);

        switch (subcommand) {
          case "set": {
            const text = interaction.options.getString("text", true).trim();

            if (text.length < MIN_PROMPT_LENGTH) {
              await interaction.editReply(
                `Prompt must be at least ${MIN_PROMPT_LENGTH} characters.`
              );
              return;
            }

            if (text.length > MAX_PROMPT_LENGTH) {
              await interaction.editReply(
                `Prompt must be at most ${MAX_PROMPT_LENGTH} characters.`
              );
              return;
            }

            // Validate: must not be empty after trimming
            if (!text.replace(/\s+/g, "").length) {
              await interaction.editReply(
                "Prompt cannot be only whitespace."
              );
              return;
            }

            // Security: warn if prompt contains obvious injection attempts
            const hasInjectionPatterns =
              /ignore\s+(all\s+)?previous\s+instructions/i.test(text) ||
              /you\s+are\s+now/i.test(text) ||
              /system\s*:\s*/i.test(text) ||
              /assistant\s*:\s*/i.test(text) ||
              /<\|im_start\|>/i.test(text);

            // Save the prompt
            guildConfig.personality.customInstructions = text;
            guildConfig.updatedAt = Date.now();
            saveGuildConfig(guildConfig);

            const embed = new EmbedBuilder()
              .setColor(hasInjectionPatterns ? 0xf39c12 : 0x2ecc71)
              .setTitle(
                hasInjectionPatterns
                  ? "Custom Prompt Set (Warning)"
                  : "Custom Prompt Set"
              )
              .setDescription(
                hasInjectionPatterns
                  ? "Your custom prompt has been saved, but it contains patterns that resemble prompt injection attempts. These will not override AshenAI's security rules."
                  : "Your custom prompt has been saved and will be applied to all AI conversations in this server."
              )
              .addFields(
                {
                  name: "Current Prompt",
                  value: `\`\`\`${truncatePreview(text, 500)}\`\`\``,
                },
                {
                  name: "Security Note",
                  value:
                    "The custom prompt is applied after system and security rules. It cannot override safety restrictions.",
                }
              )
              .setFooter({ text: "Use /prompt view to see the full prompt" });

            await interaction.editReply({ embeds: [embed] });

            recordAudit({
              who: userId,
              whoName: interaction.user.tag,
              what: `Updated custom prompt (${text.length} chars)`,
              where: "prompt-command",
              guildId,
              result: "success",
            });

            logger.info(
              `Custom prompt updated by ${interaction.user.tag} in guild ${guildId} (${text.length} chars)`
            );
            break;
          }

          case "view": {
            const currentPrompt = guildConfig.personality?.customInstructions;

            const embed = new EmbedBuilder()
              .setColor(0x3498db)
              .setTitle("Current Custom Prompt")
              .setDescription(
                currentPrompt
                  ? `This server has a custom prompt configured (${currentPrompt.length} characters).`
                  : "No custom prompt configured. AshenAI uses the default personality."
              );

            if (currentPrompt) {
              embed.addFields({
                name: "Custom Prompt",
                value: `\`\`\`${truncatePreview(currentPrompt, 1000)}\`\`\``,
              });
            }

            embed.addFields({
              name: "How It Works",
              value:
                "The custom prompt is applied after system and security rules, shaping AshenAI's tone and behavior for this server.",
            });

            await interaction.editReply({ embeds: [embed] });
            break;
          }

          case "reset": {
            const hadPrompt = !!guildConfig.personality?.customInstructions;
            guildConfig.personality.customInstructions = "";
            guildConfig.updatedAt = Date.now();
            saveGuildConfig(guildConfig);

            const embed = new EmbedBuilder()
              .setColor(hadPrompt ? 0x2ecc71 : 0x95a5a6)
              .setTitle("Custom Prompt Reset")
              .setDescription(
                hadPrompt
                  ? "The custom prompt has been removed. AshenAI will use the default personality."
                  : "No custom prompt was configured. AshenAI already uses the default personality."
              );

            await interaction.editReply({ embeds: [embed] });

            if (hadPrompt) {
              recordAudit({
                who: userId,
                whoName: interaction.user.tag,
                what: "Reset custom prompt to default",
                where: "prompt-command",
                guildId,
                result: "success",
              });
            }
            break;
          }
        }
      } catch (error) {
        logger.error(
          "/prompt failed:",
          error instanceof Error ? error.message : String(error)
        );
        try {
          await interaction.editReply(
            "An error occurred. Please try again."
          );
        } catch {}
      }
    },
  };
}
