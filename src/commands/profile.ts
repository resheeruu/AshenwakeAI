import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  SlashCommandBuilder,
} from "discord.js";

import { getPlayer } from "../games/store";
import { getRegion } from "../games/world";
import { getProgressionSummary } from "../games/progression";
import { AshenCommand } from "./definitions";

export function createProfileCommand(): AshenCommand {
  return {
    data: new SlashCommandBuilder()
      .setName("profile")
      .setDescription("View your Ashen Realms character"),

    async execute(
      interaction: ChatInputCommandInteraction,
    ): Promise<void> {
      const user = interaction.user;

      const player = await getPlayer(
        user.id,
        user.username,
      );

      const progression = getProgressionSummary(player);
      const region = getRegion(player.regionId);

      const equipped = player.equipment.filter(
        (item) => item.equipped,
      );

      const weapon =
        equipped.find((item) => item.slot === "weapon")?.name ??
        "None";

      const armor =
        equipped.find((item) => item.slot === "armor")?.name ??
        "None";

      const embed = new EmbedBuilder()
        .setTitle("🌑 Ashen Realms")
        .setDescription(
          `**${player.username}**\n${region.emoji} ${region.name}`,
        )
        .addFields(
          {
            name: "⭐ Progression",
            value:
              `Level: **${player.level}**\n` +
              `XP: **${player.xp} / ${progression.xpRequired}**\n` +
              `Reputation: **${player.reputation}**`,
            inline: true,
          },
          {
            name: "⚔️ Combat",
            value:
              `❤️ HP: **${player.hp}/${player.maxHp}**\n` +
              `⚔️ Attack: **${player.attack}**\n` +
              `🛡️ Defense: **${player.defense}**\n` +
              `🍀 Luck: **${player.luck}**`,
            inline: true,
          },
          {
            name: "💰 Wealth",
            value:
              `Coins: **${player.coins.toLocaleString()}**\n` +
              `Deaths: **${player.deaths}**\n` +
              `Power: **${progression.power}**`,
            inline: true,
          },
          {
            name: "🗡️ Equipment",
            value:
              `Weapon: **${weapon}**\n` +
              `Armor: **${armor}**`,
            inline: true,
          },
          {
            name: "🏆 Titles",
            value:
              player.titles.length > 0
                ? player.titles
                    .map((title) => `• ${title}`)
                    .join("\n")
                : "No titles yet.",
            inline: true,
          },
          {
            name: "🔥 Hunting",
            value:
              `Hunts: **${player.huntsCompleted}**\n` +
              `Best Streak: **${player.bestHuntStreak}**\n` +
              `Legendary: **${player.legendaryHunts}**`,
            inline: true,
          },
        )
        .setFooter({
          text: "Ashen Realms",
        });

      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ embeds: [embed] });
      } else {
        await interaction.reply({ embeds: [embed] });
      }
    },
  };
}
