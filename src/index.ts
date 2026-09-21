import "dotenv/config";

// U10: Validate security configuration before any other initialization
import { validateSecurityConfig } from "./config/env";
validateSecurityConfig();

// Migrate owner credentials from environment to accounts.json if needed
import { setOwnerFromEnv } from "./control/account-store";
setOwnerFromEnv();

import {
  Client,
  Events,
  GatewayIntentBits,
  Partials,
  Message,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ButtonInteraction,
  MessageFlags,
} from "discord.js";

import { logger } from "./logger";
import { AgentManager } from "./agent/manager";
import { createSelfHealerCallback } from "./agent/selfHealCallback";
import { taskEngine, initializeTaskEngine } from "./agent/tasks";
import { messageRateLimiter } from "./security";
import { config } from "./config/env";
import { loadGuildConfig, guildConfigExists } from "./core/guild-config";
import { loadGuildAIConfig } from "./ai/tools/channel-scope";
import { ASHENAI_SYSTEM_PROMPT } from "./security/policy";
import { guardAIOutput } from "./security/output-guard";
import { stripSecurityLabels } from "./security/context";
import { buildAdaptivePersonality } from "./ai/adaptive-personality";
import { parseServerIntent } from "./discord/server-assistant";
import {
  isToolConfirmationId,
  handleToolConfirmation,
  setDiscordClient,
} from "./discord/interactions/confirmation-handler";
import {
  handleConversation,
  classifyIntent,
} from "./discord/conversational-agent";
import { closeDatabase, getDatabaseStats } from "./database";
import { isAnimeActionPrefix, handleAnimeAction } from "./games/anime-actions";

import { providers } from "./ai/providers";
import { AIRouter } from "./ai/router";
import { ConversationMemory } from "./ai/memory";
import { UserProfileMemory } from "./ai/user-profile";
import { UsageManager } from "./ai/usage-manager";
import { SystemUsageManager } from "./ai/system-usage";
import { GuildKnowledge } from "./ai/knowledge";
import { VisionHandler } from "./ai/vision";
import { CaseManager } from "./moderation/cases";
import { XPSystem } from "./community/xp-system";
import { SuggestionManager } from "./community/suggestions";
import { EventManager } from "./community/events";
import { ReactionRoleManager } from "./community/reaction-roles";
import { runHealthCheck } from "./core/health-checker";
import { runPreflight, createSupervisorChecks } from "./core/preflight";
import { autoBackup } from "./core/backup-manager";
import { checkLoad, recordRequest } from "./core/load-manager";
import { detectHostProvider } from "./core/resource-profile";

import { AshenCommand } from "./commands/definitions";
import { CommandHandler } from "./commands/handler";
import { createAskCommand } from "./commands/ask";
import { createResetCommand } from "./commands/reset";
import { createHelpCommand } from "./commands/help";
import { createStatusCommand } from "./commands/status";
import { createGameCommand } from "./commands/game";
import { getBlackjackGame, hitBlackjack, standBlackjack, handText, calculateTotal,
} from "./games/games/blackjack";

import {
  getMinesGame,
  revealMinesTile,
  cashOutMines,
} from "./games/games/mines";

import {
  getQuickDraw,
  reactQuickDraw,
} from "./games/games/quickdraw";
import { getPlayer } from "./games/store";
import { syncCommands } from "./commands/register";
import { detectActionIntent } from "./discord/action-router";
import { executeInteractiveModeration } from "./discord/interactive-moderation";
import {
  createActionKey,
  createExpiration,
  getPendingAction,
  setPendingAction,
  clearPendingAction,
} from "./discord/action-confirmations";
import { createServerCommand } from "./commands/server";
import { createModerationCommand } from "./commands/moderation";
import { createSupportCommand } from "./commands/support";
import { createAccessCommand } from "./commands/access";
import { createPromptCommand, processBuilderMessage, getBuilderSession, cleanupExpiredSessions } from "./commands/prompt";
import { createPersonalityCommand } from "./commands/personality";
import { createSettingsCommand, handleSettingsModalSubmit } from "./commands/settings";
import {
  startSupportAutomation,
  stopSupportAutomation,
  startConversationCleanup,
  stopConversationCleanup,
} from "./support";
import { getServerContext } from "./discord/server-context";
import { startWebServer } from "./web/server";
import { InternalSupervisor } from "./core/internalSupervisor";
import { UsageStats } from "./analytics/usage-stats";
import { initDiscordHealth, getDiscordHealth } from "./core/discord-health";
import { startUpdateManager, stopUpdateManager, getUpdateStatus, postStartValidation } from "./core/update-manager";

import {
  classifyParticipant,
  reclassifyFromResponse,
  detectRivalryIntent,
  isAshenAIMentioned,
  isRefusal,
  isEndRivalryIntent,
  createSession,
  getActiveSession,
  isOpponent,
  recordAshenAITurn,
  recordOpponentTurn,
  endSession,
  isOpponentTimedOut,
  startSessionCleanup,
  stopSessionCleanup,
  generateOpeningChallenge,
  generateChallenge,
  generateRoast,
  generateAcknowledgment,
  generateRefusalResponse,
  generateSessionEnd,
  classifyOpponentResponse,
  buildRivalrySystemPrompt,
} from "./ai/rivalry";
import type { RivalrySession } from "./ai/rivalry";

import { recordWorldEvent, checkLevelMilestone, announceWorldEvent } from "./games/world-events";
import { updateQuestProgress } from "./games/quests";
import { recordAudit } from "./security/audit";
import { StageTimer } from "./ai/timing";

/* =====================================================
   DISCORD CLIENT
   ===================================================== */

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent,
  ],

  partials: [
    Partials.Channel,
    Partials.Message,
  ],

});


const router = new AIRouter(providers);

// Unified preflight — run once at startup, then feed into InternalSupervisor
void runPreflight(router, { logLevel: "compact" }).catch((error) => {
  logger.warn("Preflight failed:", error instanceof Error ? error.message : String(error));
});

const memory = new ConversationMemory();
const userProfiles = new UserProfileMemory();
const usageStats = new UsageStats();
const usageManager = new UsageManager();
const systemUsage = new SystemUsageManager();
const knowledge = new GuildKnowledge();
const vision = new VisionHandler(usageManager);
const caseManager = new CaseManager();
const xpSystem = new XPSystem();
const suggestionManager = new SuggestionManager();
const eventManager = new EventManager();
const reactionRoleManager = new ReactionRoleManager();

const usageStatsTimer = setInterval(
  () => usageStats.logSummary(),
  5 * 60 * 1000,
);

usageStatsTimer.unref();

const backupTimer = setInterval(() => autoBackup(), 6 * 60 * 60 * 1000);
backupTimer.unref();

const commandHandler = new CommandHandler([], usageStats);
const agentManager = new AgentManager(router, undefined, systemUsage);

// Task engine initializes after Discord READY.


/* =====================================================
   COMMANDS
   ===================================================== */

const commands: AshenCommand[] = [
  createAskCommand(router, memory, usageManager),
  createGameCommand(),
  createResetCommand(memory),
  createStatusCommand(router, memory, agentManager),
  createServerCommand(),
  createModerationCommand(),
  createSupportCommand(),
  createAccessCommand(),
  createPromptCommand(),
  createPersonalityCommand(),
  createSettingsCommand(),
];

// Help command derives its display from the registered public commands.
commands.push(createHelpCommand(commands));

commandHandler.registerMany(commands);

/* =====================================================
   BROWSER AGENT STARTUP
   ===================================================== */

import { getBrowserManager, registerBrowserTools } from "./web/browser";
import { toolRegistry } from "./ai/tools/registry";
import { createDiscordTools } from "./ai/tools/discord";

// Register all Discord tools in the global ToolRegistry.
// This enables executeTool(), checkFullAuthorization(), and the confirmation handler
// to look up tools by name. Without this, every Discord tool lookup returns undefined.
toolRegistry.registerAll(createDiscordTools(() => client));

async function startBrowser(): Promise<void> {
  try {
    const manager = getBrowserManager();
    const available = await manager.initialize();
    if (available) {
      // Register browser tools in the tool registry for executeTool pipeline
      registerBrowserTools(toolRegistry);
      logger.info("🌐 Browser agent is online.");
    } else {
      logger.info("ℹ️ Browser agent disabled (Chromium unavailable). HTTP pipeline remains active.");
    }
  } catch (error) {
    logger.warn(
      `⚠️ Browser agent startup failed: ${error instanceof Error ? error.message : String(error)}. HTTP pipeline remains active.`
    );
  }
}

/* =====================================================
   AGENT STARTUP
   ===================================================== */

async function startAgent(): Promise<void> {
  try {
    await agentManager.start();

    logger.info(
      "🧠 Interactive agent is online and connected to AshenAI."
    );
  } catch (error) {
    logger.error(
      "❌ Interactive agent startup failed:",
      error instanceof Error ? error.message : String(error)
    );

    throw error;
  }
}

/* =====================================================
   MESSAGE HELPERS
   ===================================================== */

function cleanBotMention(
  content: string,
  botId: string
): string {
  return content
    .replace(new RegExp(`<@!?${botId}>`, "g"), "")
    .trim();
}

function truncateForDiscord(text: string): string {
  if (text.length <= 1900) {
    return text;
  }

  return `${text.slice(0, 1890)}\n…`;
}

async function getReferencedMessage(
  message: Message
): Promise<Message | null> {
  if (!message.reference?.messageId) {
    return null;
  }

  try {
    return await message.fetchReference();
  } catch (error) {
    logger.debug(
      "⚠️ Could not fetch referenced message."
    );

    return null;
  }
}

/* =====================================================
   INTERACTIVE CONTEXT
   ===================================================== */

async function buildInteractiveContext(
  message: Message,
  content: string,
  botId: string,
  alreadyFetchedRef?: Message | null
): Promise<string> {
  const contextParts: string[] = [];

  const referencedMessage = alreadyFetchedRef ?? await getReferencedMessage(message);

  /*
   * Add safe Discord server/user context.
   */
  let targetMember = null;

  if (message.guild && message.mentions.users.size > 0) {
    const targetUser = [...message.mentions.users.values()]
      .find((user) => user.id !== botId);

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
    getServerContext(message, targetMember)
  );

  /*
   * The message the user is replying to.
   */
  if (referencedMessage) {
    const author = referencedMessage.author;
    const referencedContent =
      referencedMessage.content?.trim() || "(no text content)";

    contextParts.push(
      "Referenced Discord message:",
      `Author: ${author.tag}`,
      `Author ID: ${author.id}`,
      `Message: ${referencedContent}`
    );
  }

  /*
   * People explicitly mentioned in the user's message.
   * Exclude AshenAI itself because its mention is only
   * used to trigger the interactive handler.
   */
  const mentionedUsers = [...message.mentions.users.values()]
    .filter((user) => user.id !== botId);

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

  /*
   * Tell the model how to interpret the interaction.
   */
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

  const currentMessage =
    content.trim() || "What do you say about this?";

  if (contextParts.length === 0) {
    return currentMessage;
  }

  return [
    currentMessage,
    "",
    ...contextParts
  ].join("\n");
}

/* =====================================================
   READY
   ===================================================== */

client.once(
  Events.ClientReady,
  async (readyClient) => {
    logger.info("Starting AshenAI...");
    logger.info(
      `✅ Logged in as ${readyClient.user.tag}`
    );

    try {
      /*
       * Start Discord command synchronization and the
       * AshenAI background agent together.
       */
      await syncCommands(
          commands.map((command) => command.data)
        );

      logger.info(
        `✅ Slash commands synchronized: ${commands.length}`
      );

      /*
       * Start the browser agent (optional — degrades gracefully if Chromium unavailable).
       */
      await startBrowser();

      /*
       * Start the interactive Discord conversation
       * system after the core agent is online.
       */
      await startAgent();

      logger.info(
        "🧠 Interactive mention/reply system ready."
      );

      // Start support system automation (stale detection, reminders, auto-close)
      startSupportAutomation(client);
      startConversationCleanup();

      logger.info(
        "🟢 AshenAI Discord bot + AI agent are ONLINE."
      );

      // Wire U5 tool confirmation handler
      setDiscordClient(client);
    } catch (error) {
      logger.error(
        "❌ Startup initialization failed:",
        error instanceof Error
          ? error.message
          : String(error)
      );
    }
  }
);


/* =====================================================
   DISCORD GATEWAY WATCHDOG
   ===================================================== */

let discordWatchdogStarted = false;
let discordReadyAt = 0;

client.once(Events.ClientReady, () => {
  discordReadyAt = Date.now();
  discordLastReadyAt = discordReadyAt;

  if (discordWatchdogStarted) return;
  discordWatchdogStarted = true;

  logger.info("Discord gateway watchdog started");

  const watchdog = setInterval(() => {
    const now = Date.now();

    /*
     * Give Discord.js time to finish normal startup.
     */
    if (now - discordReadyAt < 120_000) {
      return;
    }

    if (!client.isReady()) {
      if (detectHostProvider() === "render") {
        logger.error(
          "DISCORD WATCHDOG: client is no longer ready. Exiting for Render restart."
        );
        clearInterval(watchdog);
        process.exit(1);
      } else {
        logger.warn(
          "DISCORD WATCHDOG: client is no longer ready. Recovery loop will handle reconnection."
        );
      }
      return;
    }

    const ws = client.ws;

    if (!ws || ws.shards.size === 0) {
      if (detectHostProvider() === "render") {
        logger.error(
          "DISCORD WATCHDOG: Discord WebSocket shard manager unavailable. Exiting."
        );
        clearInterval(watchdog);
        process.exit(1);
      } else {
        logger.warn(
          "DISCORD WATCHDOG: Discord WebSocket shard manager unavailable. Recovery loop will handle reconnection."
        );
      }
      return;
    }

    for (const [shardId, shard] of ws.shards) {
      const shardStatus = shard.status;
      const ping = shard.ping;
      const lastPing = shard.lastPingTimestamp;

      /*
       * A shard that isn't ready/connected should normally recover
       * through discord.js. We only terminate if it remains unhealthy
       * for a sustained period.
       */
      if (!Number.isFinite(lastPing) || lastPing <= 0) {
        logger.warn(
          `DISCORD WATCHDOG: shard=${shardId} has no heartbeat timestamp; status=${shardStatus}`
        );
        continue;
      }

      const heartbeatAge = now - lastPing;

      logger.debug(
        `Discord gateway check: shard=${shardId} status=${shardStatus} ping=${ping}ms heartbeatAge=${heartbeatAge}ms`
      );

      /*
       * Discord normally heartbeats frequently. A heartbeat older
       * than 5 minutes is treated as a genuinely stale gateway.
       */
      if (heartbeatAge > 300_000) {
        if (detectHostProvider() === "render") {
          logger.error(
            `DISCORD WATCHDOG: shard=${shardId} heartbeat is stale (${heartbeatAge}ms). Exiting for Render restart.`
          );
          clearInterval(watchdog);
          process.exit(1);
        } else {
          logger.warn(
            `DISCORD WATCHDOG: shard=${shardId} heartbeat is stale (${heartbeatAge}ms). Recovery loop will handle reconnection.`
          );
        }
      }
    }
  }, 30_000);

  logger.info(
    "Discord gateway watchdog active: checking every 30s, stale threshold 5m"
  );
});

/*
 * Useful gateway lifecycle logging.
 */
client.on(Events.ShardResume, (id, replayedEvents) => {
  logger.info(
    `Discord shard ${id} resumed (replayed=${replayedEvents})`
  );
});

client.on(Events.Invalidated, () => {
  logger.error("Discord session invalidated");
});

client.on(Events.Warn, (warning) => {
  logger.warn(`Discord warning: ${warning}`);
});

/* =====================================================
   BLACKJACK BUTTONS
   ===================================================== */

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isButton()) {
    return;
  }

  if (
    interaction.customId !== "ashen_blackjack_hit" &&
    interaction.customId !== "ashen_blackjack_stand"
  ) {
    return;
  }

  try {
    const player = await getPlayer(
      interaction.user.id,
      interaction.user.username,
    );

    const game = getBlackjackGame(player.userId);

    if (!game) {
      await interaction.reply({
        content: "🃏 You don't have an active Blackjack game.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (interaction.customId === "ashen_blackjack_hit") {
      hitBlackjack(game);

      const playerTotal = calculateTotal(game.playerCards);

      if (playerTotal > 21) {
        const result = await standBlackjack(player, game);

        const embed = new EmbedBuilder()
          .setTitle("🃏 Ashen Blackjack")
          .setDescription(
            `**Your Cards**\n${handText(game.playerCards)}\n` +
              `**Total:** ${result.playerTotal}\n\n` +
              `**Dealer Cards**\n${handText(game.dealerCards)}\n` +
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

        await interaction.update({
          embeds: [embed],
          components: [],
        });

        return;
      }

      const embed = new EmbedBuilder()
        .setTitle("🃏 Ashen Blackjack")
        .setDescription(
          `**Your Cards**\n${handText(game.playerCards)}\n\n` +
            `**Your Total:** ${playerTotal}\n\n` +
            `**Dealer**\n${handText([game.dealerCards[0]])} ❓\n\n` +
            `🪙 Bet: **${game.bet} coins**`,
        );

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
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

      await interaction.update({
        embeds: [embed],
        components: [row],
      });

      return;
    }

    const result = await standBlackjack(player, game);

    const embed = new EmbedBuilder()
      .setTitle("🃏 Ashen Blackjack")
      .setDescription(
        `**Your Cards**\n${handText(game.playerCards)}\n` +
          `**Total:** ${result.playerTotal}\n\n` +
          `**Dealer Cards**\n${handText(game.dealerCards)}\n` +
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

    await interaction.update({
      embeds: [embed],
      components: [],
    });
  } catch (error) {
    logger.error(
      "❌ Blackjack button handler failed:",
      error,
    );

    const message =
      error instanceof Error ? error.message : String(error);

    if (message === "BLACKJACK_FINISHED") {
      await interaction.reply({
        content: "🃏 This Blackjack game has already finished.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: "❌ Something went wrong while processing Blackjack.",
        flags: MessageFlags.Ephemeral,
      });
    }
  }
});

/* =====================================================
   MINES + QUICKDRAW BUTTONS
   ===================================================== */

function buildMinesButtons(
  revealed: Set<number>,
): ActionRowBuilder<ButtonBuilder>[] {
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];

  for (let row = 0; row < 4; row++) {
    const buttons = new ActionRowBuilder<ButtonBuilder>();

    for (let col = 0; col < 4; col++) {
      const tile = row * 4 + col;
      const isRevealed = revealed.has(tile);

      buttons.addComponents(
        new ButtonBuilder()
          .setCustomId(`ashen_mines:reveal:${tile}`)
          .setLabel(isRevealed ? "✅" : `${tile + 1}`)
          .setStyle(
            isRevealed
              ? ButtonStyle.Secondary
              : ButtonStyle.Primary,
          )
          .setDisabled(isRevealed),
      );
    }

    rows.push(buttons);
  }

  rows.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("ashen_mines:cashout")
        .setLabel("Cash Out")
        .setEmoji("💰")
        .setStyle(ButtonStyle.Success),
    ),
  );

  return rows;
}

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isButton()) {
    return;
  }

  const isMines =
    interaction.customId.startsWith("ashen_mines:");
  const isQuickDraw =
    interaction.customId === "ashen_quickdraw:draw";

  if (!isMines && !isQuickDraw) {
    return;
  }

  try {
    const player = await getPlayer(
      interaction.user.id,
      interaction.user.username,
    );

    /* ---------------- MINES ---------------- */

    if (isMines) {
      const game = getMinesGame(player.userId);

      if (!game) {
        await interaction.reply({
          content: "💣 You don't have an active Mines game.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      // Prevent another user's button from controlling this game.
      if (game.playerId !== interaction.user.id) {
        await interaction.reply({
          content: "❌ This Mines game belongs to another player.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      if (interaction.customId === "ashen_mines:cashout") {
        const result = await cashOutMines(player, game);

        const embed = new EmbedBuilder()
          .setTitle("💣 Ashen Mines")
          .setDescription(
            `💰 **Cashed out!**\n\n` +
            `Multiplier: **${game.multiplier.toFixed(2)}x**`,
          )
          .addFields(
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

        if (result.levelUp) {
          embed.addFields({
            name: "🎉 Level Up!",
            value: `You reached **Level ${player.level}**!`,
          });
        }

        await interaction.update({
          embeds: [embed],
          components: [],
        });

        return;
      }

      const parts = interaction.customId.split(":");
      const tile = Number(parts[2]);

      const result = await revealMinesTile(
        player,
        game,
        tile,
      );

      if (result.mine) {
        const embed = new EmbedBuilder()
          .setTitle("💣 Ashen Mines")
          .setDescription(
            `💥 **BOOM! You hit a mine.**\n\n` +
            `Tile: **${result.tile + 1}**\n` +
            `Multiplier: **0x**\n\n` +
            `You lost your **${game.bet} coin** bet.`,
          )
          .addFields({
            name: "✨ XP",
            value: "+5",
            inline: true,
          });

        await interaction.update({
          embeds: [embed],
          components: [],
        });

        return;
      }

      const embed = new EmbedBuilder()
        .setTitle("💣 Ashen Mines")
        .setDescription(
          `✅ **Safe tile!**\n\n` +
          `Tile: **${result.tile + 1}**\n` +
          `Multiplier: **${result.multiplier.toFixed(2)}x**\n` +
          `Potential payout: **${result.payout} coins**\n\n` +
          `Keep going or cash out.`,
        );

      await interaction.update({
        embeds: [embed],
        components: buildMinesButtons(game.revealed),
      });

      return;
    }

    /* ---------------- QUICKDRAW ---------------- */

    const quickDraw = getQuickDraw(player.userId);

    if (!quickDraw) {
      await interaction.reply({
        content: "⚡ You don't have an active QuickDraw game.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (quickDraw.playerId !== interaction.user.id) {
      await interaction.reply({
        content: "❌ This QuickDraw game belongs to another player.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const result = await reactQuickDraw(
      player,
      quickDraw,
    );

    const embed = new EmbedBuilder()
      .setTitle("⚡ Ashen QuickDraw");

    if (result.reactionTime === 0) {
      embed
        .setDescription(
          "💀 **Too early!**\n\n" +
          "You drew before the signal.",
        )
        .addFields(
          {
            name: "🪙 Coins",
            value: `${result.coins} coins`,
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
    } else {
      embed
        .setDescription(
          result.won
            ? `🎯 **DRAW! You were fast enough!**\n\nReaction time: **${result.reactionTime}ms**`
            : `💀 **Too slow!**\n\nReaction time: **${result.reactionTime}ms**`,
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
            name: "🪙 Balance",
            value: `${player.coins}`,
            inline: true,
          },
        );
    }

    if (result.levelUp) {
      embed.addFields({
        name: "🎉 Level Up!",
        value: `You reached **Level ${player.level}**!`,
      });
    }

    await interaction.update({
      embeds: [embed],
      components: [],
    });
  } catch (error) {
    logger.error(
      "❌ Mines/QuickDraw button handler failed:",
      error,
    );

    const message =
      error instanceof Error
        ? error.message
        : String(error);

    let content =
      "❌ Something went wrong while processing the game.";

    if (message === "MINES_FINISHED") {
      content = "💣 This Mines game has already finished.";
    } else if (message === "MINES_TILE_ALREADY_REVEALED") {
      content = "💣 That tile has already been revealed.";
    } else if (message === "INVALID_MINES_TILE") {
      content = "💣 Invalid Mines tile.";
    } else if (message === "MINES_NO_REVEALS") {
      content = "💣 Reveal at least one safe tile before cashing out.";
    } else if (message === "QUICKDRAW_FINISHED") {
      content = "⚡ This QuickDraw game has already finished.";
    }

    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content,
        flags: MessageFlags.Ephemeral,
      });
    }
  }
});

/* =====================================================
   MODERATION CONFIRMATION BUTTONS
   ===================================================== */



client.on(
  Events.InteractionCreate,
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

    if (
      interaction.user.id !== userId ||
      interaction.channelId !== channelId
    ) {
      await interaction.reply({
        content: "❌ This confirmation belongs to another user.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const actionKey = createActionKey(userId, channelId);
    const pendingAction = getPendingAction(actionKey);

    if (!pendingAction) {
      await interaction.update({
        content: "⌛ This moderation confirmation has expired.",
        components: [],
      });
      return;
    }

    if (interaction.customId.endsWith(":cancel")) {
      clearPendingAction(actionKey);

      await interaction.update({
        content: "❌ Moderation action cancelled.",
        components: [],
      });

      return;
    }

    if (interaction.customId.endsWith(":confirm")) {
      if (!interaction.guild) {
        await interaction.update({
          content: "❌ This action can only be used inside a server.",
          components: [],
        });
        clearPendingAction(actionKey);
        return;
      }

      try {
        const guild = interaction.guild;

        const requester = await guild.members.fetch(
          interaction.user.id
        );

        if (!pendingAction.targetUserId) {
          await interaction.update({
            content:
              "❌ No valid target was found for this moderation action.",
            components: [],
          });

          clearPendingAction(actionKey);
          return;
        }

        const target = await guild.members.fetch(
          pendingAction.targetUserId
        );

        const botMember = await guild.members.fetch(
          client.user!.id
        );

        const result =
          await executeInteractiveModeration(
            requester,
            target,
            botMember,
            pendingAction.action,
            pendingAction.durationMinutes,
            pendingAction.reason ||
              "Interactive moderation action"
          );

        clearPendingAction(actionKey);

        await interaction.update({
          content: result.message,
          components: [],
        });

        logger.info(
          `${result.success ? "✅" : "❌"} Interactive moderation result: ${result.message}`
        );
      } catch (error) {
        clearPendingAction(actionKey);

        logger.error(
          "❌ Interactive moderation execution failed:",
          error instanceof Error
            ? error.message
            : String(error)
        );

        await interaction.update({
          content:
            "❌ I couldn't execute that moderation action. The member may no longer exist or Discord may have rejected the action.",
          components: [],
        });
      }
    }
  }
);

/* =====================================================
   U5 TOOL CONFIRMATION HANDLER
   ===================================================== */

client.on(
  Events.InteractionCreate,
  async (interaction) => {
    if (!interaction.isButton()) return;
    if (!isToolConfirmationId(interaction.customId)) return;
    try {
      await handleToolConfirmation(interaction);
    } catch (error) {
      logger.error(`Tool confirmation handler error: ${error instanceof Error ? error.message : String(error)}`);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: "❌ An error occurred processing this confirmation.",
          flags: MessageFlags.Ephemeral,
        }).catch(() => {});
      }
    }
  }
);

/* =====================================================
   RIVALRY OPPONENT RESPONSE HANDLER
   ===================================================== */

/**
 * Handle a response from a rivalry opponent (a real Discord bot).
 * Classifies the opponent, records their turn, generates AshenAI's next move.
 */
async function handleRivalryOpponentResponse(
  message: Message,
  session: RivalrySession,
  client: Client
): Promise<void> {
  try {
    const content = message.content;

    // Check for refusal
    if (isRefusal(content)) {
      const refusalText = generateRefusalResponse(session);
      await message.reply(truncateForDiscord(refusalText));
      endSession(
        session.guildId,
        session.channelId,
        "ended_refusal",
        "opponent_refused"
      );
      return;
    }

    // Record opponent turn
    const opponentTurn = recordOpponentTurn(
      session,
      content
    );

    if (!opponentTurn) {
      // Session ended or duplicate — nothing to do
      return;
    }

    // Classify opponent response quality
    const quality = classifyOpponentResponse(content);

    // Generate AshenAI's response
    let responseText: string;

    if (quality === "strong") {
      responseText = generateAcknowledgment(
        session,
        content
      );
    } else if (quality === "weak") {
      responseText = generateRoast(session, content);
    } else {
      responseText = "";
    }

    // Generate next challenge via AI
    const challenge = generateChallenge(session, content);

    const messages = [
      {
        role: "system" as const,
        content: buildRivalrySystemPrompt(session),
      },
      {
        role: "user" as const,
        content:
          `The opponent (${session.opponentDisplayName}) just said:\n\n"${content}"\n\n` +
          `Respond with your next challenge. Be competitive. Target their arguments or capabilities. ` +
          `Do not use @everyone. Keep it under 1500 characters.`,
      },
    ];

    const aiResponse = await router.generate({
      messages,
      temperature: 0.8,
      maxTokens: 600,
      guildId: session.guildId,
      userId: session.initiatorUserId,
      channelId: session.channelId,
      source: "ai_to_ai",
    });

    if (aiResponse?.text?.trim()) {
      const reply = truncateForDiscord(
        stripSecurityLabels(
          guardAIOutput(aiResponse.text).text
        )
      );

      // Prepend quality-based reaction if applicable
      const fullResponse = responseText
        ? `${responseText}\n\n${reply}`
        : reply;

      recordAshenAITurn(
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
        success: true,
      });
    } else {
      // Fallback: send the challenge text directly
      const fallback = responseText
        ? `${responseText}\n\n${challenge.text}`
        : challenge.text;

      recordAshenAITurn(
        session,
        fallback,
        challenge.challengeDomain
      );

      await message.reply(
        truncateForDiscord(fallback)
      );
    }

    // Check if turn limit reached after this exchange
    if (session.turn >= session.maxTurns) {
      const endText = generateSessionEnd(session);
      if ("send" in message.channel) {
        await message.channel.send(endText);
      }
      endSession(
        session.guildId,
        session.channelId,
        "ended_limit",
        "max_turns_reached"
      );
    }
  } catch (error) {
    logger.error(
      "❌ Rivalry opponent response failed:",
      error instanceof Error
        ? error.message
        : String(error)
    );

    endSession(
      session.guildId,
      session.channelId,
      "ended_error",
      error instanceof Error
        ? error.message
        : "unknown_error"
    );
  }
}

/* =====================================================
   INTERACTIVE MESSAGE HANDLER
   ===================================================== */

// Message deduplication: prevent processing the same message twice
// (e.g., from Discord gateway redelivery or race conditions)
const processedMessages = new Set<string>();
const MESSAGE_DEDUP_TTL_MS = 30_000;

setInterval(() => {
  processedMessages.clear();
}, MESSAGE_DEDUP_TTL_MS).unref();

client.on(
  Events.MessageCreate,
  async (message) => {
    const t = new StageTimer("mention");
    const userId = message.author.id;
    const channelId = message.channel.id;
    const guildId = message.guild?.id || "";
    let usageCheck: { allowed: boolean; reason?: string; credits: number; retryAfterMs?: number } = { allowed: true, credits: 0 };
    let replySent = false;

    try {
      // Deduplication: skip if this message was already processed
      if (processedMessages.has(message.id)) {
        return;
      }
      processedMessages.add(message.id);

      t.mark("dedup");

      /*
       * Never respond to bots — unless this bot is an opponent
       * in an active rivalry session in this channel.
       */
      if (message.author.bot) {
        // Need botId for rivalry session lookup
        const selfBotId = client.user?.id;
        if (selfBotId) {
          const rivalrySession = getActiveSession(
            guildId,
            channelId
          );

          if (
            rivalrySession &&
            rivalrySession.opponentId === userId
          ) {
            await handleRivalryOpponentResponse(
              message,
              rivalrySession,
              client
            );
          }
        }

        return;
      }

      logger.debug(`Message received: userId=${userId} channelId=${channelId} length=${message.content.length}`);

      const botId = client.user?.id;

      if (!botId) {
        return;
      }

      const isDM =
        message.channel.isDMBased();

      const isMention =
        message.mentions.users.has(botId);

      /*
       * Assistant channel restriction.
       * When a guild has configured an assistantChannelId,
       * only respond in that specific channel.
       */
      if (!isDM && message.guild) {
        const guildConfig = loadGuildConfig(message.guild.id);
        if (guildConfig.assistantChannelId && channelId !== guildConfig.assistantChannelId) {
          return;
        }
      }

      /*
       * Check whether this message is replying
       * directly to AshenAI.
       */
      let isReplyToBot = false;

      const referencedMessage =
        await getReferencedMessage(message);
      t.mark("fetch_ref");

        if (referencedMessage) {
          isReplyToBot =
            referencedMessage.author.id === botId;
        }

      /*
       * ANIME ACTION PREFIX: "ash <action> @user"
       * Intercept before the normal trigger check.
       */
      if (isAnimeActionPrefix(message.content)) {
        try {
          await handleAnimeAction(message, client);
        } catch (error) {
          logger.warn("Anime action error:", error instanceof Error ? error.message : String(error));
        }
        return;
      }

      /*
       * Only interact when:
       *
       * DM
       * mention
       * reply to AshenAI
       */
      if (
        !isDM &&
        !isMention &&
        !isReplyToBot
      ) {
        return;
      }

      // Record only messages that AshenAI actually handles.
      // Deferred to after response — no sync I/O in critical path.
      recordRequest();

      /*
       * Remove AshenAI's mention.
       */
      let content =
        cleanBotMention(
          message.content.trim(),
          botId
        );

      /*
       * If this is a mention/reply with no text,
       * give a simple greeting instead of calling AI.
       */
      if (!content && !referencedMessage) {
        await message.reply(
          "👋 Hi! Mention me with a question and I'll answer."
        );
        replySent = true;

        return;
      }

      /*
       * Rate limit.
       */
      const rateLimit =
        messageRateLimiter.check(userId);

      if (!rateLimit.allowed) {
        const retrySeconds =
          Math.max(
            1,
            Math.ceil(
              rateLimit.retryAfterMs / 1000
            )
          );

        await message.reply(
          `⏳ You're sending messages too quickly. Please try again in ${retrySeconds}s.`
        );
        replySent = true;

        logger.warn(
          `🛑 Rate limit blocked ${message.author.tag} (${userId}).`
        );

        return;
      }

      /*
       * Rivalry detection.
       * Check if this message triggers or continues a rivalry session.
       */
      if (!isDM && message.guild) {
        // Check for end-rivalry intent from the initiator
        const existingSession = getActiveSession(
          guildId,
          channelId
        );

        if (
          existingSession &&
          existingSession.initiatorUserId === userId
        ) {
          if (isEndRivalryIntent(content)) {
            const ended = endSession(
              guildId,
              channelId,
              "ended_human",
              "user_ended"
            );

            if (ended) {
              await message.reply(
                generateSessionEnd(ended)
              );
              replySent = true;
              return;
            }
          }
        }

        // Check for rivalry trigger: human mentions AshenAI + other bot(s) + rivalry keywords
        if (isMention) {
          // Use message.mentions.users — always populated from Discord gateway.
          // Do NOT use guild.members.fetch() which requires GuildMembers intent and silently fails.
          const mentionedBotIds: string[] = [];
          for (const [, user] of message.mentions.users) {
            if (user.id !== botId && user.bot) {
              mentionedBotIds.push(user.id);
            }
          }

          logger.debug(
            `[RIVALRY] ashenAIId=${botId} isMention=${isMention} ` +
            `cleanedContent="${content}" mentionedBotIds=[${mentionedBotIds}] ` +
            `mentionedUserCount=${message.mentions.users.size}`
          );

          const trigger = detectRivalryIntent(
            content,
            mentionedBotIds,
            botId
          );

          if (
            trigger.isRivalry &&
            mentionedBotIds.length > 0
          ) {
            // Get opponent info from message.mentions.users (always available)
            const opponentDiscordUser = message.mentions.users.get(mentionedBotIds[0]);

            const opponent = classifyParticipant({
              userId: mentionedBotIds[0],
              displayName:
                opponentDiscordUser?.displayName ??
                opponentDiscordUser?.username ??
                "Unknown Bot",
              botFlag: true,
              contextMessage: content,
            });

            logger.info(
              `[RIVALRY] Session creating: opponent=${opponent.displayName} (${mentionedBotIds[0]}) ` +
              `classification=${opponent.classification} keywords=[${trigger.rivalryKeywords}]`
            );

            const session = createSession({
              guildId,
              channelId,
              initiatorUserId: userId,
              ashenAIId: botId,
              opponent,
            });

            logger.info(
              `[RIVALRY] Session created: id=${session.id} opponent=${session.opponentDisplayName} ` +
              `guild=${guildId} channel=${channelId} initiator=${userId}`
            );

            // Generate opening challenge
            const opening =
              generateOpeningChallenge(session);
            recordAshenAITurn(
              session,
              opening.text,
              opening.challengeDomain
            );

            // Check usage before sending
            const usage =
              usageManager.check(
                userId,
                guildId,
                "ai_to_ai",
                content.length
              );

            if (!usage.allowed) {
              await endSession(
                guildId,
                channelId,
                "ended_error",
                "usage_limit"
              );
              await message.reply(
                "⏳ You've reached your interaction limit. Rivalry cannot start right now."
              );
              replySent = true;
              return;
            }

            // Send opening challenge via AI for natural phrasing
            const messages = [
              {
                role: "system" as const,
                content: buildRivalrySystemPrompt(session),
              },
              {
                role: "user" as const,
                content: `Generate your opening challenge to ${opponent.displayName}. Be competitive and direct. Do not use @everyone. Keep it under 1500 characters.`,
              },
            ];

            const response = await router.generate({
              messages,
              temperature: 0.8,
              maxTokens: 600,
              guildId,
              userId,
              channelId,
              source: "ai_to_ai",
            });

            if (response?.text?.trim()) {
              const reply = truncateForDiscord(
                stripSecurityLabels(
                  guardAIOutput(response.text).text
                )
              );

              await message.reply(reply);
              replySent = true;

              usageManager.recordDeferred({
                userId,
                guildId,
                feature: "ai_to_ai",
                credits: usage.credits,
                provider: response.provider,
                latencyMs: response.latencyMs,
                success: true,
              });

              memory.addBatch(
                userId,
                { role: "user", content },
                channelId
              );
              memory.addBatch(
                userId,
                { role: "assistant", content: reply },
                channelId
              );
            } else {
              // Fallback: send the generated opening directly
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

        // Check for opponent response in active rivalry
        if (
          existingSession &&
          existingSession.opponentId === userId
        ) {
          // This shouldn't happen (bot messages are filtered above),
          // but handle it defensively
          return;
        }
      }

      /*
       * Creator question.
       */
      const creatorQuestion =
        /\b(who|what)\b.*\b(creator|created|made|owner)\b/i.test(
          content
        ) ||
        /\bwho('?s| is)\b.*\b(owner|creator)\b/i.test(
          content
        );

      if (creatorQuestion) {
        const creatorId =
          config.creator.discord;

        await message.reply(
          creatorId
            ? `👑 My creator is <@${creatorId}>.`
            : "👑 My creator is not configured yet."
        );
        replySent = true;

        return;
      }

      /*
       * Build special context when the user is
       * commenting on another Discord message.
       */
      const rawInteractiveContent =
        await buildInteractiveContext(
          message,
          content,
          botId,
          referencedMessage
        );
      t.mark("build_context");

      /*
       * Security: Discord conversation context is NOT wrapped with
       * [UNTRUSTED] labels. The system prompt contains security
       * instructions that prevent secret disclosure and prompt injection.
       * Wrapping with [UNTRUSTED] labels caused the AI to echo them,
       * triggering the output guard and blocking innocent responses
       * like "hello" and "how are you?".
       *
       * wrapUntrustedContent() is still used for genuinely untrusted
       * external content (tool results, tool errors in agent/index.ts).
       */
      const interactiveContent = rawInteractiveContent;

      /*
       * Unified Conversational Agent.
       * Handles server management, inspection, repair, undo, and confirmations
       * through natural language. Routes to existing tool framework.
       */
      const mentionedUserIds = [
        ...message.mentions.users.values(),
      ]
        .filter((user) => user.id !== botId)
        .map((user) => user.id);

      if (!isDM && message.guild) {
        const agentResponse = await handleConversation(
          client,
          message,
          content,
          mentionedUserIds,
        );
        t.mark("agent_conversation");

        if (agentResponse.shouldReply) {
          await message.reply(truncateForDiscord(agentResponse.reply));
          replySent = true;
          logger.debug(
            `🤖 Conversational agent responded: intent handled, executed=${agentResponse.executed}`,
          );
          return;
        }

        // Agent returned shouldReply=false, meaning this is normal chat.
        // Fall through to AI router.
      }

      /*
       * Natural-language moderation detection.
       * Only triggers for warn and timeout through the existing action-confirmations system.
       * Other moderation actions use slash commands.
       */
      const actionIntent = detectActionIntent(
        content,
        mentionedUserIds
      );

      if (
        actionIntent.action !== "none" &&
        actionIntent.action !== "warn" &&
        actionIntent.action !== "timeout" &&
        !isDM
      ) {
        await message.reply(
          "ℹ️ That moderation action is not available through natural-language confirmation yet. Please use the corresponding slash command."
        );
        replySent = true;
        return;
      }

      if (actionIntent.action !== "none" && !isDM) {
        const actionKey = createActionKey(
          userId,
          channelId
        );

        const existingAction =
          getPendingAction(actionKey);

        if (!existingAction) {
          setPendingAction(actionKey, {
            userId,
            guildId: message.guild!.id,
            channelId,
            action: actionIntent.action,
            targetUserId:
              actionIntent.targetUserId,
            reason: actionIntent.reason,
            durationMinutes:
              actionIntent.durationMinutes,
            expiresAt: createExpiration(),
          });

          const targetText =
            actionIntent.targetUserId
              ? `<@${actionIntent.targetUserId}>`
              : "the specified user";

          const durationText =
            actionIntent.durationMinutes
              ? ` for ${actionIntent.durationMinutes} minute(s)`
              : "";

          const row =
            new ActionRowBuilder<ButtonBuilder>()
              .addComponents(
                new ButtonBuilder()
                  .setCustomId(
                    `ashen_action:${actionIntent.action}:${userId}:${channelId}:confirm`
                  )
                  .setLabel("Confirm")
                  .setStyle(ButtonStyle.Success),

                new ButtonBuilder()
                  .setCustomId(
                    `ashen_action:${actionIntent.action}:${userId}:${channelId}:cancel`
                  )
                  .setLabel("Cancel")
                  .setStyle(ButtonStyle.Danger)
              );

          await message.reply({
            content:
              `⚠️ You requested **${actionIntent.action}** ` +
              `${targetText}${durationText}.\n` +
              `Please confirm this action:`,
            components: [row],
          });
          replySent = true;

          logger.info(
            `⏳ Pending moderation action: ${JSON.stringify(
              actionIntent
            )}`
          );

          return;
        }
      }

      /*
       * UsageManager: check limits before AI call.
       */
      usageCheck = usageManager.check(userId, guildId, "chat", content.length);
      t.mark("usage_check");

      if (!usageCheck.allowed) {
        const retrySeconds = usageCheck.retryAfterMs
          ? Math.max(1, Math.ceil(usageCheck.retryAfterMs / 1000))
          : 60;
        await message.reply(
          `⏳ ${usageCheck.reason === "daily_limit" ? "You've reached your daily AI limit." : usageCheck.reason === "monthly_limit" ? "You've reached your monthly AI limit." : "Request limit reached."} Try again in ${retrySeconds}s.`
        );
        replySent = true;
        return;
      }

      /*
       * Conversation memory.
       */
      const history =
        memory.get(
          userId,
          channelId
        );

      /*
       * Adaptive personality based on user profile.
       */
      const userProfile = userProfiles.get(userId);
      const personalityBlock = buildAdaptivePersonality(userProfile);
      t.mark("memory_and_profile");

      /*
       * AI context.
       */
      const messages = [
        {
          role: "system" as const,

          content: ASHENAI_SYSTEM_PROMPT + "\n\n" + personalityBlock,
        },

        // Security: neither conversation history nor the user's current
        // message are wrapped with [UNTRUSTED] labels. The system prompt
        // already contains security instructions that prevent secret
        // disclosure and prompt injection. Wrapping with [UNTRUSTED]
        // labels caused the AI to echo them, triggering the output guard
        // and blocking innocent responses like "hello" and "how are you?".
        ...history.map((entry) => ({
          ...entry,
          content: entry.content,
        })),

        {
          role: "user" as const,
          content: interactiveContent,
        },
      ];

      logger.debug(
        `🧠 Interactive context: ${messages.length} messages`
      );

      logger.debug(
        "🤖 Sending interactive request to AI router..."
      );

      /*
       * Generate response.
       */
      const response =
        await router.generate({
          messages,
          temperature: 0.7,
          maxTokens: 1200,
          guildId,
          userId,
          channelId,
          source: "chat",
        });
      t.mark("ai_generate");

      if (
        !response ||
        !response.text ||
        !response.text.trim()
      ) {
        throw new Error(
          "AI router returned an empty response."
        );
      }

      /*
       * Store conversation — user message first.
       */
      memory.addBatch(
        userId,
        {
          role: "user",
          content: interactiveContent,
        },
        channelId
      );

      /*
       * Record usage after successful AI response.
       */
      usageManager.recordDeferred({
        userId,
        guildId,
        feature: "chat",
        credits: usageCheck.credits,
        provider: response.provider,
        latencyMs: response.latencyMs,
        success: true,
      });
      t.mark("usage_record");

      /*
       * Final application-level security check.
       * Never send raw AI output directly to Discord.
       */
      const guarded = guardAIOutput(response.text);

      if (!guarded.allowed) {
        logger.warn(
          `🛡️ Interactive output blocked: ${guarded.reason ?? "security_policy"}`
        );
      }

      /*
       * Store the GUARDED assistant response in memory.
       * This prevents blocked outputs from contaminating future
       * conversation history and causing repeated false positives.
       */
      memory.addBatch(
        userId,
        {
          role: "assistant",
          content: guarded.text,
        },
        channelId
      );
      t.mark("memory_save");

      /*
       * Strip internal security wrapper labels and
       * Discord message size protection.
       */
      const reply =
        truncateForDiscord(
          stripSecurityLabels(guarded.text)
        );

      /*
       * Reply directly to the triggering message.
       */
      await message.reply(reply);
      replySent = true;
      t.mark("discord_reply");

      memory.flushBatch();
      usageManager.flush();
      usageStats.recordMessage(userId);
      t.log();

      logger.debug(
        `✅ Interactive reply sent using ${response.provider} in ${response.latencyMs}ms.`
      );
    } catch (error) {
      usageStats.recordFailure(
        message.author.id,
        "chat",
      );

      usageManager.record({
        userId,
        guildId: message.guild?.id || "",
        feature: "chat",
        credits: usageCheck?.credits || 0,
        success: false,
      });

      logger.error(
        "❌ Interactive message response failed:",
        error instanceof Error
          ? error.message
          : String(error)
      );

      /*
       * Try to tell the user something went wrong,
       * but only if we haven't already sent a reply.
       * Don't crash the bot if Discord rejects it.
       */
      try {
        if (!replySent && message.channel.isSendable()) {
          const cid = `ASH-${Date.now().toString(36)}`;
          logger.error(`[ASH][${cid}][INTERACTIVE] error: ${error instanceof Error ? error.message : String(error)}`);
          await message.reply(
            `❌ I couldn't process that message right now. Error ID: "${cid}". Please try again.`
          );
        }
      } catch {
        logger.debug(
          "⚠️ Could not send interactive error reply."
        );
      }
    }
  }
);

/* =====================================================
   BUILDER THREAD MESSAGE HANDLER
   ===================================================== */

client.on(
  Events.MessageCreate,
  async (message) => {
    if (message.author.bot) return;
    if (!message.guild) return;
    if (!message.channel.isThread()) return;

    // Check if this is a builder thread
    const session = getBuilderSession(message.guild.id, message.author.id);
    if (!session) {
      // Session may have expired — notify the user
      if (message.channel.isThread()) {
        // If the thread looks like a builder thread, send expiry notice
        if (message.channel.name.startsWith("builder-")) {
          await message.channel.send("\u231B This builder session expired. Start a new \"/prompt\" session when you're ready.").catch(() => {});
        }
      }
      return;
    }
    if (session.threadId !== message.channel.id) return;

    // Serialize message processing per session to prevent race conditions
    // on session.pendingPlan, session.serverState, and DB writes
    const { withLock } = await import("./games/lock");
    const sessionLockKey = `builder-process:${session.guildId}:${session.userId}`;

    try {
      await withLock(sessionLockKey, async () => {
        await processBuilderMessage(
          client,
          message.channel,
          session,
          message.content,
          message.author,
        );
      }, 30000); // 30s timeout for message processing
    } catch (error) {
      if (error instanceof Error && error.message.includes("LOCK_TIMEOUT")) {
        logger.warn("⚠️ Builder session processing lock timeout for user:", message.author.id);
        await message.channel.send("⏳ Please wait — your previous request is still being processed.").catch(() => {});
      } else {
        const errMsg = error instanceof Error ? error.message : String(error);
        const cid = `ASH-${Date.now().toString(36)}`;
        // Determine the stage from the error message if available
        const stageMatch = errMsg.match(/\[([A-Z_]+)\]/);
        const stage = stageMatch ? stageMatch[1] : "BUILDER";
        logger.error(`[ASH][${cid}][${stage}] thread handler error: ${errMsg}`);
        try {
          await message.channel.send(`❌ I couldn't complete that builder request. Error ID: "${cid}". Check the bot logs for details.`);
        } catch {}
      }
    }
  }
);

/* =====================================================
   SLASH COMMANDS
   ===================================================== */

client.on(
  Events.InteractionCreate,
  async (interaction) => {
    if (
      !interaction.isChatInputCommand()
    ) {
      return;
    }

    const startedAt = Date.now();

    try {
      // Acknowledge the Discord interaction before CommandHandler executes it.
      // /ask uses public (non-ephemeral) responses so others can see the answer.
      // All other commands use ephemeral to keep responses private.
      if (!interaction.deferred && !interaction.replied) {
        const isPublicCommand = interaction.commandName === "ask";
        if (isPublicCommand) {
          await interaction.deferReply();
        } else {
          await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        }
      }

      await commandHandler.handle(
        interaction
      );

      usageStats.flush();

      logger.info(
        `✅ /${interaction.commandName} completed in ${
          Date.now() - startedAt
        }ms.`,
      );
    } catch (error) {
      logger.error(
        `❌ Command /${interaction.commandName} failed:`,
        error instanceof Error
          ? error.message
          : String(error),
      );

      try {
        const cid = `ASH-${Date.now().toString(36)}`;
        logger.error(`[ASH][${cid}][COMMAND] /${interaction.commandName} error: ${error instanceof Error ? error.message : String(error)}`);
        if (
          interaction.replied ||
          interaction.deferred
        ) {
          await interaction.followUp({
            content:
              `❌ Something went wrong while processing that command. Error ID: "${cid}".`,
          });
        } else {
          await interaction.reply({
            content:
              `❌ Something went wrong while processing that command. Error ID: "${cid}".`,
          }).catch(() => {});
        }
      } catch {
        logger.debug(
          "⚠️ Could not send command error response.",
        );
      }
    }
  }
);

/* =====================================================
   SETTINGS MODAL SUBMISSIONS
   ===================================================== */

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isModalSubmit()) return;
  if (!interaction.customId.startsWith("an:")) return;
  await handleSettingsModalSubmit(interaction);
});

/* =====================================================
   LOGIN
   ===================================================== */

const token =
  process.env.DISCORD_TOKEN?.trim();

if (!token) {
  logger.error(
    "❌ DISCORD_TOKEN is missing from .env"
  );

  process.exit(1);
}

const SHUTDOWN_TIMEOUT_MS = 15_000;

async function gracefulShutdown(signal: string): Promise<void> {
  logger.info(`🛑 ${signal} received — starting graceful shutdown...`);

  const forceExit = setTimeout(() => {
    logger.error("⏱️ Shutdown timed out — forcing exit");
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);

  forceExit.unref();

  try { stopUpdateManager(); } catch {}
  try { stopSessionCleanup(); } catch {}

  try { internalSupervisor.stop(); } catch {}

  try {
    await agentManager.stop();
    logger.info("🧠 Agent stopped.");
  } catch (error) {
    logger.warn("⚠️ Agent stop failed:", error instanceof Error ? error.message : String(error));
  }

  try {
    const bm = getBrowserManager();
    await bm.shutdown();
    logger.info("🌐 Browser stopped.");
  } catch {
    // Browser is optional
  }

  try {
    stopSupportAutomation();
    stopConversationCleanup();
    logger.info("🎫 Support automation stopped.");
  } catch {
    // Best effort
  }

  try {
    closeDatabase();
    logger.info("📦 Database closed.");
  } catch {
    // Best effort
  }

  try {
    client.destroy();
    logger.info("🔌 Discord disconnected.");
  } catch {
    // Best effort
  }

  clearTimeout(forceExit);
  logger.info("✅ Graceful shutdown complete.");
  process.exit(0);
}

process.on("uncaughtException", (error) => {
  logger.error("❌ UNCAUGHT EXCEPTION:", error.stack || error.message || String(error));
  try { internalSupervisor.stop(); } catch {}
  try { agentManager.stop().catch(() => {}); } catch {}
  try { getBrowserManager().shutdown().catch(() => {}); } catch {}
  try { closeDatabase(); } catch {}
  try { client.destroy(); } catch {}
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  logger.error("❌ UNHANDLED REJECTION:", reason instanceof Error ? (reason.stack || reason.message) : String(reason));
  try { internalSupervisor.stop(); } catch {}
  try { agentManager.stop().catch(() => {}); } catch {}
  try { getBrowserManager().shutdown().catch(() => {}); } catch {}
  try { closeDatabase(); } catch {}
  try { client.destroy(); } catch {}
  process.exit(1);
});

process.on("SIGINT", () => { gracefulShutdown("SIGINT"); });
process.on("SIGTERM", () => { gracefulShutdown("SIGTERM"); });
process.on("SIGUSR2", () => { gracefulShutdown("SIGUSR2 (restart)"); });

/* =====================================================
   INTERNAL SUPERVISOR STATE
   ===================================================== */
let discordConnectionAttempt = 0;
let discordConnectionManagerStarted = false;
let discordRecoveryActive = false;
let discordLastFailureAt = 0;
let discordLastFailureReason = "";
let discordLastReadyAt = 0;

const internalSupervisor = new InternalSupervisor({
  intervalMs: 30_000,
  failureThreshold: 3,

  checks: createSupervisorChecks(router),

  onUnhealthy: (reason) => {
    logger.error(
      `🚨 INTERNAL SUPERVISOR: sustained unhealthy state — ${reason}`,
    );

    logger.error(
      "🔄 Exiting so the process manager can restart AshenAI.",
    );

    process.exit(1);
  },
});

internalSupervisor.start();

client.on("debug", (message) => {
  const text = String(message);
  if (/heartbeat|heartbeat ack/i.test(text)) {
    return;
  }

  logger.debug(`🔧 DISCORD DEBUG: ${text}`);
});

client.on("shardDisconnect", (event, shardId) => {
  logger.error(
    `🔴 DISCORD SHARD ${shardId} DISCONNECTED: code=${event.code} reason=${event.reason || "(none)"}`,
  );
});

client.on("shardReconnecting", (shardId) => {
  logger.warn(`🟡 DISCORD SHARD ${shardId} RECONNECTING...`);
});

client.on("shardReady", (shardId) => {
  logger.info(`🟢 DISCORD SHARD ${shardId} READY EVENT CONFIRMED`);
});

/* =====================================================
   BOT JOIN / ONBOARDING MESSAGE
   ===================================================== */

client.on(Events.GuildCreate, async (guild) => {
  try {
    logger.info(`📥 Joined guild: ${guild.name} (${guild.id})`);

    // Duplicate prevention: if guild config already exists, AshenAI was here before
    if (guildConfigExists(guild.id)) {
      logger.info(`ℹ️ Guild ${guild.name} already has a config — skipping onboarding.`);
      return;
    }

    // Find the best channel to send the onboarding message
    // Prefer system channel, then first text channel the bot can send to
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let targetChannel: { send: (args: any) => Promise<unknown> } | null = guild.systemChannel;

    if (!targetChannel) {
      const textChannels = guild.channels.cache.filter(
        ch => ch.isTextBased() && !ch.isDMBased() && ch.permissionsFor(guild.members.me!)?.has("SendMessages")
      );
      const first = textChannels.first();
      if (first) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        targetChannel = first as { send: (args: any) => Promise<unknown> };
      }
    }

    if (!targetChannel) {
      logger.warn(`⚠️ No suitable channel found in ${guild.name} for onboarding message.`);
      return;
    }

    const onboardingEmbed = new EmbedBuilder()
      .setColor(0x2c2f33)
      .setTitle("Hi! I'm AshenAI — your AI-powered server assistant.")
      .setDescription(
        "I can help you:\n" +
        "> 🛠️ Create and customize your server\n" +
        "> 🤖 Manage channels, roles, and permissions\n" +
        "> 🛡️ Moderate and protect your community\n" +
        "> 📋 Generate server templates\n" +
        "> 💬 Chat naturally with your server"
      )
      .addFields(
        {
          name: "Get Started",
          value: [
            "💬 **Mention me** for quick chat",
            "Use `/ask` for AI chat",
            "Use `/prompt` for server building and management",
            "Use `/help` to explore features",
          ].join("\n"),
        },
        {
          name: "Trusted Users",
          value: "🔐 **Server owner:** Use `/access add @user` to allow others to use server-management features.\nTrusted users can use `/send` to send messages as AshenAI.",
        }
      )
      .setFooter({ text: "Nothing has been changed." });

    await targetChannel.send({ embeds: [onboardingEmbed] });

    recordAudit({
      who: "system",
      what: `Sent onboarding message to ${guild.name}`,
      where: "guild-join",
      guildId: guild.id,
      result: "success",
    });
  } catch (error) {
    logger.error(
      `❌ Failed to send onboarding message to ${guild.name}:`,
      error instanceof Error ? error.message : String(error)
    );
  }
});

client.on("error", (error) => {
  logger.error(
    "❌ DISCORD CLIENT ERROR:",
    error instanceof Error
      ? error.stack ?? error.message
      : String(error),
  );
});

const DISCORD_CONNECT_TIMEOUT_MS = 60_000;
const DISCORD_INITIAL_RETRY_MS = 5_000;
const DISCORD_MAX_RETRY_MS = 60_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loginDiscordWithTimeout(): Promise<void> {
  if (client.isReady()) {
    logger.info("🟢 Discord is already READY.");
    return;
  }

  discordConnectionAttempt += 1;

  const attempt = discordConnectionAttempt;

  logger.info(
    `🔌 Discord Gateway connection attempt #${attempt}...`,
  );

  let timeoutHandle: NodeJS.Timeout | undefined;

  try {
    logger.info("🧪 Calling discord.js client.login()...");
    const loginStartedAt = Date.now();

    const loginPromise = client.login(token);

    loginPromise.then(
      () => {
        logger.info(
          `🟢 client.login() RESOLVED after ${Date.now() - loginStartedAt}ms.`,
        );
        logger.info(
          `🧪 Post-login state: ready=${client.isReady()} wsStatus=${client.ws.status}`,
        );
      },
      (error) => {
        logger.error(
          "🔴 client.login() REJECTED:",
          error instanceof Error
            ? error.stack ?? error.message
            : String(error),
        );
      },
    );

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        reject(
          new Error(
            `Discord Gateway login timed out after ${DISCORD_CONNECT_TIMEOUT_MS / 1000}s`,
          ),
        );
      }, DISCORD_CONNECT_TIMEOUT_MS);
    });

    await Promise.race([loginPromise, timeoutPromise]);

    if (client.isReady()) {
      logger.info(
        `🟢 Discord Gateway connected successfully on attempt #${attempt}.`,
      );
      return;
    }

    logger.info(
      "⏳ Discord login completed but READY has not fired yet. Waiting...",
    );

    await new Promise<void>((resolve, reject) => {
      let settled = false;

      const cleanup = () => {
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }

        clearTimeout(readyTimeout);

        client.off(Events.ClientReady, onReady);
        client.off(Events.Error, onError);
      };

      const finish = (error?: Error) => {
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
        logger.info("🟢 Discord READY event received.");
        finish();
      };

      const onError = (error: Error) => {
        finish(error);
      };

      const readyTimeout = setTimeout(() => {
        finish(
          new Error(
            "Discord READY event was not received within 60 seconds.",
          ),
        );
      }, DISCORD_CONNECT_TIMEOUT_MS);

      client.once(Events.ClientReady, onReady);
      client.once(Events.Error, onError);

      if (client.isReady()) {
        finish();
      }
    });

    if (!client.isReady()) {
      throw new Error(
        "Discord connection completed but client is still not READY.",
      );
    }

    logger.info(
      `🟢 Discord READY: ${client.user?.tag ?? client.user?.id ?? "unknown"}`,
    );

    logger.info(
      `🏠 Guild count: ${client.guilds.cache.size}`,
    );
  } catch (error) {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }

    throw error;
  }
}

async function connectDiscordWithRecovery(): Promise<boolean> {
  let retryDelay = DISCORD_INITIAL_RETRY_MS;
  discordRecoveryActive = true;

  logger.info("🛡️ Discord Gateway recovery manager ACTIVE.");

  while (true) {
    try {
      await loginDiscordWithTimeout();

      discordRecoveryActive = false;
      logger.info("✅ Discord Gateway is operational.");

      return true;
    } catch (error) {
      discordLastFailureAt = Date.now();
      discordLastFailureReason =
        error instanceof Error ? error.message : String(error);

      logger.error(
        `❌ Discord Gateway attempt #${discordConnectionAttempt} failed:`,
        discordLastFailureReason,
      );

      if (client.isReady()) {
        logger.info(
          "🟢 Discord became READY despite the reported connection error.",
        );

        return true;
      }

      logger.warn(
        `🟡 Discord Gateway unavailable. Retrying in ${Math.round(
          retryDelay / 1000,
        )}s...`,
      );

      /*
       * Clean up the failed Gateway session before retrying.
       * This prevents overlapping login attempts.
       */
      try {
        client.destroy();
      } catch (destroyError) {
        logger.warn(
          "⚠️ Discord client cleanup warning:",
          destroyError instanceof Error
            ? destroyError.message
            : String(destroyError),
        );
      }

      await sleep(retryDelay);

      retryDelay = Math.min(
        retryDelay * 2,
        DISCORD_MAX_RETRY_MS,
      );
    }
  }
}

async function startDiscord(): Promise<void> {
  if (discordConnectionManagerStarted) {
    logger.warn(
      "⚠️ Discord connection manager already started; ignoring duplicate startup.",
    );
    return;
  }

  discordConnectionManagerStarted = true;

  try {
    /*
     * Render HTTP server starts immediately and remains available
     * even while Discord Gateway is reconnecting.
     */
    startWebServer(router, () => ({
      discordReady: client.isReady(),
    }), usageManager, usageStats, undefined, memory, systemUsage);

    logger.info("🌐 Web server started.");
    logger.info("🚀 AshenAI startup beginning...");

    if (!token) {
      throw new Error("DISCORD_TOKEN is missing.");
    }

    logger.info("🔌 Connecting to Discord Gateway...");

    /*
     * Production Gateway recovery loop.
     *
     * This is the important fix:
     * a temporary Render → Discord WebSocket failure no longer
     * leaves AshenAI permanently offline.
     */
    const connected = await connectDiscordWithRecovery();

    if (!connected || !client.isReady()) {
      throw new Error(
        "Discord Gateway recovery manager stopped without a READY client.",
      );
    }

    /*
     * Only initialize Discord-dependent systems after READY.
     */
    await startAgent();

    logger.info("🧠 AshenAI agent started.");

    await initializeTaskEngine();

    logger.info("⚙️ Task engine initialized.");

    initDiscordHealth(client);
    logger.info("📡 Discord shard observability active.");

    if (process.env.ASHENAI_AUTO_UPDATE !== "off") {
      startUpdateManager();
      logger.info("🔄 Update manager active.");
    }

    startSessionCleanup();
    logger.info("⚔️ Rivalry session cleanup active.");

    postStartValidation().catch((err) => {
      logger.warn("[UpdateManager] post-start validation error:", err instanceof Error ? err.message : String(err));
    });
  } catch (error) {
    logger.error(
      "❌ Discord startup manager failed:",
      error instanceof Error
        ? error.stack ?? error.message
        : String(error),
    );

    /*
     * Keep the Render web service alive instead of silently
     * leaving the bot in a dead startup state.
     *
     * The Gateway recovery loop handles normal transient failures.
     */
    throw error;
  }
}

logger.info("Starting AshenAI...");
startDiscord().catch((error) => {
  logger.error("FATAL: startDiscord failed:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});

