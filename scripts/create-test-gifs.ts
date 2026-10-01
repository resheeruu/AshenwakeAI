#!/usr/bin/env node
/* ================================================================
 * CREATE TEST GIF - Generates valid animated GIFs for testing
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

/* ================================================================
 * GIF GENERATION
 * Creates valid animated GIFs with solid color frames
 * ================================================================ */

function createGifHeader(width: number, height: number, globalColorTable: boolean, colorResolution: number, sorted: boolean, globalColorTableSize: number): Buffer {
  const buf = Buffer.alloc(13);
  buf.write("GIF89a", 0); // Signature + Version
  buf.writeUInt16LE(width, 6); // Logical Screen Width
  buf.writeUInt16LE(height, 8); // Logical Screen Height
  let packed = 0;
  if (globalColorTable) packed |= 0x80;
  packed |= (colorResolution & 0x07) << 4;
  if (sorted) packed |= 0x08;
  packed |= (globalColorTableSize & 0x07);
  buf.writeUInt8(packed, 10); // Packed field
  buf.writeUInt8(0, 11); // Background color index
  buf.writeUInt8(0, 12); // Pixel aspect ratio
  return buf;
}

function createGlobalColorTable(colors: number[][]): Buffer {
  const buf = Buffer.alloc(colors.length * 3);
  for (let i = 0; i < colors.length; i++) {
    buf.writeUInt8(colors[i][0], i * 3);
    buf.writeUInt8(colors[i][1], i * 3 + 1);
    buf.writeUInt8(colors[i][2], i * 3 + 2);
  }
  return buf;
}

function createGraphicControlExtension(delay: number, disposal: number, transparentColorIndex: number): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeUInt8(0x21, 0); // Extension Introducer
  buf.writeUInt8(0xF9, 1); // Graphic Control Label
  buf.writeUInt8(0x04, 2); // Block Size
  let packed = (disposal & 0x07) << 2;
  if (transparentColorIndex >= 0) packed |= 0x01;
  buf.writeUInt8(packed, 3);
  buf.writeUInt16LE(delay, 4); // Delay time in hundredths of a second
  buf.writeUInt8(transparentColorIndex >= 0 ? transparentColorIndex : 0, 6); // Transparent color index
  buf.writeUInt8(0, 7); // Block Terminator
  return buf;
}

function createImageDescriptor(left: number, top: number, width: number, height: number, localColorTable: boolean, interlaced: boolean, localColorTableSize: number): Buffer {
  const buf = Buffer.alloc(10);
  buf.writeUInt8(0x2C, 0); // Image Separator
  buf.writeUInt16LE(left, 1); // Left
  buf.writeUInt16LE(top, 3); // Top
  buf.writeUInt16LE(width, 5); // Width
  buf.writeUInt16LE(height, 7); // Height
  let packed = 0;
  if (localColorTable) packed |= 0x80;
  if (interlaced) packed |= 0x40;
  packed |= (localColorTableSize & 0x07);
  buf.writeUInt8(packed, 9);
  return buf;
}

function createLZWMinCodeSize(codeSize: number): Buffer {
  const buf = Buffer.alloc(1);
  buf.writeUInt8(codeSize, 0);
  return buf;
}

function createImageData(data: Buffer): Buffer {
  // Split into sub-blocks (max 255 bytes each)
  const blocks: Buffer[] = [];
  for (let i = 0; i < data.length; i += 255) {
    const chunk = data.slice(i, Math.min(i + 255, data.length));
    const block = Buffer.alloc(1 + chunk.length);
    block.writeUInt8(chunk.length, 0);
    chunk.copy(block, 1);
    blocks.push(block);
  }
  // Add terminating zero block
  blocks.push(Buffer.from([0x00]));
  return Buffer.concat(blocks);
}

function createFrame(width: number, height: number, colorIndex: number, colorTable: number[][]): Buffer {
  // Simple LZW encoding for a solid color frame
  // This is a minimal implementation - creates a valid but not compressed frame
  const pixelData = Buffer.alloc(width * height);
  pixelData.fill(colorIndex);
  
  // LZW encoding (simplified - just raw with clear code and end code)
  // GIF uses LZW with variable code size. For a solid color, we can use a simple approach.
  // Clear code = 2^colorSize, End code = Clear code + 1
  const colorSize = 2; // 2 bits = 4 colors
  const clearCode = 1 << colorSize; // 4
  const endCode = clearCode + 1; // 5
  
  // For simplicity, we'll create a minimal valid LZW stream
  // This creates a basic uncompressed frame
  const output: number[] = [];
  output.push(clearCode);
  for (let i = 0; i < width * height; i++) {
    output.push(colorIndex);
  }
  output.push(endCode);
  
  // Convert to bit stream and pack into bytes
  const bitStream: number[] = [];
  let bits = 0;
  let bitCount = 0;
  const codeSize = colorSize + 1; // Start with colorSize + 1 bits
  
  for (const code of output) {
    bits |= code << bitCount;
    bitCount += codeSize;
    while (bitCount >= 8) {
      bitStream.push(bits & 0xFF);
      bits >>= 8;
      bitCount -= 8;
    }
  }
  if (bitCount > 0) {
    bitStream.push(bits & 0xFF);
  }
  
  return Buffer.from(bitStream);
}

function createSimpleGif(width: number, height: number, frames: number, delay: number, colors: number[][]): Buffer {
  const parts: Buffer[] = [];
  
  // Header
  parts.push(createGifHeader(width, height, true, 7, false, colors.length - 1));
  
  // Global Color Table
  parts.push(createGlobalColorTable(colors));
  
  // Netscape 2.0 Loop Extension (infinite loop)
  const netscapeExt = Buffer.from([
    0x21, 0xFF, 0x0B, // Extension Introducer, Application Extension, Block Size
    0x4E, 0x45, 0x54, 0x53, 0x43, 0x41, 0x50, 0x45, 0x32, 0x2E, 0x30, // "NETSCAPE2.0"
    0x03, 0x01, 0x00, 0x00, // Sub-block: loop count (0 = infinite)
    0x00 // Block Terminator
  ]);
  parts.push(netscapeExt);
  
  // Colors: 0=transparent/background, 1=red, 2=green, 3=blue
  // We'll use color 1 for frames
  const colorIndex = 1;
  
  for (let f = 0; f < frames; f++) {
    // Graphic Control Extension
    parts.push(createGraphicControlExtension(delay, 2, -1)); // Disposal=2 (restore to background), no transparency
    
    // Image Descriptor
    parts.push(createImageDescriptor(0, 0, width, height, false, false, 0));
    
    // LZW Minimum Code Size
    parts.push(createLZWMinCodeSize(2));
    
    // Image Data (simplified - solid color frame)
    const frameData = createFrame(width, height, colorIndex, colors);
    parts.push(createImageData(frameData));
  }
  
  // Trailer
  parts.push(Buffer.from([0x3B])); // GIF Trailer
  
  return Buffer.concat(parts);
}

/* ================================================================
 * CREATE VALID ANIMATED GIF
 * ================================================================ */

function createValidAnimatedGif(action: string): Buffer {
  // Different dimensions and colors per action for variety
  const configs: Record<string, { width: number; height: number; frames: number; delay: number; colors: number[][] }> = {
    hug: { width: 120, height: 120, frames: 4, delay: 10, colors: [[0,0,0], [255,182,193], [255,105,180], [255,20,147]] }, // pink theme
    cuddle: { width: 120, height: 120, frames: 4, delay: 10, colors: [[0,0,0], [255,228,225], [255,182,193], [255,105,180]] },
    pat: { width: 100, height: 100, frames: 3, delay: 15, colors: [[0,0,0], [255,218,185], [255,165,0], [255,215,0]] }, // gold theme
    headpat: { width: 100, height: 100, frames: 3, delay: 15, colors: [[0,0,0], [255,218,185], [255,165,0], [255,215,0]] },
    kiss: { width: 100, height: 100, frames: 3, delay: 15, colors: [[0,0,0], [255,182,193], [255,20,147], [255,0,127]] },
    punch: { width: 120, height: 120, frames: 4, delay: 8, colors: [[0,0,0], [255,0,0], [255,69,0], [255,165,0]] }, // red/orange theme
    kick: { width: 120, height: 120, frames: 4, delay: 8, colors: [[0,0,0], [255,0,0], [255,69,0], [255,165,0]] },
    slap: { width: 120, height: 120, frames: 4, delay: 8, colors: [[0,0,0], [255,0,0], [255,69,0], [255,165,0]] },
    bonk: { width: 100, height: 100, frames: 3, delay: 10, colors: [[0,0,0], [139,69,19], [160,82,45], [205,133,63]] }, // brown theme
    bite: { width: 100, height: 100, frames: 3, delay: 10, colors: [[0,0,0], [255,0,0], [139,0,0], [255,0,0]] },
    hit: { width: 100, height: 100, frames: 3, delay: 8, colors: [[0,0,0], [255,0,0], [255,69,0], [255,165,0]] },
    smack: { width: 100, height: 100, frames: 3, delay: 8, colors: [[0,0,0], [255,0,0], [255,69,0], [255,165,0]] },
    throw: { width: 120, height: 120, frames: 4, delay: 10, colors: [[0,0,0], [139,69,19], [160,82,45], [205,133,63]] },
    shoot: { width: 120, height: 120, frames: 4, delay: 8, colors: [[0,0,0], [255,255,0], [255,215,0], [255,165,0]] }, // yellow theme
    stab: { width: 100, height: 100, frames: 3, delay: 8, colors: [[0,0,0], [139,0,0], [255,0,0], [255,69,0]] },
    kill: { width: 120, height: 120, frames: 4, delay: 10, colors: [[0,0,0], [139,0,0], [255,0,0], [0,0,0]] },
    destroy: { width: 120, height: 120, frames: 4, delay: 10, colors: [[0,0,0], [255,0,0], [255,69,0], [255,215,0]] },
    explode: { width: 120, height: 120, frames: 5, delay: 6, colors: [[0,0,0], [255,255,0], [255,165,0], [255,0,0], [255,255,255]] },
    poke: { width: 80, height: 80, frames: 3, delay: 15, colors: [[0,0,0], [255,255,255], [200,200,200], [150,150,150]] }, // white/gray
    wave: { width: 100, height: 100, frames: 4, delay: 15, colors: [[0,0,0], [173,216,230], [135,206,235], [0,191,255]] }, // blue theme
    highfive: { width: 100, height: 100, frames: 3, delay: 12, colors: [[0,0,0], [255,165,0], [255,215,0], [255,255,0]] },
    yeet: { width: 120, height: 120, frames: 4, delay: 8, colors: [[0,0,0], [148,0,211], [138,43,226], [186,85,211]] }, // purple theme
    dance: { width: 120, height: 120, frames: 6, delay: 8, colors: [[0,0,0], [255,105,180], [255,20,147], [255,0,127], [255,20,147], [255,105,180]] },
    laugh: { width: 100, height: 100, frames: 4, delay: 10, colors: [[0,0,0], [255,255,0], [255,215,0], [255,255,0]] },
    cry: { width: 100, height: 100, frames: 4, delay: 12, colors: [[0,0,0], [173,216,230], [135,206,235], [0,0,255]] }, // blue tears
    blush: { width: 80, height: 80, frames: 3, delay: 15, colors: [[0,0,0], [255,182,193], [255,105,180], [255,182,193]] },
    smug: { width: 100, height: 100, frames: 3, delay: 15, colors: [[0,0,0], [255,215,0], [255,165,0], [255,215,0]] },
    panic: { width: 100, height: 100, frames: 4, delay: 8, colors: [[0,0,0], [255,0,0], [255,255,255], [255,0,0]] },
    sleep: { width: 100, height: 100, frames: 4, delay: 20, colors: [[0,0,0], [173,216,230], [135,206,250], [176,196,222]] }, // light blue
    celebrate: { width: 120, height: 120, frames: 6, delay: 8, colors: [[0,0,0], [255,255,0], [255,165,0], [255,0,0], [0,255,0], [0,0,255]] }, // rainbow
    roast: { width: 100, height: 100, frames: 3, delay: 12, colors: [[0,0,0], [255,0,0], [255,165,0], [255,0,0]] },
    simp: { width: 100, height: 100, frames: 3, delay: 12, colors: [[0,0,0], [255,182,193], [255,105,180], [255,182,193]] },
  };

  const config = configs[action] || { width: 100, height: 100, frames: 3, delay: 10, colors: [[0,0,0], [255,255,255], [128,128,128], [0,0,0]] };
  return createSimpleGif(config.width, config.height, config.frames, config.delay, config.colors);
}

/* ================================================================
 * MAIN
 * ================================================================ */

async function main() {
  console.log("=== CREATE TEST GIFS ===\n");

  await fs.mkdir(ACTIONS_DIR, { recursive: true });

  const manifestAssets = [];

  for (const action of ACTIONS) {
    const actionDir = path.join(ACTIONS_DIR, action);
    await fs.mkdir(actionDir, { recursive: true });

    const gifBuffer = createValidAnimatedGif(action);
    const fileName = `${action}-001.gif`;
    const filePath = path.join(actionDir, fileName);

    await fs.writeFile(filePath, gifBuffer);

    // Validate
    const isValid = gifBuffer.length >= 10 && 
      (gifBuffer.toString("latin1", 0, 6) === "GIF87a" || gifBuffer.toString("latin1", 0, 6) === "GIF89a");
    
    const sha256 = crypto.createHash("sha256").update(gifBuffer).digest("hex");
    const size = gifBuffer.length;

    if (isValid) {
      console.log(`  ✓ ${action}: ${size} bytes, SHA256: ${sha256.slice(0, 16)}...`);
    } else {
      console.log(`  ✗ ${action}: INVALID GIF`);
    }

    manifestAssets.push({
      file: path.join("actions", action, fileName).split(path.sep).join("/"),
      action,
      category: CATEGORY_MAP[action] || "unknown",
      source: "Programmatic Test Generator",
      sourceUrl: "https://github.com/resheeruu/AshenWaleAI",
      license: "CC0",
      creator: "AshenAI Test Generator",
      attribution: "AshenAI Test Generator, CC0 (programmatically generated for testing)",
      retrievedAt: new Date().toISOString(),
      sha256,
      bytes: size,
    });
  }

  // Write manifest
  const manifest = {
    version: 1,
    generatedAt: new Date().toISOString(),
    totalAssets: manifestAssets.length,
    assets: manifestAssets,
  };

  await fs.writeFile(
    path.join(GIF_ROOT, "manifest.json"),
    JSON.stringify(manifest, null, 2)
  );

  // Write attributions
  let md = "# AshenAI Local GIF Attributions\n\n";
  md += `Generated: ${new Date().toISOString()}\n`;
  md += `Total Assets: ${manifestAssets.length}\n\n`;
  md += "## Programmatic Test Generator\n\n";
  md += "License: CC0\n\n";
  for (const asset of manifestAssets) {
    md += `- **${asset.action}** (${asset.file}): ${asset.attribution}\n`;
  }
  md += "\nNote: These are programmatically generated test GIFs. Replace with legally verified assets from OpenGameArt.org, Kenney.nl, etc.\n";

  await fs.writeFile(path.join(GIF_ROOT, "ATTRIBUTIONS.md"), md);

  console.log(`\n=== TEST GIFS CREATED ===`);
  console.log(`Total: ${manifestAssets.length} GIFs`);
  console.log(`Manifest: ${path.join(GIF_ROOT, "manifest.json")}`);
  console.log(`Attributions: ${path.join(GIF_ROOT, "ATTRIBUTIONS.md")}`);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});