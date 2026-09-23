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
var server_actions_exports = {};
__export(server_actions_exports, {
  canManageServer: () => canManageServer,
  getMemberSummary: () => getMemberSummary,
  getServerSummary: () => getServerSummary
});
module.exports = __toCommonJS(server_actions_exports);
var import_discord = require("discord.js");
function canManageServer(member) {
  if (!member) return false;
  return member.permissions.has(import_discord.PermissionFlagsBits.Administrator) || member.permissions.has(import_discord.PermissionFlagsBits.ManageGuild);
}
function getServerSummary(guild) {
  return [
    `Server: ${guild.name}`,
    `Server ID: ${guild.id}`,
    `Members: ${guild.memberCount}`,
    `Roles: ${guild.roles.cache.size}`,
    `Channels: ${guild.channels.cache.size}`
  ].join("\n");
}
function getMemberSummary(member) {
  const roles = member.roles.cache.filter((role) => role.id !== member.guild.id).map((role) => role.name).slice(0, 20);
  return [
    `User: ${member.user.tag}`,
    `User ID: ${member.id}`,
    `Roles: ${roles.length ? roles.join(", ") : "none"}`,
    `Administrator: ${member.permissions.has(import_discord.PermissionFlagsBits.Administrator) ? "yes" : "no"}`,
    `Manage Server: ${member.permissions.has(import_discord.PermissionFlagsBits.ManageGuild) ? "yes" : "no"}`
  ].join("\n");
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  canManageServer,
  getMemberSummary,
  getServerSummary
});
