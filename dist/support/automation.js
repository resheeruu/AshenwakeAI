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
var automation_exports = {};
__export(automation_exports, {
  startSupportAutomation: () => startSupportAutomation,
  stopSupportAutomation: () => stopSupportAutomation
});
module.exports = __toCommonJS(automation_exports);
var import_logger = require("../logger");
var import_guild_config = require("../core/guild-config");
var import_case_manager = require("./case-manager");
const DEFAULT_CONFIG = {
  staleCaseHours: 48,
  reminderIntervalHours: 24,
  autoCloseDays: 7,
  autoEscalateDays: 3,
  enabled: true
};
let automationInterval = null;
const REMINDER_COOLDOWN = /* @__PURE__ */ new Map();
function pruneReminderCooldown(intervalMs) {
  const now = Date.now();
  for (const [caseId, ts] of REMINDER_COOLDOWN) {
    if (now - ts > intervalMs * 2) {
      REMINDER_COOLDOWN.delete(caseId);
    }
  }
}
function findStaleCases(allCases, config) {
  const now = Date.now();
  const staleThreshold = config.staleCaseHours * 60 * 60 * 1e3;
  return allCases.filter((c) => {
    if (c.status === "closed" || c.status === "resolved") return false;
    const lastActivity = Math.max(c.updatedAt, c.createdAt);
    return now - lastActivity > staleThreshold;
  });
}
function shouldSendReminder(aiCase, config) {
  if (aiCase.status === "closed" || aiCase.status === "resolved") return false;
  if (aiCase.status !== "waiting_user" && aiCase.status !== "waiting_staff") return false;
  const now = Date.now();
  const cooldownMs = config.reminderIntervalHours * 60 * 60 * 1e3;
  const lastReminder = REMINDER_COOLDOWN.get(aiCase.id) ?? 0;
  return now - lastReminder > cooldownMs;
}
function markReminderSent(caseId) {
  REMINDER_COOLDOWN.set(caseId, Date.now());
}
function findEscalationCandidates(allCases, config) {
  const now = Date.now();
  const threshold = config.autoEscalateDays * 24 * 60 * 60 * 1e3;
  return allCases.filter((c) => {
    if (c.status === "closed" || c.status === "resolved" || c.status === "escalated") return false;
    const lastActivity = Math.max(c.updatedAt, c.createdAt);
    return now - lastActivity > threshold;
  });
}
function findAutoCloseCandidates(allCases, config) {
  const now = Date.now();
  const threshold = config.autoCloseDays * 24 * 60 * 60 * 1e3;
  return allCases.filter((c) => {
    if (c.status !== "resolved") return false;
    return c.updatedAt && now - c.updatedAt > threshold;
  });
}
async function sendStaleReminder(client, aiCase, reason) {
  try {
    const guild = client.guilds.cache.get(aiCase.guildId);
    if (!guild) return;
    const channel = guild.channels.cache.get(aiCase.channelId);
    if (!channel || !channel.isTextBased()) return;
    const typeName = aiCase.type === "report" ? "Report" : aiCase.type === "appeal" ? "Appeal" : "Support";
    const mention = aiCase.status === "waiting_user" ? `<@${aiCase.creatorId}>` : aiCase.assignedStaffId ? `<@${aiCase.assignedStaffId}>` : "";
    const embed = {
      title: `\u23F0 ${typeName} Case \u2014 ${reason}`,
      description: `Case \`${aiCase.id}\` has been ${reason}.

${aiCase.status === "waiting_user" ? "We're waiting for your response. Please provide the requested information." : "This case needs staff attention. Please review and take action."}`,
      color: 16096779,
      fields: [
        { name: "Status", value: aiCase.status, inline: true },
        { name: "Creator", value: `<@${aiCase.creatorId}>`, inline: true }
      ],
      footer: { text: `Case ID: ${aiCase.id}` },
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    };
    await channel.send({
      content: mention || void 0,
      embeds: [embed]
    }).catch(() => {
    });
    markReminderSent(aiCase.id);
  } catch (error) {
    import_logger.logger.warn(`Failed to send stale reminder for case ${aiCase.id}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
async function sendAutoEscalation(client, aiCase) {
  try {
    const config = (0, import_guild_config.loadGuildConfig)(aiCase.guildId);
    const logChannelId = config.supportLogging?.channelId || config.logChannelId;
    if (!logChannelId) return;
    const guild = client.guilds.cache.get(aiCase.guildId);
    if (!guild) return;
    const logChannel = guild.channels.cache.get(logChannelId);
    if (!logChannel || !logChannel.isTextBased()) return;
    const staffMentions = (config.staff?.roleIds ?? []).map((id) => `<@&${id}>`).join(" ");
    const typeName = aiCase.type === "report" ? "Report" : aiCase.type === "appeal" ? "Appeal" : "Support";
    await logChannel.send({
      content: staffMentions ? `\u26A1 **Auto-Escalation** ${staffMentions}` : "\u26A1 **Auto-Escalation**",
      embeds: [{
        title: `${typeName} Case \u2014 Auto-Escalated`,
        description: `Case \`${aiCase.id}\` has been inactive for too long and is being auto-escalated for staff review.`,
        color: 15680580,
        fields: [
          { name: "Status", value: aiCase.status, inline: true },
          { name: "Creator", value: `<@${aiCase.creatorId}>`, inline: true },
          { name: "Channel", value: `<#${aiCase.channelId}>`, inline: true }
        ],
        footer: { text: `Case ID: ${aiCase.id}` },
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      }]
    }).catch(() => {
    });
  } catch (error) {
    import_logger.logger.warn(`Failed to send auto-escalation for case ${aiCase.id}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
async function sendAutoClose(client, aiCase) {
  try {
    const caseManager = (0, import_case_manager.getSupportCaseManager)();
    caseManager.transitionCase(aiCase.id, "closed", "system");
    const guild = client.guilds.cache.get(aiCase.guildId);
    if (!guild) return;
    const channel = guild.channels.cache.get(aiCase.channelId);
    if (!channel || !channel.isTextBased()) return;
    await channel.send({
      embeds: [{
        title: "\u2705 Case Auto-Closed",
        description: `This case has been automatically closed after ${DEFAULT_CONFIG.autoCloseDays} days of inactivity. If you need further assistance, please create a new ticket.`,
        color: 2278750,
        footer: { text: `Case ID: ${aiCase.id}` },
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      }]
    }).catch(() => {
    });
  } catch (error) {
    import_logger.logger.warn(`Failed to auto-close case ${aiCase.id}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
async function runAutomationTick(client) {
  try {
    pruneReminderCooldown(DEFAULT_CONFIG.reminderIntervalHours * 60 * 60 * 1e3);
    const caseManager = (0, import_case_manager.getSupportCaseManager)();
    const allCases = [];
    for (const [, guild] of client.guilds.cache) {
      const guildCases = caseManager.getGuildCases(guild.id);
      allCases.push(...guildCases);
    }
    if (allCases.length === 0) return;
    const activeCases = allCases.filter((c) => c.status !== "closed");
    const staleCases = findStaleCases(activeCases, DEFAULT_CONFIG);
    for (const c of staleCases) {
      const reason = c.status === "waiting_user" || c.status === "waiting_staff" ? "awaiting response" : "inactive";
      await sendStaleReminder(client, c, reason);
    }
    const escalationCandidates = findEscalationCandidates(activeCases, DEFAULT_CONFIG);
    for (const c of escalationCandidates) {
      await sendAutoEscalation(client, c);
    }
    const closeCandidates = findAutoCloseCandidates(allCases, DEFAULT_CONFIG);
    for (const c of closeCandidates) {
      await sendAutoClose(client, c);
    }
    if (staleCases.length > 0 || escalationCandidates.length > 0 || closeCandidates.length > 0) {
      import_logger.logger.info(`\u{1F3AB} Support automation: ${staleCases.length} stale, ${escalationCandidates.length} escalated, ${closeCandidates.length} closed`);
    }
  } catch (error) {
    import_logger.logger.error(`Support automation tick failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}
function startSupportAutomation(client) {
  if (automationInterval) return;
  automationInterval = setInterval(() => {
    runAutomationTick(client).catch(() => {
    });
  }, 30 * 60 * 1e3);
  if (automationInterval && typeof automationInterval === "object" && "unref" in automationInterval) {
    automationInterval.unref();
  }
  setTimeout(() => {
    runAutomationTick(client).catch(() => {
    });
  }, 6e4);
  import_logger.logger.info("\u{1F3AB} Support automation started (interval: 30min)");
}
function stopSupportAutomation() {
  if (automationInterval) {
    clearInterval(automationInterval);
    automationInterval = null;
  }
  REMINDER_COOLDOWN.clear();
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  startSupportAutomation,
  stopSupportAutomation
});
