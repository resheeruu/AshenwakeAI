import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import * as cheerio from "cheerio";
import { parse as parseHtml } from "node-html-parser";
import { logger } from "../logger";

export interface ExtractedContent {
  title: string;
  content: string;
  textContent: string;
  length: number;
  siteName: string;
  excerpt: string;
  byline: string;
  dir: string;
  lang: string;
}

export interface StructuredData {
  headings: { level: number; text: string }[];
  links: { text: string; href: string; isExternal: boolean }[];
  images: { src: string; alt: string; width?: string; height?: string }[];
  tables: { headers: string[]; rows: string[][] }[];
  metadata: Record<string, string>;
  openGraph: Record<string, string>;
  twitterCard: Record<string, string>;
}

function isArticleContent(contentType: string, html: string): boolean {
  if (contentType.includes("text/html") || contentType.includes("application/xhtml+xml")) {
    const lowerHtml = html.toLowerCase();
    const hasArticleMarkers =
      lowerHtml.includes("<article") ||
      lowerHtml.includes('role="article"') ||
      lowerHtml.includes("<main") ||
      lowerHtml.includes('class="post"') ||
      lowerHtml.includes('class="article"') ||
      lowerHtml.includes('class="content"');
    return hasArticleMarkers;
  }
  return false;
}

export function extractArticle(html: string, url: string): ExtractedContent | null {
  try {
    const { document } = parseHTML(html);
    const reader = new Readability(document, {
      charThreshold: 100,
      keepClasses: false,
    });

    const article = reader.parse();

    if (!article || !article.content || article.content.length < 50) {
      return null;
    }

    const cleaned = article.content
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
      .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, "")
      .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, "")
      .replace(/\s+/g, " ")
      .trim();

    return {
      title: article.title || "",
      content: cleaned,
      textContent: article.textContent || cleaned.replace(/<[^>]+>/g, ""),
      length: cleaned.length,
      siteName: article.siteName || "",
      excerpt: article.excerpt || "",
      byline: article.byline || "",
      dir: article.dir || "",
      lang: article.lang || "",
    };
  } catch (error) {
    logger.debug(`📰 Readability extraction failed for ${url}: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

export function extractStructured(html: string, baseUrl?: string): StructuredData {
  const $ = cheerio.load(html);

  $("script, style, nav, footer, noscript, iframe").remove();

  let pageHost = "";
  try {
    if (baseUrl) {
      pageHost = new URL(baseUrl).hostname.replace(/^www\./, "");
    }
  } catch {}

  const headings: { level: number; text: string }[] = [];
  $(":h1, :h2, :h3, :h4, :h5, :h6").each((_, el) => {
    const level = parseInt(el.tagName?.replace("h", "") || "1", 10);
    const text = $(el).text().trim();
    if (text) headings.push({ level, text });
  });

  const links: { text: string; href: string; isExternal: boolean }[] = [];
  $("a[href]").each((_, el) => {
    const text = $(el).text().trim();
    const href = $(el).attr("href") || "";
    if (text && href && !href.startsWith("#") && !href.startsWith("javascript:")) {
      let isExternal = true;
      if (href.startsWith("/") || href.startsWith("#")) {
        isExternal = false;
      } else if (pageHost) {
        try {
          const linkHost = new URL(href).hostname.replace(/^www\./, "");
          isExternal = linkHost !== pageHost;
        } catch {
          isExternal = true;
        }
      }
      links.push({ text, href, isExternal });
    }
  });

  const images: { src: string; alt: string; width?: string; height?: string }[] = [];
  $("img[src]").each((_, el) => {
    const src = $(el).attr("src") || "";
    const alt = $(el).attr("alt") || "";
    const width = $(el).attr("width");
    const height = $(el).attr("height");
    if (src) images.push({ src, alt, width, height });
  });

  const tables: { headers: string[]; rows: string[][] }[] = [];
  $("table").each((_, table) => {
    const headers: string[] = [];
    $(table).find("thead th, thead td").each((_, th) => {
      headers.push($(th).text().trim());
    });

    const rows: string[][] = [];
    $(table).find("tbody tr, tr").each((_, tr) => {
      const cells: string[] = [];
      $(tr).find("td, th").each((_, td) => {
        cells.push($(td).text().trim());
      });
      if (cells.length > 0) rows.push(cells);
    });

    if (headers.length > 0 || rows.length > 0) {
      tables.push({ headers, rows });
    }
  });

  const metadata: Record<string, string> = {};
  $("meta[name]").each((_, el) => {
    const name = $(el).attr("name") || "";
    const content = $(el).attr("content") || "";
    if (name && content) metadata[name] = content;
  });

  const openGraph: Record<string, string> = {};
  $("meta[property^='og:']").each((_, el) => {
    const property = $(el).attr("property") || "";
    const content = $(el).attr("content") || "";
    if (property && content) openGraph[property.replace("og:", "")] = content;
  });

  const twitterCard: Record<string, string> = {};
  $("meta[name^='twitter:']").each((_, el) => {
    const name = $(el).attr("name") || "";
    const content = $(el).attr("content") || "";
    if (name && content) twitterCard[name.replace("twitter:", "")] = content;
  });

  return { headings, links, images, tables, metadata, openGraph, twitterCard };
}

export function extractContent(html: string, url: string, contentType: string): {
  article: ExtractedContent | null;
  structured: StructuredData;
  isArticle: boolean;
} {
  const isArticle = isArticleContent(contentType, html);
  const article = isArticle ? extractArticle(html, url) : null;
  const structured = extractStructured(html, url);

  return { article, structured, isArticle };
}

export function normalizeContent(
  article: ExtractedContent | null,
  structured: StructuredData,
  maxLength = 8000,
): string {
  const parts: string[] = [];

  if (article) {
    if (article.title) parts.push(`# ${article.title}`);
    if (article.byline) parts.push(`By: ${article.byline}`);
    if (article.excerpt) parts.push(`\n${article.excerpt}`);

    let content = article.textContent || article.content;
    content = content.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

    if (content.length > maxLength) {
      content = content.slice(0, maxLength) + "...";
    }

    parts.push(`\n${content}`);
  } else {
    if (structured.headings.length > 0) {
      for (const h of structured.headings.slice(0, 10)) {
        parts.push(`${"#".repeat(h.level)} ${h.text}`);
      }
    }

    if (structured.tables.length > 0) {
      for (const table of structured.tables.slice(0, 3)) {
        if (table.headers.length > 0) {
          parts.push(`\n| ${table.headers.join(" | ")} |`);
          parts.push(`| ${table.headers.map(() => "---").join(" | ")} |`);
        }
        for (const row of table.rows.slice(0, 20)) {
          parts.push(`| ${row.join(" | ")} |`);
        }
      }
    }

    if (structured.metadata.description) {
      parts.push(`\n${structured.metadata.description}`);
    }
  }

  return parts.join("\n").trim();
}

/**
 * Lightweight structured extraction using node-html-parser.
 * 3-4x faster than cheerio for simple extractions.
 * Used as fallback or for quick metadata extraction.
 */
export function extractStructuredLightweight(html: string, baseUrl?: string): StructuredData {
  const root = parseHtml(html, { comment: false });

  root.querySelectorAll("script, style, nav, footer, noscript, iframe").forEach((el) => el.remove());

  let pageHost = "";
  try {
    if (baseUrl) {
      pageHost = new URL(baseUrl).hostname.replace(/^www\./, "");
    }
  } catch {}

  const headings: { level: number; text: string }[] = [];
  root.querySelectorAll("h1, h2, h3, h4, h5, h6").forEach((el) => {
    const level = parseInt(el.tagName?.toLowerCase().replace("h", "") || "1", 10);
    const text = el.textContent?.trim() || "";
    if (text) headings.push({ level, text });
  });

  const links: { text: string; href: string; isExternal: boolean }[] = [];
  root.querySelectorAll("a[href]").forEach((el) => {
    const text = el.textContent?.trim() || "";
    const href = el.getAttribute("href") || "";
    if (text && href && !href.startsWith("#") && !href.startsWith("javascript:")) {
      let isExternal = true;
      if (href.startsWith("/") || href.startsWith("#")) {
        isExternal = false;
      } else if (pageHost) {
        try {
          const linkHost = new URL(href).hostname.replace(/^www\./, "");
          isExternal = linkHost !== pageHost;
        } catch {
          isExternal = true;
        }
      }
      links.push({ text, href, isExternal });
    }
  });

  const images: { src: string; alt: string; width?: string; height?: string }[] = [];
  root.querySelectorAll("img[src]").forEach((el) => {
    const src = el.getAttribute("src") || "";
    const alt = el.getAttribute("alt") || "";
    const width = el.getAttribute("width");
    const height = el.getAttribute("height");
    if (src) images.push({ src, alt, width, height });
  });

  const tables: { headers: string[]; rows: string[][] }[] = [];
  root.querySelectorAll("table").forEach((table) => {
    const headers: string[] = [];
    table.querySelectorAll("thead th, thead td").forEach((th) => {
      headers.push(th.textContent?.trim() || "");
    });

    const rows: string[][] = [];
    table.querySelectorAll("tbody tr, tr").forEach((tr) => {
      const cells: string[] = [];
      tr.querySelectorAll("td, th").forEach((td) => {
        cells.push(td.textContent?.trim() || "");
      });
      if (cells.length > 0) rows.push(cells);
    });

    if (headers.length > 0 || rows.length > 0) {
      tables.push({ headers, rows });
    }
  });

  const metadata: Record<string, string> = {};
  root.querySelectorAll("meta[name]").forEach((el) => {
    const name = el.getAttribute("name") || "";
    const content = el.getAttribute("content") || "";
    if (name && content) metadata[name] = content;
  });

  const openGraph: Record<string, string> = {};
  root.querySelectorAll("meta[property^='og:']").forEach((el) => {
    const property = el.getAttribute("property") || "";
    const content = el.getAttribute("content") || "";
    if (property && content) openGraph[property.replace("og:", "")] = content;
  });

  const twitterCard: Record<string, string> = {};
  root.querySelectorAll("meta[name^='twitter:']").forEach((el) => {
    const name = el.getAttribute("name") || "";
    const content = el.getAttribute("content") || "";
    if (name && content) twitterCard[name.replace("twitter:", "")] = content;
  });

  return { headings, links, images, tables, metadata, openGraph, twitterCard };
}
