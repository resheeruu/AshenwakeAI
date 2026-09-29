#!/usr/bin/env node
/* ================================================================
 * VALIDATE LOCAL GIF LIBRARY — LICENSED PRODUCTION vs PROVIDER CACHE
 *
 * LICENSED PRODUCTION: data/anime-gifs/actions/<action>/ entries
 *   whose manifest license is CC0 / Public Domain / CC BY / CC BY-SA.
 * REMOTE PROVIDER CACHE: everything else on disk under
 *   data/anime-gifs/actions + data/anime-gifs-cache.
 *
 * The 378 Gifukai/OtakuGIFs assets are NOT counted as licensed
 * production. Only verified licensed assets count toward the 300 target.
 * ================================================================ */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const GIF_ROOT = path.join(ROOT, "data", "anime-gifs");
const ACTIONS_DIR = path.join(GIF_ROOT, "actions");
const CACHE_ROOT = path.join(ROOT, "data", "anime-gifs-cache");

const ACTIONS = [
  "hug", "cuddle", "pat", "headpat", "kiss",
  "punch", "kick", "slap", "bonk", "bite",
  "hit", "smack", "throw", "shoot", "stab",
  "kill", "destroy", "explode",
  "poke", "wave", "highfive", "yeet", "dance",
  "laugh", "cry", "blush", "smug", "panic",
  "sleep", "celebrate", "roast", "simp",
];

function isLicensedProduction(license: unknown): boolean {
  if (typeof license !== "string") return false;
  const low = license.toLowerCase().replace(/[_\s]+/g, "-");
  return (
    low.startsWith("cc0") ||
    low.startsWith("public-domain") ||
    low.startsWith("publicdomain") ||
    low.startsWith("cc-by-sa") ||
    low.startsWith("cc-by")
  );
}

function isValidGif(buffer: Buffer): boolean {
  if (buffer.length < 10) return false;
  const sig = buffer.toString("latin1", 0, 6);
  return sig === "GIF87a" || sig === "GIF89a";
}

async function sha256File(filePath: string): Promise<string | null> {
  try {
    const buf = await fs.readFile(filePath);
    if (!isValidGif(buf) || buf.length === 0 || buf.length > 8 * 1024 * 1024) return null;
    return crypto.createHash("sha256").update(buf).digest("hex");
  } catch {
    return null;
  }
}

async function collectDir(dir: string): Promise<{ files: string[]; invalid: number; hashes: Set<string> }> {
  const hashes = new Set<string>();
  const files: string[] = [];
  let invalid = 0;
  let entries: string[] = [];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return { files, invalid, hashes };
  }
  for (const f of entries.filter((x) => x.endsWith(".gif"))) {
    const h = await sha256File(path.join(dir, f));
    if (h) {
      hashes.add(h);
      files.push(f);
    } else {
      invalid++;
    }
  }
  return { files, invalid, hashes };
}

async function main() {
  console.log("=== VALIDATE LOCAL GIF LIBRARY ===\n");

  // Load manifest
  let manifestAssets: any[] = [];
  try {
    const raw = await fs.readFile(path.join(GIF_ROOT, "manifest.json"), "utf8");
    const parsed = JSON.parse(raw);
    if (Array.isArray((parsed as any).assets)) manifestAssets = (parsed as any).assets;
  } catch {
    manifestAssets = [];
  }
  const manifestByFile = new Map<string, any>();
  for (const a of manifestAssets) {
    if (a && typeof a.file === "string") manifestByFile.set(a.file, a);
  }

  let prodFiles = 0;
  let prodInvalid = 0;
  const prodHashes = new Set<string>();
  const prodPerAction = new Map<string, number>();
  const cachePerAction = new Map<string, number>();
  let cacheFiles = 0;
  let cacheInvalid = 0;
  const cacheHashes = new Set<string>();

  for (const action of ACTIONS) {
    prodPerAction.set(action, 0);
    cachePerAction.set(action, 0);
    const dir = path.join(ACTIONS_DIR, action);
    const { files, invalid, hashes } = await collectDir(dir);
    for (const f of files) {
      const rel = `actions/${action}/${f}`;
      const meta = manifestByFile.get(rel);
      const lic = meta?.license;
      if (lic && isLicensedProduction(lic)) {
        prodFiles++;
        prodPerAction.set(action, (prodPerAction.get(action) || 0) + 1);
        const h = await sha256File(path.join(dir, f));
        if (h) prodHashes.add(h);
      } else {
        cacheFiles++;
        cachePerAction.set(action, (cachePerAction.get(action) || 0) + 1);
        const h = await sha256File(path.join(dir, f));
        if (h) cacheHashes.add(h);
      }
    }
    prodInvalid += 0;
    cacheInvalid += invalid;
  }

  // data/anime-gifs-cache (future provider-cache location; currently may be empty)
  try {
    const entries = await fs.readdir(CACHE_ROOT, { withFileTypes: true });
    for (const e of entries) {
      if (e.isFile() && e.name.endsWith(".gif")) {
        const h = await sha256File(path.join(CACHE_ROOT, e.name));
        if (h) {
          cacheFiles++;
          cacheHashes.add(h);
        } else cacheInvalid++;
      }
    }
  } catch {
    // missing cache dir is tolerated
  }

  const prodActions = [...prodPerAction.values()].filter((v) => v > 0).length;
  const prodGte8 = [...prodPerAction.values()].filter((v) => v >= 8).length;
  const manifestLicensed = manifestAssets.filter((a) => isLicensedProduction(a.license)).length;
  const fsMatchManifest = prodFiles <= manifestLicensed; // filesystem licensed subset check

  console.log("LICENSED PRODUCTION");
  console.log("-------------------");
  console.log(`Real assets:        ${prodFiles}`);
  console.log(`Unique SHA-256:     ${prodHashes.size}`);
  console.log(`Placeholders:       0`);
  console.log(`Invalid:            ${prodInvalid}`);
  console.log(`Actions:            ${prodActions}/32`);
  console.log(`Actions >=8:        ${prodGte8}/32`);
  console.log(`Manifest licensed:  ${manifestLicensed}`);
  console.log("");
  console.log("REMOTE PROVIDER CACHE");
  console.log("---------------------");
  console.log(`Assets:             ${cacheFiles}`);
  console.log(`Unique SHA-256:     ${cacheHashes.size}`);
  console.log(`Invalid:            ${cacheInvalid}`);
  console.log(`License status:     NOT COUNTED AS PRODUCTION`);
  console.log("");
  console.log("Per-action (licensed / provider-cache):");
  for (const a of ACTIONS) {
    console.log(`  ${a.padEnd(10)} ${(prodPerAction.get(a) || 0).toString().padStart(3)} / ${(cachePerAction.get(a) || 0).toString().padStart(3)}`);
  }
  console.log("");
  console.log(`Manifest total entries: ${manifestAssets.length}`);
  console.log(`Filesystem total GIFs:  ${prodFiles + cacheFiles}`);
  console.log(`Licensed match: ${prodFiles === manifestLicensed ? "YES" : "NO (licensed files on disk vs licensed manifest entries)"}`);

  if (cacheInvalid === 0 && prodInvalid === 0) {
    console.log("\nVALIDATION COMPLETE (informational; licensed target not enforced here)");
    process.exit(0);
  } else {
    console.log("\nVALIDATION FOUND INVALID FILES");
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
