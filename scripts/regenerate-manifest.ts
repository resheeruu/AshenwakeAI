#!/usr/bin/env node
/* ================================================================
 * REGENERATE MANIFEST FROM EXISTING GIFS
 * ================================================================ */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const GIF_ROOT = path.join(ROOT, "data", "anime-gifs");
const ACTIONS_DIR = path.join(GIF_ROOT, "actions");

const ACTIONS = [
  "hug", "cuddle", "pat", "headpat", "kiss",
  "punch", "kick", "slap", "bonk", "bite",
  "hit", "smack", "throw", "shoot", "stab",
  "kill", "destroy", "explode",
  "poke", "wave", "highfive", "yeet", "dance",
  "laugh", "cry", "blush", "smug", "panic",
  "sleep", "celebrate", "roast", "simp",
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

function isValidGif(buffer: Buffer): boolean {
  if (buffer.length < 10) return false;
  const sig = buffer.toString("latin1", 0, 6);
  return sig === "GIF87a" || sig === "GIF89a";
}

async function main() {
  console.log("=== REGENERATE MANIFEST ===\n");

  const manifestAssets = [];
  let totalBytes = 0;

  for (const action of ACTIONS) {
    const actionDir = path.join(ACTIONS_DIR, action);
    try {
      const files = await fs.readdir(actionDir);
      const gifFiles = files.filter(f => f.endsWith(".gif")).sort();

      for (const file of gifFiles) {
        const filePath = path.join(actionDir, file);
        const buffer = await fs.readFile(filePath);
        const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");
        const size = buffer.length;
        totalBytes += size;

        const relPath = path.join("actions", action, file).split(path.sep).join("/");

        manifestAssets.push({
          file: relPath,
          action,
          category: action === "hug" || action === "cuddle" || action === "pat" || action === "headpat" || action === "kiss" ? "affection" :
                    action === "punch" || action === "kick" || action === "slap" || action === "bonk" || action === "bite" || action === "hit" || action === "smack" || action === "throw" || action === "shoot" || action === "stab" || action === "kill" || action === "destroy" || action === "explode" ? "combat" : "fun",
          source: "Programmatic Test Generator",
          sourceUrl: "https://github.com/resheeruu/AshenWaleAI",
          license: "CC0",
          creator: "AshenAI Test Generator",
          attribution: "AshenAI Test Generator, CC0 (programmatically generated for testing)",
          retrievedAt: new Date().toISOString(),
          sha256: crypto.createHash("sha256").update(buffer).digest("hex"),
          bytes: size,
        });

        console.log(`  ✓ ${action}/${file}: ${size} bytes`);
      }
    } catch (error) {
      console.log(`  ⚠ ${action}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const manifest = {
    version: 1,
    generatedAt: new Date().toISOString(),
    totalAssets: manifestAssets.length,
    totalBytes,
    assets: manifestAssets,
  };

  await fs.writeFile(
    path.join(GIF_ROOT, "manifest.json"),
    JSON.stringify(manifest, null, 2)
  );

  // Update attributions
  let md = "# AshenAI Local GIF Attributions\n\n";
  md += `Generated: ${new Date().toISOString()}\n`;
  md += `Total Assets: ${manifestAssets.length}\n`;
  md += `Total Size: ${totalBytes} bytes (${(totalBytes / 1024).toFixed(1)} KB)\n\n`;

  md += "## Programmatic Test Generator\n\n";
  md += "License: CC0\n\n";
  for (const asset of manifestAssets) {
    md += `- **${asset.action}** (${asset.file}): ${asset.attribution}\n`;
  }
  md += "\nNote: These are programmatically generated test GIFs. Replace with legally verified assets from OpenGameArt.org, Kenney.nl, etc.\n";

  await fs.writeFile(path.join(GIF_ROOT, "ATTRIBUTIONS.md"), md);

  console.log(`\n=== MANIFEST REGENERATED ===`);
  console.log(`Total Assets: ${manifestAssets.length}`);
  console.log(`Total Size: ${totalBytes} bytes (${(totalBytes / 1024).toFixed(1)} KB)`);
  console.log(`Manifest: ${path.join(GIF_ROOT, "manifest.json")}`);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});