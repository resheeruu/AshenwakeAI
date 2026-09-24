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
var conversational_agent_exports = {};
__export(conversational_agent_exports, {
  buildToolArgs: () => buildToolArgs,
  classifyIntent: () => classifyIntent,
  handleConversation: () => handleConversation
});
module.exports = __toCommonJS(conversational_agent_exports);
var import_discord = require("discord.js");
var import_logger = require("../logger");
var import_channel_scope = require("../ai/tools/channel-scope");
var import_audit = require("../security/audit");
var import_executor = require("../ai/tools/executor");
var import_executor2 = require("../ai/tools/executor");
var import_confirmation_store = require("../ai/tools/confirmation-store");
var import_agent_orchestrator = require("../ai/tools/discord/agent-orchestrator");
var import_undo_manager = require("../ai/tools/discord/undo-manager");
var import_env = require("../config/env");
var import_resource_resolver = require("./resource-resolver");
var import_case_manager = require("../support/case-manager");
var import_ai_orchestrator = require("../support/ai-orchestrator");
function logIntent(userId, guildId, intent, confidence) {
  import_logger.logger.info(`CONVERSATIONAL INTENT user=${userId} guild=${guildId} intent=${intent} confidence=${confidence}`);
}
function logResolution(userId, guildId, resourceType, input, result) {
  import_logger.logger.info(`RESOURCE RESOLUTION user=${userId} guild=${guildId} type=${resourceType} input="${input}" result=${result}`);
}
function logAuth(userId, guildId, tool, authorized) {
  import_logger.logger.info(`AUTHORIZATION user=${userId} guild=${guildId} tool=${tool} authorized=${authorized}`);
}
function logRisk(userId, guildId, tool, riskLevel) {
  import_logger.logger.info(`RISK user=${userId} guild=${guildId} tool=${tool} risk=${riskLevel}`);
}
function logExecution(userId, guildId, tool, status, durationMs) {
  import_logger.logger.info(`EXECUTION user=${userId} guild=${guildId} tool=${tool} status=${status} duration=${durationMs}ms`);
}
function logVerification(userId, guildId, tool, verified) {
  import_logger.logger.info(`VERIFICATION user=${userId} guild=${guildId} tool=${tool} verified=${verified}`);
}
const conversationStates = /* @__PURE__ */ new Map();
const STATE_TTL_MS = 10 * 60 * 1e3;
const MAX_CONVERSATION_STATES = 5e3;
function getStateKey(userId, guildId) {
  return `${userId}:${guildId}`;
}
function getOrCreateState(userId, guildId, channelId) {
  const key = getStateKey(userId, guildId);
  let state = conversationStates.get(key);
  if (!state || Date.now() - state.lastStateFetchedAt > STATE_TTL_MS) {
    if (!state && conversationStates.size >= MAX_CONVERSATION_STATES) {
      let oldestKey = "";
      let oldestTime = Infinity;
      for (const [k, s] of conversationStates) {
        if (s.lastStateFetchedAt < oldestTime) {
          oldestTime = s.lastStateFetchedAt;
          oldestKey = k;
        }
      }
      if (oldestKey) conversationStates.delete(oldestKey);
    }
    state = {
      userId,
      guildId,
      channelId,
      lastStateFetchedAt: Date.now()
    };
    conversationStates.set(key, state);
  }
  return state;
}
function classifyIntent(content, state, mentionedUserIds) {
  const lower = content.toLowerCase().trim();
  if (state.pendingConfirmation || state.unifiedPlan) {
    if (/^(yes|y|confirm|proceed|go|do it|ok|okay|sure|yeah|yep|make it|go ahead|let'?s go|execute|run it|apply it|do that|go for it|sounds good|i agree|approved|confirmed|yep|yup|affirmative|absolutely|definitely|apply|exec)$/i.test(lower)) {
      return { intent: "confirmation", confidence: 0.95 };
    }
    if (/^(no|n|cancel|abort|stop|nah|nope|nevermind|never|don'?t|skip|reject|decline|no thanks|not now|later|nvm)$/i.test(lower)) {
      return { intent: "denial", confidence: 0.95 };
    }
  }
  if (/\b(preview|dry.?run|what.?ll|what.?will|show.?me|show.?details|what.?changes|what.?would|what.?do)\b/i.test(lower)) {
    return { intent: "preview", confidence: 0.85 };
  }
  if (/\b(details|show.?me.?everything|what.?exactly|full.?list|all.?operations|show.?all|verbose)\b/i.test(lower)) {
    return { intent: "details", confidence: 0.85 };
  }
  if (/\b(undo|reverse|revert|take back|cancel that)\b/i.test(lower)) {
    return { intent: "undo", confidence: 0.9 };
  }
  const wantsTemplate = /\b(generate|create|make|build|prepare|template|layout|structure|set.?up|configure|organize)\b/i.test(lower);
  const wantsFix = /\b(fix|repair|clean|health|diagnose|improve|better|organize|sort|arrange)\b/i.test(lower);
  const mentionsServer = /\b(server|guild|community|channel|structure)\b/i.test(lower);
  if (wantsTemplate && wantsFix && mentionsServer) {
    return buildTemplateIntent(lower, true, 0.9);
  }
  if (/\b(make|turn|set|put)\b.*\b(my|the|this)\b.*\b(server|guild)\b.*\b(better|good|great|nice|clean|organized|professional)\b/i.test(lower)) {
    return { intent: "server_better", confidence: 0.85, wantsFix: true };
  }
  if (/\b(make|turn|set|put)\b.*\b(server|guild|everything)\b.*\b(better|good|great|nice|clean|organized)\b/i.test(lower)) {
    return { intent: "server_better", confidence: 0.85, wantsFix: true };
  }
  if (/\b(organize|clean up|tidy|sort)\b.*\b(server|guild|everything|channels|structure)\b/i.test(lower)) {
    return { intent: "server_better", confidence: 0.85, wantsFix: true };
  }
  if (/\b(what('?s| is| are)|show|check|inspect|diagnose|status|overview|summary)\b.*\b(server|guild|channel|role|permission|config|setup|health)\b/i.test(lower)) {
    return { intent: "server_inspect", confidence: 0.85 };
  }
  if (/\b(what('?s| is) wrong|what can|problem|issue|error|broken)\b/i.test(lower)) {
    return { intent: "server_repair", confidence: 0.8 };
  }
  if (/\b(server|guild)\b.*\b(wrong|broken|issue|problem|fix|repair)\b/i.test(lower)) {
    return { intent: "server_repair", confidence: 0.8 };
  }
  if (/\b(fix|repair|clean up|diagnose)\b.*\b(my|the|this)?\s*\b(server|guild)\b/i.test(lower)) {
    return { intent: "server_repair", confidence: 0.85 };
  }
  if (/\b(warn|warning|timeout|mute|kick|ban|purge|remove messages)\b/i.test(lower)) {
    return { intent: "moderation", confidence: 0.85 };
  }
  if (/\b(open|create|start|make|new|file)\b.*\b(ticket|support|help request)\b/i.test(lower)) {
    return { intent: "support_ticket", confidence: 0.85 };
  }
  if (/\b(i need|need help|can someone|help me|assist|support)\b/i.test(lower) && !/\b(ban|kick|timeout|warn|mute|delete|remove|purge)\b/i.test(lower)) {
    return { intent: "support_ticket", confidence: 0.75 };
  }
  if (/\b(report|flag|alert|mod)\b.*\b(user|member|someone|this person)\b/i.test(lower)) {
    return { intent: "support_report", confidence: 0.85 };
  }
  if (/\b(report|flag|alert)\b.*\b(harassment|spam|scam|abuse|toxic|nsfw)\b/i.test(lower)) {
    return { intent: "support_report", confidence: 0.85 };
  }
  if (/\b(appeal|appealing|unban|reverse|overturn)\b.*\b(ban| punishment|action|timeout|warn)\b/i.test(lower)) {
    return { intent: "support_appeal", confidence: 0.85 };
  }
  if (/\b(appeal|unban request|pardon|forgive)\b/i.test(lower)) {
    return { intent: "support_appeal", confidence: 0.8 };
  }
  if (/\b(make|turn|set|convert)\b.*\b(my|the|this)\b.*\b(server|guild)\b.*\b(a|into|like)\b.*\b(gaming|community|minecraft|support|creator|study|clan|social|friends)\b/i.test(lower)) {
    return buildTemplateIntent(lower, false, 0.88);
  }
  if (/\b(generate|create|make|build|prepare)\b.*\b(template|layout|structure)\b/i.test(lower)) {
    return buildTemplateIntent(lower, false, 0.85);
  }
  if (/\b(set up|setup|configure|build|organize)\b.*\b(server|guild)\b/i.test(lower)) {
    return buildTemplateIntent(lower, false, 0.85);
  }
  if (/\b(set up|setup|configure|build|organize)\b.*\b(template|layout)\b/i.test(lower)) {
    return buildTemplateIntent(lower, false, 0.85);
  }
  if (/\b(delete|remove|clear|clean)\b.*\b(all|everything|every|all channels|all categories)\b.*\b(except|but|keep|preserve|leave|save)\b/i.test(lower)) {
    return { intent: "delete_except", confidence: 0.9 };
  }
  if (/\b(except|but|keep|preserve|leave|save)\b.*\b(all|everything|every)\b.*\b(delete|remove|clear|clean)\b/i.test(lower)) {
    return { intent: "delete_except", confidence: 0.85 };
  }
  if (/\b(delete|remove|clear)\b.*\b(everything|all)\b.*\b(except|but)\b/i.test(lower)) {
    return { intent: "delete_except", confidence: 0.9 };
  }
  if (/\b(make|create|build|set\s*up|prepare)\b.*\b(server|guild)\b/i.test(lower) && !/\b(better|good|great|nice|clean|organized|professional)\b/i.test(lower) && !/\b(delete|remove|destroy)\b/i.test(lower)) {
    return buildTemplateIntent(lower, false, 0.85);
  }
  if (/\b(create|make|add|set up|configure|build|organize|rename|move|delete|remove|edit|change|modify|protect|unprotect)\b/i.test(lower)) {
    return { intent: "server_modify", confidence: 0.8 };
  }
  if (/\b(give|assign|remove|configure)\b.*\b(role|permission)\b/i.test(lower)) {
    return { intent: "server_modify", confidence: 0.8 };
  }
  if (/\b(help|what can you|how do|what do you)\b/i.test(lower)) {
    return { intent: "help", confidence: 0.7 };
  }
  return { intent: "normal_chat", confidence: 0.5 };
}
function buildTemplateIntent(lower, wantsFix, confidence) {
  let templateType = "community";
  if (/\b(minecraft|mc)\b/i.test(lower)) templateType = "minecraft";
  else if (/\b(gaming|game)\b/i.test(lower)) templateType = "gaming";
  else if (/\b(support|help\s*desk|ticket)\b/i.test(lower)) templateType = "support";
  else if (/\b(study|studygroup|learning|school|university|college|academic)\b/i.test(lower)) templateType = "study";
  else if (/\b(creator|content|youtube|twitch|streamer|art)\b/i.test(lower)) templateType = "creator";
  else if (/\b(clan|competitive|esports|team|tryout)\b/i.test(lower)) templateType = "clan";
  else if (/\b(social|hangout|chill|casual)\b/i.test(lower)) templateType = "social";
  else if (/\b(friends|friend|private)\b/i.test(lower)) templateType = "friends";
  else if (/\b(community)\b/i.test(lower)) templateType = "community";
  return {
    intent: "server_template",
    confidence,
    templateType,
    wantsFix
  };
}
async function resolveGuild(client, message) {
  if (!message.guild) return null;
  const guild = message.guild;
  const botOwnerIds = import_env.config.admin.discordIds;
  const userContext = await (0, import_agent_orchestrator.resolveUserContext)(guild, message.author.id, botOwnerIds);
  if (!userContext) return null;
  return { guild, userContext };
}
async function getCachedServerState(guild, state) {
  if (state.lastServerState && Date.now() - state.lastStateFetchedAt < STATE_TTL_MS) {
    return state.lastServerState;
  }
  const serverState = await (0, import_agent_orchestrator.inspectServerState)(guild);
  state.lastServerState = serverState;
  state.lastStateFetchedAt = Date.now();
  return serverState;
}
function classifyResources(serverState, template) {
  const existingCategories = serverState.categories.map((c) => c.name.toLowerCase());
  const existingChannels = serverState.channels.map((c) => c.name.toLowerCase());
  const existingRoles = serverState.roles.map((r) => r.name.toLowerCase());
  const existsAndMatches = [];
  const existsButDifferent = [];
  const missing = [];
  const duplicates = [];
  const protectedList = [];
  const channelCounts = /* @__PURE__ */ new Map();
  for (const ch of serverState.channels) {
    const key = ch.name.toLowerCase();
    if (!channelCounts.has(key)) channelCounts.set(key, []);
    channelCounts.get(key).push(ch.id);
  }
  for (const [name, ids] of channelCounts) {
    if (ids.length > 1) {
      duplicates.push({ name, type: "channel", ids });
    }
  }
  const roleCounts = /* @__PURE__ */ new Map();
  for (const role of serverState.roles) {
    const key = role.name.toLowerCase();
    if (!roleCounts.has(key)) roleCounts.set(key, []);
    roleCounts.get(key).push(role.id);
  }
  for (const [name, ids] of roleCounts) {
    if (ids.length > 1) {
      duplicates.push({ name, type: "role", ids });
    }
  }
  for (const roleData of template.roles) {
    if (existingRoles.includes(roleData.name.toLowerCase())) {
      existsAndMatches.push(`Role "${roleData.name}"`);
    } else {
      missing.push(`Role "${roleData.name}"`);
    }
  }
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
function buildToolArgs(toolName, content, mentionedUserIds, serverState, guild) {
  const lower = content.toLowerCase();
  const args = {};
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
      const nameMatch = content.match(/(?:channel|text|voice)\s+(?:called|named|channel)?\s*[`"']?(\S+)[`"']?/i) || content.match(/(?:create|make|add)\s+(?:a\s+)?(?:new\s+)?(?:text\s+|voice\s+)?[`"']?(\S+)[`"']?\s*(?:channel)?/i);
      const rawName = nameMatch?.[1]?.replace(/[^a-zA-Z0-9-_]/g, "").toLowerCase() || "new-channel";
      let categoryId;
      const catMatch = content.match(/(?:in|under|inside|within)\s+(?:the\s+)?[`"']?(\S+)[`"']?/i);
      if (catMatch) {
        const catResult = (0, import_resource_resolver.resolveCategory)(guild, catMatch[1]);
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
      const nameMatch = content.match(/(?:category|group|section)\s+(?:called|named)?\s*[`"']?(\S+)[`"']?/i) || content.match(/(?:create|make|add)\s+(?:a\s+)?(?:new\s+)?[`"']?(\S+)[`"']?\s*(?:category|group|section)?/i);
      const name = nameMatch?.[1]?.replace(/[^a-zA-Z0-9-_]/g, "-").toLowerCase() || "new-category";
      args.name = name;
      return args;
    }
    case "create_role": {
      const nameMatch = content.match(/(?:role)\s+(?:called|named)?\s*[`"']?(\S+)[`"']?/i) || content.match(/(?:create|make|add)\s+(?:a\s+)?(?:new\s+)?[`"']?(\S+)[`"']?\s*(?:role)?/i);
      const name = nameMatch?.[1] || "new-role";
      args.name = name;
      const colorMatch = content.match(/(?:colou?r)\s*[`"']?(\S+)[`"']?/i);
      if (colorMatch) args.color = colorMatch[1];
      return args;
    }
    case "rename_channel": {
      const channelMatch = content.match(/(?:rename|change)\s+(?:the\s+)?(?:name\s+(?:of\s+)?)?(?:channel\s+)?[`"']?#?(\S+)[`"']?\s*(?:to|into)\s*[`"']?(\S+)[`"']?/i);
      if (channelMatch) {
        const channelResult = (0, import_resource_resolver.resolveChannel)(guild, channelMatch[1], "text");
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
        const result = (0, import_resource_resolver.resolveChannel)(guild, nameMatch[1], channelType);
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
        const memberMatch = content.match(/(?:assign|give)\s+(\S+)\s+(?:the\s+)?(?:role|permission)/i) || content.match(/(\S+)\s+(?:to|for)\s+(?:the\s+)?(?:role|permission)/i);
        if (memberMatch) {
          const memberResult = (0, import_resource_resolver.resolveMember)(guild, memberMatch[1]);
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
      const roleMatch = content.match(/(?:role)\s*[`"']?(\S+)[`"']?/i) || content.match(/(?:assign|give)\s+.*(?:role)\s+[`"']?(\S+)[`"']?/i);
      if (roleMatch) {
        const roleResult = (0, import_resource_resolver.resolveRoleByName)(guild, roleMatch[1]);
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
          const memberResult = (0, import_resource_resolver.resolveMember)(guild, memberMatch[1]);
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
      const roleMatch = content.match(/(?:role)\s*[`"']?(\S+)[`"']?/i) || content.match(/(?:remove|take)\s+.*(?:role)\s+[`"']?(\S+)[`"']?/i);
      if (roleMatch) {
        const roleResult = (0, import_resource_resolver.resolveRoleByName)(guild, roleMatch[1]);
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
      const roleMatch = content.match(/(?:role)\s*[`"']?(\S+)[`"']?/i) || content.match(/(?:give|grant|configure)\s+.*(?:role)\s+[`"']?(\S+)[`"']?/i);
      if (roleMatch) {
        const roleResult = (0, import_resource_resolver.resolveRoleByName)(guild, roleMatch[1]);
        if (roleResult.exact) {
          args.roleId = roleResult.exact.id;
          const perms = [];
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
async function verifyPostAction(guild, toolName, args, result) {
  if (result.status !== "success") {
    return { verified: false, details: "Action was not successful" };
  }
  try {
    switch (toolName) {
      case "create_channel": {
        const data = result.data;
        const channelId = data?.channelId;
        if (!channelId) return { verified: false, details: "No channelId in result" };
        const channel = await guild.channels.fetch(channelId).catch(() => null);
        if (!channel) return { verified: false, details: "Channel not found after creation" };
        return { verified: true, details: `Channel #${channel.name} exists` };
      }
      case "delete_channel":
      case "delete_category": {
        const channelId = args.channelId;
        if (!channelId) return { verified: true, details: "No channelId to verify" };
        const channel = await guild.channels.fetch(channelId).catch(() => null);
        if (channel) return { verified: false, details: "Channel still exists after deletion" };
        return { verified: true, details: "Channel confirmed deleted" };
      }
      case "create_role": {
        const data = result.data;
        const roleId = data?.roleId;
        if (!roleId) return { verified: false, details: "No roleId in result" };
        const role = await guild.roles.fetch(roleId).catch(() => null);
        if (!role) return { verified: false, details: "Role not found after creation" };
        return { verified: true, details: `Role ${role.name} exists` };
      }
      case "delete_role": {
        const roleId = args.roleId;
        if (!roleId) return { verified: true, details: "No roleId to verify" };
        const role = await guild.roles.fetch(roleId).catch(() => null);
        if (role) return { verified: false, details: "Role still exists after deletion" };
        return { verified: true, details: "Role confirmed deleted" };
      }
      case "assign_role": {
        const userId = args.userId;
        const roleId = args.roleId;
        if (!userId || !roleId) return { verified: true, details: "No user/role to verify" };
        const member = await guild.members.fetch(userId).catch(() => null);
        if (!member) return { verified: false, details: "Member not found" };
        const hasRole = member.roles.cache.has(roleId);
        if (!hasRole) return { verified: false, details: "Role not assigned to member" };
        return { verified: true, details: "Role confirmed assigned" };
      }
      case "remove_role": {
        const userId = args.userId;
        const roleId = args.roleId;
        if (!userId || !roleId) return { verified: true, details: "No user/role to verify" };
        const member = await guild.members.fetch(userId).catch(() => null);
        if (!member) return { verified: true, details: "Member not found (may have left)" };
        const hasRole = member.roles.cache.has(roleId);
        if (hasRole) return { verified: false, details: "Role still assigned to member" };
        return { verified: true, details: "Role confirmed removed" };
      }
      case "rename_channel": {
        const channelId = args.channelId;
        const newName = args.newName;
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
function buildTemplatePreview(templateName, template) {
  const totalChannels = template.categories.reduce((a, c) => a + c.channels.length, 0);
  const lines = [
    `\u2728 **${template.name}**`,
    template.description,
    "",
    `**Create**`,
    `\u2022 ${template.roles.length} role${template.roles.length > 1 ? "s" : ""}`,
    `\u2022 ${template.categories.length} categor${template.categories.length > 1 ? "ies" : "y"}`,
    `\u2022 ${totalChannels} channel${totalChannels > 1 ? "s" : ""}`
  ];
  return lines.join("\n");
}
function formatUnifiedPlanSummary(plan) {
  const creates = plan.steps.filter((s) => s.category === "create" && s.status === "pending");
  const fixes = plan.steps.filter((s) => s.category === "fix" && s.status === "pending");
  const preserves = plan.steps.filter((s) => s.category === "preserve");
  const skips = plan.steps.filter((s) => s.category === "skip");
  const lines = [
    `\u2728 **${plan.goal}**`,
    ""
  ];
  const roleCreates = creates.filter((s) => s.toolName === "create_role");
  const catCreates = creates.filter((s) => s.toolName === "create_category");
  const chCreates = creates.filter((s) => s.toolName === "create_channel");
  if (creates.length > 0) {
    lines.push("**Create:**");
    if (roleCreates.length > 0) lines.push(`\u2022 ${roleCreates.length} role${roleCreates.length > 1 ? "s" : ""}`);
    if (catCreates.length > 0) lines.push(`\u2022 ${catCreates.length} categor${catCreates.length > 1 ? "ies" : "y"}`);
    if (chCreates.length > 0) lines.push(`\u2022 ${chCreates.length} channel${chCreates.length > 1 ? "s" : ""}`);
  }
  if (fixes.length > 0) {
    if (creates.length > 0) lines.push("");
    lines.push("**Fix:**");
    for (const f of fixes) lines.push(`\u2022 ${f.description}`);
  }
  if (preserves.length > 0) {
    if (creates.length > 0 || fixes.length > 0) lines.push("");
    lines.push("**Preserve:**");
    lines.push(`\u2022 ${preserves.length} existing resource${preserves.length > 1 ? "s" : ""} that already match`);
  }
  if (skips.length > 0) {
    if (creates.length > 0 || fixes.length > 0 || preserves.length > 0) lines.push("");
    lines.push("**Skip:**");
    for (const s of skips) {
      lines.push(`\u2022 ${s.description}`);
    }
  }
  if (plan.duplicates.length > 0) {
    if (creates.length > 0 || fixes.length > 0 || preserves.length > 0 || skips.length > 0) lines.push("");
    lines.push("**Review:**");
    for (const dup of plan.duplicates) {
      lines.push(`\u2022 ${dup.ids.length} duplicate ${dup.type} "${dup.name}"`);
    }
    lines.push(`\u2022 I won't delete ambiguous duplicates automatically`);
  }
  lines.push("", "Want me to apply this template?");
  return lines.join("\n");
}
function formatExecutionReport(steps, isPartial) {
  const succeeded = steps.filter((s) => s.status === "success" || s.status === "verified");
  const failed = steps.filter((s) => s.status === "failed");
  const unverified = steps.filter((s) => s.status === "success" && s.verified === false);
  if (isPartial || failed.length > 0) {
    const lines2 = ["**Partially completed.**", ""];
    const createdRoles = succeeded.filter((s) => s.toolName === "create_role").length;
    const createdCats = succeeded.filter((s) => s.toolName === "create_category").length;
    const createdChs = succeeded.filter((s) => s.toolName === "create_channel").length;
    const fixed = succeeded.filter((s) => s.category === "fix").length;
    const parts2 = [];
    if (createdRoles > 0) parts2.push(`${createdRoles} role${createdRoles > 1 ? "s" : ""}`);
    if (createdCats > 0) parts2.push(`${createdCats} categor${createdCats > 1 ? "ies" : "y"}`);
    if (createdChs > 0) parts2.push(`${createdChs} channel${createdChs > 1 ? "s" : ""}`);
    if (fixed > 0) parts2.push(`${fixed} fix${fixed > 1 ? "es" : ""}`);
    if (parts2.length > 0) {
      lines2.push(`**Completed:** ${parts2.join(", ")}`);
    }
    if (failed.length > 0) {
      lines2.push("");
      lines2.push("**Failed:**");
      for (const f of failed) lines2.push(`\u2022 ${f.description}`);
    }
    if (unverified.length > 0) {
      lines2.push("");
      lines2.push("**Verification failed:**");
      for (const u of unverified) lines2.push(`\u2022 ${u.description}`);
    }
    return lines2.join("\n");
  }
  const creates = steps.filter((s) => s.category === "create" && (s.status === "verified" || s.status === "success"));
  const fixes = steps.filter((s) => (s.category === "fix" || s.category === "configure") && (s.status === "verified" || s.status === "success"));
  const roleCreates = creates.filter((s) => s.toolName === "create_role");
  const catCreates = creates.filter((s) => s.toolName === "create_category");
  const chCreates = creates.filter((s) => s.toolName === "create_channel");
  const lines = ["**Done.**", ""];
  const parts = [];
  if (roleCreates.length > 0) parts.push(`${roleCreates.length} role${roleCreates.length > 1 ? "s" : ""}`);
  if (catCreates.length > 0) parts.push(`${catCreates.length} categor${catCreates.length > 1 ? "ies" : "y"}`);
  if (chCreates.length > 0) parts.push(`${chCreates.length} channel${chCreates.length > 1 ? "s" : ""}`);
  if (parts.length > 0) {
    lines.push(`**Created:** ${parts.join(", ")}`);
  }
  if (fixes.length > 0) {
    lines.push(`**Fixed:** ${fixes.length} issue${fixes.length > 1 ? "s" : ""}`);
  }
  return lines.join("\n");
}
function buildInspectionResponse(state) {
  return (0, import_agent_orchestrator.formatServerState)(state);
}
function buildModificationPlanResponse(toolName, args, riskLevel) {
  const lines = [
    `**Plan:** ${toolName.replace(/_/g, " ")}`,
    `**Risk:** ${riskLevel.toUpperCase()}`,
    ""
  ];
  for (const [key, value] of Object.entries(args)) {
    if (key.startsWith("_")) continue;
    lines.push(`\u2022 ${key}: \`${value}\``);
  }
  lines.push("", "Proceed? (yes/no)");
  return lines.join("\n");
}
function buildSuccessResponse(toolName, result) {
  if (result.message) return result.message;
  return `\u2705 ${toolName.replace(/_/g, " ")} completed successfully.`;
}
function buildDenialResponse(result) {
  return result.message || "\u274C I couldn't complete that action.";
}
function buildUndoResponse(undoResult) {
  return undoResult.message;
}
async function handleConversation(client, message, content, mentionedUserIds) {
  const startTime = Date.now();
  try {
    const resolved = await resolveGuild(client, message);
    if (!resolved) {
      return {
        shouldReply: false,
        reply: "",
        executed: false,
        requiresConfirmation: false
      };
    }
    const { guild, userContext } = resolved;
    const state = getOrCreateState(userContext.userId, guild.id, message.channel.id);
    if (message.channel && "id" in message.channel) {
      const caseManager = (0, import_case_manager.getSupportCaseManager)();
      const channelCases = caseManager.getChannelCases(message.channel.id);
      const activeCase = channelCases.find((c) => c.status !== "closed") ?? channelCases[0];
      if (activeCase && activeCase.guildId === guild.id) {
        try {
          const userName = message.author.tag;
          const result = await (0, import_ai_orchestrator.orchestrateCaseConversation)(
            activeCase.id,
            message.channel.id,
            userContext.userId,
            userName,
            content,
            guild.id,
            mentionedUserIds
          );
          if (result.newStatus) {
            caseManager.transitionCase(activeCase.id, result.newStatus, "system");
          }
          if (result.shouldReply) {
            return {
              shouldReply: true,
              reply: result.reply,
              executed: true,
              requiresConfirmation: false
            };
          }
          return {
            shouldReply: false,
            reply: "",
            executed: false,
            requiresConfirmation: false
          };
        } catch (orchestratorError) {
          import_logger.logger.warn(`AI orchestrator error for case ${activeCase.id}: ${orchestratorError instanceof Error ? orchestratorError.message : String(orchestratorError)}`);
        }
      }
    }
    const classification = classifyIntent(content, state, mentionedUserIds);
    logIntent(userContext.userId, guild.id, classification.intent, classification.confidence);
    const BUILDER_INTENTS = [
      "server_template",
      "server_inspect",
      "server_repair",
      "server_better",
      "delete_except"
    ];
    if (BUILDER_INTENTS.includes(classification.intent)) {
      return {
        shouldReply: true,
        reply: '\u{1F6E0}\uFE0F Server-building requests are available through "/prompt".',
        executed: false,
        requiresConfirmation: false
      };
    }
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
      case "details": {
        return handleDetails(state, userContext, guild, message);
      }
      case "delete_except": {
        return handleDeleteExcept(guild, userContext, state, message, content);
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
          classification.wantsFix || false
        );
      }
      case "server_modify": {
        return handleServerModify(guild, userContext, state, message, content, mentionedUserIds);
      }
      case "moderation": {
        return handleNaturalModeration(guild, userContext, state, message, content, mentionedUserIds, client);
      }
      case "support_ticket": {
        return handleSupportTicket(guild, userContext, message);
      }
      case "support_report": {
        return handleSupportReport(guild, userContext, message, content, mentionedUserIds);
      }
      case "support_appeal": {
        return handleSupportAppeal(guild, userContext, message, content);
      }
      case "help": {
        return handleHelp(userContext, guild);
      }
      default: {
        return {
          shouldReply: false,
          reply: "",
          executed: false,
          requiresConfirmation: false
        };
      }
    }
  } catch (error) {
    const cid = `ASH-${Date.now().toString(36)}`;
    import_logger.logger.error(
      `[ASH][${cid}][CONV-AGENT] error: ${error instanceof Error ? error.message : String(error)}`
    );
    (0, import_audit.recordAudit)({
      who: message.author.id,
      whoName: message.author.tag,
      what: `[${cid}] Agent error: ${error instanceof Error ? error.message : String(error)}`,
      where: "conversational-agent",
      guildId: message.guild?.id || "",
      result: "error"
    });
    return {
      shouldReply: true,
      reply: `\u274C I couldn't process that request. Error ID: "${cid}". Please try again or rephrase.`,
      executed: false,
      requiresConfirmation: false
    };
  }
}
async function handleConfirmation(state, userContext, guild, message) {
  if (state.unifiedPlan) {
    return executeUnifiedPlan(state, userContext, guild, message);
  }
  if (!state.pendingConfirmation) {
    return {
      shouldReply: true,
      reply: "No pending action to confirm.",
      executed: false,
      requiresConfirmation: false
    };
  }
  const { planId, toolName, args } = state.pendingConfirmation;
  const plan = (0, import_confirmation_store.getPendingPlan)(planId);
  if (!plan) {
    state.pendingConfirmation = void 0;
    return {
      shouldReply: true,
      reply: "\u23F1\uFE0F That action has expired. Please ask me to do it again.",
      executed: false,
      requiresConfirmation: false
    };
  }
  const verification = (0, import_confirmation_store.verifyPlan)(plan, userContext.userId, guild.id);
  if (!verification.valid) {
    state.pendingConfirmation = void 0;
    (0, import_confirmation_store.removePendingPlan)(planId);
    return {
      shouldReply: true,
      reply: `\u274C Cannot confirm: ${verification.reason || "invalid plan"}`,
      executed: false,
      requiresConfirmation: false
    };
  }
  logAuth(userContext.userId, guild.id, toolName, true);
  logRisk(userContext.userId, guild.id, toolName, plan.riskLevel);
  (0, import_confirmation_store.markPlanExecuted)(planId);
  const templateSteps = args.templateSteps ?? plan.arguments.templateSteps;
  if (templateSteps && templateSteps.length > 0) {
    return executeTemplateSteps(
      guild,
      userContext,
      state,
      planId,
      templateSteps,
      message.channel.id
    );
  }
  if (toolName === "apply_template") {
    state.pendingConfirmation = void 0;
    (0, import_confirmation_store.removePendingPlan)(planId);
    (0, import_audit.recordAudit)({
      who: userContext.userId,
      whoName: userContext.username,
      what: "Template plan missing decomposed steps",
      where: "conversational-agent",
      guildId: guild.id,
      result: "error"
    });
    return {
      shouldReply: true,
      reply: "\u274C Template plan is missing its decomposed steps. Please generate the template again.",
      executed: false,
      requiresConfirmation: false
    };
  }
  const execStartTime = Date.now();
  const result = await (0, import_agent_orchestrator.executeWithFullPipeline)(
    guild,
    userContext,
    toolName,
    args,
    state.channelId
  );
  const execDuration = Date.now() - execStartTime;
  logExecution(userContext.userId, guild.id, toolName, result.status, execDuration);
  const verification_result = await verifyPostAction(guild, toolName, args, result);
  logVerification(userContext.userId, guild.id, toolName, verification_result.verified);
  state.pendingConfirmation = void 0;
  state.lastAction = {
    toolName,
    args,
    timestamp: Date.now()
  };
  if (result.status === "success") {
    if (!verification_result.verified) {
      return {
        shouldReply: true,
        reply: `\u26A0\uFE0F Action completed but verification failed: ${verification_result.details}. Please check manually.`,
        executed: false,
        requiresConfirmation: false
      };
    }
    return {
      shouldReply: true,
      reply: buildSuccessResponse(toolName, result),
      executed: true,
      requiresConfirmation: false
    };
  }
  return {
    shouldReply: true,
    reply: buildDenialResponse(result),
    executed: false,
    requiresConfirmation: false
  };
}
async function executeTemplateSteps(guild, userContext, state, planId, steps, channelId) {
  const startTime = Date.now();
  const executedSteps = [];
  const failedSteps = [];
  const executorOptions = { [import_executor.INTERNAL_SKIP_CONFIRMATION]: true };
  for (const step of steps) {
    logExecution(userContext.userId, guild.id, step.toolName, "starting", 0);
    const result = await (0, import_agent_orchestrator.executeWithFullPipeline)(
      guild,
      userContext,
      step.toolName,
      step.args,
      channelId,
      void 0,
      void 0,
      executorOptions
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
  state.pendingConfirmation = void 0;
  state.lastAction = {
    toolName: "apply_template",
    args: { steps },
    planId,
    timestamp: Date.now()
  };
  if (failedSteps.length === 0) {
    const parts = [];
    const createdRoles = executedSteps.filter((s) => s.includes("role")).length;
    const createdCats = executedSteps.filter((s) => s.includes("category")).length;
    const createdChs = executedSteps.filter((s) => s.includes("channel")).length;
    if (createdRoles > 0) parts.push(`${createdRoles} role${createdRoles > 1 ? "s" : ""}`);
    if (createdCats > 0) parts.push(`${createdCats} categor${createdCats > 1 ? "ies" : "y"}`);
    if (createdChs > 0) parts.push(`${createdChs} channel${createdChs > 1 ? "s" : ""}`);
    return {
      shouldReply: true,
      reply: `**Done.** Created ${parts.join(", ")}.`,
      executed: true,
      requiresConfirmation: false
    };
  }
  const lines = ["**Partially applied.**", ""];
  if (executedSteps.length > 0) {
    lines.push(`**Completed:** ${executedSteps.length} operation${executedSteps.length > 1 ? "s" : ""}`);
  }
  lines.push("");
  lines.push("**Failed:**");
  for (const f of failedSteps) lines.push(`\u2022 ${f.step}: ${f.error}`);
  return {
    shouldReply: true,
    reply: lines.join("\n"),
    executed: executedSteps.length > 0,
    requiresConfirmation: false
  };
}
async function handleDenial(state, userContext, guild, message) {
  if (state.unifiedPlan) {
    const planGoal = state.unifiedPlan.goal;
    state.unifiedPlan = void 0;
    state.pendingConfirmation = void 0;
    (0, import_audit.recordAudit)({
      who: userContext.userId,
      whoName: userContext.username,
      what: `Cancelled unified plan: ${planGoal}`,
      where: "conversational-agent",
      guildId: guild.id,
      result: "denied"
    });
    return {
      shouldReply: true,
      reply: "\u274C Plan cancelled. Nothing was changed.",
      executed: false,
      requiresConfirmation: false
    };
  }
  if (!state.pendingConfirmation) {
    return {
      shouldReply: true,
      reply: "Nothing to cancel.",
      executed: false,
      requiresConfirmation: false
    };
  }
  const { planId } = state.pendingConfirmation;
  (0, import_confirmation_store.removePendingPlan)(planId);
  state.pendingConfirmation = void 0;
  (0, import_audit.recordAudit)({
    who: userContext.userId,
    whoName: userContext.username,
    what: `Cancelled action: ${state.lastAction?.toolName || "unknown"}`,
    where: "conversational-agent",
    guildId: guild.id,
    result: "denied"
  });
  return {
    shouldReply: true,
    reply: "\u274C Action cancelled.",
    executed: false,
    requiresConfirmation: false
  };
}
async function handleUndo(userContext, guild, message, discordClient) {
  const undoEntry = (0, import_undo_manager.getLastUndoForUser)(guild.id, userContext.userId);
  if (!undoEntry) {
    return {
      shouldReply: true,
      reply: "Nothing to undo.",
      executed: false,
      requiresConfirmation: false
    };
  }
  const result = await (0, import_undo_manager.executeUndo)(undoEntry.id, () => discordClient);
  return {
    shouldReply: true,
    reply: buildUndoResponse(result),
    executed: result.success,
    requiresConfirmation: false
  };
}
async function handlePreview(state, userContext, guild, message) {
  if (state.unifiedPlan) {
    return {
      shouldReply: true,
      reply: formatUnifiedPlanSummary(state.unifiedPlan),
      executed: false,
      requiresConfirmation: true,
      planId: state.unifiedPlan.id
    };
  }
  if (state.pendingConfirmation) {
    const plan = (0, import_confirmation_store.getPendingPlan)(state.pendingConfirmation.planId);
    if (plan) {
      const lines = [
        `**Pending plan:** ${plan.toolName.replace(/_/g, " ")}`,
        `**Risk:** ${plan.riskLevel}`,
        "",
        ...plan.changes.map((c) => `\u2022 ${c.description}`),
        "",
        "Proceed? (yes/no)"
      ];
      return {
        shouldReply: true,
        reply: lines.join("\n"),
        executed: false,
        requiresConfirmation: true,
        planId: plan.id
      };
    }
  }
  return {
    shouldReply: true,
    reply: "No pending plan to preview. Ask me to set up or fix your server first.",
    executed: false,
    requiresConfirmation: false
  };
}
async function handleDetails(state, userContext, guild, message) {
  if (state.unifiedPlan) {
    const plan = state.unifiedPlan;
    const lines = [`**Detailed plan: ${plan.goal}**`, ""];
    const creates = plan.steps.filter((s) => s.category === "create" && s.status === "pending");
    const fixes = plan.steps.filter((s) => s.category === "fix" && s.status === "pending");
    const preserves = plan.steps.filter((s) => s.category === "preserve");
    const skips = plan.steps.filter((s) => s.category === "skip");
    if (creates.length > 0) {
      lines.push("**Create:**");
      for (const s of creates) lines.push(`\u2022 ${s.description}`);
      lines.push("");
    }
    if (fixes.length > 0) {
      lines.push("**Fix:**");
      for (const s of fixes) lines.push(`\u2022 ${s.description}`);
      lines.push("");
    }
    if (preserves.length > 0) {
      lines.push("**Preserve:**");
      for (const s of preserves) lines.push(`\u2022 ${s.description}`);
      lines.push("");
    }
    if (skips.length > 0) {
      lines.push("**Skip:**");
      for (const s of skips) lines.push(`\u2022 ${s.description}`);
      lines.push("");
    }
    if (plan.duplicates.length > 0) {
      lines.push("**Review:**");
      for (const dup of plan.duplicates) {
        lines.push(`\u2022 ${dup.ids.length} duplicate ${dup.type} "${dup.name}" \u2014 I won't touch these unless you ask`);
      }
      lines.push("");
    }
    lines.push("Want me to apply this template?");
    return {
      shouldReply: true,
      reply: lines.join("\n"),
      executed: false,
      requiresConfirmation: true,
      planId: plan.id
    };
  }
  if (state.pendingConfirmation) {
    const plan = (0, import_confirmation_store.getPendingPlan)(state.pendingConfirmation.planId);
    if (plan) {
      const lines = [
        `**Detailed plan:** ${plan.toolName.replace(/_/g, " ")}`,
        `**Risk:** ${plan.riskLevel}`,
        "",
        ...plan.changes.map((c) => `\u2022 ${c.description}`),
        "",
        "Want me to apply this?"
      ];
      return {
        shouldReply: true,
        reply: lines.join("\n"),
        executed: false,
        requiresConfirmation: true,
        planId: plan.id
      };
    }
  }
  return {
    shouldReply: true,
    reply: "No pending plan to show details for. Ask me to set up or fix your server first.",
    executed: false,
    requiresConfirmation: false
  };
}
async function handleDeleteExcept(guild, userContext, state, message, content) {
  if (userContext.ashenRole !== "owner" && userContext.ashenRole !== "admin") {
    return {
      shouldReply: true,
      reply: "\u274C Deleting channels requires administrator permissions.",
      executed: false,
      requiresConfirmation: false
    };
  }
  const serverState = await getCachedServerState(guild, state);
  const keepPattern = content.match(/(?:except|but|keep|preserve|leave|save)\s+(?:the\s+)?(?:#)?(\S+)/i);
  const keepName = keepPattern?.[1]?.toLowerCase();
  if (!keepName) {
    return {
      shouldReply: true,
      reply: `I'm not sure which channels you want to keep. Could you be more specific?

Example: "delete all except general"`,
      executed: false,
      requiresConfirmation: false
    };
  }
  const keepChannels = serverState.channels.filter(
    (ch) => ch.name.toLowerCase().includes(keepName)
  );
  const keepIds = new Set(keepChannels.map((ch) => ch.id));
  const deleteChannels = serverState.channels.filter(
    (ch) => !keepIds.has(ch.id) && !serverState.protectedChannels.includes(ch.id)
  );
  if (deleteChannels.length === 0) {
    return {
      shouldReply: true,
      reply: `\u2705 Nothing to delete \u2014 all channels either match "${keepName}" or are protected.`,
      executed: false,
      requiresConfirmation: false
    };
  }
  const steps = [];
  for (const ch of deleteChannels) {
    steps.push({
      toolName: "delete_channel",
      args: { channelId: ch.id },
      description: `Delete #${ch.name}`,
      category: "create",
      // Using "create" so it gets executed
      status: "pending"
    });
  }
  const plan = {
    id: `delete-except-${Date.now()}`,
    goal: "Delete channels except specified",
    steps,
    duplicates: [],
    riskLevel: "high",
    createdAt: Date.now(),
    expiresAt: Date.now() + 5 * 60 * 1e3
  };
  state.unifiedPlan = plan;
  state.pendingConfirmation = {
    planId: plan.id,
    toolName: "delete_except",
    args: { deleteChannels: deleteChannels.map((ch) => ch.id), keepChannels: keepChannels.map((ch) => ch.id) },
    timestamp: Date.now()
  };
  const lines = [
    `\u26A0\uFE0F **${deleteChannels.length} channel${deleteChannels.length > 1 ? "s" : ""} to remove.**`,
    "",
    "**Keep:**",
    ...keepChannels.map((ch) => `\u2022 #${ch.name}`),
    "",
    "**Delete:**",
    ...deleteChannels.slice(0, 10).map((ch) => `\u2022 #${ch.name}`)
  ];
  if (deleteChannels.length > 10) {
    lines.push(`\u2022 ${deleteChannels.length - 10} more`);
  }
  if (serverState.protectedChannels.length > 0) {
    lines.push("");
    lines.push(`\u2022 ${serverState.protectedChannels.length} protected channel(s) will be preserved`);
  }
  lines.push("");
  lines.push("This is destructive. Continue?");
  return {
    shouldReply: true,
    reply: lines.join("\n"),
    executed: false,
    requiresConfirmation: true,
    planId: plan.id
  };
}
async function handleServerInspect(guild, userContext, state, message, content) {
  const authResult = await (0, import_agent_orchestrator.checkFullAuthorization)(
    guild,
    userContext,
    "inspect_server"
  );
  logAuth(userContext.userId, guild.id, "inspect_server", authResult.authorized);
  if (!authResult.authorized) {
    return {
      shouldReply: true,
      reply: authResult.denialMessage || "\u274C You don't have permission to inspect this server.",
      executed: false,
      requiresConfirmation: false
    };
  }
  const serverState = await getCachedServerState(guild, state);
  const lower = content.toLowerCase();
  if (/\b(permission|role|who can)\b/i.test(lower)) {
    const result = await (0, import_agent_orchestrator.executeWithFullPipeline)(guild, userContext, "check_permissions", {}, message.channel.id);
    if (result.status === "success" && result.message) {
      return { shouldReply: true, reply: result.message, executed: false, requiresConfirmation: false };
    }
  }
  if (/\b(role|who has|members)\b/i.test(lower)) {
    const result = await (0, import_agent_orchestrator.executeWithFullPipeline)(guild, userContext, "inspect_roles", {}, message.channel.id);
    if (result.status === "success" && result.message) {
      return { shouldReply: true, reply: result.message, executed: false, requiresConfirmation: false };
    }
  }
  if (/\b(channel|what|structure|setup)\b/i.test(lower)) {
    const result = await (0, import_agent_orchestrator.executeWithFullPipeline)(guild, userContext, "list_channels", {}, message.channel.id);
    if (result.status === "success" && result.message) {
      return { shouldReply: true, reply: result.message, executed: false, requiresConfirmation: false };
    }
  }
  if (/\b(health|check|diagnose|wrong|problem|issue)\b/i.test(lower)) {
    const result = await (0, import_agent_orchestrator.executeWithFullPipeline)(guild, userContext, "health_check", {}, message.channel.id);
    if (result.status === "success" && result.message) {
      return { shouldReply: true, reply: result.message, executed: false, requiresConfirmation: false };
    }
  }
  return {
    shouldReply: true,
    reply: buildInspectionResponse(serverState),
    executed: false,
    requiresConfirmation: false
  };
}
async function handleServerRepair(guild, userContext, state, message, content) {
  if (userContext.ashenRole !== "owner" && userContext.ashenRole !== "admin") {
    return {
      shouldReply: true,
      reply: "\u274C Server repair requires administrator permissions.",
      executed: false,
      requiresConfirmation: false
    };
  }
  const serverState = await getCachedServerState(guild, state);
  const fixes = [];
  const issues = [];
  const aiConfig = (0, import_channel_scope.loadGuildAIConfig)(guild.id);
  if (aiConfig.managementRoleIds.length === 0 && serverState.roles.length > 2) {
    const modRole = serverState.roles.find((r) => r.name.toLowerCase() === "moderator");
    if (modRole) {
      issues.push("\u26A0\uFE0F Moderator role exists but isn't configured as a management role");
      fixes.push({
        toolName: "configure_role_permissions",
        args: { roleId: modRole.id, permissions: ["ManageMessages", "ModerateMembers"] },
        description: "Configure Moderator role with management permissions",
        category: "fix",
        status: "pending"
      });
    }
  }
  const channelCounts = /* @__PURE__ */ new Map();
  for (const ch of serverState.channels) {
    const key = ch.name.toLowerCase();
    if (!channelCounts.has(key)) channelCounts.set(key, []);
    channelCounts.get(key).push({ id: ch.id, name: ch.name });
  }
  const duplicates = [];
  for (const [name, channels] of channelCounts) {
    if (channels.length > 1) {
      duplicates.push({ name, type: "channel", ids: channels.map((c) => c.id) });
      issues.push(`\u26A0\uFE0F Found ${channels.length} channels named "${name}"`);
    }
  }
  const everyonePerms = guild.roles.cache.get(guild.id);
  if (everyonePerms?.permissions.has(import_discord.PermissionFlagsBits.Administrator)) {
    issues.push("\u26A0\uFE0F @everyone has Administrator permission \u2014 this is a security risk");
  }
  if (fixes.length === 0 && issues.length === 0) {
    return {
      shouldReply: true,
      reply: "\u2705 Your server looks healthy! No issues detected.",
      executed: false,
      requiresConfirmation: false
    };
  }
  const plan = {
    id: `repair-${Date.now()}`,
    goal: "Server Health Check",
    steps: fixes,
    duplicates,
    riskLevel: fixes.length > 0 ? "medium" : "safe",
    createdAt: Date.now(),
    expiresAt: Date.now() + 5 * 60 * 1e3
  };
  if (fixes.length > 0) {
    state.unifiedPlan = plan;
    state.pendingConfirmation = {
      planId: plan.id,
      toolName: "server_repair",
      args: { fixes, plan },
      timestamp: Date.now()
    };
  }
  const lines = ["**Server Health Report**", ""];
  if (issues.length > 0) {
    for (const issue of issues) lines.push(`\u2022 ${issue}`);
  }
  if (duplicates.length > 0) {
    lines.push("");
    for (const dup of duplicates) {
      lines.push(`\u2022 ${dup.ids.length} duplicate ${dup.type} "${dup.name}" \u2014 I won't delete these automatically`);
    }
  }
  if (fixes.length > 0) {
    lines.push("", `I can fix ${fixes.length} issue${fixes.length > 1 ? "s" : ""} automatically. Want me to apply these fixes?`);
  }
  return {
    shouldReply: true,
    reply: lines.join("\n"),
    executed: false,
    requiresConfirmation: fixes.length > 0,
    planId: plan.id
  };
}
async function handleServerBetter(guild, userContext, state, message, content) {
  if (userContext.ashenRole !== "owner" && userContext.ashenRole !== "admin") {
    return {
      shouldReply: true,
      reply: "\u274C Server improvement requires administrator permissions.",
      executed: false,
      requiresConfirmation: false
    };
  }
  const serverState = await getCachedServerState(guild, state);
  const recommendations = [];
  const fixes = [];
  if (serverState.categories.length === 0 && serverState.channels.length < 5) {
    recommendations.push("\u2022 Your server has very little structure \u2014 I can set up a template for you");
  }
  if (serverState.categories.length > 0 && serverState.channels.length > 0) {
    const uncategorized = serverState.channels.filter((c) => !c.categoryId);
    if (uncategorized.length > 2) {
      recommendations.push(`\u2022 ${uncategorized.length} channels are not organized into categories`);
    }
  }
  const channelCounts = /* @__PURE__ */ new Map();
  for (const ch of serverState.channels) {
    const key = ch.name.toLowerCase();
    channelCounts.set(key, (channelCounts.get(key) || 0) + 1);
  }
  const dupCount = [...channelCounts.values()].filter((c) => c > 1).length;
  if (dupCount > 0) {
    recommendations.push(`\u2022 Found ${dupCount} duplicate channel name(s) that could be cleaned up`);
  }
  const hasRules = serverState.channels.some((c) => c.name.toLowerCase() === "rules");
  const hasAnnouncements = serverState.channels.some((c) => c.name.toLowerCase() === "announcements");
  if (!hasRules || !hasAnnouncements) {
    recommendations.push("\u2022 Missing basic server channels (rules, announcements)");
  }
  const aiConfig = (0, import_channel_scope.loadGuildAIConfig)(guild.id);
  if (aiConfig.managementRoleIds.length === 0) {
    const modRole = serverState.roles.find((r) => r.name.toLowerCase() === "moderator");
    if (modRole) {
      recommendations.push("\u2022 Moderator role exists but isn't configured for AI management");
      fixes.push({
        toolName: "configure_role_permissions",
        args: { roleId: modRole.id, permissions: ["ManageMessages", "ModerateMembers"] },
        description: "Configure Moderator role",
        category: "fix",
        status: "pending"
      });
    }
  }
  if (recommendations.length === 0 && fixes.length === 0) {
    return {
      shouldReply: true,
      reply: "\u2705 Your server is already well-organized! I checked the channels, categories, roles, and permissions \u2014 everything looks good. Let me know if there's anything specific you'd like to change.",
      executed: false,
      requiresConfirmation: false
    };
  }
  const lines = [
    "**Server Improvement**",
    "",
    ...recommendations
  ];
  if (fixes.length > 0) {
    lines.push("", `I can fix ${fixes.length} issue${fixes.length > 1 ? "s" : ""} automatically. Want me to apply these fixes?`);
  } else {
    lines.push("", "Would you like me to set up a template to organize things better?");
  }
  if (fixes.length > 0) {
    const plan = {
      id: `better-${Date.now()}`,
      goal: "Server Improvement",
      steps: fixes,
      duplicates: [],
      riskLevel: "medium",
      createdAt: Date.now(),
      expiresAt: Date.now() + 5 * 60 * 1e3
    };
    state.unifiedPlan = plan;
    state.pendingConfirmation = {
      planId: plan.id,
      toolName: "server_better",
      args: { fixes, plan },
      timestamp: Date.now()
    };
  }
  return {
    shouldReply: true,
    reply: lines.join("\n"),
    executed: false,
    requiresConfirmation: fixes.length > 0
  };
}
async function handleServerTemplateUnified(guild, userContext, state, message, content, templateName, wantsFix) {
  if (userContext.ashenRole !== "owner" && userContext.ashenRole !== "admin") {
    return {
      shouldReply: true,
      reply: "\u274C Setting up server templates requires administrator permissions.",
      executed: false,
      requiresConfirmation: false
    };
  }
  const { TEMPLATES } = await import("../discord/server-builder");
  const template = TEMPLATES[templateName];
  if (!template) {
    return {
      shouldReply: true,
      reply: `\u274C Unknown template: ${templateName}. Available: ${Object.keys(TEMPLATES).join(", ")}`,
      executed: false,
      requiresConfirmation: false
    };
  }
  const serverState = await getCachedServerState(guild, state);
  const classification = classifyResources(serverState, template);
  if (classification.missing.length === 0) {
    return {
      shouldReply: true,
      reply: `\u2705 Your server already matches the "${template.name}" template structure. No changes needed.`,
      executed: false,
      requiresConfirmation: false
    };
  }
  if (!wantsFix) {
    const preview = buildTemplatePreview(templateName, template);
    const reply = [
      preview,
      ""
    ];
    if (classification.existsAndMatches.length > 0) {
      reply.push(`**Preserve:**`);
      reply.push(`\u2022 ${classification.existsAndMatches.length} existing resource${classification.existsAndMatches.length > 1 ? "s" : ""}`);
    }
    if (classification.missing.length > 0) {
      reply.push(`**Skip:**`);
      reply.push(`\u2022 ${classification.missing.length} resource${classification.missing.length > 1 ? "s" : ""} already matching`);
    }
    if (classification.duplicates.length > 0) {
      reply.push("");
      reply.push("**Review:**");
      for (const dup of classification.duplicates) {
        reply.push(`\u2022 ${dup.ids.length} duplicate ${dup.type} "${dup.name}"`);
      }
      reply.push(`\u2022 I won't delete ambiguous duplicates automatically`);
    }
    reply.push("", "Want me to apply this template?");
    const steps2 = [];
    const existingRoles2 = serverState.roles.map((r) => r.name.toLowerCase());
    const existingCategories2 = serverState.categories.map((c) => c.name.toLowerCase());
    const existingChannels2 = serverState.channels.map((c) => c.name.toLowerCase());
    for (const roleData of template.roles) {
      if (!existingRoles2.includes(roleData.name.toLowerCase())) {
        steps2.push({
          toolName: "create_role",
          args: { name: roleData.name, color: roleData.color, hoist: roleData.hoist ?? false },
          description: `Create role "${roleData.name}"`,
          category: "create",
          status: "pending"
        });
      }
    }
    const categoryIdMap2 = /* @__PURE__ */ new Map();
    for (const cat of serverState.categories) {
      categoryIdMap2.set(cat.name.toLowerCase(), cat.id);
    }
    for (const catData of template.categories) {
      const catLower = catData.name.toLowerCase();
      const catId = categoryIdMap2.get(catLower);
      if (!catId) {
        steps2.push({
          toolName: "create_category",
          args: { name: catData.name },
          description: `Create category "${catData.name}"`,
          category: "create",
          status: "pending",
          _catName: catData.name
        });
      }
      for (const chData of catData.channels) {
        if (!existingChannels2.includes(chData.name.toLowerCase())) {
          const chArgs = { name: chData.name, type: chData.type };
          if (catId) chArgs.categoryId = catId;
          steps2.push({
            toolName: "create_channel",
            args: chArgs,
            description: `Create ${chData.type} channel "#${chData.name}" in "${catData.name}"`,
            category: "create",
            status: "pending"
          });
        }
      }
    }
    for (const res of classification.existsAndMatches) {
      steps2.push({ toolName: "preserve", args: {}, description: res, category: "preserve", status: "verified" });
    }
    for (const dup of classification.duplicates) {
      steps2.push({
        toolName: "skip",
        args: {},
        description: `${dup.ids.length} duplicate ${dup.type} "${dup.name}"`,
        category: "skip",
        status: "skipped",
        skipReason: "Ambiguous \u2014 needs your choice to clean up"
      });
    }
    const plan2 = {
      id: `template-preview-${Date.now()}`,
      goal: template.name,
      templateName,
      steps: steps2,
      duplicates: classification.duplicates,
      riskLevel: steps2.filter((s) => s.category === "create").length > 5 ? "low" : "safe",
      createdAt: Date.now(),
      expiresAt: Date.now() + 5 * 60 * 1e3
    };
    state.unifiedPlan = plan2;
    state.pendingConfirmation = {
      planId: plan2.id,
      toolName: "apply_template",
      args: { templateName, templateSteps: steps2.filter((s) => s.category === "create"), template },
      timestamp: Date.now()
    };
    const actionPlan2 = (0, import_executor2.createActionPlan)(
      {
        guildId: guild.id,
        channelId: message.channel.id,
        requesterId: userContext.userId,
        requesterName: userContext.username,
        requesterRole: userContext.ashenRole,
        arguments: { _toolName: "apply_template", templateName, templateSteps: steps2.filter((s) => s.category === "create"), template },
        dryRun: false
      },
      plan2.riskLevel,
      steps2.filter((s) => s.category === "create").map((s) => ({
        type: "create",
        target: s.description,
        description: s.description
      })),
      true
    );
    actionPlan2.toolName = "apply_template";
    actionPlan2.arguments = { templateName, templateSteps: steps2.filter((s) => s.category === "create"), template };
    (0, import_confirmation_store.storePendingPlan)(actionPlan2);
    return {
      shouldReply: true,
      reply: reply.join("\n"),
      executed: false,
      requiresConfirmation: true,
      planId: plan2.id
    };
  }
  const steps = [];
  const existingRoles = serverState.roles.map((r) => r.name.toLowerCase());
  const existingCategories = serverState.categories.map((c) => c.name.toLowerCase());
  const existingChannels = serverState.channels.map((c) => c.name.toLowerCase());
  for (const roleData of template.roles) {
    if (!existingRoles.includes(roleData.name.toLowerCase())) {
      steps.push({
        toolName: "create_role",
        args: { name: roleData.name, color: roleData.color, hoist: roleData.hoist ?? false },
        description: `Create role "${roleData.name}"`,
        category: "create",
        status: "pending"
      });
    }
  }
  const categoryIdMap = /* @__PURE__ */ new Map();
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
        _catName: catData.name
      });
    }
    for (const chData of catData.channels) {
      if (!existingChannels.includes(chData.name.toLowerCase())) {
        const chArgs = { name: chData.name, type: chData.type };
        if (existingCatId) chArgs.categoryId = existingCatId;
        steps.push({
          toolName: "create_channel",
          args: chArgs,
          description: `Create ${chData.type} channel "#${chData.name}" in "${catData.name}"`,
          category: "create",
          status: "pending"
        });
      }
    }
  }
  if (wantsFix) {
    const aiConfig = (0, import_channel_scope.loadGuildAIConfig)(guild.id);
    if (aiConfig.managementRoleIds.length === 0) {
      const modRole = serverState.roles.find((r) => r.name.toLowerCase() === "moderator");
      if (modRole) {
        steps.push({
          toolName: "configure_role_permissions",
          args: { roleId: modRole.id, permissions: ["ManageMessages", "ModerateMembers"] },
          description: "Configure Moderator role with management permissions",
          category: "fix",
          status: "pending"
        });
      }
    }
  }
  for (const res of classification.existsAndMatches) {
    steps.push({ toolName: "preserve", args: {}, description: res, category: "preserve", status: "verified" });
  }
  for (const dup of classification.duplicates) {
    steps.push({
      toolName: "skip",
      args: {},
      description: `${dup.ids.length} duplicate ${dup.type} "${dup.name}"`,
      category: "skip",
      status: "skipped",
      skipReason: "Ambiguous \u2014 needs your choice to clean up"
    });
  }
  let riskLevel = "safe";
  if (steps.some((s) => s.category === "fix")) riskLevel = "medium";
  if (steps.filter((s) => s.category === "create").length > 5) riskLevel = "low";
  const plan = {
    id: `template-${Date.now()}`,
    goal: `${template.name} Setup + Fix`,
    templateName,
    steps,
    duplicates: classification.duplicates,
    riskLevel,
    createdAt: Date.now(),
    expiresAt: Date.now() + 5 * 60 * 1e3
  };
  state.unifiedPlan = plan;
  state.pendingConfirmation = {
    planId: plan.id,
    toolName: "apply_template",
    args: { templateName, templateSteps: steps.filter((s) => s.category === "create" || s.category === "fix"), template },
    timestamp: Date.now()
  };
  const actionPlan = (0, import_executor2.createActionPlan)(
    {
      guildId: guild.id,
      channelId: message.channel.id,
      requesterId: userContext.userId,
      requesterName: userContext.username,
      requesterRole: userContext.ashenRole,
      arguments: { _toolName: "apply_template", templateName, templateSteps: steps.filter((s) => s.category === "create" || s.category === "fix"), template },
      dryRun: false
    },
    riskLevel,
    steps.filter((s) => s.category !== "preserve" && s.category !== "skip").map((s) => ({
      type: s.category === "fix" ? "modify" : "create",
      target: s.description,
      description: s.description
    })),
    true
  );
  actionPlan.toolName = "apply_template";
  actionPlan.arguments = { templateName, templateSteps: steps.filter((s) => s.category === "create" || s.category === "fix"), template };
  (0, import_confirmation_store.storePendingPlan)(actionPlan);
  return {
    shouldReply: true,
    reply: formatUnifiedPlanSummary(plan),
    executed: false,
    requiresConfirmation: true,
    planId: plan.id
  };
}
async function executeUnifiedPlan(state, userContext, guild, message) {
  if (!state.unifiedPlan) {
    return {
      shouldReply: true,
      reply: "No plan to execute.",
      executed: false,
      requiresConfirmation: false
    };
  }
  const plan = state.unifiedPlan;
  const startTime = Date.now();
  const executorOptions = { [import_executor.INTERNAL_SKIP_CONFIRMATION]: true };
  const actionableSteps = plan.steps.filter(
    (s) => s.category === "create" || s.category === "fix" || s.category === "configure"
  );
  const newCategoryIds = /* @__PURE__ */ new Map();
  for (const step of actionableSteps) {
    if (step.status !== "pending") continue;
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
    const result = await (0, import_agent_orchestrator.executeWithFullPipeline)(
      guild,
      userContext,
      step.toolName,
      step.args,
      state.channelId,
      void 0,
      void 0,
      executorOptions
    );
    const stepVerified = await verifyPostAction(guild, step.toolName, step.args, result);
    logVerification(userContext.userId, guild.id, step.toolName, stepVerified.verified);
    if (result.status === "success") {
      step.status = stepVerified.verified ? "verified" : "success";
      step.verified = stepVerified.verified;
      if (step.toolName === "create_category") {
        const catData = result.data;
        const catId = catData?.categoryId;
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
  const hasFailures = actionableSteps.some((s) => s.status === "failed");
  const duration = Date.now() - startTime;
  logExecution(userContext.userId, guild.id, "unified_plan", hasFailures ? "partial" : "success", duration);
  state.unifiedPlan = void 0;
  state.pendingConfirmation = void 0;
  state.lastAction = {
    toolName: "apply_template",
    args: { planId: plan.id },
    planId: plan.id,
    timestamp: Date.now()
  };
  return {
    shouldReply: true,
    reply: formatExecutionReport(plan.steps, hasFailures),
    executed: !hasFailures,
    requiresConfirmation: false
  };
}
async function handleServerModify(guild, userContext, state, message, content, mentionedUserIds) {
  const serverState = await getCachedServerState(guild, state);
  const lower = content.toLowerCase();
  let toolName = "";
  let args = null;
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
  } else if (/\b(create|make|add)\b.*\b(channel|text|voice)\b/i.test(lower) || /\b(create|make|add)\b.*\b(category|group|section)\b/i.test(lower)) {
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
      reply: `I'm not sure what you'd like me to do. Could you be more specific?

Examples:
\u2022 "Create a gaming category"
\u2022 "Make a Moderator role"
\u2022 "Give Moderator permission to manage messages"
\u2022 "Rename #general to #lobby"
\u2022 "Protect the announcements channel"
\u2022 "Set up my server for Minecraft"`,
      executed: false,
      requiresConfirmation: false
    };
  }
  const ambiguity = args._ambiguity;
  if (ambiguity) {
    return {
      shouldReply: true,
      reply: (0, import_resource_resolver.formatAmbiguity)(ambiguity.type, ambiguity.candidates),
      executed: false,
      requiresConfirmation: false
    };
  }
  const execStartTime = Date.now();
  const result = await (0, import_agent_orchestrator.executeWithFullPipeline)(
    guild,
    userContext,
    toolName,
    args,
    message.channel.id
  );
  const execDuration = Date.now() - execStartTime;
  logExecution(userContext.userId, guild.id, toolName, result.status, execDuration);
  if (result.status === "success") {
    const postVerification = await verifyPostAction(guild, toolName, args, result);
    logVerification(userContext.userId, guild.id, toolName, postVerification.verified);
    const undoData = extractUndoData(toolName, args, result);
    if (undoData) {
      (0, import_undo_manager.recordUndo)(
        guild.id,
        userContext.userId,
        toolName,
        result.message || toolName,
        undoData
      );
    }
    state.lastAction = {
      toolName,
      args,
      timestamp: Date.now()
    };
    if (!postVerification.verified) {
      return {
        shouldReply: true,
        reply: `\u26A0\uFE0F Action completed but verification failed: ${postVerification.details}. Please check manually.`,
        executed: false,
        requiresConfirmation: false
      };
    }
    return {
      shouldReply: true,
      reply: buildSuccessResponse(toolName, result),
      executed: true,
      requiresConfirmation: false
    };
  }
  if (result.status === "confirmation_required") {
    const plan = result.plan;
    if (plan) {
      state.pendingConfirmation = {
        planId: plan.id,
        toolName,
        args,
        timestamp: Date.now()
      };
    }
    return {
      shouldReply: true,
      reply: result.message,
      executed: false,
      requiresConfirmation: true,
      planId: plan?.id
    };
  }
  return {
    shouldReply: true,
    reply: buildDenialResponse(result),
    executed: false,
    requiresConfirmation: false
  };
}
async function handleNaturalModeration(guild, userContext, state, message, content, mentionedUserIds, client) {
  const lower = content.toLowerCase();
  let targetUserId;
  let targetUserName;
  const mentioned = mentionedUserIds.find((id) => id !== client.user?.id);
  if (mentioned) {
    targetUserId = mentioned;
    try {
      const member = await guild.members.fetch(mentioned);
      targetUserName = member.user.tag;
    } catch {
      targetUserName = mentioned;
    }
  }
  if (!targetUserId && message.reference?.messageId) {
    try {
      const refMsg = await message.fetchReference();
      if (refMsg && !refMsg.author.bot && refMsg.author.id !== client.user?.id) {
        targetUserId = refMsg.author.id;
        targetUserName = refMsg.author.tag;
      }
    } catch {
    }
  }
  if (!targetUserId) {
    return {
      shouldReply: true,
      reply: "Who would you like me to moderate? Please mention a user or reply to their message.",
      executed: false,
      requiresConfirmation: false
    };
  }
  let toolName = "";
  if (/\b(ban)\b/i.test(lower)) toolName = "ban_user";
  else if (/\b(kick)\b/i.test(lower)) toolName = "kick_user";
  else if (/\b(timeout|mute)\b/i.test(lower)) toolName = "timeout_user";
  else if (/\b(warn|warning)\b/i.test(lower)) toolName = "warn_user";
  else if (/\b(untimeout|unmute)\b/i.test(lower)) toolName = "untimeout_user";
  else if (/\b(purge|delete messages|remove messages)\b/i.test(lower)) toolName = "purge_messages";
  if (!toolName) {
    return {
      shouldReply: true,
      reply: 'What moderation action would you like to take? You can say:\n\u2022 "ban @user"\n\u2022 "timeout @user for 10 minutes"\n\u2022 "warn @user for spam"\n\u2022 "kick @user"',
      executed: false,
      requiresConfirmation: false
    };
  }
  const args = { user_id: targetUserId };
  if (toolName === "timeout_user") {
    const durationMatch = lower.match(/(\d+)\s*(minute|min|hour|hr|day)/i);
    if (durationMatch) {
      const value = parseInt(durationMatch[1], 10);
      const unit = durationMatch[2].toLowerCase();
      if (unit.startsWith("hour") || unit.startsWith("hr")) args.duration = value * 60;
      else if (unit.startsWith("day")) args.duration = value * 60 * 24;
      else args.duration = value;
    } else {
      args.duration = 5;
    }
  }
  const reasonMatch = content.match(/(?:for|reason:?)\s+(.+)/i);
  if (reasonMatch) args.reason = reasonMatch[1].trim();
  else args.reason = `Moderation action by ${userContext.username}`;
  const result = await (0, import_agent_orchestrator.executeWithFullPipeline)(
    guild,
    userContext,
    toolName,
    args,
    message.channel.id
  );
  if (result.status === "success") {
    return {
      shouldReply: true,
      reply: `\u2705 ${toolName.replace(/_/g, " ")} applied to ${targetUserName || targetUserId}.${result.message ? `
${result.message}` : ""}`,
      executed: true,
      requiresConfirmation: false
    };
  }
  if (result.status === "confirmation_required") {
    return {
      shouldReply: true,
      reply: result.message,
      executed: false,
      requiresConfirmation: true,
      planId: result.plan?.id
    };
  }
  return {
    shouldReply: true,
    reply: buildDenialResponse(result),
    executed: false,
    requiresConfirmation: false
  };
}
async function handleSupportTicket(guild, userContext, message) {
  const { loadGuildConfig } = await import("../core/guild-config");
  const config2 = loadGuildConfig(guild.id);
  const supportConfig = config2.support ?? { enabled: false, allowGeneralHelp: true, allowReports: true, allowAppeals: true };
  if (!supportConfig.enabled) {
    return {
      shouldReply: true,
      reply: "Support tickets are not currently enabled on this server. Ask an admin to enable them with `/settings`.",
      executed: false,
      requiresConfirmation: false
    };
  }
  return {
    shouldReply: true,
    reply: "\u{1F3AB} **Support Tickets**\n\nYou can create a ticket using:\n\u2022 `/ticket support` \u2014 General help\n\u2022 `/ticket report` \u2014 Report a user\n\u2022 `/ticket appeal` \u2014 Ban appeal\n\nOr describe your issue and I'll help you directly!",
    executed: false,
    requiresConfirmation: false
  };
}
async function handleSupportReport(guild, userContext, message, content, mentionedUserIds) {
  const { loadGuildConfig } = await import("../core/guild-config");
  const config2 = loadGuildConfig(guild.id);
  const reportsConfig = config2.reports ?? { enabled: false, requireEvidence: false, aiAnalysisEnabled: true, autoEscalateHighRisk: true };
  if (!reportsConfig.enabled) {
    return {
      shouldReply: true,
      reply: "Reports are not currently enabled on this server. Ask an admin to enable them with `/settings`.",
      executed: false,
      requiresConfirmation: false
    };
  }
  let reportedUserId;
  const mentioned = mentionedUserIds.find((id) => id !== message.client.user?.id);
  if (mentioned) {
    reportedUserId = mentioned;
  } else if (message.reference?.messageId) {
    try {
      const refMsg = await message.fetchReference();
      if (refMsg && !refMsg.author.bot) {
        reportedUserId = refMsg.author.id;
      }
    } catch {
    }
  }
  const reportedTag = reportedUserId ? `<@${reportedUserId}>` : "unknown user";
  return {
    shouldReply: true,
    reply: `\u{1F6A8} **Report a User**

Use \`/report\` for a structured report:
\u2022 \`/report user:@${reportedTag} reason:...\`

Or tell me:
\u2022 Who are you reporting?
\u2022 What did they do?
\u2022 Any evidence (message IDs, screenshots)?`,
    executed: false,
    requiresConfirmation: false
  };
}
async function handleSupportAppeal(guild, userContext, message, content) {
  const { loadGuildConfig } = await import("../core/guild-config");
  const config2 = loadGuildConfig(guild.id);
  const appealsConfig = config2.appeals ?? { enabled: false, aiAnalysisEnabled: true };
  if (!appealsConfig.enabled) {
    return {
      shouldReply: true,
      reply: "Appeals are not currently enabled on this server. Ask an admin to enable them with `/settings`.",
      executed: false,
      requiresConfirmation: false
    };
  }
  return {
    shouldReply: true,
    reply: "\u{1F528} **Ban Appeal**\n\nUse `/appeal` to submit a formal appeal:\n\u2022 `/appeal reason:Why your action should be reversed`\n\nPlease include:\n\u2022 What action you're appealing\n\u2022 Why you believe it should be reversed\n\u2022 Any additional context for staff",
    executed: false,
    requiresConfirmation: false
  };
}
async function handleHelp(userContext, guild) {
  const lines = [
    "**\u{1F916} AshenAI Server Assistant**",
    "",
    "I can help you manage your Discord server. Just talk to me naturally!",
    "",
    "**What I can do:**",
    "",
    "\u{1F4CB} **Inspect & Diagnose:**",
    `\u2022 "What's my server setup?"`,
    '\u2022 "Check my server permissions"',
    `\u2022 "What's wrong with my server?"`,
    "",
    "\u{1F527} **Create & Configure:**",
    '\u2022 "Create a gaming category"',
    '\u2022 "Make a Moderator role"',
    '\u2022 "Set up my server for Minecraft"',
    '\u2022 "Generate me a template"',
    "",
    "\u2728 **Templates & Setup:**",
    '\u2022 "Generate a community template" (preview only)',
    '\u2022 "Make my server a gaming server" (applies after confirm)',
    '\u2022 "Generate a template and fix my server" (combined plan)',
    '\u2022 "Make my server better" (inspect + recommend)',
    "",
    "\u{1F464} **Role Management:**",
    '\u2022 "Give Bob the Moderator role"',
    '\u2022 "Remove the old Staff role"',
    '\u2022 "Give Moderator permission to manage messages"',
    "",
    "\u{1F512} **Protection:**",
    '\u2022 "Protect the announcements channel"',
    '\u2022 "List protected resources"',
    "",
    "\u21A9\uFE0F **Undo:**",
    '\u2022 "Undo that" (reverses your last action)',
    "",
    "\u{1F50D} **Preview:**",
    `\u2022 "Show me what you'll change" (preview pending plan)`,
    "",
    "\u{1F3AB} **Support & Reports:**",
    "\u2022 `/ticket` \u2014 Create a support ticket",
    "\u2022 `/report` \u2014 Report a user",
    "\u2022 `/appeal` \u2014 Submit a ban appeal",
    "\u2022 `/case` \u2014 View and manage cases",
    "\u2022 `/settings` \u2014 Configure support systems",
    "",
    "\u{1F6E1}\uFE0F **Moderation (Natural Language):**",
    '\u2022 "ban @user" or reply to a message and say "ban"',
    '\u2022 "timeout @user for 10 minutes"',
    '\u2022 "warn @user for spam"',
    '\u2022 "kick @user"',
    "",
    "**Your role:** " + userContext.ashenRole
  ];
  return {
    shouldReply: true,
    reply: lines.join("\n"),
    executed: false,
    requiresConfirmation: false
  };
}
function extractUndoData(toolName, args, result) {
  const data = result.data;
  switch (toolName) {
    case "create_channel":
      if (data?.channelId) {
        return { type: "delete_channel", targetId: data.channelId, data: {} };
      }
      break;
    case "create_category":
      if (data?.categoryId) {
        return { type: "delete_category", targetId: data.categoryId, data: {} };
      }
      break;
    case "create_role":
      if (data?.roleId) {
        return { type: "delete_role", targetId: data.roleId, data: {} };
      }
      break;
    case "assign_role":
      if (args.userId && args.roleId) {
        return { type: "remove_role", targetId: args.roleId, data: { userId: args.userId, roleId: args.roleId } };
      }
      break;
    case "remove_role":
      if (args.userId && args.roleId) {
        return { type: "assign_role", targetId: args.roleId, data: { userId: args.userId, roleId: args.roleId } };
      }
      break;
    case "rename_channel":
      if (data?.channelId && data?.oldName) {
        return { type: "rename_channel", targetId: data.channelId, data: { oldName: data.oldName } };
      }
      break;
  }
  return null;
}
const cleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [key, state] of conversationStates) {
    if (now - state.lastStateFetchedAt > STATE_TTL_MS) {
      conversationStates.delete(key);
    }
  }
}, 5 * 60 * 1e3);
if (cleanupInterval.unref) cleanupInterval.unref();
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  buildToolArgs,
  classifyIntent,
  handleConversation
});
