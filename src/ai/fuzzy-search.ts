import Fuse from "fuse.js";

/**
 * Fuzzy search utility using fuse.js.
 * Provides ranked fuzzy search over structured data.
 */

export interface SearchResult<T> {
  item: T;
  score: number;
}

/**
 * Create a fuzzy searcher over an array of items.
 */
export function createFuzzySearch<T>(
  items: T[],
  keys: string[],
  options?: {
    threshold?: number;
    includeScore?: boolean;
  },
): (query: string) => SearchResult<T>[] {
  const fuse = new Fuse(items, {
    keys,
    threshold: options?.threshold ?? 0.4,
    includeScore: true,
    ignoreLocation: true,
    minMatchCharLength: 2,
  });

  return (query: string): SearchResult<T>[] => {
    const results = fuse.search(query);
    return results.map((r) => ({
      item: r.item,
      score: r.score ?? 0,
    }));
  };
}

/**
 * Simple fuzzy match score for a single query against text.
 * Returns 0-1 (lower = better match).
 */
export function fuzzyScore(query: string, text: string): number {
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
