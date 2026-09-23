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
var log_stream_exports = {};
__export(log_stream_exports, {
  getRecentLogs: () => getRecentLogs,
  recordLog: () => recordLog,
  subscribeLogs: () => subscribeLogs
});
module.exports = __toCommonJS(log_stream_exports);
const MAX_LOGS = 500;
let nextId = 1;
const logs = [];
const listeners = /* @__PURE__ */ new Set();
function normalizeArgs(args) {
  return args.map((value) => {
    if (value instanceof Error) {
      return value.stack || value.message;
    }
    if (typeof value === "string") {
      return value;
    }
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }).join(" ");
}
function recordLog(level, ...args) {
  const entry = {
    id: nextId++,
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    level,
    message: normalizeArgs(args)
  };
  logs.push(entry);
  if (logs.length > MAX_LOGS) {
    logs.shift();
  }
  for (const listener of listeners) {
    try {
      listener(entry);
    } catch {
    }
  }
  return entry;
}
function getRecentLogs(limit = 100) {
  const safeLimit = Math.max(1, Math.min(limit, MAX_LOGS));
  return logs.slice(-safeLimit);
}
function subscribeLogs(listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  getRecentLogs,
  recordLog,
  subscribeLogs
});
