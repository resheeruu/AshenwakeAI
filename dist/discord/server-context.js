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
var server_context_exports = {};
__export(server_context_exports, {
  getServerContext: () => getServerContext
});
module.exports = __toCommonJS(server_context_exports);
var import_discord = require("discord.js");
function getServerContext(message, targetMember) {
  if (!message.guild) {
    return "This conversation is happening in a direct message.";
  }
  const guild = message.guild;
  const member = message.member;
  const lines = [
    `Server: ${guild.name}`,
    `Server ID: ${guild.id}`,
    `Channel: ${message.channel.isDMBased() ? "DM" : message.channel.id}`
  ];
  if (member) {
    lines.push(
      `Requester: ${member.user.tag}`,
      `Requester ID: ${member.id}`,
      `Requester administrator: ${member.permissions.has(import_discord.PermissionFlagsBits.Administrator) ? "yes" : "no"}`,
      `Requester manage server: ${member.permissions.has(import_discord.PermissionFlagsBits.ManageGuild) ? "yes" : "no"}`,
      `Requester manage messages: ${member.permissions.has(import_discord.PermissionFlagsBits.ManageMessages) ? "yes" : "no"}`
    );
  }
  if (targetMember) {
    const roles = targetMember.roles.cache.filter((role) => role.id !== guild.id).map((role) => role.name).slice(0, 20);
    lines.push(
      `Mentioned user: ${targetMember.user.tag}`,
      `Mentioned user ID: ${targetMember.id}`,
      `Mentioned user roles: ${roles.length ? roles.join(", ") : "none"}`
    );
  }
  return lines.join("\n");
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  getServerContext
});
