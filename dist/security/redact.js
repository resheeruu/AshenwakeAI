"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
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
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var redact_exports = {};
__export(redact_exports, {
  redact: () => redact,
  redactLogMessage: () => redactLogMessage,
  scanForSecrets: () => scanForSecrets
});
module.exports = __toCommonJS(redact_exports);
var import_strip_ansi = __toESM(require("strip-ansi"));
var import_patterns = require("./patterns");
function redactString(text) {
  let result = (0, import_strip_ansi.default)(text);
  for (const { pattern, replacement } of import_patterns.REDACTION_RULES) {
    if (typeof replacement === "function") {
      result = result.replace(pattern, replacement);
    } else {
      result = result.replace(pattern, replacement);
    }
  }
  return result;
}
function redact(value) {
  if (typeof value === "string") {
    return redactString(value);
  }
  if (Array.isArray(value)) {
    return value.map(redact);
  }
  if (value !== null && typeof value === "object") {
    const result = {};
    for (const [key, val] of Object.entries(value)) {
      result[key] = redact(val);
    }
    return result;
  }
  return value;
}
function redactLogMessage(...args) {
  return args.map(redact);
}
const SECRET_PATTERNS = [
  { pattern: /(?:api[_-]?key|apikey)\s*[:=]\s*['"]?[A-Za-z0-9_\-]{20,}['"]?/gi, name: "API key" },
  { pattern: /(?:token|secret|password|passwd|pwd)\s*[:=]\s*['"]?[^\s'"]{8,}['"]?/gi, name: "Token/secret" },
  { pattern: /(?:bearer|authorization)\s*[:=]\s*['"]?[A-Za-z0-9_\-\.]{20,}['"]?/gi, name: "Authorization" },
  { pattern: /(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{36,}/g, name: "GitHub token" },
  { pattern: /sk-[A-Za-z0-9]{20,}/g, name: "OpenAI key" },
  { pattern: /AIza[A-Za-z0-9_\-]{35}/g, name: "Google API key" }
];
function scanForSecrets(text) {
  const found = [];
  for (const { pattern, name } of SECRET_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    if (regex.test(text)) {
      found.push(name);
    }
  }
  return found;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  redact,
  redactLogMessage,
  scanForSecrets
});
