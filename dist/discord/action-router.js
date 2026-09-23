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
var action_router_exports = {};
__export(action_router_exports, {
  detectActionIntent: () => detectActionIntent
});
module.exports = __toCommonJS(action_router_exports);
function extractReason(text, durationMatch) {
  let reason = "";
  if (durationMatch) {
    const afterDuration = text.slice(
      (durationMatch.index ?? 0) + durationMatch[0].length
    );
    reason = afterDuration.replace(/^\s*(?:for|because|reason:?)\s*/i, "").trim();
  } else {
    const reasonMatch = text.match(
      /\b(?:for|because|reason:?)\s+(.+)$/i
    );
    if (reasonMatch) {
      reason = reasonMatch[1].trim();
    }
  }
  if (!reason) {
    return void 0;
  }
  return reason.slice(0, 500);
}
function detectActionIntent(content, mentionedUserIds) {
  const text = content.trim().toLowerCase();
  const targetUserId = mentionedUserIds[0];
  if (/\b(show|check|view|see|list)\b.*\b(warnings?|warning history)\b/.test(
    text
  )) {
    return {
      action: "warnings",
      targetUserId
    };
  }
  if (/\b(untimeout|remove timeout|unmute)\b/.test(
    text
  )) {
    return {
      action: "untimeout",
      targetUserId
    };
  }
  if (/\b(timeout|mute temporarily|temporarily mute)\b/.test(
    text
  )) {
    const durationMatch = text.match(
      /\b(\d+)\s*(minute|minutes|min|mins|hour|hours|hr|hrs)\b/
    );
    let durationMinutes;
    if (durationMatch) {
      const value = Number(durationMatch[1]);
      const unit = durationMatch[2];
      durationMinutes = unit.startsWith("hour") || unit === "hr" || unit === "hrs" ? value * 60 : value;
    }
    return {
      action: "timeout",
      targetUserId,
      durationMinutes,
      reason: extractReason(
        text,
        durationMatch
      )
    };
  }
  if (/\b(warn|warning)\b/.test(text)) {
    return {
      action: "warn",
      targetUserId,
      reason: extractReason(text)
    };
  }
  return {
    action: "none"
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  detectActionIntent
});
