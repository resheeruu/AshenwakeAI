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
var load_manager_exports = {};
__export(load_manager_exports, {
  canRunInternalOperation: () => canRunInternalOperation,
  checkLoad: () => checkLoad,
  getInternalCooldownMs: () => getInternalCooldownMs,
  getLoadMultiplier: () => getLoadMultiplier,
  getLoadStatus: () => getLoadStatus,
  recordRequest: () => recordRequest,
  shouldThrottle: () => shouldThrottle
});
module.exports = __toCommonJS(load_manager_exports);
const state = {
  level: "normal",
  requestCount: 0,
  windowStart: Date.now(),
  lastCheck: Date.now()
};
const NORMAL_THRESHOLD = 50;
const HIGH_THRESHOLD = 150;
const EXTREME_THRESHOLD = 300;
const WINDOW_MS = 6e4;
function checkLoad() {
  const now = Date.now();
  if (now - state.windowStart > WINDOW_MS) {
    state.requestCount = 0;
    state.windowStart = now;
  }
  if (state.requestCount > EXTREME_THRESHOLD) state.level = "extreme";
  else if (state.requestCount > HIGH_THRESHOLD) state.level = "high";
  else state.level = "normal";
  state.lastCheck = now;
  return { ...state };
}
function recordRequest() {
  state.requestCount++;
}
function shouldThrottle() {
  const load = checkLoad();
  return load.level === "extreme";
}
function getLoadMultiplier() {
  const load = checkLoad();
  switch (load.level) {
    case "normal":
      return 1;
    case "high":
      return 0.5;
    case "extreme":
      return 0.2;
  }
}
function canRunInternalOperation(priority) {
  const load = checkLoad();
  switch (load.level) {
    case "normal":
      return true;
    case "high":
      return priority === "critical" || priority === "high";
    case "extreme":
      return priority === "critical";
  }
}
function getInternalCooldownMs(priority) {
  const load = checkLoad();
  const base = {
    critical: 0,
    high: 2e3,
    normal: 5e3,
    low: 15e3,
    background: 3e4
  };
  const multiplier = load.level === "extreme" ? 3 : load.level === "high" ? 2 : 1;
  return base[priority] * multiplier;
}
function getLoadStatus() {
  const load = checkLoad();
  return {
    level: load.level,
    requests: state.requestCount,
    multiplier: getLoadMultiplier()
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  canRunInternalOperation,
  checkLoad,
  getInternalCooldownMs,
  getLoadMultiplier,
  getLoadStatus,
  recordRequest,
  shouldThrottle
});
