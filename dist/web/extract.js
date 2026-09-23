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
var extract_exports = {};
__export(extract_exports, {
  extractArticle: () => extractArticle,
  extractContent: () => extractContent,
  extractStructured: () => extractStructured,
  extractStructuredLightweight: () => extractStructuredLightweight,
  normalizeContent: () => normalizeContent
});
module.exports = __toCommonJS(extract_exports);
var import_readability = require("@mozilla/readability");
var import_linkedom = require("linkedom");
var cheerio = __toESM(require("cheerio"));
var import_node_html_parser = require("node-html-parser");
var import_logger = require("../logger");
function isArticleContent(contentType, html) {
  if (contentType.includes("text/html") || contentType.includes("application/xhtml+xml")) {
    const lowerHtml = html.toLowerCase();
    const hasArticleMarkers = lowerHtml.includes("<article") || lowerHtml.includes('role="article"') || lowerHtml.includes("<main") || lowerHtml.includes('class="post"') || lowerHtml.includes('class="article"') || lowerHtml.includes('class="content"');
    return hasArticleMarkers;
  }
  return false;
}
function extractArticle(html, url) {
  try {
    const { document } = (0, import_linkedom.parseHTML)(html);
    const reader = new import_readability.Readability(document, {
      charThreshold: 100,
      keepClasses: false
    });
    const article = reader.parse();
    if (!article || !article.content || article.content.length < 50) {
      return null;
    }
    const cleaned = article.content.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "").replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "").replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, "").replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, "").replace(/\s+/g, " ").trim();
    return {
      title: article.title || "",
      content: cleaned,
      textContent: article.textContent || cleaned.replace(/<[^>]+>/g, ""),
      length: cleaned.length,
      siteName: article.siteName || "",
      excerpt: article.excerpt || "",
      byline: article.byline || "",
      dir: article.dir || "",
      lang: article.lang || ""
    };
  } catch (error) {
    import_logger.logger.debug(`\u{1F4F0} Readability extraction failed for ${url}: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}
function extractStructured(html, baseUrl) {
  const $ = cheerio.load(html);
  $("script, style, nav, footer, noscript, iframe").remove();
  let pageHost = "";
  try {
    if (baseUrl) {
      pageHost = new URL(baseUrl).hostname.replace(/^www\./, "");
    }
  } catch {
  }
  const headings = [];
  $(":h1, :h2, :h3, :h4, :h5, :h6").each((_, el) => {
    const level = parseInt(el.tagName?.replace("h", "") || "1", 10);
    const text = $(el).text().trim();
    if (text) headings.push({ level, text });
  });
  const links = [];
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
  const images = [];
  $("img[src]").each((_, el) => {
    const src = $(el).attr("src") || "";
    const alt = $(el).attr("alt") || "";
    const width = $(el).attr("width");
    const height = $(el).attr("height");
    if (src) images.push({ src, alt, width, height });
  });
  const tables = [];
  $("table").each((_, table) => {
    const headers = [];
    $(table).find("thead th, thead td").each((_2, th) => {
      headers.push($(th).text().trim());
    });
    const rows = [];
    $(table).find("tbody tr, tr").each((_2, tr) => {
      const cells = [];
      $(tr).find("td, th").each((_3, td) => {
        cells.push($(td).text().trim());
      });
      if (cells.length > 0) rows.push(cells);
    });
    if (headers.length > 0 || rows.length > 0) {
      tables.push({ headers, rows });
    }
  });
  const metadata = {};
  $("meta[name]").each((_, el) => {
    const name = $(el).attr("name") || "";
    const content = $(el).attr("content") || "";
    if (name && content) metadata[name] = content;
  });
  const openGraph = {};
  $("meta[property^='og:']").each((_, el) => {
    const property = $(el).attr("property") || "";
    const content = $(el).attr("content") || "";
    if (property && content) openGraph[property.replace("og:", "")] = content;
  });
  const twitterCard = {};
  $("meta[name^='twitter:']").each((_, el) => {
    const name = $(el).attr("name") || "";
    const content = $(el).attr("content") || "";
    if (name && content) twitterCard[name.replace("twitter:", "")] = content;
  });
  return { headings, links, images, tables, metadata, openGraph, twitterCard };
}
function extractContent(html, url, contentType) {
  const isArticle = isArticleContent(contentType, html);
  const article = isArticle ? extractArticle(html, url) : null;
  const structured = extractStructured(html, url);
  return { article, structured, isArticle };
}
function normalizeContent(article, structured, maxLength = 8e3) {
  const parts = [];
  if (article) {
    if (article.title) parts.push(`# ${article.title}`);
    if (article.byline) parts.push(`By: ${article.byline}`);
    if (article.excerpt) parts.push(`
${article.excerpt}`);
    let content = article.textContent || article.content;
    content = content.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    if (content.length > maxLength) {
      content = content.slice(0, maxLength) + "...";
    }
    parts.push(`
${content}`);
  } else {
    if (structured.headings.length > 0) {
      for (const h of structured.headings.slice(0, 10)) {
        parts.push(`${"#".repeat(h.level)} ${h.text}`);
      }
    }
    if (structured.tables.length > 0) {
      for (const table of structured.tables.slice(0, 3)) {
        if (table.headers.length > 0) {
          parts.push(`
| ${table.headers.join(" | ")} |`);
          parts.push(`| ${table.headers.map(() => "---").join(" | ")} |`);
        }
        for (const row of table.rows.slice(0, 20)) {
          parts.push(`| ${row.join(" | ")} |`);
        }
      }
    }
    if (structured.metadata.description) {
      parts.push(`
${structured.metadata.description}`);
    }
  }
  return parts.join("\n").trim();
}
function extractStructuredLightweight(html, baseUrl) {
  const root = (0, import_node_html_parser.parse)(html, { comment: false });
  root.querySelectorAll("script, style, nav, footer, noscript, iframe").forEach((el) => el.remove());
  let pageHost = "";
  try {
    if (baseUrl) {
      pageHost = new URL(baseUrl).hostname.replace(/^www\./, "");
    }
  } catch {
  }
  const headings = [];
  root.querySelectorAll("h1, h2, h3, h4, h5, h6").forEach((el) => {
    const level = parseInt(el.tagName?.toLowerCase().replace("h", "") || "1", 10);
    const text = el.textContent?.trim() || "";
    if (text) headings.push({ level, text });
  });
  const links = [];
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
  const images = [];
  root.querySelectorAll("img[src]").forEach((el) => {
    const src = el.getAttribute("src") || "";
    const alt = el.getAttribute("alt") || "";
    const width = el.getAttribute("width");
    const height = el.getAttribute("height");
    if (src) images.push({ src, alt, width, height });
  });
  const tables = [];
  root.querySelectorAll("table").forEach((table) => {
    const headers = [];
    table.querySelectorAll("thead th, thead td").forEach((th) => {
      headers.push(th.textContent?.trim() || "");
    });
    const rows = [];
    table.querySelectorAll("tbody tr, tr").forEach((tr) => {
      const cells = [];
      tr.querySelectorAll("td, th").forEach((td) => {
        cells.push(td.textContent?.trim() || "");
      });
      if (cells.length > 0) rows.push(cells);
    });
    if (headers.length > 0 || rows.length > 0) {
      tables.push({ headers, rows });
    }
  });
  const metadata = {};
  root.querySelectorAll("meta[name]").forEach((el) => {
    const name = el.getAttribute("name") || "";
    const content = el.getAttribute("content") || "";
    if (name && content) metadata[name] = content;
  });
  const openGraph = {};
  root.querySelectorAll("meta[property^='og:']").forEach((el) => {
    const property = el.getAttribute("property") || "";
    const content = el.getAttribute("content") || "";
    if (property && content) openGraph[property.replace("og:", "")] = content;
  });
  const twitterCard = {};
  root.querySelectorAll("meta[name^='twitter:']").forEach((el) => {
    const name = el.getAttribute("name") || "";
    const content = el.getAttribute("content") || "";
    if (name && content) twitterCard[name.replace("twitter:", "")] = content;
  });
  return { headings, links, images, tables, metadata, openGraph, twitterCard };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  extractArticle,
  extractContent,
  extractStructured,
  extractStructuredLightweight,
  normalizeContent
});
