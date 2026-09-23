"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var game_exports = {};
__export(game_exports, {
  createGameCommand: () => createGameCommand
});
module.exports = __toCommonJS(game_exports);
var import_discord = require("discord.js");
var import_store = require("../games/store");
var import_rewards = require("../games/rewards");
var import_dice = require("../games/games/dice");
var import_coinflip = require("../games/games/coinflip");
var import_shop = require("../games/shop");
var import_daily = require("../games/daily");
var import_rps = require("../games/games/rps");
var import_duel = require("../games/games/duel");
var import_chaos = require("../games/games/chaos");
var import_hunt = require("../games/games/hunt");
var import_loot = require("../games/loot");
function createGameCommand() {
  const data = new import_discord.SlashCommandBuilder().setName("game").setDescription("\u{1F3AE} Play AshenAI games").addSubcommand(
    (subcommand) => subcommand.setName("dice").setDescription("\u{1F3B2} Roll a dice").addIntegerOption(
      (option) => option.setName("sides").setDescription("Number of sides").setMinValue(2).setMaxValue(100).setRequired(false)
    )
  ).addSubcommand(
    (subcommand) => subcommand.setName("coin").setDescription("\u{1FA99} Flip a coin")
  ).addSubcommand(
    (subcommand) => subcommand.setName("rps").setDescription("\u{1FAA8} Rock Paper Scissors").addStringOption(
      (option) => option.setName("choice").setDescription("Choose your move").setRequired(true).addChoices(
        {
          name: "\u{1FAA8} Rock",
          value: "rock"
        },
        {
          name: "\u{1F4C4} Paper",
          value: "paper"
        },
        {
          name: "\u2702\uFE0F Scissors",
          value: "scissors"
        }
      )
    )
  ).addSubcommand(
    (subcommand) => subcommand.setName("profile").setDescription("\u{1F464} View your game profile")
  ).addSubcommand(
    (subcommand) => subcommand.setName("stats").setDescription("\u{1F4CA} View your detailed game statistics")
  ).addSubcommand(
    (subcommand) => subcommand.setName("achievements").setDescription(
      "\u{1F3C5} View all AshenAI game achievements"
    )
  ).addSubcommand(
    (subcommand) => subcommand.setName("daily").setDescription(
      "\u{1F381} Claim your daily reward"
    )
  ).addSubcommand(
    (subcommand) => subcommand.setName("duel").setDescription("\u2694\uFE0F Challenge another player").addUserOption(
      (option) => option.setName("opponent").setDescription("Choose your opponent").setRequired(true)
    )
  ).addSubcommand(
    (subcommand) => subcommand.setName("leaderboard").setDescription(
      "\u{1F3C6} View the game leaderboard"
    )
  ).addSubcommand(
    (subcommand) => subcommand.setName("chaos").setDescription("\u{1F32A}\uFE0F Trigger a random AshenAI chaos event")
  ).addSubcommand(
    (subcommand) => subcommand.setName("hunt").setDescription("\u{1F3AF} Go hunting for coins and XP")
  ).addSubcommand(
    (subcommand) => subcommand.setName("inventory").setDescription("\u{1F392} View your AshenAI inventory")
  ).addSubcommand(
    (subcommand) => subcommand.setName("adventure").setDescription("\u{1F5FA}\uFE0F Go on an adventure")
  ).addSubcommand(
    (subcommand) => subcommand.setName("quests").setDescription("\u{1F4DC} View your active quests")
  ).addSubcommand(
    (subcommand) => subcommand.setName("pets").setDescription("\u{1F43E} View your pets")
  ).addSubcommand(
    (subcommand) => subcommand.setName("pet").setDescription("\u{1F43E} Manage your active pet").addStringOption(
      (option) => option.setName("action").setDescription("Pet action").setRequired(true).addChoices(
        { name: "View Active", value: "active" },
        { name: "View All", value: "all" },
        { name: "Set Active", value: "set" }
      )
    ).addStringOption(
      (option) => option.setName("pet_id").setDescription("Pet ID (for set action)").setRequired(false)
    )
  ).addSubcommand(
    (subcommand) => subcommand.setName("titles").setDescription("\u{1F3C5} View your titles and set active title")
  ).addSubcommand(
    (subcommand) => subcommand.setName("dungeon").setDescription("\u{1F3F0} Enter a dungeon").addStringOption(
      (option) => option.setName("action").setDescription("Dungeon action").setRequired(true).addChoices(
        { name: "List Dungeons", value: "list" },
        { name: "Create Party", value: "create" },
        { name: "Join Party", value: "join" },
        { name: "Start Dungeon", value: "start" },
        { name: "Attack", value: "attack" },
        { name: "Defend", value: "defend" },
        { name: "Ability", value: "ability" },
        { name: "Flee", value: "flee" },
        { name: "Claim Reward", value: "reward" }
      )
    ).addStringOption(
      (option) => option.setName("dungeon_id").setDescription("Dungeon ID").setRequired(false)
    )
  ).addSubcommand(
    (subcommand) => subcommand.setName("worldboss").setDescription("\u{1F30D} Attack the world boss")
  ).addSubcommand(
    (subcommand) => subcommand.setName("casino").setDescription("\u{1F3B0} Play a casino game").addStringOption(
      (option) => option.setName("game").setDescription("Casino game").setRequired(true).addChoices(
        { name: "\u{1FA99} Coinflip", value: "coinflip" },
        { name: "\u{1F3B2} Dice", value: "dice" },
        { name: "\u{1F3B0} Slots", value: "slots" },
        { name: "\u{1F0CF} Blackjack", value: "blackjack" },
        { name: "\u{1F48E} Crystal", value: "crystal" },
        { name: "\u{1F4E6} Mystery Chest", value: "chest" },
        { name: "\u{1F525} Jackpot", value: "jackpot" }
      )
    ).addIntegerOption(
      (option) => option.setName("wager").setDescription("Amount to wager").setMinValue(10).setMaxValue(1e5).setRequired(true)
    )
  );
  data.addSubcommand(
    (subcommand) => subcommand.setName("shop").setDescription("\u{1F6D2} View the AshenAI coin shop")
  ).addSubcommand(
    (subcommand) => subcommand.setName("buy").setDescription("\u{1F6CD}\uFE0F Buy an item from the shop").addStringOption(
      (option) => option.setName("item").setDescription("Choose an item").setRequired(true).addChoices(
        ...Object.entries(import_shop.SHOP_ITEMS).map(
          ([value, item]) => ({
            name: `${item.name} \u2014 ${item.price} coins`,
            value
          })
        )
      )
    )
  ).addSubcommand(
    (subcommand) => subcommand.setName("use").setDescription("\u{1F9EA} Use a consumable item").addStringOption(
      (option) => option.setName("item").setDescription("Choose an item to use").setRequired(true).addChoices(
        {
          name: "\u{1F9EA} XP Boost",
          value: "xp_boost"
        },
        {
          name: "\u{1F340} Lucky Token",
          value: "lucky_token"
        }
      )
    )
  );
  return {
    data,
    async execute(interaction) {
      const subcommand = interaction.options.getSubcommand();
      if (subcommand === "dice") {
        const sides = interaction.options.getInteger(
          "sides"
        ) ?? 6;
        const result = (0, import_dice.rollDice)(sides);
        const player = await (0, import_store.getPlayer)(
          interaction.user.id,
          interaction.user.username
        );
        const reward = await (0, import_rewards.awardResult)(
          player,
          "draw"
        );
        const embed = new import_discord.EmbedBuilder().setTitle("\u{1F3B2} AshenAI Dice").setDescription(
          `**${interaction.user.username}** rolled **${result}** on a d${sides}!`
        ).addFields(
          {
            name: "\u{1FA99} Coins",
            value: `+${reward.coins}`,
            inline: true
          },
          {
            name: "\u2728 XP",
            value: `+${reward.xp}`,
            inline: true
          },
          {
            name: "\u2B50 Level",
            value: `${player.level}`,
            inline: true
          }
        );
        if (reward.levelUp) {
          embed.addFields({
            name: "\u{1F389} Level Up!",
            value: `You reached **Level ${player.level}**!`
          });
        }
        if (reward.newAchievements.length > 0) {
          embed.addFields({
            name: "\u{1F3C5} Achievement Unlocked!",
            value: reward.newAchievements.map(
              (id) => `\u{1F3C6} **${import_rewards.ACHIEVEMENTS[id] ?? id}**`
            ).join("\n")
          });
        }
        await interaction.editReply({
          embeds: [embed]
        });
        return;
      }
      if (subcommand === "coin") {
        const result = (0, import_coinflip.flipCoin)();
        const player = await (0, import_store.getPlayer)(
          interaction.user.id,
          interaction.user.username
        );
        const reward = await (0, import_rewards.awardResult)(
          player,
          "draw"
        );
        const embed = new import_discord.EmbedBuilder().setTitle("\u{1FA99} AshenAI Coin Flip").setDescription(
          `The coin landed on **${result}**!`
        ).addFields(
          {
            name: "\u{1FA99} Coins",
            value: `+${reward.coins}`,
            inline: true
          },
          {
            name: "\u2728 XP",
            value: `+${reward.xp}`,
            inline: true
          }
        );
        if (reward.newAchievements.length > 0) {
          embed.addFields({
            name: "\u{1F3C5} Achievement Unlocked!",
            value: reward.newAchievements.map(
              (id) => `\u{1F3C6} **${import_rewards.ACHIEVEMENTS[id] ?? id}**`
            ).join("\n")
          });
        }
        await interaction.editReply({
          embeds: [embed]
        });
        return;
      }
      if (subcommand === "rps") {
        const choice = interaction.options.getString(
          "choice",
          true
        );
        const botChoice = (0, import_rps.randomRPS)();
        const result = (0, import_rps.playRPS)(
          choice,
          botChoice
        );
        const player = await (0, import_store.getPlayer)(
          interaction.user.id,
          interaction.user.username
        );
        const reward = await (0, import_rewards.awardResult)(
          player,
          result
        );
        const names = {
          rock: "\u{1FAA8} Rock",
          paper: "\u{1F4C4} Paper",
          scissors: "\u2702\uFE0F Scissors"
        };
        const resultText = {
          win: "\u{1F389} You win!",
          loss: "\u{1F480} You lose!",
          draw: "\u{1F91D} Draw!"
        };
        const embed = new import_discord.EmbedBuilder().setTitle(
          "\u{1FAA8}\u{1F4C4}\u2702\uFE0F Rock Paper Scissors"
        ).setDescription(
          `**You:** ${names[choice]}
**AshenAI:** ${names[botChoice]}

## ${resultText[result]}`
        ).addFields(
          {
            name: "\u{1FA99} Coins",
            value: `+${reward.coins}`,
            inline: true
          },
          {
            name: "\u2728 XP",
            value: `+${reward.xp}`,
            inline: true
          },
          {
            name: "\u2B50 Level",
            value: `${player.level}`,
            inline: true
          }
        );
        if (reward.levelUp) {
          embed.addFields({
            name: "\u{1F389} Level Up!",
            value: `You reached **Level ${player.level}**!`
          });
        }
        if (reward.newAchievements.length > 0) {
          embed.addFields({
            name: "\u{1F3C5} Achievement Unlocked!",
            value: reward.newAchievements.map(
              (id) => `\u{1F3C6} **${import_rewards.ACHIEVEMENTS[id] ?? id}**`
            ).join("\n")
          });
        }
        await interaction.editReply({
          embeds: [embed]
        });
        return;
      }
      if (subcommand === "stats") {
        const player = await (0, import_store.getPlayer)(
          interaction.user.id,
          interaction.user.username
        );
        const inventoryCount = Object.values(
          player.inventory ?? {}
        ).reduce(
          (total, amount) => total + amount,
          0
        );
        const winRate = player.gamesPlayed > 0 ? (player.wins / player.gamesPlayed * 100).toFixed(1) : "0.0";
        const duelTotal = player.duelWins + player.duelLosses;
        const duelWinRate = duelTotal > 0 ? (player.duelWins / duelTotal * 100).toFixed(1) : "0.0";
        const lootSummary = Object.entries(import_loot.LOOT_ITEMS).map(([id, item]) => {
          const amount = player.inventory?.[id] ?? 0;
          return `${item.name}: **${amount}**`;
        }).join("\n");
        const embed = new import_discord.EmbedBuilder().setTitle(
          `\u{1F4CA} ${player.username}'s AshenAI Statistics`
        ).addFields(
          {
            name: "\u{1F3AE} Overall Games",
            value: `Games: **${player.gamesPlayed}**
\u{1F3C6} Wins: **${player.wins}**
\u{1F480} Losses: **${player.losses}**
\u{1F91D} Draws: **${player.draws}**
\u{1F4C8} Win Rate: **${winRate}%**`,
            inline: true
          },
          {
            name: "\u2694\uFE0F Duel Statistics",
            value: `\u{1F3C6} Duel Wins: **${player.duelWins}**
\u{1F480} Duel Losses: **${player.duelLosses}**
\u{1F4C8} Duel Win Rate: **${duelWinRate}%**`,
            inline: true
          },
          {
            name: "\u{1F3AF} Hunt Statistics",
            value: `\u{1F3AF} Hunts: **${player.huntsCompleted ?? 0}**
\u{1F525} Hunt Streak: **${player.huntStreak ?? 0}**
\u{1F451} Best Hunt Streak: **${player.bestHuntStreak ?? 0}**`,
            inline: true
          },
          {
            name: "\u{1F381} Daily Statistics",
            value: `\u{1F525} Daily Streak: **${player.dailyStreak ?? 0}**
\u{1F451} Best Daily Streak: **${player.bestDailyStreak ?? 0}**`,
            inline: true
          },
          {
            name: "\u{1F4B0} Economy",
            value: `\u{1FA99} Coins: **${player.coins}**
\u2728 XP: **${player.xp}**
\u2B50 Level: **${player.level}**`,
            inline: true
          },
          {
            name: "\u{1F392} Inventory",
            value: `\u{1F4E6} Items: **${inventoryCount}**`,
            inline: true
          },
          {
            name: "\u{1F48E} Loot Collection",
            value: lootSummary,
            inline: false
          }
        ).setFooter({
          text: "AshenAI \u2022 Keep playing to improve your statistics!"
        });
        await interaction.editReply({
          embeds: [embed]
        });
        return;
      }
      if (subcommand === "profile") {
        const player = await (0, import_store.getPlayer)(
          interaction.user.id,
          interaction.user.username
        );
        const inventoryCount = Object.values(
          player.inventory ?? {}
        ).reduce(
          (total, amount) => total + amount,
          0
        );
        const achievements = player.achievements.length > 0 ? player.achievements.map(
          (id) => `\u2022 ${import_rewards.ACHIEVEMENTS[id] ?? id}`
        ).join("\n") : "None yet";
        const embed = new import_discord.EmbedBuilder().setTitle(
          `\u{1F3AE} ${player.username}'s AshenAI Profile`
        ).addFields(
          {
            name: "\u2B50 Level",
            value: `${player.level}`,
            inline: true
          },
          {
            name: "\u2728 XP",
            value: `${player.xp}`,
            inline: true
          },
          {
            name: "\u{1FA99} Coins",
            value: `${player.coins}`,
            inline: true
          },
          {
            name: "\u{1F3C6} Wins",
            value: `${player.wins}`,
            inline: true
          },
          {
            name: "\u{1F480} Losses",
            value: `${player.losses}`,
            inline: true
          },
          {
            name: "\u{1F91D} Draws",
            value: `${player.draws}`,
            inline: true
          },
          {
            name: "\u{1F3AE} Games",
            value: `${player.gamesPlayed}`,
            inline: true
          },
          {
            name: "\u{1F525} Streak",
            value: `${player.streak}`,
            inline: true
          },
          {
            name: "\u{1F451} Best Streak",
            value: `${player.bestStreak}`,
            inline: true
          },
          {
            name: "\u{1F525} Daily Streak",
            value: `${player.dailyStreak ?? 0} day(s)`,
            inline: true
          },
          {
            name: "\u{1F3C6} Best Daily Streak",
            value: `${player.bestDailyStreak ?? 0} day(s)`,
            inline: true
          },
          {
            name: "\u{1F3C5} Achievements",
            value: achievements
          }
        );
        await interaction.editReply({
          embeds: [embed]
        });
        return;
      }
      if (subcommand === "achievements") {
        const player = await (0, import_store.getPlayer)(
          interaction.user.id,
          interaction.user.username
        );
        const lines = Object.entries(
          import_rewards.ACHIEVEMENTS
        ).map(([id, name]) => {
          const unlocked = player.achievements.includes(id);
          return unlocked ? `\u2705 ${name}` : `\u{1F512} ${name}`;
        });
        const embed = new import_discord.EmbedBuilder().setTitle(
          "\u{1F3C5} AshenAI Achievements"
        ).setDescription(
          lines.join("\n")
        ).setFooter({
          text: `${player.achievements.length}/${Object.keys(import_rewards.ACHIEVEMENTS).length} unlocked`
        });
        await interaction.editReply({
          embeds: [embed]
        });
        return;
      }
      if (subcommand === "daily") {
        const reward = await (0, import_daily.claimDaily)(
          interaction.user.id,
          interaction.user.username
        );
        const player = await (0, import_store.getPlayer)(
          interaction.user.id,
          interaction.user.username
        );
        if (!reward.claimed) {
          const remaining = Math.max(
            0,
            (reward.nextClaimAt ?? Date.now()) - Date.now()
          );
          const hours = Math.ceil(
            remaining / (60 * 60 * 1e3)
          );
          await interaction.editReply(
            `\u23F3 You already claimed your daily reward. Try again in about **${hours}h**.`
          );
          return;
        }
        const embed = new import_discord.EmbedBuilder().setTitle("\u{1F381} AshenAI Daily Reward").setDescription(
          "Your daily reward has been claimed!"
        ).addFields(
          {
            name: "\u{1FA99} Coins",
            value: `+${reward.coins}`,
            inline: true
          },
          {
            name: "\u2728 XP",
            value: `+${reward.xp}`,
            inline: true
          },
          {
            name: "\u2B50 Level",
            value: `${reward.level}`,
            inline: true
          },
          {
            name: "\u{1F525} Daily Streak",
            value: `${player.dailyStreak ?? 1} day(s)`,
            inline: true
          }
        );
        if (reward.levelUp) {
          embed.addFields({
            name: "\u{1F389} Level Up!",
            value: `You reached **Level ${reward.level}**!`
          });
        }
        if (reward.newAchievements.length > 0) {
          embed.addFields({
            name: "\u{1F3C5} Achievement Unlocked!",
            value: reward.newAchievements.map(
              (id) => `\u{1F3C6} **${import_rewards.ACHIEVEMENTS[id] ?? id}**`
            ).join("\n")
          });
        }
        await interaction.editReply({
          embeds: [embed]
        });
        return;
      }
      if (subcommand === "duel") {
        const opponent = interaction.options.getUser(
          "opponent",
          true
        );
        if (opponent.id === interaction.user.id) {
          await interaction.editReply(
            "\u274C You cannot duel yourself."
          );
          return;
        }
        if (opponent.bot) {
          await interaction.editReply(
            "\u274C You cannot duel a bot."
          );
          return;
        }
        const player = await (0, import_store.getPlayer)(
          interaction.user.id,
          interaction.user.username
        );
        const enemy = await (0, import_store.getPlayer)(
          opponent.id,
          opponent.username
        );
        const result = (0, import_duel.simulateDuel)(
          player,
          enemy
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
        const { updatePlayer: updatePlayer2 } = await import("../games/store");
        await updatePlayer2(player);
        await updatePlayer2(enemy);
        const winner = result.winner;
        const loser = result.loser;
        await interaction.editReply(
          `\u2694\uFE0F **ASHEN DUEL**

**${player.username}** vs **${enemy.username}**

\u{1F3C6} **${winner.username} wins!**
\u{1F480} ${loser.username} has been defeated.

\u2694\uFE0F Turns: **${result.turns}**
\u{1FA99} Winner: **+50 coins**
\u2728 Winner: **+75 XP**`
        );
        return;
      }
      if (subcommand === "buy") {
        const itemId = interaction.options.getString(
          "item",
          true
        );
        const player = await (0, import_store.getPlayer)(
          interaction.user.id,
          interaction.user.username
        );
        const result = await (0, import_shop.buyItem)(
          player,
          itemId
        );
        await interaction.editReply(
          result.success ? `${result.message}

\u{1FA99} Remaining coins: **${player.coins}**` : result.message
        );
        return;
      }
      if (subcommand === "use") {
        const itemId = interaction.options.getString(
          "item",
          true
        );
        const player = await (0, import_store.getPlayer)(
          interaction.user.id,
          interaction.user.username
        );
        if (!player.inventory) {
          player.inventory = {};
        }
        const amount = player.inventory[itemId] ?? 0;
        if (amount <= 0) {
          await interaction.editReply(
            `\u274C You don't have **${itemId}** in your inventory.`
          );
          return;
        }
        if (itemId === "xp_boost") {
          if (player.xpBoostActive) {
            await interaction.editReply(
              "\u{1F9EA} Your XP Boost is already active. Use it on your next hunt."
            );
            return;
          }
          player.inventory.xp_boost = amount - 1;
          if (player.inventory.xp_boost <= 0) {
            delete player.inventory.xp_boost;
          }
          player.xpBoostActive = true;
          await (0, import_store.updatePlayer)(player);
          await interaction.editReply(
            "\u{1F9EA} **XP Boost activated!** Your next hunt will give **2\xD7 XP**."
          );
          return;
        }
        if (itemId === "lucky_token") {
          if (player.luckyTokenActive) {
            await interaction.editReply(
              "\u{1F340} Your Lucky Token is already active. Use it on your next hunt."
            );
            return;
          }
          player.inventory.lucky_token = amount - 1;
          if (player.inventory.lucky_token <= 0) {
            delete player.inventory.lucky_token;
          }
          player.luckyTokenActive = true;
          await (0, import_store.updatePlayer)(player);
          await interaction.editReply(
            "\u{1F340} **Lucky Token activated!** Your next hunt has an improved chance of finding rare loot."
          );
          return;
        }
        if (itemId === "vip_badge") {
          await interaction.editReply(
            "\u{1F451} The VIP Badge is permanent and cannot be consumed."
          );
          return;
        }
        await interaction.editReply(
          "\u274C That item cannot be used."
        );
        return;
      }
      if (subcommand === "shop") {
        const player = await (0, import_store.getPlayer)(
          interaction.user.id,
          interaction.user.username
        );
        const lines = Object.entries(import_shop.SHOP_ITEMS).map(
          ([itemId, item]) => {
            const owned = player.inventory?.[itemId] ?? 0;
            const canAfford = player.coins >= item.price;
            let status;
            if (itemId === "vip_badge" && owned > 0) {
              status = "\u{1F451} **OWNED \u2014 Permanent**";
            } else if (canAfford) {
              status = "\u2705 **You can afford this**";
            } else {
              status = `\u{1F512} Need **${item.price - player.coins} more coins**`;
            }
            return [
              `### ${item.name}`,
              `\u{1FA99} **${item.price} coins**`,
              item.description,
              `\u{1F4E6} Owned: **${owned}**`,
              status
            ].join("\n");
          }
        );
        const embed = new import_discord.EmbedBuilder().setTitle("\u{1F6D2} AshenAI Coin Shop").setDescription(lines.join("\n\n")).addFields({
          name: "\u{1FA99} Your Balance",
          value: `**${player.coins} coins**`,
          inline: false
        }).setFooter({
          text: "Use /game buy to purchase an item."
        });
        await interaction.editReply({
          embeds: [embed]
        });
        return;
      }
      if (subcommand === "hunt") {
        const player = await (0, import_store.getPlayer)(
          interaction.user.id,
          interaction.user.username
        );
        let result;
        try {
          result = await (0, import_hunt.hunt)(player);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (message.startsWith("HUNT_COOLDOWN:")) {
            const remainingMs = Number(
              message.split(":")[1]
            );
            const seconds = Math.ceil(
              remainingMs / 1e3
            );
            await interaction.editReply(
              `\u23F3 You are still on a hunt cooldown. Try again in **${seconds}s**.`
            );
            return;
          }
          throw error;
        }
        const rarityLabels = {
          common: "\u26AA Common",
          uncommon: "\u{1F7E2} Uncommon",
          rare: "\u{1F535} Rare",
          legendary: "\u{1F7E1} Legendary",
          danger: "\u{1F534} Danger"
        };
        const embed = new import_discord.EmbedBuilder().setTitle(`\u{1F3AF} AshenAI Hunt \u2014 ${result.title}`).setDescription(
          `**${interaction.user.username}** ${result.description}`
        ).addFields(
          {
            name: "\u2728 Rarity",
            value: rarityLabels[result.rarity] ?? result.rarity,
            inline: true
          },
          {
            name: "\u{1FA99} Coins",
            value: `+${result.coins}`,
            inline: true
          },
          {
            name: "\u2728 XP",
            value: `+${result.xp}`,
            inline: true
          },
          {
            name: "\u{1F525} Hunt Streak",
            value: `${result.streak}`,
            inline: true
          },
          {
            name: "\u{1F3AF} Hunts",
            value: `${result.huntsCompleted}`,
            inline: true
          },
          {
            name: "\u2B50 Level",
            value: `${player.level}`,
            inline: true
          }
        );
        if (result.newAchievements && result.newAchievements.length > 0) {
          embed.addFields({
            name: "\u{1F3C5} Achievement Unlocked!",
            value: result.newAchievements.map(
              (id) => `\u{1F3C6} **${import_rewards.ACHIEVEMENTS[id] ?? id}**`
            ).join("\n")
          });
        }
        embed.setFooter({
          text: "Keep hunting to build your AshenAI fortune."
        });
        await interaction.editReply({
          embeds: [embed]
        });
        return;
      }
      if (subcommand === "inventory") {
        const player = await (0, import_store.getPlayer)(
          interaction.user.id,
          interaction.user.username
        );
        const inventory = (0, import_loot.getInventory)(player);
        const entries = Object.entries(inventory).filter(([, amount]) => amount > 0);
        const lines = entries.map(
          ([itemId, amount]) => {
            const lootItem = import_loot.LOOT_ITEMS[itemId];
            const shopItem = import_shop.SHOP_ITEMS[itemId];
            const item = lootItem ?? shopItem;
            if (item) {
              let typeLabel = "\u{1F381} Hunt Loot";
              if (itemId === "vip_badge") {
                typeLabel = "\u{1F451} Permanent";
              } else if (itemId === "xp_boost" || itemId === "lucky_token") {
                typeLabel = "\u{1F9EA} Consumable";
              }
              return [
                `**${item.name}** \xD7${amount}`,
                `${typeLabel}`,
                item.description
              ].join("\n");
            }
            return `**${itemId}** \xD7${amount}
\u{1F4E6} Unknown Item`;
          }
        );
        const inventoryDescription = lines.length > 0 ? lines.join("\n\n") : "Your inventory is empty. Go hunting or visit `/game shop`!";
        const totalItems = entries.reduce(
          (total, [, amount]) => total + amount,
          0
        );
        const embed = new import_discord.EmbedBuilder().setTitle("\u{1F392} AshenAI Inventory").setDescription(inventoryDescription).addFields({
          name: "\u{1F4E6} Total Items",
          value: `${totalItems}`,
          inline: true
        }).addFields({
          name: "\u{1FA99} Coins",
          value: `${player.coins}`,
          inline: true
        }).setFooter({
          text: "Collect loot by hunting and purchase items from the shop!"
        });
        await interaction.editReply({
          embeds: [embed]
        });
        return;
      }
      if (subcommand === "chaos") {
        const result = (0, import_chaos.randomChaos)();
        const player = await (0, import_store.getPlayer)(
          interaction.user.id,
          interaction.user.username
        );
        player.coins += result.coins;
        player.xp += result.xp;
        await (0, import_store.updatePlayer)(player);
        const embed = new import_discord.EmbedBuilder().setTitle(result.title).setDescription(
          `**${interaction.user.username}** \u2014 ${result.description}`
        ).addFields(
          {
            name: "\u{1FA99} Coins",
            value: `${result.coins >= 0 ? "+" : ""}${result.coins}`,
            inline: true
          },
          {
            name: "\u2728 XP",
            value: `+${result.xp}`,
            inline: true
          },
          {
            name: "\u2B50 Level",
            value: `${player.level}`,
            inline: true
          }
        );
        await interaction.editReply({
          embeds: [embed]
        });
        return;
      }
      if (subcommand === "leaderboard") {
        const leaderboard = await (0, import_store.getLeaderboard)(10);
        if (leaderboard.length === 0) {
          await interaction.editReply(
            "\u{1F3C6} No players yet. Start playing!"
          );
          return;
        }
        const lines = leaderboard.map(
          (player, index) => `**${index + 1}.** ${player.username} \u2014 \u2B50 Lv.${player.level} \xB7 \u2728 ${player.xp} XP \xB7 \u{1FA99} ${player.coins}`
        );
        const embed = new import_discord.EmbedBuilder().setTitle(
          "\u{1F3C6} AshenAI Game Leaderboard"
        ).setDescription(
          lines.join("\n")
        );
        await interaction.editReply({
          embeds: [embed]
        });
        return;
      }
      if (subcommand === "adventure") {
        const { adventure } = await import("../games/adventures");
        const player = await (0, import_store.getPlayer)(
          interaction.user.id,
          interaction.user.username
        );
        const result = adventure(player);
        await (0, import_store.updatePlayer)(player);
        const embed = new import_discord.EmbedBuilder().setTitle(`${result.encounter.emoji} Adventure`).setDescription(result.narrative).addFields(
          { name: "\u{1FA99} Coins", value: `${result.coins >= 0 ? "+" : ""}${result.coins}`, inline: true },
          { name: "\u2728 XP", value: `+${result.xp}`, inline: true },
          { name: "\u2764\uFE0F HP", value: `${player.hp}/${player.maxHp}`, inline: true }
        );
        await interaction.editReply({ embeds: [embed] });
        return;
      }
      if (subcommand === "quests") {
        const { getActiveQuests, getCompletedUnclaimedQuests } = await import("../games/quests");
        const player = await (0, import_store.getPlayer)(
          interaction.user.id,
          interaction.user.username
        );
        const active = getActiveQuests(player);
        const unclaimed = getCompletedUnclaimedQuests(player);
        if (active.length === 0 && unclaimed.length === 0) {
          await interaction.editReply("\u{1F4DC} No active quests. Use /game adventure to progress!");
          return;
        }
        const lines = [];
        if (unclaimed.length > 0) {
          lines.push("**\u2705 Unclaimed Rewards:**");
          for (const q of unclaimed.slice(0, 5)) {
            lines.push(`\u2022 ${q.name} \u2014 +${q.rewardXp} XP, +${q.rewardCoins} coins`);
          }
          lines.push("");
        }
        lines.push("**\u{1F4DC} Active Quests:**");
        for (const q of active.slice(0, 10)) {
          const progress = `${q.progress}/${q.target}`;
          const bar = q.completed ? "\u2705" : "\u{1F504}";
          lines.push(`${bar} ${q.name} \u2014 ${progress}`);
        }
        const embed = new import_discord.EmbedBuilder().setTitle("\u{1F4DC} Your Quests").setDescription(lines.join("\n"));
        await interaction.editReply({ embeds: [embed] });
        return;
      }
      if (subcommand === "pets") {
        const { getPlayerPets, getPet, getActivePet } = await import("../games/pets");
        const player = await (0, import_store.getPlayer)(
          interaction.user.id,
          interaction.user.username
        );
        const pets = getPlayerPets(player);
        const active = getActivePet(player);
        if (pets.length === 0) {
          await interaction.editReply("\u{1F43E} You don't have any pets yet!");
          return;
        }
        const lines = pets.map((p) => {
          const def = getPet(p.petId);
          const isActive = p.petId === active?.petId;
          return `${isActive ? "\u2B50" : "  "} ${def?.emoji ?? "\u{1F43E}"} **${def?.name ?? p.petId}** \u2014 Lv.${p.level} ${p.evolved ? "\u2728Evolved" : ""}`;
        });
        const embed = new import_discord.EmbedBuilder().setTitle("\u{1F43E} Your Pets").setDescription(lines.join("\n"));
        await interaction.editReply({ embeds: [embed] });
        return;
      }
      if (subcommand === "pet") {
        const { getPlayerPets, getPet, getActivePet, setActivePet } = await import("../games/pets");
        const action = interaction.options.getString("action") ?? "active";
        const petId = interaction.options.getString("pet_id");
        const player = await (0, import_store.getPlayer)(
          interaction.user.id,
          interaction.user.username
        );
        if (action === "active") {
          const active = getActivePet(player);
          if (!active) {
            await interaction.editReply("\u{1F43E} You don't have an active pet!");
            return;
          }
          const def = getPet(active.petId);
          const embed = new import_discord.EmbedBuilder().setTitle(`${def?.emoji ?? "\u{1F43E}"} Active Pet`).setDescription(`**${def?.name ?? active.petId}**
Level: ${active.level}
${def?.description ?? ""}`);
          await interaction.editReply({ embeds: [embed] });
          return;
        }
        if (action === "all") {
          const pets = getPlayerPets(player);
          if (pets.length === 0) {
            await interaction.editReply("\u{1F43E} You don't have any pets!");
            return;
          }
          const lines = pets.map((p) => {
            const def = getPet(p.petId);
            return `${def?.emoji ?? "\u{1F43E}"} **${def?.name ?? p.petId}** \u2014 Lv.${p.level}`;
          });
          await interaction.editReply(lines.join("\n"));
          return;
        }
        if (action === "set") {
          if (!petId) {
            await interaction.editReply("\u{1F43E} Provide a pet_id to set as active!");
            return;
          }
          try {
            const pet = setActivePet(player, petId);
            const def = getPet(pet.petId);
            await (0, import_store.updatePlayer)(player);
            await interaction.editReply(`${def?.emoji ?? "\u{1F43E}"} **${def?.name ?? pet.petId}** is now your active pet!`);
          } catch (error) {
            await interaction.editReply(`\u274C Failed to set pet. The issue has been logged.`);
          }
          return;
        }
        await interaction.editReply("\u274C Invalid pet action.");
        return;
      }
      if (subcommand === "titles") {
        const { getTitleInfo, setActiveTitle } = await import("../games/quests");
        const player = await (0, import_store.getPlayer)(
          interaction.user.id,
          interaction.user.username
        );
        if (player.titles.length === 0) {
          await interaction.editReply("\u{1F3C5} You don't have any titles yet!");
          return;
        }
        const lines = player.titles.map((t) => {
          const info = getTitleInfo(t);
          const isActive = player.activeTitle === t;
          return `${isActive ? "\u2B50" : "  "} ${info?.emoji ?? "\u{1F3C5}"} **${info?.name ?? t}** \u2014 ${info?.description ?? ""}`;
        });
        const embed = new import_discord.EmbedBuilder().setTitle("\u{1F3C5} Your Titles").setDescription(lines.join("\n")).setFooter({ text: "Use /game titles to view. Use the titles system to set active title." });
        await interaction.editReply({ embeds: [embed] });
        return;
      }
      if (subcommand === "dungeon") {
        const { DUNGEONS, createDungeon, addDungeonMember, startDungeon, performDungeonAction, distributeDungeonReward } = await import("../games/dungeons");
        const { createDungeonState, getDungeonState, updateDungeonState, findActiveDungeonForPlayer, getCompletedDungeonForPlayer } = await import("../games/dungeonStore");
        const action = interaction.options.getString("action") ?? "list";
        const dungeonId = interaction.options.getString("dungeon_id");
        const player = await (0, import_store.getPlayer)(
          interaction.user.id,
          interaction.user.username
        );
        if (action === "list") {
          const lines = DUNGEONS.map((d) => {
            const canEnter = player.level >= d.minLevel;
            return `${canEnter ? "\u2705" : "\u{1F512}"} ${d.emoji} **${d.name}** \u2014 Min Lv.${d.minLevel} | Boss: ${d.bossName}`;
          });
          const embed = new import_discord.EmbedBuilder().setTitle("\u{1F3F0} Dungeons").setDescription(lines.join("\n"));
          await interaction.editReply({ embeds: [embed] });
          return;
        }
        if (action === "create") {
          if (!dungeonId) {
            await interaction.editReply("\u274C Provide a dungeon_id to create a party!");
            return;
          }
          try {
            const state = createDungeon(dungeonId, player);
            await createDungeonState(state);
            await interaction.editReply(`\u{1F3F0} Party created for **${DUNGEONS.find((d) => d.id === dungeonId)?.name ?? dungeonId}**! Party ID: \`${state.id}\``);
          } catch (error) {
            await interaction.editReply(`\u274C Failed to create party. The issue has been logged.`);
          }
          return;
        }
        if (action === "start") {
          const active = await findActiveDungeonForPlayer(player.userId);
          if (!active) {
            await interaction.editReply("\u274C You don't have an active dungeon party!");
            return;
          }
          try {
            startDungeon(active);
            await updateDungeonState(active);
            await interaction.editReply("\u{1F3F0} Dungeon started! Use /game dungeon attack to fight!");
          } catch (error) {
            await interaction.editReply(`\u274C Failed to start dungeon. The issue has been logged.`);
          }
          return;
        }
        if (["attack", "defend", "ability", "flee"].includes(action)) {
          const active = await findActiveDungeonForPlayer(player.userId);
          if (!active) {
            await interaction.editReply("\u274C You don't have an active dungeon!");
            return;
          }
          try {
            const result = performDungeonAction(active, player, action);
            await (0, import_store.updatePlayer)(player);
            await updateDungeonState(active);
            const embed = new import_discord.EmbedBuilder().setTitle("\u{1F3F0} Dungeon Action").setDescription(
              `**${action.toUpperCase()}**
Damage Dealt: ${result.damageDealt}
Damage Taken: ${result.damageTaken}
Boss HP: ${result.bossHp}`
            );
            if (result.defeated) {
              embed.setDescription("\u{1F3F0} **DUNGEON COMPLETE!** Use /game dungeon reward to claim your loot!");
            } else if (result.playerDefeated) {
              embed.setDescription("\u{1F480} You were defeated! The dungeon has failed.");
            }
            await interaction.editReply({ embeds: [embed] });
          } catch (error) {
            await interaction.editReply(`\u274C Failed. The issue has been logged.`);
          }
          return;
        }
        if (action === "reward") {
          const completed = await getCompletedDungeonForPlayer(player.userId);
          if (!completed) {
            await interaction.editReply("\u274C No completed dungeon to claim reward from!");
            return;
          }
          try {
            const reward = distributeDungeonReward(completed, player);
            await updateDungeonState(completed);
            await (0, import_store.updatePlayer)(player);
            const embed = new import_discord.EmbedBuilder().setTitle("\u{1F3F0} Dungeon Reward").setDescription(
              `\u{1F4B0} +${reward.coins} coins
\u2728 +${reward.xp} XP
\u{1F381} Loot: **${reward.loot.name}**`
            );
            await interaction.editReply({ embeds: [embed] });
          } catch (error) {
            await interaction.editReply(`\u274C Failed to claim reward. The issue has been logged.`);
          }
          return;
        }
        await interaction.editReply("\u274C Invalid dungeon action.");
        return;
      }
      if (subcommand === "worldboss") {
        const { attackWorldBoss, isWorldBossActive, getWorldBossLeaderboard } = await import("../games/worldBosses");
        const { getActiveWorldBoss } = await import("../games/worldBossStore");
        const state = await getActiveWorldBoss();
        if (!state || !isWorldBossActive(state)) {
          await interaction.editReply("\u{1F30D} No active world boss! Wait for one to spawn.");
          return;
        }
        const player = await (0, import_store.getPlayer)(
          interaction.user.id,
          interaction.user.username
        );
        try {
          const result = attackWorldBoss(state, player);
          await (0, import_store.updatePlayer)(player);
          const { saveWorldBoss } = await import("../games/worldBossStore");
          await saveWorldBoss(state);
          const embed = new import_discord.EmbedBuilder().setTitle("\u{1F30D} World Boss Attack").setDescription(
            `\u2694\uFE0F Damage: **${result.damage}**
\u2764\uFE0F Boss HP: **${result.remainingHp.toLocaleString()}**
\u{1F4CA} Your Rank: **#${result.rank}**
\u{1F4CA} Total Damage: **${result.totalDamage.toLocaleString()}**`
          );
          if (result.defeated) {
            embed.setDescription("\u{1F3C6} **WORLD BOSS DEFEATED!** Use the rewards!");
          }
          await interaction.editReply({ embeds: [embed] });
        } catch (error) {
          await interaction.editReply(`\u274C Cannot attack world boss. The issue has been logged.`);
        }
        return;
      }
      if (subcommand === "casino") {
        const { playCasino } = await import("../games/casino");
        const game = interaction.options.getString("game");
        const wager = interaction.options.getInteger("wager") ?? 10;
        const player = await (0, import_store.getPlayer)(
          interaction.user.id,
          interaction.user.username
        );
        try {
          const result = await playCasino(player, game, wager);
          await (0, import_store.updatePlayer)(player);
          const embed = new import_discord.EmbedBuilder().setTitle(`\u{1F3B0} ${game.charAt(0).toUpperCase() + game.slice(1)}`).setDescription(result.message).addFields(
            { name: "\u{1FA99} Wager", value: `${result.wager}`, inline: true },
            { name: "\u{1F4B0} Payout", value: `${result.payout}`, inline: true },
            { name: "\u{1F4CA} Net", value: `${result.net >= 0 ? "+" : ""}${result.net}`, inline: true },
            { name: "\u{1FA99} Balance", value: `${player.coins}`, inline: true }
          );
          if (result.jackpotHit) {
            embed.addFields({ name: "\u{1F525} JACKPOT!", value: "You hit the jackpot!" });
          }
          await interaction.editReply({ embeds: [embed] });
        } catch (error) {
          await interaction.editReply(`\u274C Casino error. The issue has been logged.`);
        }
        return;
      }
      await interaction.editReply(
        "\u274C Unknown game command."
      );
    }
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  createGameCommand
});
