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
  | "server_template"
  | "server_transform"
  | "server_better"
  | "moderation"
  | "undo"
  | "confirmation"
  | "denial"
  | "preview"
  | "help";

export interface ClassifiedIntent {
  intent: ConversationIntent;
  confidence: number;
  extractedTool?: string;
  extractedArgs?: Record<string, unknown>;
  targetUserId?: string;
  targetChannelName?: string;
  targetRoleName?: string;
  templateType?: string;
  wantsFix?: boolean;
  wantsPreview?: boolean;
}

/* ================================================================
 * UNIFIED ACTION PLAN
 *
 * Holds the complete set of operations for a user goal:
 * template setup + health fixes + ambiguities.
 * A single confirmation executes the entire plan.
 * ================================================================ */

export interface UnifiedPlanStep {
  toolName: string;
  args: Record<string, unknown>;
  description: string;
  category: "create" | "fix" | "configure" | "preserve" | "skip";
  status: "pending" | "success" | "failed" | "skipped" | "verified" | "unverified";
  verified?: boolean;
  error?: string;
  skipReason?: string;
  /** Internal: tracks category name for channel→category dependency resolution */
  _catName?: string;
}

export interface DuplicateInfo {
  name: string;
  type: "channel" | "category" | "role";
  ids: string[];
}

export interface ResourceClassification {
  existsAndMatches: string[];
  existsButDifferent: string[];
  missing: string[];
  duplicates: DuplicateInfo[];
  protected: string[];
}

export interface UnifiedActionPlan {
  id: string;
  goal: string;
  templateName?: string;
  steps: UnifiedPlanStep[];
  duplicates: DuplicateInfo[];
  riskLevel: "safe" | "low" | "medium" | "high";
  createdAt: number;
  expiresAt: number;
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
  unifiedPlan?: UnifiedActionPlan;
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
 * Uses semantic keyword matching + context.
 *
 * Confirmation/denial detection runs FIRST.
 * Preview requests are detected before mutations.
 * ================================================================ */

export function classifyIntent(
  content: string,
  state: ConversationState,
  mentionedUserIds: string[],
): ClassifiedIntent {
  const lower = content.toLowerCase().trim();

  // ── Confirmation/denial runs FIRST ──────────────────────────────
  if (state.pendingConfirmation || state.unifiedPlan) {
    if (/^(yes|y|confirm|proceed|go|do it|ok|okay|sure|yeah|yep|make it|go ahead|let'?s go|execute|run it|apply it|do that|go for it|sounds good|i agree|approved|confirmed|yep|yup|affirmative|absolutely|definitely|apply|exec)$/i.test(lower)) {
      return { intent: "confirmation", confidence: 0.95 };
    }
    if (/^(no|n|cancel|abort|stop|nah|nope|nevermind|never|don'?t|skip|reject|decline|no thanks|not now|later|nvm)$/i.test(lower)) {
      return { intent: "denial", confidence: 0.95 };
    }
  }

  // ── Preview / dry-run requests ───────────────────────────────────
  if (/\b(preview|dry.?run|what.?ll|what.?will|show.?me|show.?details|what.?changes|what.?would|what.?do)\b/i.test(lower)) {
    return { intent: "preview", confidence: 0.85 };
  }

  // ── Undo request ─────────────────────────────────────────────────
  if (/\b(undo|reverse|revert|take back|cancel that)\b/i.test(lower)) {
    return { intent: "undo", confidence: 0.9 };
  }

  // ── Combined template + fix requests ─────────────────────────────
  // "generate a template and fix my server" → unified goal
  const wantsTemplate = /\b(generate|create|make|build|prepare|template|layout|structure|set.?up|configure|organize)\b/i.test(lower);
  const wantsFix = /\b(fix|repair|clean|health|diagnose|improve|better|organize|sort|arrange)\b/i.test(lower);
  const mentionsServer = /\b(server|guild|community|channel|structure)\b/i.test(lower);

  if (wantsTemplate && wantsFix && mentionsServer) {
    return buildTemplateIntent(lower, true, 0.9);
  }

  // ── Open-ended "make my server better" ───────────────────────────
  if (/\b(make|turn|set|put)\b.*\b(my|the|this)\b.*\b(server|guild)\b.*\b(better|good|great|nice|clean|organized|professional)\b/i.test(lower)) {
    return { intent: "server_better", confidence: 0.85, wantsFix: true };
  }
  if (/\b(make|turn|set|put)\b.*\b(server|guild|everything)\b.*\b(better|good|great|nice|clean|organized)\b/i.test(lower)) {
    return { intent: "server_better", confidence: 0.85, wantsFix: true };
  }
  if (/\b(organize|clean up|tidy|sort)\b.*\b(server|guild|everything|channels|structure)\b/i.test(lower)) {
    return { intent: "server_better", confidence: 0.85, wantsFix: true };
  }

  // ── Server inspection requests ───────────────────────────────────
  if (/\b(what('?s| is| are)|show|check|inspect|diagnose|status|overview|summary)\b.*\b(server|guild|channel|role|permission|config|setup|health)\b/i.test(lower)) {
    return { intent: "server_inspect", confidence: 0.85 };
  }
  if (/\b(what('?s| is) wrong|what can|problem|issue|error|broken)\b/i.test(lower)) {
    return { intent: "server_repair", confidence: 0.8 };
  }
  if (/\b(server|guild)\b.*\b(wrong|broken|issue|problem|fix|repair)\b/i.test(lower)) {
    return { intent: "server_repair", confidence: 0.8 };
  }
  // Standalone "fix my server" / "repair my server"
  if (/\b(fix|repair|clean up|diagnose)\b.*\b(my|the|this)?\s*\b(server|guild)\b/i.test(lower)) {
    return { intent: "server_repair", confidence: 0.85 };
  }

  // ── Moderation requests ──────────────────────────────────────────
  if (/\b(warn|warning|timeout|mute|kick|ban|purge|remove messages)\b/i.test(lower)) {
    return { intent: "moderation", confidence: 0.85 };
  }

  // ── Server transformation: "make my server a gaming server" ──────
  if (/\b(make|turn|set|convert)\b.*\b(my|the|this)\b.*\b(server|guild)\b.*\b(a|into|like)\b.*\b(gaming|community|minecraft|support|creator|study)\b/i.test(lower)) {
    return buildTemplateIntent(lower, false, 0.88);
  }

  // ── Template generation (standalone) ─────────────────────────────
  if (/\b(generate|create|make|build|prepare)\b.*\b(template|layout|structure)\b/i.test(lower)) {
    return buildTemplateIntent(lower, false, 0.85);
  }
  if (/\b(set up|setup|configure|build|organize)\b.*\b(server|guild)\b/i.test(lower)) {
    return buildTemplateIntent(lower, false, 0.85);
  }
  if (/\b(set up|setup|configure|build|organize)\b.*\b(template|layout)\b/i.test(lower)) {
    return buildTemplateIntent(lower, false, 0.85);
  }

  // ── General server modification requests ─────────────────────────
  if (/\b(create|make|add|set up|configure|build|organize|rename|move|delete|remove|edit|change|modify|protect|unprotect)\b/i.test(lower)) {
    return { intent: "server_modify", confidence: 0.8 };
  }
  if (/\b(give|assign|remove|configure)\b.*\b(role|permission)\b/i.test(lower)) {
    return { intent: "server_modify", confidence: 0.8 };
  }

  // ── Help request ─────────────────────────────────────────────────
  if (/\b(help|what can you|how do|what do you)\b/i.test(lower)) {
    return { intent: "help", confidence: 0.7 };
  }

  return { intent: "normal_chat", confidence: 0.5 };
}

function buildTemplateIntent(
  lower: string,
  wantsFix: boolean,
  confidence: number,
): ClassifiedIntent {
  let templateType = "community";

  if (/\b(minecraft|mc)\b/i.test(lower)) templateType = "minecraft";
  else if (/\b(gaming|game)\b/i.test(lower)) templateType = "gaming";
  else if (/\b(support|help\s*desk|ticket)\b/i.test(lower)) templateType = "support";
  else if (/\b(community)\b/i.test(lower)) templateType = "community";
  else if (/\b(creator|content)\b/i.test(lower)) templateType = "community";
  else if (/\b(study|studygroup|learning)\b/i.test(lower)) templateType = "community";

  return {
    intent: "server_template",
    confidence,
    templateType,
    wantsFix,
  };
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
 * CLASSIFY RESOURCES
 *
 * Compares desired template resources against actual server state.
 * Returns what exists, what's missing, what's duplicated.
 * ================================================================ */

function classifyResources(
  serverState: ServerState,
  template: { categories: Array<{ name: string; channels: Array<{ name: string; type: string }> }>; roles: Array<{ name: string }> },
): ResourceClassification {
  const existingCategories = serverState.categories.map(c => c.name.toLowerCase());
  const existingChannels = serverState.channels.map(c => c.name.toLowerCase());
  const existingRoles = serverState.roles.map(r => r.name.toLowerCase());

  const existsAndMatches: string[] = [];
  const existsButDifferent: string[] = [];
  const missing: string[] = [];
  const duplicates: DuplicateInfo[] = [];
  const protectedList: string[] = [];

  // Check for duplicates in current server
  const channelCounts = new Map<string, string[]>();
  for (const ch of serverState.channels) {
    const key = ch.name.toLowerCase();
    if (!channelCounts.has(key)) channelCounts.set(key, []);
    channelCounts.get(key)!.push(ch.id);
  }
  for (const [name, ids] of channelCounts) {
    if (ids.length > 1) {
      duplicates.push({ name, type: "channel", ids });
    }
  }

  const roleCounts = new Map<string, string[]>();
  for (const role of serverState.roles) {
    const key = role.name.toLowerCase();
    if (!roleCounts.has(key)) roleCounts.set(key, []);
    roleCounts.get(key)!.push(role.id);
  }
  for (const [name, ids] of roleCounts) {
    if (ids.length > 1) {
      duplicates.push({ name, type: "role", ids });
    }
  }

  // Check template roles
  for (const roleData of template.roles) {
    if (existingRoles.includes(roleData.name.toLowerCase())) {
      existsAndMatches.push(`Role "${roleData.name}"`);
    } else {
      missing.push(`Role "${roleData.name}"`);
    }
  }

  // Check template categories and channels
  for (const catData of template.categories) {
    if (existingCategories.includes(catData.name.toLowerCase())) {
      existsAndMatches.push(`Category "${catData.name}"`);

      for (const chData of catData.channels) {
        if (existingChannels.includes(chData.name.toLowerCase())) {
          existsAndMatches.push(`Channel #${chData.name}`);
        } else {
          missing.push(`Channel #${chData.name} in "${catData.name}"`);
        }
      }
    } else {
      missing.push(`Category "${catData.name}"`);
      for (const chData of catData.channels) {
        if (existingChannels.includes(chData.name.toLowerCase())) {
          existsButDifferent.push(`Channel #${chData.name} (exists but not in "${catData.name}")`);
        } else {
          missing.push(`Channel #${chData.name} in "${catData.name}"`);
        }
      }
    }
  }

  return { existsAndMatches, existsButDifferent, missing, duplicates, protected: protectedList };
}

/* ================================================================
 * BUILD TOOL ARGUMENTS FROM NATURAL LANGUAGE
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
      const nameMatch = content.match(/(?:channel|text|voice)\s+(?:called|named|channel)?\s*[`"']?(\S+)[`"']?/i)
        || content.match(/(?:create|make|add)\s+(?:a\s+)?(?:new\s+)?(?:text\s+|voice\s+)?[`"']?(\S+)[`"']?\s*(?:channel)?/i);
      const rawName = nameMatch?.[1]?.replace(/[^a-zA-Z0-9-_]/g, "").toLowerCase() || "new-channel";

      let categoryId: string | undefined;
      const catMatch = content.match(/(?:in|under|inside|within)\s+(?:the\s+)?[`"']?(\S+)[`"']?/i);
      if (catMatch) {
        const catResult = resolveCategory(guild, catMatch[1]);
        if (catResult.exact) {
          categoryId = catResult.exact.id;
        } else if (catResult.ambiguous) {
          args._ambiguity = { type: "category", candidates: catResult.candidates };
        }
      }

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

      const colorMatch = content.match(/(?:colou?r)\s*[`"']?(\S+)[`"']?/i);
      if (colorMatch) args.color = colorMatch[1];

      return args;
    }

    case "rename_channel": {
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
 * TEMPLATE PREVIEW
 *
 * Renders a polished preview of a template without mutations.
 * ================================================================ */

function buildTemplatePreview(
  templateName: string,
  template: { name: string; description: string; categories: Array<{ name: string; channels: Array<{ name: string; type: string }> }>; roles: Array<{ name: string; color?: string }> },
): string {
  const lines = [
    `✨ **${template.name} Template**`,
    template.description,
    "",
  ];

  for (const cat of template.categories) {
    lines.push(`**${cat.name}**`);
    for (const ch of cat.channels) {
      const icon = ch.type === "voice" ? "🔊" : "#";
      lines.push(`${icon} ${ch.name}`);
    }
    lines.push("");
  }

  lines.push("**Roles:**");
  for (const role of template.roles) {
    lines.push(`👤 ${role.name}`);
  }

  lines.push("", "This is a preview only — nothing has been changed yet.");
  return lines.join("\n");
}

/* ================================================================
 * UNIFIED PLAN SUMMARY
 *
 * Formats the action plan as a clean, grouped summary.
 * ================================================================ */

function formatUnifiedPlanSummary(plan: UnifiedActionPlan): string {
  const creates = plan.steps.filter(s => s.category === "create" && s.status === "pending");
  const fixes = plan.steps.filter(s => s.category === "fix" && s.status === "pending");
  const configures = plan.steps.filter(s => s.category === "configure" && s.status === "pending");
  const preserves = plan.steps.filter(s => s.category === "preserve");
  const skips = plan.steps.filter(s => s.category === "skip");

  const lines = [
    `✨ **${plan.goal}**`,
    "",
  ];

  // Group creates by type
  const roleCreates = creates.filter(s => s.toolName === "create_role");
  const catCreates = creates.filter(s => s.toolName === "create_category");
  const chCreates = creates.filter(s => s.toolName === "create_channel");

  if (creates.length > 0) {
    lines.push("**Create:**");
    if (roleCreates.length > 0) lines.push(`• ${roleCreates.length} role${roleCreates.length > 1 ? "s" : ""}`);
    if (catCreates.length > 0) lines.push(`• ${catCreates.length} categor${catCreates.length > 1 ? "ies" : "y"}`);
    if (chCreates.length > 0) lines.push(`• ${chCreates.length} channel${chCreates.length > 1 ? "s" : ""}`);
    lines.push("");
  }

  if (fixes.length > 0) {
    lines.push("**Fix:**");
    for (const f of fixes) lines.push(`• ${f.description}`);
    lines.push("");
  }

  if (configures.length > 0) {
    lines.push("**Configure:**");
    for (const c of configures) lines.push(`• ${c.description}`);
    lines.push("");
  }

  if (preserves.length > 0) {
    lines.push("**Preserve:**");
    lines.push(`• ${preserves.length} existing resource${preserves.length > 1 ? "s" : ""} that already match`);
    lines.push("");
  }

  if (skips.length > 0) {
    lines.push("**Skip:**");
    for (const s of skips) {
      lines.push(`• ${s.description}${s.skipReason ? ` — ${s.skipReason}` : ""}`);
    }
    lines.push("");
  }

  if (plan.duplicates.length > 0) {
    lines.push("**Review:**");
    for (const dup of plan.duplicates) {
      lines.push(`• ${dup.ids.length} duplicate ${dup.type} "${dup.name}" — I won't touch these unless you ask`);
    }
    lines.push("");
  }

  lines.push("🔒 Protected resources will be preserved.");
  lines.push("Nothing will be deleted.");
  lines.push("", "**Proceed?**");

  return lines.join("\n");
}

/* ================================================================
 * FORMAT EXECUTION REPORT
 * ================================================================ */

function formatExecutionReport(
  steps: UnifiedPlanStep[],
  isPartial: boolean,
): string {
  const succeeded = steps.filter(s => s.status === "success" || s.status === "verified");
  const failed = steps.filter(s => s.status === "failed");
  const unverified = steps.filter(s => s.status === "success" && s.verified === false);

  if (isPartial || failed.length > 0) {
    const lines = ["⚠️ **Partially completed.**", ""];

    if (succeeded.length > 0) {
      lines.push("**Completed:**");
      for (const s of succeeded) lines.push(`• ✅ ${s.description}`);
      lines.push("");
    }

    if (failed.length > 0) {
      lines.push("**Failed:**");
      for (const f of failed) lines.push(`• ❌ ${f.description}: ${f.error || "Unknown error"}`);
      lines.push("");
    }

    if (unverified.length > 0) {
      lines.push("**Verification failed:**");
      for (const u of unverified) lines.push(`• ⚠️ ${u.description}`);
    }

    return lines.join("\n");
  }

  // Count by category
  const creates = steps.filter(s => s.category === "create" && (s.status === "verified" || s.status === "success"));
  const fixes = steps.filter(s => (s.category === "fix" || s.category === "configure") && (s.status === "verified" || s.status === "success"));
  const roleCreates = creates.filter(s => s.toolName === "create_role");
  const catCreates = creates.filter(s => s.toolName === "create_category");
  const chCreates = creates.filter(s => s.toolName === "create_channel");

  const lines = ["✅ **Done.**", ""];

  if (creates.length > 0) {
    lines.push("**Created:**");
    if (roleCreates.length > 0) lines.push(`• ${roleCreates.length} role${roleCreates.length > 1 ? "s" : ""}`);
    if (catCreates.length > 0) lines.push(`• ${catCreates.length} categor${catCreates.length > 1 ? "ies" : "y"}`);
    if (chCreates.length > 0) lines.push(`• ${chCreates.length} channel${chCreates.length > 1 ? "s" : ""}`);
  }

  if (fixes.length > 0) {
    lines.push("", "**Fixed:**");
    for (const f of fixes) lines.push(`• ${f.description}`);
  }

  lines.push("", "🔍 All created resources verified. Existing resources preserved.");

  return lines.join("\n");
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

      case "preview": {
        return handlePreview(state, userContext, guild, message);
      }

      case "server_inspect": {
        return handleServerInspect(guild, userContext, state, message, content);
      }

      case "server_repair": {
        return handleServerRepair(guild, userContext, state, message, content);
      }

      case "server_better": {
        return handleServerBetter(guild, userContext, state, message, content);
      }

      case "server_template": {
        return handleServerTemplateUnified(
          guild,
          userContext,
          state,
          message,
          content,
          classification.templateType || "community",
          classification.wantsFix || false,
        );
      }

      case "server_modify": {
        return handleServerModify(guild, userContext, state, message, content, mentionedUserIds);
      }

      case "moderation": {
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
  // Handle unified plan confirmation
  if (state.unifiedPlan) {
    return executeUnifiedPlan(state, userContext, guild, message);
  }

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

  markPlanExecuted(planId);

  // Template execution: decompose into registered tool steps
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

  // Safety: "apply_template" without steps is invalid
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

  // Single-tool execution (existing path)
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

  const verification_result = await verifyPostAction(guild, toolName, args, result);
  logVerification(userContext.userId, guild.id, toolName, verification_result.verified);

  state.pendingConfirmation = undefined;
  state.lastAction = {
    toolName,
    args,
    timestamp: Date.now(),
  };

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

  if (failedSteps.length === 0) {
    return {
      shouldReply: true,
      reply: `✅ **Template applied successfully!**\n\n**Completed ${executedSteps.length} operations:**\n${executedSteps.map(s => `• ${s}`).join("\n")}`,
      executed: true,
      requiresConfirmation: false,
    };
  }

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
  // Cancel unified plan
  if (state.unifiedPlan) {
    const planGoal = state.unifiedPlan.goal;
    state.unifiedPlan = undefined;
    state.pendingConfirmation = undefined;

    recordAudit({
      who: userContext.userId,
      whoName: userContext.username,
      what: `Cancelled unified plan: ${planGoal}`,
      where: "conversational-agent",
      guildId: guild.id,
      result: "denied",
    });

    return {
      shouldReply: true,
      reply: "❌ Plan cancelled. Nothing was changed.",
      executed: false,
      requiresConfirmation: false,
    };
  }

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

/* ================================================================
 * PREVIEW HANDLER
 *
 * Shows the current pending plan without executing.
 * ================================================================ */

async function handlePreview(
  state: ConversationState,
  userContext: ResolvedUserContext,
  guild: Guild,
  message: Message,
): Promise<AgentResponse> {
  if (state.unifiedPlan) {
    return {
      shouldReply: true,
      reply: formatUnifiedPlanSummary(state.unifiedPlan),
      executed: false,
      requiresConfirmation: true,
      planId: state.unifiedPlan.id,
    };
  }

  if (state.pendingConfirmation) {
    const plan = getPendingPlan(state.pendingConfirmation.planId);
    if (plan) {
      const lines = [
        `**Pending plan:** ${plan.toolName.replace(/_/g, " ")}`,
        `**Risk:** ${plan.riskLevel}`,
        "",
        ...plan.changes.map(c => `• ${c.description}`),
        "",
        "Proceed? (yes/no)",
      ];
      return {
        shouldReply: true,
        reply: lines.join("\n"),
        executed: false,
        requiresConfirmation: true,
        planId: plan.id,
      };
    }
  }

  return {
    shouldReply: true,
    reply: "No pending plan to preview. Ask me to set up or fix your server first.",
    executed: false,
    requiresConfirmation: false,
  };
}

/* ================================================================
 * SERVER INSPECTION
 * ================================================================ */

async function handleServerInspect(
  guild: Guild,
  userContext: ResolvedUserContext,
  state: ConversationState,
  message: Message,
  content: string,
): Promise<AgentResponse> {
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
  const lower = content.toLowerCase();

  if (/\b(permission|role|who can)\b/i.test(lower)) {
    const result = await executeWithFullPipeline(guild, userContext, "check_permissions", {}, message.channel.id);
    if (result.status === "success" && result.message) {
      return { shouldReply: true, reply: result.message, executed: false, requiresConfirmation: false };
    }
  }

  if (/\b(role|who has|members)\b/i.test(lower)) {
    const result = await executeWithFullPipeline(guild, userContext, "inspect_roles", {}, message.channel.id);
    if (result.status === "success" && result.message) {
      return { shouldReply: true, reply: result.message, executed: false, requiresConfirmation: false };
    }
  }

  if (/\b(channel|what|structure|setup)\b/i.test(lower)) {
    const result = await executeWithFullPipeline(guild, userContext, "list_channels", {}, message.channel.id);
    if (result.status === "success" && result.message) {
      return { shouldReply: true, reply: result.message, executed: false, requiresConfirmation: false };
    }
  }

  if (/\b(health|check|diagnose|wrong|problem|issue)\b/i.test(lower)) {
    const result = await executeWithFullPipeline(guild, userContext, "health_check", {}, message.channel.id);
    if (result.status === "success" && result.message) {
      return { shouldReply: true, reply: result.message, executed: false, requiresConfirmation: false };
    }
  }

  return {
    shouldReply: true,
    reply: buildInspectionResponse(serverState),
    executed: false,
    requiresConfirmation: false,
  };
}

/* ================================================================
 * SERVER REPAIR
 *
 * Inspects server for issues and presents a unified fix plan.
 * ================================================================ */

async function handleServerRepair(
  guild: Guild,
  userContext: ResolvedUserContext,
  state: ConversationState,
  message: Message,
  content: string,
): Promise<AgentResponse> {
  if (userContext.ashenRole !== "owner" && userContext.ashenRole !== "admin") {
    return {
      shouldReply: true,
      reply: "❌ Server repair requires administrator permissions.",
      executed: false,
      requiresConfirmation: false,
    };
  }

  const serverState = await getCachedServerState(guild, state);
  const fixes: UnifiedPlanStep[] = [];
  const issues: string[] = [];

  // Check for common issues
  const aiConfig = loadGuildAIConfig(guild.id);

  // 1. Check if management roles exist but aren't configured
  if (aiConfig.managementRoleIds.length === 0 && serverState.roles.length > 2) {
    const modRole = serverState.roles.find(r => r.name.toLowerCase() === "moderator");
    if (modRole) {
      issues.push("⚠️ Moderator role exists but isn't configured as a management role");
      fixes.push({
        toolName: "configure_role_permissions",
        args: { roleId: modRole.id, permissions: ["ManageMessages", "ModerateMembers"] },
        description: "Configure Moderator role with management permissions",
        category: "fix",
        status: "pending",
      });
    }
  }

  // 2. Check for duplicate channels
  const channelCounts = new Map<string, Array<{ id: string; name: string }>>();
  for (const ch of serverState.channels) {
    const key = ch.name.toLowerCase();
    if (!channelCounts.has(key)) channelCounts.set(key, []);
    channelCounts.get(key)!.push({ id: ch.id, name: ch.name });
  }

  const duplicates: DuplicateInfo[] = [];
  for (const [name, channels] of channelCounts) {
    if (channels.length > 1) {
      duplicates.push({ name, type: "channel", ids: channels.map(c => c.id) });
      issues.push(`⚠️ Found ${channels.length} channels named "${name}"`);
    }
  }

  // 3. Check for @everyone having excessive permissions
  const everyonePerms = guild.roles.cache.get(guild.id);
  if (everyonePerms?.permissions.has(PermissionFlagsBits.Administrator)) {
    issues.push("⚠️ @everyone has Administrator permission — this is a security risk");
  }

  if (fixes.length === 0 && issues.length === 0) {
    return {
      shouldReply: true,
      reply: "✅ Your server looks healthy! No issues detected.",
      executed: false,
      requiresConfirmation: false,
    };
  }

  // Build unified plan
  const plan: UnifiedActionPlan = {
    id: `repair-${Date.now()}`,
    goal: "Server Health Check",
    steps: fixes,
    duplicates,
    riskLevel: fixes.length > 0 ? "medium" : "safe",
    createdAt: Date.now(),
    expiresAt: Date.now() + 5 * 60 * 1000,
  };

  if (fixes.length > 0) {
    state.unifiedPlan = plan;
    state.pendingConfirmation = {
      planId: plan.id,
      toolName: "server_repair",
      args: { fixes, plan },
      timestamp: Date.now(),
    };
  }

  // Format the response
  const lines = ["🔍 **Server Health Report**", ""];

  if (issues.length > 0) {
    for (const issue of issues) lines.push(`• ${issue}`);
    lines.push("");
  }

  if (duplicates.length > 0) {
    lines.push("**Duplicate resources found:**");
    for (const dup of duplicates) {
      lines.push(`• ${dup.ids.length} ${dup.type} named "${dup.name}" — I won't delete these automatically`);
    }
    lines.push("");
  }

  if (fixes.length > 0) {
    lines.push(`I can fix ${fixes.length} issue(s) automatically.`);
    lines.push("", "Proceed? (yes/no)");
  }

  return {
    shouldReply: true,
    reply: lines.join("\n"),
    executed: false,
    requiresConfirmation: fixes.length > 0,
    planId: plan.id,
  };
}

/* ================================================================
 * SERVER BETTER (open-ended improvement)
 *
 * "make my server better" → inspect + recommend
 * ================================================================ */

async function handleServerBetter(
  guild: Guild,
  userContext: ResolvedUserContext,
  state: ConversationState,
  message: Message,
  content: string,
): Promise<AgentResponse> {
  if (userContext.ashenRole !== "owner" && userContext.ashenRole !== "admin") {
    return {
      shouldReply: true,
      reply: "❌ Server improvement requires administrator permissions.",
      executed: false,
      requiresConfirmation: false,
    };
  }

  const serverState = await getCachedServerState(guild, state);
  const recommendations: string[] = [];
  const fixes: UnifiedPlanStep[] = [];

  // Analyze server structure
  if (serverState.categories.length === 0 && serverState.channels.length < 5) {
    recommendations.push("• Your server has very little structure — I can set up a template for you");
  }

  if (serverState.categories.length > 0 && serverState.channels.length > 0) {
    const uncategorized = serverState.channels.filter(c => !c.categoryId);
    if (uncategorized.length > 2) {
      recommendations.push(`• ${uncategorized.length} channels are not organized into categories`);
    }
  }

  // Check for duplicate channels
  const channelCounts = new Map<string, number>();
  for (const ch of serverState.channels) {
    const key = ch.name.toLowerCase();
    channelCounts.set(key, (channelCounts.get(key) || 0) + 1);
  }
  const dupCount = [...channelCounts.values()].filter(c => c > 1).length;
  if (dupCount > 0) {
    recommendations.push(`• Found ${dupCount} duplicate channel name(s) that could be cleaned up`);
  }

  // Check for missing basic structure
  const hasRules = serverState.channels.some(c => c.name.toLowerCase() === "rules");
  const hasAnnouncements = serverState.channels.some(c => c.name.toLowerCase() === "announcements");
  if (!hasRules || !hasAnnouncements) {
    recommendations.push("• Missing basic server channels (rules, announcements)");
  }

  // Check for unconfigured moderator role
  const aiConfig = loadGuildAIConfig(guild.id);
  if (aiConfig.managementRoleIds.length === 0) {
    const modRole = serverState.roles.find(r => r.name.toLowerCase() === "moderator");
    if (modRole) {
      recommendations.push("• Moderator role exists but isn't configured for AI management");
      fixes.push({
        toolName: "configure_role_permissions",
        args: { roleId: modRole.id, permissions: ["ManageMessages", "ModerateMembers"] },
        description: "Configure Moderator role",
        category: "fix",
        status: "pending",
      });
    }
  }

  if (recommendations.length === 0 && fixes.length === 0) {
    return {
      shouldReply: true,
      reply: "✅ Your server is already well-organized! I checked the channels, categories, roles, and permissions — everything looks good. Let me know if there's anything specific you'd like to change.",
      executed: false,
      requiresConfirmation: false,
    };
  }

  const lines = [
    "🔍 **I checked your server and found:**",
    "",
    ...recommendations,
    "",
  ];

  if (fixes.length > 0) {
    lines.push(`I can fix ${fixes.length} issue(s) automatically.`);
    lines.push("Want me to apply these fixes? (yes/no)");
  } else {
    lines.push("Would you like me to set up a template to organize things better?");
  }

  if (fixes.length > 0) {
    const plan: UnifiedActionPlan = {
      id: `better-${Date.now()}`,
      goal: "Server Improvement",
      steps: fixes,
      duplicates: [],
      riskLevel: "medium",
      createdAt: Date.now(),
      expiresAt: Date.now() + 5 * 60 * 1000,
    };

    state.unifiedPlan = plan;
    state.pendingConfirmation = {
      planId: plan.id,
      toolName: "server_better",
      args: { fixes, plan },
      timestamp: Date.now(),
    };
  }

  return {
    shouldReply: true,
    reply: lines.join("\n"),
    executed: false,
    requiresConfirmation: fixes.length > 0,
  };
}

/* ================================================================
 * SERVER TEMPLATE (UNIFIED)
 *
 * Handles template generation, preview, and combined template+fix.
 * This is the core new handler that unifies template + repair.
 * ================================================================ */

async function handleServerTemplateUnified(
  guild: Guild,
  userContext: ResolvedUserContext,
  state: ConversationState,
  message: Message,
  content: string,
  templateName: string,
  wantsFix: boolean,
): Promise<AgentResponse> {
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

  // Classify resources against the template
  const classification = classifyResources(serverState, template);

  // Check if everything already exists (idempotency)
  if (classification.missing.length === 0) {
    return {
      shouldReply: true,
      reply: `✅ Your server already matches the "${template.name}" template structure. No changes needed.`,
      executed: false,
      requiresConfirmation: false,
    };
  }

  // ── Preview-only path: user wants to see the template, not apply ──
  if (!wantsFix) {
    const preview = buildTemplatePreview(templateName, template);

    const comparisonLines: string[] = [];
    if (classification.existsAndMatches.length > 0) {
      comparisonLines.push(`✓ **Already have:** ${classification.existsAndMatches.length} resource${classification.existsAndMatches.length > 1 ? "s" : ""} matching this template`);
    }
    if (classification.missing.length > 0) {
      comparisonLines.push(`+ **Missing:** ${classification.missing.length} resource${classification.missing.length > 1 ? "s" : ""} to create`);
    }
    if (classification.duplicates.length > 0) {
      for (const dup of classification.duplicates) {
        comparisonLines.push(`? **Duplicate:** ${dup.ids.length} ${dup.type} named "${dup.name}"`);
      }
    }

    const reply = [
      preview,
      "",
      ...comparisonLines,
      "",
      `**${classification.missing.length} missing resource${classification.missing.length > 1 ? "s" : ""}** to create.`,
      "",
      "Want me to apply this template to your server? (yes/no)",
    ].join("\n");

    // Build a lightweight plan so "yes" applies the template
    const steps: UnifiedPlanStep[] = [];
    const existingRoles = serverState.roles.map(r => r.name.toLowerCase());
    const existingCategories = serverState.categories.map(c => c.name.toLowerCase());
    const existingChannels = serverState.channels.map(c => c.name.toLowerCase());

    for (const roleData of template.roles) {
      if (!existingRoles.includes(roleData.name.toLowerCase())) {
        steps.push({
          toolName: "create_role",
          args: { name: roleData.name, color: roleData.color, hoist: roleData.hoist ?? false },
          description: `Create role "${roleData.name}"`,
          category: "create",
          status: "pending",
        });
      }
    }

    const categoryIdMap = new Map<string, string>();
    for (const cat of serverState.categories) {
      categoryIdMap.set(cat.name.toLowerCase(), cat.id);
    }

    for (const catData of template.categories) {
      const catLower = catData.name.toLowerCase();
      const catId = categoryIdMap.get(catLower);

      if (!catId) {
        steps.push({
          toolName: "create_category",
          args: { name: catData.name },
          description: `Create category "${catData.name}"`,
          category: "create",
          status: "pending",
          _catName: catData.name,
        });
      }

      for (const chData of catData.channels) {
        if (!existingChannels.includes(chData.name.toLowerCase())) {
          const chArgs: Record<string, unknown> = { name: chData.name, type: chData.type };
          if (catId) chArgs.categoryId = catId;
          steps.push({
            toolName: "create_channel",
            args: chArgs,
            description: `Create ${chData.type} channel "#${chData.name}" in "${catData.name}"`,
            category: "create",
            status: "pending",
          });
        }
      }
    }

    for (const res of classification.existsAndMatches) {
      steps.push({ toolName: "preserve", args: {}, description: res, category: "preserve", status: "verified" });
    }
    for (const dup of classification.duplicates) {
      steps.push({
        toolName: "skip", args: {},
        description: `${dup.ids.length} duplicate ${dup.type} "${dup.name}"`,
        category: "skip", status: "skipped",
        skipReason: "Ambiguous — needs your choice to clean up",
      });
    }

    const plan: UnifiedActionPlan = {
      id: `template-preview-${Date.now()}`,
      goal: template.name,
      templateName,
      steps,
      duplicates: classification.duplicates,
      riskLevel: steps.filter(s => s.category === "create").length > 5 ? "low" : "safe",
      createdAt: Date.now(),
      expiresAt: Date.now() + 5 * 60 * 1000,
    };

    state.unifiedPlan = plan;
    state.pendingConfirmation = {
      planId: plan.id,
      toolName: "apply_template",
      args: { templateName, templateSteps: steps.filter(s => s.category === "create"), template },
      timestamp: Date.now(),
    };

    const actionPlan = createActionPlan(
      {
        guildId: guild.id, channelId: message.channel.id,
        requesterId: userContext.userId, requesterName: userContext.username,
        requesterRole: userContext.ashenRole,
        arguments: { _toolName: "apply_template", templateName, templateSteps: steps.filter(s => s.category === "create"), template },
        dryRun: false,
      },
      plan.riskLevel,
      steps.filter(s => s.category === "create").map(s => ({
        type: "create" as const, target: s.description, description: s.description,
      })),
      true,
    );
    (actionPlan as any).toolName = "apply_template";
    (actionPlan as any).arguments = { templateName, templateSteps: steps.filter(s => s.category === "create"), template };
    storePendingPlan(actionPlan);

    return {
      shouldReply: true,
      reply,
      executed: false,
      requiresConfirmation: true,
      planId: plan.id,
    };
  }

  // ── Combined path: template + fix → unified plan ──────────────────
  const steps: UnifiedPlanStep[] = [];

  const existingRoles = serverState.roles.map(r => r.name.toLowerCase());
  const existingCategories = serverState.categories.map(c => c.name.toLowerCase());
  const existingChannels = serverState.channels.map(c => c.name.toLowerCase());

  // 1. Roles (no dependencies)
  for (const roleData of template.roles) {
    if (!existingRoles.includes(roleData.name.toLowerCase())) {
      steps.push({
        toolName: "create_role",
        args: { name: roleData.name, color: roleData.color, hoist: roleData.hoist ?? false },
        description: `Create role "${roleData.name}"`,
        category: "create",
        status: "pending",
      });
    }
  }

  // 2. Categories + channels with categoryId resolution
  const categoryIdMap = new Map<string, string>();
  for (const cat of serverState.categories) {
    categoryIdMap.set(cat.name.toLowerCase(), cat.id);
  }

  for (const catData of template.categories) {
    const catLower = catData.name.toLowerCase();
    const existingCatId = categoryIdMap.get(catLower);

    if (!existingCatId) {
      steps.push({
        toolName: "create_category",
        args: { name: catData.name },
        description: `Create category "${catData.name}"`,
        category: "create",
        status: "pending",
        _catName: catData.name,
      } as UnifiedPlanStep);
    }

    for (const chData of catData.channels) {
      if (!existingChannels.includes(chData.name.toLowerCase())) {
        const chArgs: Record<string, unknown> = { name: chData.name, type: chData.type };
        if (existingCatId) chArgs.categoryId = existingCatId;
        steps.push({
          toolName: "create_channel",
          args: chArgs,
          description: `Create ${chData.type} channel "#${chData.name}" in "${catData.name}"`,
          category: "create",
          status: "pending",
        });
      }
    }
  }

  // 3. Health fixes if requested
  if (wantsFix) {
    const aiConfig = loadGuildAIConfig(guild.id);

    if (aiConfig.managementRoleIds.length === 0) {
      const modRole = serverState.roles.find(r => r.name.toLowerCase() === "moderator");
      if (modRole) {
        steps.push({
          toolName: "configure_role_permissions",
          args: { roleId: modRole.id, permissions: ["ManageMessages", "ModerateMembers"] },
          description: "Configure Moderator role with management permissions",
          category: "fix",
          status: "pending",
        });
      }
    }
  }

  // 4. Preserves + skips
  for (const res of classification.existsAndMatches) {
    steps.push({ toolName: "preserve", args: {}, description: res, category: "preserve", status: "verified" });
  }
  for (const dup of classification.duplicates) {
    steps.push({
      toolName: "skip", args: {},
      description: `${dup.ids.length} duplicate ${dup.type} "${dup.name}"`,
      category: "skip", status: "skipped",
      skipReason: "Ambiguous — needs your choice to clean up",
    });
  }

  // Determine risk level
  let riskLevel: "safe" | "low" | "medium" | "high" = "safe";
  if (steps.some(s => s.category === "fix")) riskLevel = "medium";
  if (steps.filter(s => s.category === "create").length > 5) riskLevel = "low";

  // Build the unified plan
  const plan: UnifiedActionPlan = {
    id: `template-${Date.now()}`,
    goal: `${template.name} Setup + Fix`,
    templateName,
    steps,
    duplicates: classification.duplicates,
    riskLevel,
    createdAt: Date.now(),
    expiresAt: Date.now() + 5 * 60 * 1000,
  };

  // Store the plan
  state.unifiedPlan = plan;
  state.pendingConfirmation = {
    planId: plan.id,
    toolName: "apply_template",
    args: { templateName, templateSteps: steps.filter(s => s.category === "create" || s.category === "fix"), template },
    timestamp: Date.now(),
  };

  // Store in the confirmation store for persistence
  const actionPlan = createActionPlan(
    {
      guildId: guild.id,
      channelId: message.channel.id,
      requesterId: userContext.userId,
      requesterName: userContext.username,
      requesterRole: userContext.ashenRole,
      arguments: { _toolName: "apply_template", templateName, templateSteps: steps.filter(s => s.category === "create" || s.category === "fix"), template },
      dryRun: false,
    },
    riskLevel,
    steps.filter(s => s.category !== "preserve" && s.category !== "skip").map(s => ({
      type: s.category === "fix" ? "modify" as const : "create" as const,
      target: s.description,
      description: s.description,
    })),
    true,
  );
  (actionPlan as any).toolName = "apply_template";
  (actionPlan as any).arguments = { templateName, templateSteps: steps.filter(s => s.category === "create" || s.category === "fix"), template };
  storePendingPlan(actionPlan);

  return {
    shouldReply: true,
    reply: formatUnifiedPlanSummary(plan),
    executed: false,
    requiresConfirmation: true,
    planId: plan.id,
  };
}

/* ================================================================
 * EXECUTE UNIFIED PLAN
 *
 * Executes all steps in the unified plan after confirmation.
 * ================================================================ */

async function executeUnifiedPlan(
  state: ConversationState,
  userContext: ResolvedUserContext,
  guild: Guild,
  message: Message,
): Promise<AgentResponse> {
  if (!state.unifiedPlan) {
    return {
      shouldReply: true,
      reply: "No plan to execute.",
      executed: false,
      requiresConfirmation: false,
    };
  }

  const plan = state.unifiedPlan;
  const startTime = Date.now();
  const executorOptions: ExecutorOptions = { skipConfirmation: true };

  // Filter to actionable steps (create + fix + configure)
  const actionableSteps = plan.steps.filter(
    s => s.category === "create" || s.category === "fix" || s.category === "configure",
  );

  // Track newly created category IDs so channels can reference them
  const newCategoryIds = new Map<string, string>();

  for (const step of actionableSteps) {
    if (step.status !== "pending") continue;

    // Resolve categoryId for channels: if the step targets a channel
    // and has no categoryId, check if the parent category was just created
    if (step.toolName === "create_channel" && !step.args.categoryId) {
      const catName = step._catName;
      if (catName) {
        const resolvedId = newCategoryIds.get(catName.toLowerCase());
        if (resolvedId) {
          step.args.categoryId = resolvedId;
        }
      }
    }

    logExecution(userContext.userId, guild.id, step.toolName, "starting", 0);

    const result = await executeWithFullPipeline(
      guild,
      userContext,
      step.toolName,
      step.args,
      state.channelId,
      undefined,
      undefined,
      executorOptions,
    );

    const stepVerified = await verifyPostAction(guild, step.toolName, step.args, result);
    logVerification(userContext.userId, guild.id, step.toolName, stepVerified.verified);

    if (result.status === "success") {
      step.status = stepVerified.verified ? "verified" : "success";
      step.verified = stepVerified.verified;

      // Track newly created category IDs
      if (step.toolName === "create_category") {
        const catData = result.data as Record<string, unknown> | undefined;
        const catId = catData?.categoryId as string;
        const catName = step._catName;
        if (catId && catName) {
          newCategoryIds.set(catName.toLowerCase(), catId);
        }
      }
    } else {
      step.status = "failed";
      step.error = result.message;
      break;
    }
  }

  const hasFailures = actionableSteps.some(s => s.status === "failed");
  const duration = Date.now() - startTime;

  logExecution(userContext.userId, guild.id, "unified_plan", hasFailures ? "partial" : "success", duration);

  state.unifiedPlan = undefined;
  state.pendingConfirmation = undefined;
  state.lastAction = {
    toolName: "apply_template",
    args: { planId: plan.id },
    planId: plan.id,
    timestamp: Date.now(),
  };

  return {
    shouldReply: true,
    reply: formatExecutionReport(plan.steps, hasFailures),
    executed: !hasFailures,
    requiresConfirmation: false,
  };
}

/* ================================================================
 * SERVER MODIFY (single-tool path, unchanged)
 * ================================================================ */

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
    const postVerification = await verifyPostAction(guild, toolName, args, result);
    logVerification(userContext.userId, guild.id, toolName, postVerification.verified);

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

/* ================================================================
 * HELP
 * ================================================================ */

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
    "✨ **Templates & Setup:**",
    "• \"Generate a community template\" (preview only)",
    "• \"Make my server a gaming server\" (applies after confirm)",
    "• \"Generate a template and fix my server\" (combined plan)",
    "• \"Make my server better\" (inspect + recommend)",
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
    "🔍 **Preview:**",
    "• \"Show me what you'll change\" (preview pending plan)",
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
        return { type: "delete_channel", targetId: data.channelId as string, data: {} };
      }
      break;
    case "create_category":
      if (data?.categoryId) {
        return { type: "delete_category", targetId: data.categoryId as string, data: {} };
      }
      break;
    case "create_role":
      if (data?.roleId) {
        return { type: "delete_role", targetId: data.roleId as string, data: {} };
      }
      break;
    case "assign_role":
      if (args.userId && args.roleId) {
        return { type: "remove_role", targetId: args.roleId as string, data: { userId: args.userId, roleId: args.roleId } };
      }
      break;
    case "remove_role":
      if (args.userId && args.roleId) {
        return { type: "assign_role", targetId: args.roleId as string, data: { userId: args.userId, roleId: args.roleId } };
      }
      break;
    case "rename_channel":
      if (data?.channelId && data?.oldName) {
        return { type: "rename_channel", targetId: data.channelId as string, data: { oldName: data.oldName } };
      }
      break;
  }

  return null;
}

/* ================================================================
 * CLEANUP
 * ================================================================ */

const cleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [key, state] of conversationStates) {
    if (now - state.lastStateFetchedAt > STATE_TTL_MS) {
      conversationStates.delete(key);
    }
  }
}, 5 * 60 * 1000);
if (cleanupInterval.unref) cleanupInterval.unref();
