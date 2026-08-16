import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  SlashCommandBuilder,
} from "discord.js";

import { AshenCommand } from "./definitions";
import { getPlayer, updatePlayer } from "../games/store";
import { resolveHunt } from "../games/hunting";

export function createHuntCommand(): AshenCommand {
  const data = new SlashCommandBuilder()
    .setName("hunt")
    .setDescription("🏹 Hunt creatures across the Ashen Realms");

  return {
    data,

    async execute(
      interaction: ChatInputCommandInteraction,
    ): Promise<void> {
      const user = interaction.user;

      const player = await getPlayer(
        user.id,
        user.username,
      );

      const result = resolveHunt(player);
      await updatePlayer(player);

      const encounter = result.encounter;

      let title: string;

      if (result.died) {
        title = `💀 ${encounter.name} — Defeated`;
      } else if (result.victory) {
        title = `🏆 ${encounter.emoji} ${encounter.name} — Victory`;
      } else if (result.fled) {
        title = `🏃 ${encounter.emoji} ${encounter.name} — Escaped`;
      } else {
        title = `${encounter.emoji} ${encounter.name}`;
      }

      const description = [
        `⚔️ Damage taken: **${result.damageTaken}**`,
        `❤️ HP: **${player.hp}/${player.maxHp}**`,
      ];

      if (result.victory) {
        description.push(
          "",
          `🏆 **Victory!**`,
          `🪙 +${result.coins.toLocaleString()} coins`,
          `✨ +${result.xp.toLocaleString()} XP`,
          `🔥 +${result.reputation} reputation`,
          `🔥 Hunt streak: **${player.huntStreak}**`,
        );
      } else if (result.died) {
        description.push(
          "",
          `☠️ Deaths: **${player.deaths}**`,
          `🔥 Hunt streak reset.`,
          `❤️ Revived at **${player.hp}/${player.maxHp} HP**`,
        );
      } else if (result.fled) {
        description.push(
          "",
          `🏃 You escaped the encounter.`,
          `🔥 Hunt streak: **${player.huntStreak}**`,
        );
      }

      const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(description.join("\n"))
        .addFields(
          {
            name: "⚔️ Encounter",
            value:
              `Level: **${encounter.minLevel}**\n` +
              `Rarity: **${encounter.rarity}**`,
            inline: true,
          },
          {
            name: "🔥 Hunting",
            value:
              `Current streak: **${player.huntStreak}**\n` +
              `Best streak: **${player.bestHuntStreak}**\n` +
              `Completed: **${player.huntsCompleted}**`,
            inline: true,
          },
          {
            name: "💰 Rewards",
            value:
              `🪙 Coins: **+${result.coins.toLocaleString()}**\n` +
              `✨ XP: **+${result.xp.toLocaleString()}**\n` +
              `🔥 Reputation: **+${result.reputation}**`,
            inline: true,
          },
        );

      if (result.loot) {
        embed.addFields({
          name: "🎁 Loot",
          value: `**${result.loot.name}**`,
          inline: false,
        });
      }

      if (result.rareEncounter) {
        embed.addFields({
          name: "🌟 Rare Encounter",
          value: "This was an exceptionally rare creature.",
          inline: false,
        });
      }

      embed.setFooter({
        text:
          `Ashen Realms • Level ${player.level} • ${player.coins.toLocaleString()} coins`,
      });

      await interaction.editReply({
        embeds: [embed],
      });
    },
  };
}
