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
var risk_engine_exports = {};
__export(risk_engine_exports, {
  assessRisk: () => assessRisk
});
module.exports = __toCommonJS(risk_engine_exports);
const HIGH_RISK_ACTIONS = /* @__PURE__ */ new Set([
  "ban",
  "channel_delete",
  "role_delete",
  "permission_modify",
  "server_settings",
  "restore"
]);
const MEDIUM_RISK_ACTIONS = /* @__PURE__ */ new Set([
  "kick",
  "purge",
  "role_create",
  "channel_create",
  "lock",
  "unlock",
  "timeout"
]);
function assessRisk(action, targetName) {
  if (HIGH_RISK_ACTIONS.has(action)) {
    return {
      level: "critical",
      requiresConfirmation: true,
      reason: `Action "${action}" is high-risk` + (targetName ? ` targeting ${targetName}` : "")
    };
  }
  if (MEDIUM_RISK_ACTIONS.has(action)) {
    return {
      level: "medium",
      requiresConfirmation: true,
      reason: `Action "${action}" requires confirmation` + (targetName ? ` for ${targetName}` : "")
    };
  }
  return {
    level: "low",
    requiresConfirmation: false,
    reason: `Action "${action}" is low risk`
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  assessRisk
});
