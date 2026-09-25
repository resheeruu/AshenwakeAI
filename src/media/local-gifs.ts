/* ================================================================
 * LOCAL ANIME GIF PROVIDER
 *
 * Single shared, operator-populated local media provider used by
 * both the Ash anime actions and the AFK system. Fail-closed:
 * every path is derived from an allowlisted key (never from raw
 * Discord/user text), validated at index time AND revalidated at
 * read time (containment, realpath, regular file, size, magic
 * bytes, GIF/PNG dimensions). Invalid media returns null and the
 * caller falls back to text. No GIF assets are shipped; the
 * repository only ships this provider/index/security layer.
 *
 * Layout (root configurable via ASHENAI_LOCAL_GIFS_DIR):
 *   data/anime-gifs/
 *   ├── actions/<mediaKey>/   (only the 32 defined mediaKeys)
 *   ├── afk/<category>/       (fixed 9-category allowlist)
 *   └── manifest.json         (optional audit metadata)
 * ================================================================ */

import * as fsp from "node:fs/promises";
import * as path from "node:path";
import { config } from "../config/env";
import { getAllActions } from "../games/anime-actions/definitions";
import { logger } from "../logger";

/* ================================================================
 * CATEGORIES AND LIMITS
 * ================================================================ */

export const AFK_CATEGORIES = [
  "eating",
  "sleep",
  "grass",
  "work",
  "gaming",
  "study",
  "break",
  "away",
  "generic",
] as const;

export type AfkCategory = (typeof AFK_CATEGORIES)[number];

export const MAX_LOCAL_MEDIA_BYTES = 8 * 1024 * 1024;
export const MAX_GIF_DIMENSION = 4096;
const MAX_ASSETS_PER_KEY = 100;
const MAX_ASSETS_TOTAL = 2000;
const MAX_MANIFEST_BYTES = 2 * 1024 * 1024;
const MAX_RELPATH_LENGTH = 512;

const SUPPORTED_EXTENSIONS = new Set([
  ".gif",
  ".webp",
  ".png",
  ".jpg",
  ".jpeg",
]);

const EXT_CONTENT_TYPE: Record<string, string> = {
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};

/* ================================================================
 * TYPES
 * ================================================================ */

export interface LocalGifAsset {
  /** Allowlisted key: "actions:<mediaKey>" | "afk:<category>" */
  key: string;
  /** Realpath'd media root captured at index time */
  root: string;
  /** Normalized POSIX path relative to root */
  relPath: string;
  sizeBytes: number;
  /** From manifest.json, or "unspecified" when absent */
  license: string;
  source?: string;
  sourceUrl?: string;
}

export interface LocalGifIndex {
  root: string;
  byKey: ReadonlyMap<string, readonly LocalGifAsset[]>;
  totalAssets: number;
  unmanifested: number;
  manifestWarnings: number;
  builtAt: number;
}

export interface LocalGifReadResult {
  buffer: Buffer;
  contentType: string;
  asset: LocalGifAsset;
}

export interface LocalGifStats {
  built: boolean;
  root: string | null;
  totalAssets: number;
  keys: number;
  unmanifested: number;
  manifestWarnings: number;
}

/* ================================================================
 * ALLOWLIST VALIDATION
 * (keys only — never derive a path from user text)
 * ================================================================ */

let mediaKeySet: Set<string> | null = null;

function validMediaKeys(): Set<string> {
  if (!mediaKeySet) {
    mediaKeySet = new Set(getAllActions().map((a) => a.mediaKey));
  }
  return mediaKeySet;
}

export function isValidLocalGifKey(key: unknown): key is string {
  if (typeof key !== "string" || key.length > 100) return false;
  if (key.startsWith("actions:")) {
    return validMediaKeys().has(key.slice("actions:".length));
  }
  if (key.startsWith("afk:")) {
    return (AFK_CATEGORIES as readonly string[]).includes(
      key.slice("afk:".length),
    );
  }
  return false;
}

function isSafeRelPath(rel: string): boolean {
  if (typeof rel !== "string") return false;
  if (rel.length === 0 || rel.length > MAX_RELPATH_LENGTH) return false;
  if (rel.includes("\0")) return false;
  if (rel.includes("\\")) return false;
  if (path.posix.isAbsolute(rel) || path.isAbsolute(rel)) return false;
  const normalized = path.posix.normalize(rel);
  if (normalized.startsWith("../") || normalized === "..") return false;
  if (normalized.startsWith("/")) return false;
  // Already-normalized only: rejects "a/../b", "a//b", "./a".
  if (normalized !== rel) return false;
  return true;
}

function isWithin(rootReal: string, candidate: string): boolean {
  return (
    candidate.length > rootReal.length + 1 &&
    candidate.startsWith(rootReal + path.sep)
  );
}

/* ================================================================
 * MANIFEST (optional audit metadata)
 * ================================================================ */

interface ManifestMeta {
  source?: string;
  sourceUrl?: string;
  license?: string;
}

interface ManifestLoadResult {
  meta: Map<string, ManifestMeta>;
  warnings: number;
}

function safeMetaString(value: unknown, maxLen = 300): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  // Single line, bounded length — never fabricate, never allow injection.
  return trimmed.replace(/[\r\n\0]+/g, " ").slice(0, maxLen);
}

async function loadManifest(
  rootReal: string,
): Promise<ManifestLoadResult> {
  const result: ManifestLoadResult = { meta: new Map(), warnings: 0 };
  const manifestPath = path.join(rootReal, "manifest.json");

  let raw: string;
  try {
    // lstat + symlink rejection matches the directory walk: a symlinked
    // manifest must not be followed out of the media root.
    const st = await fsp.lstat(manifestPath);
    if (st.isSymbolicLink() || !st.isFile()) {
      if (st.isSymbolicLink()) {
        logger.warn(
          "local_gifs result=manifest_symlink ignored=true action=continue_scan",
        );
        result.warnings += 1;
      }
      return result;
    }
    if (st.size > MAX_MANIFEST_BYTES) {
      logger.warn(
        `local_gifs result=manifest_too_large bytes=${st.size} limit=${MAX_MANIFEST_BYTES} ignored=true`,
      );
      result.warnings += 1;
      return result;
    }
    raw = await fsp.readFile(manifestPath, "utf8");
  } catch {
    // Missing manifest is normal — assets serve as license "unspecified".
    return result;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    logger.warn(
      "local_gifs result=manifest_malformed ignored=true action=continue_scan",
    );
    result.warnings += 1;
    return result;
  }

  const assets: unknown = Array.isArray(parsed)
    ? parsed
    : (parsed as { assets?: unknown } | null)?.assets;

  if (!Array.isArray(assets)) {
    logger.warn(
      "local_gifs result=manifest_shape_invalid ignored=true action=continue_scan",
    );
    result.warnings += 1;
    return result;
  }

  for (const entry of assets) {
    if (!entry || typeof entry !== "object") {
      result.warnings += 1;
      continue;
    }
    const rec = entry as Record<string, unknown>;
    if (typeof rec.path !== "string" || !isSafeRelPath(rec.path)) {
      // Absolute / traversal / malformed manifest paths are rejected here
      // and can never influence reads (assets come from the directory scan).
      result.warnings += 1;
      continue;
    }
    const meta: ManifestMeta = {};
    const source = safeMetaString(rec.source);
    const sourceUrl = safeMetaString(rec.sourceUrl, 500);
    const license = safeMetaString(rec.license);
    if (source) meta.source = source;
    if (sourceUrl) meta.sourceUrl = sourceUrl;
    if (license) meta.license = license;
    result.meta.set(rec.path, meta);
  }

  return result;
}

/* ================================================================
 * INDEX BUILD (memoized, async, deterministic)
 * ================================================================ */

let current: LocalGifIndex | null = null;
let building: Promise<LocalGifIndex> | null = null;
let buildingRoot: string | null = null;
let activeRoot: string | null = null;
let generation = 0;

function normalizeRoot(root?: string): string {
  const candidate = root?.trim();
  return path.resolve(candidate || config.media.localGifsDir);
}

async function buildIndex(
  rootInput: string,
  gen: number,
): Promise<LocalGifIndex> {
  const empty: LocalGifIndex = {
    root: rootInput,
    byKey: new Map(),
    totalAssets: 0,
    unmanifested: 0,
    manifestWarnings: 0,
    builtAt: Date.now(),
  };

  let rootReal: string;
  try {
    const st = await fsp.stat(rootInput);
    if (!st.isDirectory()) {
      logger.warn(
        `local_gifs result=root_not_directory root=${rootInput} assets=0`,
      );
      return empty;
    }
    rootReal = await fsp.realpath(rootInput);
  } catch {
    // Missing media root is tolerated — provider simply serves nothing.
    logger.info(
      `local_gifs result=root_missing root=${rootInput} assets=0`,
    );
    return empty;
  }

  const manifest = await loadManifest(rootReal);

  const byKey = new Map<string, LocalGifAsset[]>();
  let total = 0;
  let unmanifested = 0;
  let skipped = 0;

  const groups: Array<{ prefix: "actions:" | "afk:"; dir: string; names: readonly string[] }> = [
    {
      prefix: "actions:",
      dir: "actions",
      names: [...validMediaKeys()].sort(),
    },
    {
      prefix: "afk:",
      dir: "afk",
      names: [...AFK_CATEGORIES],
    },
  ];

  outer: for (const group of groups) {
    const baseDir = path.join(rootReal, group.dir);
    for (const name of group.names) {
      if (total >= MAX_ASSETS_TOTAL) break outer;
      const key = group.prefix + name;
      const dir = path.join(baseDir, name);

      let entries;
      try {
        entries = await fsp.readdir(dir, { withFileTypes: true });
      } catch {
        continue; // Missing category directory is tolerated.
      }

      // Deterministic ordering regardless of filesystem readdir order.
      entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

      const list = byKey.get(key) ?? [];

      for (const entry of entries) {
        if (total >= MAX_ASSETS_TOTAL || list.length >= MAX_ASSETS_PER_KEY) {
          skipped += 1;
          continue;
        }
        if (entry.isSymbolicLink()) {
          skipped += 1;
          continue;
        }
        if (!entry.isFile()) {
          skipped += 1;
          continue;
        }
        const ext = path.extname(entry.name).toLowerCase();
        if (!SUPPORTED_EXTENSIONS.has(ext)) {
          skipped += 1;
          continue;
        }

        const abs = path.join(dir, entry.name);
        let real: string;
        try {
          real = await fsp.realpath(abs);
        } catch {
          skipped += 1;
          continue;
        }
        if (!isWithin(rootReal, real)) {
          skipped += 1;
          logger.warn(
            `local_gifs result=outside_root skipped=1 name=${entry.name.replace(/[^\w.-]/g, "_")}`,
          );
          continue;
        }

        let size: number;
        try {
          const st = await fsp.stat(abs);
          if (!st.isFile()) {
            skipped += 1;
            continue;
          }
          size = st.size;
        } catch {
          skipped += 1;
          continue;
        }
        if (size <= 0 || size > MAX_LOCAL_MEDIA_BYTES) {
          skipped += 1;
          continue;
        }

        const relPath = path.relative(rootReal, real).split(path.sep).join("/");
        const meta = manifest.meta.get(relPath);
        const asset: LocalGifAsset = {
          key,
          root: rootReal,
          relPath,
          sizeBytes: size,
          license: meta?.license || "unspecified",
        };
        if (meta?.source) asset.source = meta.source;
        if (meta?.sourceUrl) asset.sourceUrl = meta.sourceUrl;
        if (!meta) unmanifested += 1;

        list.push(asset);
        total += 1;
      }

      byKey.set(key, list);
    }
  }

  logger.info(
    `local_gifs result=index_built root=${rootReal} assets=${total} keys=${[...byKey.values()].filter((l) => l.length > 0).length} unmanifested=${unmanifested} skipped=${skipped} manifest_warnings=${manifest.warnings} generation=${gen}`,
  );

  return {
    root: rootReal,
    byKey,
    totalAssets: total,
    unmanifested,
    manifestWarnings: manifest.warnings,
    builtAt: Date.now(),
  };
}

/**
 * Build (or return) the memoized local media index.
 * Concurrent callers with the same root share a single build —
 * there is never duplicate indexing work for the same root.
 * Passing a different root starts a new build generation.
 */
export async function initializeLocalGifs(
  options?: { root?: string },
): Promise<LocalGifIndex> {
  const root = normalizeRoot(options?.root);

  if (current && activeRoot === root) return current;
  if (building && buildingRoot === root) return building;

  const gen = ++generation;
  activeRoot = root;
  buildingRoot = root;

  const promise = buildIndex(root, gen)
    .then((index) => {
      if (gen === generation) {
        current = index;
      }
      if (buildingRoot === root && buildingRoot === activeRoot) {
        building = null;
      }
      return index;
    })
    .catch((error: unknown) => {
      logger.warn(
        `local_gifs result=index_failed root=${root} detail=${error instanceof Error ? error.message : "unknown"}`,
      );
      const fallback: LocalGifIndex = {
        root,
        byKey: new Map(),
        totalAssets: 0,
        unmanifested: 0,
        manifestWarnings: 0,
        builtAt: Date.now(),
      };
      if (gen === generation) current = fallback;
      if (buildingRoot === root && buildingRoot === activeRoot) {
        building = null;
      }
      return fallback;
    });

  building = promise;
  return promise;
}

/**
 * Resolve an allowlisted key to a local asset.
 * Returns null for unknown keys, empty categories, or an empty index.
 * Selection is bounded and deterministic given a deterministic rng.
 */
export async function resolveLocalGif(
  key: string,
  rng: () => number = Math.random,
): Promise<LocalGifAsset | null> {
  if (!isValidLocalGifKey(key)) return null;

  let index: LocalGifIndex;
  if (current) {
    index = current;
  } else if (building) {
    index = await building;
  } else {
    index = await initializeLocalGifs();
  }

  const list = index.byKey.get(key);
  if (!list || list.length === 0) return null;
  if (list.length === 1) return list[0];

  const r = rng();
  const idx =
    Number.isFinite(r) && r >= 0
      ? Math.min(list.length - 1, Math.floor(r * list.length))
      : 0;
  return list[idx] ?? null;
}

/* ================================================================
 * READ (revalidated at read time)
 * ================================================================ */

function checkMagic(
  buf: Buffer,
  ext: string,
): string | null {
  if (ext === ".gif") {
    if (buf.length < 10) return null;
    const sig = buf.toString("latin1", 0, 6);
    if (sig !== "GIF87a" && sig !== "GIF89a") return null;
    const width = buf.readUInt16LE(6);
    const height = buf.readUInt16LE(8);
    if (width === 0 || height === 0) return null;
    if (width > MAX_GIF_DIMENSION || height > MAX_GIF_DIMENSION) return null;
    return EXT_CONTENT_TYPE[".gif"];
  }

  if (ext === ".png") {
    if (buf.length < 24) return null;
    const pngMagic =
      buf[0] === 0x89 &&
      buf[1] === 0x50 &&
      buf[2] === 0x4e &&
      buf[3] === 0x47 &&
      buf[4] === 0x0d &&
      buf[5] === 0x0a &&
      buf[6] === 0x1a &&
      buf[7] === 0x0a;
    if (!pngMagic) return null;
    if (buf.toString("latin1", 12, 16) !== "IHDR") return null;
    const width = buf.readUInt32BE(16);
    const height = buf.readUInt32BE(20);
    if (width === 0 || height === 0) return null;
    if (width > MAX_GIF_DIMENSION || height > MAX_GIF_DIMENSION) return null;
    return EXT_CONTENT_TYPE[".png"];
  }

  if (ext === ".webp") {
    if (buf.length < 12) return null;
    if (
      buf.toString("latin1", 0, 4) !== "RIFF" ||
      buf.toString("latin1", 8, 12) !== "WEBP"
    ) {
      return null;
    }
    return EXT_CONTENT_TYPE[".webp"];
  }

  // .jpg / .jpeg
  if (buf.length < 3) return null;
  if (buf[0] !== 0xff || buf[1] !== 0xd8 || buf[2] !== 0xff) return null;
  return EXT_CONTENT_TYPE[".jpeg"];
}

/**
 * Read and fully revalidate a local media asset.
 * Rebuilds the path from (asset.root + asset.relPath) — the stored
 * absPath is never trusted. Returns null on ANY validation failure
 * and callers must fall back to text.
 */
export async function readLocalGif(
  asset: LocalGifAsset,
): Promise<LocalGifReadResult | null> {
  if (!asset || typeof asset !== "object") return null;
  if (!isValidLocalGifKey(asset.key)) return null;
  if (typeof asset.root !== "string" || !path.isAbsolute(asset.root)) {
    return null;
  }
  const relPath = asset.relPath;
  if (typeof relPath !== "string" || !isSafeRelPath(relPath)) return null;

  const ext = path.posix.extname(relPath).toLowerCase();
  if (!SUPPORTED_EXTENSIONS.has(ext)) return null;

  const abs = path.join(asset.root, relPath);
  if (!isWithin(asset.root, abs)) return null;

  try {
    const link = await fsp.lstat(abs);
    if (link.isSymbolicLink() || !link.isFile()) return null;
    if (link.size <= 0 || link.size > MAX_LOCAL_MEDIA_BYTES) return null;

    const real = await fsp.realpath(abs);
    if (!isWithin(asset.root, real)) return null;

    const handle = await fsp.open(abs, "r");
    try {
      const st = await handle.stat();
      if (!st.isFile() || st.size <= 0 || st.size > MAX_LOCAL_MEDIA_BYTES) {
        return null;
      }
      const buffer = await handle.readFile();
      if (buffer.length === 0 || buffer.length > MAX_LOCAL_MEDIA_BYTES) {
        return null;
      }
      const contentType = checkMagic(buffer, ext);
      if (!contentType) return null;
      return { buffer, contentType, asset };
    } finally {
      await handle.close();
    }
  } catch {
    // Missing file, permission failure, corrupt read, race — all fail closed.
    return null;
  }
}

/* ================================================================
 * STATS + TEST HOOKS
 * ================================================================ */

export function getLocalGifStats(): LocalGifStats {
  if (!current) {
    return {
      built: false,
      root: null,
      totalAssets: 0,
      keys: 0,
      unmanifested: 0,
      manifestWarnings: 0,
    };
  }
  return {
    built: true,
    root: current.root,
    totalAssets: current.totalAssets,
    keys: [...current.byKey.values()].filter((l) => l.length > 0).length,
    unmanifested: current.unmanifested,
    manifestWarnings: current.manifestWarnings,
  };
}

/**
 * Reset all memoized index state. Test-only hook — also used to
 * force a rebuild against a different root.
 */
export function resetLocalGifsForTests(): void {
  generation += 1;
  current = null;
  building = null;
  buildingRoot = null;
  activeRoot = null;
}
