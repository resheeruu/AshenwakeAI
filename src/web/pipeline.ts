import pLimit from "p-limit";
import { LRUCache } from "lru-cache";
import { logger } from "../logger";
import { webSearch, type SearchResult } from "./search";
import { fetchPage, type FetchedPage } from "./fetch";
import { extractContent, normalizeContent } from "./extract";

export interface WebSource {
  title: string;
  url: string;
  snippet: string;
  extractedContent?: string;
  contentType?: string;
}

export interface WebPipelineResult {
  query: string;
  sources: WebSource[];
  answer: string;
  totalTokens?: number;
}

export interface PipelineOptions {
  searchCount?: number;
  maxSources?: number;
  maxContentLength?: number;
  fetchConcurrency?: number;
  timeoutMs?: number;
  apiKey?: string;
}

const concurrencyLimit = pLimit(3);

const contentCache = new LRUCache<string, string>({
  max: 500,
  ttl: 1000 * 60 * 30,
});

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
): Promise<{ content: string; isArticle: boolean } | null> {
  const cacheKey = `extract:${url}`;
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

    contentCache.set(cacheKey, normalized);

    return { content: normalized, isArticle };
  } catch (error) {
    logger.debug(`🌐 Failed to fetch/extract ${url}: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
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

  logger.debug(`🌐 Web pipeline: "${query}"`);

  const searchResults = await webSearch(query, searchCount, apiKey);

  if (searchResults.results.length === 0) {
    return {
      query,
      sources: [],
      answer: `No web results found for: ${query}`,
    };
  }

  const fetchLimit = pLimit(fetchConcurrency);

  const fetchPromises = searchResults.results
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

        const extracted = await fetchAndExtract(result.url, {
          maxContentLength,
          timeoutMs,
        });

        return {
          title: result.title,
          url: result.url,
          snippet: cleanSnippet(result.description),
          extractedContent: extracted?.content,
          contentType: extracted?.isArticle ? "article" : "structured",
        };
      }),
    );

  const settledResults = await Promise.allSettled(fetchPromises);

  const sources: WebSource[] = [];
  for (const result of settledResults) {
    if (result.status === "fulfilled") {
      const value = result.value;
      if (value.snippet || value.extractedContent) {
        sources.push({
          title: value.title,
          url: value.url,
          snippet: value.snippet,
          extractedContent: value.extractedContent,
          contentType: value.contentType,
        });
      }
    }
  }

  const contextParts = sources.map((s, i) => {
    const header = `[Source ${i + 1}: ${s.title}](${s.url})`;
    if (s.extractedContent) {
      return `${header}\n${s.extractedContent}`;
    }
    return `${header}\n${s.snippet}`;
  });

  return {
    query,
    sources,
    answer: contextParts.join("\n\n---\n\n"),
  };
}

export function clearWebCaches(): void {
  contentCache.clear();
}
