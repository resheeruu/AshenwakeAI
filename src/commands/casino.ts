import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  EmbedBuilder,
  SlashCommandBuilder,
} from "discord.js";

import { AshenCommand } from "./definitions";
import { getPlayer, updatePlayer, mutatePlayer } from "../games/store";
import {
  getCasinoStats,
  getJackpot,
  playCasino,
  CasinoGame,
} from "../games/casino";
import {
  startBlackjack,
  handText,
  calculateTotal,
} from "../games/games/blackjack";

export function createCasinoCommand(): AshenCommand {
  const data = new SlashCommandBuilder()
    .setName("casino")
    .setDescription("🎰 Enter the Ashen Casino")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("play")
        .setDescription("🎰 Play a casino game")
        .addStringOption((option) =>
          option
            .setName("game")
            .setDescription("Choose a game")
            .setRequired(true)
            .addChoices(
              {
                name: "🎰 Slots",
                value: "slots",
              },
              {
                name: "🪙 Coinflip",
                value: "coinflip",
              },
              {
                name: "🎲 Dice",
                value: "dice",
              },
              {
                name: "🃏 Blackjack",
                value: "blackjack",
              },
              {
                name: "💎 Crystal",
                value: "crystal",
              },
              {
                name: "🎁 Mystery Chest",
                value: "chest",
              },
            ),
        )
        .addIntegerOption((option) =>
          option
            .setName("wager")
            .setDescription("Amount of Ashen Coins to wager")
            .setRequired(true)
            .setMinValue(10)
            .setMaxValue(100000),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("jackpot")
        .setDescription("🔥 View the Ashen Jackpot"),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("stats")
        .setDescription("📊 View your casino statistics"),
    );

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

      const subcommand =
        interaction.options.getSubcommand();

      if (subcommand === "jackpot") {
        const jackpot = await getJackpot();

        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setTitle("🔥 ASHEN JACKPOT")
              .setDescription(
                "Every casino wager contributes to the global jackpot.\n\n" +
                `💰 **${jackpot.toLocaleString()} Ashen Coins**`,
              )
              .setFooter({
                text: "Good luck, Ashen gambler.",
              }),
          ],
        });

        return;
      }

      if (subcommand === "stats") {
        const stats = await getCasinoStats(player);

        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setTitle(
                `🎰 ${player.username}'s Casino`,
              )
              .addFields(
                {
                  name: "🎮 Games",
                  value:
                    `Wins: **${stats.wins}**\n` +
                    `Losses: **${stats.losses}**`,
                  inline: true,
                },
                {
                  name: "💰 Economy",
                  value:
                    `Wagered: **${stats.wagered.toLocaleString()}**\n` +
                    `Won: **${stats.won.toLocaleString()}**\n` +
                    `Lost: **${stats.lost.toLocaleString()}**`,
                  inline: true,
                },
                {
                  name: "📈 Net",
                  value:
                    `**${stats.net >= 0 ? "+" : ""}${stats.net.toLocaleString()}**`,
                  inline: true,
                },
              )
              .setFooter({
                text:
                  `Jackpot: ${stats.jackpot.toLocaleString()} coins`,
              }),
          ],
        });

        return;
      }

      if (subcommand === "play") {
        const game =
          interaction.options.getString(
            "game",
            true,
          ) as CasinoGame;

        const wager =
          interaction.options.getInteger(
            "wager",
            true,
          );

        /*
         * Blackjack uses its own session engine because it is
         * an interactive Hit / Stand game.
         */
        if (game === "blackjack") {
          try {
            const { game: blackjackGame, immediateResult } =
              await startBlackjack(player, wager);

            // Persist the wager deduction immediately.
            await updatePlayer(player);

            if (immediateResult) {
              const result = immediateResult;

              const embed = new EmbedBuilder()
                .setTitle("🃏 Ashen Blackjack")
                .setDescription(
                  `**Your Cards**\n${handText(blackjackGame.playerCards)}\n` +
                  `**Total:** ${result.playerTotal}\n\n` +
                  `**Dealer Cards**\n${handText(blackjackGame.dealerCards)}\n` +
                  `**Total:** ${result.dealerTotal}`,
                )
                .addFields(
                  {
                    name: "🏆 Result",
                    value:
                      result.result === "blackjack"
                        ? "🎉 **BLACKJACK!**"
                        : result.result,
                  },
                  {
                    name: "💰 Payout",
                    value: `+${result.payout} coins`,
                    inline: true,
                  },
                  {
                    name: "✨ XP",
                    value: `+${result.xp}`,
                    inline: true,
                  },
                  {
                    name: "🪙 Balance",
                    value: `${player.coins}`,
                    inline: true,
                  },
                );

              await interaction.editReply({
                embeds: [embed],
                components: [],
              });

              return;
            }

            const embed = new EmbedBuilder()
              .setTitle("🃏 Ashen Blackjack")
              .setDescription(
                `**Your Cards**\n${handText(blackjackGame.playerCards)}\n\n` +
                `**Your Total:** ${calculateTotal(
                  blackjackGame.playerCards,
                )}\n\n` +
                `**Dealer**\n${handText([blackjackGame.dealerCards[0]])} ❓\n\n` +
                `🪙 Bet: **${blackjackGame.bet} coins**`,
              );

            const row =
              new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                  .setCustomId("ashen_blackjack_hit")
                  .setLabel("Hit")
                  .setEmoji("🟢")
                  .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                  .setCustomId("ashen_blackjack_stand")
                  .setLabel("Stand")
                  .setEmoji("🔴")
                  .setStyle(ButtonStyle.Danger),
              );

            await interaction.editReply({
              embeds: [embed],
              components: [row],
            });

          } catch (error) {
            if (error instanceof Error) {
              const message =
                error.message === "NOT_ENOUGH_COINS"
                  ? "❌ You don't have enough Ashen Coins."
                  : error.message === "BLACKJACK_ALREADY_ACTIVE"
                    ? "🃏 You already have an active Blackjack game."
                    : error.message === "INVALID_BLACKJACK_BET"
                      ? "❌ Blackjack wager must be at least **10 coins**."
                      : error.message === "BLACKJACK_BET_TOO_HIGH"
                        ? "❌ Blackjack wager cannot exceed **100,000 coins**."
                        : "❌ Blackjack game failed.";

              await interaction.editReply(message);
            } else {
              await interaction.editReply(
                "❌ Blackjack game failed.",
              );
            }
          }

          return;
        }

        try {
          const { player: updatedPlayer, result } = await mutatePlayer(
            user.id,
            async (p) => playCasino(p, game, wager),
            user.username,
          );

          const title = result.jackpotHit
            ? "🔥 ASHEN JACKPOT 🔥"
            : result.won
              ? "🎉 ASHEN CASINO — WIN"
              : "💀 ASHEN CASINO — LOSS";

          const netText =
            result.net >= 0
              ? `+${result.net.toLocaleString()}`
              : result.net.toLocaleString();

          const embed =
            new EmbedBuilder()
              .setTitle(title)
              .setDescription(
                result.message,
              )
              .addFields(
                {
                  name: "🎰 Game",
                  value: `**${game}**`,
                  inline: true,
                },
                {
                  name: "💰 Wager",
                  value:
                    `**${wager.toLocaleString()}**`,
                  inline: true,
                },
                {
                  name: "📈 Net",
                  value:
                    `**${netText}**`,
                  inline: true,
                },
                {
                  name: "🔥 Jackpot Contribution",
                  value:
                    `+${result.jackpotContribution.toLocaleString()} coins`,
                  inline: true,
                },
                {
                  name: "💳 Balance",
                  value:
                    `**${updatedPlayer.coins.toLocaleString()}** coins`,
                  inline: true,
                },
              );

          await interaction.editReply({
            embeds: [embed],
          });
        } catch (error) {
          if (error instanceof Error) {
            const message =
              error.message === "INSUFFICIENT_COINS"
                ? "❌ You don't have enough Ashen Coins."
                : error.message.startsWith(
                    "MINIMUM_WAGER:",
                  )
                  ? `❌ Minimum wager is **${error.message.split(":")[1]}** coins.`
                  : error.message.startsWith(
                      "MAXIMUM_WAGER:",
                    )
                    ? `❌ Maximum wager is **${error.message.split(":")[1]}** coins.`
                    : "❌ Casino game failed.";

            await interaction.editReply(message);
          } else {
            await interaction.editReply(
              "❌ Casino game failed.",
            );
          }
        }

        return;
      }

      await interaction.editReply(
        "❌ Unknown casino action.",
      );
    },
  };
}
