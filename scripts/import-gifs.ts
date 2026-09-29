#!/usr/bin/env node
/* ================================================================
 * ASHENAI MANUAL GIF IMPORT PIPELINE
 *
 * URL → parallel download → validate → SHA-256 → dedup →
 * license classify → atomic save → manifest → attribution →
 * LocalGifProvider-ready
 *
 * Usage:
 *   npx tsx scripts/import-gifs.ts scripts/gif-import.txt
 *   npm run import:gifs -- --dry-run
 *   npm run import:gifs -- --action destroy
 *   npm run import:gifs -- --action destroy,explode --limit 25
 *
 * Env:
 *   GIF_IMPORT_CONCURRENCY=12 (default 12)
 *   ASHENAI_DATA_DIR (respected via getDataDir)
 * ================================================================ */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import pLimit from "p-limit";
import { getAllActions } from "../src/games/anime-actions/definitions";
import { validateMediaUrl } from "../src/games/anime-actions/media-security";
import {
  hardenedFetch,
  readLimitedBytes,
} from "../src/security/outbound-fetch";
import { getDataDir } from "../src/config/data-dir";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const CATEGORY_MAP: Record<string, string> = {
  hug: "affection",
  cuddle: "affection",
  pat: "affection",
  headpat: "affection",
  kiss: "affection",
  punch: "combat",
  kick: "combat",
  slap: "combat",
  bonk: "combat",
  bite: "combat",
  hit: "combat",
  smack: "combat",
  throw: "combat",
  shoot: "combat",
  stab: "combat",
  kill: "combat",
  destroy: "combat",
  explode: "combat",
  poke: "fun",
  wave: "fun",
  highfive: "fun",
  yeet: "fun",
  dance: "fun",
  laugh: "fun",
  cry: "fun",
  blush: "fun",
  smug: "fun",
  panic: "fun",
  sleep: "fun",
  celebrate: "fun",
  roast: "fun",
  simp: "fun",
};

const ALL_ACTIONS = new Set(getAllActions().map((a) => a.mediaKey));

const MAX_GIF_BYTES = 8 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 3;

type LicenseClass = "VERIFIED" | "UNVERIFIED" | "REJECTED";

interface ImportEntry {
  line: number;
  action: string;
  gifUrl: string;
  licenseRaw: string;
  sourceUrl: string;
  creator: string;
}

interface ParsedInput {
  entries: ImportEntry[];
  skipped: number;
}

function normalizeLicense(raw: string): {
  cls: LicenseClass;
  canonical: string;
} {
  const t = (raw || "").trim();
  if (!t) return { cls: "UNVERIFIED", canonical: "unverified" };
  const low = t.toLowerCase().replace(/[_\s]+/g, "-");
  const allowed = new Set([
    "cc0",
    "cc0-1.0",
    "cc0-1.0-universal",
    "public-domain",
    "publicdomain",
    "cc-by",
    "cc-by-4.0",
    "cc-by-3.0",
    "cc-by-sa",
    "cc-by-sa-4.0",
    "cc-by-sa-3.0",
  ]);
  if (allowed.has(low)) {
    let canonical = t;
    if (low.startsWith("cc0")) canonical = "CC0";
    else if (low.startsWith("public")) canonical = "Public Domain";
    else if (low.startsWith("cc-by-sa")) canonical = "CC-BY-SA";
    else if (low.startsWith("cc-by")) canonical = "CC-BY";
    return { cls: "VERIFIED", canonical };
  }
  return { cls: "REJECTED", canonical: t.slice(0, 120) };
}

function parseInputFile(content: string): ParsedInput {
  const entries: ImportEntry[] = [];
  let skipped = 0;
  const lines = content.split(/\r?\n/);
  lines.forEach((rawLine, idx) => {
    const lineNo = idx + 1;
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      return;
    }
    const parts = rawLine.split("|").map((p) => p.trim());
    if (parts.length < 2 || !parts[0] || !parts[1]) {
      skipped++;
      return;
    }
    entries.push({
      line: lineNo,
      action: parts[0].toLowerCase(),
      gifUrl: parts[1],
      licenseRaw: parts[2] || "",
      sourceUrl: parts[3] || "",
      creator: parts[4] || "",
    });
  });
  return { entries, skipped };
}

function isValidGif(buffer: Buffer): boolean {
  if (buffer.length < 10) return false;
  const sig = buffer.toString("latin1", 0, 6);
  return sig === "GIF87a" || sig === "GIF89a";
}

function sha256Hex(buf: Buffer): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

interface ExistingInventory {
  hashes: Set<string>;
  perActionCount: Map<string, number>;
  manifestAssets: any[];
}

async function loadExistingInventory(
  actionsRoot: string,
  manifestPath: string,
): Promise<ExistingInventory> {
  const hashes = new Set<string>();
  const perActionCount = new Map<string, number>();
  for (const action of ALL_ACTIONS) {
    const dir = path.join(actionsRoot, action);
    let files: string[] = [];
    try {
      files = (await fs.readdir(dir)).filter((f) => f.endsWith(".gif"));
    } catch {
      files = [];
    }
    perActionCount.set(action, files.length);
    for (const f of files) {
      try {
        const buf = await fs.readFile(path.join(dir, f));
        if (buf.length > 0) hashes.add(sha256Hex(buf));
      } catch {
        // ignore unreadable file here; validator reports it
      }
    }
  }
  let manifestAssets: any[] = [];
  try {
    const raw = await fs.readFile(manifestPath, "utf8");
    const parsed = JSON.parse(raw);
    if (Array.isArray((parsed as any).assets)) manifestAssets = (parsed as any).assets;
  } catch {
    manifestAssets = [];
  }
  return { hashes, perActionCount, manifestAssets };
}

function isLicensedProductionLicense(license: string): boolean {
  return normalizeLicense(license).cls === "VERIFIED";
}

async function downloadGifBuffer(url: string): Promise<Buffer> {
  const { response } = await hardenedFetch(url, {
    timeoutMs: DOWNLOAD_TIMEOUT_MS,
    maxRedirects: MAX_REDIRECTS,
    maxResponseBytes: MAX_GIF_BYTES,
    policy: "public",
    requireHttps: true,
  });
  if (!response.ok) {
    throw new Error(`http_${response.status}`);
  }
  const contentType = (response.headers.get("content-type") || "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  // sanity check only — magic bytes are authoritative
  if (
    contentType &&
    contentType !== "image/gif" &&
    !contentType.includes("octet-stream")
  ) {
    throw new Error(`bad_content_type:${contentType.slice(0, 60)}`);
  }
  const buf = await readLimitedBytes(response, MAX_GIF_BYTES);
  return buf;
}

interface ProcessResult {
  entry: ImportEntry;
  status:
    | "imported"
    | "duplicate"
    | "invalid"
    | "download_failed"
    | "unverified"
    | "rejected_license"
    | "invalid_action"
    | "invalid_url";
  detail?: string;
  sha256?: string;
  bytes?: number;
  file?: string;
  licenseCanonical?: string;
}

async function main() {
  const args = process.argv.slice(2);
  const inputFile = args.find((a) => !a.startsWith("--")) || "scripts/gif-import.txt";
  const dryRun = args.includes("--dry-run");
  const actionFilterArg = (() => {
    const i = args.findIndex((a) => a === "--action");
    if (i >= 0 && args[i + 1]) return args[i + 1];
    const eq = args.find((a) => a.startsWith("--action="));
    if (eq) return eq.split("=").slice(1).join("=");
    return "";
  })();
  const limitArg = (() => {
    const i = args.findIndex((a) => a === "--limit");
    if (i >= 0 && args[i + 1]) return Number(args[i + 1]);
    const eq = args.find((a) => a.startsWith("--limit="));
    if (eq) return Number(eq.split("=").slice(1).join("="));
    return NaN;
  })();

  const actionFilter = new Set(
    actionFilterArg
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
  for (const a of actionFilter) {
    if (!ALL_ACTIONS.has(a)) {
      console.error(`Unknown --action filter: ${a}`);
      process.exit(2);
    }
  }

  const concurrency = Math.max(
    1,
    Math.min(32, Number(process.env.GIF_IMPORT_CONCURRENCY || "12") || 12),
  );

  const dataDir = getDataDir();
  const gifRoot = path.join(dataDir, "anime-gifs");
  const actionsRoot = path.join(gifRoot, "actions");
  const manifestPath = path.join(gifRoot, "manifest.json");
  const attributionsPath = path.join(gifRoot, "ATTRIBUTIONS.md");
  const cacheRoot = path.join(dataDir, "anime-gifs-cache");

  await fs.mkdir(actionsRoot, { recursive: true });
  await fs.mkdir(cacheRoot, { recursive: true });

  const resolvedInput = path.isAbsolute(inputFile)
    ? inputFile
    : path.join(ROOT, inputFile);
  let content: string;
  try {
    content = await fs.readFile(resolvedInput, "utf8");
  } catch {
    console.error(`Input file not found: ${resolvedInput}`);
    process.exit(2);
  }

  const { entries: allEntries, skipped } = parseInputFile(content);
  let entries = allEntries;
  if (actionFilter.size > 0) entries = entries.filter((e) => actionFilter.has(e.action));
  if (Number.isFinite(limitArg) && limitArg > 0) entries = entries.slice(0, limitArg);

  const inventory = await loadExistingInventory(actionsRoot, manifestPath);
  const seenHashes = new Set<string>(inventory.hashes);
  const perActionAdded = new Map<string, number>();
  const limit = pLimit(concurrency);

  let downloaded = 0;
  let imported = 0;
  let duplicates = 0;
  let invalid = 0;
  let downloadFailures = 0;
  let unverified = 0;
  let rejected = 0;
  let invalidAction = 0;
  let invalidUrl = 0;

  const newManifestAssets: any[] = [];
  const results: ProcessResult[] = [];

  const tasks = entries.map((entry) =>
    limit(async (): Promise<ProcessResult> => {
      if (!ALL_ACTIONS.has(entry.action)) {
        return { entry, status: "invalid_action", detail: `unknown action ${entry.action}` };
      }
      const urlCheck = validateMediaUrl(entry.gifUrl);
      if (!urlCheck.ok) {
        return { entry, status: "invalid_url", detail: urlCheck.error };
      }
      const lic = normalizeLicense(entry.licenseRaw);
      if (lic.cls === "UNVERIFIED") {
        return { entry, status: "unverified", detail: "missing license metadata" };
      }
      if (lic.cls === "REJECTED") {
        return { entry, status: "rejected_license", detail: `license not allowed: ${lic.canonical}` };
      }
      if (dryRun) {
        return { entry, status: "imported", detail: "dry-run candidate", licenseCanonical: lic.canonical };
      }
      // Download (one failure must not abort batch)
      let buf: Buffer;
      try {
        buf = await downloadGifBuffer(entry.gifUrl);
      } catch (err) {
        return {
          entry,
          status: "download_failed",
          detail: err instanceof Error ? err.message.slice(0, 160) : String(err).slice(0, 160),
        };
      }
      if (!isValidGif(buf) || buf.length === 0 || buf.length > MAX_GIF_BYTES) {
        return { entry, status: "invalid", detail: `invalid gif bytes=${buf.length}` };
      }
      const hash = sha256Hex(buf);
      if (seenHashes.has(hash)) {
        return { entry, status: "duplicate", detail: hash.slice(0, 16), sha256: hash };
      }
      seenHashes.add(hash);

      // Atomic save into production
      const actionDir = path.join(actionsRoot, entry.action);
      await fs.mkdir(actionDir, { recursive: true });
      const existingCount = inventory.perActionCount.get(entry.action) || 0;
      const addedSoFar = perActionAdded.get(entry.action) || 0;
      let idx = existingCount + addedSoFar + 1;
      let fileName = `${entry.action}-${String(idx).padStart(3, "0")}.gif`;
      let finalPath = path.join(actionDir, fileName);
      // avoid filename collision (idempotency safe; hash dedup is authoritative)
      for (let guard = 0; guard < 500; guard++) {
        try {
          await fs.access(finalPath);
          idx++;
          fileName = `${entry.action}-${String(idx).padStart(3, "0")}.gif`;
          finalPath = path.join(actionDir, fileName);
        } catch {
          break;
        }
      }
      const tmpPath = `${finalPath}.tmp-${process.pid}-${entry.line}`;
      try {
        await fs.writeFile(tmpPath, buf);
        const verify = await fs.readFile(tmpPath);
        if (sha256Hex(verify) !== hash || !isValidGif(verify)) {
          await fs.unlink(tmpPath).catch(() => {});
          return { entry, status: "invalid", detail: "verification_failed" };
        }
        await fs.rename(tmpPath, finalPath);
      } catch (err) {
        await fs.unlink(tmpPath).catch(() => {});
        return {
          entry,
          status: "download_failed",
          detail: `save_failed:${err instanceof Error ? err.message.slice(0, 120) : "unknown"}`,
        };
      }
      perActionAdded.set(entry.action, (perActionAdded.get(entry.action) || 0) + 1);
      const relFile = path
        .relative(gifRoot, finalPath)
        .split(path.sep)
        .join("/");
      const attribution = entry.creator
        ? `${entry.creator}, ${lic.canonical}`
        : `${lic.canonical} (see source)`;
      newManifestAssets.push({
        file: relFile,
        action: entry.action,
        category: CATEGORY_MAP[entry.action] || "unknown",
        source: entry.sourceUrl ? new URL(entry.sourceUrl).hostname.replace(/^www\./, "") : "manual-import",
        sourceUrl: entry.gifUrl,
        license: lic.canonical,
        creator: entry.creator || "unspecified",
        attribution,
        retrievedAt: new Date().toISOString(),
        sha256: hash,
        bytes: buf.length,
        mediaKey: entry.action,
        providerQuery: entry.action,
        licenseEvidence: entry.sourceUrl || "",
      });
      return {
        entry,
        status: "imported",
        sha256: hash,
        bytes: buf.length,
        file: relFile,
        licenseCanonical: lic.canonical,
      };
    }),
  );

  const settled = await Promise.all(tasks);
  for (const r of settled) {
    results.push(r);
    switch (r.status) {
      case "imported":
        if (dryRun) {
          downloaded++;
        } else {
          downloaded++;
          imported++;
        }
        break;
      case "duplicate":
        duplicates++;
        downloaded++;
        break;
      case "invalid":
        invalid++;
        downloaded++;
        break;
      case "download_failed":
        downloadFailures++;
        break;
      case "unverified":
        unverified++;
        break;
      case "rejected_license":
        rejected++;
        break;
      case "invalid_action":
        invalidAction++;
        break;
      case "invalid_url":
        invalidUrl++;
        break;
    }
  }

  // Manifest + attributions update (atomic, only when not dry-run and imports exist)
  if (!dryRun && newManifestAssets.length > 0) {
    let existingAssets: any[] = inventory.manifestAssets;
    const merged = [...existingAssets, ...newManifestAssets];
    const manifest = {
      version: 1,
      generatedAt: new Date().toISOString(),
      totalAssets: merged.length,
      assets: merged,
    };
    const tmpManifest = `${manifestPath}.tmp-${process.pid}`;
    await fs.writeFile(tmpManifest, JSON.stringify(manifest, null, 2));
    await fs.rename(tmpManifest, manifestPath);

    // Rebuild attributions from merged manifest (never fabricate)
    let md = "# AshenAI Local GIF Attributions\n\n";
    md += `Generated: ${manifest.generatedAt}\n`;
    md += `Total Assets: ${merged.length}\n\n`;
    const bySource = new Map<string, any[]>();
    for (const a of merged) {
      const list = bySource.get(a.source || "unknown") || [];
      list.push(a);
      bySource.set(a.source || "unknown", list);
    }
    for (const [source, list] of [...bySource.entries()].sort()) {
      md += `## ${source}\n\n`;
      md += `License: ${list[0]?.license || "unspecified"}\n\n`;
      for (const a of list) {
        md += `- **${a.action}** (${a.file}): ${a.attribution || "unspecified"}\n`;
        if (a.sourceUrl) md += `  Source: ${a.sourceUrl}\n`;
        if (a.licenseEvidence) md += `  License evidence: ${a.licenseEvidence}\n`;
      }
      md += "\n";
    }
    const tmpAttr = `${attributionsPath}.tmp-${process.pid}`;
    await fs.writeFile(tmpAttr, md);
    await fs.rename(tmpAttr, attributionsPath);
  }

  // Recompute production inventory for report
  const post = await loadExistingInventory(actionsRoot, manifestPath);
  const perActionCounts = new Map<string, number>();
  for (const a of ALL_ACTIONS) perActionCounts.set(a, 0);
  // Count licensed production only (manifest license verified) matched to filesystem
  const manifestByFile = new Map<string, any>();
  for (const a of post.manifestAssets) {
    if (a && typeof a.file === "string") manifestByFile.set(a.file, a);
  }
  let licensedCount = 0;
  const licensedPerAction = new Map<string, number>();
  for (const a of ALL_ACTIONS) licensedPerAction.set(a, 0);
  const licenseBreakdown = new Map<string, number>();
  for (const [, meta] of manifestByFile) {
    const lic = String(meta.license || "");
    if (isLicensedProductionLicense(lic)) {
      licensedCount++;
      licensedPerAction.set(meta.action, (licensedPerAction.get(meta.action) || 0) + 1);
      const canon = normalizeLicense(lic).canonical;
      licenseBreakdown.set(canon, (licenseBreakdown.get(canon) || 0) + 1);
    }
  }
  // Filesystem licensed estimate: only count files that have verified manifest entry
  let actionsCovered = 0;
  let actionsGte8 = 0;
  for (const a of ALL_ACTIONS) {
    const c = licensedPerAction.get(a) || 0;
    if (c > 0) actionsCovered++;
    if (c >= 8) actionsGte8++;
  }

  // Provider cache count: files on disk minus licensed manifest files is approximate;
  // report total filesystem assets + manifest totals separately.
  let fsTotal = 0;
  for (const [, v] of post.perActionCount) fsTotal += v;

  console.log("\nMANUAL GIF IMPORT COMPLETE\n");
  console.log(`Input:\n    ${entries.length} (skipped lines: ${skipped})`);
  console.log(`\nDownloaded:\n    ${downloaded}`);
  console.log(`\nImported:\n    ${imported}`);
  console.log(`\nDuplicates:\n    ${duplicates}`);
  console.log(`\nInvalid:\n    ${invalid + invalidAction + invalidUrl}`);
  console.log(`\nDownload failures:\n    ${downloadFailures}`);
  console.log(`\nUnverified licenses:\n    ${unverified}`);
  console.log(`\nRejected licenses:\n    ${rejected}`);
  console.log(`\nLicensed production inventory:\n    ${licensedCount}`);
  console.log(`\nUnique SHA-256:\n    ${post.hashes.size}`);
  console.log(`\nActions:\n    ${actionsCovered}/32`);
  console.log(`\nActions with >=8:\n    ${actionsGte8}/32`);
  console.log(`\nPer-action counts (licensed):\n`);
  for (const a of [...ALL_ACTIONS].sort()) {
    console.log(`${a.padEnd(12)}${licensedPerAction.get(a) || 0}`);
  }
  console.log(`\nLicense breakdown:\n`);
  for (const [k, v] of [...licenseBreakdown.entries()].sort()) console.log(`${k}: ${v}`);
  console.log(`Unverified: ${unverified}`);
  console.log(`\nProvider cache:\n`);
  console.log(`${fsTotal - licensedCount} filesystem assets not counted as licensed production (approx)`);
  console.log(`\nManifest:\n`);
  console.log(`Filesystem total: ${fsTotal}`);
  console.log(`Manifest total: ${post.manifestAssets.length}`);
  console.log(`MATCH: ${fsTotal === post.manifestAssets.length ? "YES" : "NO"}`);
  if (dryRun) console.log("\n(dry-run: no files, manifest, or attributions were modified)");
}

main().catch((err) => {
  console.error("Fatal import error:", err);
  process.exit(1);
});
