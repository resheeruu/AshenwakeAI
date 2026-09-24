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
var prompt_exports = {};
__export(prompt_exports, {
  buildSubjectEnhancements: () => buildSubjectEnhancements,
  cleanupExpiredSessions: () => cleanupExpiredSessions,
  createPromptCommand: () => createPromptCommand,
  extractBuildSubject: () => extractBuildSubject,
  getBuilderSession: () => getBuilderSession,
  inspectServer: () => inspectServer,
  mergeTemplateEnhancements: () => mergeTemplateEnhancements,
  processBuilderMessage: () => processBuilderMessage
});
module.exports = __toCommonJS(prompt_exports);
var import_executor = require("../ai/tools/executor");
var import_discord = require("discord.js");
var import_channel_scope = require("../ai/tools/channel-scope");
var import_audit = require("../security/audit");
var import_env = require("../config/env");
var import_logger = require("../logger");
var import_database = require("../database");
var import_lock = require("../games/lock");
var import_web = require("../web");
var import_nanoid = require("nanoid");
function generateCorrelationId() {
  return `ASH-${(0, import_nanoid.nanoid)(8)}`;
}
function logBuilder(correlationId, stage, message, level = "info") {
  const prefix = `[ASH][${correlationId}][BUILDER]`;
  if (level === "error") {
    import_logger.logger.error(`${prefix}[${stage}] ${message}`);
  } else if (level === "warn") {
    import_logger.logger.warn(`${prefix}[${stage}] ${message}`);
  } else {
    import_logger.logger.info(`${prefix}[${stage}] ${message}`);
  }
}
const builderSessions = (0, import_database.loadBuilderSessionsDB)();
const SESSION_IDLE_TIMEOUT_MS = 10 * 60 * 1e3;
const SESSION_WARNING_MS = 8 * 60 * 1e3;
function getSessionKey(guildId, userId) {
  return `${guildId}:${userId}`;
}
function getSession(guildId, userId) {
  const key = getSessionKey(guildId, userId);
  const session = builderSessions.get(key);
  if (!session) return null;
  const idle = Date.now() - session.lastActivityAt;
  if (idle > SESSION_IDLE_TIMEOUT_MS) {
    return null;
  }
  if (idle > SESSION_WARNING_MS && !session.warnedExpiry) {
    session.warnedExpiry = true;
    session._needsExpiryWarning = true;
  }
  return session;
}
function getActiveSession(guildId, userId) {
  const session = getSession(guildId, userId);
  if (!session) {
    const key = getSessionKey(guildId, userId);
    if (builderSessions.has(key)) {
      builderSessions.delete(key);
      (0, import_database.deleteBuilderSessionDB)(key);
    }
    return null;
  }
  return session;
}
function touchSession(session) {
  session.lastActivityAt = Date.now();
  (0, import_database.saveBuilderSessionDB)(getSessionKey(session.guildId, session.userId), session);
}
async function resolveThread(guild, threadId) {
  const cached = guild.channels.cache.get(threadId);
  if (cached && cached.isThread()) {
    return cached;
  }
  try {
    const fetched = await guild.channels.fetch(threadId);
    if (fetched && fetched.isThread()) {
      return fetched;
    }
  } catch {
  }
  return null;
}
function isThreadHealthy(thread) {
  return thread && thread.isThread() && !thread.archived;
}
function destroySession(guild, session, reason) {
  const key = getSessionKey(session.guildId, session.userId);
  builderSessions.delete(key);
  (0, import_database.deleteBuilderSessionDB)(key);
  if (guild) {
    resolveThread(guild, session.threadId).then((thread) => {
      if (isThreadHealthy(thread)) {
        thread.setArchived(true, reason).catch(() => {
        });
      }
    }).catch(() => {
    });
  }
}
async function isUserTrustedOrAdmin(guildId, userId, guildOwnerId) {
  const aiConfig = (0, import_channel_scope.loadGuildAIConfig)(guildId);
  if (aiConfig.trustedUserIds.includes(userId)) return true;
  if (userId === guildOwnerId) return true;
  const botOwnerIds = import_env.config.admin.discordIds;
  if (botOwnerIds.includes(userId)) return true;
  return false;
}
function toValueCollection(source) {
  if (!source) return [];
  if (Array.isArray(source)) return source;
  if (typeof source.values === "function") return [...source.values()];
  if (typeof source === "object") return Object.values(source);
  return [];
}
async function inspectServer(guild, correlationId) {
  const logPrefix = correlationId ? `[BUILDER][${correlationId}]` : "[BUILDER]";
  const [channelsRaw, rolesRaw] = await Promise.all([
    guild.channels.fetch().catch((error) => {
      import_logger.logger.warn(`${logPrefix} channels.fetch() failed: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }),
    guild.roles.fetch().catch((error) => {
      import_logger.logger.warn(`${logPrefix} roles.fetch() failed: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    })
  ]);
  const channels = toValueCollection(channelsRaw);
  const roles = toValueCollection(rolesRaw);
  const categories = channels.filter((ch) => ch?.type === import_discord.ChannelType.GuildCategory);
  const textChannels = channels.filter((ch) => ch?.type === import_discord.ChannelType.GuildText);
  const voiceChannels = channels.filter((ch) => ch?.type === import_discord.ChannelType.GuildVoice);
  const allChannels = [...textChannels, ...voiceChannels];
  const aiConfig = (0, import_channel_scope.loadGuildAIConfig)(guild.id);
  return {
    categories: categories.map((c) => ({ id: c.id, name: c.name })),
    channels: allChannels.map((c) => ({
      id: c.id,
      name: c.name,
      type: c.type === import_discord.ChannelType.GuildVoice ? "voice" : "text",
      categoryId: c.parentId || void 0
    })),
    roles: roles.filter((r) => r?.name !== "@everyone").map((r) => ({ id: r.id, name: r.name })),
    protectedChannels: aiConfig.protectedChannels || [],
    protectedCategories: aiConfig.protectedCategories || []
  };
}
function parseBuilderInput(content) {
  const lower = content.toLowerCase().trim();
  if (/\b(delete|remove|clear|clean)\b.*\b(all|everything|every|all channels|all categories)\b.*\b(except|but|keep|preserve|leave|save)\b/i.test(lower)) {
    const keepMatch = content.match(/(?:except|but|keep|preserve|leave|save)\s+(?:the\s+)?(?:#)?(\S+)/i);
    return { intent: "delete_all_except", args: { keepName: keepMatch?.[1]?.toLowerCase() } };
  }
  if (/\b(except|but|keep|preserve|leave|save)\b.*\b(all|everything|every)\b.*\b(delete|remove|clear|clean)\b/i.test(lower)) {
    const keepMatch = content.match(/(?:except|but|keep|preserve|leave|save)\s+(?:the\s+)?(?:#)?(\S+)/i);
    return { intent: "delete_all_except", args: { keepName: keepMatch?.[1]?.toLowerCase() } };
  }
  if (/\b(inspect|check|show|what|status|overview|review|scan|diagnose)\b/i.test(lower) && /\b(server|guild|channel|role|category|permission)\b/i.test(lower)) {
    return { intent: "inspect", args: {} };
  }
  if (/\b(server|guild)\b.*\b(look|structure|organiz)\b/i.test(lower)) {
    return { intent: "inspect", args: {} };
  }
  if (/\b(make|turn|set|put)\b.*\b(my|the|this)\b.*\b(server|guild)\b.*\b(better|good|great|nice|clean|organized)\b/i.test(lower)) {
    return { intent: "improve", args: {} };
  }
  if (/\b(improve|upgrade|enhance|fix|repair|clean|organize)\b.*\b(server|guild)\b/i.test(lower)) {
    return { intent: "improve", args: {} };
  }
  if (/\b(generate|create|make|build|prepare|template|layout|structure|set.?up|configure|organize)\b/i.test(lower) && /\b(template|layout|structure|server|guild)\b/i.test(lower)) {
    return { intent: "template", args: { content: lower } };
  }
  if (/\b(create|make|add|build)\b.*\b(channel|text|voice|vc|audio)\b/i.test(lower)) {
    const nameMatch = content.match(/(?:channel|text|voice|vc|audio)\s+(?:called|named|channel)?\s*[`"']?(\S+)[`"']?/i) || content.match(/(?:create|make|add)\s+(?:a\s+)?(?:new\s+)?(?:text\s+|voice\s+)?[`"']?(\S+)[`"']?\s*(?:channel)?/i);
    const wantsVoice = /\b(voice|vc|audio)\b/i.test(lower);
    const catMatch = content.match(/(?:in|under|inside|within)\s+(?:the\s+)?[`"']?(\S+)[`"']?/i);
    return {
      intent: "create_channel",
      args: {
        name: nameMatch?.[1]?.replace(/[^a-zA-Z0-9-_]/g, "").toLowerCase() || "new-channel",
        type: wantsVoice ? "voice" : "text",
        categoryName: catMatch?.[1]?.toLowerCase()
      }
    };
  }
  if (/\b(create|make|add|build)\b.*\b(category|group|section)\b/i.test(lower)) {
    const nameMatch = content.match(/(?:category|group|section)\s+(?:called|named)?\s*[`"']?(\S+)[`"']?/i) || content.match(/(?:create|make|add)\s+(?:a\s+)?(?:new\s+)?[`"']?(\S+)[`"']?\s*(?:category|group|section)?/i);
    return {
      intent: "create_category",
      args: { name: nameMatch?.[1]?.replace(/[^a-zA-Z0-9-_]/g, "-").toLowerCase() || "new-category" }
    };
  }
  if (/\b(create|make|add|build)\b.*\b(role)\b/i.test(lower)) {
    const nameMatch = content.match(/(?:role)\s+(?:called|named)?\s*[`"']?(\S+)[`"']?/i) || content.match(/(?:create|make|add)\s+(?:a\s+)?(?:new\s+)?[`"']?(\S+)[`"']?\s*(?:role)?/i);
    return {
      intent: "create_role",
      args: { name: nameMatch?.[1] || "new-role" }
    };
  }
  if (/\b(delete|remove|destroy)\b.*\b(channel|category)\b/i.test(lower)) {
    const nameMatch = content.match(/(?:delete|remove|destroy)\s+(?:the\s+)?(?:channel\s+|category\s+)?[`"']?#?(\S+)[`"']?/i);
    return {
      intent: "delete_channel",
      args: { name: nameMatch?.[1]?.toLowerCase() }
    };
  }
  if (/\b(rename|change\s+name)\b/i.test(lower)) {
    const match = content.match(/(?:rename|change)\s+(?:the\s+)?(?:name\s+(?:of\s+)?)?(?:channel\s+)?[`"']?#?(\S+)[`"']?\s*(?:to|into)\s*[`"']?(\S+)[`"']?/i);
    if (match) {
      return {
        intent: "rename_channel",
        args: { oldName: match[1].toLowerCase(), newName: match[2].replace(/[^a-zA-Z0-9-_]/g, "").toLowerCase() }
      };
    }
  }
  if (/\b(help|what can|commands|guide)\b/i.test(lower)) {
    return { intent: "help", args: {} };
  }
  return { intent: "unknown", args: { content } };
}
const TEMPLATES = {
  gaming: {
    name: "Gaming Server",
    description: "Setup for gaming communities",
    roles: [{ name: "Gamer", color: "#FF4500" }, { name: "Streamer", color: "#9146FF" }],
    categories: [
      { name: "INFORMATION", channels: [{ name: "rules", type: "text" }, { name: "announcements", type: "text" }] },
      { name: "GENERAL", channels: [{ name: "general", type: "text" }, { name: "memes", type: "text" }] },
      { name: "GAMING", channels: [{ name: "looking-for-group", type: "text" }, { name: "game-clips", type: "text" }] },
      { name: "VOICE", channels: [{ name: "Gaming Lounge", type: "voice" }, { name: "Stream Room", type: "voice" }] }
    ]
  },
  community: {
    name: "Community Server",
    description: "General community setup",
    roles: [{ name: "Moderator", color: "#1E90FF" }],
    categories: [
      { name: "INFORMATION", channels: [{ name: "rules", type: "text" }, { name: "announcements", type: "text" }, { name: "roles", type: "text" }] },
      { name: "GENERAL", channels: [{ name: "introductions", type: "text" }, { name: "general", type: "text" }, { name: "off-topic", type: "text" }] },
      { name: "COMMUNITY", channels: [{ name: "suggestions", type: "text" }, { name: "events", type: "text" }] },
      { name: "VOICE", channels: [{ name: "General Voice", type: "voice" }, { name: "Music", type: "voice" }] }
    ]
  },
  minecraft: {
    name: "Minecraft Server",
    description: "Setup for Minecraft communities",
    roles: [{ name: "Builder", color: "#228B22" }, { name: "Redstone", color: "#DC143C" }],
    categories: [
      { name: "INFO", channels: [{ name: "rules", type: "text" }, { name: "server-ip", type: "text" }] },
      { name: "BUILD", channels: [{ name: "builds", type: "text" }, { name: "schematics", type: "text" }] },
      { name: "SURVIVAL", channels: [{ name: "survival", type: "text" }, { name: "trading", type: "text" }] },
      { name: "VOICE", channels: [{ name: "Build Chat", type: "voice" }] }
    ]
  },
  support: {
    name: "Support Server",
    description: "Help desk and support setup",
    roles: [{ name: "Support Agent", color: "#FFD700" }],
    categories: [
      { name: "INFO", channels: [{ name: "rules", type: "text" }, { name: "faq", type: "text" }] },
      { name: "SUPPORT", channels: [{ name: "general-help", type: "text" }, { name: "bug-reports", type: "text" }] },
      { name: "VOICE", channels: [{ name: "Support Call", type: "voice" }] }
    ]
  },
  study: {
    name: "Study Group",
    description: "Setup for study groups and learning",
    roles: [{ name: "Tutor", color: "#4169E1" }],
    categories: [
      { name: "INFO", channels: [{ name: "rules", type: "text" }, { name: "schedule", type: "text" }] },
      { name: "STUDY", channels: [{ name: "general", type: "text" }, { name: "resources", type: "text" }, { name: "homework-help", type: "text" }] },
      { name: "VOICE", channels: [{ name: "Study Room", type: "voice" }] }
    ]
  },
  creator: {
    name: "Creator Hub",
    description: "Setup for content creators",
    roles: [{ name: "Creator", color: "#FF69B4" }],
    categories: [
      { name: "INFO", channels: [{ name: "rules", type: "text" }, { name: "announcements", type: "text" }] },
      { name: "CONTENT", channels: [{ name: "general", type: "text" }, { name: "showcase", type: "text" }, { name: "collabs", type: "text" }] },
      { name: "VOICE", channels: [{ name: "Stream Room", type: "voice" }] }
    ]
  },
  clan: {
    name: "Clan Server",
    description: "Competitive team setup",
    roles: [{ name: "Captain", color: "#B22222" }, { name: "Member", color: "#696969" }],
    categories: [
      { name: "INFO", channels: [{ name: "rules", type: "text" }, { name: "tryouts", type: "text" }] },
      { name: "TEAM", channels: [{ name: "general", type: "text" }, { name: "strats", type: "text" }, { name: "scrims", type: "text" }] },
      { name: "VOICE", channels: [{ name: "Team Voice", type: "voice" }] }
    ]
  },
  social: {
    name: "Social Hangout",
    description: "Casual chat server",
    roles: [{ name: "VIP", color: "#FFD700" }],
    categories: [
      { name: "INFO", channels: [{ name: "rules", type: "text" }] },
      { name: "CHAT", channels: [{ name: "general", type: "text" }, { name: "media", type: "text" }, { name: "music", type: "text" }] },
      { name: "VOICE", channels: [{ name: "Hangout", type: "voice" }] }
    ]
  },
  friends: {
    name: "Friends Server",
    description: "Private friend group setup",
    roles: [],
    categories: [
      { name: "CHAT", channels: [{ name: "general", type: "text" }, { name: "gaming", type: "text" }] },
      { name: "VOICE", channels: [{ name: "Call", type: "voice" }] }
    ]
  }
};
function detectTemplateType(content) {
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
function extractBuildSubject(content) {
  let subject = content.toLowerCase().trim();
  subject = subject.replace(
    /\b(?:make|create|build|set\s*up|design|configure|prepare|organize|turn|generate)\b\s*(?:a\s+|an\s+|the\s+)?/i,
    ""
  );
  subject = subject.replace(/^(?:the|a|an)\s+/i, "").trim();
  subject = subject.replace(
    /\b(?:for|about|around|like|based\s+on|on|of|in)\s+(?:(?:my|the|a|an)\s+)?(?:discord|server|guild|community|group|hub|space|channel|category|role)\b/gi,
    ""
  );
  subject = subject.replace(
    /\b(?:for|about|around|like|based\s+on|on|of|in)\s+(?:(?:my|the|a|an)\s+)?(?:discord|server|guild|community|group|hub|space|channel)\b/gi,
    ""
  );
  subject = subject.replace(/\b(?:for|about|around|like|based\s+on|on|of|in)\s+(?:(?:my|the|a|an)\s+)?/gi, "").trim();
  const TEMPLATE_VOCAB = /\b(?:discord|server|guild|community|group|hub|space|channel|category|role|template|channels|categories|roles|gaming|minecraft|support|study|creator|clan|social|friends)\b/gi;
  subject = subject.replace(TEMPLATE_VOCAB, " ").replace(/\s+/g, " ").trim();
  const GENERIC = /\b(?:cozy|nice|cool|good|great|best|new|old|big|small|simple|basic|clean|fun|chill|random|default|generic|standard|normal|regular|custom|private|public|free|my|and|into|a)\b/gi;
  subject = subject.replace(GENERIC, " ").replace(/\s+/g, " ").trim();
  if (!subject || subject.length < 2) return "";
  return subject;
}
const STOP_WORDS = /* @__PURE__ */ new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "but",
  "in",
  "on",
  "at",
  "to",
  "for",
  "of",
  "with",
  "by",
  "from",
  "is",
  "it",
  "its",
  "this",
  "that",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "have",
  "has",
  "had",
  "do",
  "does",
  "did",
  "will",
  "would",
  "could",
  "should",
  "may",
  "might",
  "can",
  "shall",
  "not",
  "no",
  "nor",
  "so",
  "if",
  "then",
  "than",
  "too",
  "very",
  "just",
  "about",
  "above",
  "after",
  "again",
  "all",
  "also",
  "any",
  "because",
  "before",
  "between",
  "both",
  "each",
  "few",
  "more",
  "most",
  "other",
  "some",
  "such",
  "into",
  "only",
  "own",
  "same",
  "them",
  "these",
  "those",
  "through",
  "under",
  "until",
  "up",
  "what",
  "when",
  "where",
  "which",
  "while",
  "who",
  "whom",
  "why",
  "how",
  "their",
  "there",
  "they",
  "we",
  "he",
  "she",
  "her",
  "him",
  "his",
  "our",
  "your",
  "my",
  "me",
  "i",
  "you",
  "us",
  "myself",
  "yourself",
  "itself",
  "discord",
  "server",
  "guild",
  "community",
  "make",
  "create",
  "build",
  "setup",
  "channel",
  "category",
  "role",
  "channels",
  "categories",
  "roles"
]);
function buildSubjectEnhancements(subject, researchContent) {
  const words = researchContent.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").split(/\s+/).filter((w) => w.length > 3 && !STOP_WORDS.has(w));
  const freq = /* @__PURE__ */ new Map();
  for (const w of words) {
    freq.set(w, (freq.get(w) || 0) + 1);
  }
  const topTerms = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([word]) => word);
  const categories = [];
  for (const term of topTerms) {
    const name = term.charAt(0).toUpperCase() + term.slice(1).replace(/-/g, " ");
    categories.push({
      name,
      channels: [
        { name: "discussion", type: "text" },
        { name: "resources", type: "text" }
      ]
    });
  }
  return {
    categories,
    roles: []
  };
}
function mergeTemplateEnhancements(baseTemplate, enhancements, subject) {
  const merged = {
    name: baseTemplate.name,
    description: baseTemplate.description,
    roles: [...baseTemplate.roles],
    categories: baseTemplate.categories.map((c) => ({
      name: c.name,
      channels: [...c.channels]
    }))
  };
  const existingNames = new Set(merged.categories.map((c) => c.name.toLowerCase()));
  for (const cat of enhancements.categories) {
    if (!existingNames.has(cat.name.toLowerCase())) {
      merged.categories.splice(merged.categories.length - 1, 0, cat);
      existingNames.add(cat.name.toLowerCase());
    }
  }
  const existingRoles = new Set(merged.roles.map((r) => r.name.toLowerCase()));
  for (const role of enhancements.roles) {
    if (!existingRoles.has(role.name.toLowerCase())) {
      merged.roles.push(role);
      existingRoles.add(role.name.toLowerCase());
    }
  }
  return merged;
}
async function researchAndBuildTemplate(content, baseTemplate) {
  const subject = extractBuildSubject(content);
  if (!subject || subject.length < 2) return null;
  try {
    const query = `${subject} community Discord server`;
    const result = await (0, import_web.webPipeline)(query, {
      searchCount: 3,
      maxSources: 3,
      maxContentLength: 4e3,
      timeoutMs: 1e4
    });
    const hasContent = result.sources.some(
      (s) => s.extractedContent && s.extractedContent.length > 100
    );
    if (!hasContent || result.sources.length === 0) return null;
    const combinedContent = result.sources.map((s) => `${s.title}
${s.snippet}
${s.extractedContent || ""}`).join("\n");
    const enhancements = buildSubjectEnhancements(subject, combinedContent);
    if (enhancements.categories.length === 0) return null;
    const template = mergeTemplateEnhancements(baseTemplate, enhancements, subject);
    const sourceCount = result.sources.length;
    const newCats = enhancements.categories.map((c) => `**${c.name}**`).join(", ");
    const researchSummary = `I researched **${subject}** from ${sourceCount} source${sourceCount > 1 ? "s" : ""}. It mainly involves ${newCats}, so I added those to the ${baseTemplate.name}.`;
    return { template, researchSummary };
  } catch (error) {
    import_logger.logger.debug(`Web research failed for "${subject}": ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}
function classifyResources(serverState, template) {
  const existingCategories = serverState.categories.map((c) => c.name.toLowerCase());
  const existingChannels = serverState.channels.map((c) => c.name.toLowerCase());
  const existingRoles = serverState.roles.map((r) => r.name.toLowerCase());
  const missing = [];
  const exists = [];
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
function buildStepsFromTemplate(template, serverState) {
  const steps = [];
  const existingRoles = serverState.roles.map((r) => r.name.toLowerCase());
  const existingCategories = serverState.categories.map((c) => c.name.toLowerCase());
  const existingChannels = serverState.channels.map((c) => c.name.toLowerCase());
  for (const role of template.roles) {
    if (!existingRoles.includes(role.name.toLowerCase())) {
      steps.push({
        toolName: "create_role",
        args: { name: role.name, color: role.color },
        description: `Create role "${role.name}"`,
        category: "create"
      });
    }
  }
  for (const cat of template.categories) {
    if (!existingCategories.includes(cat.name.toLowerCase())) {
      steps.push({
        toolName: "create_category",
        args: { name: cat.name },
        description: `Create category "${cat.name}"`,
        category: "create"
      });
    }
    for (const ch of cat.channels) {
      if (!existingChannels.includes(ch.name.toLowerCase())) {
        steps.push({
          toolName: "create_channel",
          args: { name: ch.name, type: ch.type, categoryName: cat.name },
          description: `Create ${ch.type} channel "#${ch.name}" in "${cat.name}"`,
          category: "create"
        });
      }
    }
  }
  return steps;
}
const EMBED_COLOR = 2895667;
function buildProgressEmbed(title, description) {
  return new import_discord.EmbedBuilder().setColor(EMBED_COLOR).setTitle(title).setDescription(description);
}
function buildResultEmbed(title, description, executed, failed) {
  const embed = new import_discord.EmbedBuilder().setColor(failed.length === 0 ? 3066993 : 15105570).setTitle(title).setDescription(description);
  if (executed.length > 0) {
    embed.addFields({
      name: "Completed",
      value: executed.map((e) => `\u2713 ${e}`).join("\n")
    });
  }
  if (failed.length > 0) {
    embed.addFields({
      name: "Failed",
      value: failed.map((f) => `\u2717 ${f.step}: ${f.error}`).join("\n")
    });
  }
  return embed;
}
function formatExecutionResult(executed, failed) {
  if (failed.length === 0) {
    const roles = executed.filter((s) => s.includes("role")).length;
    const cats = executed.filter((s) => s.includes("category")).length;
    const chs = executed.filter((s) => s.includes("channel")).length;
    const parts = [];
    if (roles > 0) parts.push(`${roles} role${roles > 1 ? "s" : ""}`);
    if (cats > 0) parts.push(`${cats} categor${cats > 1 ? "ies" : "y"}`);
    if (chs > 0) parts.push(`${chs} channel${chs > 1 ? "s" : ""}`);
    return `\u2705 **Done.** Created ${parts.join(", ")}.`;
  }
  const lines = ["\u26A0\uFE0F **Partially completed.**", ""];
  if (executed.length > 0) {
    lines.push(`**Completed:** ${executed.length} operation${executed.length > 1 ? "s" : ""}`);
  }
  lines.push("", "**Failed:**");
  for (const f of failed) lines.push(`\u2022 ${f.step}: ${f.error}`);
  return lines.join("\n");
}
function createPromptCommand() {
  return {
    data: new import_discord.SlashCommandBuilder().setName("prompt").setDescription("AI-powered server builder \u2014 describe what you want in natural language").addStringOption(
      (option) => option.setName("prompt").setDescription("What you'd like to build, inspect, or change").setRequired(true).setMaxLength(2e3)
    ),
    async execute(interaction) {
      const guild = interaction.guild;
      if (!guild) {
        await interaction.editReply("\u274C This command can only be used in a server.").catch(() => {
        });
        return;
      }
      const userId = interaction.user.id;
      const guildOwnerId = guild.ownerId;
      const authorized = await isUserTrustedOrAdmin(guild.id, userId, guildOwnerId);
      if (!authorized) {
        await interaction.editReply("\u274C You don't have permission to use `/prompt`.").catch(() => {
        });
        return;
      }
      const prompt = interaction.options.getString("prompt", true);
      if (prompt.trim().length < 2) {
        await interaction.editReply("\u274C Please provide a meaningful prompt (at least 2 characters).").catch(() => {
        });
        return;
      }
      const existingSession = getActiveSession(guild.id, userId);
      if (existingSession) {
        const existingThread = await resolveThread(guild, existingSession.threadId);
        if (isThreadHealthy(existingThread)) {
          touchSession(existingSession);
          await interaction.editReply(`\u267B\uFE0F Routed to your existing builder session: <#${existingThread.id}>`).catch(() => {
          });
          (0, import_audit.recordAudit)({
            who: userId,
            whoName: interaction.user.tag,
            what: `Reused builder session in thread ${existingThread.id}`,
            where: "prompt-command",
            guildId: guild.id,
            result: "success"
          });
          try {
            await processBuilderMessage(interaction.client, existingThread, existingSession, prompt, interaction.user);
          } catch (processError) {
            import_logger.logger.error(
              "\u26A0\uFE0F Prompt processing failed in reused session:",
              processError instanceof Error ? processError.message : String(processError)
            );
            await existingThread.send("\u26A0\uFE0F There was an issue processing your prompt. You can try again in this thread.").catch(() => {
            });
          }
          return;
        }
        destroySession(guild, existingSession, "Thread deleted or inaccessible");
      }
      const lockKey = `builder-create:${guild.id}:${userId}`;
      let sessionCreated = false;
      try {
        await (0, import_lock.withLock)(lockKey, async () => {
          const recheck = getActiveSession(guild.id, userId);
          if (recheck) {
            const recheckThread = await resolveThread(guild, recheck.threadId);
            if (isThreadHealthy(recheckThread)) {
              touchSession(recheck);
              await interaction.editReply(`\u267B\uFE0F Routed to your existing builder session: <#${recheckThread.id}>`).catch(() => {
              });
              try {
                await processBuilderMessage(interaction.client, recheckThread, recheck, prompt, interaction.user);
              } catch (processError) {
                import_logger.logger.error(
                  "\u26A0\uFE0F Prompt processing failed in reused session:",
                  processError instanceof Error ? processError.message : String(processError)
                );
                await recheckThread.send("\u26A0\uFE0F There was an issue processing your prompt. You can try again in this thread.").catch(() => {
                });
              }
              sessionCreated = true;
              return;
            }
            destroySession(guild, recheck, "Stale session under lock");
          }
          const interactionChannel = interaction.channel;
          if (!interactionChannel || !("threads" in interactionChannel)) {
            await interaction.editReply("\u274C Cannot create a thread in this channel.").catch(() => {
            });
            return;
          }
          const thread = await interactionChannel.threads.create({
            name: `builder-${interaction.user.username}`,
            autoArchiveDuration: import_discord.ThreadAutoArchiveDuration.OneHour
          });
          const session = {
            guildId: guild.id,
            channelId: interaction.channel?.id || "",
            threadId: thread.id,
            userId,
            startedAt: Date.now(),
            lastActivityAt: Date.now(),
            lastStateFetchedAt: 0
          };
          builderSessions.set(getSessionKey(guild.id, userId), session);
          (0, import_database.saveBuilderSessionDB)(getSessionKey(guild.id, userId), session);
          const sessionEmbed = new import_discord.EmbedBuilder().setColor(2895667).setTitle("New Session").setDescription(`**Prompt:** ${prompt}`).addFields({
            name: "Note",
            value: "Keep the convo in this thread for session memory. To save something permanently, just tell the agent to remember it!"
          }).setFooter({ text: "Free \u2022 AshenAI Agent" });
          await thread.send({ embeds: [sessionEmbed] });
          await interaction.editReply(`\u2705 Builder session opened: <#${thread.id}>`).catch(() => {
          });
          (0, import_audit.recordAudit)({
            who: userId,
            whoName: interaction.user.tag,
            what: `Opened builder session in thread ${thread.id}`,
            where: "prompt-command",
            guildId: guild.id,
            result: "success"
          });
          sessionCreated = true;
          try {
            await processBuilderMessage(interaction.client, thread, session, prompt, interaction.user);
          } catch (processError) {
            import_logger.logger.error(
              "\u26A0\uFE0F Initial prompt processing failed (session still open):",
              processError instanceof Error ? processError.message : String(processError)
            );
            await thread.send("\u26A0\uFE0F Builder session opened, but I couldn't process the prompt. You can try again in this thread.").catch(() => {
            });
          }
        }, 2e4);
      } catch (error) {
        if (sessionCreated) return;
        const errMsg = error instanceof Error ? error.message : String(error);
        if (errMsg.includes("LOCK_TIMEOUT")) {
          import_logger.logger.warn("\u26A0\uFE0F /prompt session creation lock timeout:", errMsg);
          await interaction.editReply("\u23F3 Session creation is taking longer than expected. Please try again in a moment.").catch(() => {
          });
          return;
        }
        import_logger.logger.error("\u274C /prompt failed:", errMsg);
        if (errMsg.includes("permission") || errMsg.includes("Permission")) {
          await interaction.editReply("\u274C You don't have permission to use `/prompt`.").catch(() => {
          });
        } else if (errMsg.includes("thread") || errMsg.includes("channel")) {
          await interaction.editReply("\u274C Failed to create builder session. Cannot create a thread in this channel.").catch(() => {
          });
        } else {
          await interaction.editReply("\u274C Failed to create builder session. Please try again.").catch(() => {
          });
        }
      }
    }
  };
}
async function processBuilderMessage(client, thread, session, content, user) {
  touchSession(session);
  if (session._needsExpiryWarning) {
    session._needsExpiryWarning = false;
    await thread.send("\u23F3 This builder session will expire soon if unused.").catch(() => {
    });
  }
  const lower = content.toLowerCase().trim();
  const parsed = parseBuilderInput(content);
  const correlationId = generateCorrelationId();
  switch (parsed.intent) {
    case "help": {
      await thread.send([
        "**Builder Commands**",
        "",
        "\u2022 `create a channel named <name>` \u2014 Create a text/voice channel",
        "\u2022 `create a category named <name>` \u2014 Create a category",
        "\u2022 `create a role named <name>` \u2014 Create a role",
        "\u2022 `delete <channel>` \u2014 Delete a channel",
        "\u2022 `delete all except <name>` \u2014 Delete everything except specified",
        "\u2022 `rename <old> to <new>` \u2014 Rename a channel",
        "\u2022 `inspect my server` \u2014 View server structure",
        "\u2022 `make my server better` \u2014 Get improvement suggestions",
        "\u2022 `generate a <type> template` \u2014 Preview a template",
        "\u2022 `yes` / `no` \u2014 Confirm or cancel a pending plan"
      ].join("\n"));
      return;
    }
    case "inspect": {
      try {
        const serverState = await inspectServer(thread.guild, correlationId);
        session.serverState = serverState;
        session.lastStateFetchedAt = Date.now();
        const lines = [
          "\u{1F50E} **Server Review**",
          "",
          `**Categories:** ${serverState.categories.length}`,
          ...serverState.categories.map((c) => `  \u2022 ${c.name}`),
          "",
          `**Channels:** ${serverState.channels.length}`,
          ...serverState.channels.slice(0, 20).map((c) => `  \u2022 #${c.name} (${c.type})`),
          serverState.channels.length > 20 ? `  \u2022 ... and ${serverState.channels.length - 20} more` : "",
          "",
          `**Roles:** ${serverState.roles.length}`,
          ...serverState.roles.slice(0, 10).map((r) => `  \u2022 ${r.name}`),
          serverState.roles.length > 10 ? `  \u2022 ... and ${serverState.roles.length - 10} more` : ""
        ];
        await thread.send(lines.join("\n"));
      } catch (error) {
        logBuilder(correlationId, "INSPECT", `server inspection failed: ${error instanceof Error ? error.message : String(error)}`, "error");
        await thread.send(`\u274C I couldn't inspect the server. Error ID: "${correlationId}".`).catch(() => {
        });
      }
      return;
    }
    case "improve": {
      try {
        const serverState = await inspectServer(thread.guild, correlationId);
        session.serverState = serverState;
        session.lastStateFetchedAt = Date.now();
        const recommendations = [];
        if (serverState.categories.length === 0 && serverState.channels.length < 5) {
          recommendations.push("\u2022 Your server has very little structure \u2014 I can set up a template for you");
        }
        const uncategorized = serverState.channels.filter((c) => !c.categoryId);
        if (uncategorized.length > 2) {
          recommendations.push(`\u2022 ${uncategorized.length} channels are not organized into categories`);
        }
        const channelCounts = /* @__PURE__ */ new Map();
        for (const ch of serverState.channels) {
          const key = ch.name.toLowerCase();
          channelCounts.set(key, (channelCounts.get(key) || 0) + 1);
        }
        const dupCount = [...channelCounts.values()].filter((c) => c > 1).length;
        if (dupCount > 0) {
          recommendations.push(`\u2022 Found ${dupCount} duplicate channel name(s)`);
        }
        const hasRules = serverState.channels.some((c) => c.name.toLowerCase() === "rules");
        const hasAnnouncements = serverState.channels.some((c) => c.name.toLowerCase() === "announcements");
        if (!hasRules || !hasAnnouncements) {
          recommendations.push("\u2022 Missing basic channels (rules, announcements)");
        }
        if (recommendations.length === 0) {
          await thread.send("\u2705 Your server looks well-organized! No issues detected.");
          return;
        }
        await thread.send([
          "**Server Improvement**",
          "",
          ...recommendations,
          "",
          "Want me to set up a template to organize things better?"
        ].join("\n"));
      } catch (error) {
        logBuilder(correlationId, "IMPROVE", `server analysis failed: ${error instanceof Error ? error.message : String(error)}`, "error");
        await thread.send(`\u274C I couldn't analyze the server. Error ID: "${correlationId}".`).catch(() => {
        });
      }
      return;
    }
    case "template": {
      const correlationId2 = generateCorrelationId();
      logBuilder(correlationId2, "START", `template request: "${content}"`);
      try {
        const templateType = detectTemplateType(content);
        let template = TEMPLATES[templateType];
        let researchSummary;
        if (!template) {
          await thread.send(`\u274C Unknown template type. Available: ${Object.keys(TEMPLATES).join(", ")}`);
          return;
        }
        const subject = extractBuildSubject(content);
        if (subject && subject.length >= 2) {
          logBuilder(correlationId2, "RESEARCH", `subject="${subject}"`);
          const research = await researchAndBuildTemplate(content, template);
          if (research) {
            template = research.template;
            researchSummary = research.researchSummary;
          }
        } else {
          logBuilder(correlationId2, "RESEARCH", "no meaningful subject \u2014 skipping web research");
        }
        logBuilder(correlationId2, "INSPECT", "fetching server state");
        const serverState = await inspectServer(thread.guild, correlationId2);
        session.serverState = serverState;
        session.lastStateFetchedAt = Date.now();
        const classification = classifyResources(serverState, template);
        if (classification.missing.length === 0) {
          await thread.send(`\u2705 Your server already matches the "${template.name}" template. No changes needed.`);
          logBuilder(correlationId2, "DONE", "server already matches template");
          return;
        }
        const steps = buildStepsFromTemplate(template, serverState);
        session.pendingPlan = {
          id: `template-${Date.now()}`,
          goal: template.name,
          steps,
          templateName: templateType
        };
        const preview = [];
        if (researchSummary) {
          preview.push(researchSummary, "");
        }
        preview.push(
          `\u{1F4CB} **${template.name}**`,
          template.description,
          "",
          "**Create:**"
        );
        const roles = steps.filter((s) => s.description.includes("role")).length;
        const cats = steps.filter((s) => s.description.includes("category")).length;
        const chs = steps.filter((s) => s.description.includes("channel")).length;
        if (roles > 0) preview.push(`\u2022 ${roles} role${roles > 1 ? "s" : ""}`);
        if (cats > 0) preview.push(`\u2022 ${cats} categor${cats > 1 ? "ies" : "y"}`);
        if (chs > 0) preview.push(`\u2022 ${chs} channel${chs > 1 ? "s" : ""}`);
        if (classification.exists.length > 0) {
          preview.push("", `**Preserve:** ${classification.exists.length} existing resource${classification.exists.length > 1 ? "s" : ""}`);
        }
        preview.push("", "Nothing has been changed.", "", "Apply this template? (yes/no)");
        await thread.send(preview.join("\n"));
        logBuilder(correlationId2, "PREVIEW", `sent plan with ${steps.length} steps`);
        return;
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        logBuilder(correlationId2, "ERROR", `template processing failed: ${errMsg}`, "error");
        await thread.send(
          `\u274C I couldn't process that template request. Error ID: "${correlationId2}". Check the bot logs for details.`
        ).catch(() => {
        });
        return;
      }
    }
    case "delete_all_except": {
      try {
        const keepName = parsed.args.keepName;
        if (!keepName) {
          await thread.send(`I'm not sure which channels to keep. Try: "delete all except general"`);
          return;
        }
        const serverState = session.serverState || await inspectServer(thread.guild, correlationId);
        session.serverState = serverState;
        const keepChannels = serverState.channels.filter(
          (ch) => ch.name.toLowerCase().includes(keepName)
        );
        if (keepChannels.length === 0) {
          await thread.send(`\u274C No channel found matching "${keepName}".`);
          return;
        }
        const keepIds = new Set(keepChannels.map((ch) => ch.id));
        const deleteChannels = serverState.channels.filter(
          (ch) => !keepIds.has(ch.id) && !serverState.protectedChannels.includes(ch.id)
        );
        if (deleteChannels.length === 0) {
          await thread.send(`\u2705 Nothing to delete \u2014 all channels either match "${keepName}" or are protected.`);
          return;
        }
        const steps = deleteChannels.map((ch) => ({
          toolName: "delete_channel",
          args: { channelId: ch.id },
          description: `Delete #${ch.name}`,
          category: "delete"
        }));
        session.pendingPlan = {
          id: `delete-except-${Date.now()}`,
          goal: `Delete ${deleteChannels.length} channels except ${keepChannels.map((c) => `#${c.name}`).join(", ")}`,
          steps
        };
        const lines = [
          `\u{1F9F9} **${deleteChannels.length} channel${deleteChannels.length > 1 ? "s" : ""} to remove.**`,
          "",
          "**Keep:**",
          ...keepChannels.map((ch) => `\u2022 #${ch.name}`),
          "",
          "**Delete:**",
          ...deleteChannels.slice(0, 10).map((ch) => `\u2022 #${ch.name}`)
        ];
        if (deleteChannels.length > 10) {
          lines.push(`\u2022 ... and ${deleteChannels.length - 10} more`);
        }
        if (serverState.protectedChannels.length > 0) {
          lines.push("", `\u2022 ${serverState.protectedChannels.length} protected channel(s) will be preserved`);
        }
        lines.push("", "This is destructive. Continue? (yes/no)");
        await thread.send(lines.join("\n"));
      } catch (error) {
        logBuilder(correlationId, "DELETE_EXCEPT", `delete planning failed: ${error instanceof Error ? error.message : String(error)}`, "error");
        await thread.send(`\u274C I couldn't plan the deletion. Error ID: "${correlationId}".`).catch(() => {
        });
      }
      return;
    }
    case "create_channel": {
      try {
        const name = parsed.args.name;
        const type = parsed.args.type;
        const categoryName = parsed.args.categoryName;
        session.pendingPlan = {
          id: `create-channel-${Date.now()}`,
          goal: `Create ${type} channel "#${name}"`,
          steps: [{
            toolName: "create_channel",
            args: { name, type, categoryName },
            description: `Create ${type} channel "#${name}"${categoryName ? ` in "${categoryName}"` : ""}`,
            category: "create"
          }]
        };
        await thread.send([
          `\u{1F4CB} **Create ${type} channel "#${name}"**${categoryName ? ` in "${categoryName}"` : ""}`,
          "",
          "Nothing has been changed.",
          "",
          "Apply? (yes/no)"
        ].join("\n"));
      } catch (error) {
        logBuilder(correlationId, "CREATE_CHANNEL", `channel planning failed: ${error instanceof Error ? error.message : String(error)}`, "error");
        await thread.send(`\u274C I couldn't plan the channel creation. Error ID: "${correlationId}".`).catch(() => {
        });
      }
      return;
    }
    case "create_category": {
      try {
        const name = parsed.args.name;
        session.pendingPlan = {
          id: `create-category-${Date.now()}`,
          goal: `Create category "${name}"`,
          steps: [{
            toolName: "create_category",
            args: { name },
            description: `Create category "${name}"`,
            category: "create"
          }]
        };
        await thread.send([
          `\u{1F4CB} **Create category "${name}"**`,
          "",
          "Nothing has been changed.",
          "",
          "Apply? (yes/no)"
        ].join("\n"));
      } catch (error) {
        logBuilder(correlationId, "CREATE_CATEGORY", `category planning failed: ${error instanceof Error ? error.message : String(error)}`, "error");
        await thread.send(`\u274C I couldn't plan the category creation. Error ID: "${correlationId}".`).catch(() => {
        });
      }
      return;
    }
    case "create_role": {
      try {
        const name = parsed.args.name;
        session.pendingPlan = {
          id: `create-role-${Date.now()}`,
          goal: `Create role "${name}"`,
          steps: [{
            toolName: "create_role",
            args: { name },
            description: `Create role "${name}"`,
            category: "create"
          }]
        };
        await thread.send([
          `\u{1F4CB} **Create role "${name}"**`,
          "",
          "Nothing has been changed.",
          "",
          "Apply? (yes/no)"
        ].join("\n"));
      } catch (error) {
        logBuilder(correlationId, "CREATE_ROLE", `role planning failed: ${error instanceof Error ? error.message : String(error)}`, "error");
        await thread.send(`\u274C I couldn't plan the role creation. Error ID: "${correlationId}".`).catch(() => {
        });
      }
      return;
    }
    case "delete_channel": {
      try {
        const name = parsed.args.name;
        const serverState = session.serverState || await inspectServer(thread.guild, correlationId);
        const match = serverState.channels.find((ch) => ch.name.toLowerCase() === name);
        if (!match) {
          await thread.send(`\u274C No channel found matching "${name}".`);
          return;
        }
        session.pendingPlan = {
          id: `delete-channel-${Date.now()}`,
          goal: `Delete #${match.name}`,
          steps: [{
            toolName: "delete_channel",
            args: { channelId: match.id },
            description: `Delete #${match.name}`,
            category: "delete"
          }]
        };
        await thread.send([
          `\u26A0\uFE0F **Delete #${match.name}?**`,
          "",
          "This is destructive. Continue? (yes/no)"
        ].join("\n"));
      } catch (error) {
        logBuilder(correlationId, "DELETE_CHANNEL", `channel deletion planning failed: ${error instanceof Error ? error.message : String(error)}`, "error");
        await thread.send(`\u274C I couldn't plan the channel deletion. Error ID: "${correlationId}".`).catch(() => {
        });
      }
      return;
    }
    case "rename_channel": {
      try {
        const oldName = parsed.args.oldName;
        const newName = parsed.args.newName;
        const serverState = session.serverState || await inspectServer(thread.guild, correlationId);
        const match = serverState.channels.find((ch) => ch.name.toLowerCase() === oldName);
        if (!match) {
          await thread.send(`\u274C No channel found matching "${oldName}".`);
          return;
        }
        session.pendingPlan = {
          id: `rename-channel-${Date.now()}`,
          goal: `Rename #${match.name} to #${newName}`,
          steps: [{
            toolName: "rename_channel",
            args: { channelId: match.id, newName },
            description: `Rename #${match.name} to #${newName}`,
            category: "modify"
          }]
        };
        await thread.send([
          `\u{1F4CB} **Rename #${match.name} \u2192 #${newName}**`,
          "",
          "Nothing has been changed.",
          "",
          "Apply? (yes/no)"
        ].join("\n"));
      } catch (error) {
        logBuilder(correlationId, "RENAME_CHANNEL", `channel rename planning failed: ${error instanceof Error ? error.message : String(error)}`, "error");
        await thread.send(`\u274C I couldn't plan the channel rename. Error ID: "${correlationId}".`).catch(() => {
        });
      }
      return;
    }
    // Confirmation / denial
    case "unknown":
    default: {
      if (/^(yes|y|confirm|proceed|go|do it|ok|okay|sure|yeah|yep|apply|exec)$/i.test(lower)) {
        if (!session.pendingPlan) {
          await thread.send("Nothing to confirm. Tell me what you'd like to build.");
          return;
        }
        logBuilder(correlationId, "EXEC_START", `executing plan: ${session.pendingPlan.goal} (${session.pendingPlan.steps.length} steps)`);
        const plan = session.pendingPlan;
        const executed = [];
        const failed = [];
        const progressMsg = await thread.send({
          embeds: [buildProgressEmbed("Executing...", `Running ${plan.steps.length} operation${plan.steps.length > 1 ? "s" : ""}`)]
        });
        for (let i = 0; i < plan.steps.length; i++) {
          const step = plan.steps[i];
          try {
            const { executeWithFullPipeline, resolveUserContext } = await import("../ai/tools/discord/agent-orchestrator");
            const botOwnerIds = import_env.config.admin.discordIds;
            const userContext = await resolveUserContext(thread.guild, user.id, botOwnerIds);
            if (!userContext) {
              const err = "Could not resolve user context";
              logBuilder(correlationId, "EXEC_FAIL", `step ${i + 1}/${plan.steps.length} "${step.description}": ${err}`, "error");
              failed.push({ step: step.description, error: err });
              break;
            }
            logBuilder(correlationId, "EXEC_STEP", `step ${i + 1}/${plan.steps.length}: ${step.toolName}`);
            const result = await executeWithFullPipeline(
              thread.guild,
              userContext,
              step.toolName,
              step.args,
              thread.id,
              void 0,
              void 0,
              { [import_executor.INTERNAL_SKIP_CONFIRMATION]: true }
            );
            if (result.status === "success") {
              executed.push(step.description);
              logBuilder(correlationId, "EXEC_OK", `${step.toolName} succeeded`);
            } else {
              const err = result.message || "Tool execution returned non-success status";
              logBuilder(correlationId, "EXEC_FAIL", `step ${i + 1}/${plan.steps.length} "${step.description}": ${err}`, "error");
              failed.push({ step: step.description, error: err });
              break;
            }
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            logBuilder(correlationId, "EXEC_ERROR", `step ${i + 1}/${plan.steps.length} "${step.description}" threw: ${errMsg}`, "error");
            failed.push({ step: step.description, error: errMsg });
            break;
          }
        }
        session.pendingPlan = void 0;
        const resultEmbed = buildResultEmbed(
          failed.length === 0 ? "Completed" : "Partially Completed",
          failed.length === 0 ? `\u2713 ${executed.length} operation${executed.length > 1 ? "s" : ""} completed successfully.` : `Ran ${executed.length + failed.length} operation${executed.length + failed.length > 1 ? "s" : ""}.`,
          executed,
          failed
        );
        await progressMsg.edit({ embeds: [resultEmbed] });
        logBuilder(correlationId, "EXEC_DONE", `completed: ${executed.length} succeeded, ${failed.length} failed`);
        return;
      }
      if (/^(no|n|cancel|abort|stop|nah|nope|nevermind|deny|reject|decline)$/i.test(lower)) {
        if (session.pendingPlan) {
          session.pendingPlan = void 0;
          await thread.send("\u274C Plan cancelled. Nothing was changed.");
        } else {
          await thread.send("Nothing to cancel.");
        }
        return;
      }
      await thread.send([
        "I'm not sure what you mean. Try:",
        '\u2022 "inspect my server"',
        '\u2022 "create a channel named <name>"',
        '\u2022 "generate a gaming template"',
        '\u2022 "delete all except general"',
        '\u2022 "help"'
      ].join("\n"));
      return;
    }
  }
}
function getBuilderSession(guildId, userId) {
  return getActiveSession(guildId, userId);
}
function cleanupExpiredSessions() {
  const now = Date.now();
  let cleaned = 0;
  for (const [key, session] of builderSessions) {
    if (now - session.lastActivityAt > SESSION_IDLE_TIMEOUT_MS) {
      builderSessions.delete(key);
      (0, import_database.deleteBuilderSessionDB)(key);
      cleaned++;
    }
  }
  (0, import_database.deleteExpiredBuilderSessionsDB)(SESSION_IDLE_TIMEOUT_MS);
  return cleaned;
}
const cleanupInterval = setInterval(() => {
  cleanupExpiredSessions();
}, 5 * 60 * 1e3);
if (cleanupInterval.unref) cleanupInterval.unref();
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  buildSubjectEnhancements,
  cleanupExpiredSessions,
  createPromptCommand,
  extractBuildSubject,
  getBuilderSession,
  inspectServer,
  mergeTemplateEnhancements,
  processBuilderMessage
});
