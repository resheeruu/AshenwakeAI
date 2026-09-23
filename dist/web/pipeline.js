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
var pipeline_exports = {};
__export(pipeline_exports, {
  clearWebCaches: () => clearWebCaches,
  webPipeline: () => webPipeline
});
module.exports = __toCommonJS(pipeline_exports);
var import_p_limit = __toESM(require("p-limit"));
var import_lru_cache = require("lru-cache");
var import_logger = require("../logger");
var import_search = require("./search");
var import_fetch = require("./fetch");
var import_extract = require("./extract");
var import_text_utils = require("./text-utils");
const contentCache = new import_lru_cache.LRUCache({
  max: 500,
  ttl: 1e3 * 60 * 30
});
const TRACKING_PARAMS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "fbclid",
  "gclid",
  "mc_cid",
  "mc_eid",
  "ref",
  "source",
  "spm",
  "from"
];
function canonicalizeUrl(url) {
  try {
    const parsed = new URL(url);
    let host = parsed.hostname;
    if (host.startsWith("www.")) {
      host = host.slice(4);
    }
    const params = new URLSearchParams(parsed.search);
    for (const param of TRACKING_PARAMS) {
      params.delete(param);
    }
    const sortedParams = params.toString();
    let canonical = `${parsed.protocol}//${host}${parsed.pathname}`;
    if (sortedParams) {
      canonical += `?${sortedParams}`;
    }
    return canonical.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}
function extractDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
function deduplicateUrls(results) {
  const seen = /* @__PURE__ */ new Map();
  for (const result of results) {
    const canonical = canonicalizeUrl(result.url);
    const existing = seen.get(canonical);
    if (!existing) {
      seen.set(canonical, result);
    } else {
      if (result.description.length > existing.description.length) {
        seen.set(canonical, result);
      }
    }
  }
  return Array.from(seen.values());
}
function deduplicateByContent(sources) {
  const result = [];
  for (const source of sources) {
    const text = source.extractedContent || source.snippet;
    const isDupe = result.some((existing) => {
      const existingText = existing.extractedContent || existing.snippet;
      return (0, import_text_utils.isNearDuplicate)(text, existingText, 0.85);
    });
    if (!isDupe) result.push(source);
  }
  return result;
}
function reciprocalRankFusion(rankedLists, k = 60) {
  const scores = /* @__PURE__ */ new Map();
  for (const list of rankedLists) {
    for (const { item, rank } of list) {
      const current = scores.get(item) || 0;
      scores.set(item, current + 1 / (k + rank + 1));
    }
  }
  return scores;
}
function computeSourceScore(source, query, rrfScore, totalSources) {
  let score = rrfScore;
  const queryRelevance = (0, import_text_utils.termOverlapScore)(query, source.extractedContent || source.snippet);
  score += queryRelevance * 0.3;
  if (source.contentType === "article") {
    score += 0.05;
  }
  if (source.extractedContent && source.extractedContent.length > 500) {
    score += 0.02;
  }
  return score;
}
function cleanSnippet(text) {
  return text.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim().slice(0, 300);
}
function isUrlFetchable(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}
function shouldSkipUrl(url) {
  const skipPatterns = [
    /youtube\.com\/watch/,
    /youtu\.be\//,
    /facebook\.com/,
    /twitter\.com\/\w+\/status/,
    /x\.com\/\w+\/status/,
    /instagram\.com\//,
    /tiktok\.com\//,
    /\.pdf$/i,
    /\.zip$/i,
    /\.exe$/i
  ];
  return skipPatterns.some((p) => p.test(url));
}
async function fetchAndExtract(url, options) {
  const cacheKey = `extract:${canonicalizeUrl(url)}`;
  const cached = contentCache.get(cacheKey);
  if (cached) {
    return { content: cached, isArticle: true };
  }
  try {
    const page = await (0, import_fetch.fetchPage)(url, {
      timeoutMs: options.timeoutMs || 1e4,
      maxRetries: 1,
      useCache: true
    });
    if (!page.html || page.html.length < 200) {
      return null;
    }
    const { article, structured, isArticle } = (0, import_extract.extractContent)(
      page.html,
      page.finalUrl,
      page.contentType
    );
    const normalized = (0, import_extract.normalizeContent)(article, structured, options.maxContentLength || 8e3);
    if (normalized.length < 50) {
      return null;
    }
    let markdown;
    if (isArticle) {
      try {
        markdown = (0, import_text_utils.htmlToMarkdown)(article?.content || page.html);
        if (markdown.length > (options.maxContentLength || 8e3)) {
          markdown = markdown.slice(0, options.maxContentLength || 8e3) + "...";
        }
      } catch {
      }
    }
    contentCache.set(cacheKey, normalized);
    return { content: normalized, isArticle, markdown };
  } catch (error) {
    import_logger.logger.debug(`Failed to fetch/extract ${url}: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}
const MINIMAL_CONTENT_THRESHOLD = 200;
async function webPipeline(query, options = {}) {
  const {
    searchCount = 5,
    maxSources = 5,
    maxContentLength = 8e3,
    fetchConcurrency = 3,
    timeoutMs = 15e3,
    apiKey
  } = options;
  import_logger.logger.debug(`Web pipeline: "${query}"`);
  const searchResults = await (0, import_search.webSearch)(query, searchCount, apiKey);
  if (searchResults.results.length === 0) {
    return {
      query,
      sources: [],
      answer: `No web results found for: ${query}`
    };
  }
  const dedupedResults = deduplicateUrls(searchResults.results);
  const fetchLimit = (0, import_p_limit.default)(fetchConcurrency);
  const fetchPromises = dedupedResults.slice(0, maxSources).map(
    (result) => fetchLimit(async () => {
      if (!isUrlFetchable(result.url) || shouldSkipUrl(result.url)) {
        return {
          title: result.title,
          url: result.url,
          snippet: cleanSnippet(result.description),
          extractedContent: void 0,
          contentType: void 0
        };
      }
      const extracted = await fetchAndExtract(result.url, {
        maxContentLength,
        timeoutMs
      });
      const content = extracted?.markdown || extracted?.content;
      return {
        title: result.title,
        url: result.url,
        snippet: cleanSnippet(result.description),
        extractedContent: content,
        contentType: extracted?.isArticle ? "article" : "structured"
      };
    })
  );
  const settledResults = await Promise.allSettled(fetchPromises);
  const sources = [];
  for (let i = 0; i < settledResults.length; i++) {
    const result = settledResults[i];
    if (result.status === "fulfilled") {
      const value = result.value;
      if (value.snippet || value.extractedContent) {
        sources.push({
          title: value.title,
          url: value.url,
          snippet: value.snippet,
          extractedContent: value.extractedContent,
          contentType: value.contentType,
          domain: extractDomain(value.url)
        });
      }
    }
  }
  const rankedLists = [
    dedupedResults.map((r, rank) => ({ item: r, rank }))
  ];
  const rrfScores = reciprocalRankFusion(rankedLists);
  for (const source of sources) {
    const originalResult = dedupedResults.find(
      (r) => canonicalizeUrl(r.url) === canonicalizeUrl(source.url)
    );
    const rrf = originalResult ? rrfScores.get(originalResult) || 0 : 0;
    source.score = computeSourceScore(source, query, rrf, sources.length);
  }
  sources.sort((a, b) => (b.score || 0) - (a.score || 0));
  const diversified = enforceDomainDiversity(sources, maxSources);
  const contextParts = diversified.map((s, i) => {
    const header = `[Source ${i + 1}: ${s.title}](${s.url})`;
    if (s.extractedContent) {
      return `${header}
${s.extractedContent}`;
    }
    return `${header}
${s.snippet}`;
  });
  return {
    query,
    sources: diversified,
    answer: contextParts.join("\n\n---\n\n")
  };
}
function enforceDomainDiversity(sources, max) {
  const result = [];
  const domainCounts = /* @__PURE__ */ new Map();
  for (const source of sources) {
    const domain = source.domain || extractDomain(source.url);
    const count = domainCounts.get(domain) || 0;
    if (count >= 2) continue;
    domainCounts.set(domain, count + 1);
    result.push(source);
    if (result.length >= max) break;
  }
  return result;
}
function clearWebCaches() {
  contentCache.clear();
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  clearWebCaches,
  webPipeline
});
