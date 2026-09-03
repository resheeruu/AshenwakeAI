import { LRUCache } from "lru-cache";
import { logger } from "../logger";

interface RobotsRule {
  userAgent: string;
  allow: string[];
  disallow: string[];
  crawlDelay?: number;
}

interface ParsedRobots {
  rules: RobotsRule[];
  sitemaps: string[];
  fetchedAt: number;
}

const robotsCache = new LRUCache<string, ParsedRobots>({
  max: 200,
  ttl: 1000 * 60 * 60,
});

function parseRobotsTxt(content: string): ParsedRobots {
  const lines = content.split(/\r?\n/);
  const rules: RobotsRule[] = [];
  const sitemaps: string[] = [];
  let current: RobotsRule | null = null;

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
        disallow: [],
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

function matchPattern(pattern: string, path: string): boolean {
  if (!pattern) return false;

  const regexPattern = pattern
    .replace(/\*/g, ".*")
    .replace(/\$/g, "$");

  try {
    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(path);
  } catch {
    return pattern === path;
  }
}

function isAllowed(robots: ParsedRobots, url: string, userAgent = "*"): boolean {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname + parsed.search;

    let matchingRule: RobotsRule | null = null;

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

async function fetchRobotsTxt(origin: string): Promise<ParsedRobots> {
  const cached = robotsCache.get(origin);
  if (cached) {
    return cached;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5_000);

    try {
      const response = await fetch(`${origin}/robots.txt`, {
        headers: {
          "User-Agent": "AshenAI/1.0 (https://github.com/AshenAI)",
          Accept: "text/plain",
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        const empty: ParsedRobots = { rules: [], sitemaps: [], fetchedAt: Date.now() };
        robotsCache.set(origin, empty);
        return empty;
      }

      const content = await response.text();
      const parsed = parseRobotsTxt(content);
      robotsCache.set(origin, parsed);
      return parsed;
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    const empty: ParsedRobots = { rules: [], sitemaps: [], fetchedAt: Date.now() };
    robotsCache.set(origin, empty);
    return empty;
  }
}

export async function isUrlAllowedByRobots(url: string): Promise<boolean> {
  try {
    const parsed = new URL(url);
    const origin = `${parsed.protocol}//${parsed.host}`;
    const robots = await fetchRobotsTxt(origin);
    return isAllowed(robots, url);
  } catch {
    return true;
  }
}

export function clearRobotsCache(): void {
  robotsCache.clear();
}
