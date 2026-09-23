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
var confirmation_store_exports = {};
__export(confirmation_store_exports, {
  clearAllPendingPlans: () => clearAllPendingPlans,
  getPendingPlan: () => getPendingPlan,
  getPendingPlanCount: () => getPendingPlanCount,
  isPlanExecuted: () => isPlanExecuted,
  isPlanExpired: () => isPlanExpired,
  markPlanExecuted: () => markPlanExecuted,
  removePendingPlan: () => removePendingPlan,
  storePendingPlan: () => storePendingPlan,
  verifyPlan: () => verifyPlan
});
module.exports = __toCommonJS(confirmation_store_exports);
var import_logger = require("../../logger");
const pendingPlans = /* @__PURE__ */ new Map();
const CLEANUP_INTERVAL_MS = 6e4;
let cleanupTimer = null;
function startCleanup() {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [id, stored] of pendingPlans) {
      if (stored.plan.expiresAt < now) {
        pendingPlans.delete(id);
      }
    }
  }, CLEANUP_INTERVAL_MS);
  if (cleanupTimer.unref) cleanupTimer.unref();
}
function storePendingPlan(plan) {
  pendingPlans.set(plan.id, { plan, executed: false });
  startCleanup();
  import_logger.logger.info(`Stored pending plan: ${plan.id} tool=${plan.toolName} guild=${plan.guildId}`);
}
function getPendingPlan(planId) {
  const stored = pendingPlans.get(planId);
  return stored?.plan;
}
function removePendingPlan(planId) {
  return pendingPlans.delete(planId);
}
function isPlanExpired(plan) {
  return plan.expiresAt < Date.now();
}
function isPlanExecuted(planId) {
  return pendingPlans.get(planId)?.executed ?? false;
}
function verifyPlan(plan, confirmerId, guildId, channelId, sessionId) {
  if (plan.requesterId !== confirmerId) {
    return { valid: false, reason: "CONFIRMATION_INVALID" };
  }
  if (plan.guildId !== guildId) {
    return { valid: false, reason: "CONFIRMATION_INVALID" };
  }
  if (channelId && plan.channelId && plan.channelId !== channelId) {
    return { valid: false, reason: "CONFIRMATION_INVALID" };
  }
  if (sessionId && plan.sessionId && plan.sessionId !== sessionId) {
    return { valid: false, reason: "CONFIRMATION_INVALID" };
  }
  if (isPlanExpired(plan)) {
    return { valid: false, reason: "CONFIRMATION_EXPIRED" };
  }
  if (isPlanExecuted(plan.id)) {
    return { valid: false, reason: "ALREADY_EXECUTED" };
  }
  return { valid: true };
}
function markPlanExecuted(planId) {
  const stored = pendingPlans.get(planId);
  if (stored) {
    stored.executed = true;
  }
}
function getPendingPlanCount() {
  return pendingPlans.size;
}
function clearAllPendingPlans() {
  pendingPlans.clear();
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  clearAllPendingPlans,
  getPendingPlan,
  getPendingPlanCount,
  isPlanExecuted,
  isPlanExpired,
  markPlanExecuted,
  removePendingPlan,
  storePendingPlan,
  verifyPlan
});
