import TurndownService from "turndown";
import { distance } from "fastest-levenshtein";

/**
 * Text processing utilities for the web pipeline.
 * Integrates turndown (HTML→Markdown), fastest-levenshtein (string distance),
 * and provides deduplication/scoring helpers.
 */

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-",
});

turndown.remove(["script", "style", "nav", "footer", "noscript", "iframe"]);

/**
 * Convert HTML to clean Markdown for LLM context.
 */
export function htmlToMarkdown(html: string): string {
  try {
    return turndown.turndown(html).trim();
  } catch {
    return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }
}

/**
 * Calculate normalized similarity between two strings (0-1, 1 = identical).
 */
export function stringSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;
  const maxLen = Math.max(a.length, b.length);
  const dist = distance(a.toLowerCase(), b.toLowerCase());
  return 1 - dist / maxLen;
}

/**
 * Check if two strings are near-duplicates (similarity > threshold).
 */
export function isNearDuplicate(a: string, b: string, threshold = 0.85): boolean {
  return stringSimilarity(a, b) > threshold;
}

/**
 * Deduplicate items by a key function, keeping the first occurrence.
 */
export function deduplicateBy<T>(items: T[], keyFn: (item: T) => string): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    const key = keyFn(item);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(item);
    }
  }
  return result;
}

/**
 * Deduplicate strings by similarity, keeping the first occurrence.
 */
export function deduplicateStrings(items: string[], threshold = 0.85): string[] {
  const result: string[] = [];
  for (const item of items) {
    const isDupe = result.some((existing) => isNearDuplicate(existing, item, threshold));
    if (!isDupe) result.push(item);
  }
  return result;
}

/**
 * Score text relevance to a query based on term overlap.
 */
export function termOverlapScore(query: string, text: string): number {
  const queryTerms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const textLower = text.toLowerCase();
  if (queryTerms.length === 0) return 0;
  let matches = 0;
  for (const term of queryTerms) {
    if (textLower.includes(term)) matches++;
  }
  return matches / queryTerms.length;
}
