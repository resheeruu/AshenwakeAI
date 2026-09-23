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
var interactive_moderation_exports = {};
__export(interactive_moderation_exports, {
  executeInteractiveModeration: () => executeInteractiveModeration
});
module.exports = __toCommonJS(interactive_moderation_exports);
var import_discord = require("discord.js");
var import_moderation = require("./moderation");
var import_warnings = require("./warnings");
var import_audit = require("../security/audit");
async function executeInteractiveModeration(requester, target, botMember, action, durationMinutes, reason = "Interactive moderation action") {
  const requiredPermission = import_discord.PermissionFlagsBits.ModerateMembers;
  if (!(0, import_moderation.canModerate)(requester, requiredPermission)) {
    (0, import_audit.recordAudit)({
      who: requester.id,
      whoName: requester.user.tag,
      what: `Interactive ${action} denied: insufficient permissions`,
      where: "discord",
      guildId: target.guild.id,
      result: "denied"
    });
    return {
      success: false,
      message: "\u274C You don't have permission to perform this moderation action."
    };
  }
  const targetCheck = (0, import_moderation.canTarget)(
    requester,
    target,
    botMember
  );
  if (!targetCheck.allowed) {
    return {
      success: false,
      message: `\u274C ${targetCheck.reason}`
    };
  }
  if (action === "warn") {
    const warning = (0, import_warnings.addWarning)(
      target.guild.id,
      target.id,
      requester.id,
      reason
    );
    (0, import_audit.recordAudit)({
      who: requester.id,
      whoName: requester.user.tag,
      what: `Warned ${target.user.tag}: ${reason}`,
      where: "discord",
      guildId: target.guild.id,
      result: "success"
    });
    return {
      success: true,
      message: `\u26A0\uFE0F **Warning issued**
Member: ${target}
Reason: ${reason}
Warning ID: ${warning.id}`
    };
  }
  if (action === "timeout") {
    if (!durationMinutes || !Number.isFinite(durationMinutes) || durationMinutes < 1 || durationMinutes > 40320) {
      return {
        success: false,
        message: "\u274C Timeout duration must be between 1 minute and 28 days."
      };
    }
    if (!botMember.permissions.has(
      import_discord.PermissionFlagsBits.ModerateMembers
    )) {
      return {
        success: false,
        message: "\u274C I don't have permission to timeout members."
      };
    }
    try {
      await target.timeout(
        durationMinutes * 60 * 1e3,
        reason
      );
      (0, import_audit.recordAudit)({
        who: requester.id,
        whoName: requester.user.tag,
        what: `Timed out ${target.user.tag} for ${durationMinutes}m: ${reason}`,
        where: "discord",
        guildId: target.guild.id,
        result: "success"
      });
      return {
        success: true,
        message: `\u{1F507} **Member timed out**
Member: ${target}
Duration: ${durationMinutes} minute(s)
Reason: ${reason}`
      };
    } catch {
      (0, import_audit.recordAudit)({
        who: requester.id,
        whoName: requester.user.tag,
        what: `Timed out ${target.user.tag} failed: Discord rejected`,
        where: "discord",
        guildId: target.guild.id,
        result: "failure"
      });
      return {
        success: false,
        message: "\u274C Discord rejected the timeout. Check my role position and permissions."
      };
    }
  }
  return {
    success: false,
    message: "\u274C This interactive moderation action is not supported yet."
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  executeInteractiveModeration
});
