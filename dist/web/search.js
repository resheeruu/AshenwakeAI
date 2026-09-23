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
var search_exports = {};
__export(search_exports, {
  webSearch: () => webSearch
});
module.exports = __toCommonJS(search_exports);
var import_p_retry = __toESM(require("p-retry"));
var import_lru_cache = require("lru-cache");
var import_logger = require("../logger");
const BRAVE_SEARCH_URL = "https://api.search.brave.com/res/v1/web/search";
const searchCache = new import_lru_cache.LRUCache({
  max: 200,
  ttl: 1e3 * 60 * 30
});
function cacheKey(query, count) {
  return `${query}:${count}`;
}
async function webSearch(query, count = 5, apiKey) {
  const key = apiKey || process.env.BRAVE_SEARCH_API_KEY;
  if (!key) {
    import_logger.logger.warn("\u26A0\uFE0F No Brave Search API key configured");
    return { query, results: [] };
  }
  const cached = searchCache.get(cacheKey(query, count));
  if (cached) {
    import_logger.logger.debug(`\u{1F50D} Search cache hit: "${query}"`);
    return cached;
  }
  const results = await (0, import_p_retry.default)(
    async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 1e4);
      try {
        const params = new URLSearchParams({
          q: query,
          count: String(count),
          text_decorations: "false",
          search_lang: "en"
        });
        const response = await fetch(`${BRAVE_SEARCH_URL}?${params}`, {
          headers: {
            Accept: "application/json",
            "Accept-Encoding": "gzip",
            "X-Subscription-Token": key
          },
          signal: controller.signal
        });
        if (!response.ok) {
          if (response.status === 429) {
            throw new Error(`Brave Search rate limited (429)`);
          }
          if (response.status >= 500) {
            throw new Error(`Brave Search server error (${response.status})`);
          }
          throw new Error(`Brave Search HTTP ${response.status}`);
        }
        const data = await response.json();
        const webResults = data.web?.results || [];
        return {
          query,
          results: webResults.map((r) => ({
            title: r.title || "",
            url: r.url || "",
            description: r.description || "",
            age: r.age,
            language: r.language
          })),
          queryAge: data.web?.results?.[0]?.age
        };
      } finally {
        clearTimeout(timeout);
      }
    },
    {
      retries: 2,
      minTimeout: 1e3,
      maxTimeout: 4e3,
      onFailedAttempt: ({ error, attemptNumber, retriesLeft }) => {
        import_logger.logger.warn(
          `\u{1F50D} Search attempt ${attemptNumber} failed: ${error.message}. ${retriesLeft} retries left.`
        );
      }
    }
  );
  searchCache.set(cacheKey(query, count), results);
  return results;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  webSearch
});
