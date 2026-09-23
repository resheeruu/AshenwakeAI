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
var text_utils_exports = {};
__export(text_utils_exports, {
  deduplicateBy: () => deduplicateBy,
  deduplicateStrings: () => deduplicateStrings,
  htmlToMarkdown: () => htmlToMarkdown,
  isNearDuplicate: () => isNearDuplicate,
  stringSimilarity: () => stringSimilarity,
  termOverlapScore: () => termOverlapScore
});
module.exports = __toCommonJS(text_utils_exports);
var import_turndown = __toESM(require("turndown"));
var import_fastest_levenshtein = require("fastest-levenshtein");
const turndown = new import_turndown.default({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-"
});
turndown.remove(["script", "style", "nav", "footer", "noscript", "iframe"]);
function htmlToMarkdown(html) {
  try {
    return turndown.turndown(html).trim();
  } catch {
    return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }
}
function stringSimilarity(a, b) {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;
  const maxLen = Math.max(a.length, b.length);
  const dist = (0, import_fastest_levenshtein.distance)(a.toLowerCase(), b.toLowerCase());
  return 1 - dist / maxLen;
}
function isNearDuplicate(a, b, threshold = 0.85) {
  return stringSimilarity(a, b) > threshold;
}
function deduplicateBy(items, keyFn) {
  const seen = /* @__PURE__ */ new Set();
  const result = [];
  for (const item of items) {
    const key = keyFn(item);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(item);
    }
  }
  return result;
}
function deduplicateStrings(items, threshold = 0.85) {
  const result = [];
  for (const item of items) {
    const isDupe = result.some((existing) => isNearDuplicate(existing, item, threshold));
    if (!isDupe) result.push(item);
  }
  return result;
}
function termOverlapScore(query, text) {
  const queryTerms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const textLower = text.toLowerCase();
  if (queryTerms.length === 0) return 0;
  let matches = 0;
  for (const term of queryTerms) {
    if (textLower.includes(term)) matches++;
  }
  return matches / queryTerms.length;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  deduplicateBy,
  deduplicateStrings,
  htmlToMarkdown,
  isNearDuplicate,
  stringSimilarity,
  termOverlapScore
});
