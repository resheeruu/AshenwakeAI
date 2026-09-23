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
var fetch_exports = {};
__export(fetch_exports, {
  clearPageCache: () => clearPageCache,
  fetchPage: () => fetchPage,
  requestWithValidatedRedirects: () => requestWithValidatedRedirects,
  validateUrl: () => validateUrl
});
module.exports = __toCommonJS(fetch_exports);
var import_undici = require("undici");
var import_p_retry = __toESM(require("p-retry"));
var import_lru_cache = require("lru-cache");
var import_logger = require("../logger");
var import_robots = require("./robots");
var import_network_boundary = require("../security/network-boundary");
var import_outbound_fetch = require("../security/outbound-fetch");
const pageCache = new import_lru_cache.LRUCache({
  max: 100,
  ttl: 1e3 * 60 * 15
});
const MAX_PAGE_SIZE = 5 * 1024 * 1024;
const USER_AGENT = "Mozilla/5.0 (compatible; AshenAI/1.0; +https://github.com/AshenAI)";
function validateUrl(url) {
  const result = (0, import_network_boundary.validateOutboundUrl)(url);
  return result.valid ? { valid: true } : { valid: false, reason: result.reason };
}
async function resolveAndValidateHost(url) {
  await (0, import_outbound_fetch.resolveAndValidateHost)(url, "public");
}
function requestOnce(url, timeoutMs) {
  return (0, import_undici.fetch)(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9"
    },
    signal: AbortSignal.timeout(timeoutMs),
    redirect: "manual",
    dispatcher: agent
  });
}
async function requestWithValidatedRedirects(startUrl, timeoutMs) {
  const startCheck = (0, import_network_boundary.validateOutboundUrl)(startUrl);
  if (!startCheck.valid) {
    throw new Error(`Blocked: ${startCheck.reason}`);
  }
  let currentUrl = startUrl;
  for (let hop = 0; ; hop++) {
    const response = await requestOnce(currentUrl, timeoutMs);
    const location = response.headers.get("location");
    const isRedirect = response.status >= 300 && response.status < 400;
    if (!isRedirect || !location) {
      return { response, finalUrl: currentUrl };
    }
    if (hop >= import_network_boundary.MAX_REDIRECTS) {
      throw new Error(`Blocked: too many redirects for ${startUrl}`);
    }
    const target = (0, import_network_boundary.validateRedirectTarget)(location, currentUrl);
    if (!target.valid || !target.url) {
      import_logger.logger.warn(`\u{1F310} SSRF blocked: redirect target rejected (${target.reason})`);
      throw new Error(`Blocked: redirect target rejected (${target.reason})`);
    }
    await resolveAndValidateHost(target.url);
    currentUrl = target.url;
  }
}
const agent = new import_undici.Agent({
  keepAliveTimeout: 3e4,
  keepAliveMaxTimeout: 6e4,
  connections: 10,
  pipelining: 1
});
function isRetryableError(error) {
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  return msg.includes("429") || msg.includes("rate limit") || msg.includes("503") || msg.includes("502") || msg.includes("500") || msg.includes("econnreset") || msg.includes("econnrefused") || msg.includes("socket hang up") || msg.includes("network");
}
async function fetchPage(url, options = {}) {
  const { timeoutMs = 15e3, maxRetries = 2, useCache = true, respectRobots = true } = options;
  if (useCache) {
    const cached = pageCache.get(url);
    if (cached) {
      import_logger.logger.debug(`\u{1F310} Page cache hit: ${url}`);
      return cached;
    }
  }
  const urlCheck = (0, import_network_boundary.validateOutboundUrl)(url);
  if (!urlCheck.valid) {
    throw new Error(`Blocked: ${urlCheck.reason}`);
  }
  await resolveAndValidateHost(url);
  if (respectRobots) {
    const allowed = await (0, import_robots.isUrlAllowedByRobots)(url);
    if (!allowed) {
      throw new Error(`Blocked by robots.txt: ${url}`);
    }
  }
  const result = await (0, import_p_retry.default)(
    async () => {
      const { response, finalUrl } = await requestWithValidatedRedirects(url, timeoutMs);
      const contentType = response.headers.get("content-type") || "";
      const contentLength = Number(response.headers.get("content-length") || "0");
      if (contentLength > MAX_PAGE_SIZE) {
        throw new Error(`Page too large: ${contentLength} bytes`);
      }
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} for ${url}`);
      }
      let html = await response.text();
      if (html.length > MAX_PAGE_SIZE) {
        html = html.slice(0, MAX_PAGE_SIZE);
      }
      return {
        url,
        finalUrl,
        status: response.status,
        contentType,
        html,
        redirected: finalUrl !== url
      };
    },
    {
      retries: maxRetries,
      minTimeout: 1e3,
      maxTimeout: 5e3,
      onFailedAttempt: ({ error, attemptNumber, retriesLeft }) => {
        if (isRetryableError(error)) {
          import_logger.logger.warn(
            `\u{1F310} Fetch attempt ${attemptNumber} failed for ${url}: ${error.message}. ${retriesLeft} retries left.`
          );
        }
      },
      shouldRetry: (error) => isRetryableError(error)
    }
  );
  if (useCache) {
    pageCache.set(url, result);
  }
  return result;
}
function clearPageCache() {
  pageCache.clear();
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  clearPageCache,
  fetchPage,
  requestWithValidatedRedirects,
  validateUrl
});
