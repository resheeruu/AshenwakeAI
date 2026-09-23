#!/usr/bin/env node
/* ================================================================
 * ASHENAI PRODUCTION BUILD — low-memory esbuild transpile
 *
 * Replaces `tsc` emit for production `dist/` because `tsc`
 * type-checks the whole program in memory and OOMs on
 * memory-constrained hosts (Wispbyte Node 22 exits 134 at
 * ~294-303 MB heap). esbuild transpiles per-file in a native
 * binary (~tens of MB peak, ~2s for 321 files) and preserves the
 * tsc-equivalent CommonJS layout (rootDir=src -> dist/).
 *
 * Type safety is NOT weakened: `npm run typecheck` (tsc --noEmit)
 * and CI still run the full strict typecheck. This script performs
 * transpilation only.
 *
 * Deterministic output contract (matches old `tsc` + public copy):
 *   dist/index.js            <- src/index.ts (CommonJS, node22)
 *   dist/cli.js              <- src/cli.ts
 *   dist/<tree>/...          <- mirrors src/<tree>/...
 *   dist/web/public/...      <- copied verbatim from src/web/public
 * ================================================================ */

const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const SRC_DIR = path.join(ROOT, "src");
const DIST_DIR = path.join(ROOT, "dist");
const ESBUILD_BIN = path.join(ROOT, "node_modules", ".bin", process.platform === "win32" ? "esbuild.cmd" : "esbuild");

function log(msg) {
  console.log(`[build] ${msg}`);
}

function fail(msg) {
  console.error(`[build] ERROR: ${msg}`);
  process.exit(1);
}

function collectSources(dir, out) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectSources(full, out);
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      out.push(full);
    }
  }
  return out;
}

function copyDirRecursive(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(s, d);
    } else if (entry.isFile()) {
      fs.copyFileSync(s, d);
    }
  }
}

if (!fs.existsSync(SRC_DIR)) {
  fail("src/ directory is missing — cannot build from a sourceless checkout.");
}

if (!fs.existsSync(ESBUILD_BIN)) {
  fail(
    "esbuild binary is missing (expected node_modules/.bin/esbuild). " +
      "Run `npm ci` (or `npm ci --omit=dev` for production) and retry."
  );
}

const started = Date.now();
const sources = collectSources(SRC_DIR, []);
if (sources.length === 0) fail("no TypeScript sources found under src/.");

fs.rmSync(DIST_DIR, { recursive: true, force: true });
fs.mkdirSync(DIST_DIR, { recursive: true });

log(`transpiling ${sources.length} files with esbuild (platform=node target=node22 format=cjs)...`);
try {
  execFileSync(
    ESBUILD_BIN,
    [
      ...sources,
      `--outdir=${DIST_DIR}`,
      "--outbase=src",
      "--platform=node",
      "--target=node22",
      "--format=cjs",
      "--log-level=warning",
    ],
    { cwd: ROOT, stdio: "inherit" }
  );
} catch {
  fail("esbuild transpile failed — see the errors above.");
}

// Preserve the historical `tsc` build contract: web assets are not
// compiled by TypeScript, they are copied verbatim.
const publicSrc = path.join(SRC_DIR, "web", "public");
const publicDest = path.join(DIST_DIR, "web", "public");
if (fs.existsSync(publicSrc)) {
  copyDirRecursive(publicSrc, publicDest);
  log("copied src/web/public -> dist/web/public");
}

if (!fs.existsSync(path.join(DIST_DIR, "index.js"))) {
  fail("build completed but dist/index.js was not produced.");
}

const countDistFiles = (() => {
  let n = 0;
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) n += 1;
    }
  };
  walk(DIST_DIR);
  return n;
})();

const heapMB = Math.round(process.memoryUsage().heapUsed / 1048576);
log(`build complete — ${countDistFiles} files in dist/ (${Date.now() - started}ms, wrapper heap ~${heapMB}MB)`);
