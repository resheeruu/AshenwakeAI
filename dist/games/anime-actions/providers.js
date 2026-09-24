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
var providers_exports = {};
__export(providers_exports, {
  clearAnimationCache: () => clearAnimationCache,
  fetchAnimation: () => fetchAnimation,
  getAnimationCacheStats: () => getAnimationCacheStats
});
module.exports = __toCommonJS(providers_exports);
var import_lru_cache = require("lru-cache");
var import_logger = require("../../logger");
var import_media_security = require("./media-security");
const MAX_RESULTS_PER_ACTION = 5;
const cache = new import_lru_cache.LRUCache({
  max: 200,
  ttl: 30 * 60 * 1e3
});
let requestCount = 0;
let failCount = 0;
class GifukaiProvider {
  name = "gifukai";
  baseUrl = "https://api.gifukai.com";
  async fetch(action) {
    try {
      requestCount++;
      const response = await fetch(`${this.baseUrl}/${action}`, {
        signal: AbortSignal.timeout(8e3)
      });
      if (!response.ok) {
        failCount++;
        return null;
      }
      const data = await response.json();
      if (data.url && typeof data.url === "string") {
        const validation = (0, import_media_security.validateMediaUrl)(data.url);
        if (!validation.ok) {
          import_logger.logger.debug(`Gifukai URL rejected: ${validation.error}`);
          failCount++;
          return null;
        }
        return { url: data.url, source: this.name };
      }
      failCount++;
      return null;
    } catch {
      failCount++;
      return null;
    }
  }
}
class OtakuGifsProvider {
  name = "otakugifs";
  baseUrl = "https://api.otakugifs.xyz";
  async fetch(action) {
    try {
      requestCount++;
      const response = await fetch(
        `${this.baseUrl}/gif?reaction=${encodeURIComponent(action)}`,
        { signal: AbortSignal.timeout(8e3) }
      );
      if (!response.ok) {
        failCount++;
        return null;
      }
      const data = await response.json();
      if (data.url && typeof data.url === "string") {
        const validation = (0, import_media_security.validateMediaUrl)(data.url);
        if (!validation.ok) {
          import_logger.logger.debug(`OtakuGifs URL rejected: ${validation.error}`);
          failCount++;
          return null;
        }
        return { url: data.url, source: this.name };
      }
      failCount++;
      return null;
    } catch {
      failCount++;
      return null;
    }
  }
}
class TextOnlyProvider {
  name = "text";
  async fetch(_action) {
    return null;
  }
}
const providers = [
  new GifukaiProvider(),
  new OtakuGifsProvider(),
  new TextOnlyProvider()
];
async function fetchAnimation(action) {
  const cacheKey = `anime:${action}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.urls.length > 0) {
    const idx = Math.floor(Math.random() * cached.urls.length);
    return { url: cached.urls[idx], source: cached.source };
  }
  const collectedUrls = [];
  let source = "none";
  for (const provider of providers) {
    const result = await provider.fetch(action);
    if (result) {
      collectedUrls.push(result.url);
      source = provider.name;
      if (collectedUrls.length >= MAX_RESULTS_PER_ACTION) break;
    }
  }
  if (collectedUrls.length > 0) {
    const unique = [...new Set(collectedUrls)];
    cache.set(cacheKey, { urls: unique, source, timestamp: Date.now() });
    const idx = Math.floor(Math.random() * unique.length);
    import_logger.logger.debug(`Anime animation fetched: action=${action} provider=${source} results=${unique.length}`);
    return { url: unique[idx], source };
  }
  import_logger.logger.debug(`No anime animation found for action: ${action}`);
  return null;
}
function clearAnimationCache() {
  cache.clear();
}
function getAnimationCacheStats() {
  return { size: cache.size, max: 200, requests: requestCount, failures: failCount };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  clearAnimationCache,
  fetchAnimation,
  getAnimationCacheStats
});
