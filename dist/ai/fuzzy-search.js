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
var fuzzy_search_exports = {};
__export(fuzzy_search_exports, {
  createFuzzySearch: () => createFuzzySearch,
  fuzzyScore: () => fuzzyScore
});
module.exports = __toCommonJS(fuzzy_search_exports);
var import_fuse = __toESM(require("fuse.js"));
function createFuzzySearch(items, keys, options) {
  const fuse = new import_fuse.default(items, {
    keys,
    threshold: options?.threshold ?? 0.4,
    includeScore: true,
    ignoreLocation: true,
    minMatchCharLength: 2
  });
  return (query) => {
    const results = fuse.search(query);
    return results.map((r) => ({
      item: r.item,
      score: r.score ?? 0
    }));
  };
}
function fuzzyScore(query, text) {
  const lowerQuery = query.toLowerCase();
  const lowerText = text.toLowerCase();
  if (lowerText.includes(lowerQuery)) return 0;
  const queryTerms = lowerQuery.split(/\s+/).filter(Boolean);
  const textTerms = lowerText.split(/\s+/).filter(Boolean);
  let matchScore = 0;
  for (const qt of queryTerms) {
    for (const tt of textTerms) {
      if (tt.includes(qt) || qt.includes(tt)) {
        matchScore += 1;
        break;
      }
    }
  }
  return 1 - matchScore / queryTerms.length;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  createFuzzySearch,
  fuzzyScore
});
