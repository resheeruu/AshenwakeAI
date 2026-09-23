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
var inspect_roles_exports = {};
__export(inspect_roles_exports, {
  createInspectRolesTool: () => createInspectRolesTool
});
module.exports = __toCommonJS(inspect_roles_exports);
function createInspectRolesTool(getClient) {
  return {
    name: "inspect_roles",
    description: "Return a structured overview of all roles in the current server.",
    category: "discord",
    requiredRole: "member",
    requiredDiscordPermissions: [],
    allowedScopes: ["AI_CHAT", "AI_MANAGEMENT"],
    confirmationRequired: false,
    riskLevel: "low",
    parameters: [],
    execute: async (context) => {
      const client = getClient();
      if (!client) {
        return { status: "error", message: "Discord client is not connected." };
      }
      const guild = await client.guilds.fetch(context.guildId).catch(() => null);
      if (!guild) {
        return { status: "denied", message: "Could not fetch guild.", denialReason: "GUILD_ONLY" };
      }
      try {
        const roles = await guild.roles.fetch();
        const sorted = [...roles.values()].filter((r) => r.id !== guild.id).sort((a, b) => b.position - a.position);
        const lines = [
          `\u{1F4CB} **Roles in ${guild.name}** (${sorted.length})`,
          ""
        ];
        for (const role of sorted.slice(0, 30)) {
          const memberCount = role.members.size;
          const flags = [];
          if (role.hoist) flags.push("hoist");
          if (role.mentionable) flags.push("mentionable");
          if (role.managed) flags.push("managed");
          lines.push(
            `**${role.name}** \u2014 ${memberCount} members, color: ${role.hexColor}${flags.length ? ` (${flags.join(", ")})` : ""}`
          );
        }
        if (sorted.length > 30) {
          lines.push(`
... and ${sorted.length - 30} more roles.`);
        }
        return {
          status: "success",
          message: lines.join("\n"),
          data: {
            roles: sorted.map((r) => ({
              id: r.id,
              name: r.name,
              color: r.hexColor,
              position: r.position,
              hoist: r.hoist,
              mentionable: r.mentionable,
              managed: r.managed,
              memberCount: r.members.size
            }))
          }
        };
      } catch (error) {
        return { status: "error", message: "Failed to inspect roles. The issue has been logged." };
      }
    }
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  createInspectRolesTool
});
