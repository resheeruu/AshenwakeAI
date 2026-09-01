import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  ChannelType,
  TextChannel,
  ThreadAutoArchiveDuration,
  MessageFlags,
  EmbedBuilder,
} from "discord.js";
import { AshenCommand } from "./definitions";
import { loadGuildAIConfig, isTrustedUser } from "../ai/tools/channel-scope";
import { recordAudit } from "../security/audit";
import { config } from "../config/env";
import { logger } from "../logger";

/* ================================================================
 * BUILDER SESSION STATE
 * ================================================================ */

export interface BuilderSession {
  guildId: string;
  channelId: string;
  threadId: string;
  userId: string;
  startedAt: number;
  lastActivityAt: number;
  pendingPlan?: {
    id: string;
    goal: string;
    steps: Array<{
      toolName: string;
      args: Record<string, unknown>;
      description: string;
      category: string;
    }>;
    templateName?: string;
  };
  serverState?: {
    categories: Array<{ id: string; name: string }>;
    channels: Array<{ id: string; name: string; type: string; categoryId?: string }>;
    roles: Array<{ id: string; name: string }>;
    protectedChannels: string[];
    protectedCategories: string[];
  };
  lastStateFetchedAt: number;
  warnedExpiry?: boolean;
  _needsExpiryWarning?: boolean;
}

const builderSessions = new Map<string, BuilderSession>();
const SESSION_IDLE_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
const SESSION_WARNING_MS = 8 * 60 * 1000; // Warn at 8 minutes

function getSessionKey(guildId: string, userId: string): string {
  return `${guildId}:${userId}`;
}

function getActiveSession(guildId: string, userId: string): BuilderSession | null {
  const key = getSessionKey(guildId, userId);
  const session = builderSessions.get(key);
  if (!session) return null;

  const idle = Date.now() - session.lastActivityAt;

  if (idle > SESSION_IDLE_TIMEOUT_MS) {
    builderSessions.delete(key);
    return null;
  }

  // Warn shortly before expiration
  if (idle > SESSION_WARNING_MS && !session.warnedExpiry) {
    session.warnedExpiry = true;
    session._needsExpiryWarning = true;
  }

  return session;
}

function touchSession(session: BuilderSession): void {
  session.lastActivityAt = Date.now();
}

/* ================================================================
 * HELPERS
 * ================================================================ */

async function isUserTrustedOrAdmin(
  guildId: string,
  userId: string,
  guildOwnerId: string,
): Promise<boolean> {
  const aiConfig = loadGuildAIConfig(guildId);
  if (aiConfig.trustedUserIds.includes(userId)) return true;
  if (userId === guildOwnerId) return true;

  const botOwnerIds = config.admin.discordIds;
  if (botOwnerIds.includes(userId)) return true;

  return false;
}

/* ================================================================
 * SERVER STATE INSPECTION
 * ================================================================ */

async function inspectServer(guild: any) {
  const [channels, roles] = await Promise.all([
    guild.channels.fetch(),
    guild.roles.fetch(),
  ]);

  const categories = channels.filter((ch: any) => ch.type === ChannelType.GuildCategory);
  const textChannels = channels.filter((ch: any) => ch.type === ChannelType.GuildText);
  const voiceChannels = channels.filter((ch: any) => ch.type === ChannelType.GuildVoice);

  const allChannels = [...textChannels.values(), ...voiceChannels.values()];

  // Get protected resources from config
  const aiConfig = loadGuildAIConfig(guild.id);

  return {
    categories: categories.map((c: any) => ({ id: c.id, name: c.name })),
    channels: allChannels.map((c: any) => ({
      id: c.id,
      name: c.name,
      type: c.type === ChannelType.GuildVoice ? "voice" : "text",
      categoryId: c.parentId || undefined,
    })),
    roles: [...roles.cache.values()]
      .filter((r: any) => r.name !== "@everyone")
      .map((r: any) => ({ id: r.id, name: r.name })),
    protectedChannels: aiConfig.protectedChannels || [],
    protectedCategories: aiConfig.protectedCategories || [],
  };
}

/* ================================================================
 * NATURAL LANGUAGE PARSING
 * ================================================================ */

interface ParsedRequest {
  intent: "create_channel" | "create_category" | "create_role" | "delete_channel"
    | "delete_all_except" | "rename_channel" | "inspect" | "improve"
    | "template" | "help" | "unknown";
  args: Record<string, any>;
}

function parseBuilderInput(content: string): ParsedRequest {
  const lower = content.toLowerCase().trim();

  // Delete all except
  if (/\b(delete|remove|clear|clean)\b.*\b(all|everything|every|all channels|all categories)\b.*\b(except|but|keep|preserve|leave|save)\b/i.test(lower)) {
    const keepMatch = content.match(/(?:except|but|keep|preserve|leave|save)\s+(?:the\s+)?(?:#)?(\S+)/i);
    return { intent: "delete_all_except", args: { keepName: keepMatch?.[1]?.toLowerCase() } };
  }
  if (/\b(except|but|keep|preserve|leave|save)\b.*\b(all|everything|every)\b.*\b(delete|remove|clear|clean)\b/i.test(lower)) {
    const keepMatch = content.match(/(?:except|but|keep|preserve|leave|save)\s+(?:the\s+)?(?:#)?(\S+)/i);
    return { intent: "delete_all_except", args: { keepName: keepMatch?.[1]?.toLowerCase() } };
  }

  // Inspect
  if (/\b(inspect|check|show|what|status|overview|review|scan|diagnose)\b/i.test(lower) && /\b(server|guild|channel|role|category|permission)\b/i.test(lower)) {
    return { intent: "inspect", args: {} };
  }
  if (/\b(server|guild)\b.*\b(look|structure|organiz)\b/i.test(lower)) {
    return { intent: "inspect", args: {} };
  }

  // Improve / make better
  if (/\b(make|turn|set|put)\b.*\b(my|the|this)\b.*\b(server|guild)\b.*\b(better|good|great|nice|clean|organized)\b/i.test(lower)) {
    return { intent: "improve", args: {} };
  }
  if (/\b(improve|upgrade|enhance|fix|repair|clean|organize)\b.*\b(server|guild)\b/i.test(lower)) {
    return { intent: "improve", args: {} };
  }

  // Template
  if (/\b(generate|create|make|build|prepare|template|layout|structure|set.?up|configure|organize)\b/i.test(lower)
    && /\b(template|layout|structure|server|guild)\b/i.test(lower)) {
    return { intent: "template", args: { content: lower } };
  }

  // Create channel
  if (/\b(create|make|add|build)\b.*\b(channel|text|voice|vc|audio)\b/i.test(lower)) {
    const nameMatch = content.match(/(?:channel|text|voice|vc|audio)\s+(?:called|named|channel)?\s*[`"']?(\S+)[`"']?/i)
      || content.match(/(?:create|make|add)\s+(?:a\s+)?(?:new\s+)?(?:text\s+|voice\s+)?[`"']?(\S+)[`"']?\s*(?:channel)?/i);
    const wantsVoice = /\b(voice|vc|audio)\b/i.test(lower);
    const catMatch = content.match(/(?:in|under|inside|within)\s+(?:the\s+)?[`"']?(\S+)[`"']?/i);
    return {
      intent: "create_channel",
      args: {
        name: nameMatch?.[1]?.replace(/[^a-zA-Z0-9-_]/g, "").toLowerCase() || "new-channel",
        type: wantsVoice ? "voice" : "text",
        categoryName: catMatch?.[1]?.toLowerCase(),
      },
    };
  }

  // Create category
  if (/\b(create|make|add|build)\b.*\b(category|group|section)\b/i.test(lower)) {
    const nameMatch = content.match(/(?:category|group|section)\s+(?:called|named)?\s*[`"']?(\S+)[`"']?/i)
      || content.match(/(?:create|make|add)\s+(?:a\s+)?(?:new\s+)?[`"']?(\S+)[`"']?\s*(?:category|group|section)?/i);
    return {
      intent: "create_category",
      args: { name: nameMatch?.[1]?.replace(/[^a-zA-Z0-9-_]/g, "-").toLowerCase() || "new-category" },
    };
  }

  // Create role
  if (/\b(create|make|add|build)\b.*\b(role)\b/i.test(lower)) {
    const nameMatch = content.match(/(?:role)\s+(?:called|named)?\s*[`"']?(\S+)[`"']?/i)
      || content.match(/(?:create|make|add)\s+(?:a\s+)?(?:new\s+)?[`"']?(\S+)[`"']?\s*(?:role)?/i);
    return {
      intent: "create_role",
      args: { name: nameMatch?.[1] || "new-role" },
    };
  }

  // Delete channel
  if (/\b(delete|remove|destroy)\b.*\b(channel|category)\b/i.test(lower)) {
    const nameMatch = content.match(/(?:delete|remove|destroy)\s+(?:the\s+)?(?:channel\s+|category\s+)?[`"']?#?(\S+)[`"']?/i);
    return {
      intent: "delete_channel",
      args: { name: nameMatch?.[1]?.toLowerCase() },
    };
  }

  // Rename
  if (/\b(rename|change\s+name)\b/i.test(lower)) {
    const match = content.match(/(?:rename|change)\s+(?:the\s+)?(?:name\s+(?:of\s+)?)?(?:channel\s+)?[`"']?#?(\S+)[`"']?\s*(?:to|into)\s*[`"']?(\S+)[`"']?/i);
    if (match) {
      return {
        intent: "rename_channel",
        args: { oldName: match[1].toLowerCase(), newName: match[2].replace(/[^a-zA-Z0-9-_]/g, "").toLowerCase() },
      };
    }
  }

  // Help
  if (/\b(help|what can|commands|guide)\b/i.test(lower)) {
    return { intent: "help", args: {} };
  }

  return { intent: "unknown", args: { content } };
}

/* ================================================================
 * TEMPLATE DEFINITIONS (compact)
 * ================================================================ */

const TEMPLATES: Record<string, {
  name: string;
  description: string;
  roles: Array<{ name: string; color?: string }>;
  categories: Array<{ name: string; channels: Array<{ name: string; type: string }> }>;
}> = {
  gaming: {
    name: "Gaming Server",
    description: "Setup for gaming communities",
    roles: [{ name: "Gamer", color: "#FF4500" }, { name: "Streamer", color: "#9146FF" }],
    categories: [
      { name: "INFORMATION", channels: [{ name: "rules", type: "text" }, { name: "announcements", type: "text" }] },
      { name: "GENERAL", channels: [{ name: "general", type: "text" }, { name: "memes", type: "text" }] },
      { name: "GAMING", channels: [{ name: "looking-for-group", type: "text" }, { name: "game-clips", type: "text" }] },
      { name: "VOICE", channels: [{ name: "Gaming Lounge", type: "voice" }, { name: "Stream Room", type: "voice" }] },
    ],
  },
  community: {
    name: "Community Server",
    description: "General community setup",
    roles: [{ name: "Moderator", color: "#1E90FF" }],
    categories: [
      { name: "INFORMATION", channels: [{ name: "rules", type: "text" }, { name: "announcements", type: "text" }, { name: "roles", type: "text" }] },
      { name: "GENERAL", channels: [{ name: "introductions", type: "text" }, { name: "general", type: "text" }, { name: "off-topic", type: "text" }] },
      { name: "COMMUNITY", channels: [{ name: "suggestions", type: "text" }, { name: "events", type: "text" }] },
      { name: "VOICE", channels: [{ name: "General Voice", type: "voice" }, { name: "Music", type: "voice" }] },
    ],
  },
  minecraft: {
    name: "Minecraft Server",
    description: "Setup for Minecraft communities",
    roles: [{ name: "Builder", color: "#228B22" }, { name: "Redstone", color: "#DC143C" }],
    categories: [
      { name: "INFO", channels: [{ name: "rules", type: "text" }, { name: "server-ip", type: "text" }] },
      { name: "BUILD", channels: [{ name: "builds", type: "text" }, { name: "schematics", type: "text" }] },
      { name: "SURVIVAL", channels: [{ name: "survival", type: "text" }, { name: "trading", type: "text" }] },
      { name: "VOICE", channels: [{ name: "Build Chat", type: "voice" }] },
    ],
  },
  support: {
    name: "Support Server",
    description: "Help desk and support setup",
    roles: [{ name: "Support Agent", color: "#FFD700" }],
    categories: [
      { name: "INFO", channels: [{ name: "rules", type: "text" }, { name: "faq", type: "text" }] },
      { name: "SUPPORT", channels: [{ name: "general-help", type: "text" }, { name: "bug-reports", type: "text" }] },
      { name: "VOICE", channels: [{ name: "Support Call", type: "voice" }] },
    ],
  },
  study: {
    name: "Study Group",
    description: "Setup for study groups and learning",
    roles: [{ name: "Tutor", color: "#4169E1" }],
    categories: [
      { name: "INFO", channels: [{ name: "rules", type: "text" }, { name: "schedule", type: "text" }] },
      { name: "STUDY", channels: [{ name: "general", type: "text" }, { name: "resources", type: "text" }, { name: "homework-help", type: "text" }] },
      { name: "VOICE", channels: [{ name: "Study Room", type: "voice" }] },
    ],
  },
  creator: {
    name: "Creator Hub",
    description: "Setup for content creators",
    roles: [{ name: "Creator", color: "#FF69B4" }],
    categories: [
      { name: "INFO", channels: [{ name: "rules", type: "text" }, { name: "announcements", type: "text" }] },
      { name: "CONTENT", channels: [{ name: "general", type: "text" }, { name: "showcase", type: "text" }, { name: "collabs", type: "text" }] },
      { name: "VOICE", channels: [{ name: "Stream Room", type: "voice" }] },
    ],
  },
  clan: {
    name: "Clan Server",
    description: "Competitive team setup",
    roles: [{ name: "Captain", color: "#B22222" }, { name: "Member", color: "#696969" }],
    categories: [
      { name: "INFO", channels: [{ name: "rules", type: "text" }, { name: "tryouts", type: "text" }] },
      { name: "TEAM", channels: [{ name: "general", type: "text" }, { name: "strats", type: "text" }, { name: "scrims", type: "text" }] },
      { name: "VOICE", channels: [{ name: "Team Voice", type: "voice" }] },
    ],
  },
  social: {
    name: "Social Hangout",
    description: "Casual chat server",
    roles: [{ name: "VIP", color: "#FFD700" }],
    categories: [
      { name: "INFO", channels: [{ name: "rules", type: "text" }] },
      { name: "CHAT", channels: [{ name: "general", type: "text" }, { name: "media", type: "text" }, { name: "music", type: "text" }] },
      { name: "VOICE", channels: [{ name: "Hangout", type: "voice" }] },
    ],
  },
  friends: {
    name: "Friends Server",
    description: "Private friend group setup",
    roles: [],
    categories: [
      { name: "CHAT", channels: [{ name: "general", type: "text" }, { name: "gaming", type: "text" }] },
      { name: "VOICE", channels: [{ name: "Call", type: "voice" }] },
    ],
  },
};

function detectTemplateType(content: string): string {
  const lower = content.toLowerCase();
  if (/\b(minecraft|mc)\b/i.test(lower)) return "minecraft";
  if (/\b(gaming|game)\b/i.test(lower)) return "gaming";
  if (/\b(support|help\s*desk|ticket)\b/i.test(lower)) return "support";
  if (/\b(study|learning|school|university)\b/i.test(lower)) return "study";
  if (/\b(creator|content|youtube|twitch|streamer)\b/i.test(lower)) return "creator";
  if (/\b(clan|competitive|esports|team)\b/i.test(lower)) return "clan";
  if (/\b(social|hangout|chill|casual)\b/i.test(lower)) return "social";
  if (/\b(friends|friend|private)\b/i.test(lower)) return "friends";
  return "community";
}

/* ================================================================
 * RESOURCE CLASSIFICATION
 * ================================================================ */

function classifyResources(
  serverState: any,
  template: any,
) {
  const existingCategories = serverState.categories.map((c: any) => c.name.toLowerCase());
  const existingChannels = serverState.channels.map((c: any) => c.name.toLowerCase());
  const existingRoles = serverState.roles.map((r: any) => r.name.toLowerCase());

  const missing: string[] = [];
  const exists: string[] = [];

  for (const role of template.roles) {
    if (existingRoles.includes(role.name.toLowerCase())) {
      exists.push(`Role "${role.name}"`);
    } else {
      missing.push(`Role "${role.name}"`);
    }
  }

  for (const cat of template.categories) {
    if (existingCategories.includes(cat.name.toLowerCase())) {
      exists.push(`Category "${cat.name}"`);
      for (const ch of cat.channels) {
        if (existingChannels.includes(ch.name.toLowerCase())) {
          exists.push(`Channel #${ch.name}`);
        } else {
          missing.push(`Channel #${ch.name}`);
        }
      }
    } else {
      missing.push(`Category "${cat.name}"`);
      for (const ch of cat.channels) {
        if (existingChannels.includes(ch.name.toLowerCase())) {
          exists.push(`Channel #${ch.name} (exists)`);
        } else {
          missing.push(`Channel #${ch.name}`);
        }
      }
    }
  }

  return { missing, exists };
}

/* ================================================================
 * BUILD STEPS FROM TEMPLATE
 * ================================================================ */

function buildStepsFromTemplate(
  template: any,
  serverState: any,
): Array<{
  toolName: string;
  args: Record<string, unknown>;
  description: string;
  category: string;
}> {
  const steps: Array<{
    toolName: string;
    args: Record<string, unknown>;
    description: string;
    category: string;
  }> = [];

  const existingRoles = serverState.roles.map((r: any) => r.name.toLowerCase());
  const existingCategories = serverState.categories.map((c: any) => c.name.toLowerCase());
  const existingChannels = serverState.channels.map((c: any) => c.name.toLowerCase());

  for (const role of template.roles) {
    if (!existingRoles.includes(role.name.toLowerCase())) {
      steps.push({
        toolName: "create_role",
        args: { name: role.name, color: role.color },
        description: `Create role "${role.name}"`,
        category: "create",
      });
    }
  }

  for (const cat of template.categories) {
    if (!existingCategories.includes(cat.name.toLowerCase())) {
      steps.push({
        toolName: "create_category",
        args: { name: cat.name },
        description: `Create category "${cat.name}"`,
        category: "create",
      });
    }

    for (const ch of cat.channels) {
      if (!existingChannels.includes(ch.name.toLowerCase())) {
        steps.push({
          toolName: "create_channel",
          args: { name: ch.name, type: ch.type, categoryName: cat.name },
          description: `Create ${ch.type} channel "#${ch.name}" in "${cat.name}"`,
          category: "create",
        });
      }
    }
  }

  return steps;
}

/* ================================================================
 * PROGRESS EMBED HELPERS
 * ================================================================ */

const EMBED_COLOR = 0x2c2f33;

function buildProgressEmbed(title: string, description: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setTitle(title)
    .setDescription(description);
}

function buildResultEmbed(
  title: string,
  description: string,
  executed: string[],
  failed: Array<{ step: string; error: string }>,
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(failed.length === 0 ? 0x2ecc71 : 0xe67e22)
    .setTitle(title)
    .setDescription(description);

  if (executed.length > 0) {
    embed.addFields({
      name: "Completed",
      value: executed.map((e) => `✓ ${e}`).join("\n"),
    });
  }

  if (failed.length > 0) {
    embed.addFields({
      name: "Failed",
      value: failed.map((f) => `✗ ${f.step}: ${f.error}`).join("\n"),
    });
  }

  return embed;
}

/* ================================================================
 * EXECUTION RESULT FORMATTING
 * ================================================================ */

function formatExecutionResult(
  executed: string[],
  failed: Array<{ step: string; error: string }>,
): string {
  if (failed.length === 0) {
    const roles = executed.filter(s => s.includes("role")).length;
    const cats = executed.filter(s => s.includes("category")).length;
    const chs = executed.filter(s => s.includes("channel")).length;
    const parts: string[] = [];
    if (roles > 0) parts.push(`${roles} role${roles > 1 ? "s" : ""}`);
    if (cats > 0) parts.push(`${cats} categor${cats > 1 ? "ies" : "y"}`);
    if (chs > 0) parts.push(`${chs} channel${chs > 1 ? "s" : ""}`);
    return `✅ **Done.** Created ${parts.join(", ")}.`;
  }

  const lines = ["⚠️ **Partially completed.**", ""];
  if (executed.length > 0) {
    lines.push(`**Completed:** ${executed.length} operation${executed.length > 1 ? "s" : ""}`);
  }
  lines.push("", "**Failed:**");
  for (const f of failed) lines.push(`• ${f.step}: ${f.error}`);
  return lines.join("\n");
}

/* ================================================================
 * /PROMPT COMMAND
 * ================================================================ */

export function createPromptCommand(): AshenCommand {
  return {
    data: new SlashCommandBuilder()
      .setName("prompt")
      .setDescription("Open a private Builder session to design, inspect, and manage your server")
      .addStringOption((option) =>
        option
          .setName("request")
          .setDescription("What you'd like to build, inspect, or change")
          .setRequired(false)
          .setMaxLength(2000)
      ),

    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
      try {
        const guild = interaction.guild;
        if (!guild) {
          await interaction.editReply("❌ This command can only be used in a server.");
          return;
        }

        const userId = interaction.user.id;
        const guildOwnerId = guild.ownerId;

        // Check authorization: trusted user, admin, or guild owner
        const authorized = await isUserTrustedOrAdmin(guild.id, userId, guildOwnerId);
        if (!authorized) {
          await interaction.editReply("❌ You don't have permission to use `/prompt`.");
          return;
        }

        const request = interaction.options.getString("request");

        // Check for existing active session
        const existingSession = getActiveSession(guild.id, userId);

        if (existingSession && !request) {
          // Resume existing session
          await interaction.editReply(
            "🔧 **AshenAI Builder**\n\n" +
            "Session resumed. What would you like to build or change?\n\n" +
            "Examples:\n" +
            '• "create a voice channel named callerss"\n' +
            '• "inspect my server"\n' +
            '• "generate a gaming template"\n' +
            '• "delete all except general"\n' +
            '• "make my server better"'
          );
          return;
        }

        // Archive old session thread if one exists
        if (existingSession) {
          try {
            const oldThread = guild.channels.cache.get(existingSession.threadId);
            if (oldThread && oldThread.isThread()) {
              await oldThread.setArchived(true, "New builder session started").catch(() => {});
            }
          } catch {}
          builderSessions.delete(getSessionKey(guild.id, userId));
        }

        // Create a thread from the interaction channel
        const interactionChannel = interaction.channel;
        if (!interactionChannel || !('threads' in interactionChannel)) {
          await interaction.editReply("❌ Cannot create a thread in this channel.");
          return;
        }

        const thread = await interactionChannel.threads.create({
          name: `builder-${interaction.user.username}`,
          autoArchiveDuration: ThreadAutoArchiveDuration.OneHour,
        });

        // Create session
        const session: BuilderSession = {
          guildId: guild.id,
          channelId: interaction.channel?.id || "",
          threadId: thread.id,
          userId,
          startedAt: Date.now(),
          lastActivityAt: Date.now(),
          lastStateFetchedAt: 0,
        };
        builderSessions.set(getSessionKey(guild.id, userId), session);

        // Send initial message in thread as a clean Embed
        const sessionEmbed = new EmbedBuilder()
          .setColor(0x2c2f33)
          .setTitle("New Session")
          .setDescription(
            request
              ? `**Prompt:** ${request}`
              : "**Prompt:** *(waiting for your request)*"
          )
          .addFields({
            name: "Note",
            value: "Keep the convo in this thread for session memory. To save something permanently, just tell the agent to remember it!",
          })
          .setFooter({ text: "Free • AshenAI Agent" });

        await thread.send({ embeds: [sessionEmbed] });

        // Acknowledge in the original channel
        await interaction.editReply(`✅ Builder session opened: ${thread}`);

        recordAudit({
          who: userId,
          whoName: interaction.user.tag,
          what: `Opened builder session in thread ${thread.id}`,
          where: "prompt-command",
          guildId: guild.id,
          result: "success",
        });

        // If there's an initial request, process it
        if (request) {
          await processBuilderMessage(interaction.client, thread, session, request, interaction.user);
        }
      } catch (error) {
        logger.error("❌ /prompt failed:", error instanceof Error ? error.message : String(error));
        try {
          if (interaction.deferred || interaction.replied) {
            await interaction.editReply("❌ Failed to create builder session. Please try again.");
          } else {
            await interaction.reply({
              content: "❌ Failed to create builder session. Please try again.",
              flags: MessageFlags.Ephemeral,
            }).catch(() => {});
          }
        } catch {
          // Interaction may have expired
        }
      }
    },
  };
}

/* ================================================================
 * PROCESS BUILDER MESSAGE (called from thread message handler)
 * ================================================================ */

export async function processBuilderMessage(
  client: any,
  thread: any,
  session: BuilderSession,
  content: string,
  user: any,
): Promise<void> {
  touchSession(session);

  // Send expiry warning if flagged
  if (session._needsExpiryWarning) {
    session._needsExpiryWarning = false;
    await thread.send("\u23F3 This builder session will expire soon if unused.").catch(() => {});
  }

  const lower = content.toLowerCase().trim();

  // Parse the request
  const parsed = parseBuilderInput(content);

  switch (parsed.intent) {
    case "help": {
      await thread.send([
        "**Builder Commands**",
        "",
        "• `create a channel named <name>` — Create a text/voice channel",
        "• `create a category named <name>` — Create a category",
        "• `create a role named <name>` — Create a role",
        "• `delete <channel>` — Delete a channel",
        "• `delete all except <name>` — Delete everything except specified",
        "• `rename <old> to <new>` — Rename a channel",
        "• `inspect my server` — View server structure",
        "• `make my server better` — Get improvement suggestions",
        "• `generate a <type> template` — Preview a template",
        "• `yes` / `no` — Confirm or cancel a pending plan",
      ].join("\n"));
      return;
    }

    case "inspect": {
      const serverState = await inspectServer(thread.guild);
      session.serverState = serverState;
      session.lastStateFetchedAt = Date.now();

      const lines = [
        "🔎 **Server Review**",
        "",
        `**Categories:** ${serverState.categories.length}`,
        ...serverState.categories.map((c: any) => `  • ${c.name}`),
        "",
        `**Channels:** ${serverState.channels.length}`,
        ...serverState.channels.slice(0, 20).map((c: any) => `  • #${c.name} (${c.type})`),
        serverState.channels.length > 20 ? `  • ... and ${serverState.channels.length - 20} more` : "",
        "",
        `**Roles:** ${serverState.roles.length}`,
        ...serverState.roles.slice(0, 10).map((r: any) => `  • ${r.name}`),
        serverState.roles.length > 10 ? `  • ... and ${serverState.roles.length - 10} more` : "",
      ];

      await thread.send(lines.join("\n"));
      return;
    }

    case "improve": {
      const serverState = await inspectServer(thread.guild);
      session.serverState = serverState;
      session.lastStateFetchedAt = Date.now();

      const recommendations: string[] = [];

      if (serverState.categories.length === 0 && serverState.channels.length < 5) {
        recommendations.push("• Your server has very little structure — I can set up a template for you");
      }

      const uncategorized = serverState.channels.filter((c: any) => !c.categoryId);
      if (uncategorized.length > 2) {
        recommendations.push(`• ${uncategorized.length} channels are not organized into categories`);
      }

      const channelCounts = new Map<string, number>();
      for (const ch of serverState.channels) {
        const key = ch.name.toLowerCase();
        channelCounts.set(key, (channelCounts.get(key) || 0) + 1);
      }
      const dupCount = [...channelCounts.values()].filter(c => c > 1).length;
      if (dupCount > 0) {
        recommendations.push(`• Found ${dupCount} duplicate channel name(s)`);
      }

      const hasRules = serverState.channels.some((c: any) => c.name.toLowerCase() === "rules");
      const hasAnnouncements = serverState.channels.some((c: any) => c.name.toLowerCase() === "announcements");
      if (!hasRules || !hasAnnouncements) {
        recommendations.push("• Missing basic channels (rules, announcements)");
      }

      if (recommendations.length === 0) {
        await thread.send("✅ Your server looks well-organized! No issues detected.");
        return;
      }

      await thread.send([
        "**Server Improvement**",
        "",
        ...recommendations,
        "",
        "Want me to set up a template to organize things better?",
      ].join("\n"));
      return;
    }

    case "template": {
      const templateType = detectTemplateType(content);
      const template = TEMPLATES[templateType];

      if (!template) {
        await thread.send(`❌ Unknown template type. Available: ${Object.keys(TEMPLATES).join(", ")}`);
        return;
      }

      const serverState = await inspectServer(thread.guild);
      session.serverState = serverState;
      session.lastStateFetchedAt = Date.now();

      const classification = classifyResources(serverState, template);

      if (classification.missing.length === 0) {
        await thread.send(`✅ Your server already matches the "${template.name}" template. No changes needed.`);
        return;
      }

      // Build steps
      const steps = buildStepsFromTemplate(template, serverState);

      // Store as pending plan
      session.pendingPlan = {
        id: `template-${Date.now()}`,
        goal: template.name,
        steps,
        templateName: templateType,
      };

      // Show compact preview
      const preview = [
        `📋 **${template.name}**`,
        template.description,
        "",
        "**Create:**",
      ];

      const roles = steps.filter(s => s.description.includes("role")).length;
      const cats = steps.filter(s => s.description.includes("category")).length;
      const chs = steps.filter(s => s.description.includes("channel")).length;

      if (roles > 0) preview.push(`• ${roles} role${roles > 1 ? "s" : ""}`);
      if (cats > 0) preview.push(`• ${cats} categor${cats > 1 ? "ies" : "y"}`);
      if (chs > 0) preview.push(`• ${chs} channel${chs > 1 ? "s" : ""}`);

      if (classification.exists.length > 0) {
        preview.push("", `**Preserve:** ${classification.exists.length} existing resource${classification.exists.length > 1 ? "s" : ""}`);
      }

      preview.push("", "Nothing has been changed.", "", "Apply this template? (yes/no)");

      await thread.send(preview.join("\n"));
      return;
    }

    case "delete_all_except": {
      const keepName = parsed.args.keepName;
      if (!keepName) {
        await thread.send('I\'m not sure which channels to keep. Try: "delete all except general"');
        return;
      }

      const serverState = session.serverState || await inspectServer(thread.guild);
      session.serverState = serverState;

      const keepChannels = serverState.channels.filter((ch: any) =>
        ch.name.toLowerCase().includes(keepName)
      );

      if (keepChannels.length === 0) {
        await thread.send(`❌ No channel found matching "${keepName}".`);
        return;
      }

      const keepIds = new Set(keepChannels.map((ch: any) => ch.id));
      const deleteChannels = serverState.channels.filter((ch: any) =>
        !keepIds.has(ch.id) && !serverState.protectedChannels.includes(ch.id)
      );

      if (deleteChannels.length === 0) {
        await thread.send(`✅ Nothing to delete — all channels either match "${keepName}" or are protected.`);
        return;
      }

      const steps = deleteChannels.map((ch: any) => ({
        toolName: "delete_channel",
        args: { channelId: ch.id },
        description: `Delete #${ch.name}`,
        category: "delete",
      }));

      session.pendingPlan = {
        id: `delete-except-${Date.now()}`,
        goal: `Delete ${deleteChannels.length} channels except ${keepChannels.map((c: any) => `#${c.name}`).join(", ")}`,
        steps,
      };

      const lines = [
        `🧹 **${deleteChannels.length} channel${deleteChannels.length > 1 ? "s" : ""} to remove.**`,
        "",
        "**Keep:**",
        ...keepChannels.map((ch: any) => `• #${ch.name}`),
        "",
        "**Delete:**",
        ...deleteChannels.slice(0, 10).map((ch: any) => `• #${ch.name}`),
      ];

      if (deleteChannels.length > 10) {
        lines.push(`• ... and ${deleteChannels.length - 10} more`);
      }

      if (serverState.protectedChannels.length > 0) {
        lines.push("", `• ${serverState.protectedChannels.length} protected channel(s) will be preserved`);
      }

      lines.push("", "This is destructive. Continue? (yes/no)");

      await thread.send(lines.join("\n"));
      return;
    }

    case "create_channel": {
      const name = parsed.args.name as string;
      const type = parsed.args.type as string;
      const categoryName = parsed.args.categoryName as string | undefined;

      session.pendingPlan = {
        id: `create-channel-${Date.now()}`,
        goal: `Create ${type} channel "#${name}"`,
        steps: [{
          toolName: "create_channel",
          args: { name, type, categoryName },
          description: `Create ${type} channel "#${name}"${categoryName ? ` in "${categoryName}"` : ""}`,
          category: "create",
        }],
      };

      await thread.send([
        `📋 **Create ${type} channel "#${name}"**${categoryName ? ` in "${categoryName}"` : ""}`,
        "",
        "Nothing has been changed.",
        "",
        "Apply? (yes/no)",
      ].join("\n"));
      return;
    }

    case "create_category": {
      const name = parsed.args.name as string;

      session.pendingPlan = {
        id: `create-category-${Date.now()}`,
        goal: `Create category "${name}"`,
        steps: [{
          toolName: "create_category",
          args: { name },
          description: `Create category "${name}"`,
          category: "create",
        }],
      };

      await thread.send([
        `📋 **Create category "${name}"**`,
        "",
        "Nothing has been changed.",
        "",
        "Apply? (yes/no)",
      ].join("\n"));
      return;
    }

    case "create_role": {
      const name = parsed.args.name as string;

      session.pendingPlan = {
        id: `create-role-${Date.now()}`,
        goal: `Create role "${name}"`,
        steps: [{
          toolName: "create_role",
          args: { name },
          description: `Create role "${name}"`,
          category: "create",
        }],
      };

      await thread.send([
        `📋 **Create role "${name}"**`,
        "",
        "Nothing has been changed.",
        "",
        "Apply? (yes/no)",
      ].join("\n"));
      return;
    }

    case "delete_channel": {
      const name = parsed.args.name as string;
      const serverState = session.serverState || await inspectServer(thread.guild);

      const match = serverState.channels.find((ch: any) => ch.name.toLowerCase() === name);
      if (!match) {
        await thread.send(`❌ No channel found matching "${name}".`);
        return;
      }

      session.pendingPlan = {
        id: `delete-channel-${Date.now()}`,
        goal: `Delete #${match.name}`,
        steps: [{
          toolName: "delete_channel",
          args: { channelId: match.id },
          description: `Delete #${match.name}`,
          category: "delete",
        }],
      };

      await thread.send([
        `⚠️ **Delete #${match.name}?**`,
        "",
        "This is destructive. Continue? (yes/no)",
      ].join("\n"));
      return;
    }

    case "rename_channel": {
      const oldName = parsed.args.oldName as string;
      const newName = parsed.args.newName as string;
      const serverState = session.serverState || await inspectServer(thread.guild);

      const match = serverState.channels.find((ch: any) => ch.name.toLowerCase() === oldName);
      if (!match) {
        await thread.send(`❌ No channel found matching "${oldName}".`);
        return;
      }

      session.pendingPlan = {
        id: `rename-channel-${Date.now()}`,
        goal: `Rename #${match.name} to #${newName}`,
        steps: [{
          toolName: "rename_channel",
          args: { channelId: match.id, newName },
          description: `Rename #${match.name} to #${newName}`,
          category: "modify",
        }],
      };

      await thread.send([
        `📋 **Rename #${match.name} → #${newName}**`,
        "",
        "Nothing has been changed.",
        "",
        "Apply? (yes/no)",
      ].join("\n"));
      return;
    }

    // Confirmation / denial
    case "unknown":
    default: {
      // Check for yes/no confirmation
      if (/^(yes|y|confirm|proceed|go|do it|ok|okay|sure|yeah|yep|apply|exec)$/i.test(lower)) {
        if (!session.pendingPlan) {
          await thread.send("Nothing to confirm. Tell me what you'd like to build.");
          return;
        }

        // Execute the plan with live progress
        const plan = session.pendingPlan;
        const executed: string[] = [];
        const failed: Array<{ step: string; error: string }> = [];

        // Send initial progress message
        const progressMsg = await thread.send({
          embeds: [buildProgressEmbed("Executing...", `Running ${plan.steps.length} operation${plan.steps.length > 1 ? "s" : ""}`)],
        });

        for (const step of plan.steps) {
          try {
            // Use the existing tool pipeline
            const { executeWithFullPipeline, resolveUserContext } = await import("../ai/tools/discord/agent-orchestrator");

            const botOwnerIds = config.admin.discordIds;
            const userContext = await resolveUserContext(thread.guild, user.id, botOwnerIds);

            if (!userContext) {
              failed.push({ step: step.description, error: "Could not resolve user context" });
              break;
            }

            const result = await executeWithFullPipeline(
              thread.guild,
              userContext,
              step.toolName,
              step.args,
              thread.id,
              undefined,
              undefined,
              { skipConfirmation: true },
            );

            if (result.status === "success") {
              executed.push(step.description);
            } else {
              failed.push({ step: step.description, error: result.message });
              break;
            }
          } catch (err) {
            failed.push({ step: step.description, error: err instanceof Error ? err.message : String(err) });
            break;
          }
        }

        session.pendingPlan = undefined;

        // Update the progress message with the final result
        const resultEmbed = buildResultEmbed(
          failed.length === 0 ? "Completed" : "Partially Completed",
          failed.length === 0
            ? `✓ ${executed.length} operation${executed.length > 1 ? "s" : ""} completed successfully.`
            : `Ran ${executed.length + failed.length} operation${executed.length + failed.length > 1 ? "s" : ""}.`,
          executed,
          failed,
        );

        await progressMsg.edit({ embeds: [resultEmbed] });
        return;
      }

      if (/^(no|n|cancel|abort|stop|nah|nope|nevermind|deny|reject|decline)$/i.test(lower)) {
        if (session.pendingPlan) {
          session.pendingPlan = undefined;
          await thread.send("❌ Plan cancelled. Nothing was changed.");
        } else {
          await thread.send("Nothing to cancel.");
        }
        return;
      }

      // Unknown message — try to interpret as a new request
      await thread.send([
        "I'm not sure what you mean. Try:",
        '• "inspect my server"',
        '• "create a channel named <name>"',
        '• "generate a gaming template"',
        '• "delete all except general"',
        '• "help"',
      ].join("\n"));
      return;
    }
  }
}

/* ================================================================
 * SESSION ACCESSORS
 * ================================================================ */

export function getBuilderSession(guildId: string, userId: string): BuilderSession | null {
  return getActiveSession(guildId, userId);
}

export function cleanupExpiredSessions(): number {
  const now = Date.now();
  let cleaned = 0;
  for (const [key, session] of builderSessions) {
    if (now - session.lastActivityAt > SESSION_IDLE_TIMEOUT_MS) {
      builderSessions.delete(key);
      cleaned++;
    }
  }
  return cleaned;
}

// Run cleanup every 5 minutes
const cleanupInterval = setInterval(() => {
  cleanupExpiredSessions();
}, 5 * 60 * 1000);
if (cleanupInterval.unref) cleanupInterval.unref();
