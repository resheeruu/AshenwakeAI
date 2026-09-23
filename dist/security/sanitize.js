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
var sanitize_exports = {};
__export(sanitize_exports, {
  isErrorMessageSafe: () => isErrorMessageSafe,
  sanitizeToolError: () => sanitizeToolError
});
module.exports = __toCommonJS(sanitize_exports);
const CATEGORY_PATTERNS = [
  { pattern: /rate.?limit|too.?many.?requests|429|throttl/i, category: "rate_limited" },
  { pattern: /permission|denied|unauthorized|forbidden|401|403|eacces/i, category: "permission" },
  { pattern: /not.?found|missing|enoent|does not exist|no such/i, category: "not_found" },
  { pattern: /timeout|timed?\s*out|deadline|ETIMEDOUT|504/i, category: "timeout" },
  { pattern: /network|econnrefused|econnreset|fetch.?fail|dns|resolve/i, category: "network" }
];
function detectCategory(rawError) {
  for (const { pattern, category } of CATEGORY_PATTERNS) {
    if (pattern.test(rawError)) {
      return category;
    }
  }
  return null;
}
const PATH_PATTERNS = [
  /\/[\w.-]+\/[\w.-]+\/[\w.-]+/g,
  // Unix paths: /a/b/c
  /[A-Z]:\\[\w\\.-]+/g,
  // Windows paths: C:\a\b\c
  /(?:file:\/\/|file:\/\/\/)[^\s"']+/gi,
  // file:// URIs
  /(?:\/home\/|\/root\/|\/var\/|\/etc\/|\/tmp\/|\/opt\/|\/usr\/)[^\s"']*/g,
  /(?:\/data\/|\/dist\/|\/src\/|\/node_modules\/)[^\s"']*/g
];
function containsPath(rawError) {
  return PATH_PATTERNS.some((p) => p.test(rawError));
}
const SENSITIVE_PATTERNS = [
  /(?:stack|trace|at\s+\w+\s|\.\.\/|\.\.\\)/i,
  // Stack traces
  /(?:node_modules|\.ts:\d+|\.js:\d+)/i,
  // Source references
  /(?:PID|process\.pid|child_pid)/i,
  // Process details
  /(?:port\s+\d+|:5432|:3306|:27017|:6379)/i,
  // Internal ports
  /(?:localhost|127\.0\.0\.1|0\.0\.0\.0)/i
  // Localhost references
];
function containsSensitiveDetail(rawError) {
  return SENSITIVE_PATTERNS.some((p) => p.test(rawError));
}
function sanitizeToolError(toolName, error) {
  const raw = error instanceof Error ? error.message : String(error);
  const category = detectCategory(raw);
  switch (category) {
    case "rate_limited":
      return `Tool "${toolName}" is rate-limited. Try again later.`;
    case "permission":
      return `Tool "${toolName}" requires higher permissions.`;
    case "not_found":
      return `Tool "${toolName}": target not found.`;
    case "timeout":
      return `Tool "${toolName}" timed out. The operation took too long.`;
    case "network":
      return `Tool "${toolName}" encountered a network error. The service may be temporarily unavailable.`;
  }
  return `Tool "${toolName}" encountered an error. The issue has been logged.`;
}
function isErrorMessageSafe(rawError) {
  if (!rawError || rawError.length === 0) return true;
  if (containsPath(rawError)) return false;
  if (containsSensitiveDetail(rawError)) return false;
  return true;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  isErrorMessageSafe,
  sanitizeToolError
});
