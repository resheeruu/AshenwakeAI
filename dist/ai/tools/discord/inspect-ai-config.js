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
var inspect_ai_config_exports = {};
__export(inspect_ai_config_exports, {
  createInspectAIConfigTool: () => createInspectAIConfigTool
});
module.exports = __toCommonJS(inspect_ai_config_exports);
var import_channel_scope = require("../channel-scope");
function createInspectAIConfigTool() {
  return {
    name: "inspect_ai_config",
    description: "Show the AI configuration for this guild: enabled, scopes, roles, version.",
    category: "discord",
    requiredRole: "member",
    requiredDiscordPermissions: [],
    allowedScopes: ["AI_CHAT", "AI_MANAGEMENT"],
    confirmationRequired: false,
    riskLevel: "low",
    parameters: [],
    execute: async (context) => {
      try {
        const aiConfig = (0, import_channel_scope.loadGuildAIConfig)(context.guildId);
        const channelList = Object.entries(aiConfig.channelScopes).map(([channelId, scopes]) => ({
          channelId,
          channelName: null,
          scopes
        }));
        const configInfo = {
          enabled: aiConfig.enabled,
          managementEnabled: aiConfig.managementEnabled,
          channelScopes: aiConfig.channelScopes,
          managementRoleCount: aiConfig.managementRoleIds.length,
          chatRoleCount: aiConfig.chatRoleIds.length,
          version: aiConfig.version
        };
        const lines = [
          "\u2699\uFE0F **AI Configuration**",
          "",
          `**Enabled:** ${configInfo.enabled ? "\u2705 Yes" : "\u274C No"}`,
          `**Management Enabled:** ${configInfo.managementEnabled ? "\u2705 Yes" : "\u274C No"}`,
          `**Config Version:** ${configInfo.version}`,
          "",
          "**Channel Scopes:**"
        ];
        if (channelList.length === 0) {
          lines.push("  No channels configured.");
        } else {
          for (const ch of channelList) {
            lines.push(`  \u2022 <#${ch.channelId}> \u2192 ${ch.scopes.join(", ")}`);
          }
        }
        lines.push("");
        lines.push(`**Management Roles:** ${aiConfig.managementRoleIds.length > 0 ? aiConfig.managementRoleIds.map((id) => `<@&${id}>`).join(", ") : "None configured"}`);
        lines.push(`**Chat Roles:** ${aiConfig.chatRoleIds.length > 0 ? aiConfig.chatRoleIds.map((id) => `<@&${id}>`).join(", ") : "None configured"}`);
        return {
          status: "success",
          message: lines.join("\n"),
          data: configInfo
        };
      } catch (error) {
        return {
          status: "error",
          message: `Failed to inspect AI config. The issue has been logged.`
        };
      }
    }
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  createInspectAIConfigTool
});
