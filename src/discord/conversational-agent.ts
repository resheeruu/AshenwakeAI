import type { Client, Guild, Message } from "discord.js";
import { PermissionFlagsBits } from "discord.js";
import { logger } from "../logger";
import { loadGuildAIConfig } from "../ai/tools/channel-scope";
import { resolveRole } from "../security/permissions";
import type { AshenRole } from "../security/permissions";
import { recordAudit } from "../security/audit";
import { toolRegistry } from "../ai/tools/registry";
import { executeTool } from "../ai/tools/executor";
import { createActionPlan } from "../ai/tools/executor";
import { storePendingPlan, getPendingPlan, verifyPlan, markPlanExecuted, removePendingPlan } from "../ai/tools/confirmation-store";
import {
  resolveUserContext,
  checkBotPermissions,
  checkRoleHierarchy,
  checkTargetProtection,
  checkFullAuthorization,
  executeWithFullPipeline,
  executeMultiStep,
  inspectServerState,
  formatServerState,
  type ResolvedUserContext,
  type ServerState,
} from "../ai/tools/discord/agent-orchestrator";
import {
  getLastUndoForUser,
  executeUndo,
  recordUndo,
  type UndoAction,
} from "../ai/tools/discord/undo-manager";
import { createBackup } from "../core/backup-manager";
import { isProtectedResource, isChannelProtected } from "../ai/tools/discord/protection";
import type { ToolContext, ToolResult, ActionPlan } from "../ai/tools/types";
import { config } from "../config/env";

/* ================================================================
 * UNIFIED CONVERSATIONAL AGENT
 *
 * Bridges natural language conversation to the existing tool framework.
 * This is the single entry point for all conversational server management.
 *
 * Flow:
 *   User message → Classify intent → Inspect server → Authorize
 *   → Risk analysis → Action plan → Confirmation → Execute → Verify → Audit
 * ================================================================ */

/* ================================================================
 * INTENT CLASSIFICATION
 * ================================================================ */

export type ConversationIntent =
  | "normal_chat"
  | "server_inspect"
  | "server_modify"
  | "server_repair"
  | "moderation"
  | "undo"
  | "confirmation"
  | "denial"
  | "help";

export interface ClassifiedIntent {
  intent: ConversationIntent;
  confidence: number;
  extractedTool?: string;
  extractedArgs?: Record<string, unknown>;
  targetUserId?: string;
  targetChannelName?: string;
  targetRoleName?: string;
}

/* ================================================================
 * CONVERSATION STATE (per user per guild)
 * ================================================================ */

export interface ConversationState {
  userId: string;
  guildId: string;
  channelId: string;
  lastAction?: {
    toolName: string;
    args: Record<string, unknown>;
    planId?: string;
    timestamp: number;
  };
  pendingConfirmation?: {
    planId: string;
    toolName: string;
    args: Record<string, unknown>;
    timestamp: number;
  };
  lastServerState?: ServerState;
  lastStateFetchedAt: number;
}

const conversationStates = new Map<string, ConversationState>();
const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

function getStateKey(userId: string, guildId: string): string {
  return `${userId}:${guildId}`;
}

function getOrCreateState(userId: string, guildId: string, channelId: string): ConversationState {
  const key = getStateKey(userId, guildId);
  let state = conversationStates.get(key);

  if (!state || Date.now() - state.lastStateFetchedAt > STATE_TTL_MS) {
    state = {
      userId,
      guildId,
      channelId,
      lastStateFetchedAt: Date.now(),
    };
    conversationStates.set(key, state);
  }

  return state;
}

/* ================================================================
 * CLASSIFY USER INTENT
 *
 * Determines what the user wants based on their message.
 * Uses keyword matching + context (conversation state, mentioned users).
 * ================================================================ */

export function classifyIntent(
  content: string,
  state: ConversationState,
  mentionedUserIds: string[],
): ClassifiedIntent {
  const lower = content.toLowerCase().trim();

  // Confirmation/denial of pending action
  if (state.pendingConfirmation) {
    if (/^(yes|y|confirm|proceed|go|do it|ok|okay|sure|yeah|yep)$/i.test(lower)) {
      return { intent: "confirmation", confidence: 0.95 };
    }
    if (/^(no|n|cancel|abort|stop|nah|nope|nevermind)$/i.test(lower)) {
      return { intent: "denial", confidence: 0.95 };
    }
  }

  // Undo request
  if (/\b(undo|reverse|revert|take back|cancel that)\b/i.test(lower)) {
    return { intent: "undo", confidence: 0.9 };
  }

  // Server inspection requests
  if (/\b(what('?s| is| are)|show|check|inspect|diagnose|status|overview|summary)\b.*\b(server|guild|channel|role|permission|config|setup|health)\b/i.test(lower)) {
    return { intent: "server_inspect", confidence: 0.85 };
  }
  if (/\b(what('?s| is) wrong|what can|fix|repair|problem|issue|error|broken)\b/i.test(lower)) {
    return { intent: "server_repair", confidence: 0.8 };
  }
  if (/\b(server|guild)\b.*\b(wrong|broken|issue|problem|fix|repair)\b/i.test(lower)) {
    return { intent: "server_repair", confidence: 0.8 };
  }

  // Moderation requests
  if (/\b(warn|warning|timeout|mute|kick|ban|purge|remove messages)\b/i.test(lower)) {
    return { intent: "moderation", confidence: 0.85 };
  }

  // Server modification requests
  if (/\b(create|make|add|set up|setup|configure|build|organize|rename|move|delete|remove|edit|change|modify|protect|unprotect)\b/i.test(lower)) {
    return { intent: "server_modify", confidence: 0.8 };
  }
  if (/\b(give|assign|remove|configure)\b.*\b(role|permission)\b/i.test(lower)) {
    return { intent: "server_modify", confidence: 0.8 };
  }

  // Help request
  if (/\b(help|what can you|how do|what do you)\b/i.test(lower)) {
    return { intent: "help", confidence: 0.7 };
  }

  return { intent: "normal_chat", confidence: 0.5 };
}

/* ================================================================
 * RESOLVE GUILD FROM MESSAGE
 * ================================================================ */

async function resolveGuild(
  client: Client,
  message: Message,
): Promise<{ guild: Guild; userContext: ResolvedUserContext } | null> {
  if (!message.guild) return null;

  const guild = message.guild;
  const botOwnerIds = config.admin.discordIds;

  const userContext = await resolveUserContext(guild, message.author.id, botOwnerIds);
  if (!userContext) return null;

  return { guild, userContext };
}

/* ================================================================
 * GET SERVER STATE (cached)
 * ================================================================ */

async function getCachedServerState(
  guild: Guild,
  state: ConversationState,
): Promise<ServerState> {
  if (state.lastServerState && Date.now() - state.lastStateFetchedAt < STATE_TTL_MS) {
    return state.lastServerState;
  }

  const serverState = await inspectServerState(guild);
  state.lastServerState = serverState;
  state.lastStateFetchedAt = Date.now();
  return serverState;
}

/* ================================================================
 * BUILD TOOL ARGUMENTS FROM NATURAL LANGUAGE
 *
 * Given a tool name and the user's message, extracts the needed
 * arguments. This uses the AI context for complex extraction.
 * ================================================================ */

export function buildToolArgs(
  toolName: string,
  content: string,
  mentionedUserIds: string[],
  serverState: ServerState,
): Record<string, unknown> | null {
  const lower = content.toLowerCase();
  const args: Record<string, unknown> = {};

  switch (toolName) {
    case "inspect_server": {
      return {};
    }

    case "list_channels": {
      return {};
    }

    case "check_permissions": {
      return {};
    }

    case "inspect_roles": {
      return {};
    }

    case "health_check": {
      return {};
    }

    case "inspect_ai_config": {
      return {};
    }

    case "list_protected_resources": {
      return {};
    }

    case "create_channel": {
      // Extract channel name from message
      const nameMatch = content.match(/(?:channel|text|voice)\s+(?:called|named|channel)?\s*[`"']?(\S+)[`"']?/i)
        || content.match(/(?:create|make|add)\s+(?:a\s+)?(?:new\s+)?(?:text\s+|voice\s+)?[`"']?(\S+)[`"']?\s*(?:channel)?/i);
      const name = nameMatch?.[1]?.replace(/[^a-zA-Z0-9-_]/g, "-").toLowerCase() || "new-channel";

      // Check for category
      let categoryId: string | undefined;
      const catMatch = content.match(/(?:in|under|inside|within)\s+(?:the\s+)?[`"']?(\S+)[`"']?/i);
      if (catMatch) {
        const catName = catMatch[1].toLowerCase();
        const foundCat = serverState.categories.find(c => c.name.toLowerCase().includes(catName));
        if (foundCat) categoryId = foundCat.id;
      }

      // Determine channel type
      const isVoice = /\b(voice|vc|audio)\b/i.test(content);

      args.name = name;
      if (categoryId) args.categoryId = categoryId;
      args.type = isVoice ? "voice" : "text";
      return args;
    }

    case "create_category": {
      const nameMatch = content.match(/(?:category|group|section)\s+(?:called|named)?\s*[`"']?(\S+)[`"']?/i)
        || content.match(/(?:create|make|add)\s+(?:a\s+)?(?:new\s+)?[`"']?(\S+)[`"']?\s*(?:category|group|section)?/i);
      const name = nameMatch?.[1]?.replace(/[^a-zA-Z0-9-_]/g, "-").toLowerCase() || "new-category";
      args.name = name;
      return args;
    }

    case "create_role": {
      const nameMatch = content.match(/(?:role)\s+(?:called|named)?\s*[`"']?(\S+)[`"']?/i)
        || content.match(/(?:create|make|add)\s+(?:a\s+)?(?:new\s+)?[`"']?(\S+)[`"']?\s*(?:role)?/i);
      const name = nameMatch?.[1] || "new-role";
      args.name = name;

      // Extract color
      const colorMatch = content.match(/(?:colou?r)\s*[`"']?(\S+)[`"']?/i);
      if (colorMatch) args.color = colorMatch[1];

      return args;
    }

    case "rename_channel": {
      // Find target channel
      const channelMatch = content.match(/(?:rename|change)\s+(?:the\s+)?(?:name\s+(?:of\s+)?)?(?:channel\s+)?[`"']?#?(\S+)[`"']?\s*(?:to|into)\s*[`"']?(\S+)[`"']?/i);
      if (channelMatch) {
        const channelName = channelMatch[1].replace(/[^a-zA-Z0-9-_]/g, "").toLowerCase();
        const newName = channelMatch[2].replace(/[^a-zA-Z0-9-_]/g, "").toLowerCase();
        const found = serverState.channels.find(c => c.name === channelName || c.name.includes(channelName));
        if (found) {
          args.channelId = found.id;
          args.newName = newName;
          return args;
        }
      }
      return null;
    }

    case "delete_channel":
    case "delete_category": {
      const nameMatch = content.match(/(?:delete|remove|destroy)\s+(?:the\s+)?(?:channel\s+|category\s+)?[`"']?#?(\S+)[`"']?/i);
      if (nameMatch) {
        const name = nameMatch[1].replace(/[^a-zA-Z0-9-_]/g, "").toLowerCase();
        const found = serverState.channels.find(c => c.name === name || c.name.includes(name))
          || serverState.categories.find(c => c.name === name || c.name.includes(name));
        if (found) {
          args.channelId = found.id;
          return args;
        }
      }
      return null;
    }

    case "assign_role": {
      if (mentionedUserIds.length === 0) return null;
      const roleMatch = content.match(/(?:role)\s*[`"']?(\S+)[`"']?/i)
        || content.match(/(?:assign|give)\s+.*(?:role)\s+[`"']?(\S+)[`"']?/i);
      if (roleMatch) {
        const roleName = roleMatch[1].toLowerCase();
        const found = serverState.roles.find(r => r.name.toLowerCase() === roleName || r.name.toLowerCase().includes(roleName));
        if (found) {
          args.userId = mentionedUserIds[0];
          args.roleId = found.id;
          return args;
        }
      }
      return null;
    }

    case "remove_role": {
      if (mentionedUserIds.length === 0) return null;
      const roleMatch = content.match(/(?:role)\s*[`"']?(\S+)[`"']?/i)
        || content.match(/(?:remove|take)\s+.*(?:role)\s+[`"']?(\S+)[`"']?/i);
      if (roleMatch) {
        const roleName = roleMatch[1].toLowerCase();
        const found = serverState.roles.find(r => r.name.toLowerCase() === roleName || r.name.toLowerCase().includes(roleName));
        if (found) {
          args.userId = mentionedUserIds[0];
          args.roleId = found.id;
          return args;
        }
      }
      return null;
    }

    case "configure_role_permissions": {
      const roleMatch = content.match(/(?:role)\s*[`"']?(\S+)[`"']?/i)
        || content.match(/(?:give|grant|configure)\s+.*(?:role)\s+[`"']?(\S+)[`"']?/i);
      if (roleMatch) {
        const roleName = roleMatch[1].toLowerCase();
        const found = serverState.roles.find(r => r.name.toLowerCase() === roleName || r.name.toLowerCase().includes(roleName));
        if (found) {
          args.roleId = found.id;
          // Extract permissions
          const perms: string[] = [];
          if (/manage\s*messages/i.test(content)) perms.push("ManageMessages");
          if (/manage\s*channels/i.test(content)) perms.push("ManageChannels");
          if (/manage\s*roles/i.test(content)) perms.push("ManageRoles");
          if (/kick\s*members/i.test(content)) perms.push("KickMembers");
          if (/ban\s*members/i.test(content)) perms.push("BanMembers");
          if (/moderate\s*members/i.test(content)) perms.push("ModerateMembers");
          if (/view\s*channel/i.test(content)) perms.push("ViewChannel");
          if (/send\s*messages/i.test(content)) perms.push("SendMessages");
          args.permissions = perms;
          return args;
        }
      }
      return null;
    }

    default:
      return null;
  }
}

/* ================================================================
 * CONVERSATIONAL RESPONSE BUILDERS
 * ================================================================ */

function buildInspectionResponse(state: ServerState): string {
  return formatServerState(state);
}

function buildModificationPlanResponse(
  toolName: string,
  args: Record<string, unknown>,
  riskLevel: string,
): string {
  const lines = [
    `**Plan:** ${toolName.replace(/_/g, " ")}`,
    `**Risk:** ${riskLevel.toUpperCase()}`,
    "",
  ];

  for (const [key, value] of Object.entries(args)) {
    if (key.startsWith("_")) continue;
    lines.push(`• ${key}: \`${value}\``);
  }

  lines.push("", "Proceed? (yes/no)");
  return lines.join("\n");
}

function buildSuccessResponse(toolName: string, result: ToolResult): string {
  if (result.message) return result.message;
  return `✅ ${toolName.replace(/_/g, " ")} completed successfully.`;
}

function buildDenialResponse(result: ToolResult): string {
  return result.message || "❌ I couldn't complete that action.";
}

function buildUndoResponse(undoResult: { success: boolean; message: string }): string {
  return undoResult.message;
}

/* ================================================================
 * MAIN CONVERSATIONAL AGENT HANDLER
 *
 * Entry point for all conversational interactions.
 * Called from the message handler when a server management intent is detected.
 * ================================================================ */

export interface AgentResponse {
  shouldReply: boolean;
  reply: string;
  executed: boolean;
  requiresConfirmation: boolean;
  planId?: string;
}

export async function handleConversation(
  client: Client,
  message: Message,
  content: string,
  mentionedUserIds: string[],
): Promise<AgentResponse> {
  const startTime = Date.now();

  try {
    // 1. Resolve guild and user context
    const resolved = await resolveGuild(client, message);
    if (!resolved) {
      return {
        shouldReply: false,
        reply: "",
        executed: false,
        requiresConfirmation: false,
      };
    }

    const { guild, userContext } = resolved;
    const state = getOrCreateState(userContext.userId, guild.id, message.channel.id);

    // 2. Classify intent
    const classification = classifyIntent(content, state, mentionedUserIds);

    logger.debug(
      `Intent classified: ${classification.intent} (confidence: ${classification.confidence}) by ${userContext.username} in ${guild.name}`,
    );

    // 3. Handle each intent type
    switch (classification.intent) {
      case "confirmation": {
        return handleConfirmation(state, userContext, guild, message);
      }

      case "denial": {
        return handleDenial(state, userContext, guild, message);
      }

      case "undo": {
        return handleUndo(userContext, guild, message, client);
      }

      case "server_inspect": {
        return handleServerInspect(guild, userContext, state, message, content);
      }

      case "server_repair": {
        return handleServerRepair(guild, userContext, state, message, content);
      }

      case "server_modify": {
        return handleServerModify(guild, userContext, state, message, content, mentionedUserIds);
      }

      case "moderation": {
        // Moderation is handled through the existing action-router system
        return {
          shouldReply: false,
          reply: "",
          executed: false,
          requiresConfirmation: false,
        };
      }

      case "help": {
        return handleHelp(userContext, guild);
      }

      default: {
        // Normal chat - not handled by this agent
        return {
          shouldReply: false,
          reply: "",
          executed: false,
          requiresConfirmation: false,
        };
      }
    }
  } catch (error) {
    logger.error(
      `Conversational agent error: ${error instanceof Error ? error.message : String(error)}`,
    );

    recordAudit({
      who: message.author.id,
      whoName: message.author.tag,
      what: `Agent error: ${error instanceof Error ? error.message : String(error)}`,
      where: "conversational-agent",
      guildId: message.guild?.id || "",
      result: "error",
    });

    return {
      shouldReply: true,
      reply: "❌ Something went wrong while processing your request. Please try again.",
      executed: false,
      requiresConfirmation: false,
    };
  }
}

/* ================================================================
 * INTENT HANDLERS
 * ================================================================ */

async function handleConfirmation(
  state: ConversationState,
  userContext: ResolvedUserContext,
  guild: Guild,
  message: Message,
): Promise<AgentResponse> {
  if (!state.pendingConfirmation) {
    return {
      shouldReply: true,
      reply: "No pending action to confirm.",
      executed: false,
      requiresConfirmation: false,
    };
  }

  const { planId, toolName, args } = state.pendingConfirmation;
  const plan = getPendingPlan(planId);

  if (!plan) {
    state.pendingConfirmation = undefined;
    return {
      shouldReply: true,
      reply: "⏱️ That action has expired. Please ask me to do it again.",
      executed: false,
      requiresConfirmation: false,
    };
  }

  // Verify the plan
  const verification = verifyPlan(plan, userContext.userId, guild.id);
  if (!verification.valid) {
    state.pendingConfirmation = undefined;
    removePendingPlan(planId);
    return {
      shouldReply: true,
      reply: `❌ Cannot confirm: ${verification.reason || "invalid plan"}`,
      executed: false,
      requiresConfirmation: false,
    };
  }

  // Mark as executed to prevent double-execution
  markPlanExecuted(planId);

  // Execute through the full pipeline
  const result = await executeWithFullPipeline(
    guild,
    userContext,
    toolName,
    args,
    state.channelId,
  );

  state.pendingConfirmation = undefined;
  state.lastAction = {
    toolName,
    args,
    timestamp: Date.now(),
  };

  if (result.status === "success") {
    return {
      shouldReply: true,
      reply: buildSuccessResponse(toolName, result),
      executed: true,
      requiresConfirmation: false,
    };
  }

  return {
    shouldReply: true,
    reply: buildDenialResponse(result),
    executed: false,
    requiresConfirmation: false,
  };
}

async function handleDenial(
  state: ConversationState,
  userContext: ResolvedUserContext,
  guild: Guild,
  message: Message,
): Promise<AgentResponse> {
  if (!state.pendingConfirmation) {
    return {
      shouldReply: true,
      reply: "Nothing to cancel.",
      executed: false,
      requiresConfirmation: false,
    };
  }

  const { planId } = state.pendingConfirmation;
  removePendingPlan(planId);
  state.pendingConfirmation = undefined;

  recordAudit({
    who: userContext.userId,
    whoName: userContext.username,
    what: `Cancelled action: ${state.lastAction?.toolName || "unknown"}`,
    where: "conversational-agent",
    guildId: guild.id,
    result: "denied",
  });

  return {
    shouldReply: true,
    reply: "❌ Action cancelled.",
    executed: false,
    requiresConfirmation: false,
  };
}

async function handleUndo(
  userContext: ResolvedUserContext,
  guild: Guild,
  message: Message,
  discordClient: Client,
): Promise<AgentResponse> {
  const undoEntry = getLastUndoForUser(guild.id, userContext.userId);

  if (!undoEntry) {
    return {
      shouldReply: true,
      reply: "Nothing to undo.",
      executed: false,
      requiresConfirmation: false,
    };
  }

  const result = await executeUndo(undoEntry.id, () => discordClient);

  return {
    shouldReply: true,
    reply: buildUndoResponse(result),
    executed: result.success,
    requiresConfirmation: false,
  };
}

async function handleServerInspect(
  guild: Guild,
  userContext: ResolvedUserContext,
  state: ConversationState,
  message: Message,
  content: string,
): Promise<AgentResponse> {
  // Check authorization for inspection (read-only, low risk)
  const authResult = await checkFullAuthorization(
    guild,
    userContext,
    "inspect_server",
  );

  if (!authResult.authorized) {
    return {
      shouldReply: true,
      reply: authResult.denialMessage || "❌ You don't have permission to inspect this server.",
      executed: false,
      requiresConfirmation: false,
    };
  }

  const serverState = await getCachedServerState(guild, state);

  // Determine what to inspect based on content
  const lower = content.toLowerCase();

  if (/\b(permission|role|who can)\b/i.test(lower)) {
    // Permission inspection
    const result = await executeWithFullPipeline(
      guild,
      userContext,
      "check_permissions",
      {},
      message.channel.id,
    );

    if (result.status === "success" && result.message) {
      return {
        shouldReply: true,
        reply: result.message,
        executed: false,
        requiresConfirmation: false,
      };
    }
  }

  if (/\b(role|who has|members)\b/i.test(lower)) {
    const result = await executeWithFullPipeline(
      guild,
      userContext,
      "inspect_roles",
      {},
      message.channel.id,
    );

    if (result.status === "success" && result.message) {
      return {
        shouldReply: true,
        reply: result.message,
        executed: false,
        requiresConfirmation: false,
      };
    }
  }

  if (/\b(channel|what|structure|setup)\b/i.test(lower)) {
    const result = await executeWithFullPipeline(
      guild,
      userContext,
      "list_channels",
      {},
      message.channel.id,
    );

    if (result.status === "success" && result.message) {
      return {
        shouldReply: true,
        reply: result.message,
        executed: false,
        requiresConfirmation: false,
      };
    }
  }

  if (/\b(health|check|diagnose|wrong|problem|issue)\b/i.test(lower)) {
    const result = await executeWithFullPipeline(
      guild,
      userContext,
      "health_check",
      {},
      message.channel.id,
    );

    if (result.status === "success" && result.message) {
      return {
        shouldReply: true,
        reply: result.message,
        executed: false,
        requiresConfirmation: false,
      };
    }
  }

  // Default: full server inspection
  return {
    shouldReply: true,
    reply: buildInspectionResponse(serverState),
    executed: false,
    requiresConfirmation: false,
  };
}

async function handleServerRepair(
  guild: Guild,
  userContext: ResolvedUserContext,
  state: ConversationState,
  message: Message,
  content: string,
): Promise<AgentResponse> {
  // Server repair requires admin+ role
  if (userContext.ashenRole !== "owner" && userContext.ashenRole !== "admin") {
    return {
      shouldReply: true,
      reply: "❌ Server repair requires administrator permissions.",
      executed: false,
      requiresConfirmation: false,
    };
  }

  const serverState = await getCachedServerState(guild, state);
  const issues: string[] = [];
  const fixes: Array<{ toolName: string; args: Record<string, unknown>; description: string }> = [];

  // Check for common issues
  const aiConfig = loadGuildAIConfig(guild.id);

  // 1. Check if management roles exist but aren't configured
  if (aiConfig.managementRoleIds.length === 0 && serverState.roles.length > 2) {
    const modRole = serverState.roles.find(r => r.name.toLowerCase() === "moderator");
    if (modRole) {
      issues.push("⚠️ Moderator role exists but isn't configured as a management role.");
      fixes.push({
        toolName: "configure_role_permissions",
        args: { roleId: modRole.id, permissions: ["ManageMessages", "ModerateMembers"] },
        description: "Configure Moderator role with message management permissions",
      });
    }
  }

  // 2. Check for channels without categories
  const uncategorized = serverState.channels.filter(c => !c.categoryId && c.type === "text");
  if (uncategorized.length > 0) {
    issues.push(`ℹ️ ${uncategorized.length} channel(s) are not in any category.`);
  }

  // 3. Check for duplicate channels
  const channelNames = serverState.channels.map(c => c.name);
  const duplicates = channelNames.filter((name, i) => channelNames.indexOf(name) !== i);
  if (duplicates.length > 0) {
    issues.push(`⚠️ Found duplicate channel names: ${[...new Set(duplicates)].join(", ")}`);
  }

  // 4. Check for @everyone having excessive permissions
  const everyoneRole = serverState.roles.find(r => r.id === guild.id);
  if (everyoneRole) {
    const everyonePerms = guild.roles.cache.get(guild.id);
    if (everyonePerms) {
      const perms = everyonePerms.permissions;
      if (perms.has(PermissionFlagsBits.Administrator)) {
        issues.push("⚠️ @everyone has Administrator permission — this is a security risk.");
      }
    }
  }

  if (issues.length === 0) {
    return {
      shouldReply: true,
      reply: "✅ Your server looks healthy! No issues detected.",
      executed: false,
      requiresConfirmation: false,
    };
  }

  const lines = [
    "**🔍 Server Health Report:**",
    "",
    ...issues,
    "",
  ];

  if (fixes.length > 0) {
    lines.push(`I can fix ${fixes.length} issue(s) automatically.`);
    lines.push("Proceed? (yes/no)");
  }

  if (fixes.length > 0) {
    // Store the fix plan for confirmation
    const plan = createActionPlan(
      {
        guildId: guild.id,
        channelId: message.channel.id,
        requesterId: userContext.userId,
        requesterName: userContext.username,
        requesterRole: userContext.ashenRole,
        arguments: { _toolName: "server_repair", fixes },
        dryRun: false,
      },
      "medium",
      fixes.map(f => ({
        type: "modify" as const,
        target: f.description,
        description: f.description,
      })),
      true,
    );
    (plan as any).toolName = "server_repair";
    (plan as any).arguments = { fixes };
    storePendingPlan(plan);

    state.pendingConfirmation = {
      planId: plan.id,
      toolName: "server_repair",
      args: { fixes },
      timestamp: Date.now(),
    };

    return {
      shouldReply: true,
      reply: lines.join("\n"),
      executed: false,
      requiresConfirmation: true,
      planId: plan.id,
    };
  }

  return {
    shouldReply: true,
    reply: lines.join("\n"),
    executed: false,
    requiresConfirmation: false,
  };
}

async function handleServerModify(
  guild: Guild,
  userContext: ResolvedUserContext,
  state: ConversationState,
  message: Message,
  content: string,
  mentionedUserIds: string[],
): Promise<AgentResponse> {
  const serverState = await getCachedServerState(guild, state);
  const lower = content.toLowerCase();

  // Detect which tool to use based on the message
  let toolName = "";
  let args: Record<string, unknown> | null = null;

  // Role management
  if (/\b(create|make|add)\b.*\b(role)\b/i.test(lower)) {
    toolName = "create_role";
    args = buildToolArgs(toolName, content, mentionedUserIds, serverState);
  } else if (/\b(delete|remove|destroy)\b.*\b(role)\b/i.test(lower)) {
    toolName = "delete_role";
    args = buildToolArgs(toolName, content, mentionedUserIds, serverState);
  } else if (/\b(assign|give)\b.*\b(role)\b/i.test(lower) || /\brole\b.*\b(to|for)\b.*<@/i.test(content)) {
    toolName = "assign_role";
    args = buildToolArgs(toolName, content, mentionedUserIds, serverState);
  } else if (/\b(remove|take)\b.*\b(role)\b/i.test(lower) || /\bremove\b.*<@.*\bfrom\b.*\brole\b/i.test(lower)) {
    toolName = "remove_role";
    args = buildToolArgs(toolName, content, mentionedUserIds, serverState);
  } else if (/\b(give|grant|configure)\b.*\b(permission|manage)\b/i.test(lower)) {
    toolName = "configure_role_permissions";
    args = buildToolArgs(toolName, content, mentionedUserIds, serverState);
  } else if (/\b(edit|modify|change)\b.*\b(role)\b/i.test(lower)) {
    toolName = "edit_role";
    args = buildToolArgs(toolName, content, mentionedUserIds, serverState);
  }
  // Channel management
  else if (/\b(create|make|add)\b.*\b(channel|text|voice)\b/i.test(lower)
    || /\b(create|make|add)\b.*\b(category|group|section)\b/i.test(lower)) {
    if (/\b(category|group|section)\b/i.test(lower)) {
      toolName = "create_category";
    } else {
      toolName = "create_channel";
    }
    args = buildToolArgs(toolName, content, mentionedUserIds, serverState);
  } else if (/\b(delete|remove|destroy)\b.*\b(channel|category)\b/i.test(lower)) {
    if (/\b(category|group|section)\b/i.test(lower)) {
      toolName = "delete_category";
    } else {
      toolName = "delete_channel";
    }
    args = buildToolArgs(toolName, content, mentionedUserIds, serverState);
  } else if (/\b(rename|change\s+name)\b/i.test(lower)) {
    toolName = "rename_channel";
    args = buildToolArgs(toolName, content, mentionedUserIds, serverState);
  } else if (/\b(protect|lock|safeguard)\b/i.test(lower) && /\b(channel|category)\b/i.test(lower)) {
    if (/\b(category|group)\b/i.test(lower)) {
      toolName = "protect_category";
    } else {
      toolName = "protect_channel";
    }
    args = buildToolArgs(toolName, content, mentionedUserIds, serverState);
  } else if (/\b(unprotect|unlock|remove protection)\b/i.test(lower)) {
    if (/\b(category|group)\b/i.test(lower)) {
      toolName = "unprotect_category";
    } else {
      toolName = "unprotect_channel";
    }
    args = buildToolArgs(toolName, content, mentionedUserIds, serverState);
  }
  // Server template
  else if (/\b(set up|setup|configure|build|template)\b/i.test(lower)) {
    // Check for template names
    if (/\b(minecraft|mc)\b/i.test(lower)) {
      return handleServerTemplate(guild, userContext, state, message, "minecraft");
    }
    if (/\b(gaming|game)\b/i.test(lower)) {
      return handleServerTemplate(guild, userContext, state, message, "gaming");
    }
    if (/\b(community)\b/i.test(lower)) {
      return handleServerTemplate(guild, userContext, state, message, "community");
    }
    if (/\b(support|help\s*desk|ticket)\b/i.test(lower)) {
      return handleServerTemplate(guild, userContext, state, message, "support");
    }
    // Generic setup request
    return handleServerTemplate(guild, userContext, state, message, "community");
  }

  if (!toolName || !args) {
    return {
      shouldReply: true,
      reply: "I'm not sure what you'd like me to do. Could you be more specific?\n\nExamples:\n• \"Create a gaming category\"\n• \"Make a Moderator role\"\n• \"Give Moderator permission to manage messages\"\n• \"Rename #general to #lobby\"\n• \"Protect the announcements channel\"",
      executed: false,
      requiresConfirmation: false,
    };
  }

  // Execute the tool through the full pipeline
  const result = await executeWithFullPipeline(
    guild,
    userContext,
    toolName,
    args,
    message.channel.id,
  );

  if (result.status === "success") {
    // Record undo if applicable
    const undoData = extractUndoData(toolName, args, result);
    if (undoData) {
      recordUndo(
        guild.id,
        userContext.userId,
        toolName,
        result.message || toolName,
        undoData,
      );
    }

    state.lastAction = {
      toolName,
      args,
      timestamp: Date.now(),
    };

    return {
      shouldReply: true,
      reply: buildSuccessResponse(toolName, result),
      executed: true,
      requiresConfirmation: false,
    };
  }

  if (result.status === "confirmation_required") {
    const plan = result.plan;
    if (plan) {
      state.pendingConfirmation = {
        planId: plan.id,
        toolName,
        args,
        timestamp: Date.now(),
      };
    }

    return {
      shouldReply: true,
      reply: result.message,
      executed: false,
      requiresConfirmation: true,
      planId: plan?.id,
    };
  }

  return {
    shouldReply: true,
    reply: buildDenialResponse(result),
    executed: false,
    requiresConfirmation: false,
  };
}

async function handleServerTemplate(
  guild: Guild,
  userContext: ResolvedUserContext,
  state: ConversationState,
  message: Message,
  templateName: string,
): Promise<AgentResponse> {
  // Templates require admin+ role
  if (userContext.ashenRole !== "owner" && userContext.ashenRole !== "admin") {
    return {
      shouldReply: true,
      reply: "❌ Setting up server templates requires administrator permissions.",
      executed: false,
      requiresConfirmation: false,
    };
  }

  const { TEMPLATES } = await import("../discord/server-builder");
  const template = TEMPLATES[templateName];

  if (!template) {
    return {
      shouldReply: true,
      reply: `❌ Unknown template: ${templateName}. Available: ${Object.keys(TEMPLATES).join(", ")}`,
      executed: false,
      requiresConfirmation: false,
    };
  }

  const serverState = await getCachedServerState(guild, state);

  // Check what already exists to avoid duplicates
  const existingCategories = serverState.categories.map(c => c.name.toLowerCase());
  const existingChannels = serverState.channels.map(c => c.name.toLowerCase());
  const existingRoles = serverState.roles.map(r => r.name.toLowerCase());

  const newCategories = template.categories.filter(c => !existingCategories.includes(c.name.toLowerCase()));
  const newRoles = template.roles.filter(r => !existingRoles.includes(r.name.toLowerCase()));

  if (newCategories.length === 0 && newRoles.length === 0) {
    return {
      shouldReply: true,
      reply: `✅ Your server already has the "${template.name}" template structure. No changes needed.`,
      executed: false,
      requiresConfirmation: false,
    };
  }

  const lines = [
    `**📋 Template: ${template.name}**`,
    template.description,
    "",
    "**I'll create:**",
  ];

  if (newRoles.length > 0) {
    lines.push(`• Roles: ${newRoles.map(r => r.name).join(", ")}`);
  }
  if (newCategories.length > 0) {
    for (const cat of newCategories) {
      const newChannels = cat.channels.filter(ch => !existingChannels.includes(ch.name.toLowerCase()));
      if (newChannels.length > 0) {
        lines.push(`• Category: ${cat.name} with ${newChannels.map(ch => `#${ch.name}`).join(", ")}`);
      }
    }
  }

  const skipped = template.categories.length - newCategories.length;
  if (skipped > 0) {
    lines.push("", `*${skipped} category(ies) already exist and will be skipped.*`);
  }

  lines.push("", "This will modify your server. Proceed? (yes/no)");

  // Store the template application plan
  const plan = createActionPlan(
    {
      guildId: guild.id,
      channelId: message.channel.id,
      requesterId: userContext.userId,
      requesterName: userContext.username,
      requesterRole: userContext.ashenRole,
      arguments: { _toolName: "apply_template", templateName },
      dryRun: false,
    },
    "high",
    [
      {
        type: "create",
        target: template.name,
        description: `Apply ${template.name} template`,
      },
    ],
    true,
  );
  (plan as any).toolName = "apply_template";
  (plan as any).arguments = { templateName, template };
  storePendingPlan(plan);

  state.pendingConfirmation = {
    planId: plan.id,
    toolName: "apply_template",
    args: { templateName, template },
    timestamp: Date.now(),
  };

  return {
    shouldReply: true,
    reply: lines.join("\n"),
    executed: false,
    requiresConfirmation: true,
    planId: plan.id,
  };
}

async function handleHelp(
  userContext: ResolvedUserContext,
  guild: Guild,
): Promise<AgentResponse> {
  const lines = [
    "**🤖 AshenAI Server Assistant**",
    "",
    "I can help you manage your Discord server. Just talk to me naturally!",
    "",
    "**What I can do:**",
    "",
    "📋 **Inspect & Diagnose:**",
    "• \"What's my server setup?\"",
    "• \"Check my server permissions\"",
    "• \"What's wrong with my server?\"",
    "",
    "🔧 **Create & Configure:**",
    "• \"Create a gaming category\"",
    "• \"Make a Moderator role\"",
    "• \"Set up my server for Minecraft\"",
    "",
    "👤 **Role Management:**",
    "• \"Give Bob the Moderator role\"",
    "• \"Remove the old Staff role\"",
    "• \"Give Moderator permission to manage messages\"",
    "",
    "🔒 **Protection:**",
    "• \"Protect the announcements channel\"",
    "• \"List protected resources\"",
    "",
    "↩️ **Undo:**",
    "• \"Undo that\" (reverses your last action)",
    "",
    "**Your role:** " + userContext.ashenRole,
  ];

  return {
    shouldReply: true,
    reply: lines.join("\n"),
    executed: false,
    requiresConfirmation: false,
  };
}

/* ================================================================
 * UNDO DATA EXTRACTION
 * ================================================================ */

function extractUndoData(
  toolName: string,
  args: Record<string, unknown>,
  result: ToolResult,
): UndoAction | null {
  const data = result.data as Record<string, unknown> | undefined;

  switch (toolName) {
    case "create_channel":
      if (data?.channelId) {
        return {
          type: "delete_channel",
          targetId: data.channelId as string,
          data: {},
        };
      }
      break;
    case "create_category":
      if (data?.categoryId) {
        return {
          type: "delete_category",
          targetId: data.categoryId as string,
          data: {},
        };
      }
      break;
    case "create_role":
      if (data?.roleId) {
        return {
          type: "delete_role",
          targetId: data.roleId as string,
          data: {},
        };
      }
      break;
    case "assign_role":
      if (args.userId && args.roleId) {
        return {
          type: "remove_role",
          targetId: args.roleId as string,
          data: { userId: args.userId, roleId: args.roleId },
        };
      }
      break;
    case "remove_role":
      if (args.userId && args.roleId) {
        return {
          type: "assign_role",
          targetId: args.roleId as string,
          data: { userId: args.userId, roleId: args.roleId },
        };
      }
      break;
    case "rename_channel":
      if (data?.channelId && data?.oldName) {
        return {
          type: "rename_channel",
          targetId: data.channelId as string,
          data: { oldName: data.oldName },
        };
      }
      break;
  }

  return null;
}

/* ================================================================
 * CLEANUP
 * ================================================================ */

// Clean up expired conversation states every 5 minutes
const cleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [key, state] of conversationStates) {
    if (now - state.lastStateFetchedAt > STATE_TTL_MS) {
      conversationStates.delete(key);
    }
  }
}, 5 * 60 * 1000);
if (cleanupInterval.unref) cleanupInterval.unref();
