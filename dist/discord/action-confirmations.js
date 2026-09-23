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
var action_confirmations_exports = {};
__export(action_confirmations_exports, {
  clearPendingAction: () => clearPendingAction,
  createActionKey: () => createActionKey,
  createExpiration: () => createExpiration,
  getPendingAction: () => getPendingAction,
  setPendingAction: () => setPendingAction
});
module.exports = __toCommonJS(action_confirmations_exports);
const pending = /* @__PURE__ */ new Map();
const TTL_MS = 3e4;
function setPendingAction(key, action) {
  pending.set(key, action);
}
function getPendingAction(key) {
  const action = pending.get(key);
  if (!action) {
    return null;
  }
  if (Date.now() > action.expiresAt) {
    pending.delete(key);
    return null;
  }
  return action;
}
function clearPendingAction(key) {
  pending.delete(key);
}
function createActionKey(userId, channelId) {
  return `${userId}:${channelId}`;
}
function createExpiration() {
  return Date.now() + TTL_MS;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  clearPendingAction,
  createActionKey,
  createExpiration,
  getPendingAction,
  setPendingAction
});
