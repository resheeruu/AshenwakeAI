import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  SlashCommandBuilder,
} from "discord.js";

import { AshenCommand } from "./definitions";
import { getPlayer, updatePlayer } from "../games/store";
import {
  attackWorldBoss,
  claimWorldBossReward,
  getWorldBoss,
  getWorldBossLeaderboard,
} from "../games/worldBosses";
import {
  getActiveWorldBoss,
  saveWorldBoss,
} from "../games/worldBossStore";
import { applyLevelUp, updateAchievements, ACHIEVEMENTS } from "../games/rewards";
import { hunt } from "../games/games/hunt";
import {
  PETS,
  getPet,
  getPlayerPets,
} from "../games/pets";

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
      sub.setName("hunt")
        .setDescription("🏹 Hunt the Ashen realm for loot")
    )
      .addSubcommand((sub) =>
        sub
          .setName("boss")
          .setDescription("🐉 Fight the active World Boss")
          .addStringOption((option) =>
            option
              .setName("action")
              .setDescription("Choose a World Boss action")
              .setRequired(true)
              .addChoices(
                { name: "📊 Status", value: "status" },
                { name: "⚔️ Attack", value: "attack" },
                { name: "🏆 Leaderboard", value: "leaderboard" },
                { name: "🎁 Claim Reward", value: "claim" },
              )
          )
      )
      .addSubcommand((sub) =>
        sub
          .setName("pets")
          .setDescription("🐾 View your pets")
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

      if (subcommand === "boss") {
        const action = interaction.options.getString("action", true);
        const state = await getActiveWorldBoss();

        if (!state) {
          await interaction.editReply({
            content: "🐉 There is no active World Boss right now.",
          });
          return;
        }

        const boss = getWorldBoss(state.bossId);

        if (!boss) {
          await interaction.editReply({
            content: "❌ The active World Boss is invalid.",
          });
          return;
        }

        if (action === "status") {
          const hpPercent = Math.max(
            0,
            Math.floor((state.hp / state.maxHp) * 100),
          );

          const embed = new EmbedBuilder()
            .setTitle(`${boss.emoji} ${boss.name}`)
            .setDescription(
              `**HP:** ${state.hp.toLocaleString()} / ${state.maxHp.toLocaleString()} (${hpPercent}%)\\n` +
              `**Minimum Level:** ${boss.minLevel}\\n` +
              `**Participants:** ${state.contributions.length}`,
            )
            .setFooter({
              text: "Use /game boss action:attack to fight!",
            });

          await interaction.editReply({ embeds: [embed] });
          return;
        }

        if (action === "leaderboard") {
          const leaderboard = getWorldBossLeaderboard(state);

          if (leaderboard.length === 0) {
            await interaction.editReply({
              content: `🏆 **${boss.name} Leaderboard**\\nNo attacks yet.`,
            });
            return;
          }

          const lines = leaderboard
            .slice(0, 10)
            .map(
              (entry, index) =>
                `**${index + 1}.** <@${entry.userId}> — **${entry.damage.toLocaleString()}** damage (${entry.attacks} attacks)`,
            );

          const embed = new EmbedBuilder()
            .setTitle(`🏆 ${boss.name} Leaderboard`)
            .setDescription(lines.join("\\n"));

          await interaction.editReply({ embeds: [embed] });
          return;
        }

        if (action === "attack") {
          try {
            const result = attackWorldBoss(state, player);

            await saveWorldBoss(state);

            const embed = new EmbedBuilder()
              .setTitle(`${boss.emoji} ${boss.name} — Attack!`)
              .setDescription(
                `⚔️ You dealt **${result.damage.toLocaleString()} damage**!\\n\\n` +
                `❤️ Boss HP: **${result.remainingHp.toLocaleString()} / ${state.maxHp.toLocaleString()}**\\n` +
                `🏅 Your rank: **#${result.rank}**\\n` +
                `💥 Your total damage: **${result.totalDamage.toLocaleString()}**`,
              );

            if (result.defeated) {
              embed.setDescription(
                `💀 **${boss.name} has been defeated!**\\n\\n` +
                `⚔️ Final hit: **${result.damage.toLocaleString()} damage**\\n` +
                `🏅 Your final rank: **#${result.rank}**\\n` +
                `💥 Your total damage: **${result.totalDamage.toLocaleString()}**\\n\\n` +
                `🎁 Use **/game boss action:claim** to claim your reward.`,
              );
            }

            await interaction.editReply({ embeds: [embed] });
            return;
          } catch (error) {
            const message =
              error instanceof Error ? error.message : "UNKNOWN_ERROR";

            await interaction.editReply({
              content:
                message === "WORLD_BOSS_ATTACK_NOT_AVAILABLE"
                  ? "⏳ You cannot attack yet. Wait 30 seconds between attacks, or make sure your level is high enough."
                  : `❌ ${message}`,
            });
            return;
          }
        }

        if (action === "claim") {
          try {
            const reward = await claimWorldBossReward(state, player);

            await updatePlayer(player);
            await saveWorldBoss(state);

            const embed = new EmbedBuilder()
              .setTitle(`🎁 ${boss.name} Reward`)
              .setDescription(
                `🏅 Final Rank: **#${reward.rank}**\\n` +
                `🪙 Coins: **+${reward.coins.toLocaleString()}**\\n` +
                `✨ XP: **+${reward.xp.toLocaleString()}**\\n` +
                `🎒 Loot: **${reward.loot.name}**`,
              );

            await interaction.editReply({ embeds: [embed] });
            return;
          } catch (error) {
            const message =
              error instanceof Error ? error.message : "UNKNOWN_ERROR";

            await interaction.editReply({
              content:
                message === "WORLD_BOSS_NOT_DEFEATED"
                  ? "❌ The World Boss has not been defeated yet."
                  : message === "NO_WORLD_BOSS_CONTRIBUTION"
                    ? "❌ You did not contribute damage to this World Boss."
                    : `❌ ${message}`,
            });
            return;
          }
        }
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

      if (subcommand === "hunt") {
        try {
          const result = await hunt(player);

          const embed = new EmbedBuilder()
            .setTitle(`🏹 ${result.title}`)
            .setDescription(result.description)
            .addFields(
              {
                name: "💎 Rarity",
                value: result.rarity,
                inline: true,
              },
              {
                name: "🪙 Coins",
                value: `+${result.coins}`,
                inline: true,
              },
              {
                name: "✨ XP",
                value: `+${result.xp}`,
                inline: true,
              },
              {
                name: "🔥 Hunt Streak",
                value: `${result.streak}`,
                inline: true,
              },
              {
                name: "🏹 Hunts",
                value: `${result.huntsCompleted}`,
                inline: true,
              },
              {
                name: "🍀 Lucky Token",
                value: result.luckyTokenUsed ? "Used" : "Not used",
                inline: true,
              },
            );

          if ((result.newAchievements ?? []).length > 0) {
            embed.addFields({
              name: "🏆 New Achievements",
              value: (result.newAchievements ?? [])
                .map((id) => `• ${id}`)
                .join("\n"),
            });
          }

          await interaction.editReply({
            embeds: [embed],
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "";

          if (message.startsWith("HUNT_COOLDOWN:")) {
            const remaining = Number(
              message.slice("HUNT_COOLDOWN:".length),
            );
            const seconds = Math.ceil(remaining / 1000);

            await interaction.editReply(
              `⏳ Your hunt is still on cooldown. Try again in **${seconds}s**.`,
            );
            return;
          }

          console.error("Hunt command failed:", error);

          await interaction.editReply(
            "❌ Something went wrong while hunting.",
          );
        }

        return;
      }

      if (subcommand === "pets") {
        const pets = getPlayerPets(player);

        if (pets.length === 0) {
          await interaction.editReply(
            "🐾 You don't own any pets yet.",
          );
          return;
        }

        const lines = pets.map((owned) => {
          const definition = getPet(owned.petId);

          if (!definition) {
            return `❓ Unknown pet — Lv.${owned.level}`;
          }

          const evolved = owned.evolved ? " ✨ Evolved" : "";

          return (
            `${definition.emoji} **${definition.name}** — ` +
            `${definition.rarity} · Lv.${owned.level} · ` +
            `${owned.xp} XP${evolved}\n` +
            `> ${definition.description}`
          );
        });

        const embed = new EmbedBuilder()
          .setTitle(`🐾 ${player.username}'s Pets`)
          .setDescription(lines.join("\n\n"));

        await interaction.editReply({
          embeds: [embed],
        });

        return;
      }

      if (subcommand === "pet") {
        const petId = interaction.options.getString("pet", true);
        const definition = getPet(petId);

        if (!definition) {
          await interaction.editReply(
            "❌ That pet does not exist.",
          );
          return;
        }

        const owned = getPlayerPets(player).find(
          (entry) => entry.petId === petId,
        );

        if (!owned) {
          await interaction.editReply(
            `❌ You don't own ${definition.emoji} **${definition.name}** yet.`,
          );
          return;
        }

        const embed = new EmbedBuilder()
          .setTitle(`${definition.emoji} ${definition.name}`)
          .setDescription(definition.description)
          .addFields(
            {
              name: "💎 Rarity",
              value: definition.rarity,
              inline: true,
            },
            {
              name: "⭐ Level",
              value: `${owned.level}`,
              inline: true,
            },
            {
              name: "✨ XP",
              value: `${owned.xp}`,
              inline: true,
            },
            {
              name: "⚡ Ability",
              value: definition.ability,
              inline: true,
            },
            {
              name: "📈 Bonus",
              value: `+${definition.bonus}%`,
              inline: true,
            },
            {
              name: "🌟 Evolution",
              value: owned.evolved ? "Evolved" : "Not evolved",
              inline: true,
            },
          );

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
