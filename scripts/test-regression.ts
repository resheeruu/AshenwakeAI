import fs from "node:fs";
import path from "node:path";

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

console.log("\n🔍 AshEnAI Regression Test Suite\n");

// ─────────────────────────────────────
// §14: Module Resolution Tests
// ─────────────────────────────────────
console.log("--- Module Resolution ---");

const distDir = path.resolve("dist");
const distIndex = path.join(distDir, "index.js");
const distLock = path.join(distDir, "games", "lock.js");

if (fs.existsSync(distIndex)) {
  const code = fs.readFileSync(distIndex, "utf8");
  const hasDynamicImport = code.includes('import("./games/lock.js")');
  const hasOldImport = code.match(/import\(\s*["']\.\/games\/lock["']\s*\)/);
  
  if (hasDynamicImport && !hasOldImport) {
    pass("dist/index.js uses import('./games/lock.js') with .js extension");
  } else if (hasOldImport) {
    fail("dist/index.js still uses import('./games/lock') without .js extension");
  } else {
    fail("dist/index.js missing games/lock dynamic import");
  }
} else {
  fail("dist/index.js not found");
}

if (fs.existsSync(distLock)) {
  pass("dist/games/lock.js exists on disk");
} else {
  fail("dist/games/lock.js missing");
}

// ─────────────────────────────────────
// §6: Asset Pipeline Tests
// ─────────────────────────────────────
console.log("\n--- Asset Pipeline ---");

const manifestPath = path.resolve("data/games/assets/manifest.json");
const assetsDir = path.resolve("data/games/assets");

if (fs.existsSync(manifestPath)) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const gameKeys = Object.keys(manifest.games ?? {});
  const expectedGames = ["mine", "battle", "lottery", "hunt", "slots"];
  
  for (const game of expectedGames) {
    if (gameKeys.includes(game)) {
      const assets = manifest.games[game].assets ?? [];
      if (assets.length > 0) {
        pass(`${game}: ${assets.length} assets in manifest`);
      } else {
        fail(`${game}: no assets in manifest`);
      }
    } else {
      fail(`${game}: missing from manifest`);
    }
  }
} else {
  fail("manifest.json not found");
}

// Verify all manifest-declared assets exist on disk
if (fs.existsSync(manifestPath)) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  let missingAssets = 0;
  for (const [category, game] of Object.entries(manifest.games ?? {})) {
    for (const key of (game as any).assets ?? []) {
      for (const ext of [".svg", ".png"]) {
        const filePath = path.join(assetsDir, category, `${key}${ext}`);
        if (!fs.existsSync(filePath)) {
          missingAssets++;
        }
      }
    }
  }
  if (missingAssets === 0) {
    pass("All manifest-declared assets exist on disk");
  } else {
    fail(`${missingAssets} manifest assets missing on disk`);
  }
}

// ─────────────────────────────────────
// §7: Visual Asset Completeness
// ─────────────────────────────────────
console.log("\n--- Visual Asset Completeness ---");

const requiredAssets: Record<string, string[]> = {
  mine: ["board", "safe", "mine", "flag", "explosion", "multiplier", "cashout", "victory", "defeat"],
  battle: ["player", "enemy", "attack", "critical", "defense", "victory", "defeat", "hit", "miss", "draw", "xp", "reward"],
  lottery: ["ticket", "chest", "prize", "jackpot", "reveal", "drawing"],
  hunt: ["encounter", "action", "loot", "rare-drop", "environment", "hit", "miss", "legendary", "failure", "victory"],
  slots: ["machine", "symbols", "spin", "jackpot", "result", "stop", "match", "big-win", "loss", "reward"],
};

for (const [game, keys] of Object.entries(requiredAssets)) {
  const gameAssetsDir = path.join(assetsDir, game);
  if (!fs.existsSync(gameAssetsDir)) {
    fail(`${game}: asset directory missing`);
    continue;
  }
  let found = 0;
  for (const key of keys) {
    if (fs.existsSync(path.join(gameAssetsDir, `${key}.svg`)) || fs.existsSync(path.join(gameAssetsDir, `${key}.png`))) {
      found++;
    }
  }
  if (found === keys.length) {
    pass(`${game}: all ${keys.length} visual assets present`);
  } else {
    fail(`${game}: ${keys.length - found} of ${keys.length} visual assets missing`);
  }
}

// ─────────────────────────────────────
// §11: Command Consolidation Tests
// ─────────────────────────────────────
console.log("\n--- Command Consolidation ---");

const commandsDir = path.resolve("src/commands");
// Commands that SHOULD exist (publicly registered)
const requiredCommandFiles = ["send.ts", "mod.ts", "settings.ts", "support.ts", "server.ts", "prompt.ts", "ask.ts", "reset.ts", "status.ts", "help.ts"];

for (const file of requiredCommandFiles) {
  if (fs.existsSync(path.join(commandsDir, file))) {
    pass(`${file} exists`);
  } else {
    fail(`${file} missing`);
  }
}

// Commands that should NOT exist as public commands
const removedCommandFiles = ["access.ts", "game.ts", "personality.ts"];

for (const file of removedCommandFiles) {
  if (!fs.existsSync(path.join(commandsDir, file))) {
    pass(`${file} correctly removed from public commands`);
  } else {
    fail(`${file} should not exist as a public command`);
  }
}

// Check /mod is the canonical moderation command
if (fs.existsSync(path.join(commandsDir, "moderation.ts"))) {
  const modCode = fs.readFileSync(path.join(commandsDir, "moderation.ts"), "utf8");
  if (modCode.includes('setName("mod")')) {
    pass("/mod is the canonical moderation command");
  } else {
    fail("/mod should be the canonical moderation command name");
  }
}

// ─────────────────────────────────────
// §12: Moderation Security Tests
// ─────────────────────────────────────
console.log("\n--- Moderation Security ---");

const modPath = path.join(commandsDir, "moderation.ts");
if (fs.existsSync(modPath)) {
  const modCode = fs.readFileSync(modPath, "utf8");
  if (modCode.includes("canModerate") && modCode.includes("canTarget")) {
    pass("Moderation requires canModerate and canTarget checks");
  } else {
    fail("Moderation missing permission checks");
  }
}

// ─────────────────────────────────────
// §5: Animation Result Authority Tests
// ─────────────────────────────────────
console.log("\n--- Animation Result Authority ---");

const rendererPath = path.resolve("src/games/animation/renderer.ts");
if (fs.existsSync(rendererPath)) {
  const rendererCode = fs.readFileSync(rendererPath, "utf8");
  if (rendererCode.includes("NEVER imports store") && rendererCode.includes("result-authority")) {
    pass("Renderer enforces result-authority (never imports store/rewards)");
  } else {
    fail("Renderer should enforce result-authority");
  }
}

const animationIndexPath = path.resolve("src/games/animation/index.ts");
if (fs.existsSync(animationIndexPath)) {
  const animCode = fs.readFileSync(animationIndexPath, "utf8");
  if (animCode.includes("assertResultAuthority")) {
    pass("Animation framework has assertResultAuthority");
  } else {
    fail("Animation framework should have assertResultAuthority");
  }
}

// ─────────────────────────────────────
// Summary
// ─────────────────────────────────────
console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
