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
var view_warnings_exports = {};
__export(view_warnings_exports, {
  createViewWarningsTool: () => createViewWarningsTool
});
module.exports = __toCommonJS(view_warnings_exports);
var import_warnings = require("../../../../discord/warnings");
function createViewWarningsTool(getClient) {
  return {
    name: "view_warnings",
    description: "View the warning history for a member in this server.",
    category: "discord",
    requiredRole: "moderator",
    requiredDiscordPermissions: [],
    allowedScopes: ["AI_MANAGEMENT"],
    confirmationRequired: false,
    riskLevel: "low",
    parameters: [
      {
        name: "userId",
        type: "string",
        description: "ID of the user to check",
        required: true
      }
    ],
    execute: async (context) => {
      const client = getClient();
      if (!client) {
        return { status: "error", message: "Discord client is not connected." };
      }
      const guild = await client.guilds.fetch(context.guildId).catch(() => null);
      if (!guild) {
        return { status: "denied", message: "Could not fetch guild.", denialReason: "GUILD_ONLY" };
      }
      const userId = String(context.arguments.userId || "").trim();
      if (!userId) {
        return { status: "validation_error", message: "Missing required parameter: userId" };
      }
      const target = await guild.members.fetch(userId).catch(() => null);
      if (!target) {
        return { status: "validation_error", message: `User "${userId}" not found in this server.` };
      }
      const warnings = (0, import_warnings.getWarnings)(context.guildId, userId);
      if (warnings.length === 0) {
        return {
          status: "success",
          message: `\u{1F4CB} **Warnings for ${target.user.tag}**

No warnings found.`,
          data: { userId, warnings: [] }
        };
      }
      const lines = [
        `\u{1F4CB} **Warnings for ${target.user.tag}**`,
        `**Total:** ${warnings.length}`,
        ""
      ];
      for (const w of warnings) {
        lines.push(`\u2022 **${w.id}** \u2014 ${w.reason} (<@${w.moderatorId}>, ${w.createdAt})`);
      }
      return {
        status: "success",
        message: lines.join("\n"),
        data: { userId, warnings }
      };
    }
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  createViewWarningsTool
});
