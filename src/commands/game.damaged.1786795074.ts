import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  SlashCommandBuilder,
} from "discord.js";

import { AshenCommand } from "./definitions";
import { getPlayer, updatePlayer } from "../games/store";
import { applyLevelUp, updateAchievements, ACHIEVEMENTS } from "../games/rewards";

export function createGameCommand(): AshenCommand {
  const data = new SlashCommandBuilder()
    .setName("game")
    .setDescription("🎮 Play AshenAI games")

    .addSubcommand((sub) =>
      sub.setName("profile")
        .setDescription("👤 View your game profile")
    )

    .addSubcommand((sub) =>
      sub.setName("stats")
        .setDescription("📊 View your game statistics")
    )

    .addSubcommand((sub) =>
      sub.setName("achievements")
        .setDescription("🏆 View your achievements")
    )

    .addSubcommand((sub) =>
      sub.setName("daily")
        .setDescription("🎁 Claim your daily reward")
    )

    .addSubcommand((sub) =>
      sub.setName("leaderboard")
        .setDescription("🏆 View the leaderboard")
    )

    .addSubcommand((sub) =>
      sub.setName("dice")
        .setDescription("🎲 Roll the dice")
    )

    .addSubcommand((sub) =>
      sub.setName("coin")
        .setDescription("🪙 Flip a coin")
    )

    .addSubcommand((sub) =>
      sub.setName("rps")
        .setDescription("🪨 Rock Paper Scissors")
        .addStringOption((option) =>
          option
            .setName("choice")
            .setDescription("Your choice")
            .setRequired(true)
            .addChoices(
              { name: "🪨 Rock", value: "rock" },
              { name: "📄 Paper", value: "paper" },
              { name: "✂️ Scissors", value: "scissors" },
            )
        )
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

      if (subcommand === "profile") {
        updateAchievements(player);

        const embed = new EmbedBuilder()
          .setTitle(`🎮 ${player.username}'s AshenAI Profile`)
          .setDescription(
            "Your progress in the AshenAI game system.",
          )
          .addFields(
            {
              name: "⭐ Level",
              value: `${player.level}`,
              inline: true,
            },
            {
              name: "✨ XP",
              value: `${player.xp}`,
              inline: true,
            },
            {
              name: "🪙 Coins",
              value: `${player.coins}`,
              inline: true,
            },
            {
              name: "🏆 Wins",
              value: `${player.wins}`,
              inline: true,
            },
            {
              name: "💀 Losses",
              value: `${player.losses}`,
              inline: true,
            },
            {
              name: "🤝 Draws",
              value: `${player.draws}`,
              inline: true,
            },
            {
              name: "🎮 Games",
              value: `${player.gamesPlayed}`,
              inline: true,
            },
            {
              name: "🔥 Win Streak",
              value: `${player.streak}`,
              inline: true,
            },
            {
              name: "🏅 Achievements",
              value: `${player.achievements.length}`,
              inline: true,
            },
          );

        await updatePlayer(player);

        await interaction.editReply({
          embeds: [embed],
        });

        return;
      }

      if (subcommand === "stats") {
        const winRate =
          player.gamesPlayed > 0
            ? ((player.wins / player.gamesPlayed) * 100).toFixed(1)
            : "0.0";

        const embed = new EmbedBuilder()
          .setTitle(`📊 ${player.username}'s Statistics`)
          .addFields(
            {
              name: "🎮 Games",
              value:
                `Played: **${player.gamesPlayed}**\n` +
                `Wins: **${player.wins}**\n` +
                `Losses: **${player.losses}**\n` +
                `Draws: **${player.draws}**`,
              inline: true,
            },
            {
              name: "📈 Performance",
              value:
                `Win Rate: **${winRate}%**\n` +
                `Current Streak: **${player.streak}**\n` +
                `Best Streak: **${player.bestStreak}**`,
              inline: true,
            },
            {
              name: "💰 Economy",
              value:
                `Coins: **${player.coins}**\n` +
                `XP: **${player.xp}**\n` +
                `Level: **${player.level}**`,
              inline: true,
            },
          );

        await interaction.editReply({
          embeds: [embed],
        });

        return;
      }

      if (subcommand === "achievements") {
        updateAchievements(player);

        const lines = Object.entries(ACHIEVEMENTS).map(
          ([id, name]) =>
            player.achievements.includes(id)
              ? `✅ ${name}`
              : `🔒 ${name}`,
        );

        const embed = new EmbedBuilder()
          .setTitle("🏆 AshenAI Achievements")
          .setDescription(lines.join("\n"))
          .setFooter({
            text:
              `${player.achievements.length}/${Object.keys(ACHIEVEMENTS).length} unlocked`,
          });

        await updatePlayer(player);

        await interaction.editReply({
          embeds: [embed],
        });

        return;
      }

      if (subcommand === "dice") {
        const result =
          Math.floor(Math.random() * 6) + 1;

        const oldLevel = player.level;

        player.gamesPlayed++;
        player.draws++;
        player.coins += 10;
        player.xp += 20;

        const levelUp = applyLevelUp(player);

        updateAchievements(player);

        await updatePlayer(player);

        const embed = new EmbedBuilder()
          .setTitle("🎲 AshenAI Dice")
          .setDescription(
            `**${user.username}** rolled **${result}**!`,
          )
          .addFields(
            {
              name: "🪙 Coins",
              value: "+10",
              inline: true,
            },
            {
              name: "✨ XP",
              value: "+20",
              inline: true,
            },
            {
              name: "⭐ Level",
              value: `${player.level}`,
              inline: true,
            },
          );

        if (levelUp) {
          embed.addFields({
            name: "🎉 Level Up!",
            value:
              `You reached **Level ${player.level}**!`,
          });
        }

        await interaction.editReply({
          embeds: [embed],
        });

        return;
      }

      if (subcommand === "coin") {
        const result =
          Math.random() < 0.5
            ? "Heads"
            : "Tails";

        player.gamesPlayed++;
        player.draws++;
        player.coins += 10;
        player.xp += 20;

        const levelUp = applyLevelUp(player);

        updateAchievements(player);

        await updatePlayer(player);

        const embed = new EmbedBuilder()
          .setTitle("🪙 AshenAI Coin Flip")
          .setDescription(
            `The coin landed on **${result}**!`,
          )
          .addFields(
            {
              name: "🪙 Coins",
              value: "+10",
              inline: true,
            },
            {
              name: "✨ XP",
              value: "+20",
              inline: true,
            },
            {
              name: "⭐ Level",
              value: `${player.level}`,
              inline: true,
            },
          );

        if (levelUp) {
          embed.addFields({
            name: "🎉 Level Up!",
            value:
              `You reached **Level ${player.level}**!`,
          });
        }

        await interaction.editReply({
          embeds: [embed],
        });

        return;
      }

      if (subcommand === "rps") {
        const choice = interaction.options.getString(
          "choice",
          true,
        ) as "rock" | "paper" | "scissors";

        const choices = [
          "rock",
          "paper",
          "scissors",
        ] as const;

        const botChoice =
          choices[
            Math.floor(
              Math.random() * choices.length,
            )
          ];

        let result: "win" | "loss" | "draw";

        if (choice === botChoice) {
          result = "draw";
        } else if (
          (choice === "rock" && botChoice === "scissors") ||
          (choice === "paper" && botChoice === "rock") ||
          (choice === "scissors" && botChoice === "paper")
        ) {
          result = "win";
        } else {
          result = "loss";
        }

        let coins = 10;
        let xp = 20;

        if (result === "win") {
          coins = 25;
          xp = 40;
          player.wins++;
          player.streak++;

          if (player.streak > player.bestStreak) {
            player.bestStreak = player.streak;
          }
        } else if (result === "loss") {
          coins = 5;
          xp = 10;
          player.losses++;
          player.streak = 0;
        } else {
          player.draws++;
        }

        player.gamesPlayed++;
        player.coins += coins;
        player.xp += xp;

        const levelUp = applyLevelUp(player);

        updateAchievements(player);

        await updatePlayer(player);

        const names = {
          rock: "🪨 Rock",
          paper: "📄 Paper",
          scissors: "✂️ Scissors",
        };

        const resultText = {
          win: "🎉 You win!",
          loss: "💀 You lose!",
          draw: "🤝 Draw!",
        };

        const embed = new EmbedBuilder()
          .setTitle("🪨📄✂️ Rock Paper Scissors")
          .setDescription(
            `**You:** ${names[choice]}\n` +
            `**AshenAI:** ${names[botChoice]}\n\n` +
            `## ${resultText[result]}`,
          )
          .addFields(
            {
              name: "🪙 Coins",
              value: `+${coins}`,
              inline: true,
            },
            {
              name: "✨ XP",
              value: `+${xp}`,
              inline: true,
            },
            {
              name: "⭐ Level",
              value: `${player.level}`,
              inline: true,
            },
          );

        if (levelUp) {
          embed.addFields({
            name: "🎉 Level Up!",
            value:
              `You reached **Level ${player.level}**!`,
          });
        }

        await interaction.editReply({
          embeds: [embed],
        });

        return;
      }

      if (subcommand === "daily") {
        const now = Date.now();

        if (player.dailyClaimedAt) {
          const last =
            new Date(
              player.dailyClaimedAt,
            ).getTime();

          const remaining =
            24 * 60 * 60 * 1000 -
            (now - last);

          if (remaining > 0) {
            const hours = Math.ceil(
              remaining / 3600000,
            );

            await interaction.editReply(
              `⏳ Daily reward already claimed. Try again in about **${hours}h**.`,
            );

            return;
          }
        }

        player.dailyClaimedAt =
          new Date(now).toISOString();

        player.dailyStreak =
          (player.dailyStreak ?? 0) + 1;

        player.coins += 100;
        player.xp += 25;

        const levelUp = applyLevelUp(player);

        updateAchievements(player);

        await updatePlayer(player);

        const embed = new EmbedBuilder()
          .setTitle("🎁 AshenAI Daily Reward")
          .setDescription(
            "Daily reward claimed!",
          )
          .addFields(
            {
              name: "🪙 Coins",
              value: "+100",
              inline: true,
            },
            {
              name: "✨ XP",
              value: "+25",
              inline: true,
            },
            {
              name: "🔥 Daily Streak",
              value:
                `${player.dailyStreak} day(s)`,
              inline: true,
            },
            {
              name: "⭐ Level",
              value: `${player.level}`,
              inline: true,
            },
          );

        if (levelUp) {
          embed.addFields({
            name: "🎉 Level Up!",
            value:
              `You reached **Level ${player.level}**!`,
          });
        }

        await interaction.editReply({
          embeds: [embed],
        });

        return;
      }

      if (subcommand === "leaderboard") {
        const players = await import("../games/store")
          .then((module) =>
            module.getLeaderboard(10, "level"),
          );

        if (players.length === 0) {
          await interaction.editReply(
            "🏆 No players yet.",
          );

          return;
        }

        const lines = players.map(
          (entry, index) =>
            `**${index + 1}.** ${entry.username} — ⭐ Lv.${entry.level} · ✨ ${entry.xp} XP · 🪙 ${entry.coins}`,
        );

        const embed = new EmbedBuilder()
          .setTitle("🏆 AshenAI Leaderboard")
          .setDescription(lines.join("\n"));

        await interaction.editReply({
          embeds: [embed],
        });

        return;
      }

      await interaction.editReply(
        "❌ Unknown game command.",
      );
    },
  };
}
