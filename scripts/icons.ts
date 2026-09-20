/**
 * icons.ts — Icon update and validation utility
 *
 * Commands:
 *   npm run icons:check    — Check for upstream changes (dry run)
 *   npm run icons:update   — Download and update icons from Tabler upstream
 *
 * Features:
 *   - Downloads only configured icons (not the entire Tabler repository)
 *   - Detects new/changed/removed icons
 *   - Updates local SVG assets
 *   - Records metadata (source, revision, timestamps)
 *   - Validates downloaded assets
 *   - Preserves custom AshenAI assets
 *   - Fails safely if upstream is unavailable
 *
 * This script does NOT modify any project source files.
 * It only updates assets/emojis/svg/ and assets/emojis/icon-metadata.json.
 */

import {
  readFileSync,
  writeFileSync,
  existsSync,
  readdirSync,
  mkdirSync,
  statSync,
} from "node:fs";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const ASSETS_DIR = join(__dirname, "..", "assets", "emojis");
const SVG_DIR = join(ASSETS_DIR, "svg");
const METADATA_PATH = join(ASSETS_DIR, "icon-metadata.json");
const ICON_CONFIG_PATH = join(__dirname, "..", "src", "discord", "icons.ts");

const TABLER_BASE = "https://unpkg.com/@tabler/icons@latest/icons/outline";
const TABLER_PACKAGE = "https://unpkg.com/@tabler/icons@latest/package.json";
const TIMEOUT_MS = 15_000;

// ---------------------------------------------------------------------------
// Icon configuration (read from icons.ts at runtime)
// ---------------------------------------------------------------------------

interface IconConfig {
  tabler: string;
  color: string;
  fallback: string;
  envVar: string;
}

type IconName = string;

function loadIconConfig(): Record<IconName, IconConfig> {
  // Parse the ICON_MAP from icons.ts without importing TypeScript
  const content = readFileSync(ICON_CONFIG_PATH, "utf-8");
  const config: Record<IconName, IconConfig> = {};

  // Match icon entries: name: { tabler: "...", color: "...", fallback: "...", envVar: "..." }
  const entryRegex = /^\s+(\w+):\s*\{\s*tabler:\s*"([^"]+)",\s*color:\s*"([^"]+)",\s*fallback:\s*"([^"]*)",\s*envVar:\s*"([^"]+)"\s*\}/gm;
  let match: RegExpExecArray | null;

  while ((match = entryRegex.exec(content)) !== null) {
    const [, name, tabler, color, fallback, envVar] = match;
    config[name] = { tabler, color, fallback, envVar };
  }

  return config;
}

// ---------------------------------------------------------------------------
// Metadata types
// ---------------------------------------------------------------------------

interface IconMetadata {
  name: string;
  tablerIcon: string;
  localFile: string;
  upstreamUrl: string;
  upstreamRevision: string;
  lastChecked: string;
  lastUpdated: string;
  checksum: string;
  source: "tabler" | "custom";
}

interface MetadataFile {
  version: number;
  upstreamRevision: string;
  lastChecked: string;
  icons: Record<IconName, IconMetadata>;
}

function loadMetadata(): MetadataFile {
  if (existsSync(METADATA_PATH)) {
    try {
      return JSON.parse(readFileSync(METADATA_PATH, "utf-8"));
    } catch {
      // Corrupted metadata — start fresh
    }
  }
  return {
    version: 1,
    upstreamRevision: "",
    lastChecked: new Date().toISOString(),
    icons: {},
  };
}

function saveMetadata(meta: MetadataFile): void {
  writeFileSync(METADATA_PATH, JSON.stringify(meta, null, 2));
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

async function fetchText(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
}

async function fetchJson(url: string): Promise<any | null> {
  const text = await fetchText(url);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// SVG helpers
// ---------------------------------------------------------------------------

function normalizeSvg(svg: string): string {
  // Strip metadata comments, class attributes, and normalize whitespace
  return svg
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\s*class="[^"]*"/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function computeChecksum(content: string): string {
  // Simple hash — not cryptographic, just for change detection
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

// ---------------------------------------------------------------------------
// Dry run (check mode)
// ---------------------------------------------------------------------------

interface CheckResult {
  name: string;
  tablerIcon: string;
  status: "new" | "changed" | "unchanged" | "removed" | "error";
  localChecksum?: string;
  upstreamChecksum?: string;
}

async function checkIcons(config: Record<IconName, IconConfig>): Promise<CheckResult[]> {
  const meta = loadMetadata();
  const results: CheckResult[] = [];

  console.log("🔍 Checking upstream Tabler icons...\n");

  // Get upstream revision
  const pkg = await fetchJson(TABLER_PACKAGE);
  const upstreamRevision = pkg?.version ?? "unknown";
  console.log(`Upstream revision: ${upstreamRevision}`);
  console.log(`Local revision:    ${meta.upstreamRevision || "(none)"}\n`);

  // Check each configured icon
  for (const [name, iconConfig] of Object.entries(config)) {
    const url = `${TABLER_BASE}/${iconConfig.tabler}.svg`;
    const upstreamSvg = await fetchText(url);

    if (!upstreamSvg) {
      results.push({
        name,
        tablerIcon: iconConfig.tabler,
        status: "error",
      });
      console.log(`  ❌ ${name} (${iconConfig.tabler}) — failed to fetch upstream`);
      continue;
    }

    const upstreamChecksum = computeChecksum(normalizeSvg(upstreamSvg));
    const localMeta = meta.icons[name];

    if (!localMeta) {
      results.push({
        name,
        tablerIcon: iconConfig.tabler,
        status: "new",
        upstreamChecksum,
      });
      console.log(`  🆕 ${name} (${iconConfig.tabler}) — new icon`);
    } else if (localMeta.checksum !== upstreamChecksum) {
      results.push({
        name,
        tablerIcon: iconConfig.tabler,
        status: "changed",
        localChecksum: localMeta.checksum,
        upstreamChecksum,
      });
      console.log(`  🔄 ${name} (${iconConfig.tabler}) — upstream changed`);
    } else {
      results.push({
        name,
        tablerIcon: iconConfig.tabler,
        status: "unchanged",
        localChecksum: localMeta.checksum,
        upstreamChecksum,
      });
      console.log(`  ✅ ${name} (${iconConfig.tabler}) — up to date`);
    }
  }

  // Check for orphaned local SVGs not in config
  if (existsSync(SVG_DIR)) {
    const localSvgs = readdirSync(SVG_DIR)
      .filter((f) => f.endsWith(".svg"))
      .map((f) => f.replace(/^ash_/, "").replace(/\.svg$/, ""));

    for (const localName of localSvgs) {
      if (!(localName in config)) {
        results.push({
          name: localName,
          tablerIcon: "(local only)",
          status: "removed",
        });
        console.log(`  ⚠️  ${localName} — local SVG exists but not in icon config`);
      }
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Update mode
// ---------------------------------------------------------------------------

async function updateIcons(config: Record<IconName, IconConfig>, dryRun: boolean): Promise<void> {
  const meta = loadMetadata();

  // Ensure directories exist
  mkdirSync(SVG_DIR, { recursive: true });

  // Get upstream revision
  const pkg = await fetchJson(TABLER_PACKAGE);
  const upstreamRevision = pkg?.version ?? "unknown";

  console.log(`📥 Updating icons from Tabler upstream (${upstreamRevision})...\n`);

  let downloaded = 0;
  let unchanged = 0;
  let failed = 0;

  for (const [name, iconConfig] of Object.entries(config)) {
    const url = `${TABLER_BASE}/${iconConfig.tabler}.svg`;
    const upstreamSvg = await fetchText(url);

    if (!upstreamSvg) {
      console.log(`  ❌ ${name} (${iconConfig.tabler}) — failed to fetch`);
      failed++;
      continue;
    }

    const upstreamChecksum = computeChecksum(normalizeSvg(upstreamSvg));
    const localMeta = meta.icons[name];

    // Skip if unchanged
    if (localMeta && localMeta.checksum === upstreamChecksum) {
      console.log(`  ✅ ${name} — unchanged`);
      unchanged++;
      continue;
    }

    if (dryRun) {
      const action = localMeta ? "update" : "download";
      console.log(`  🔍 ${name} (${iconConfig.tabler}) — would ${action}`);
      downloaded++;
      continue;
    }

    // Write the SVG
    const svgPath = join(SVG_DIR, `ash_${name}.svg`);
    writeFileSync(svgPath, upstreamSvg);

    // Update metadata
    meta.icons[name] = {
      name,
      tablerIcon: iconConfig.tabler,
      localFile: `ash_${name}.svg`,
      upstreamUrl: url,
      upstreamRevision,
      lastChecked: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      checksum: upstreamChecksum,
      source: "tabler",
    };

    console.log(`  📥 ${name} (${iconConfig.tabler}) — downloaded`);
    downloaded++;
  }

  // Update metadata file
  if (!dryRun) {
    meta.upstreamRevision = upstreamRevision;
    meta.lastChecked = new Date().toISOString();
    saveMetadata(meta);
  }

  console.log(`\n📊 Summary: ${downloaded} downloaded, ${unchanged} unchanged, ${failed} failed`);

  if (dryRun) {
    console.log("\n🔍 Dry run complete. No files were modified.");
    console.log("   Run without --dry-run to apply changes.");
  } else {
    console.log("\n✅ Icons updated successfully.");
    console.log("   Run 'npm run build:emojis' to regenerate PNGs.");
    console.log("   Run 'npm run upload:emojis' to upload to Discord.");
  }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validateIcons(config: Record<IconName, IconConfig>): boolean {
  console.log("🔍 Validating icon assets...\n");

  let valid = true;
  const meta = loadMetadata();

  for (const [name, iconConfig] of Object.entries(config)) {
    const svgPath = join(SVG_DIR, `ash_${name}.svg`);
    const pngPath = join(ASSETS_DIR, "png", `ash_${name}.png`);

    // Check SVG exists
    if (!existsSync(svgPath)) {
      console.log(`  ❌ ${name} — SVG missing: ash_${name}.svg`);
      valid = false;
      continue;
    }

    // Check PNG exists
    if (!existsSync(pngPath)) {
      console.log(`  ⚠️  ${name} — PNG missing (run build:emojis)`);
    }

    // Check metadata
    const iconMeta = meta.icons[name];
    if (!iconMeta) {
      console.log(`  ⚠️  ${name} — no metadata (run icons:update)`);
    } else {
      // Verify checksum matches
      const svgContent = readFileSync(svgPath, "utf-8");
      const currentChecksum = computeChecksum(normalizeSvg(svgContent));
      if (currentChecksum !== iconMeta.checksum) {
        console.log(`  ⚠️  ${name} — SVG modified since last update`);
      }
    }

    // Check SVG is valid XML-ish
    const svgContent = readFileSync(svgPath, "utf-8");
    if (!svgContent.includes("<svg") || !svgContent.includes("</svg>")) {
      console.log(`  ❌ ${name} — invalid SVG content`);
      valid = false;
      continue;
    }

    // Check viewBox is 24x24 (Tabler standard)
    if (!svgContent.includes('viewBox="0 0 24 24"')) {
      console.log(`  ⚠️  ${name} — unexpected viewBox (expected 0 0 24 24)`);
    }

    console.log(`  ✅ ${name} — valid`);
  }

  // Check for orphaned files
  if (existsSync(SVG_DIR)) {
    const localSvgs = readdirSync(SVG_DIR).filter((f) => f.endsWith(".svg"));
    for (const svg of localSvgs) {
      const logicalName = svg.replace(/^ash_/, "").replace(/\.svg$/, "");
      if (!(logicalName in config)) {
        console.log(`  ⚠️  ${svg} — not in icon config (custom or orphaned)`);
      }
    }
  }

  console.log(`\n${valid ? "✅ All icons valid" : "❌ Some icons have issues"}`);
  return valid;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0] ?? "check";
  const dryRunFlag = args.includes("--dry-run");

  const config = loadIconConfig();
  const iconCount = Object.keys(config).length;

  if (iconCount === 0) {
    console.error("❌ No icons found in configuration. Check src/discord/icons.ts");
    process.exit(1);
  }

  console.log(`\n🎨 AshenAI Icon Utility (${iconCount} icons configured)\n`);

  switch (command) {
    case "check": {
      const results = await checkIcons(config);
      const hasChanges = results.some((r) => r.status !== "unchanged");
      console.log(`\n${hasChanges ? "🔄 Updates available" : "✅ All icons up to date"}`);
      process.exit(hasChanges ? 1 : 0);
    }

    case "update": {
      await updateIcons(config, dryRunFlag);
      process.exit(0);
    }

    case "validate": {
      const valid = validateIcons(config);
      process.exit(valid ? 0 : 1);
    }

    default:
      console.error(`Unknown command: ${command}`);
      console.error("Usage: tsx scripts/icons.ts [check|update|validate] [--dry-run]");
      process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
