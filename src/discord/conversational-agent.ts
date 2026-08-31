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
import type { ExecutorOptions } from "../ai/tools/executor";
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
import {
  resolveChannel,
  resolveCategory,
  resolveRoleByName,
  resolveMember,
  formatAmbiguity,
  type ResolveResult,
  type ResolvedChannel,
  type ResolvedRole,
} from "./resource-resolver";

/* ================================================================
 * STRUCTURED LOGGING HELPERS
 * ================================================================ */

function logIntent(userId: string, guildId: string, intent: string, confidence: number) {
  logger.info(`CONVERSATIONAL INTENT user=${userId} guild=${guildId} intent=${intent} confidence=${confidence}`);
}

function logResolution(userId: string, guildId: string, resourceType: string, input: string, result: string) {
  logger.info(`RESOURCE RESOLUTION user=${userId} guild=${guildId} type=${resourceType} input="${input}" result=${result}`);
}

function logAuth(userId: string, guildId: string, tool: string, authorized: boolean) {
  logger.info(`AUTHORIZATION user=${userId} guild=${guildId} tool=${tool} authorized=${authorized}`);
}

function logRisk(userId: string, guildId: string, tool: string, riskLevel: string) {
  logger.info(`RISK user=${userId} guild=${guildId} tool=${tool} risk=${riskLevel}`);
}

function logExecution(userId: string, guildId: string, tool: string, status: string, durationMs: number) {
  logger.info(`EXECUTION user=${userId} guild=${guildId} tool=${tool} status=${status} duration=${durationMs}ms`);
}

function logVerification(userId: string, guildId: string, tool: string, verified: boolean) {
  logger.info(`VERIFICATION user=${userId} guild=${guildId} tool=${tool} verified=${verified}`);
}

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
 *
 * FIX #5: Confirmation/denial detection runs FIRST, before any other
 * intent classification. This ensures "yes"/"do it"/"make it" always
 * resolves to the pending plan, not to a new action.
 *
 * FIX #4: Template detection expanded to catch more natural phrasing.
 * ================================================================ */

export function classifyIntent(
  content: string,
  state: ConversationState,
  mentionedUserIds: string[],
): ClassifiedIntent {
  const lower = content.toLowerCase().trim();

  // ── FIX #5: Confirmation/denial runs FIRST ─────────────────────
  // This is critical: if there's a pending confirmation, "yes"/"do it"/"make it"
  // must resolve to that plan, not be re-classified as a new action.
  if (state.pendingConfirmation) {
    // Extended confirmation patterns to catch more natural phrasing
    if (/^(yes|y|confirm|proceed|go|do it|ok|okay|sure|yeah|yep|make it|go ahead|let'?s go|execute|run it|apply it|do that|go for it|sounds good|i agree|approved|confirmed|yep|yup)$/i.test(lower)) {
      return { intent: "confirmation", confidence: 0.95 };
    }
    if (/^(no|n|cancel|abort|stop|nah|nope|nevermind|never|don'?t|skip|reject|decline)$/i.test(lower)) {
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

  // ── FIX #4: Expanded template detection ─────────────────────────
  // Catches: "generate me a template", "make my server a gaming server",
  // "set up a minecraft server", "organize my server", etc.
  if (/\b(set up|setup|configure|build|organize|template)\b/i.test(lower)) {
    return { intent: "server_modify", confidence: 0.85 };
  }
  if (/\b(generate|prepare|create)\b.*\b(template|layout|structure)\b/i.test(lower)) {
    return { intent: "server_modify", confidence: 0.85 };
  }
  if (/\b(make|turn)\b.*\b(my|the|this)\b.*\b(server|guild)\b.*\b(a|into|like|a)\b.*\b(gaming|community|minecraft|support|discord)\b/i.test(lower)) {
    return { intent: "server_modify", confidence: 0.85 };
  }

  // Server modification requests (general)
  if (/\b(create|make|add|set up|configure|build|organize|rename|move|delete|remove|edit|change|modify|protect|unprotect)\b/i.test(lower)) {
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
 * FIX #1, #2, #3: Uses the resource resolver instead of fragile regex.
 * FIX #2: Validates channel type matches user intent (voice vs text).
 * FIX #9: Returns candidates on ambiguity so agent can ask for
 * clarification.
 * ================================================================ */

export function buildToolArgs(
  toolName: string,
  content: string,
  mentionedUserIds: string[],
  serverState: ServerState,
  guild: Guild,
): Record<string, unknown> | null {
  const lower = content.toLowerCase();
  const args: Record<string, unknown> = {};

  switch (toolName) {
    case "inspect_server":
    case "list_channels":
    case "check_permissions":
    case "inspect_roles":
    case "health_check":
    case "inspect_ai_config":
    case "list_protected_resources": {
      return {};
    }

    case "create_channel": {
      // Extract channel name from message
      const nameMatch = content.match(/(?:channel|text|voice)\s+(?:called|named|channel)?\s*[`"']?(\S+)[`"']?/i)
        || content.match(/(?:create|make|add)\s+(?:a\s+)?(?:new\s+)?(?:text\s+|voice\s+)?[`"']?(\S+)[`"']?\s*(?:channel)?/i);
      const rawName = nameMatch?.[1]?.replace(/[^a-zA-Z0-9-_]/g, "").toLowerCase() || "new-channel";

      // Check for category using the resource resolver
      let categoryId: string | undefined;
      const catMatch = content.match(/(?:in|under|inside|within)\s+(?:the\s+)?[`"']?(\S+)[`"']?/i);
      if (catMatch) {
        const catResult = resolveCategory(guild, catMatch[1]);
        if (catResult.exact) {
          categoryId = catResult.exact.id;
        } else if (catResult.ambiguous) {
          // Store ambiguity info for the agent to report
          args._ambiguity = { type: "category", candidates: catResult.candidates };
        }
      }

      // Determine channel type with validation
      const wantsVoice = /\b(voice|vc|audio)\b/i.test(content);
      const wantsCategory = /\b(category|group|section)\b/i.test(content);
      const channelType = wantsCategory ? "category" : wantsVoice ? "voice" : "text";

      args.name = rawName;
      if (categoryId) args.categoryId = categoryId;
      args.type = channelType;
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
      // Use resource resolver for channel identification
      const channelMatch = content.match(/(?:rename|change)\s+(?:the\s+)?(?:name\s+(?:of\s+)?)?(?:channel\s+)?[`"']?#?(\S+)[`"']?\s*(?:to|into)\s*[`"']?(\S+)[`"']?/i);
      if (channelMatch) {
        const channelResult = resolveChannel(guild, channelMatch[1], "text");
        if (channelResult.exact) {
          args.channelId = channelResult.exact.id;
          args.newName = channelMatch[2].replace(/[^a-zA-Z0-9-_]/g, "").toLowerCase();
          return args;
        }
        if (channelResult.ambiguous) {
          args._ambiguity = { type: "channel", candidates: channelResult.candidates };
          return args;
        }
      }
      return null;
    }

    case "delete_channel":
    case "delete_category": {
      const wantsCategory = /\b(category|group|section)\b/i.test(lower);
      const nameMatch = content.match(/(?:delete|remove|destroy)\s+(?:the\s+)?(?:channel\s+|category\s+)?[`"']?#?(\S+)[`"']?/i);
      if (nameMatch) {
        const channelType = wantsCategory ? "category" : "text";
        const result = resolveChannel(guild, nameMatch[1], channelType as any);
        if (result.exact) {
          args.channelId = result.exact.id;
          return args;
        }
        if (result.ambiguous) {
          args._ambiguity = { type: "channel", candidates: result.candidates };
          return args;
        }
      }
      return null;
    }

    case "assign_role": {
      if (mentionedUserIds.length === 0) {
        // Try to resolve member from message
        const memberMatch = content.match(/(?:assign|give)\s+(\S+)\s+(?:the\s+)?(?:role|permission)/i)
          || content.match(/(\S+)\s+(?:to|for)\s+(?:the\s+)?(?:role|permission)/i);
        if (memberMatch) {
          const memberResult = resolveMember(guild, memberMatch[1]);
          if (memberResult.exact) {
            args.userId = memberResult.exact.id;
          } else if (memberResult.ambiguous) {
            args._ambiguity = { type: "member", candidates: memberResult.candidates };
            return args;
          } else {
            return null;
          }
        } else {
          return null;
        }
      } else {
        args.userId = mentionedUserIds[0];
      }

      const roleMatch = content.match(/(?:role)\s*[`"']?(\S+)[`"']?/i)
        || content.match(/(?:assign|give)\s+.*(?:role)\s+[`"']?(\S+)[`"']?/i);
      if (roleMatch) {
        const roleResult = resolveRoleByName(guild, roleMatch[1]);
        if (roleResult.exact) {
          args.roleId = roleResult.exact.id;
          return args;
        }
        if (roleResult.ambiguous) {
          args._ambiguity = { type: "role", candidates: roleResult.candidates };
          return args;
        }
      }
      return null;
    }

    case "remove_role": {
      if (mentionedUserIds.length === 0) {
        const memberMatch = content.match(/(?:remove|take)\s+(\S+)\s+(?:from|'s)?\s*(?:the\s+)?(?:role|permission)/i);
        if (memberMatch) {
          const memberResult = resolveMember(guild, memberMatch[1]);
          if (memberResult.exact) {
            args.userId = memberResult.exact.id;
          } else if (memberResult.ambiguous) {
            args._ambiguity = { type: "member", candidates: memberResult.candidates };
            return args;
          } else {
            return null;
          }
        } else {
          return null;
        }
      } else {
        args.userId = mentionedUserIds[0];
      }

      const roleMatch = content.match(/(?:role)\s*[`"']?(\S+)[`"']?/i)
        || content.match(/(?:remove|take)\s+.*(?:role)\s+[`"']?(\S+)[`"']?/i);
      if (roleMatch) {
        const roleResult = resolveRoleByName(guild, roleMatch[1]);
        if (roleResult.exact) {
          args.roleId = roleResult.exact.id;
          return args;
        }
        if (roleResult.ambiguous) {
          args._ambiguity = { type: "role", candidates: roleResult.candidates };
          return args;
        }
      }
      return null;
    }

    case "configure_role_permissions": {
      const roleMatch = content.match(/(?:role)\s*[`"']?(\S+)[`"']?/i)
        || content.match(/(?:give|grant|configure)\s+.*(?:role)\s+[`"']?(\S+)[`"']?/i);
      if (roleMatch) {
        const roleResult = resolveRoleByName(guild, roleMatch[1]);
        if (roleResult.exact) {
          args.roleId = roleResult.exact.id;
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
        if (roleResult.ambiguous) {
          args._ambiguity = { type: "role", candidates: roleResult.candidates };
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
 * POST-ACTION VERIFICATION
 *
 * FIX #7: Verifies Discord state after mutations instead of just
 * trusting the tool return value.
 * ================================================================ */

async function verifyPostAction(
  guild: Guild,
  toolName: string,
  args: Record<string, unknown>,
  result: ToolResult,
): Promise<{ verified: boolean; details: string }> {
  if (result.status !== "success") {
    return { verified: false, details: "Action was not successful" };
  }

  try {
    switch (toolName) {
      case "create_channel": {
        const data = result.data as Record<string, unknown> | undefined;
        const channelId = data?.channelId as string;
        if (!channelId) return { verified: false, details: "No channelId in result" };
        const channel = await guild.channels.fetch(channelId).catch(() => null);
        if (!channel) return { verified: false, details: "Channel not found after creation" };
        return { verified: true, details: `Channel #${channel.name} exists` };
      }

      case "delete_channel":
      case "delete_category": {
        const channelId = args.channelId as string;
        if (!channelId) return { verified: true, details: "No channelId to verify" };
        const channel = await guild.channels.fetch(channelId).catch(() => null);
        if (channel) return { verified: false, details: "Channel still exists after deletion" };
        return { verified: true, details: "Channel confirmed deleted" };
      }

      case "create_role": {
        const data = result.data as Record<string, unknown> | undefined;
        const roleId = data?.roleId as string;
        if (!roleId) return { verified: false, details: "No roleId in result" };
        const role = await guild.roles.fetch(roleId).catch(() => null);
        if (!role) return { verified: false, details: "Role not found after creation" };
        return { verified: true, details: `Role ${role.name} exists` };
      }

      case "delete_role": {
        const roleId = args.roleId as string;
        if (!roleId) return { verified: true, details: "No roleId to verify" };
        const role = await guild.roles.fetch(roleId).catch(() => null);
        if (role) return { verified: false, details: "Role still exists after deletion" };
        return { verified: true, details: "Role confirmed deleted" };
      }

      case "assign_role": {
        const userId = args.userId as string;
        const roleId = args.roleId as string;
        if (!userId || !roleId) return { verified: true, details: "No user/role to verify" };
        const member = await guild.members.fetch(userId).catch(() => null);
        if (!member) return { verified: false, details: "Member not found" };
        const hasRole = member.roles.cache.has(roleId);
        if (!hasRole) return { verified: false, details: "Role not assigned to member" };
        return { verified: true, details: "Role confirmed assigned" };
      }

      case "remove_role": {
        const userId = args.userId as string;
        const roleId = args.roleId as string;
        if (!userId || !roleId) return { verified: true, details: "No user/role to verify" };
        const member = await guild.members.fetch(userId).catch(() => null);
        if (!member) return { verified: true, details: "Member not found (may have left)" };
        const hasRole = member.roles.cache.has(roleId);
        if (hasRole) return { verified: false, details: "Role still assigned to member" };
        return { verified: true, details: "Role confirmed removed" };
      }

      case "rename_channel": {
        const channelId = args.channelId as string;
        const newName = args.newName as string;
        if (!channelId || !newName) return { verified: true, details: "No channel/newName to verify" };
        const channel = await guild.channels.fetch(channelId).catch(() => null);
        if (!channel) return { verified: false, details: "Channel not found after rename" };
        if (channel.name !== newName) return { verified: false, details: `Channel name is "${channel.name}", expected "${newName}"` };
        return { verified: true, details: `Channel renamed to #${channel.name}` };
      }

      default:
        return { verified: true, details: "No specific verification needed" };
    }
  } catch (error) {
    return { verified: false, details: `Verification error: ${error instanceof Error ? error.message : String(error)}` };
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

    logIntent(userContext.userId, guild.id, classification.intent, classification.confidence);

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

  logAuth(userContext.userId, guild.id, toolName, true);
  logRisk(userContext.userId, guild.id, toolName, plan.riskLevel);

  // Mark as executed to prevent double-execution
  markPlanExecuted(planId);

  // ── Template execution: decompose into registered tool steps ─────
  // If the plan contains templateSteps, execute each step as a separate
  // registered tool operation through the multi-step pipeline with
  // skipConfirmation (user already confirmed the whole template).
  const templateSteps = (args.templateSteps ?? plan.arguments.templateSteps) as Array<{
    toolName: string;
    args: Record<string, unknown>;
    description: string;
  }> | undefined;

  if (templateSteps && templateSteps.length > 0) {
    return executeTemplateSteps(
      guild,
      userContext,
      state,
      planId,
      templateSteps,
      message.channel.id,
    );
  }

  // ── Safety: "apply_template" without steps is invalid ──────────
  // "apply_template" is not a registered tool — it is a virtual name
  // for decomposed template plans. If we reach here with no steps,
  // the plan is corrupt and must not be dispatched to the tool pipeline.
  if (toolName === "apply_template") {
    state.pendingConfirmation = undefined;
    removePendingPlan(planId);
    recordAudit({
      who: userContext.userId,
      whoName: userContext.username,
      what: "Template plan missing decomposed steps",
      where: "conversational-agent",
      guildId: guild.id,
      result: "error",
    });
    return {
      shouldReply: true,
      reply: "❌ Template plan is missing its decomposed steps. Please generate the template again.",
      executed: false,
      requiresConfirmation: false,
    };
  }

  // ── Single-tool execution (existing path) ───────────────────────
  const execStartTime = Date.now();

  const result = await executeWithFullPipeline(
    guild,
    userContext,
    toolName,
    args,
    state.channelId,
  );

  const execDuration = Date.now() - execStartTime;
  logExecution(userContext.userId, guild.id, toolName, result.status, execDuration);

  // ── FIX #7: Post-action verification ──────────────────────────
  const verification_result = await verifyPostAction(guild, toolName, args, result);
  logVerification(userContext.userId, guild.id, toolName, verification_result.verified);

  state.pendingConfirmation = undefined;
  state.lastAction = {
    toolName,
    args,
    timestamp: Date.now(),
  };

  // ── FIX #10: Personality ordering — verify THEN respond ────────
  if (result.status === "success") {
    if (!verification_result.verified) {
      return {
        shouldReply: true,
        reply: `⚠️ Action completed but verification failed: ${verification_result.details}. Please check manually.`,
        executed: false,
        requiresConfirmation: false,
      };
    }
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

/* ================================================================
 * TEMPLATE STEP EXECUTION
 *
 * Executes decomposed template steps through the multi-step pipeline
 * with skipConfirmation (user already confirmed the whole template).
 * Each step is a registered tool operation. Verification runs per step.
 * If one step fails, reports which step failed.
 * ================================================================ */

async function executeTemplateSteps(
  guild: Guild,
  userContext: ResolvedUserContext,
  state: ConversationState,
  planId: string,
  steps: Array<{
    toolName: string;
    args: Record<string, unknown>;
    description: string;
  }>,
  channelId: string,
): Promise<AgentResponse> {
  const startTime = Date.now();
  const executedSteps: string[] = [];
  const failedSteps: Array<{ step: string; error: string }> = [];

  // Execute each step through the full pipeline with skipConfirmation
  // All individual tools' confirmations are bypassed since user confirmed the whole template.
  const executorOptions: ExecutorOptions = { skipConfirmation: true };

  for (const step of steps) {
    logExecution(userContext.userId, guild.id, step.toolName, "starting", 0);

    const result = await executeWithFullPipeline(
      guild,
      userContext,
      step.toolName,
      step.args,
      channelId,
      undefined,
      undefined,
      executorOptions,
    );

    const stepVerified = await verifyPostAction(guild, step.toolName, step.args, result);
    logVerification(userContext.userId, guild.id, step.toolName, stepVerified.verified);

    if (result.status === "success") {
      if (!stepVerified.verified) {
        failedSteps.push({ step: step.description, error: `Verification failed: ${stepVerified.details}` });
      } else {
        executedSteps.push(step.description);
      }
    } else {
      failedSteps.push({ step: step.description, error: result.message });
      // Stop on first failure to prevent partial execution
      break;
    }
  }

  const duration = Date.now() - startTime;
  logExecution(userContext.userId, guild.id, "apply_template", failedSteps.length === 0 ? "success" : "partial", duration);

  state.pendingConfirmation = undefined;
  state.lastAction = {
    toolName: "apply_template",
    args: { steps },
    planId,
    timestamp: Date.now(),
  };

  // Build the response
  if (failedSteps.length === 0) {
    return {
      shouldReply: true,
      reply: `✅ **Template applied successfully!**\n\n**Completed ${executedSteps.length} operations:**\n${executedSteps.map(s => `• ${s}`).join("\n")}`,
      executed: true,
      requiresConfirmation: false,
    };
  }

  // Partial failure: report what succeeded and what failed
  const lines = ["⚠️ **Template partially applied.**", ""];

  if (executedSteps.length > 0) {
    lines.push("**Succeeded:**");
    for (const s of executedSteps) lines.push(`• ✅ ${s}`);
    lines.push("");
  }

  lines.push("**Failed:**");
  for (const f of failedSteps) lines.push(`• ❌ ${f.step}: ${f.error}`);

  return {
    shouldReply: true,
    reply: lines.join("\n"),
    executed: executedSteps.length > 0,
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

  logAuth(userContext.userId, guild.id, "inspect_server", authResult.authorized);

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
    args = buildToolArgs(toolName, content, mentionedUserIds, serverState, guild);
  } else if (/\b(delete|remove|destroy)\b.*\b(role)\b/i.test(lower)) {
    toolName = "delete_role";
    args = buildToolArgs(toolName, content, mentionedUserIds, serverState, guild);
  } else if (/\b(assign|give)\b.*\b(role)\b/i.test(lower) || /\brole\b.*\b(to|for)\b.*<@/i.test(content)) {
    toolName = "assign_role";
    args = buildToolArgs(toolName, content, mentionedUserIds, serverState, guild);
  } else if (/\b(remove|take)\b.*\b(role)\b/i.test(lower) || /\bremove\b.*<@.*\bfrom\b.*\brole\b/i.test(lower)) {
    toolName = "remove_role";
    args = buildToolArgs(toolName, content, mentionedUserIds, serverState, guild);
  } else if (/\b(give|grant|configure)\b.*\b(permission|manage)\b/i.test(lower)) {
    toolName = "configure_role_permissions";
    args = buildToolArgs(toolName, content, mentionedUserIds, serverState, guild);
  } else if (/\b(edit|modify|change)\b.*\b(role)\b/i.test(lower)) {
    toolName = "edit_role";
    args = buildToolArgs(toolName, content, mentionedUserIds, serverState, guild);
  }
  // Channel management
  else if (/\b(create|make|add)\b.*\b(channel|text|voice)\b/i.test(lower)
    || /\b(create|make|add)\b.*\b(category|group|section)\b/i.test(lower)) {
    if (/\b(category|group|section)\b/i.test(lower)) {
      toolName = "create_category";
    } else {
      toolName = "create_channel";
    }
    args = buildToolArgs(toolName, content, mentionedUserIds, serverState, guild);
  } else if (/\b(delete|remove|destroy)\b.*\b(channel|category)\b/i.test(lower)) {
    if (/\b(category|group|section)\b/i.test(lower)) {
      toolName = "delete_category";
    } else {
      toolName = "delete_channel";
    }
    args = buildToolArgs(toolName, content, mentionedUserIds, serverState, guild);
  } else if (/\b(rename|change\s+name)\b/i.test(lower)) {
    toolName = "rename_channel";
    args = buildToolArgs(toolName, content, mentionedUserIds, serverState, guild);
  } else if (/\b(protect|lock|safeguard)\b/i.test(lower) && /\b(channel|category)\b/i.test(lower)) {
    if (/\b(category|group)\b/i.test(lower)) {
      toolName = "protect_category";
    } else {
      toolName = "protect_channel";
    }
    args = buildToolArgs(toolName, content, mentionedUserIds, serverState, guild);
  } else if (/\b(unprotect|unlock|remove protection)\b/i.test(lower)) {
    if (/\b(category|group)\b/i.test(lower)) {
      toolName = "unprotect_category";
    } else {
      toolName = "unprotect_channel";
    }
    args = buildToolArgs(toolName, content, mentionedUserIds, serverState, guild);
  }
  // ── FIX #4: Expanded template detection ───────────────────────
  // Catches: "generate me a template", "make my server a gaming server",
  // "set up a minecraft server", "organize my server as community", etc.
  else if (/\b(set up|setup|configure|build|organize|template)\b/i.test(lower)
    || /\b(generate|prepare)\b.*\b(template|layout|structure)\b/i.test(lower)
    || /\b(make|turn)\b.*\b(my|the|this)\b.*\b(server|guild)\b.*\b(a|into|like)\b.*\b(gaming|community|minecraft|support)\b/i.test(lower)) {
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
      reply: "I'm not sure what you'd like me to do. Could you be more specific?\n\nExamples:\n• \"Create a gaming category\"\n• \"Make a Moderator role\"\n• \"Give Moderator permission to manage messages\"\n• \"Rename #general to #lobby\"\n• \"Protect the announcements channel\"\n• \"Set up my server for Minecraft\"",
      executed: false,
      requiresConfirmation: false,
    };
  }

  // Check for ambiguity from resource resolution
  const ambiguity = args._ambiguity as { type: string; candidates: Array<{ id: string; name: string }> } | undefined;
  if (ambiguity) {
    return {
      shouldReply: true,
      reply: formatAmbiguity(ambiguity.type as any, ambiguity.candidates),
      executed: false,
      requiresConfirmation: false,
    };
  }

  // Execute the tool through the full pipeline
  const execStartTime = Date.now();
  const result = await executeWithFullPipeline(
    guild,
    userContext,
    toolName,
    args,
    message.channel.id,
  );
  const execDuration = Date.now() - execStartTime;

  logExecution(userContext.userId, guild.id, toolName, result.status, execDuration);

  if (result.status === "success") {
    // ── FIX #7: Post-action verification ─────────────────────────
    const postVerification = await verifyPostAction(guild, toolName, args, result);
    logVerification(userContext.userId, guild.id, toolName, postVerification.verified);

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

    // ── FIX #10: Personality ordering — verify THEN respond ──────
    if (!postVerification.verified) {
      return {
        shouldReply: true,
        reply: `⚠️ Action completed but verification failed: ${postVerification.details}. Please check manually.`,
        executed: false,
        requiresConfirmation: false,
      };
    }

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

  // ── Decompose template into registered tool steps ────────────────
  // Each step uses an already-registered Discord tool from the tool registry.
  const templateSteps: Array<{
    toolName: string;
    args: Record<string, unknown>;
    description: string;
  }> = [];

  // 1. Roles first (no dependencies)
  for (const roleData of template.roles) {
    if (!existingRoles.includes(roleData.name.toLowerCase())) {
      templateSteps.push({
        toolName: "create_role",
        args: { name: roleData.name, color: roleData.color, hoist: roleData.hoist ?? false },
        description: `Create role "${roleData.name}"`,
      });
    }
  }

  // 2. Categories
  for (const catData of template.categories) {
    if (!existingCategories.includes(catData.name.toLowerCase())) {
      templateSteps.push({
        toolName: "create_category",
        args: { name: catData.name },
        description: `Create category "${catData.name}"`,
      });

      // 3. Channels within this category
      for (const chData of catData.channels) {
        if (!existingChannels.includes(chData.name.toLowerCase())) {
          templateSteps.push({
            toolName: "create_channel",
            args: { name: chData.name, type: chData.type },
            description: `Create ${chData.type} channel "#${chData.name}" in "${catData.name}"`,
          });
        }
      }
    }
  }

  if (templateSteps.length === 0) {
    return {
      shouldReply: true,
      reply: `✅ Your server already has the "${template.name}" template structure. No changes needed.`,
      executed: false,
      requiresConfirmation: false,
    };
  }

  // Build the preview message
  const lines = [
    `**📋 Template: ${template.name}**`,
    template.description,
    "",
    `**${templateSteps.length} operations will be performed:**`,
    "",
  ];

  for (const step of templateSteps) {
    lines.push(`• ${step.description}`);
  }

  const skipped = template.categories.length - template.categories.filter(
    c => !existingCategories.includes(c.name.toLowerCase()),
  ).length;
  if (skipped > 0) {
    lines.push("", `*${skipped} category(ies) already exist and will be skipped.*`);
  }

  lines.push("", "This will modify your server. Proceed? (yes/no)");

  // ── Store the plan with decomposed steps ─────────────────────────
  // The plan stores the pre-computed steps using ONLY registered tool names.
  // On confirmation, these steps execute through executeMultiStep + skipConfirmation.
  const plan = createActionPlan(
    {
      guildId: guild.id,
      channelId: message.channel.id,
      requesterId: userContext.userId,
      requesterName: userContext.username,
      requesterRole: userContext.ashenRole,
      arguments: { _toolName: "apply_template", templateName, templateSteps },
      dryRun: false,
    },
    "high",
    templateSteps.map(s => ({
      type: "create" as const,
      target: s.description,
      description: s.description,
    })),
    true,
  );
  (plan as any).toolName = "apply_template";
  (plan as any).arguments = { templateName, templateSteps, template };
  storePendingPlan(plan);

  state.pendingConfirmation = {
    planId: plan.id,
    toolName: "apply_template",
    args: { templateName, templateSteps, template },
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
    "• \"Generate me a template\"",
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
