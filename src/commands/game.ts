import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  SlashCommandBuilder,
} from "discord.js";

import { AshenCommand } from "./definitions";

import {
  getPlayer,
  getLeaderboard,
  updatePlayer,
} from "../games/store";

import {
  awardResult,
  awardDailyReward,
  ACHIEVEMENTS,
} from "../games/rewards";

import { rollDice } from "../games/games/dice";
import { flipCoin } from "../games/games/coinflip";
import {
  SHOP_ITEMS,
  buyItem,
  ShopItemId,
} from "../games/shop";
import { claimDaily } from "../games/daily";
import {
  playRPS,
  randomRPS,
} from "../games/games/rps";
import { simulateDuel } from "../games/games/duel";
import { randomChaos } from "../games/games/chaos";
import { hunt } from "../games/games/hunt";
import { getInventory, LOOT_ITEMS } from "../games/loot";

export function createGameCommand(): AshenCommand {
  const data = new SlashCommandBuilder()
    .setName("game")
    .setDescription("🎮 Play AshenAI games")

    .addSubcommand((subcommand) =>
      subcommand
        .setName("dice")
        .setDescription("🎲 Roll a dice")
        .addIntegerOption((option) =>
          option
            .setName("sides")
            .setDescription("Number of sides")
            .setMinValue(2)
            .setMaxValue(100)
            .setRequired(false)
        )
    )

    .addSubcommand((subcommand) =>
      subcommand
        .setName("coin")
        .setDescription("🪙 Flip a coin")
    )

    .addSubcommand((subcommand) =>
      subcommand
        .setName("rps")
        .setDescription("🪨 Rock Paper Scissors")
        .addStringOption((option) =>
          option
            .setName("choice")
            .setDescription("Choose your move")
            .setRequired(true)
            .addChoices(
              {
                name: "🪨 Rock",
                value: "rock",
              },
              {
                name: "📄 Paper",
                value: "paper",
              },
              {
                name: "✂️ Scissors",
                value: "scissors",
              },
            )
        )
    )

    .addSubcommand((subcommand) =>
      subcommand
        .setName("profile")
        .setDescription("👤 View your game profile")
    )

    .addSubcommand((subcommand) =>
      subcommand
        .setName("stats")
        .setDescription("📊 View your detailed game statistics")
    )

    .addSubcommand((subcommand) =>
      subcommand
        .setName("achievements")
        .setDescription(
          "🏅 View all AshenAI game achievements",
        )
    )

    .addSubcommand((subcommand) =>
      subcommand
        .setName("daily")
        .setDescription(
          "🎁 Claim your daily reward",
        )
    )

    .addSubcommand((subcommand) =>
      subcommand
        .setName("duel")
        .setDescription("⚔️ Challenge another player")
        .addUserOption((option) =>
          option
            .setName("opponent")
            .setDescription("Choose your opponent")
            .setRequired(true),
        )
    )

    .addSubcommand((subcommand) =>
      subcommand
        .setName("leaderboard")
        .setDescription(
          "🏆 View the game leaderboard",
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("chaos")
        .setDescription("🌪️ Trigger a random AshenAI chaos event")
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("hunt")
        .setDescription("🎯 Go hunting for coins and XP")
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("inventory")
        .setDescription("🎒 View your AshenAI inventory")
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("adventure")
        .setDescription("🗺️ Go on an adventure")
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("quests")
        .setDescription("📜 View your active quests")
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("pets")
        .setDescription("🐾 View your pets")
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("pet")
        .setDescription("🐾 Manage your active pet")
        .addStringOption((option) =>
          option
            .setName("action")
            .setDescription("Pet action")
            .setRequired(true)
            .addChoices(
              { name: "View Active", value: "active" },
              { name: "View All", value: "all" },
              { name: "Set Active", value: "set" },
            )
        )
        .addStringOption((option) =>
          option
            .setName("pet_id")
            .setDescription("Pet ID (for set action)")
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("titles")
        .setDescription("🏅 View your titles and set active title")
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("dungeon")
        .setDescription("🏰 Enter a dungeon")
        .addStringOption((option) =>
          option
            .setName("action")
            .setDescription("Dungeon action")
            .setRequired(true)
            .addChoices(
              { name: "List Dungeons", value: "list" },
              { name: "Create Party", value: "create" },
              { name: "Join Party", value: "join" },
              { name: "Start Dungeon", value: "start" },
              { name: "Attack", value: "attack" },
              { name: "Defend", value: "defend" },
              { name: "Ability", value: "ability" },
              { name: "Flee", value: "flee" },
              { name: "Claim Reward", value: "reward" },
            )
        )
        .addStringOption((option) =>
          option
            .setName("dungeon_id")
            .setDescription("Dungeon ID")
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("worldboss")
        .setDescription("🌍 Attack the world boss")
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("casino")
        .setDescription("🎰 Play a casino game")
        .addStringOption((option) =>
          option
            .setName("game")
            .setDescription("Casino game")
            .setRequired(true)
            .addChoices(
              { name: "🪙 Coinflip", value: "coinflip" },
              { name: "🎲 Dice", value: "dice" },
              { name: "🎰 Slots", value: "slots" },
              { name: "🃏 Blackjack", value: "blackjack" },
              { name: "💎 Crystal", value: "crystal" },
              { name: "📦 Mystery Chest", value: "chest" },
              { name: "🔥 Jackpot", value: "jackpot" },
            )
        )
        .addIntegerOption((option) =>
          option
            .setName("wager")
            .setDescription("Amount to wager")
            .setMinValue(10)
            .setMaxValue(100000)
            .setRequired(true)
        )
    );

  // Shop and purchase subcommands
  data
    .addSubcommand((subcommand) =>
      subcommand
        .setName("shop")
        .setDescription("🛒 View the AshenAI coin shop"),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("buy")
        .setDescription("🛍️ Buy an item from the shop")
        .addStringOption((option) =>
          option
            .setName("item")
            .setDescription("Choose an item")
            .setRequired(true)
            .addChoices(
              ...Object.entries(SHOP_ITEMS).map(
                ([value, item]) => ({
                  name: `${item.name} — ${item.price} coins`,
                  value,
                }),
              ),
            ),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("use")
        .setDescription("🧪 Use a consumable item")
        .addStringOption((option) =>
          option
            .setName("item")
            .setDescription("Choose an item to use")
            .setRequired(true)
            .addChoices(
              {
                name: "🧪 XP Boost",
                value: "xp_boost",
              },
              {
                name: "🍀 Lucky Token",
                value: "lucky_token",
              },
            ),
        ),
    );

  return {
    data,


    async execute(
      interaction: ChatInputCommandInteraction,
    ): Promise<void> {
      const subcommand =
        interaction.options.getSubcommand();

      if (subcommand === "dice") {
        const sides =
          interaction.options.getInteger(
            "sides",
          ) ?? 6;

        const result = rollDice(sides);

        const player = await getPlayer(
          interaction.user.id,
          interaction.user.username,
        );

        const reward = await awardResult(
          player,
          "draw",
        );

        const embed = new EmbedBuilder()
          .setTitle("🎲 AshenAI Dice")
          .setDescription(
            `**${interaction.user.username}** rolled **${result}** on a d${sides}!`,
          )
          .addFields(
            {
              name: "🪙 Coins",
              value: `+${reward.coins}`,
              inline: true,
            },
            {
              name: "✨ XP",
              value: `+${reward.xp}`,
              inline: true,
            },
            {
              name: "⭐ Level",
              value: `${player.level}`,
              inline: true,
            },
          );

        if (reward.levelUp) {
          embed.addFields({
            name: "🎉 Level Up!",
            value:
              `You reached **Level ${player.level}**!`,
          });
        }

        if (
          reward.newAchievements.length > 0
        ) {
          embed.addFields({
            name: "🏅 Achievement Unlocked!",
            value: reward.newAchievements
              .map(
                (id) =>
                  `🏆 **${ACHIEVEMENTS[id] ?? id}**`,
              )
              .join("\n"),
          });
        }

        await interaction.editReply({
          embeds: [embed],
        });

        return;
      }

      if (subcommand === "coin") {
        const result = flipCoin();

        const player = await getPlayer(
          interaction.user.id,
          interaction.user.username,
        );

        const reward = await awardResult(
          player,
          "draw",
        );

        const embed = new EmbedBuilder()
          .setTitle("🪙 AshenAI Coin Flip")
          .setDescription(
            `The coin landed on **${result}**!`,
          )
          .addFields(
            {
              name: "🪙 Coins",
              value: `+${reward.coins}`,
              inline: true,
            },
            {
              name: "✨ XP",
              value: `+${reward.xp}`,
              inline: true,
            },
          );

        if (
          reward.newAchievements.length > 0
        ) {
          embed.addFields({
            name: "🏅 Achievement Unlocked!",
            value: reward.newAchievements
              .map(
                (id) =>
                  `🏆 **${ACHIEVEMENTS[id] ?? id}**`,
              )
              .join("\n"),
          });
        }

        await interaction.editReply({
          embeds: [embed],
        });

        return;
      }

      if (subcommand === "rps") {
        const choice =
          interaction.options.getString(
            "choice",
            true,
          ) as
            | "rock"
            | "paper"
            | "scissors";

        const botChoice = randomRPS();

        const result = playRPS(
          choice,
          botChoice,
        );

        const player = await getPlayer(
          interaction.user.id,
          interaction.user.username,
        );

        const reward = await awardResult(
          player,
          result,
        );

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
          .setTitle(
            "🪨📄✂️ Rock Paper Scissors",
          )
          .setDescription(
            `**You:** ${names[choice]}\n` +
            `**AshenAI:** ${names[botChoice]}\n\n` +
            `## ${resultText[result]}`,
          )
          .addFields(
            {
              name: "🪙 Coins",
              value: `+${reward.coins}`,
              inline: true,
            },
            {
              name: "✨ XP",
              value: `+${reward.xp}`,
              inline: true,
            },
            {
              name: "⭐ Level",
              value: `${player.level}`,
              inline: true,
            },
          );

        if (reward.levelUp) {
          embed.addFields({
            name: "🎉 Level Up!",
            value:
              `You reached **Level ${player.level}**!`,
          });
        }

        if (
          reward.newAchievements.length > 0
        ) {
          embed.addFields({
            name: "🏅 Achievement Unlocked!",
            value: reward.newAchievements
              .map(
                (id) =>
                  `🏆 **${ACHIEVEMENTS[id] ?? id}**`,
              )
              .join("\n"),
          });
        }

        await interaction.editReply({
          embeds: [embed],
        });

        return;
      }

      if (subcommand === "stats") {
        const player = await getPlayer(
          interaction.user.id,
          interaction.user.username,
        );

        const inventoryCount = Object.values(
          player.inventory ?? {},
        ).reduce(
          (total, amount) => total + amount,
          0,
        );

        const winRate =
          player.gamesPlayed > 0
            ? (
                (player.wins / player.gamesPlayed) *
                100
              ).toFixed(1)
            : "0.0";

        const duelTotal =
          player.duelWins + player.duelLosses;

        const duelWinRate =
          duelTotal > 0
            ? (
                (player.duelWins / duelTotal) *
                100
              ).toFixed(1)
            : "0.0";

        const lootSummary =
          Object.entries(LOOT_ITEMS)
            .map(([id, item]) => {
              const amount = player.inventory?.[id] ?? 0;
              return `${item.name}: **${amount}**`;
            })
            .join("\n");

        const embed = new EmbedBuilder()
          .setTitle(
            `📊 ${player.username}'s AshenAI Statistics`,
          )
          .addFields(
            {
              name: "🎮 Overall Games",
              value:
                `Games: **${player.gamesPlayed}**\n` +
                `🏆 Wins: **${player.wins}**\n` +
                `💀 Losses: **${player.losses}**\n` +
                `🤝 Draws: **${player.draws}**\n` +
                `📈 Win Rate: **${winRate}%**`,
              inline: true,
            },
            {
              name: "⚔️ Duel Statistics",
              value:
                `🏆 Duel Wins: **${player.duelWins}**\n` +
                `💀 Duel Losses: **${player.duelLosses}**\n` +
                `📈 Duel Win Rate: **${duelWinRate}%**`,
              inline: true,
            },
            {
              name: "🎯 Hunt Statistics",
              value:
                `🎯 Hunts: **${player.huntsCompleted ?? 0}**\n` +
                `🔥 Hunt Streak: **${player.huntStreak ?? 0}**\n` +
                `👑 Best Hunt Streak: **${player.bestHuntStreak ?? 0}**`,
              inline: true,
            },
            {
              name: "🎁 Daily Statistics",
              value:
                `🔥 Daily Streak: **${player.dailyStreak ?? 0}**\n` +
                `👑 Best Daily Streak: **${player.bestDailyStreak ?? 0}**`,
              inline: true,
            },
            {
              name: "💰 Economy",
              value:
                `🪙 Coins: **${player.coins}**\n` +
                `✨ XP: **${player.xp}**\n` +
                `⭐ Level: **${player.level}**`,
              inline: true,
            },
            {
              name: "🎒 Inventory",
              value: `📦 Items: **${inventoryCount}**`,
              inline: true,
            },
            {
              name: "💎 Loot Collection",
              value: lootSummary,
              inline: false,
            },
          )
          .setFooter({
            text:
              "AshenAI • Keep playing to improve your statistics!",
          });

        await interaction.editReply({
          embeds: [embed],
        });

        return;
      }

      if (subcommand === "profile") {
        const player = await getPlayer(
          interaction.user.id,
          interaction.user.username,
        );

        const inventoryCount = Object.values(
          player.inventory ?? {},
        ).reduce(
          (total, amount) => total + amount,
          0,
        );

        const achievements =
          player.achievements.length > 0
            ? player.achievements
                .map(
                  (id) =>
                    `• ${ACHIEVEMENTS[id] ?? id}`,
                )
                .join("\n")
            : "None yet";

        const embed = new EmbedBuilder()
          .setTitle(
            `🎮 ${player.username}'s AshenAI Profile`,
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
              name: "🔥 Streak",
              value: `${player.streak}`,
              inline: true,
            },
            {
              name: "👑 Best Streak",
              value: `${player.bestStreak}`,
              inline: true,
            },
            {
              name: "🔥 Daily Streak",
              value: `${player.dailyStreak ?? 0} day(s)`,
              inline: true,
            },
            {
              name: "🏆 Best Daily Streak",
              value: `${player.bestDailyStreak ?? 0} day(s)`,
              inline: true,
            },
            {
              name: "🏅 Achievements",
              value: achievements,
            },
          );

        await interaction.editReply({
          embeds: [embed],
        });

        return;
      }

      if (subcommand === "achievements") {
        const player = await getPlayer(
          interaction.user.id,
          interaction.user.username,
        );

        const lines = Object.entries(
          ACHIEVEMENTS,
        ).map(([id, name]) => {
          const unlocked =
            player.achievements.includes(id);

          return unlocked
            ? `✅ ${name}`
            : `🔒 ${name}`;
        });

        const embed = new EmbedBuilder()
          .setTitle(
            "🏅 AshenAI Achievements",
          )
          .setDescription(
            lines.join("\n"),
          )
          .setFooter({
            text:
              `${player.achievements.length}/${Object.keys(ACHIEVEMENTS).length} unlocked`,
          });

        await interaction.editReply({
          embeds: [embed],
        });

        return;
      }

      if (subcommand === "daily") {
        const reward = await claimDaily(
          interaction.user.id,
          interaction.user.username,
        );

        const player = await getPlayer(
          interaction.user.id,
          interaction.user.username,
        );

        if (!reward.claimed) {
          const remaining = Math.max(
            0,
            (reward.nextClaimAt ?? Date.now()) - Date.now(),
          );

          const hours = Math.ceil(
            remaining / (60 * 60 * 1000),
          );

          await interaction.editReply(
            `⏳ You already claimed your daily reward. Try again in about **${hours}h**.`,
          );

          return;
        }

        const embed = new EmbedBuilder()
          .setTitle("🎁 AshenAI Daily Reward")
          .setDescription(
            "Your daily reward has been claimed!",
          )
          .addFields(
            {
              name: "🪙 Coins",
              value: `+${reward.coins}`,
              inline: true,
            },
            {
              name: "✨ XP",
              value: `+${reward.xp}`,
              inline: true,
            },
            {
              name: "⭐ Level",
              value: `${reward.level}`,
              inline: true,
            },
            {
              name: "🔥 Daily Streak",
              value: `${player.dailyStreak ?? 1} day(s)`,
              inline: true,
            },
          );

        if (reward.levelUp) {
          embed.addFields({
            name: "🎉 Level Up!",
            value:
              `You reached **Level ${reward.level}**!`,
          });
        }

        if (reward.newAchievements.length > 0) {
          embed.addFields({
            name: "🏅 Achievement Unlocked!",
            value: reward.newAchievements
              .map(
                (id) =>
                  `🏆 **${ACHIEVEMENTS[id] ?? id}**`,
              )
              .join("\n"),
          });
        }

        await interaction.editReply({
          embeds: [embed],
        });

        return;
      }

      if (subcommand === "duel") {
        const opponent = interaction.options.getUser(
          "opponent",
          true,
        );

        if (opponent.id === interaction.user.id) {
          await interaction.editReply(
            "❌ You cannot duel yourself.",
          );
          return;
        }

        if (opponent.bot) {
          await interaction.editReply(
            "❌ You cannot duel a bot.",
          );
          return;
        }

        const player = await getPlayer(
          interaction.user.id,
          interaction.user.username,
        );

        const enemy = await getPlayer(
          opponent.id,
          opponent.username,
        );

        const result = simulateDuel(
          player,
          enemy,
        );

        if (result.winner.userId === player.userId) {
          player.duelWins++;
          enemy.duelLosses++;

          player.coins += 50;
          player.xp += 75;
        } else {
          player.duelLosses++;
          enemy.duelWins++;

          enemy.coins += 50;
          enemy.xp += 75;
        }

        player.hp = player.maxHp;
        enemy.hp = enemy.maxHp;

        const { updatePlayer } =
          await import("../games/store");

        await updatePlayer(player);
        await updatePlayer(enemy);

        const winner = result.winner;
        const loser = result.loser;

        await interaction.editReply(
          `⚔️ **ASHEN DUEL**\n\n` +
          `**${player.username}** vs **${enemy.username}**\n\n` +
          `🏆 **${winner.username} wins!**\n` +
          `💀 ${loser.username} has been defeated.\n\n` +
          `⚔️ Turns: **${result.turns}**\n` +
          `🪙 Winner: **+50 coins**\n` +
          `✨ Winner: **+75 XP**`,
        );

        return;
      }

      if (subcommand === "buy") {
        const itemId = interaction.options.getString(
          "item",
          true,
        ) as ShopItemId;

        const player = await getPlayer(
          interaction.user.id,
          interaction.user.username,
        );

        const result = await buyItem(
          player,
          itemId,
        );

        await interaction.editReply(
          result.success
            ? `${result.message}\n\n🪙 Remaining coins: **${player.coins}**`
            : result.message,
        );

        return;
      }

      if (subcommand === "use") {
        const itemId = interaction.options.getString(
          "item",
          true,
        );

        const player = await getPlayer(
          interaction.user.id,
          interaction.user.username,
        );

        if (!player.inventory) {
          player.inventory = {};
        }

        const amount = player.inventory[itemId] ?? 0;

        if (amount <= 0) {
          await interaction.editReply(
            `❌ You don't have **${itemId}** in your inventory.`,
          );
          return;
        }

        if (itemId === "xp_boost") {
          if (player.xpBoostActive) {
            await interaction.editReply(
              "🧪 Your XP Boost is already active. Use it on your next hunt.",
            );
            return;
          }

          player.inventory.xp_boost = amount - 1;
          if (player.inventory.xp_boost <= 0) {
            delete player.inventory.xp_boost;
          }

          player.xpBoostActive = true;

          await updatePlayer(player);

          await interaction.editReply(
            "🧪 **XP Boost activated!** Your next hunt will give **2× XP**.",
          );
          return;
        }

        if (itemId === "lucky_token") {
          if (player.luckyTokenActive) {
            await interaction.editReply(
              "🍀 Your Lucky Token is already active. Use it on your next hunt.",
            );
            return;
          }

          player.inventory.lucky_token = amount - 1;
          if (player.inventory.lucky_token <= 0) {
            delete player.inventory.lucky_token;
          }

          player.luckyTokenActive = true;

          await updatePlayer(player);

          await interaction.editReply(
            "🍀 **Lucky Token activated!** Your next hunt has an improved chance of finding rare loot.",
          );
          return;
        }

        if (itemId === "vip_badge") {
          await interaction.editReply(
            "👑 The VIP Badge is permanent and cannot be consumed.",
          );
          return;
        }

        await interaction.editReply(
          "❌ That item cannot be used.",
        );
        return;
      }

      if (subcommand === "shop") {
        const player = await getPlayer(
          interaction.user.id,
          interaction.user.username,
        );

        const lines = Object.entries(SHOP_ITEMS).map(
          ([itemId, item]) => {
            const owned = player.inventory?.[itemId] ?? 0;
            const canAfford = player.coins >= item.price;

            let status: string;

            if (itemId === "vip_badge" && owned > 0) {
              status = "👑 **OWNED — Permanent**";
            } else if (canAfford) {
              status = "✅ **You can afford this**";
            } else {
              status = `🔒 Need **${item.price - player.coins} more coins**`;
            }

            return [
              `### ${item.name}`,
              `🪙 **${item.price} coins**`,
              item.description,
              `📦 Owned: **${owned}**`,
              status,
            ].join("\n");
          },
        );

        const embed = new EmbedBuilder()
          .setTitle("🛒 AshenAI Coin Shop")
          .setDescription(lines.join("\n\n"))
          .addFields({
            name: "🪙 Your Balance",
            value: `**${player.coins} coins**`,
            inline: false,
          })
          .setFooter({
            text: "Use /game buy to purchase an item.",
          });

        await interaction.editReply({
          embeds: [embed],
        });

        return;
      }

      if (subcommand === "hunt") {
        const player = await getPlayer(
          interaction.user.id,
          interaction.user.username,
        );

        let result;

        try {
          result = await hunt(player);
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : String(error);

          if (message.startsWith("HUNT_COOLDOWN:")) {
            const remainingMs = Number(
              message.split(":")[1],
            );

            const seconds = Math.ceil(
              remainingMs / 1000,
            );

            await interaction.editReply(
              `⏳ You are still on a hunt cooldown. Try again in **${seconds}s**.`,
            );

            return;
          }

          throw error;
        }

        const rarityLabels: Record<string, string> = {
          common: "⚪ Common",
          uncommon: "🟢 Uncommon",
          rare: "🔵 Rare",
          legendary: "🟡 Legendary",
          danger: "🔴 Danger",
        };

        const embed = new EmbedBuilder()
          .setTitle(`🎯 AshenAI Hunt — ${result.title}`)
          .setDescription(
            `**${interaction.user.username}** ${result.description}`,
          )
          .addFields(
            {
              name: "✨ Rarity",
              value:
                rarityLabels[result.rarity] ??
                result.rarity,
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
              name: "🎯 Hunts",
              value: `${result.huntsCompleted}`,
              inline: true,
            },
            {
              name: "⭐ Level",
              value: `${player.level}`,
              inline: true,
            },
          );

        if (result.newAchievements && result.newAchievements.length > 0) {
          embed.addFields({
            name: "🏅 Achievement Unlocked!",
            value: result.newAchievements
              .map(
                (id) => `🏆 **${ACHIEVEMENTS[id] ?? id}**`,
              )
              .join("\n"),
          });
        }

        embed.setFooter({
          text:
            "Keep hunting to build your AshenAI fortune.",
        });

        await interaction.editReply({
          embeds: [embed],
        });

        return;
      }

      if (subcommand === "inventory") {
        const player = await getPlayer(
          interaction.user.id,
          interaction.user.username,
        );

        const inventory = getInventory(player);

        const entries = Object.entries(inventory)
          .filter(([, amount]) => amount > 0);

        const lines = entries.map(
          ([itemId, amount]) => {
            const lootItem =
              LOOT_ITEMS[
                itemId as keyof typeof LOOT_ITEMS
              ];

            const shopItem =
              SHOP_ITEMS[
                itemId as keyof typeof SHOP_ITEMS
              ];

            const item = lootItem ?? shopItem;

            if (item) {
              let typeLabel = "🎁 Hunt Loot";

              if (itemId === "vip_badge") {
                typeLabel = "👑 Permanent";
              } else if (
                itemId === "xp_boost" ||
                itemId === "lucky_token"
              ) {
                typeLabel = "🧪 Consumable";
              }

              return [
                `**${item.name}** ×${amount}`,
                `${typeLabel}`,
                item.description,
              ].join("\n");
            }

            return `**${itemId}** ×${amount}\n📦 Unknown Item`;
          },
        );

        const inventoryDescription =
          lines.length > 0
            ? lines.join("\n\n")
            : "Your inventory is empty. Go hunting or visit `/game shop`!";

        const totalItems = entries.reduce(
          (total, [, amount]) => total + amount,
          0,
        );

        const embed = new EmbedBuilder()
          .setTitle("🎒 AshenAI Inventory")
          .setDescription(inventoryDescription)
          .addFields({
            name: "📦 Total Items",
            value: `${totalItems}`,
            inline: true,
          })
          .addFields({
            name: "🪙 Coins",
            value: `${player.coins}`,
            inline: true,
          })
          .setFooter({
            text: "Collect loot by hunting and purchase items from the shop!",
          });

        await interaction.editReply({
          embeds: [embed],
        });

        return;
      }

      if (subcommand === "chaos") {
        const result = randomChaos();

        const player = await getPlayer(
          interaction.user.id,
          interaction.user.username,
        );

        player.coins += result.coins;
        player.xp += result.xp;

        await updatePlayer(player);

        const embed = new EmbedBuilder()
          .setTitle(result.title)
          .setDescription(
            `**${interaction.user.username}** — ${result.description}`,
          )
          .addFields(
            {
              name: "🪙 Coins",
              value: `${result.coins >= 0 ? "+" : ""}${result.coins}`,
              inline: true,
            },
            {
              name: "✨ XP",
              value: `+${result.xp}`,
              inline: true,
            },
            {
              name: "⭐ Level",
              value: `${player.level}`,
              inline: true,
            },
          );

        await interaction.editReply({
          embeds: [embed],
        });

        return;
      }

      if (subcommand === "leaderboard") {
        const leaderboard =
          await getLeaderboard(10);

        if (leaderboard.length === 0) {
          await interaction.editReply(
            "🏆 No players yet. Start playing!",
          );

          return;
        }

        const lines = leaderboard.map(
          (player, index) =>
            `**${index + 1}.** ${player.username} — ⭐ Lv.${player.level} · ✨ ${player.xp} XP · 🪙 ${player.coins}`,
        );

        const embed = new EmbedBuilder()
          .setTitle(
            "🏆 AshenAI Game Leaderboard",
          )
          .setDescription(
            lines.join("\n"),
          );

        await interaction.editReply({
          embeds: [embed],
        });

        return;
      }

      if (subcommand === "adventure") {
        const { adventure } = await import("../games/adventures");
        const player = await getPlayer(
          interaction.user.id,
          interaction.user.username,
        );

        const result = adventure(player);
        await updatePlayer(player);

        const embed = new EmbedBuilder()
          .setTitle(`${result.encounter.emoji} Adventure`)
          .setDescription(result.narrative)
          .addFields(
            { name: "🪙 Coins", value: `${result.coins >= 0 ? "+" : ""}${result.coins}`, inline: true },
            { name: "✨ XP", value: `+${result.xp}`, inline: true },
            { name: "❤️ HP", value: `${player.hp}/${player.maxHp}`, inline: true },
          );

        await interaction.editReply({ embeds: [embed] });
        return;
      }

      if (subcommand === "quests") {
        const { getActiveQuests, getCompletedUnclaimedQuests } = await import("../games/quests");
        const player = await getPlayer(
          interaction.user.id,
          interaction.user.username,
        );

        const active = getActiveQuests(player);
        const unclaimed = getCompletedUnclaimedQuests(player);

        if (active.length === 0 && unclaimed.length === 0) {
          await interaction.editReply("📜 No active quests. Use /game adventure to progress!");
          return;
        }

        const lines: string[] = [];

        if (unclaimed.length > 0) {
          lines.push("**✅ Unclaimed Rewards:**");
          for (const q of unclaimed.slice(0, 5)) {
            lines.push(`• ${q.name} — +${q.rewardXp} XP, +${q.rewardCoins} coins`);
          }
          lines.push("");
        }

        lines.push("**📜 Active Quests:**");
        for (const q of active.slice(0, 10)) {
          const progress = `${q.progress}/${q.target}`;
          const bar = q.completed ? "✅" : "🔄";
          lines.push(`${bar} ${q.name} — ${progress}`);
        }

        const embed = new EmbedBuilder()
          .setTitle("📜 Your Quests")
          .setDescription(lines.join("\n"));

        await interaction.editReply({ embeds: [embed] });
        return;
      }

      if (subcommand === "pets") {
        const { getPlayerPets, getPet, getActivePet } = await import("../games/pets");
        const player = await getPlayer(
          interaction.user.id,
          interaction.user.username,
        );

        const pets = getPlayerPets(player);
        const active = getActivePet(player);

        if (pets.length === 0) {
          await interaction.editReply("🐾 You don't have any pets yet!");
          return;
        }

        const lines = pets.map((p) => {
          const def = getPet(p.petId);
          const isActive = p.petId === active?.petId;
          return `${isActive ? "⭐" : "  "} ${def?.emoji ?? "🐾"} **${def?.name ?? p.petId}** — Lv.${p.level} ${p.evolved ? "✨Evolved" : ""}`;
        });

        const embed = new EmbedBuilder()
          .setTitle("🐾 Your Pets")
          .setDescription(lines.join("\n"));

        await interaction.editReply({ embeds: [embed] });
        return;
      }

      if (subcommand === "pet") {
        const { getPlayerPets, getPet, getActivePet, setActivePet } = await import("../games/pets");
        const action = interaction.options.getString("action") ?? "active";
        const petId = interaction.options.getString("pet_id");

        const player = await getPlayer(
          interaction.user.id,
          interaction.user.username,
        );

        if (action === "active") {
          const active = getActivePet(player);
          if (!active) {
            await interaction.editReply("🐾 You don't have an active pet!");
            return;
          }
          const def = getPet(active.petId);
          const embed = new EmbedBuilder()
            .setTitle(`${def?.emoji ?? "🐾"} Active Pet`)
            .setDescription(`**${def?.name ?? active.petId}**\nLevel: ${active.level}\n${def?.description ?? ""}`);
          await interaction.editReply({ embeds: [embed] });
          return;
        }

        if (action === "all") {
          const pets = getPlayerPets(player);
          if (pets.length === 0) {
            await interaction.editReply("🐾 You don't have any pets!");
            return;
          }
          const lines = pets.map((p) => {
            const def = getPet(p.petId);
            return `${def?.emoji ?? "🐾"} **${def?.name ?? p.petId}** — Lv.${p.level}`;
          });
          await interaction.editReply(lines.join("\n"));
          return;
        }

        if (action === "set") {
          if (!petId) {
            await interaction.editReply("🐾 Provide a pet_id to set as active!");
            return;
          }
          try {
            const pet = setActivePet(player, petId);
            const def = getPet(pet.petId);
            await updatePlayer(player);
            await interaction.editReply(`${def?.emoji ?? "🐾"} **${def?.name ?? pet.petId}** is now your active pet!`);
          } catch (error) {
            await interaction.editReply(`❌ Failed to set pet. The issue has been logged.`);
          }
          return;
        }

        await interaction.editReply("❌ Invalid pet action.");
        return;
      }

      if (subcommand === "titles") {
        const { getTitleInfo, setActiveTitle } = await import("../games/quests");
        const player = await getPlayer(
          interaction.user.id,
          interaction.user.username,
        );

        if (player.titles.length === 0) {
          await interaction.editReply("🏅 You don't have any titles yet!");
          return;
        }

        const lines = player.titles.map((t) => {
          const info = getTitleInfo(t);
          const isActive = player.activeTitle === t;
          return `${isActive ? "⭐" : "  "} ${info?.emoji ?? "🏅"} **${info?.name ?? t}** — ${info?.description ?? ""}`;
        });

        const embed = new EmbedBuilder()
          .setTitle("🏅 Your Titles")
          .setDescription(lines.join("\n"))
          .setFooter({ text: "Use /game titles to view. Use the titles system to set active title." });

        await interaction.editReply({ embeds: [embed] });
        return;
      }

      if (subcommand === "dungeon") {
        const { DUNGEONS, createDungeon, addDungeonMember, startDungeon, performDungeonAction, distributeDungeonReward } = await import("../games/dungeons");
        const { createDungeonState, getDungeonState, updateDungeonState, findActiveDungeonForPlayer, getCompletedDungeonForPlayer } = await import("../games/dungeonStore");
        const action = interaction.options.getString("action") ?? "list";
        const dungeonId = interaction.options.getString("dungeon_id");

        const player = await getPlayer(
          interaction.user.id,
          interaction.user.username,
        );

        if (action === "list") {
          const lines = DUNGEONS.map((d) => {
            const canEnter = player.level >= d.minLevel;
            return `${canEnter ? "✅" : "🔒"} ${d.emoji} **${d.name}** — Min Lv.${d.minLevel} | Boss: ${d.bossName}`;
          });

          const embed = new EmbedBuilder()
            .setTitle("🏰 Dungeons")
            .setDescription(lines.join("\n"));

          await interaction.editReply({ embeds: [embed] });
          return;
        }

        if (action === "create") {
          if (!dungeonId) {
            await interaction.editReply("❌ Provide a dungeon_id to create a party!");
            return;
          }
          try {
            const state = createDungeon(dungeonId, player);
            await createDungeonState(state);
            await interaction.editReply(`🏰 Party created for **${DUNGEONS.find((d) => d.id === dungeonId)?.name ?? dungeonId}**! Party ID: \`${state.id}\``);
          } catch (error) {
            await interaction.editReply(`❌ Failed to create party. The issue has been logged.`);
          }
          return;
        }

        if (action === "start") {
          const active = await findActiveDungeonForPlayer(player.userId);
          if (!active) {
            await interaction.editReply("❌ You don't have an active dungeon party!");
            return;
          }
          try {
            startDungeon(active);
            await updateDungeonState(active);
            await interaction.editReply("🏰 Dungeon started! Use /game dungeon attack to fight!");
          } catch (error) {
            await interaction.editReply(`❌ Failed to start dungeon. The issue has been logged.`);
          }
          return;
        }

        if (["attack", "defend", "ability", "flee"].includes(action)) {
          const active = await findActiveDungeonForPlayer(player.userId);
          if (!active) {
            await interaction.editReply("❌ You don't have an active dungeon!");
            return;
          }
          try {
            const result = performDungeonAction(active, player, action as any);
            await updatePlayer(player);
            await updateDungeonState(active);

            const embed = new EmbedBuilder()
              .setTitle("🏰 Dungeon Action")
              .setDescription(
                `**${action.toUpperCase()}**\n` +
                `Damage Dealt: ${result.damageDealt}\n` +
                `Damage Taken: ${result.damageTaken}\n` +
                `Boss HP: ${result.bossHp}`
              );

            if (result.defeated) {
              embed.setDescription("🏰 **DUNGEON COMPLETE!** Use /game dungeon reward to claim your loot!");
            } else if (result.playerDefeated) {
              embed.setDescription("💀 You were defeated! The dungeon has failed.");
            }

            await interaction.editReply({ embeds: [embed] });
          } catch (error) {
            await interaction.editReply(`❌ Failed. The issue has been logged.`);
          }
          return;
        }

        if (action === "reward") {
          const completed = await getCompletedDungeonForPlayer(player.userId);
          if (!completed) {
            await interaction.editReply("❌ No completed dungeon to claim reward from!");
            return;
          }
          try {
            const reward = distributeDungeonReward(completed, player);
            await updateDungeonState(completed);
            await updatePlayer(player);

            const embed = new EmbedBuilder()
              .setTitle("🏰 Dungeon Reward")
              .setDescription(
                `💰 +${reward.coins} coins\n✨ +${reward.xp} XP\n🎁 Loot: **${reward.loot.name}**`
              );

            await interaction.editReply({ embeds: [embed] });
          } catch (error) {
            await interaction.editReply(`❌ Failed to claim reward. The issue has been logged.`);
          }
          return;
        }

        await interaction.editReply("❌ Invalid dungeon action.");
        return;
      }

      if (subcommand === "worldboss") {
        const { attackWorldBoss, isWorldBossActive, getWorldBossLeaderboard } = await import("../games/worldBosses");
        const { getActiveWorldBoss } = await import("../games/worldBossStore");

        const state = await getActiveWorldBoss();
        if (!state || !isWorldBossActive(state)) {
          await interaction.editReply("🌍 No active world boss! Wait for one to spawn.");
          return;
        }

        const player = await getPlayer(
          interaction.user.id,
          interaction.user.username,
        );

        try {
          const result = attackWorldBoss(state, player);
          await updatePlayer(player);
          const { saveWorldBoss } = await import("../games/worldBossStore");
          await saveWorldBoss(state);

          const embed = new EmbedBuilder()
            .setTitle("🌍 World Boss Attack")
            .setDescription(
              `⚔️ Damage: **${result.damage}**\n` +
              `❤️ Boss HP: **${result.remainingHp.toLocaleString()}**\n` +
              `📊 Your Rank: **#${result.rank}**\n` +
              `📊 Total Damage: **${result.totalDamage.toLocaleString()}**`
            );

          if (result.defeated) {
            embed.setDescription("🏆 **WORLD BOSS DEFEATED!** Use the rewards!");
          }

          await interaction.editReply({ embeds: [embed] });
        } catch (error) {
          await interaction.editReply(`❌ Cannot attack world boss. The issue has been logged.`);
        }
        return;
      }

      if (subcommand === "casino") {
        const { playCasino } = await import("../games/casino");
        const game = interaction.options.getString("game") as any;
        const wager = interaction.options.getInteger("wager") ?? 10;

        const player = await getPlayer(
          interaction.user.id,
          interaction.user.username,
        );

        try {
          const result = await playCasino(player, game, wager);
          await updatePlayer(player);

          const embed = new EmbedBuilder()
            .setTitle(`🎰 ${game.charAt(0).toUpperCase() + game.slice(1)}`)
            .setDescription(result.message)
            .addFields(
              { name: "🪙 Wager", value: `${result.wager}`, inline: true },
              { name: "💰 Payout", value: `${result.payout}`, inline: true },
              { name: "📊 Net", value: `${result.net >= 0 ? "+" : ""}${result.net}`, inline: true },
              { name: "🪙 Balance", value: `${player.coins}`, inline: true },
            );

          if (result.jackpotHit) {
            embed.addFields({ name: "🔥 JACKPOT!", value: "You hit the jackpot!" });
          }

          await interaction.editReply({ embeds: [embed] });
        } catch (error) {
          await interaction.editReply(`❌ Casino error. The issue has been logged.`);
        }
        return;
      }

      await interaction.editReply(
        "❌ Unknown game command.",
      );
    },
  };
}
