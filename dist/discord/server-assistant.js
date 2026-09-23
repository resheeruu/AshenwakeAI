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
var server_assistant_exports = {};
__export(server_assistant_exports, {
  buildServerAssistantEmbed: () => buildServerAssistantEmbed,
  executeServerAction: () => executeServerAction,
  parseServerIntent: () => parseServerIntent
});
module.exports = __toCommonJS(server_assistant_exports);
var import_discord = require("discord.js");
var import_guild_config = require("../core/guild-config");
var import_risk_engine = require("../security/risk-engine");
var import_audit = require("../security/audit");
var import_permissions = require("../security/permissions");
var import_env = require("../config/env");
function parseServerIntent(content) {
  const lower = content.toLowerCase();
  if (/\b(create|make|add)\b.*\b(channel|text|voice)\b/.test(lower)) {
    const nameMatch = content.match(/(?:channel|text|voice)\s+(?:called|named|channel)?\s*[`"']?(\S+)[`"']?/i);
    return {
      intent: "create_channel",
      action: "channel_create",
      target: nameMatch?.[1] || "new-channel",
      riskLevel: "medium",
      requiresConfirmation: true
    };
  }
  if (/\b(create|make|add)\b.*\b(category|group|section)\b/.test(lower)) {
    const nameMatch = content.match(/(?:category|group|section)\s+(?:called|named)?\s*[`"']?(\S+)[`"']?/i);
    return {
      intent: "create_category",
      action: "channel_create",
      target: nameMatch?.[1] || "new-category",
      riskLevel: "medium",
      requiresConfirmation: true
    };
  }
  if (/\b(create|make|add)\b.*\b(role)\b/.test(lower)) {
    const nameMatch = content.match(/role\s+(?:called|named)?\s*[`"']?(\S+)[`"']?/i);
    return {
      intent: "create_role",
      action: "role_create",
      target: nameMatch?.[1] || "new-role",
      riskLevel: "medium",
      requiresConfirmation: true
    };
  }
  if (/\b(delete|remove|destroy)\b.*\b(channel)\b/.test(lower)) {
    return {
      intent: "delete_channel",
      action: "channel_delete",
      riskLevel: "critical",
      requiresConfirmation: true
    };
  }
  if (/\b(lock|lockdown)\b/.test(lower)) {
    return {
      intent: "lock_channel",
      action: "lock",
      riskLevel: "medium",
      requiresConfirmation: true
    };
  }
  if (/\b(unlock)\b/.test(lower)) {
    return {
      intent: "unlock_channel",
      action: "unlock",
      riskLevel: "low",
      requiresConfirmation: false
    };
  }
  if (/\b(set\s*up|configure|setup)\b.*\b(ticket|support)\b/.test(lower)) {
    return {
      intent: "setup_tickets",
      action: "ticket_manage",
      riskLevel: "medium",
      requiresConfirmation: true
    };
  }
  if (/\b(recommend|suggest|structure|organize)\b/.test(lower)) {
    return {
      intent: "recommend_structure",
      action: "none",
      riskLevel: "safe",
      requiresConfirmation: false
    };
  }
  return null;
}
async function executeServerAction(guild, action, executorId, executorName) {
  const role = (0, import_permissions.resolveRole)({
    userId: executorId,
    guildOwnerId: guild.ownerId,
    adminIds: import_env.config.admin.discordIds
  });
  const perm = (0, import_permissions.hasPermission)(role, "admin");
  if (!perm.allowed) {
    return { success: false, message: `\u274C Permission denied: ${perm.reason}` };
  }
  const config = (0, import_guild_config.loadGuildConfig)(guild.id);
  const risk = (0, import_risk_engine.assessRisk)(action.action, action.target, false);
  if (risk.level === "critical") {
    return {
      success: false,
      message: `\u26A0\uFE0F This action requires explicit confirmation. Risk level: ${risk.level}. Reason: ${risk.reason}`
    };
  }
  try {
    switch (action.action) {
      case "channel_create": {
        const channel = await guild.channels.create({
          name: action.target || "new-channel",
          type: import_discord.ChannelType.GuildText
        });
        (0, import_audit.recordAudit)({
          who: executorId,
          whoName: executorName,
          what: `Created channel #${channel.name}`,
          where: "discord",
          guildId: guild.id,
          result: "success"
        });
        return { success: true, message: `\u2705 Created channel <#${channel.id}>.` };
      }
      case "role_create": {
        const role2 = await guild.roles.create({
          name: action.target || "new-role",
          reason: `Created by ${executorName} via Server Assistant`
        });
        (0, import_audit.recordAudit)({
          who: executorId,
          whoName: executorName,
          what: `Created role @${role2.name}`,
          where: "discord",
          guildId: guild.id,
          result: "success"
        });
        return { success: true, message: `\u2705 Created role <@&${role2.id}>.` };
      }
      case "lock": {
        const channel = guild.channels.cache.get(config.assistantChannelId || guild.systemChannelId || "");
        if (channel && "permissionOverwrites" in channel) {
          await channel.permissionOverwrites.edit(guild.id, {
            SendMessages: false
          });
          (0, import_audit.recordAudit)({
            who: executorId,
            whoName: executorName,
            what: `Locked channel #${channel.name}`,
            where: "discord",
            guildId: guild.id,
            result: "success"
          });
          return { success: true, message: `\u{1F512} Locked <#${channel.id}>.` };
        }
        return { success: false, message: "\u274C Could not find a channel to lock." };
      }
      case "unlock": {
        const channel = guild.channels.cache.get(config.assistantChannelId || guild.systemChannelId || "");
        if (channel && "permissionOverwrites" in channel) {
          await channel.permissionOverwrites.edit(guild.id, {
            SendMessages: null
          });
          (0, import_audit.recordAudit)({
            who: executorId,
            whoName: executorName,
            what: `Unlocked channel #${channel.name}`,
            where: "discord",
            guildId: guild.id,
            result: "success"
          });
          return { success: true, message: `\u{1F513} Unlocked <#${channel.id}>.` };
        }
        return { success: false, message: "\u274C Could not find a channel to unlock." };
      }
      default:
        return { success: false, message: `\u274C Unknown action: ${action.action}` };
    }
  } catch (error) {
    (0, import_audit.recordAudit)({
      who: executorId,
      whoName: executorName,
      what: `Failed: ${action.action}`,
      where: "discord",
      guildId: guild.id,
      result: "failure",
      details: error instanceof Error ? error.message : String(error)
    });
    return {
      success: false,
      message: `\u274C Failed to execute ${action.action}.`
    };
  }
}
function buildServerAssistantEmbed(action) {
  return new import_discord.EmbedBuilder().setTitle("\u{1F6E0}\uFE0F Server Assistant").setDescription(`I detected a server management intent: **${action.intent}**`).addFields(
    { name: "Action", value: action.action, inline: true },
    { name: "Target", value: action.target || "N/A", inline: true },
    { name: "Risk Level", value: action.riskLevel, inline: true }
  ).setColor(action.riskLevel === "critical" ? 16711680 : action.riskLevel === "medium" ? 16755200 : 43520).setTimestamp();
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  buildServerAssistantEmbed,
  executeServerAction,
  parseServerIntent
});
