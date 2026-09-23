import { LRUCache } from "lru-cache";
import { logger } from "../logger";
import { hardenedFetch, readLimitedText } from "../security/outbound-fetch";
import { validateOutboundUrl } from "../security/network-boundary";

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

const MAX_ROBOTS_BYTES = 256 * 1024;
const ROBOTS_TIMEOUT_MS = 5_000;

async function fetchRobotsTxt(origin: string): Promise<ParsedRobots> {
  const cached = robotsCache.get(origin);
  if (cached) {
    return cached;
  }

  const empty: ParsedRobots = { rules: [], sitemaps: [], fetchedAt: Date.now() };

  try {
    // Same canonical outbound boundary as page fetch: URL validation +
    // DNS resolution + IP classification + redirect validation. Never a
    // raw fetch() to a user-controlled origin.
    const robotsUrl = `${origin.replace(/\/$/, "")}/robots.txt`;
    const urlCheck = validateOutboundUrl(robotsUrl);
    if (!urlCheck.valid) {
      robotsCache.set(origin, empty);
      return empty;
    }

    const { response } = await hardenedFetch(robotsUrl, {
      timeoutMs: ROBOTS_TIMEOUT_MS,
      maxRedirects: 3,
      maxResponseBytes: MAX_ROBOTS_BYTES,
      headers: {
        "User-Agent": "AshenAI/1.0 (https://github.com/AshenAI)",
        Accept: "text/plain",
      },
    });

    if (!response.ok) {
      robotsCache.set(origin, empty);
      return empty;
    }

    const content = await readLimitedText(response, MAX_ROBOTS_BYTES);
    const parsed = parseRobotsTxt(content);
    robotsCache.set(origin, parsed);
    return parsed;
  } catch {
    // Fail-closed for policy: on blocked/unreachable robots, treat as empty
    // rules (no disallow) but never bypass the SSRF boundary.
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
