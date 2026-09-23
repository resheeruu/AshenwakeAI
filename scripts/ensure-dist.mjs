#!/usr/bin/env node
/* ================================================================
 * ASHENAI PRODUCTION STARTUP BUILD GUARD
 *
 * Wired as the npm `prestart` lifecycle hook, so `npm start` works
 * from a clean repository checkout that has never been built and
 * whose dependencies were installed with `npm ci --omit=dev`.
 *
 * Responsibilities (in order, each attempted at most once):
 *   1. Repair the dependency tree when required *runtime* packages
 *      are missing (e.g. a `node_modules` created before `typescript`
 *      was promoted to a runtime dependency).
 *   2. Compile `dist/` when it is missing or older than the sources.
 *   3. Fail loudly (exit 1) if `dist/index.js` still does not exist,
 *      so npm aborts `prestart` instead of starting a broken app.
 *
 * Determinism / loop safety:
 *   - Runs at most ONE install and ONE build per invocation.
 *   - `npm run build` does not re-enter `prestart` (npm only fires
 *     `pre*` hooks for the script being run), so there is no
 *     install -> build -> start -> build cycle.
 *   - Restarts with a fresh `dist/` skip both steps entirely, so a
 *     crash/restart loop cannot turn into a rebuild loop.
 *
 * Plain Node + CommonJS-free ESM: must run before any TypeScript
 * toolchain (including tsx) is guaranteed to exist.
 * ================================================================ */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST_ENTRY = path.join(ROOT, "dist", "index.js");
const SRC_DIR = path.join(ROOT, "src");
const TSCONFIG = path.join(ROOT, "tsconfig.json");
const LOCKFILE = path.join(ROOT, "package-lock.json");
const NODE_MODULES = path.join(ROOT, "node_modules");

/* Runtime packages that must exist for `npm ci --omit=dev` to be able
 * to build (typescript) and run (express) and first-run setup (tsx). */
const REQUIRED_RUNTIME_PKGS = ["typescript", "tsx", "express"];

const started = Date.now();

function log(msg) {
  console.log(`[ensure-dist] ${msg}`);
}

function fail(msg) {
  console.error(`[ensure-dist] ERROR: ${msg}`);
  process.exit(1);
}

function exists(p) {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
}

function missingRuntimePackages() {
  return REQUIRED_RUNTIME_PKGS.filter(
    (name) => !exists(path.join(NODE_MODULES, name, "package.json")),
  );
}

function runNpm(args) {
  const npmExec = process.env.npm_execpath;
  const useNpmCli = typeof npmExec === "string" && npmExec.endsWith(".js");

  const result = useNpmCli
    ? spawnSync(process.execPath, [npmExec, ...args], {
        cwd: ROOT,
        stdio: "inherit",
        env: process.env,
      })
    : spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", args, {
        cwd: ROOT,
        stdio: "inherit",
        env: process.env,
      });

  if (result.error) {
    fail(`could not launch npm (${result.error.message})`);
  }
  return result.status ?? 1;
}

/* ----------------------------------------------------------------
 * Step 1 — dependency tree
 * ---------------------------------------------------------------- */
const missing = missingRuntimePackages();
if (!exists(NODE_MODULES)) {
  log("node_modules missing — installing dependencies");
} else if (missing.length > 0) {
  log(
    `node_modules incomplete (missing runtime packages: ${missing.join(", ")}) — reinstalling`,
  );
}

if (missing.length > 0) {
  const production = process.env.NODE_ENV === "production";
  const omit = production ? ["--omit=dev"] : [];
  const installArgs = exists(LOCKFILE)
    ? ["ci", ...omit, "--no-fund", "--no-audit"]
    : ["install", ...omit, "--no-fund", "--no-audit"];

  log(`running npm ${installArgs.join(" ")}`);
  const status = runNpm(installArgs);
  if (status !== 0) {
    fail(
      `npm ${installArgs[0]} failed (exit ${status}). ` +
        "Run `npm ci` (or `npm ci --omit=dev` for production) and retry.",
    );
  }

  const stillMissing = missingRuntimePackages();
  if (stillMissing.length > 0) {
    fail(
      `runtime packages still missing after install: ${stillMissing.join(", ")}. ` +
        "package.json / package-lock.json may be out of sync — run `npm install` and commit the lockfile.",
    );
  }
  log("dependencies ready");
}

if (!exists(path.join(NODE_MODULES, "typescript", "bin", "tsc"))) {
  fail(
    "typescript (runtime dependency) is not installed, so dist/ cannot be built. " +
      "Check that `typescript` is listed under \"dependencies\" in package.json.",
  );
}

/* ----------------------------------------------------------------
 * Step 2 — build artifact freshness
 * ---------------------------------------------------------------- */

function newestMtime(dir) {
  let newest = 0;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const child = newestMtime(full);
      if (child > newest) newest = child;
      continue;
    }
    if (!entry.isFile()) continue;
    try {
      const mtime = fs.statSync(full).mtimeMs;
      if (mtime > newest) newest = mtime;
    } catch {
      /* ignore unreadable entries */
    }
  }
  return newest;
}

function distIsFresh() {
  if (!exists(DIST_ENTRY)) return false;

  /* Container images ship a prebuilt dist/ and no sources — treat the
   * artifact as authoritative rather than forcing a build that cannot
   * run. */
  if (!exists(SRC_DIR)) return true;

  const distMtime = fs.statSync(DIST_ENTRY).mtimeMs;
  let newestSource = newestMtime(SRC_DIR);
  if (exists(TSCONFIG)) {
    const cfgMtime = fs.statSync(TSCONFIG).mtimeMs;
    if (cfgMtime > newestSource) newestSource = cfgMtime;
  }

  return newestSource <= distMtime;
}

if (distIsFresh()) {
  log(`dist/index.js is up to date (${Date.now() - started}ms)`);
  process.exit(0);
}

const reason = exists(DIST_ENTRY) ? "sources changed" : "dist/index.js missing";
log(`${reason} — running npm run build`);

const buildStatus = runNpm(["run", "build"]);
if (buildStatus !== 0) {
  fail(
    `production build failed (exit ${buildStatus}). ` +
      "Fix the TypeScript errors reported above, or run `npm run build` locally to reproduce.",
  );
}

if (!exists(DIST_ENTRY)) {
  fail(
    "npm run build completed but dist/index.js was not produced. " +
      "Check tsconfig.json \"outDir\"/\"include\" and re-run `npm run build`.",
  );
}

log(`build complete — dist/index.js ready (${Date.now() - started}ms)`);
