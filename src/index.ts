import "dotenv/config";

import {
  Client,
  Events,
  GatewayIntentBits,
  Partials,
  Message,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ButtonInteraction,
  MessageFlags,
} from "discord.js";

import { logger } from "./logger";
import { AgentManager } from "./agent/manager";
import { taskEngine, initializeTaskEngine } from "./agent/tasks";
import { messageRateLimiter } from "./security";
import { config } from "./config/env";
import { ASHENAI_SYSTEM_PROMPT } from "./security/policy";
import { guardAIOutput } from "./security/output-guard";
import { wrapUntrustedContent } from "./security/context";

import { providers } from "./ai/providers";
import { AIRouter } from "./ai/router";
import { ConversationMemory } from "./ai/memory";
import { UserProfileMemory } from "./ai/user-profile";

import { AshenCommand } from "./commands/definitions";
import { CommandHandler } from "./commands/handler";
import { createAskCommand } from "./commands/ask";
import { createResetCommand } from "./commands/reset";
import { createHelpCommand } from "./commands/help";
import { createStatusCommand } from "./commands/status";
import { createConfigCommand } from "./commands/config";
import { createDiagnoseCommand } from "./commands/diagnose";
import { createTaskCommand } from "./commands/task";
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
import {
  createWarnCommand,
  createWarningsCommand,
  createTimeoutCommand,
  createUntimeoutCommand,
} from "./commands/moderation";
import {
  createServerCommand,
  createUserInfoCommand,
  createRolesCommand,
} from "./commands/server";
import { getServerContext } from "./discord/server-context";
import { startWebServer } from "./web/server";

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

/* =====================================================
   AI SYSTEM
   ===================================================== */

const router = new AIRouter(providers);
const memory = new ConversationMemory();
const userProfiles = new UserProfileMemory();
const commandHandler = new CommandHandler();
const agentManager = new AgentManager();
startWebServer();

// Initialize autonomous task actions once at startup.
initializeTaskEngine();


/* =====================================================
   COMMANDS
   ===================================================== */

const commands: AshenCommand[] = [
  createAskCommand(router, memory),
  createTaskCommand(router),
  createResetCommand(memory),
  createHelpCommand(),
  createStatusCommand(router, memory, agentManager),
  createConfigCommand(),
  createDiagnoseCommand(
    client,
    router,
    memory,
    () => commandHandler.getCommands().size
  ),
      createServerCommand(),
      createUserInfoCommand(),
      createRolesCommand(),
      createWarnCommand(),
      createWarningsCommand(),
      createTimeoutCommand(),
      createUntimeoutCommand(),
];

commandHandler.registerMany(commands);

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
  botId: string
): Promise<string> {
  const contextParts: string[] = [];

  const referencedMessage = await getReferencedMessage(message);

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
    logger.info("🔥 Starting AshenAI...");
    logger.info(
      `✅ Logged in as ${readyClient.user.tag}`
    );

    try {
      /*
       * Start Discord command synchronization and the
       * AshenAI background agent together.
       */
      await Promise.all([
        syncCommands(
          commands.map((command) => command.data)
        ),
        agentManager.start(),
      ]);

      logger.info(
        `✅ Slash commands synchronized: ${commands.length}`
      );

      /*
       * Start the interactive Discord conversation
       * system after the core agent is online.
       */
      await startAgent();

      logger.info(
        "🧠 Interactive mention/reply system ready."
      );

      logger.info(
        "🟢 AshenAI Discord bot + AI agent are ONLINE."
      );
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
   INTERACTIVE MESSAGE HANDLER
   ===================================================== */

client.on(
  Events.MessageCreate,
  async (message) => {
    try {
      /*
       * Never respond to bots.
       */
      if (message.author.bot) {
        return;
      }

      const botId = client.user?.id;

      if (!botId) {
        return;
      }

      const isDM =
        message.channel.isDMBased();

      const isMention =
        message.mentions.users.has(botId);

      /*
       * Check whether this message is replying
       * directly to AshenAI.
       */
      let isReplyToBot = false;

      const referencedMessage =
        await getReferencedMessage(message);

      if (referencedMessage) {
        isReplyToBot =
          referencedMessage.author.id === botId;
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

      const userId = message.author.id;
      const channelId = message.channel.id;

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

        logger.warn(
          `🛑 Rate limit blocked ${message.author.tag} (${userId}).`
        );

        return;
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
          botId
        );

      /*
       * Discord/user-provided context is DATA, not instructions.
       */
      const interactiveContent =
        wrapUntrustedContent(
          "DISCORD CONVERSATION",
          rawInteractiveContent
        );

      /*
       * Natural-language server action detection.
       *
       * Detection only for now.
       * No moderation action is executed here.
       */
      const mentionedUserIds = [
        ...message.mentions.users.values(),
      ]
        .filter((user) => user.id !== botId)
        .map((user) => user.id);

      const actionIntent = detectActionIntent(
        content,
        mentionedUserIds
      );

      /*
       * Natural-language moderation confirmation.
       *
       * Only warn and timeout are currently executable.
       */
      if (
        actionIntent.action !== "none" &&
        actionIntent.action !== "warn" &&
        actionIntent.action !== "timeout" &&
        !isDM
      ) {
        await message.reply(
          "ℹ️ That moderation action is not available through natural-language confirmation yet. Please use the corresponding slash command."
        );
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

          logger.info(
            `⏳ Pending moderation action: ${JSON.stringify(
              actionIntent
            )}`
          );

          return;
        }
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
       * AI context.
       */
      const messages = [
        {
          role: "system" as const,

          content: ASHENAI_SYSTEM_PROMPT,
        },

        ...history.map((entry) => ({
          ...entry,
          content: wrapUntrustedContent(
            "CONVERSATION HISTORY",
            entry.content
          ),
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
        });

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
       * Store conversation.
       */
      memory.add(
        userId,
        {
          role: "user",
          content: interactiveContent,
        },
        channelId
      );

      memory.add(
        userId,
        {
          role: "assistant",
          content: response.text,
        },
        channelId
      );

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
       * Discord message size protection.
       */
      const reply =
        truncateForDiscord(
          guarded.text
        );

      /*
       * Reply directly to the triggering message.
       */
      await message.reply(reply);

      logger.debug(
        `✅ Interactive reply sent using ${response.provider} in ${response.latencyMs}ms.`
      );
    } catch (error) {
      logger.error(
        "❌ Interactive message response failed:",
        error instanceof Error
          ? error.message
          : String(error)
      );

      /*
       * Try to tell the user something went wrong,
       * but don't crash the bot if Discord rejects it.
       */
      try {
        if (message.channel.isSendable()) {
          await message.reply(
            "❌ I couldn't process that message right now. Please try again."
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

    try {
      await commandHandler.handle(
        interaction
      );
    } catch (error) {
      logger.error(
        `❌ Command /${interaction.commandName} failed:`,
        error instanceof Error
          ? error.message
          : String(error)
      );

      try {
        if (
          interaction.replied ||
          interaction.deferred
        ) {
          await interaction.followUp({
            content:
              "❌ Something went wrong while processing that command.",
          });
        } else {
          await interaction.reply({
            content:
              "❌ Something went wrong while processing that command.",
          });
        }
      } catch {
        logger.debug(
          "⚠️ Could not send command error response."
        );
      }
    }
  }
);

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

process.on("SIGINT", async () => {
  logger.info("🛑 Shutdown signal received.");

  try {
    await agentManager.stop();
    logger.info("🧠 AshenAI agent stopped cleanly.");
  } catch (error) {
    logger.error(
      "❌ Agent shutdown failed:",
      error instanceof Error ? error.message : String(error)
    );
  }

  try {
    client.destroy();
    logger.info("🔌 Discord client disconnected.");
  } catch (error) {
    logger.error(
      "❌ Discord shutdown failed:",
      error instanceof Error ? error.message : String(error)
    );
  }

  process.exit(0);
});

process.on("SIGTERM", async () => {
  logger.info("🛑 Termination signal received.");

  try {
    await agentManager.stop();
    client.destroy();
  } catch (error) {
    logger.error(
      "❌ Shutdown failed:",
      error instanceof Error ? error.message : String(error)
    );
  }

  process.exit(0);
});

startWebServer();
client.login(token).catch((error) => {
  logger.error(
    "❌ Discord login failed:",
    error instanceof Error
      ? error.message
      : String(error)
  );

  process.exit(1);
});
