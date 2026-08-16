import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  SlashCommandBuilder,
} from "discord.js";

import { AshenCommand } from "./definitions";
import { getPlayer, updatePlayer } from "../games/store";
import { adventure } from "../games/adventures";

export function createAdventureCommand(): AshenCommand {
  const data = new SlashCommandBuilder()
    .setName("adventure")
    .setDescription("🌲 Explore the Ashen Realms and encounter monsters");

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

      const result = adventure(player);

      /*
       * adventure() is the single source of truth for
       * combat, rewards, progression, and state changes.
       * The command only persists the resulting player.
       */

      await updatePlayer(player);

      const encounter = result.encounter;

      const embed = new EmbedBuilder()
        .setTitle(
          `${encounter.emoji} ${encounter.name}`,
        )
        .setDescription(
          result.narrative,
        )
        .addFields(
          {
            name: "⚔️ Encounter",
            value:
              `Level: **${encounter.level}**\n` +
              `Rarity: **${encounter.rarity}**`,
            inline: true,
          },
          {
            name: "❤️ Your HP",
            value:
              `**${player.hp}/${player.maxHp}**`,
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
          name: "🎁 Rare Loot",
          value: `**${result.loot}**`,
          inline: false,
        });
      }

      if (result.death) {
        embed.setTitle(
          `💀 ${encounter.name} — Defeat`,
        );
      } else if (result.victory) {
        embed.setTitle(
          `🏆 ${encounter.emoji} ${encounter.name} — Victory`,
        );
      } else if (result.fled) {
        embed.setTitle(
          `🏃 ${encounter.emoji} ${encounter.name} — Escaped`,
        );
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
