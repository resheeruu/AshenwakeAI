"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
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
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var support_channel_exports = {};
__export(support_channel_exports, {
  destroySupportChannelHandler: () => destroySupportChannelHandler,
  handleSupportChannelMessage: () => handleSupportChannelMessage,
  initializeSupportChannelHandler: () => initializeSupportChannelHandler
});
module.exports = __toCommonJS(support_channel_exports);
var import_logger = require("../logger");
var import_guild_config = require("../core/guild-config");
var import_case_manager = require("../support/case-manager");
var import_ai_orchestrator = require("../support/ai-orchestrator");
const channelCaseCache = /* @__PURE__ */ new Map();
const CACHE_TTL_MS = 5 * 60 * 1e3;
function getCachedCaseForChannel(channelId) {
  const cached = channelCaseCache.get(channelId);
  if (!cached) return null;
  if (Date.now() > cached.expiresAt) {
    channelCaseCache.delete(channelId);
    return null;
  }
  return { caseId: cached.caseId, guildId: cached.guildId };
}
function setCachedCaseForChannel(channelId, caseId, guildId) {
  channelCaseCache.set(channelId, {
    caseId,
    guildId,
    expiresAt: Date.now() + CACHE_TTL_MS
  });
}
const escalationNotifiedCases = /* @__PURE__ */ new Map();
const ESCALATION_NOTIFICATION_TTL_MS = 60 * 60 * 1e3;
function wasEscalationNotified(caseId) {
  const ts = escalationNotifiedCases.get(caseId);
  if (!ts) return false;
  if (Date.now() - ts > ESCALATION_NOTIFICATION_TTL_MS) {
    escalationNotifiedCases.delete(caseId);
    return false;
  }
  return true;
}
function markEscalationNotified(caseId) {
  escalationNotifiedCases.set(caseId, Date.now());
}
function findCaseForChannel(channelId) {
  const cached = getCachedCaseForChannel(channelId);
  if (cached) {
    const caseManager2 = (0, import_case_manager.getSupportCaseManager)();
    return caseManager2.getCase(cached.caseId);
  }
  const caseManager = (0, import_case_manager.getSupportCaseManager)();
  const cases = caseManager.getChannelCases(channelId);
  const activeCase = cases.find(
    (c) => c.status !== "closed" && c.status !== "resolved"
  ) || cases[0];
  if (activeCase) {
    setCachedCaseForChannel(channelId, activeCase.id, activeCase.guildId);
    return activeCase;
  }
  return null;
}
function isSupportChannel(channelId, guildId) {
  const config = (0, import_guild_config.loadGuildConfig)(guildId);
  const supportConfig = config.support;
  const cached = getCachedCaseForChannel(channelId);
  if (cached) return true;
  if (supportConfig?.channelId === channelId) return true;
  if (supportConfig?.categoryId) {
  }
  const caseManager = (0, import_case_manager.getSupportCaseManager)();
  const cases = caseManager.getChannelCases(channelId);
  return cases.length > 0;
}
function checkStaffRole(userId, guildId, client) {
  const staffRoleIds = getStaffRoleIds(guildId);
  if (staffRoleIds.length === 0) return false;
  try {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return false;
    const member = guild.members.cache.get(userId);
    if (!member) return false;
    return member.roles.cache.some((role) => staffRoleIds.includes(role.id));
  } catch {
    return false;
  }
}
function getStaffRoleIds(guildId) {
  const config = (0, import_guild_config.loadGuildConfig)(guildId);
  return config.staff?.roleIds ?? [];
}
async function handleSupportChannelMessage(client, message) {
  if (message.author.bot) return false;
  const channelId = message.channel.id;
  const guildId = message.guild?.id;
  if (!guildId) return false;
  const aiCase = findCaseForChannel(channelId);
  if (!aiCase) return false;
  if (aiCase.guildId !== guildId) return false;
  if (aiCase.status === "closed") {
    try {
      await message.reply("This case has been closed. If you need further assistance, please create a new ticket.");
    } catch {
    }
    return true;
  }
  const mentionedUserIds = message.mentions.users.filter((u) => u.id !== client.user?.id).map((u) => u.id);
  const userName = message.author.tag;
  const isStaff = checkStaffRole(message.author.id, guildId, client);
  try {
    const result = await (0, import_ai_orchestrator.orchestrateCaseConversation)(
      aiCase.id,
      channelId,
      message.author.id,
      userName,
      message.content,
      guildId,
      mentionedUserIds,
      {
        isStaff,
        discordMessageId: message.id
      }
    );
    if (!result.shouldReply) return false;
    try {
      await message.reply(result.reply);
    } catch (error) {
      import_logger.logger.warn(`Failed to reply in support channel ${channelId}: ${error instanceof Error ? error.message : String(error)}`);
      try {
        const channel = message.channel;
        if (channel.send) {
          await channel.send(result.reply);
        }
      } catch {
      }
    }
    if (result.escalateToStaff && !wasEscalationNotified(aiCase.id)) {
      await notifyStaffOfEscalation(client, aiCase, guildId, result.reply);
      markEscalationNotified(aiCase.id);
    }
    return true;
  } catch (error) {
    import_logger.logger.error(`Error in support channel handler: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}
async function notifyStaffOfEscalation(client, aiCase, guildId, summary) {
  try {
    const config = (0, import_guild_config.loadGuildConfig)(guildId);
    const logChannelId = config.supportLogging?.channelId || config.logChannelId;
    if (!logChannelId) return;
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return;
    const logChannel = guild.channels.cache.get(logChannelId);
    if (!logChannel || !logChannel.isTextBased()) return;
    const typeEmoji = aiCase.type === "report" ? "\u{1F6A8}" : aiCase.type === "appeal" ? "\u{1F528}" : "\u{1F3AB}";
    const typeName = aiCase.type === "report" ? "Report" : aiCase.type === "appeal" ? "Appeal" : "Support";
    const staffMentions = (config.staff?.roleIds ?? []).map((id) => `<@&${id}>`).join(" ");
    const embed = {
      title: `${typeEmoji} ${typeName} Case \u2014 ${aiCase.id}`,
      description: summary.substring(0, 2e3),
      color: aiCase.type === "report" ? 15680580 : aiCase.type === "appeal" ? 16096779 : 3900150,
      fields: [
        { name: "Status", value: aiCase.status, inline: true },
        { name: "Creator", value: `<@${aiCase.creatorId}>`, inline: true },
        { name: "Channel", value: `<#${aiCase.channelId}>`, inline: true }
      ],
      footer: { text: `Case ID: ${aiCase.id}` },
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    };
    const content = staffMentions ? `\u26A1 **Escalation** ${staffMentions}` : "\u26A1 **Case Escalation**";
    await logChannel.send({
      content,
      embeds: [embed]
    }).catch(() => {
    });
    const caseManager = (0, import_case_manager.getSupportCaseManager)();
    caseManager.addMessage(aiCase.id, "system", `Case escalated to staff. Notified: ${logChannelId}`, true);
  } catch (error) {
    import_logger.logger.warn(`Failed to notify staff of escalation: ${error instanceof Error ? error.message : String(error)}`);
  }
}
function initializeSupportChannelHandler() {
  (0, import_ai_orchestrator.startConversationCleanup)();
  import_logger.logger.info("\u{1F3AB} Support channel handler initialized");
}
function destroySupportChannelHandler() {
  (0, import_ai_orchestrator.stopConversationCleanup)();
  channelCaseCache.clear();
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  destroySupportChannelHandler,
  handleSupportChannelMessage,
  initializeSupportChannelHandler
});
