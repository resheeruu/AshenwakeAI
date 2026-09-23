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
var moderation_exports = {};
__export(moderation_exports, {
  canModerate: () => canModerate,
  canTarget: () => canTarget
});
module.exports = __toCommonJS(moderation_exports);
var import_discord = require("discord.js");
function canModerate(requester, requiredPermission) {
  return requester.permissions.has(
    import_discord.PermissionFlagsBits.Administrator
  ) || requester.permissions.has(requiredPermission);
}
function canTarget(requester, target, botMember) {
  if (target.id === requester.id) {
    return {
      allowed: false,
      reason: "You cannot use this action on yourself."
    };
  }
  if (target.id === botMember.id) {
    return {
      allowed: false,
      reason: "I cannot moderate myself."
    };
  }
  if (target.id === target.guild.ownerId) {
    return {
      allowed: false,
      reason: "The server owner cannot be moderated by this system."
    };
  }
  if (target.roles.highest.position >= requester.roles.highest.position) {
    return {
      allowed: false,
      reason: "Your highest role must be above the target's highest role."
    };
  }
  if (target.roles.highest.position >= botMember.roles.highest.position) {
    return {
      allowed: false,
      reason: "My highest role must be above the target's highest role."
    };
  }
  return { allowed: true };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  canModerate,
  canTarget
});
