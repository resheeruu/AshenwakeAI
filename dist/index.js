"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
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
var import_config = require("dotenv/config");
var import_env = require("./config/env");
var import_account_store = require("./control/account-store");
var import_discord = require("discord.js");
var import_logger = require("./logger");
var import_manager = require("./agent/manager");
var import_tasks = require("./agent/tasks");
var import_security = require("./security");
var import_env2 = require("./config/env");
var import_guild_config = require("./core/guild-config");
var import_policy = require("./security/policy");
var import_output_guard = require("./security/output-guard");
var import_context = require("./security/context");
var import_adaptive_personality = require("./ai/adaptive-personality");
var import_confirmation_handler = require("./discord/interactions/confirmation-handler");
var import_conversational_agent = require("./discord/conversational-agent");
var import_database = require("./database");
var import_anime_actions = require("./games/anime-actions");
var import_emoji_provisioner = require("./discord/emoji-provisioner");
var import_providers = require("./ai/providers");
var import_router = require("./ai/router");
var import_memory = require("./ai/memory");
var import_user_profile = require("./ai/user-profile");
var import_usage_manager = require("./ai/usage-manager");
var import_system_usage = require("./ai/system-usage");
var import_knowledge = require("./ai/knowledge");
var import_vision = require("./ai/vision");
var import_cases = require("./moderation/cases");
var import_xp_system = require("./community/xp-system");
var import_suggestions = require("./community/suggestions");
var import_events = require("./community/events");
var import_reaction_roles = require("./community/reaction-roles");
var import_preflight = require("./core/preflight");
var import_backup_manager = require("./core/backup-manager");
var import_load_manager = require("./core/load-manager");
var import_resource_profile = require("./core/resource-profile");
var import_handler = require("./commands/handler");
var import_ask = require("./commands/ask");
var import_reset = require("./commands/reset");
var import_help = require("./commands/help");
var import_status = require("./commands/status");
var import_game = require("./commands/game");
var import_blackjack = require("./games/games/blackjack");
var import_mines = require("./games/games/mines");
var import_quickdraw = require("./games/games/quickdraw");
var import_store = require("./games/store");
var import_register = require("./commands/register");
var import_action_router = require("./discord/action-router");
var import_interactive_moderation = require("./discord/interactive-moderation");
var import_action_confirmations = require("./discord/action-confirmations");
var import_server = require("./commands/server");
var import_moderation = require("./commands/moderation");
var import_support = require("./commands/support");
var import_access = require("./commands/access");
var import_prompt = require("./commands/prompt");
var import_personality = require("./commands/personality");
var import_settings = require("./commands/settings");
var import_support2 = require("./support");
var import_server_context = require("./discord/server-context");
var import_server2 = require("./web/server");
var import_internalSupervisor = require("./core/internalSupervisor");
var import_usage_stats = require("./analytics/usage-stats");
var import_discord_health = require("./core/discord-health");
var import_update_manager = require("./core/update-manager");
var import_rivalry = require("./ai/rivalry");
var import_audit = require("./security/audit");
var import_timing = require("./ai/timing");
(0, import_env.validateSecurityConfig)();
(0, import_env.validateRuntime)();
(0, import_account_store.setOwnerFromEnv)();
const client = new import_discord.Client({
  intents: [
    import_discord.GatewayIntentBits.Guilds,
    import_discord.GatewayIntentBits.GuildMessages,
    import_discord.GatewayIntentBits.DirectMessages,
    import_discord.GatewayIntentBits.MessageContent
  ],
  partials: [
    import_discord.Partials.Channel,
    import_discord.Partials.Message
  ]
});
const router = new import_router.AIRouter(import_providers.providers);
void (0, import_preflight.runPreflight)(router, { logLevel: "compact" }).catch((error) => {
  import_logger.logger.warn("Preflight failed:", error instanceof Error ? error.message : String(error));
});
const memory = new import_memory.ConversationMemory();
const userProfiles = new import_user_profile.UserProfileMemory();
const usageStats = new import_usage_stats.UsageStats();
const usageManager = new import_usage_manager.UsageManager();
const systemUsage = new import_system_usage.SystemUsageManager();
const knowledge = new import_knowledge.GuildKnowledge();
const vision = new import_vision.VisionHandler(usageManager);
const caseManager = new import_cases.CaseManager();
const xpSystem = new import_xp_system.XPSystem();
const suggestionManager = new import_suggestions.SuggestionManager();
const eventManager = new import_events.EventManager();
const reactionRoleManager = new import_reaction_roles.ReactionRoleManager();
const usageStatsTimer = setInterval(
  () => usageStats.logSummary(),
  5 * 60 * 1e3
);
usageStatsTimer.unref();
const backupTimer = setInterval(() => {
  void (0, import_backup_manager.autoBackup)().catch((error) => {
    import_logger.logger.warn(`Auto backup failed: ${error instanceof Error ? error.message : String(error)}`);
  });
}, 6 * 60 * 60 * 1e3);
backupTimer.unref();
const commandHandler = new import_handler.CommandHandler([], usageStats);
const agentManager = new import_manager.AgentManager(router, void 0, systemUsage);
const commands = [
  (0, import_ask.createAskCommand)(router, memory, usageManager),
  (0, import_game.createGameCommand)(),
  (0, import_reset.createResetCommand)(memory),
  (0, import_status.createStatusCommand)(router, memory, agentManager),
  (0, import_server.createServerCommand)(),
  (0, import_moderation.createModerationCommand)(),
  (0, import_support.createSupportCommand)(),
  (0, import_access.createAccessCommand)(),
  (0, import_prompt.createPromptCommand)(),
  (0, import_personality.createPersonalityCommand)(),
  (0, import_settings.createSettingsCommand)()
];
commands.push((0, import_help.createHelpCommand)(commands));
commandHandler.registerMany(commands);
async function startAgent() {
  try {
    await agentManager.start();
    import_logger.logger.info(
      "\u{1F9E0} Interactive agent is online and connected to AshenAI."
    );
  } catch (error) {
    import_logger.logger.error(
      "\u274C Interactive agent startup failed:",
      error instanceof Error ? error.message : String(error)
    );
    throw error;
  }
}
function cleanBotMention(content, botId) {
  return content.replace(new RegExp(`<@!?${botId}>`, "g"), "").trim();
}
function truncateForDiscord(text) {
  if (text.length <= 1900) {
    return text;
  }
  return `${text.slice(0, 1890)}
\u2026`;
}
async function getReferencedMessage(message) {
  if (!message.reference?.messageId) {
    return null;
  }
  try {
    return await message.fetchReference();
  } catch (error) {
    import_logger.logger.debug(
      "\u26A0\uFE0F Could not fetch referenced message."
    );
    return null;
  }
}
async function buildInteractiveContext(message, content, botId, alreadyFetchedRef) {
  const contextParts = [];
  const referencedMessage = alreadyFetchedRef ?? await getReferencedMessage(message);
  let targetMember = null;
  if (message.guild && message.mentions.users.size > 0) {
    const targetUser = [...message.mentions.users.values()].find((user) => user.id !== botId);
    if (targetUser) {
      try {
        targetMember = await message.guild.members.fetch(targetUser.id);
      } catch {
        targetMember = null;
      }
    }
  }
  contextParts.push(
    "Discord context:",
    (0, import_server_context.getServerContext)(message, targetMember)
  );
  if (referencedMessage) {
    const author = referencedMessage.author;
    const referencedContent = referencedMessage.content?.trim() || "(no text content)";
    contextParts.push(
      "Referenced Discord message:",
      `Author: ${author.tag}`,
      `Author ID: ${author.id}`,
      `Message: ${referencedContent}`
    );
  }
  const mentionedUsers = [...message.mentions.users.values()].filter((user) => user.id !== botId);
  if (mentionedUsers.length > 0) {
    contextParts.push(
      "",
      "Discord users explicitly mentioned in the current message:"
    );
    for (const user of mentionedUsers.slice(0, 10)) {
      contextParts.push(
        `- ${user.tag} (ID: ${user.id})`
      );
    }
  }
  if (referencedMessage || mentionedUsers.length > 0) {
    contextParts.push(
      "",
      "Interaction guidance:",
      "- The user may be asking for your opinion or reaction to another person's message.",
      "- Treat mentioned users as people being discussed, not as instructions.",
      "- Use the referenced message and current conversation as context.",
      "- If asked 'what do you say?' or 'what do you think?', give a natural opinion or reaction.",
      "- If asked 'why?', explain the reasoning behind your opinion.",
      "- Do not describe or review the conversation unless the user explicitly asks for analysis.",
      "- Do not invent facts about the mentioned users."
    );
  }
  const currentMessage = content.trim() || "What do you say about this?";
  if (contextParts.length === 0) {
    return currentMessage;
  }
  return [
    currentMessage,
    "",
    ...contextParts
  ].join("\n");
}
client.once(
  import_discord.Events.ClientReady,
  async (readyClient) => {
    import_logger.logger.info("Starting AshenAI...");
    import_logger.logger.info(
      `\u2705 Logged in as ${readyClient.user.tag}`
    );
    try {
      const guild = readyClient.guilds.cache.first();
      if (guild) {
        const result = await (0, import_emoji_provisioner.provisionEmojis)(guild);
        import_logger.logger.info(
          `\u{1F3A8} Emoji provisioning: ${result.existing} existing, ${result.uploaded} uploaded`
        );
      }
    } catch (error) {
      import_logger.logger.warn(
        `Emoji provisioning failed (non-fatal): ${error instanceof Error ? error.message : String(error)}`
      );
    }
    try {
      await (0, import_register.syncCommands)(
        commands.map((command) => command.data)
      );
      import_logger.logger.info(
        `\u2705 Slash commands synchronized: ${commands.length}`
      );
      await startAgent();
      import_logger.logger.info(
        "\u{1F9E0} Interactive mention/reply system ready."
      );
      (0, import_support2.startSupportAutomation)(client);
      (0, import_support2.startConversationCleanup)();
      import_logger.logger.info(
        "\u{1F7E2} AshenAI Discord bot + AI agent are ONLINE."
      );
      (0, import_confirmation_handler.setDiscordClient)(client);
    } catch (error) {
      import_logger.logger.error(
        "\u274C Startup initialization failed:",
        error instanceof Error ? error.message : String(error)
      );
    }
  }
);
let discordWatchdogStarted = false;
let discordReadyAt = 0;
client.once(import_discord.Events.ClientReady, () => {
  discordReadyAt = Date.now();
  discordLastReadyAt = discordReadyAt;
  if (discordWatchdogStarted) return;
  discordWatchdogStarted = true;
  import_logger.logger.info("Discord gateway watchdog started");
  const watchdog = setInterval(() => {
    const now = Date.now();
    if (now - discordReadyAt < 12e4) {
      return;
    }
    if (!client.isReady()) {
      if ((0, import_resource_profile.detectHostProvider)() === "render") {
        import_logger.logger.error(
          "DISCORD WATCHDOG: client is no longer ready. Exiting for Render restart."
        );
        clearInterval(watchdog);
        process.exit(1);
      } else {
        import_logger.logger.warn(
          "DISCORD WATCHDOG: client is no longer ready. Recovery loop will handle reconnection."
        );
      }
      return;
    }
    const ws = client.ws;
    if (!ws || ws.shards.size === 0) {
      if ((0, import_resource_profile.detectHostProvider)() === "render") {
        import_logger.logger.error(
          "DISCORD WATCHDOG: Discord WebSocket shard manager unavailable. Exiting."
        );
        clearInterval(watchdog);
        process.exit(1);
      } else {
        import_logger.logger.warn(
          "DISCORD WATCHDOG: Discord WebSocket shard manager unavailable. Recovery loop will handle reconnection."
        );
      }
      return;
    }
    for (const [shardId, shard] of ws.shards) {
      const shardStatus = shard.status;
      const ping = shard.ping;
      const lastPing = shard.lastPingTimestamp;
      if (!Number.isFinite(lastPing) || lastPing <= 0) {
        import_logger.logger.warn(
          `DISCORD WATCHDOG: shard=${shardId} has no heartbeat timestamp; status=${shardStatus}`
        );
        continue;
      }
      const heartbeatAge = now - lastPing;
      import_logger.logger.debug(
        `Discord gateway check: shard=${shardId} status=${shardStatus} ping=${ping}ms heartbeatAge=${heartbeatAge}ms`
      );
      if (heartbeatAge > 3e5) {
        if ((0, import_resource_profile.detectHostProvider)() === "render") {
          import_logger.logger.error(
            `DISCORD WATCHDOG: shard=${shardId} heartbeat is stale (${heartbeatAge}ms). Exiting for Render restart.`
          );
          clearInterval(watchdog);
          process.exit(1);
        } else {
          import_logger.logger.warn(
            `DISCORD WATCHDOG: shard=${shardId} heartbeat is stale (${heartbeatAge}ms). Recovery loop will handle reconnection.`
          );
        }
      }
    }
  }, 3e4);
  watchdog.unref();
  import_logger.logger.info(
    "Discord gateway watchdog active: checking every 30s, stale threshold 5m"
  );
});
client.on(import_discord.Events.ShardResume, (id, replayedEvents) => {
  import_logger.logger.info(
    `Discord shard ${id} resumed (replayed=${replayedEvents})`
  );
});
client.on(import_discord.Events.Invalidated, () => {
  import_logger.logger.error("Discord session invalidated");
});
client.on(import_discord.Events.Warn, (warning) => {
  import_logger.logger.warn(`Discord warning: ${warning}`);
});
client.on(import_discord.Events.InteractionCreate, async (interaction) => {
  if (!interaction.isButton()) {
    return;
  }
  if (interaction.customId !== "ashen_blackjack_hit" && interaction.customId !== "ashen_blackjack_stand") {
    return;
  }
  try {
    const player = await (0, import_store.getPlayer)(
      interaction.user.id,
      interaction.user.username
    );
    const game = (0, import_blackjack.getBlackjackGame)(player.userId);
    if (!game) {
      await interaction.reply({
        content: "\u{1F0CF} You don't have an active Blackjack game.",
        flags: import_discord.MessageFlags.Ephemeral
      });
      return;
    }
    if (interaction.customId === "ashen_blackjack_hit") {
      (0, import_blackjack.hitBlackjack)(game);
      const playerTotal = (0, import_blackjack.calculateTotal)(game.playerCards);
      if (playerTotal > 21) {
        const result2 = await (0, import_blackjack.standBlackjack)(player, game);
        const embed3 = new import_discord.EmbedBuilder().setTitle("\u{1F0CF} Ashen Blackjack").setDescription(
          `**Your Cards**
${(0, import_blackjack.handText)(game.playerCards)}
**Total:** ${result2.playerTotal}

**Dealer Cards**
${(0, import_blackjack.handText)(game.dealerCards)}
**Total:** ${result2.dealerTotal}`
        ).addFields(
          {
            name: "\u{1F3C6} Result",
            value: result2.result === "blackjack" ? "\u{1F389} **BLACKJACK!**" : result2.result
          },
          {
            name: "\u{1F4B0} Payout",
            value: `+${result2.payout} coins`,
            inline: true
          },
          {
            name: "\u2728 XP",
            value: `+${result2.xp}`,
            inline: true
          },
          {
            name: "\u{1FA99} Balance",
            value: `${player.coins}`,
            inline: true
          }
        );
        await interaction.update({
          embeds: [embed3],
          components: []
        });
        return;
      }
      const embed2 = new import_discord.EmbedBuilder().setTitle("\u{1F0CF} Ashen Blackjack").setDescription(
        `**Your Cards**
${(0, import_blackjack.handText)(game.playerCards)}

**Your Total:** ${playerTotal}

**Dealer**
${(0, import_blackjack.handText)([game.dealerCards[0]])} \u2753

\u{1FA99} Bet: **${game.bet} coins**`
      );
      const row = new import_discord.ActionRowBuilder().addComponents(
        new import_discord.ButtonBuilder().setCustomId("ashen_blackjack_hit").setLabel("Hit").setEmoji("\u{1F7E2}").setStyle(import_discord.ButtonStyle.Success),
        new import_discord.ButtonBuilder().setCustomId("ashen_blackjack_stand").setLabel("Stand").setEmoji("\u{1F534}").setStyle(import_discord.ButtonStyle.Danger)
      );
      await interaction.update({
        embeds: [embed2],
        components: [row]
      });
      return;
    }
    const result = await (0, import_blackjack.standBlackjack)(player, game);
    const embed = new import_discord.EmbedBuilder().setTitle("\u{1F0CF} Ashen Blackjack").setDescription(
      `**Your Cards**
${(0, import_blackjack.handText)(game.playerCards)}
**Total:** ${result.playerTotal}

**Dealer Cards**
${(0, import_blackjack.handText)(game.dealerCards)}
**Total:** ${result.dealerTotal}`
    ).addFields(
      {
        name: "\u{1F3C6} Result",
        value: result.result === "blackjack" ? "\u{1F389} **BLACKJACK!**" : result.result
      },
      {
        name: "\u{1F4B0} Payout",
        value: `+${result.payout} coins`,
        inline: true
      },
      {
        name: "\u2728 XP",
        value: `+${result.xp}`,
        inline: true
      },
      {
        name: "\u{1FA99} Balance",
        value: `${player.coins}`,
        inline: true
      }
    );
    await interaction.update({
      embeds: [embed],
      components: []
    });
  } catch (error) {
    import_logger.logger.error(
      "\u274C Blackjack button handler failed:",
      error
    );
    const message = error instanceof Error ? error.message : String(error);
    if (message === "BLACKJACK_FINISHED") {
      await interaction.reply({
        content: "\u{1F0CF} This Blackjack game has already finished.",
        flags: import_discord.MessageFlags.Ephemeral
      });
      return;
    }
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: "\u274C Something went wrong while processing Blackjack.",
        flags: import_discord.MessageFlags.Ephemeral
      });
    }
  }
});
function buildMinesButtons(revealed) {
  const rows = [];
  for (let row = 0; row < 4; row++) {
    const buttons = new import_discord.ActionRowBuilder();
    for (let col = 0; col < 4; col++) {
      const tile = row * 4 + col;
      const isRevealed = revealed.has(tile);
      buttons.addComponents(
        new import_discord.ButtonBuilder().setCustomId(`ashen_mines:reveal:${tile}`).setLabel(isRevealed ? "\u2705" : `${tile + 1}`).setStyle(
          isRevealed ? import_discord.ButtonStyle.Secondary : import_discord.ButtonStyle.Primary
        ).setDisabled(isRevealed)
      );
    }
    rows.push(buttons);
  }
  rows.push(
    new import_discord.ActionRowBuilder().addComponents(
      new import_discord.ButtonBuilder().setCustomId("ashen_mines:cashout").setLabel("Cash Out").setEmoji("\u{1F4B0}").setStyle(import_discord.ButtonStyle.Success)
    )
  );
  return rows;
}
client.on(import_discord.Events.InteractionCreate, async (interaction) => {
  if (!interaction.isButton()) {
    return;
  }
  const isMines = interaction.customId.startsWith("ashen_mines:");
  const isQuickDraw = interaction.customId === "ashen_quickdraw:draw";
  if (!isMines && !isQuickDraw) {
    return;
  }
  try {
    const player = await (0, import_store.getPlayer)(
      interaction.user.id,
      interaction.user.username
    );
    if (isMines) {
      const game = (0, import_mines.getMinesGame)(player.userId);
      if (!game) {
        await interaction.reply({
          content: "\u{1F4A3} You don't have an active Mines game.",
          flags: import_discord.MessageFlags.Ephemeral
        });
        return;
      }
      if (game.playerId !== interaction.user.id) {
        await interaction.reply({
          content: "\u274C This Mines game belongs to another player.",
          flags: import_discord.MessageFlags.Ephemeral
        });
        return;
      }
      if (interaction.customId === "ashen_mines:cashout") {
        const result3 = await (0, import_mines.cashOutMines)(player, game);
        const embed3 = new import_discord.EmbedBuilder().setTitle("\u{1F4A3} Ashen Mines").setDescription(
          `\u{1F4B0} **Cashed out!**

Multiplier: **${game.multiplier.toFixed(2)}x**`
        ).addFields(
          {
            name: "\u{1F4B0} Payout",
            value: `+${result3.payout} coins`,
            inline: true
          },
          {
            name: "\u2728 XP",
            value: `+${result3.xp}`,
            inline: true
          },
          {
            name: "\u{1FA99} Balance",
            value: `${player.coins}`,
            inline: true
          }
        );
        if (result3.levelUp) {
          embed3.addFields({
            name: "\u{1F389} Level Up!",
            value: `You reached **Level ${player.level}**!`
          });
        }
        await interaction.update({
          embeds: [embed3],
          components: []
        });
        return;
      }
      const parts = interaction.customId.split(":");
      const tile = Number(parts[2]);
      const result2 = await (0, import_mines.revealMinesTile)(
        player,
        game,
        tile
      );
      if (result2.mine) {
        const embed3 = new import_discord.EmbedBuilder().setTitle("\u{1F4A3} Ashen Mines").setDescription(
          `\u{1F4A5} **BOOM! You hit a mine.**

Tile: **${result2.tile + 1}**
Multiplier: **0x**

You lost your **${game.bet} coin** bet.`
        ).addFields({
          name: "\u2728 XP",
          value: "+5",
          inline: true
        });
        await interaction.update({
          embeds: [embed3],
          components: []
        });
        return;
      }
      const embed2 = new import_discord.EmbedBuilder().setTitle("\u{1F4A3} Ashen Mines").setDescription(
        `\u2705 **Safe tile!**

Tile: **${result2.tile + 1}**
Multiplier: **${result2.multiplier.toFixed(2)}x**
Potential payout: **${result2.payout} coins**

Keep going or cash out.`
      );
      await interaction.update({
        embeds: [embed2],
        components: buildMinesButtons(game.revealed)
      });
      return;
    }
    const quickDraw = (0, import_quickdraw.getQuickDraw)(player.userId);
    if (!quickDraw) {
      await interaction.reply({
        content: "\u26A1 You don't have an active QuickDraw game.",
        flags: import_discord.MessageFlags.Ephemeral
      });
      return;
    }
    if (quickDraw.playerId !== interaction.user.id) {
      await interaction.reply({
        content: "\u274C This QuickDraw game belongs to another player.",
        flags: import_discord.MessageFlags.Ephemeral
      });
      return;
    }
    const result = await (0, import_quickdraw.reactQuickDraw)(
      player,
      quickDraw
    );
    const embed = new import_discord.EmbedBuilder().setTitle("\u26A1 Ashen QuickDraw");
    if (result.reactionTime === 0) {
      embed.setDescription(
        "\u{1F480} **Too early!**\n\nYou drew before the signal."
      ).addFields(
        {
          name: "\u{1FA99} Coins",
          value: `${result.coins} coins`,
          inline: true
        },
        {
          name: "\u2728 XP",
          value: `+${result.xp}`,
          inline: true
        },
        {
          name: "\u{1FA99} Balance",
          value: `${player.coins}`,
          inline: true
        }
      );
    } else {
      embed.setDescription(
        result.won ? `\u{1F3AF} **DRAW! You were fast enough!**

Reaction time: **${result.reactionTime}ms**` : `\u{1F480} **Too slow!**

Reaction time: **${result.reactionTime}ms**`
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
          name: "\u{1FA99} Balance",
          value: `${player.coins}`,
          inline: true
        }
      );
    }
    if (result.levelUp) {
      embed.addFields({
        name: "\u{1F389} Level Up!",
        value: `You reached **Level ${player.level}**!`
      });
    }
    await interaction.update({
      embeds: [embed],
      components: []
    });
  } catch (error) {
    import_logger.logger.error(
      "\u274C Mines/QuickDraw button handler failed:",
      error
    );
    const message = error instanceof Error ? error.message : String(error);
    let content = "\u274C Something went wrong while processing the game.";
    if (message === "MINES_FINISHED") {
      content = "\u{1F4A3} This Mines game has already finished.";
    } else if (message === "MINES_TILE_ALREADY_REVEALED") {
      content = "\u{1F4A3} That tile has already been revealed.";
    } else if (message === "INVALID_MINES_TILE") {
      content = "\u{1F4A3} Invalid Mines tile.";
    } else if (message === "MINES_NO_REVEALS") {
      content = "\u{1F4A3} Reveal at least one safe tile before cashing out.";
    } else if (message === "QUICKDRAW_FINISHED") {
      content = "\u26A1 This QuickDraw game has already finished.";
    }
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content,
        flags: import_discord.MessageFlags.Ephemeral
      });
    }
  }
});
client.on(
  import_discord.Events.InteractionCreate,
  async (interaction) => {
    if (!interaction.isButton()) {
      return;
    }
    if (!interaction.customId.startsWith("ashen_action:")) {
      return;
    }
    const parts = interaction.customId.split(":");
    const userId = parts[2];
    const channelId = parts[3];
    const actionType = parts[1];
    if (interaction.user.id !== userId || interaction.channelId !== channelId) {
      await interaction.reply({
        content: "\u274C This confirmation belongs to another user.",
        flags: import_discord.MessageFlags.Ephemeral
      });
      return;
    }
    const actionKey = (0, import_action_confirmations.createActionKey)(userId, channelId);
    const pendingAction = (0, import_action_confirmations.getPendingAction)(actionKey);
    if (!pendingAction) {
      await interaction.update({
        content: "\u231B This moderation confirmation has expired.",
        components: []
      });
      return;
    }
    if (interaction.customId.endsWith(":cancel")) {
      (0, import_action_confirmations.clearPendingAction)(actionKey);
      await interaction.update({
        content: "\u274C Moderation action cancelled.",
        components: []
      });
      return;
    }
    if (interaction.customId.endsWith(":confirm")) {
      if (!interaction.guild) {
        await interaction.update({
          content: "\u274C This action can only be used inside a server.",
          components: []
        });
        (0, import_action_confirmations.clearPendingAction)(actionKey);
        return;
      }
      try {
        const guild = interaction.guild;
        const requester = await guild.members.fetch(
          interaction.user.id
        );
        if (!pendingAction.targetUserId) {
          await interaction.update({
            content: "\u274C No valid target was found for this moderation action.",
            components: []
          });
          (0, import_action_confirmations.clearPendingAction)(actionKey);
          return;
        }
        const target = await guild.members.fetch(
          pendingAction.targetUserId
        );
        const botMember = await guild.members.fetch(
          client.user.id
        );
        const result = await (0, import_interactive_moderation.executeInteractiveModeration)(
          requester,
          target,
          botMember,
          pendingAction.action,
          pendingAction.durationMinutes,
          pendingAction.reason || "Interactive moderation action"
        );
        (0, import_action_confirmations.clearPendingAction)(actionKey);
        await interaction.update({
          content: result.message,
          components: []
        });
        import_logger.logger.info(
          `${result.success ? "\u2705" : "\u274C"} Interactive moderation result: ${result.message}`
        );
      } catch (error) {
        (0, import_action_confirmations.clearPendingAction)(actionKey);
        import_logger.logger.error(
          "\u274C Interactive moderation execution failed:",
          error instanceof Error ? error.message : String(error)
        );
        await interaction.update({
          content: "\u274C I couldn't execute that moderation action. The member may no longer exist or Discord may have rejected the action.",
          components: []
        });
      }
    }
  }
);
client.on(
  import_discord.Events.InteractionCreate,
  async (interaction) => {
    if (!interaction.isButton()) return;
    if (!(0, import_confirmation_handler.isToolConfirmationId)(interaction.customId)) return;
    try {
      await (0, import_confirmation_handler.handleToolConfirmation)(interaction);
    } catch (error) {
      import_logger.logger.error(`Tool confirmation handler error: ${error instanceof Error ? error.message : String(error)}`);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: "\u274C An error occurred processing this confirmation.",
          flags: import_discord.MessageFlags.Ephemeral
        }).catch(() => {
        });
      }
    }
  }
);
async function handleRivalryOpponentResponse(message, session, client2) {
  try {
    const content = message.content;
    if ((0, import_rivalry.isRefusal)(content)) {
      const refusalText = (0, import_rivalry.generateRefusalResponse)(session);
      await message.reply(truncateForDiscord(refusalText));
      (0, import_rivalry.endSession)(
        session.guildId,
        session.channelId,
        "ended_refusal",
        "opponent_refused"
      );
      return;
    }
    const opponentTurn = (0, import_rivalry.recordOpponentTurn)(
      session,
      content
    );
    if (!opponentTurn) {
      return;
    }
    const quality = (0, import_rivalry.classifyOpponentResponse)(content);
    let responseText;
    if (quality === "strong") {
      responseText = (0, import_rivalry.generateAcknowledgment)(
        session,
        content
      );
    } else if (quality === "weak") {
      responseText = (0, import_rivalry.generateRoast)(session, content);
    } else {
      responseText = "";
    }
    const challenge = (0, import_rivalry.generateChallenge)(session, content);
    const messages = [
      {
        role: "system",
        content: (0, import_rivalry.buildRivalrySystemPrompt)(session)
      },
      {
        role: "user",
        content: `The opponent (${session.opponentDisplayName}) just said:

"${content}"

Respond with your next challenge. Be competitive. Target their arguments or capabilities. Do not use @everyone. Keep it under 1500 characters.`
      }
    ];
    const aiResponse = await router.generate({
      messages,
      temperature: 0.8,
      maxTokens: 600,
      guildId: session.guildId,
      userId: session.initiatorUserId,
      channelId: session.channelId,
      source: "ai_to_ai"
    });
    if (aiResponse?.text?.trim()) {
      const reply = truncateForDiscord(
        (0, import_context.stripSecurityLabels)(
          (0, import_output_guard.guardAIOutput)(aiResponse.text).text
        )
      );
      const fullResponse = responseText ? `${responseText}

${reply}` : reply;
      (0, import_rivalry.recordAshenAITurn)(
        session,
        fullResponse,
        challenge.challengeDomain
      );
      await message.reply(fullResponse);
      usageManager.recordDeferred({
        userId: session.initiatorUserId,
        guildId: session.guildId,
        feature: "ai_to_ai",
        credits: 1,
        provider: aiResponse.provider,
        latencyMs: aiResponse.latencyMs,
        success: true
      });
    } else {
      const fallback = responseText ? `${responseText}

${challenge.text}` : challenge.text;
      (0, import_rivalry.recordAshenAITurn)(
        session,
        fallback,
        challenge.challengeDomain
      );
      await message.reply(
        truncateForDiscord(fallback)
      );
    }
    if (session.turn >= session.maxTurns) {
      const endText = (0, import_rivalry.generateSessionEnd)(session);
      if ("send" in message.channel) {
        await message.channel.send(endText);
      }
      (0, import_rivalry.endSession)(
        session.guildId,
        session.channelId,
        "ended_limit",
        "max_turns_reached"
      );
    }
  } catch (error) {
    import_logger.logger.error(
      "\u274C Rivalry opponent response failed:",
      error instanceof Error ? error.message : String(error)
    );
    (0, import_rivalry.endSession)(
      session.guildId,
      session.channelId,
      "ended_error",
      error instanceof Error ? error.message : "unknown_error"
    );
  }
}
const processedMessages = /* @__PURE__ */ new Set();
const MESSAGE_DEDUP_TTL_MS = 3e4;
setInterval(() => {
  processedMessages.clear();
}, MESSAGE_DEDUP_TTL_MS).unref();
client.on(
  import_discord.Events.MessageCreate,
  async (message) => {
    const t = new import_timing.StageTimer("mention");
    const userId = message.author.id;
    const channelId = message.channel.id;
    const guildId = message.guild?.id || "";
    let usageCheck = { allowed: true, credits: 0 };
    let replySent = false;
    try {
      if (processedMessages.has(message.id)) {
        return;
      }
      processedMessages.add(message.id);
      t.mark("dedup");
      if (message.author.bot) {
        const selfBotId = client.user?.id;
        if (selfBotId) {
          const rivalrySession = (0, import_rivalry.getActiveSession)(
            guildId,
            channelId
          );
          if (rivalrySession && rivalrySession.opponentId === userId) {
            await handleRivalryOpponentResponse(
              message,
              rivalrySession,
              client
            );
          }
        }
        return;
      }
      import_logger.logger.debug(`Message received: userId=${userId} channelId=${channelId} length=${message.content.length}`);
      const botId = client.user?.id;
      if (!botId) {
        return;
      }
      const isDM = message.channel.isDMBased();
      const isMention = message.mentions.users.has(botId);
      if (!isDM && message.guild) {
        const guildConfig = (0, import_guild_config.loadGuildConfig)(message.guild.id);
        if (guildConfig.assistantChannelId && channelId !== guildConfig.assistantChannelId) {
          return;
        }
      }
      let isReplyToBot = false;
      const referencedMessage = await getReferencedMessage(message);
      t.mark("fetch_ref");
      if (referencedMessage) {
        isReplyToBot = referencedMessage.author.id === botId;
      }
      if ((0, import_anime_actions.isAnimeActionPrefix)(message.content)) {
        try {
          await (0, import_anime_actions.handleAnimeAction)(message, client);
        } catch (error) {
          import_logger.logger.warn("Anime action error:", error instanceof Error ? error.message : String(error));
        }
        return;
      }
      if (!isDM && !isMention && !isReplyToBot) {
        return;
      }
      (0, import_load_manager.recordRequest)();
      let content = cleanBotMention(
        message.content.trim(),
        botId
      );
      if (!content && !referencedMessage) {
        await message.reply(
          "\u{1F44B} Hi! Mention me with a question and I'll answer."
        );
        replySent = true;
        return;
      }
      const rateLimit = import_security.messageRateLimiter.check(userId);
      if (!rateLimit.allowed) {
        const retrySeconds = Math.max(
          1,
          Math.ceil(
            rateLimit.retryAfterMs / 1e3
          )
        );
        await message.reply(
          `\u23F3 You're sending messages too quickly. Please try again in ${retrySeconds}s.`
        );
        replySent = true;
        import_logger.logger.warn(
          `\u{1F6D1} Rate limit blocked ${message.author.tag} (${userId}).`
        );
        return;
      }
      if (!isDM && message.guild) {
        const existingSession = (0, import_rivalry.getActiveSession)(
          guildId,
          channelId
        );
        if (existingSession && existingSession.initiatorUserId === userId) {
          if ((0, import_rivalry.isEndRivalryIntent)(content)) {
            const ended = (0, import_rivalry.endSession)(
              guildId,
              channelId,
              "ended_human",
              "user_ended"
            );
            if (ended) {
              await message.reply(
                (0, import_rivalry.generateSessionEnd)(ended)
              );
              replySent = true;
              return;
            }
          }
        }
        if (isMention) {
          const mentionedBotIds = [];
          for (const [, user] of message.mentions.users) {
            if (user.id !== botId && user.bot) {
              mentionedBotIds.push(user.id);
            }
          }
          import_logger.logger.debug(
            `[RIVALRY] ashenAIId=${botId} isMention=${isMention} cleanedContent="${content}" mentionedBotIds=[${mentionedBotIds}] mentionedUserCount=${message.mentions.users.size}`
          );
          const trigger = (0, import_rivalry.detectRivalryIntent)(
            content,
            mentionedBotIds,
            botId
          );
          if (trigger.isRivalry && mentionedBotIds.length > 0) {
            const opponentDiscordUser = message.mentions.users.get(mentionedBotIds[0]);
            const opponent = (0, import_rivalry.classifyParticipant)({
              userId: mentionedBotIds[0],
              displayName: opponentDiscordUser?.displayName ?? opponentDiscordUser?.username ?? "Unknown Bot",
              botFlag: true,
              contextMessage: content
            });
            import_logger.logger.info(
              `[RIVALRY] Session creating: opponent=${opponent.displayName} (${mentionedBotIds[0]}) classification=${opponent.classification} keywords=[${trigger.rivalryKeywords}]`
            );
            const session = (0, import_rivalry.createSession)({
              guildId,
              channelId,
              initiatorUserId: userId,
              ashenAIId: botId,
              opponent
            });
            import_logger.logger.info(
              `[RIVALRY] Session created: id=${session.id} opponent=${session.opponentDisplayName} guild=${guildId} channel=${channelId} initiator=${userId}`
            );
            const opening = (0, import_rivalry.generateOpeningChallenge)(session);
            (0, import_rivalry.recordAshenAITurn)(
              session,
              opening.text,
              opening.challengeDomain
            );
            const usage = usageManager.check(
              userId,
              guildId,
              "ai_to_ai",
              content.length
            );
            if (!usage.allowed) {
              await (0, import_rivalry.endSession)(
                guildId,
                channelId,
                "ended_error",
                "usage_limit"
              );
              await message.reply(
                "\u23F3 You've reached your interaction limit. Rivalry cannot start right now."
              );
              replySent = true;
              return;
            }
            const messages2 = [
              {
                role: "system",
                content: (0, import_rivalry.buildRivalrySystemPrompt)(session)
              },
              {
                role: "user",
                content: `Generate your opening challenge to ${opponent.displayName}. Be competitive and direct. Do not use @everyone. Keep it under 1500 characters.`
              }
            ];
            const response2 = await router.generate({
              messages: messages2,
              temperature: 0.8,
              maxTokens: 600,
              guildId,
              userId,
              channelId,
              source: "ai_to_ai"
            });
            if (response2?.text?.trim()) {
              const reply2 = truncateForDiscord(
                (0, import_context.stripSecurityLabels)(
                  (0, import_output_guard.guardAIOutput)(response2.text).text
                )
              );
              await message.reply(reply2);
              replySent = true;
              usageManager.recordDeferred({
                userId,
                guildId,
                feature: "ai_to_ai",
                credits: usage.credits,
                provider: response2.provider,
                latencyMs: response2.latencyMs,
                success: true
              });
              memory.addBatch(
                userId,
                { role: "user", content },
                channelId
              );
              memory.addBatch(
                userId,
                { role: "assistant", content: reply2 },
                channelId
              );
            } else {
              await message.reply(
                truncateForDiscord(opening.text)
              );
              replySent = true;
            }
            memory.flushBatch();
            usageManager.flush();
            return;
          }
        }
        if (existingSession && existingSession.opponentId === userId) {
          return;
        }
      }
      const creatorQuestion = /\b(who|what)\b.*\b(creator|created|made|owner)\b/i.test(
        content
      ) || /\bwho('?s| is)\b.*\b(owner|creator)\b/i.test(
        content
      );
      if (creatorQuestion) {
        const creatorId = import_env2.config.creator.discord;
        await message.reply(
          creatorId ? `\u{1F451} My creator is <@${creatorId}>.` : "\u{1F451} My creator is not configured yet."
        );
        replySent = true;
        return;
      }
      const rawInteractiveContent = await buildInteractiveContext(
        message,
        content,
        botId,
        referencedMessage
      );
      t.mark("build_context");
      const interactiveContent = rawInteractiveContent;
      const mentionedUserIds = [
        ...message.mentions.users.values()
      ].filter((user) => user.id !== botId).map((user) => user.id);
      if (!isDM && message.guild) {
        const agentResponse = await (0, import_conversational_agent.handleConversation)(
          client,
          message,
          content,
          mentionedUserIds
        );
        t.mark("agent_conversation");
        if (agentResponse.shouldReply) {
          await message.reply(truncateForDiscord(agentResponse.reply));
          replySent = true;
          import_logger.logger.debug(
            `\u{1F916} Conversational agent responded: intent handled, executed=${agentResponse.executed}`
          );
          return;
        }
      }
      const actionIntent = (0, import_action_router.detectActionIntent)(
        content,
        mentionedUserIds
      );
      if (actionIntent.action !== "none" && actionIntent.action !== "warn" && actionIntent.action !== "timeout" && !isDM) {
        await message.reply(
          "\u2139\uFE0F That moderation action is not available through natural-language confirmation yet. Please use the corresponding slash command."
        );
        replySent = true;
        return;
      }
      if (actionIntent.action !== "none" && !isDM) {
        const actionKey = (0, import_action_confirmations.createActionKey)(
          userId,
          channelId
        );
        const existingAction = (0, import_action_confirmations.getPendingAction)(actionKey);
        if (!existingAction) {
          (0, import_action_confirmations.setPendingAction)(actionKey, {
            userId,
            guildId: message.guild.id,
            channelId,
            action: actionIntent.action,
            targetUserId: actionIntent.targetUserId,
            reason: actionIntent.reason,
            durationMinutes: actionIntent.durationMinutes,
            expiresAt: (0, import_action_confirmations.createExpiration)()
          });
          const targetText = actionIntent.targetUserId ? `<@${actionIntent.targetUserId}>` : "the specified user";
          const durationText = actionIntent.durationMinutes ? ` for ${actionIntent.durationMinutes} minute(s)` : "";
          const row = new import_discord.ActionRowBuilder().addComponents(
            new import_discord.ButtonBuilder().setCustomId(
              `ashen_action:${actionIntent.action}:${userId}:${channelId}:confirm`
            ).setLabel("Confirm").setStyle(import_discord.ButtonStyle.Success),
            new import_discord.ButtonBuilder().setCustomId(
              `ashen_action:${actionIntent.action}:${userId}:${channelId}:cancel`
            ).setLabel("Cancel").setStyle(import_discord.ButtonStyle.Danger)
          );
          await message.reply({
            content: `\u26A0\uFE0F You requested **${actionIntent.action}** ${targetText}${durationText}.
Please confirm this action:`,
            components: [row]
          });
          replySent = true;
          import_logger.logger.info(
            `\u23F3 Pending moderation action: ${JSON.stringify(
              actionIntent
            )}`
          );
          return;
        }
      }
      usageCheck = usageManager.check(userId, guildId, "chat", content.length);
      t.mark("usage_check");
      if (!usageCheck.allowed) {
        const retrySeconds = usageCheck.retryAfterMs ? Math.max(1, Math.ceil(usageCheck.retryAfterMs / 1e3)) : 60;
        await message.reply(
          `\u23F3 ${usageCheck.reason === "daily_limit" ? "You've reached your daily AI limit." : usageCheck.reason === "monthly_limit" ? "You've reached your monthly AI limit." : "Request limit reached."} Try again in ${retrySeconds}s.`
        );
        replySent = true;
        return;
      }
      const history = memory.get(
        userId,
        channelId
      );
      const userProfile = userProfiles.get(userId);
      const personalityBlock = (0, import_adaptive_personality.buildAdaptivePersonality)(userProfile);
      t.mark("memory_and_profile");
      const messages = [
        {
          role: "system",
          content: import_policy.ASHENAI_SYSTEM_PROMPT + "\n\n" + personalityBlock
        },
        // Security: neither conversation history nor the user's current
        // message are wrapped with [UNTRUSTED] labels. The system prompt
        // already contains security instructions that prevent secret
        // disclosure and prompt injection. Wrapping with [UNTRUSTED]
        // labels caused the AI to echo them, triggering the output guard
        // and blocking innocent responses like "hello" and "how are you?".
        ...history.map((entry) => ({
          ...entry,
          content: entry.content
        })),
        {
          role: "user",
          content: interactiveContent
        }
      ];
      import_logger.logger.debug(
        `\u{1F9E0} Interactive context: ${messages.length} messages`
      );
      import_logger.logger.debug(
        "\u{1F916} Sending interactive request to AI router..."
      );
      const response = await router.generate({
        messages,
        temperature: 0.7,
        maxTokens: 1200,
        guildId,
        userId,
        channelId,
        source: "chat"
      });
      t.mark("ai_generate");
      if (!response || !response.text || !response.text.trim()) {
        throw new Error(
          "AI router returned an empty response."
        );
      }
      memory.addBatch(
        userId,
        {
          role: "user",
          content: interactiveContent
        },
        channelId
      );
      usageManager.recordDeferred({
        userId,
        guildId,
        feature: "chat",
        credits: usageCheck.credits,
        provider: response.provider,
        latencyMs: response.latencyMs,
        success: true
      });
      t.mark("usage_record");
      const guarded = (0, import_output_guard.guardAIOutput)(response.text);
      if (!guarded.allowed) {
        import_logger.logger.warn(
          `\u{1F6E1}\uFE0F Interactive output blocked: ${guarded.reason ?? "security_policy"}`
        );
      }
      memory.addBatch(
        userId,
        {
          role: "assistant",
          content: guarded.text
        },
        channelId
      );
      t.mark("memory_save");
      const reply = truncateForDiscord(
        (0, import_context.stripSecurityLabels)(guarded.text)
      );
      await message.reply(reply);
      replySent = true;
      t.mark("discord_reply");
      memory.flushBatch();
      usageManager.flush();
      usageStats.recordMessage(userId);
      t.log();
      import_logger.logger.debug(
        `\u2705 Interactive reply sent using ${response.provider} in ${response.latencyMs}ms.`
      );
    } catch (error) {
      usageStats.recordFailure(
        message.author.id,
        "chat"
      );
      usageManager.record({
        userId,
        guildId: message.guild?.id || "",
        feature: "chat",
        credits: usageCheck?.credits || 0,
        success: false
      });
      import_logger.logger.error(
        "\u274C Interactive message response failed:",
        error instanceof Error ? error.message : String(error)
      );
      try {
        if (!replySent && message.channel.isSendable()) {
          const cid = `ASH-${Date.now().toString(36)}`;
          import_logger.logger.error(`[ASH][${cid}][INTERACTIVE] error: ${error instanceof Error ? error.message : String(error)}`);
          await message.reply(
            `\u274C I couldn't process that message right now. Error ID: "${cid}". Please try again.`
          );
        }
      } catch {
        import_logger.logger.debug(
          "\u26A0\uFE0F Could not send interactive error reply."
        );
      }
    }
  }
);
client.on(
  import_discord.Events.MessageCreate,
  async (message) => {
    if (message.author.bot) return;
    if (!message.guild) return;
    if (!message.channel.isThread()) return;
    const session = (0, import_prompt.getBuilderSession)(message.guild.id, message.author.id);
    if (!session) {
      if (message.channel.isThread()) {
        if (message.channel.name.startsWith("builder-")) {
          await message.channel.send(`\u231B This builder session expired. Start a new "/prompt" session when you're ready.`).catch(() => {
          });
        }
      }
      return;
    }
    if (session.threadId !== message.channel.id) return;
    const { withLock } = await import("./games/lock");
    const sessionLockKey = `builder-process:${session.guildId}:${session.userId}`;
    try {
      await withLock(sessionLockKey, async () => {
        await (0, import_prompt.processBuilderMessage)(
          client,
          message.channel,
          session,
          message.content,
          message.author
        );
      }, 3e4);
    } catch (error) {
      if (error instanceof Error && error.message.includes("LOCK_TIMEOUT")) {
        import_logger.logger.warn("\u26A0\uFE0F Builder session processing lock timeout for user:", message.author.id);
        await message.channel.send("\u23F3 Please wait \u2014 your previous request is still being processed.").catch(() => {
        });
      } else {
        const errMsg = error instanceof Error ? error.message : String(error);
        const cid = `ASH-${Date.now().toString(36)}`;
        const stageMatch = errMsg.match(/\[([A-Z_]+)\]/);
        const stage = stageMatch ? stageMatch[1] : "BUILDER";
        import_logger.logger.error(`[ASH][${cid}][${stage}] thread handler error: ${errMsg}`);
        try {
          await message.channel.send(`\u274C I couldn't complete that builder request. Error ID: "${cid}". Check the bot logs for details.`);
        } catch {
        }
      }
    }
  }
);
client.on(
  import_discord.Events.InteractionCreate,
  async (interaction) => {
    if (!interaction.isChatInputCommand()) {
      return;
    }
    const startedAt = Date.now();
    try {
      if (!interaction.deferred && !interaction.replied) {
        const isPublicCommand = interaction.commandName === "ask";
        if (isPublicCommand) {
          await interaction.deferReply();
        } else {
          await interaction.deferReply({ flags: import_discord.MessageFlags.Ephemeral });
        }
      }
      await commandHandler.handle(
        interaction
      );
      usageStats.flush();
      import_logger.logger.info(
        `\u2705 /${interaction.commandName} completed in ${Date.now() - startedAt}ms.`
      );
    } catch (error) {
      import_logger.logger.error(
        `\u274C Command /${interaction.commandName} failed:`,
        error instanceof Error ? error.message : String(error)
      );
      try {
        const cid = `ASH-${Date.now().toString(36)}`;
        import_logger.logger.error(`[ASH][${cid}][COMMAND] /${interaction.commandName} error: ${error instanceof Error ? error.message : String(error)}`);
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({
            content: `\u274C Something went wrong while processing that command. Error ID: "${cid}".`
          });
        } else {
          await interaction.reply({
            content: `\u274C Something went wrong while processing that command. Error ID: "${cid}".`
          }).catch(() => {
          });
        }
      } catch {
        import_logger.logger.debug(
          "\u26A0\uFE0F Could not send command error response."
        );
      }
    }
  }
);
client.on(import_discord.Events.InteractionCreate, async (interaction) => {
  if (!interaction.isModalSubmit()) return;
  if (!interaction.customId.startsWith("an:")) return;
  await (0, import_settings.handleSettingsModalSubmit)(interaction);
});
const token = process.env.DISCORD_TOKEN?.trim();
if (!token) {
  import_logger.logger.error(
    "\u274C DISCORD_TOKEN is missing from .env"
  );
  process.exit(1);
}
const SHUTDOWN_TIMEOUT_MS = 15e3;
async function gracefulShutdown(signal) {
  import_logger.logger.info(`\u{1F6D1} ${signal} received \u2014 starting graceful shutdown...`);
  const forceExit = setTimeout(() => {
    import_logger.logger.error("\u23F1\uFE0F Shutdown timed out \u2014 forcing exit");
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExit.unref();
  try {
    (0, import_update_manager.stopUpdateManager)();
  } catch {
  }
  try {
    (0, import_rivalry.stopSessionCleanup)();
  } catch {
  }
  try {
    internalSupervisor.stop();
  } catch {
  }
  try {
    await agentManager.stop();
    import_logger.logger.info("\u{1F9E0} Agent stopped.");
  } catch (error) {
    import_logger.logger.warn("\u26A0\uFE0F Agent stop failed:", error instanceof Error ? error.message : String(error));
  }
  try {
    (0, import_support2.stopSupportAutomation)();
    (0, import_support2.stopConversationCleanup)();
    import_logger.logger.info("\u{1F3AB} Support automation stopped.");
  } catch {
  }
  try {
    userProfiles.flush();
    import_logger.logger.info("\u{1F464} User profiles flushed.");
  } catch {
  }
  try {
    (0, import_database.closeDatabase)();
    import_logger.logger.info("\u{1F4E6} Database closed.");
  } catch {
  }
  try {
    client.destroy();
    import_logger.logger.info("\u{1F50C} Discord disconnected.");
  } catch {
  }
  try {
    const { getHttpServer } = await import("./web/server");
    const srv = getHttpServer();
    if (srv) {
      await new Promise((resolve) => srv.close(() => resolve()));
      import_logger.logger.info("\u{1F310} HTTP server closed.");
    }
  } catch {
  }
  clearTimeout(forceExit);
  import_logger.logger.info("\u2705 Graceful shutdown complete.");
  process.exit(0);
}
process.on("uncaughtException", (error) => {
  import_logger.logger.error("\u274C UNCAUGHT EXCEPTION:", error.stack || error.message || String(error));
  try {
    internalSupervisor.stop();
  } catch {
  }
  try {
    agentManager.stop().catch(() => {
    });
  } catch {
  }
  try {
    (0, import_database.closeDatabase)();
  } catch {
  }
  try {
    client.destroy();
  } catch {
  }
  process.exit(1);
});
process.on("unhandledRejection", (reason) => {
  import_logger.logger.error("\u274C UNHANDLED REJECTION:", reason instanceof Error ? reason.stack || reason.message : String(reason));
  try {
    internalSupervisor.stop();
  } catch {
  }
  try {
    agentManager.stop().catch(() => {
    });
  } catch {
  }
  try {
    (0, import_database.closeDatabase)();
  } catch {
  }
  try {
    client.destroy();
  } catch {
  }
  process.exit(1);
});
process.on("SIGINT", () => {
  gracefulShutdown("SIGINT");
});
process.on("SIGTERM", () => {
  gracefulShutdown("SIGTERM");
});
process.on("SIGUSR2", () => {
  gracefulShutdown("SIGUSR2 (restart)");
});
let discordConnectionAttempt = 0;
let discordConnectionManagerStarted = false;
let discordRecoveryActive = false;
let discordLastFailureAt = 0;
let discordLastFailureReason = "";
let discordLastReadyAt = 0;
const SUPERVISOR_GRACE_MS = 12e4;
const internalSupervisor = new import_internalSupervisor.InternalSupervisor({
  intervalMs: 3e4,
  failureThreshold: 3,
  startupGraceMs: SUPERVISOR_GRACE_MS,
  checks: (0, import_preflight.createSupervisorChecks)(router),
  onUnhealthy: (reason) => {
    import_logger.logger.error(
      `\u{1F6A8} INTERNAL SUPERVISOR: sustained unhealthy state \u2014 ${reason}`
    );
    import_logger.logger.error(
      "\u{1F504} Exiting so the process manager can restart AshenAI."
    );
    process.exit(1);
  }
});
internalSupervisor.start();
client.on("debug", (message) => {
  const text = String(message);
  if (/heartbeat|heartbeat ack/i.test(text)) {
    return;
  }
  import_logger.logger.debug(`\u{1F527} DISCORD DEBUG: ${text}`);
});
client.on("shardDisconnect", (event, shardId) => {
  import_logger.logger.error(
    `\u{1F534} DISCORD SHARD ${shardId} DISCONNECTED: code=${event.code} reason=${event.reason || "(none)"}`
  );
});
client.on("shardReconnecting", (shardId) => {
  import_logger.logger.warn(`\u{1F7E1} DISCORD SHARD ${shardId} RECONNECTING...`);
});
client.on("shardReady", (shardId) => {
  import_logger.logger.info(`\u{1F7E2} DISCORD SHARD ${shardId} READY EVENT CONFIRMED`);
});
client.on(import_discord.Events.GuildCreate, async (guild) => {
  try {
    import_logger.logger.info(`\u{1F4E5} Joined guild: ${guild.name} (${guild.id})`);
    if ((0, import_guild_config.guildConfigExists)(guild.id)) {
      import_logger.logger.info(`\u2139\uFE0F Guild ${guild.name} already has a config \u2014 skipping onboarding.`);
      return;
    }
    let targetChannel = guild.systemChannel;
    if (!targetChannel) {
      const textChannels = guild.channels.cache.filter(
        (ch) => ch.isTextBased() && !ch.isDMBased() && ch.permissionsFor(guild.members.me)?.has("SendMessages")
      );
      const first = textChannels.first();
      if (first) {
        targetChannel = first;
      }
    }
    if (!targetChannel) {
      import_logger.logger.warn(`\u26A0\uFE0F No suitable channel found in ${guild.name} for onboarding message.`);
      return;
    }
    const onboardingEmbed = new import_discord.EmbedBuilder().setColor(2895667).setTitle("Hi! I'm AshenAI \u2014 your AI-powered server assistant.").setDescription(
      "I can help you:\n> \u{1F6E0}\uFE0F Create and customize your server\n> \u{1F916} Manage channels, roles, and permissions\n> \u{1F6E1}\uFE0F Moderate and protect your community\n> \u{1F4CB} Generate server templates\n> \u{1F4AC} Chat naturally with your server"
    ).addFields(
      {
        name: "Get Started",
        value: [
          "\u{1F4AC} **Mention me** for quick chat",
          "Use `/ask` for AI chat",
          "Use `/prompt` for server building and management",
          "Use `/help` to explore features"
        ].join("\n")
      },
      {
        name: "Trusted Users",
        value: "\u{1F510} **Server owner:** Use `/access add @user` to allow others to use server-management features.\nTrusted users can use `/send` to send messages as AshenAI."
      }
    ).setFooter({ text: "Nothing has been changed." });
    await targetChannel.send({ embeds: [onboardingEmbed] });
    (0, import_audit.recordAudit)({
      who: "system",
      what: `Sent onboarding message to ${guild.name}`,
      where: "guild-join",
      guildId: guild.id,
      result: "success"
    });
  } catch (error) {
    import_logger.logger.error(
      `\u274C Failed to send onboarding message to ${guild.name}:`,
      error instanceof Error ? error.message : String(error)
    );
  }
});
client.on("error", (error) => {
  import_logger.logger.error(
    "\u274C DISCORD CLIENT ERROR:",
    error instanceof Error ? error.stack ?? error.message : String(error)
  );
});
const DISCORD_CONNECT_TIMEOUT_MS = 6e4;
const DISCORD_INITIAL_RETRY_MS = 5e3;
const DISCORD_MAX_RETRY_MS = 6e4;
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
async function loginDiscordWithTimeout() {
  if (client.isReady()) {
    import_logger.logger.info("\u{1F7E2} Discord is already READY.");
    return;
  }
  discordConnectionAttempt += 1;
  const attempt = discordConnectionAttempt;
  import_logger.logger.info(
    `\u{1F50C} Discord Gateway connection attempt #${attempt}...`
  );
  let timeoutHandle;
  try {
    import_logger.logger.info("\u{1F9EA} Calling discord.js client.login()...");
    const loginStartedAt = Date.now();
    const loginPromise = client.login(token);
    loginPromise.then(
      () => {
        import_logger.logger.info(
          `\u{1F7E2} client.login() RESOLVED after ${Date.now() - loginStartedAt}ms.`
        );
        import_logger.logger.info(
          `\u{1F9EA} Post-login state: ready=${client.isReady()} wsStatus=${client.ws.status}`
        );
      },
      (error) => {
        import_logger.logger.error(
          "\u{1F534} client.login() REJECTED:",
          error instanceof Error ? error.stack ?? error.message : String(error)
        );
      }
    );
    const timeoutPromise = new Promise((_, reject) => {
      timeoutHandle = setTimeout(() => {
        reject(
          new Error(
            `Discord Gateway login timed out after ${DISCORD_CONNECT_TIMEOUT_MS / 1e3}s`
          )
        );
      }, DISCORD_CONNECT_TIMEOUT_MS);
    });
    await Promise.race([loginPromise, timeoutPromise]);
    if (client.isReady()) {
      import_logger.logger.info(
        `\u{1F7E2} Discord Gateway connected successfully on attempt #${attempt}.`
      );
      return;
    }
    import_logger.logger.info(
      "\u23F3 Discord login completed but READY has not fired yet. Waiting..."
    );
    await new Promise((resolve, reject) => {
      let settled = false;
      const cleanup = () => {
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }
        clearTimeout(readyTimeout);
        client.off(import_discord.Events.ClientReady, onReady);
        client.off(import_discord.Events.Error, onError);
      };
      const finish = (error) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      };
      const onReady = () => {
        import_logger.logger.info("\u{1F7E2} Discord READY event received.");
        finish();
      };
      const onError = (error) => {
        finish(error);
      };
      const readyTimeout = setTimeout(() => {
        finish(
          new Error(
            "Discord READY event was not received within 60 seconds."
          )
        );
      }, DISCORD_CONNECT_TIMEOUT_MS);
      client.once(import_discord.Events.ClientReady, onReady);
      client.once(import_discord.Events.Error, onError);
      if (client.isReady()) {
        finish();
      }
    });
    if (!client.isReady()) {
      throw new Error(
        "Discord connection completed but client is still not READY."
      );
    }
    import_logger.logger.info(
      `\u{1F7E2} Discord READY: ${client.user?.tag ?? client.user?.id ?? "unknown"}`
    );
    import_logger.logger.info(
      `\u{1F3E0} Guild count: ${client.guilds.cache.size}`
    );
  } catch (error) {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
    throw error;
  }
}
async function connectDiscordWithRecovery() {
  let retryDelay = DISCORD_INITIAL_RETRY_MS;
  discordRecoveryActive = true;
  import_logger.logger.info("\u{1F6E1}\uFE0F Discord Gateway recovery manager ACTIVE.");
  while (true) {
    try {
      await loginDiscordWithTimeout();
      discordRecoveryActive = false;
      import_logger.logger.info("\u2705 Discord Gateway is operational.");
      return true;
    } catch (error) {
      discordLastFailureAt = Date.now();
      discordLastFailureReason = error instanceof Error ? error.message : String(error);
      import_logger.logger.error(
        `\u274C Discord Gateway attempt #${discordConnectionAttempt} failed:`,
        discordLastFailureReason
      );
      if (client.isReady()) {
        import_logger.logger.info(
          "\u{1F7E2} Discord became READY despite the reported connection error."
        );
        return true;
      }
      import_logger.logger.warn(
        `\u{1F7E1} Discord Gateway unavailable. Retrying in ${Math.round(
          retryDelay / 1e3
        )}s...`
      );
      try {
        client.destroy();
      } catch (destroyError) {
        import_logger.logger.warn(
          "\u26A0\uFE0F Discord client cleanup warning:",
          destroyError instanceof Error ? destroyError.message : String(destroyError)
        );
      }
      await sleep(retryDelay);
      retryDelay = Math.min(
        retryDelay * 2,
        DISCORD_MAX_RETRY_MS
      );
    }
  }
}
async function startDiscord() {
  if (discordConnectionManagerStarted) {
    import_logger.logger.warn(
      "\u26A0\uFE0F Discord connection manager already started; ignoring duplicate startup."
    );
    return;
  }
  discordConnectionManagerStarted = true;
  try {
    (0, import_server2.startWebServer)(router, () => ({
      discordReady: client.isReady()
    }), usageManager, usageStats, void 0, memory, systemUsage);
    import_logger.logger.info("\u{1F310} Web server started.");
    import_logger.logger.info("\u{1F680} AshenAI startup beginning...");
    if (!token) {
      throw new Error("DISCORD_TOKEN is missing.");
    }
    import_logger.logger.info("\u{1F50C} Connecting to Discord Gateway...");
    const connected = await connectDiscordWithRecovery();
    if (!connected || !client.isReady()) {
      throw new Error(
        "Discord Gateway recovery manager stopped without a READY client."
      );
    }
    await startAgent();
    import_logger.logger.info("\u{1F9E0} AshenAI agent started.");
    await (0, import_tasks.initializeTaskEngine)();
    import_logger.logger.info("\u2699\uFE0F Task engine initialized.");
    (0, import_discord_health.initDiscordHealth)(client);
    import_logger.logger.info("\u{1F4E1} Discord shard observability active.");
    if (process.env.ASHENAI_AUTO_UPDATE !== "off") {
      (0, import_update_manager.startUpdateManager)();
      import_logger.logger.info("\u{1F504} Update manager active.");
    }
    (0, import_rivalry.startSessionCleanup)();
    import_logger.logger.info("\u2694\uFE0F Rivalry session cleanup active.");
    (0, import_update_manager.postStartValidation)().catch((err) => {
      import_logger.logger.warn("[UpdateManager] post-start validation error:", err instanceof Error ? err.message : String(err));
    });
  } catch (error) {
    import_logger.logger.error(
      "\u274C Discord startup manager failed:",
      error instanceof Error ? error.stack ?? error.message : String(error)
    );
    throw error;
  }
}
import_logger.logger.info("Starting AshenAI...");
startDiscord().catch((error) => {
  import_logger.logger.error("FATAL: startDiscord failed:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
