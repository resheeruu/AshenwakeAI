import pLimit from "p-limit";
import { LRUCache } from "lru-cache";
import { logger } from "../logger";
import { webSearch, type SearchResult } from "./search";
import { fetchPage, type FetchedPage } from "./fetch";
import { extractContent, normalizeContent } from "./extract";
import { htmlToMarkdown, isNearDuplicate, termOverlapScore, deduplicateBy } from "./text-utils";
import { getBrowserManager } from "./browser";

export interface WebSource {
  title: string;
  url: string;
  snippet: string;
  extractedContent?: string;
  contentType?: string;
  score?: number;
  domain?: string;
}

export interface WebPipelineResult {
  query: string;
  sources: WebSource[];
  answer: string;
}

export interface PipelineOptions {
  searchCount?: number;
  maxSources?: number;
  maxContentLength?: number;
  fetchConcurrency?: number;
  timeoutMs?: number;
  apiKey?: string;
}

const contentCache = new LRUCache<string, string>({
  max: 500,
  ttl: 1000 * 60 * 30,
});

const TRACKING_PARAMS = [
  "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term",
  "fbclid", "gclid", "mc_cid", "mc_eid",
  "ref", "source", "spm", "from",
];

function canonicalizeUrl(url: string): string {
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

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function deduplicateUrls(results: SearchResult[]): SearchResult[] {
  const seen = new Map<string, SearchResult>();

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

function deduplicateByContent(sources: WebSource[]): WebSource[] {
  const result: WebSource[] = [];
  for (const source of sources) {
    const text = source.extractedContent || source.snippet;
    const isDupe = result.some((existing) => {
      const existingText = existing.extractedContent || existing.snippet;
      return isNearDuplicate(text, existingText, 0.85);
    });
    if (!isDupe) result.push(source);
  }
  return result;
}

function reciprocalRankFusion(
  rankedLists: { item: SearchResult; rank: number }[][],
  k = 60,
): Map<SearchResult, number> {
  const scores = new Map<SearchResult, number>();

  for (const list of rankedLists) {
    for (const { item, rank } of list) {
      const current = scores.get(item) || 0;
      scores.set(item, current + 1 / (k + rank + 1));
    }
  }

  return scores;
}

function computeSourceScore(
  source: WebSource,
  query: string,
  rrfScore: number,
  totalSources: number,
): number {
  let score = rrfScore;

  const queryRelevance = termOverlapScore(query, source.extractedContent || source.snippet);
  score += queryRelevance * 0.3;

  if (source.contentType === "article") {
    score += 0.05;
  }

  if (source.extractedContent && source.extractedContent.length > 500) {
    score += 0.02;
  }

  return score;
}

function cleanSnippet(text: string): string {
  return text
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim()
    .slice(0, 300);
}

function isUrlFetchable(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "http:" ||
      parsed.protocol === "https:"
    );
  } catch {
    return false;
  }
}

function shouldSkipUrl(url: string): boolean {
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
    /\.exe$/i,
  ];
  return skipPatterns.some((p) => p.test(url));
}

async function fetchAndExtract(
  url: string,
  options: {
    maxContentLength?: number;
    timeoutMs?: number;
  },
): Promise<{ content: string; isArticle: boolean; markdown?: string } | null> {
  const cacheKey = `extract:${canonicalizeUrl(url)}`;
  const cached = contentCache.get(cacheKey);
  if (cached) {
    return { content: cached, isArticle: true };
  }

  try {
    const page = await fetchPage(url, {
      timeoutMs: options.timeoutMs || 10_000,
      maxRetries: 1,
      useCache: true,
    });

    if (!page.html || page.html.length < 200) {
      return null;
    }

    const { article, structured, isArticle } = extractContent(
      page.html,
      page.finalUrl,
      page.contentType,
    );

    const normalized = normalizeContent(article, structured, options.maxContentLength || 8000);

    if (normalized.length < 50) {
      return null;
    }

    let markdown: string | undefined;
    if (isArticle) {
      try {
        markdown = htmlToMarkdown(article?.content || page.html);
        if (markdown.length > (options.maxContentLength || 8000)) {
          markdown = markdown.slice(0, options.maxContentLength || 8000) + "...";
        }
      } catch {
        // Fall back to normalized content
      }
    }

    contentCache.set(cacheKey, normalized);

    return { content: normalized, isArticle, markdown };
  } catch (error) {
    logger.debug(`Failed to fetch/extract ${url}: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

/* ================================================================
 * BROWSER ESCALATION
 *
 * When HTTP extraction returns insufficient content (SPA shells,
 * JavaScript-rendered pages, dynamic content), escalate to Playwright
 * browser for rendering and extraction.
 * ================================================================ */

const SPA_INDICATORS = [
  /<div\s+id=["']?root["']?\s*>/i,
  /<div\s+id=["']?app["']?\s*>/i,
  /<div\s+id=["']?__next["']?\s*>/i,
  /<noscript>/i,
  /<script\s+type=["']?module["']?\s*>/i,
  /react|vue|angular|svelte/i,
];

const MINIMAL_CONTENT_THRESHOLD = 200;

function looksLikeSpaShell(html: string): boolean {
  const textOnly = html.replace(/<[^>]+>/g, "").trim();
  if (textOnly.length < MINIMAL_CONTENT_THRESHOLD) {
    return true;
  }
  return SPA_INDICATORS.some((p) => p.test(html)) && textOnly.length < 500;
}

async function browserEscalate(
  url: string,
  options: { maxContentLength?: number; timeoutMs?: number } = {},
): Promise<{ content: string; title: string } | null> {
  const manager = getBrowserManager();
  if (!manager.isAvailable()) {
    return null;
  }

  const userId = "__pipeline__";
  const guildId = "__pipeline__";

  // Create isolated session
  const { sessionId, available } = await manager.createSession(userId, guildId);
  if (!available || !sessionId) {
    return null;
  }

  try {
    // Navigate
    const nav = await manager.navigate(sessionId, url);
    if (!nav.success) {
      return null;
    }

    // Wait a bit for JavaScript to render
    const page = manager.getPage(sessionId);
    if (!page) return null;

    await page.waitForTimeout(2000).catch(() => {});

    // Extract content
    const extracted = await manager.extractContent(sessionId);
    if (!extracted.success || !extracted.text) {
      return null;
    }

    const maxLen = options.maxContentLength || 8000;
    const content = extracted.text.length > maxLen
      ? extracted.text.slice(0, maxLen) + "..."
      : extracted.text;

    return { content, title: extracted.title || nav.title || "" };
  } finally {
    await manager.closeSession(sessionId);
  }
}

async function fetchAndExtractWithBrowser(
  url: string,
  options: {
    maxContentLength?: number;
    timeoutMs?: number;
  },
): Promise<{ content: string; isArticle: boolean; markdown?: string } | null> {
  // First try normal HTTP extraction
  const normalResult = await fetchAndExtract(url, options);

  // If normal extraction succeeded with sufficient content, return it
  if (normalResult && normalResult.content.length >= MINIMAL_CONTENT_THRESHOLD) {
    return normalResult;
  }

  // Check if the page looks like an SPA shell
  try {
    const page = await fetchPage(url, {
      timeoutMs: options.timeoutMs || 10_000,
      maxRetries: 0,
      useCache: false,
      respectRobots: false,
    });

    if (looksLikeSpaShell(page.html)) {
      logger.debug(`🌐 SPA detected, escalating to browser: ${url}`);
      const browserResult = await browserEscalate(url, options);
      if (browserResult && browserResult.content.length > MINIMAL_CONTENT_THRESHOLD) {
        return {
          content: browserResult.content,
          isArticle: false,
          markdown: browserResult.content,
        };
      }
    }
  } catch {
    // If we can't even fetch the page, try browser directly
    logger.debug(`🌐 HTTP fetch failed, trying browser: ${url}`);
    const browserResult = await browserEscalate(url, options);
    if (browserResult && browserResult.content.length > MINIMAL_CONTENT_THRESHOLD) {
      return {
        content: browserResult.content,
        isArticle: false,
        markdown: browserResult.content,
      };
    }
  }

  // Return whatever normal extraction gave us (may be null or minimal)
  return normalResult;
}

export async function webPipeline(
  query: string,
  options: PipelineOptions = {},
): Promise<WebPipelineResult> {
  const {
    searchCount = 5,
    maxSources = 5,
    maxContentLength = 8000,
    fetchConcurrency = 3,
    timeoutMs = 15_000,
    apiKey,
  } = options;

  logger.debug(`Web pipeline: "${query}"`);

  const searchResults = await webSearch(query, searchCount, apiKey);

  if (searchResults.results.length === 0) {
    return {
      query,
      sources: [],
      answer: `No web results found for: ${query}`,
    };
  }

  const dedupedResults = deduplicateUrls(searchResults.results);

  const fetchLimit = pLimit(fetchConcurrency);

  const fetchPromises = dedupedResults
    .slice(0, maxSources)
    .map((result) =>
      fetchLimit(async () => {
        if (!isUrlFetchable(result.url) || shouldSkipUrl(result.url)) {
          return {
            title: result.title,
            url: result.url,
            snippet: cleanSnippet(result.description),
            extractedContent: undefined,
            contentType: undefined,
          };
        }

        const extracted = await fetchAndExtractWithBrowser(result.url, {
          maxContentLength,
          timeoutMs,
        });

        const content = extracted?.markdown || extracted?.content;

        return {
          title: result.title,
          url: result.url,
          snippet: cleanSnippet(result.description),
          extractedContent: content,
          contentType: extracted?.isArticle ? "article" : "structured",
        };
      }),
    );

  const settledResults = await Promise.allSettled(fetchPromises);

  const sources: WebSource[] = [];
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
          domain: extractDomain(value.url),
        });
      }
    }
  }

  const rankedLists = [
    dedupedResults.map((r, rank) => ({ item: r, rank })),
  ];

  const rrfScores = reciprocalRankFusion(rankedLists);

  for (const source of sources) {
    const originalResult = dedupedResults.find(
      (r) => canonicalizeUrl(r.url) === canonicalizeUrl(source.url),
    );
    const rrf = originalResult ? rrfScores.get(originalResult) || 0 : 0;
    source.score = computeSourceScore(source, query, rrf, sources.length);
  }

  sources.sort((a, b) => (b.score || 0) - (a.score || 0));

  const diversified = enforceDomainDiversity(sources, maxSources);

  const contextParts = diversified.map((s, i) => {
    const header = `[Source ${i + 1}: ${s.title}](${s.url})`;
    if (s.extractedContent) {
      return `${header}\n${s.extractedContent}`;
    }
    return `${header}\n${s.snippet}`;
  });

  return {
    query,
    sources: diversified,
    answer: contextParts.join("\n\n---\n\n"),
  };
}

function enforceDomainDiversity(sources: WebSource[], max: number): WebSource[] {
  const result: WebSource[] = [];
  const domainCounts = new Map<string, number>();

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

export function clearWebCaches(): void {
  contentCache.clear();
}
