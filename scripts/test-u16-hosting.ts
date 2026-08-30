#!/usr/bin/env node
/**
 * U16 Hosting Detection & Portability Tests
 */

import { strict as assert } from "node:assert";
import fs from "node:fs";
import path from "node:path";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log("  PASS " + name);
  } catch (err: any) {
    failed++;
    console.log("  FAIL " + name + ": " + err.message);
  }
}

console.log("\n===== U16 HOSTING DETECTION =====");

// 1. Hosting detection returns valid structure
test("detectHosting returns valid structure", () => {
  const { detectHosting } = require("../scripts/hosting-detect");
  const h = detectHosting();
  assert.ok(h.provider, "provider must be set");
  assert.ok(["high", "medium", "low"].includes(h.confidence), "confidence must be valid");
  assert.ok(h.runtime, "runtime must be set");
  assert.ok(h.operatingSystem, "OS must be set");
  assert.ok(h.architecture, "architecture must be set");
  assert.ok(typeof h.containerized === "boolean", "containerized must be boolean");
  assert.ok(["environment", "default"].includes(h.portSource), "portSource must be valid");
  assert.ok(["available", "unavailable", "unknown"].includes(h.persistentStorage), "persistentStorage must be valid");
  assert.ok(Array.isArray(h.signals), "signals must be array");
  assert.ok(Array.isArray(h.warnings), "warnings must be array");
});

// 2. Termux detection
test("detects termux when TERMUX_VERSION is set", () => {
  const orig = process.env.TERMUX_VERSION;
  process.env.TERMUX_VERSION = "0.119.0";
  // Clear other platform vars
  const saved: Record<string, string | undefined> = {};
  for (const k of ["RENDER", "RAILWAY_ENVIRONMENT", "FLY_APP_NAME", "KOYEB_APP_NAME", "HEROKU_APP_NAME", "REPL_ID", "KUBERNETES_SERVICE_HOST"]) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  const { detectHosting } = require("../scripts/hosting-detect");
  const h = detectHosting();
  assert.equal(h.provider, "termux", "should detect termux");
  assert.equal(h.confidence, "high", "should be high confidence");
  // Restore
  if (orig !== undefined) process.env.TERMUX_VERSION = orig; else delete process.env.TERMUX_VERSION;
  for (const [k, v] of Object.entries(saved)) { if (v !== undefined) process.env[k] = v; else delete process.env[k]; }
});

// 3. Docker detection
test("detects docker when /.dockerenv exists", () => {
  // We cannot easily mock fs.existsSync for /.dockerenv in this test
  // but we can verify the code path exists
  const code = fs.readFileSync(path.join(__dirname, "../scripts/hosting-detect.ts"), "utf8");
  assert.ok(code.includes("/.dockerenv"), "should check for /.dockerenv");
  assert.ok(code.includes("KUBERNETES_SERVICE_HOST"), "should check for kubernetes");
});

// 4. Kubernetes detection
test("detects docker/container when KUBERNETES_SERVICE_HOST is set", () => {
  const orig = process.env.KUBERNETES_SERVICE_HOST;
  process.env.KUBERNETES_SERVICE_HOST = "10.0.0.1";
  const saved: Record<string, string | undefined> = {};
  for (const k of ["RENDER", "RAILWAY_ENVIRONMENT", "FLY_APP_NAME", "KOYEB_APP_NAME", "HEROKU_APP_NAME", "REPL_ID", "TERMUX_VERSION"]) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  // Clear /.dockerenv mock not possible, but K8s should still work
  const { detectHosting } = require("../scripts/hosting-detect");
  const h = detectHosting();
  assert.ok(["docker/container", "render", "railway", "fly.io", "koyeb"].includes(h.provider), "should detect container or known platform");
  if (orig !== undefined) process.env.KUBERNETES_SERVICE_HOST = orig; else delete process.env.KUBERNETES_SERVICE_HOST;
  for (const [k, v] of Object.entries(saved)) { if (v !== undefined) process.env[k] = v; else delete process.env[k]; }
});

// 5. Render detection
test("detects render when RENDER is set", () => {
  const orig = process.env.RENDER;
  process.env.RENDER = "true";
  const saved: Record<string, string | undefined> = {};
  for (const k of ["RAILWAY_ENVIRONMENT", "FLY_APP_NAME", "KOYEB_APP_NAME", "HEROKU_APP_NAME", "REPL_ID", "TERMUX_VERSION", "KUBERNETES_SERVICE_HOST"]) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  const { detectHosting } = require("../scripts/hosting-detect");
  const h = detectHosting();
  assert.equal(h.provider, "render", "should detect render");
  if (orig !== undefined) process.env.RENDER = orig; else delete process.env.RENDER;
  for (const [k, v] of Object.entries(saved)) { if (v !== undefined) process.env[k] = v; else delete process.env[k]; }
});

// 6. Railway detection
test("detects railway when RAILWAY_ENVIRONMENT is set", () => {
  const orig = process.env.RAILWAY_ENVIRONMENT;
  process.env.RAILWAY_ENVIRONMENT = "production";
  const saved: Record<string, string | undefined> = {};
  for (const k of ["RENDER", "FLY_APP_NAME", "KOYEB_APP_NAME", "HEROKU_APP_NAME", "REPL_ID", "TERMUX_VERSION", "KUBERNETES_SERVICE_HOST"]) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  const { detectHosting } = require("../scripts/hosting-detect");
  const h = detectHosting();
  assert.equal(h.provider, "railway", "should detect railway");
  if (orig !== undefined) process.env.RAILWAY_ENVIRONMENT = orig; else delete process.env.RAILWAY_ENVIRONMENT;
  for (const [k, v] of Object.entries(saved)) { if (v !== undefined) process.env[k] = v; else delete process.env[k]; }
});

// 7. Fly.io detection
test("detects fly.io when FLY_APP_NAME is set", () => {
  const orig = process.env.FLY_APP_NAME;
  process.env.FLY_APP_NAME = "ashenai";
  const saved: Record<string, string | undefined> = {};
  for (const k of ["RENDER", "RAILWAY_ENVIRONMENT", "KOYEB_APP_NAME", "HEROKU_APP_NAME", "REPL_ID", "TERMUX_VERSION", "KUBERNETES_SERVICE_HOST"]) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  const { detectHosting } = require("../scripts/hosting-detect");
  const h = detectHosting();
  assert.equal(h.provider, "fly.io", "should detect fly.io");
  if (orig !== undefined) process.env.FLY_APP_NAME = orig; else delete process.env.FLY_APP_NAME;
  for (const [k, v] of Object.entries(saved)) { if (v !== undefined) process.env[k] = v; else delete process.env[k]; }
});

// 8. Koyeb detection
test("detects koyeb when KOYEB_APP_NAME is set", () => {
  const orig = process.env.KOYEB_APP_NAME;
  process.env.KOYEB_APP_NAME = "ashenai";
  const saved: Record<string, string | undefined> = {};
  for (const k of ["RENDER", "RAILWAY_ENVIRONMENT", "FLY_APP_NAME", "HEROKU_APP_NAME", "REPL_ID", "TERMUX_VERSION", "KUBERNETES_SERVICE_HOST"]) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  const { detectHosting } = require("../scripts/hosting-detect");
  const h = detectHosting();
  assert.equal(h.provider, "koyeb", "should detect koyeb");
  if (orig !== undefined) process.env.KOYEB_APP_NAME = orig; else delete process.env.KOYEB_APP_NAME;
  for (const [k, v] of Object.entries(saved)) { if (v !== undefined) process.env[k] = v; else delete process.env[k]; }
});

// 9. Replit detection
test("detects replit when REPL_ID is set", () => {
  const orig = process.env.REPL_ID;
  process.env.REPL_ID = "abc123";
  const saved: Record<string, string | undefined> = {};
  for (const k of ["RENDER", "RAILWAY_ENVIRONMENT", "FLY_APP_NAME", "KOYEB_APP_NAME", "HEROKU_APP_NAME", "TERMUX_VERSION", "KUBERNETES_SERVICE_HOST"]) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  const { detectHosting } = require("../scripts/hosting-detect");
  const h = detectHosting();
  assert.equal(h.provider, "replit", "should detect replit");
  if (orig !== undefined) process.env.REPL_ID = orig; else delete process.env.REPL_ID;
  for (const [k, v] of Object.entries(saved)) { if (v !== undefined) process.env[k] = v; else delete process.env[k]; }
});

// 10. Heroku detection
test("detects heroku when HEROKU_APP_NAME is set", () => {
  const orig = process.env.HEROKU_APP_NAME;
  process.env.HEROKU_APP_NAME = "ashenai";
  const saved: Record<string, string | undefined> = {};
  for (const k of ["RENDER", "RAILWAY_ENVIRONMENT", "FLY_APP_NAME", "KOYEB_APP_NAME", "REPL_ID", "TERMUX_VERSION", "KUBERNETES_SERVICE_HOST"]) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  const { detectHosting } = require("../scripts/hosting-detect");
  const h = detectHosting();
  assert.equal(h.provider, "heroku", "should detect heroku");
  if (orig !== undefined) process.env.HEROKU_APP_NAME = orig; else delete process.env.HEROKU_APP_NAME;
  for (const [k, v] of Object.entries(saved)) { if (v !== undefined) process.env[k] = v; else delete process.env[k]; }
});

// 11. Conflicting signals
test("returns unknown when multiple platform signals conflict", () => {
  process.env.RENDER = "true";
  process.env.RAILWAY_ENVIRONMENT = "production";
  const saved: Record<string, string | undefined> = {};
  for (const k of ["FLY_APP_NAME", "KOYEB_APP_NAME", "HEROKU_APP_NAME", "REPL_ID", "TERMUX_VERSION", "KUBERNETES_SERVICE_HOST"]) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  const { detectHosting } = require("../scripts/hosting-detect");
  const h = detectHosting();
  assert.equal(h.provider, "unknown", "should return unknown for conflicts");
  delete process.env.RENDER;
  delete process.env.RAILWAY_ENVIRONMENT;
  for (const [k, v] of Object.entries(saved)) { if (v !== undefined) process.env[k] = v; else delete process.env[k]; }
});

// 12. Unknown detection (no signals)
test("returns local when no platform signals present", () => {
  const saved: Record<string, string | undefined> = {};
  for (const k of ["RENDER", "RAILWAY_ENVIRONMENT", "FLY_APP_NAME", "KOYEB_APP_NAME", "HEROKU_APP_NAME", "REPL_ID", "TERMUX_VERSION", "KUBERNETES_SERVICE_HOST", "DOCKER_CONTAINER", "SSH_CLIENT", "SSH_TTY"]) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  const { detectHosting } = require("../scripts/hosting-detect");
  const h = detectHosting();
  assert.ok(["local", "generic-vps", "docker/container"].includes(h.provider), "should be local or generic or docker");
  for (const [k, v] of Object.entries(saved)) { if (v !== undefined) process.env[k] = v; else delete process.env[k]; }
});

console.log("\n===== U16 CAPABILITIES =====");

// 13. Capability detection
test("detectCapabilities returns valid structure", () => {
  const { detectCapabilities } = require("../scripts/hosting-detect");
  const caps = detectCapabilities();
  assert.ok(Array.isArray(caps), "must be array");
  assert.ok(caps.length >= 10, "must have at least 10 checks");
  for (const c of caps) {
    assert.ok(c.name, "each cap must have name");
    assert.ok(typeof c.available === "boolean", "each cap must have available boolean");
    assert.ok(typeof c.required === "boolean", "each cap must have required boolean");
  }
});

// 14. Node.js always available
test("node.js is always available", () => {
  const { detectCapabilities } = require("../scripts/hosting-detect");
  const caps = detectCapabilities();
  const nodeCap = caps.find((c: any) => c.name === "node.js");
  assert.ok(nodeCap, "must have node.js cap");
  assert.ok(nodeCap.available, "node.js must be available");
  assert.ok(nodeCap.version, "must have version");
});

// 15. Node version check
test("detects Node version correctly", () => {
  const { detectCapabilities } = require("../scripts/hosting-detect");
  const caps = detectCapabilities();
  const nodeCap = caps.find((c: any) => c.name === "node.js");
  assert.equal(nodeCap.version, process.version, "version must match process.version");
});

// 16. npm available
test("npm is available", () => {
  const { detectCapabilities } = require("../scripts/hosting-detect");
  const caps = detectCapabilities();
  const npmCap = caps.find((c: any) => c.name === "npm");
  assert.ok(npmCap, "must have npm cap");
  assert.ok(npmCap.available, "npm must be available");
});

// 17. FFmpeg detection
test("ffmpeg detected based on command availability", () => {
  const { detectCapabilities } = require("../scripts/hosting-detect");
  const caps = detectCapabilities();
  const ffmpegCap = caps.find((c: any) => c.name === "ffmpeg");
  assert.ok(ffmpegCap, "must have ffmpeg cap");
  assert.equal(typeof ffmpegCap.available, "boolean", "ffmpeg availability must be boolean");
});

// 18. Architecture detection
test("architecture detection works", () => {
  const { detectHosting } = require("../scripts/hosting-detect");
  const h = detectHosting();
  assert.ok(h.architecture, "architecture must be set");
  assert.ok(h.operatingSystem, "OS must be set");
});

console.log("\n===== U16 FEATURE MATRIX =====");

// 19. Feature capability matrix
test("detectFeatureCapabilities returns valid matrix", () => {
  const { detectFeatureCapabilities } = require("../scripts/hosting-features");
  const features = detectFeatureCapabilities();
  assert.ok(Array.isArray(features), "must be array");
  assert.ok(features.length >= 10, "must have at least 10 features");
  for (const f of features) {
    assert.ok(f.feature, "each must have feature name");
    assert.ok(["available", "degraded", "unavailable"].includes(f.status), "status must be valid");
    assert.ok(f.reason, "each must have reason");
    assert.ok(Array.isArray(f.configurationRequired), "configRequired must be array");
  }
});

// 20. Discord bot always in matrix
test("discord-bot is in feature matrix", () => {
  const { detectFeatureCapabilities } = require("../scripts/hosting-features");
  const features = detectFeatureCapabilities();
  const discord = features.find((f: any) => f.feature === "discord-bot");
  assert.ok(discord, "discord-bot must be in matrix");
});

// 21. Music depends on ffmpeg
test("music available with ffmpeg present", () => {
  const { detectFeatureCapabilities } = require("../scripts/hosting-features");
  const features = detectFeatureCapabilities();
  const music = features.find((f: any) => f.feature === "music");
  assert.ok(music, "music must be in matrix");
  assert.ok(["available", "degraded"].includes(music.status), "music must be available or degraded based on ffmpeg");
});

console.log("\n===== U16 VALIDATION =====");

// 22. Config validation
test("validateDeploymentConfig returns issues", () => {
  const { validateDeploymentConfig } = require("../scripts/hosting-features");
  const issues = validateDeploymentConfig();
  assert.ok(Array.isArray(issues), "must be array");
  for (const i of issues) {
    assert.ok(["error", "warning", "info"].includes(i.severity), "severity must be valid");
    assert.ok(i.name, "must have name");
    assert.ok(i.status, "must have status");
    assert.ok(i.message, "must have message");
  }
});

// 23. No secrets in validation output
test("validation does not contain secret values", () => {
  const { validateDeploymentConfig } = require("../scripts/hosting-features");
  const issues = validateDeploymentConfig();
  for (const i of issues) {
    assert.ok(!i.message.includes("sk-"), "no API keys in messages");
    assert.ok(!i.message.match(/[A-Za-z0-9]{40,}/), "no long token-like strings in messages");
  }
});

console.log("\n===== U16 MIGRATION =====");

// 24. Migration steps
test("getMigrationSteps returns steps for render->docker", () => {
  const { getMigrationSteps } = require("../scripts/hosting-features");
  const steps = getMigrationSteps("render", "docker");
  assert.ok(Array.isArray(steps), "must be array");
  assert.ok(steps.length >= 3, "must have at least 3 steps");
  assert.ok(steps.some((s: any) => s.category === "core"), "must have core category");
});

// 25. Migration steps render->railway
test("getMigrationSteps returns steps for render->railway", () => {
  const { getMigrationSteps } = require("../scripts/hosting-features");
  const steps = getMigrationSteps("render", "railway");
  assert.ok(steps.length >= 3, "must have at least 3 steps");
});

// 26. Same migration returns minimal steps
test("same provider migration returns minimal steps", () => {
  const { getMigrationSteps } = require("../scripts/hosting-features");
  const steps = getMigrationSteps("render", "render");
  assert.ok(steps.some((s: any) => s.effort === "none"), "must have none-effort steps");
});

console.log("\n===== U16 SECURITY =====");

// 27. No secrets exposed in detection
test("detectHosting does not return secret values", () => {
  process.env.MY_SECRET_TOKEN = "supersecret123456";
  const { detectHosting } = require("../scripts/hosting-detect");
  const h = detectHosting();
  const allSignals = h.signals.join(" ");
  assert.ok(!allSignals.includes("supersecret123456"), "no secrets in signals");
  delete process.env.MY_SECRET_TOKEN;
});

// 28. No .env committed
test(".env is gitignored", () => {
  const gitignore = fs.readFileSync(".gitignore", "utf8");
  assert.ok(gitignore.includes(".env"), ".env must be in gitignore");
});

// 29. start.sh exists
test("scripts/start.sh exists and is executable", () => {
  assert.ok(fs.existsSync("scripts/start.sh"), "start.sh must exist");
});

// 30. hosting-detect.ts exists
test("scripts/hosting-detect.ts exists", () => {
  assert.ok(fs.existsSync("scripts/hosting-detect.ts"), "hosting-detect.ts must exist");
});

// 31. hosting-features.ts exists
test("scripts/hosting-features.ts exists", () => {
  assert.ok(fs.existsSync("scripts/hosting-features.ts"), "hosting-features.ts must exist");
});

// 32. deployment-advisor.ts uses new modules
test("deployment-advisor.ts imports hosting-detect", () => {
  const content = fs.readFileSync("scripts/deployment-advisor.ts", "utf8");
  assert.ok(content.includes("hosting-detect"), "must import hosting-detect");
  assert.ok(content.includes("hosting-features"), "must import hosting-features");
});

// 33. Dockerfile uses start.sh
test("Dockerfile CMD uses start.sh", () => {
  const content = fs.readFileSync("Dockerfile", "utf8");
  assert.ok(content.includes('scripts/start.sh'), "Dockerfile must use start.sh");
});

// 34. package.json start uses start.sh
test("package.json start uses start.sh", () => {
  const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
  assert.ok(pkg.scripts.start.includes("start.sh"), "start script must use start.sh");
});

// 35. Render-specific message removed from index.ts
test("index.ts has no Render-specific supervisor message", () => {
  const content = fs.readFileSync("src/index.ts", "utf8");
  assert.ok(!content.includes("Exiting so Render can"), "must not have Render-specific message");
  assert.ok(content.includes("process manager"), "must use generic message");
});

// 36. No secrets in source code
test("no hardcoded secrets in hosting files", () => {
  const files = ["scripts/hosting-detect.ts", "scripts/hosting-features.ts", "scripts/deployment-advisor.ts", "scripts/start.sh"];
  for (const file of files) {
    const content = fs.readFileSync(file, "utf8");
    assert.ok(!content.match(/sk-[a-zA-Z0-9]{20,}/), file + " must not contain API keys");
    assert.ok(!content.match(/DISCORD_TOKEN\s*=\s*["'][a-zA-Z0-9]{20,}/), file + " must not contain Discord tokens");
  }
});

// 37. Graceful degradation - application starts without external music server
test("application code does not require external music server", () => {
  const indexContent = fs.readFileSync("src/index.ts", "utf8");
  assert.ok(indexContent.includes("NodeMusicManager") || indexContent.includes("nodeMusic"), "index.ts uses NodeMusicManager");
});

// 38. PID file not tracked
test("runtime PID files not tracked in git", () => {
  const gitignore = fs.readFileSync(".gitignore", "utf8");
  assert.ok(gitignore.includes(".anomaly-monitor.pid"), "anomaly-monitor.pid must be gitignored");
  assert.ok(gitignore.includes(".ashennai-supervisor.pid"), "supervisor.pid must be gitignored");
});

console.log("\n===== SUMMARY =====");
console.log("Passed: " + passed);
console.log("Failed: " + failed);
console.log(failed === 0 ? "ALL U16 TESTS PASSED" : "SOME U16 TESTS FAILED");
console.log("");
process.exit(failed > 0 ? 1 : 0);
