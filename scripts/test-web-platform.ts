/* ==================== WEB PLATFORM TESTS ==================== */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`FAILED: ${message}`);
  }
}

const BASE = process.cwd();

// Test provider catalog file exists
assert(existsSync(path.join(BASE, "src/ai/providers/provider-catalog.ts")), "Provider catalog source exists");

// Test dashboard HTML exists
assert(existsSync(path.join(BASE, "src/web/public/dashboard.html")), "Dashboard HTML exists");

// Test CSS files exist
assert(existsSync(path.join(BASE, "src/web/public/css/base.css")), "Base CSS exists");
assert(existsSync(path.join(BASE, "src/web/public/css/responsive.css")), "Responsive CSS exists");

// Test JS files exist
const jsFiles = [
  "js/api.js",
  "js/navigation.js",
  "js/providers.js",
  "js/models.js",
  "js/app.js",
  "js/settings.js",
  "js/security.js",
  "js/components/toast.js",
];
for (const jsFile of jsFiles) {
  assert(existsSync(path.join(BASE, `src/web/public/${jsFile}`)), `JS file ${jsFile} exists`);
}

// Test public pages exist
const pages = [
  "index.html",
  "features.html",
  "docs.html",
  "status.html",
  "privacy.html",
  "terms.html",
  "support.html",
];
for (const page of pages) {
  assert(existsSync(path.join(BASE, `src/web/public/${page}`)), `Public page ${page} exists`);
}

// Test server.ts has new API routes
const serverContent = readFileSync(path.join(BASE, "src/web/server.ts"), "utf8");

assert(serverContent.includes("/api/providers/catalog"), "Server has provider catalog API route");
assert(serverContent.includes("/api/guilds/:guildId/ai"), "Server has AI control center API route");
assert(serverContent.includes("/api/guilds/:guildId/ai/routing"), "Server has AI routing API route");
assert(serverContent.includes("/api/guilds/:guildId/ai/limits"), "Server has AI limits API route");
assert(serverContent.includes("/api/guilds/:guildId/models"), "Server has models API route");
assert(serverContent.includes("/api/security/sessions"), "Server has security sessions API route");
assert(serverContent.includes("/api/guilds/:guildId/support"), "Server has support API route");
assert(serverContent.includes("/api/audit/search"), "Server has audit search API route");
assert(serverContent.includes("/api/providers/discover"), "Server has provider discovery API route");
assert(serverContent.includes("getAllGuildConfigs"), "Server imports getAllGuildConfigs");

// Test provider registry exports catalog
const indexContent = readFileSync(path.join(BASE, "src/ai/providers/index.ts"), "utf8");
assert(indexContent.includes("provider-catalog"), "Provider index imports provider-catalog");

// Test settings.js exists
assert(existsSync(path.join(BASE, "src/web/public/js/settings.js")), "Settings JS module exists");

// Test security.js exists
assert(existsSync(path.join(BASE, "src/web/public/js/security.js")), "Security JS module exists");

console.log("Web platform tests passed!");
