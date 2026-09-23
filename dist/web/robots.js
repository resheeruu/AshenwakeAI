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
var robots_exports = {};
__export(robots_exports, {
  clearRobotsCache: () => clearRobotsCache,
  isUrlAllowedByRobots: () => isUrlAllowedByRobots
});
module.exports = __toCommonJS(robots_exports);
var import_lru_cache = require("lru-cache");
var import_outbound_fetch = require("../security/outbound-fetch");
var import_network_boundary = require("../security/network-boundary");
const robotsCache = new import_lru_cache.LRUCache({
  max: 200,
  ttl: 1e3 * 60 * 60
});
function parseRobotsTxt(content) {
  const lines = content.split(/\r?\n/);
  const rules = [];
  const sitemaps = [];
  let current = null;
  for (const line of lines) {
    const trimmed = line.split("#")[0].trim();
    if (!trimmed) continue;
    const colonIndex = trimmed.indexOf(":");
    if (colonIndex === -1) continue;
    const key = trimmed.slice(0, colonIndex).trim().toLowerCase();
    const value = trimmed.slice(colonIndex + 1).trim();
    if (key === "user-agent") {
      if (current) {
        rules.push(current);
      }
      current = {
        userAgent: value,
        allow: [],
        disallow: []
      };
    } else if (key === "allow" && current) {
      current.allow.push(value);
    } else if (key === "disallow" && current) {
      if (value) {
        current.disallow.push(value);
      }
    } else if (key === "crawl-delay" && current) {
      current.crawlDelay = parseInt(value, 10);
    } else if (key === "sitemap") {
      sitemaps.push(value);
    }
  }
  if (current) {
    rules.push(current);
  }
  return { rules, sitemaps, fetchedAt: Date.now() };
}
function matchPattern(pattern, path) {
  if (!pattern) return false;
  const regexPattern = pattern.replace(/\*/g, ".*").replace(/\$/g, "$");
  try {
    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(path);
  } catch {
    return pattern === path;
  }
}
function isAllowed(robots, url, userAgent = "*") {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname + parsed.search;
    let matchingRule = null;
    for (const rule of robots.rules) {
      const agentLower = rule.userAgent.toLowerCase();
      const uaLower = userAgent.toLowerCase();
      if (agentLower === "*" || uaLower.includes(agentLower)) {
        matchingRule = rule;
        break;
      }
    }
    if (!matchingRule) {
      return true;
    }
    let bestMatch = "";
    let allowed = true;
    for (const pattern of matchingRule.disallow) {
      if (matchPattern(pattern, path) && pattern.length > bestMatch.length) {
        bestMatch = pattern;
        allowed = false;
      }
    }
    for (const pattern of matchingRule.allow) {
      if (matchPattern(pattern, path) && pattern.length > bestMatch.length) {
        bestMatch = pattern;
        allowed = true;
      }
    }
    return allowed;
  } catch {
    return true;
  }
}
const MAX_ROBOTS_BYTES = 256 * 1024;
const ROBOTS_TIMEOUT_MS = 5e3;
async function fetchRobotsTxt(origin) {
  const cached = robotsCache.get(origin);
  if (cached) {
    return cached;
  }
  const empty = { rules: [], sitemaps: [], fetchedAt: Date.now() };
  try {
    const robotsUrl = `${origin.replace(/\/$/, "")}/robots.txt`;
    const urlCheck = (0, import_network_boundary.validateOutboundUrl)(robotsUrl);
    if (!urlCheck.valid) {
      robotsCache.set(origin, empty);
      return empty;
    }
    const { response } = await (0, import_outbound_fetch.hardenedFetch)(robotsUrl, {
      timeoutMs: ROBOTS_TIMEOUT_MS,
      maxRedirects: 3,
      maxResponseBytes: MAX_ROBOTS_BYTES,
      headers: {
        "User-Agent": "AshenAI/1.0 (https://github.com/AshenAI)",
        Accept: "text/plain"
      }
    });
    if (!response.ok) {
      robotsCache.set(origin, empty);
      return empty;
    }
    const content = await (0, import_outbound_fetch.readLimitedText)(response, MAX_ROBOTS_BYTES);
    const parsed = parseRobotsTxt(content);
    robotsCache.set(origin, parsed);
    return parsed;
  } catch {
    robotsCache.set(origin, empty);
    return empty;
  }
}
async function isUrlAllowedByRobots(url) {
  try {
    const parsed = new URL(url);
    const origin = `${parsed.protocol}//${parsed.host}`;
    const robots = await fetchRobotsTxt(origin);
    return isAllowed(robots, url);
  } catch {
    return true;
  }
}
function clearRobotsCache() {
  robotsCache.clear();
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  clearRobotsCache,
  isUrlAllowedByRobots
});
