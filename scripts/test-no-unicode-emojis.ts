/* ================================================================
 * NO-UNICODE-EMOJI REGRESSION TEST
 *
 * Scans bot-facing source files for ordinary Unicode emoji.
 * Fails if Unicode emoji are found in designated response modules.
 * ================================================================ */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

let passed = 0;
let failed = 0;

function pass(name: string) {
  console.log(`  ✅ ${name}`);
  passed++;
}

function fail(name: string, error?: unknown) {
  console.error(`  ❌ ${name}`, error ?? "");
  failed++;
}

// Unicode emoji pattern: covers basic emoji, modifier sequences, ZWJ sequences
const UNICODE_EMOJI_RE = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu;

// Files that are ALLOWED to have Unicode emoji (icons.ts uses them as fallbacks by design)
const ALLOWED_FILES = new Set([
  "icons.ts",
  "emojis.ts",
]);

// Files that MUST NOT have Unicode emoji (bot-facing output)
const SCANNED_DIRS = [
  "src/games/anime-actions",
  "src/discord/anime-emotes.ts",
];

function scanFile(filePath: string): string[] {
  const content = readFileSync(filePath, "utf8");
  const lines = content.split("\n");
  const matches: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip comments and imports
    const trimmed = line.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("import ")) continue;

    const emojiMatches = trimmed.match(UNICODE_EMOJI_RE);
    if (emojiMatches) {
      matches.push(`  Line ${i + 1}: ${trimmed.substring(0, 80)}`);
    }
  }
  return matches;
}

console.log("\n🚫 No-Unicode-Emoji Regression Test\n");

for (const dirOrFile of SCANNED_DIRS) {
  const fullPath = join(process.cwd(), dirOrFile);
  const stat = statSync(fullPath);

  if (stat.isFile()) {
    const fileName = relative(process.cwd(), fullPath).split("/").pop() ?? "";
    if (ALLOWED_FILES.has(fileName)) continue;

    const matches = scanFile(fullPath);
    if (matches.length === 0) {
      pass(`${relative(process.cwd(), fullPath)} — no Unicode emoji`);
    } else {
      fail(`${relative(process.cwd(), fullPath)} — found Unicode emoji:\n${matches.join("\n")}`);
    }
  } else if (stat.isDirectory()) {
    const files = readdirSync(fullPath).filter((f) => f.endsWith(".ts"));
    for (const file of files) {
      const filePath = join(fullPath, file);
      const relPath = relative(process.cwd(), filePath);
      if (ALLOWED_FILES.has(file)) continue;

      const matches = scanFile(filePath);
      if (matches.length === 0) {
        pass(`${relPath} — no Unicode emoji`);
      } else {
        fail(`${relPath} — found Unicode emoji:\n${matches.join("\n")}`);
      }
    }
  }
}

// Also check definitions.ts emoji fields specifically
try {
  const defContent = readFileSync(join(process.cwd(), "src/games/anime-actions/definitions.ts"), "utf8");
  const emojiFields = defContent.match(/emoji:\s*"[^"]+"/g) ?? [];
  const unicodeEmojis = emojiFields.filter((e) => UNICODE_EMOJI_RE.test(e));
  if (unicodeEmojis.length === 0) {
    pass("definitions.ts emoji fields — all use text fallbacks");
  } else {
    fail(`definitions.ts emoji fields — found Unicode emoji: ${unicodeEmojis.join(", ")}`);
  }
} catch (e) {
  fail("definitions.ts emoji check", e);
}

console.log(`\n--- Results ---`);
console.log(`  Passed: ${passed}`);
console.log(`  Failed: ${failed}`);
console.log(`  Total: ${passed + failed}`);

if (failed > 0) {
  process.exit(1);
}
