/* ================================================================
 * ASHENAI LOCAL GIF COLLECTOR - PRODUCTION VERSION
 *
 * Downloads legally redistributable anime-style reaction GIFs
 * from verified sources with clear licenses (CC0, Public Domain, CC BY).
 * Organizes them into data/anime-gifs/actions/<mediaKey>/
 * Generates manifest.json and ATTRIBUTIONS.md
 *
 * SOURCES TO POPULATE (manual curation required):
 * 1. OpenGameArt.org - CC0 animated sprites
 *    Search: https://opengameart.org/art-search-advanced?keys=&field_art_type_tid%5B%5D=8&field_license_tid%5B%5D=5
 * 2. Kenney.nl Assets - Public Domain (CC0)
 *    https://kenney.nl/assets
 * 3. GitHub repositories with CC0 anime reactions:
 *    - https://github.com/justinmeiners/lc3-vm (some assets)
 * 4. itch.io free game assets with CC0 license
 *    Search: https://itch.io/game-assets/free?category=1240 (sprites)
 * 5. OpenClipArt.org - Public Domain
 * 6. Pixabay/Pexels - Free for commercial use (verify GIF availability)
 * ================================================================ */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const GIF_ROOT = path.join(ROOT, "data", "anime-gifs");
const ACTIONS_DIR = path.join(GIF_ROOT, "actions");

interface ManifestAsset {
  file: string;
  action: string;
  category: string;
  source: string;
  sourceUrl: string;
  license: string;
  creator: string;
  attribution: string;
  retrievedAt: string;
  sha256: string;
  bytes: number;
}

interface Manifest {
  version: number;
  generatedAt: string;
  totalAssets: number;
  assets: ManifestAsset[];
}

/* ================================================================
 * LEGAL SOURCE TEMPLATE
 *
 * Add verified assets here. Each entry must have:
 * - Direct download URL to a GIF file
 * - Explicit license allowing redistribution (CC0, PD, CC BY, CC BY-SA)
 * - Verified creator/attribution info
 * ================================================================ */

const SOURCE_ASSETS: Array<{
  url: string;
  action: string;
  source: string;
  sourceUrl: string;
  license: "CC0" | "Public Domain" | "CC BY" | "CC BY-SA";
  creator: string;
  attribution: string;
}> = [
  // TODO: Add verified assets from legal sources
  // Format:
  // {
  //   url: "https://example.com/asset.gif",
  //   action: "hug",
  //   source: "OpenGameArt.org",
  //   sourceUrl: "https://opengameart.org/content/...",
  //   license: "CC0",
  //   creator: "Artist Name",
  //   attribution: "Artist Name, CC0",
  // },
];

const CATEGORY_MAP: Record<string, string> = {
  hug: "affection", cuddle: "affection", pat: "affection", headpat: "affection", kiss: "affection",
  punch: "combat", kick: "combat", slap: "combat", bonk: "combat", bite: "combat",
  hit: "combat", smack: "combat", throw: "combat", shoot: "combat", stab: "combat",
  kill: "combat", destroy: "combat", explode: "combat",
  poke: "fun", wave: "fun", highfive: "fun", yeet: "fun", dance: "fun",
  laugh: "fun", cry: "fun", blush: "fun", smug: "fun", panic: "fun",
  sleep: "fun", celebrate: "fun", roast: "fun", simp: "fun",
};

/* ================================================================
 * HELPER FUNCTIONS
 * ================================================================ */

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

function sha256Buffer(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function isValidGif(buffer: Buffer): boolean {
  if (buffer.length < 10) return false;
  const sig = buffer.toString("latin1", 0, 6);
  return sig === "GIF87a" || sig === "GIF89a";
}

async function validateGifFile(filePath: string): Promise<{ valid: boolean; size: number; sha256: string } | null> {
  try {
    const buffer = await fs.readFile(filePath);
    if (!isValidGif(buffer)) return null;
    if (buffer.length === 0 || buffer.length > 8 * 1024 * 1024) return null;
    const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");
    return { valid: true, size: buffer.length, sha256 };
  } catch {
    return null;
  }
}

async function downloadAsset(asset: { url: string; action: string; source: string; sourceUrl: string; license: string; creator: string; attribution: string }): Promise<ManifestAsset | null> {
  const actionDir = path.join(ACTIONS_DIR, asset.action);
  await ensureDir(actionDir);

  // Find next available index
  const existing = await fs.readdir(path.join(ACTIONS_DIR, asset.action)).catch(() => []);
  const index = existing.filter(f => f.endsWith(".gif")).length + 1;
  const fileName = `${asset.action}-${index.toString().padStart(3, "0")}.gif`;
  const finalPath = path.join(ACTIONS_DIR, asset.action, fileName);

  try {
    const response = await fetch(asset.url);
    if (!response.ok) {
      console.warn(`  ✗ Failed to download: ${response.status} ${response.statusText}`);
      return null;
    }
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Validate GIF
    if (!isValidGif(buffer)) {
      console.warn(`  ✗ Invalid GIF format`);
      return null;
    }
    if (buffer.length === 0 || buffer.length > 8 * 1024 * 1024) {
      console.warn(`  ✗ Invalid size: ${buffer.length} bytes`);
      return null;
    }

    await fs.writeFile(finalPath, buffer);

    const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");
    const relPath = path.relative(GIF_ROOT, finalPath).split(path.sep).join("/");

    return {
      file: path.join("actions", asset.action, fileName).split(path.sep).join("/"),
      action: asset.action,
      category: CATEGORY_MAP[asset.action] || "unknown",
      source: asset.source,
      sourceUrl: asset.sourceUrl,
      license: asset.license,
      creator: asset.creator,
      attribution: asset.attribution,
      retrievedAt: new Date().toISOString(),
      sha256,
      bytes: buffer.length,
    };
  } catch (error) {
    console.warn(`  ✗ Error: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

/* ================================================================
 * MANIFEST GENERATION
 * ================================================================ */

async function generateManifest(assets: ManifestAsset[]): Promise<void> {
  const manifest = {
    version: 1,
    generatedAt: new Date().toISOString(),
    totalAssets: assets.length,
    assets,
  };

  await fs.writeFile(
    path.join(GIF_ROOT, "manifest.json"),
    JSON.stringify({ version: 1, generatedAt: new Date().toISOString(), totalAssets: assets.length, assets }, null, 2)
  );
}

async function generateAttributions(assets: ManifestAsset[]): Promise<void> {
  let md = "# AshenAI Local GIF Attributions\n\n";
  md += `Generated: ${new Date().toISOString()}\n`;
  md += `Total Assets: ${assets.length}\n\n`;

  const bySource = new Map<string, ManifestAsset[]>();
  for (const asset of assets) {
    const list = bySource.get(asset.source) || [];
    list.push(asset);
    bySource.set(asset.source, list);
  }

  for (const [source, assets] of bySource) {
    md += `## ${source}\n\n`;
    md += `License: ${assets[0].license}\n\n`;
    for (const asset of assets) {
      md += `- **${asset.action}** (${asset.file}): ${asset.attribution}\n`;
      if (asset.sourceUrl) md += `  Source: ${asset.sourceUrl}\n`;
    }
    md += "\n";
  }

  await fs.writeFile(path.join(GIF_ROOT, "ATTRIBUTIONS.md"), md);
}

/* ================================================================
 * VALIDATION
 * ================================================================ */

async function validateCollection(): Promise<{ valid: number; invalid: number; totalBytes: number }> {
  let valid = 0;
  let invalid = 0;
  let totalBytes = 0;

  for (const asset of SOURCE_ASSETS) {
    const actionDir = path.join(ACTIONS_DIR, asset.action);
    try {
      const files = await fs.readdir(actionDir);
      for (const file of files) {
        if (file.endsWith(".gif")) {
          const filePath = path.join(actionDir, file);
          const result = await validateGifFile(filePath);
          if (result && result.valid) {
            valid++;
            totalBytes += result.size;
          } else {
            invalid++;
          }
        }
      }
    } catch {
      // Directory might not exist
    }
  }

  return { valid, invalid, totalBytes };
}

/* ================================================================
 * MAIN
 * ================================================================ */

async function main() {
  console.log("=== ASHENAI LOCAL GIF COLLECTOR ===\n");

  if (SOURCE_ASSETS.length === 0) {
    console.log("No source assets configured. Please populate SOURCE_ASSETS array with verified assets.");
    console.log("\nLegal sources to research:");
    console.log("1. OpenGameArt.org - CC0 animated sprites");
    console.log("   https://opengameart.org/art-search-advanced?field_art_type_tid%5B%5D=8&field_license_tid%5B%5D=5");
    console.log("2. Kenney.nl Assets - Public Domain");
    console.log("   https://kenney.nl/assets");
    console.log("3. itch.io free game assets (CC0 filter)");
    console.log("   https://itch.io/game-assets/free?category=1240");
    console.log("4. OpenClipArt.org - Public Domain");
    console.log("5. GitHub repositories with CC0 anime reactions\n");
    
    // Still create directory structure and templates
    await ensureDir(ACTIONS_DIR);
    await generateManifest([]);
    await generateAttributions([]);
    console.log("Created empty manifest.json and ATTRIBUTIONS.md templates");
    return;
  }

  // Ensure directories
  for (const asset of SOURCE_ASSETS) {
    await ensureDir(path.join(ACTIONS_DIR, asset.action));
  }

  console.log(`Collecting ${SOURCE_ASSETS.length} GIFs from verified sources...\n`);

  const manifestAssets: ManifestAsset[] = [];
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < SOURCE_ASSETS.length; i++) {
    const asset = SOURCE_ASSETS[i];
    console.log(`[${i + 1}/${SOURCE_ASSETS.length}] ${asset.action} from ${asset.source}...`);

    const result = await downloadAsset(asset);
    if (result) {
      manifestAssets.push(result);
      console.log(`  ✓ Saved (${result.bytes} bytes, SHA256: ${result.sha256.slice(0, 16)}...)`);
      successCount++;
    } else {
      failCount++;
    }
  }

  await generateManifest(manifestAssets);
  await generateAttributions(manifestAssets);

  console.log(`\n=== COLLECTION COMPLETE ===`);
  console.log(`Success: ${successCount}`);
  console.log(`Failed: ${failCount}`);
  console.log(`Manifest: ${path.join(GIF_ROOT, "manifest.json")}`);
  console.log(`Attributions: ${path.join(GIF_ROOT, "ATTRIBUTIONS.md")}`);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});