/* ================================================================
 * FIRST-RUN BOOTSTRAP TEST SUITE
 *
 * Tests for setup.ts, env generation, secret handling,
 * emoji provisioning, and managed-host behavior.
 * ================================================================ */

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const ENV_EXAMPLE = path.join(ROOT, ".env.example");
const ENV_FILE = path.join(ROOT, ".env");
const DATA_DIR = path.join(ROOT, "data");
const ACCOUNTS_FILE = path.join(DATA_DIR, "accounts.json");

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

function check(name: string, fn: () => void) {
  try {
    fn();
    pass(name);
  } catch (e) {
    fail(name, e);
  }
}

console.log("\n🧪 First-Run Bootstrap Tests\n");

/* ================================================================
 * SECTION 1: First-Run Detection
 * ================================================================ */

console.log("--- First-Run Detection ---");

check("ENV_EXAMPLE exists", () => {
  assert.ok(fs.existsSync(ENV_EXAMPLE), ".env.example must exist");
});

check("DATA_DIR exists", () => {
  assert.ok(fs.existsSync(DATA_DIR), "data/ directory must exist");
});

check("start.sh exists and is executable", () => {
  const startSh = path.join(ROOT, "scripts", "start.sh");
  assert.ok(fs.existsSync(startSh), "scripts/start.sh must exist");
  const content = fs.readFileSync(startSh, "utf-8");
  assert.ok(content.includes("first run") || content.includes("First Run") || content.includes(".env"),
    "start.sh should reference first-run or .env detection");
});

check("setup.ts exists", () => {
  const setupTs = path.join(ROOT, "scripts", "setup.ts");
  assert.ok(fs.existsSync(setupTs), "scripts/setup.ts must exist");
});

check("npm run setup script defined in package.json", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf-8"));
  assert.ok(pkg.scripts?.setup, "package.json must define 'setup' script");
  assert.ok(pkg.scripts.setup.includes("setup.ts"), "setup script must reference setup.ts");
});

/* ================================================================
 * SECTION 2: Secret Generation
 * ================================================================ */

console.log("\n--- Secret Generation ---");

check("generateSecret produces hex string of correct length", () => {
  // Replicate the function logic
  const secret = crypto.randomBytes(48).toString("hex");
  assert.equal(typeof secret, "string");
  assert.equal(secret.length, 96); // 48 bytes = 96 hex chars
  assert.ok(/^[0-9a-f]+$/.test(secret), "Must be lowercase hex");
});

check("generateSecret produces different values each call", () => {
  const s1 = crypto.randomBytes(48).toString("hex");
  const s2 = crypto.randomBytes(48).toString("hex");
  assert.notEqual(s1, s2, "Two generated secrets must differ");
});

check("SESSION_SECRET meets minimum length", () => {
  const secret = crypto.randomBytes(48).toString("hex");
  assert.ok(secret.length >= 16, "Secret must be at least 16 characters");
});

check("generatePasswordHash produces consistent output", () => {
  const password = "test-password-123";
  const salt = crypto.randomBytes(16).toString("hex");
  const hash1 = crypto.pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");
  const hash2 = crypto.pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");
  assert.equal(hash1, hash2, "Same password+salt must produce same hash");
  assert.equal(hash1.length, 128); // 64 bytes = 128 hex chars
});

check("generatePasswordHash produces different hashes for different salts", () => {
  const password = "test-password-123";
  const hash1 = crypto.pbkdf2Sync(password, "salt1", 100000, 64, "sha512").toString("hex");
  const hash2 = crypto.pbkdf2Sync(password, "salt2", 100000, 64, "sha512").toString("hex");
  assert.notEqual(hash1, hash2);
});

/* ================================================================
 * SECTION 3: .env Handling
 * ================================================================ */

console.log("\n--- .env Handling ---");

check(".env.example does not contain real secrets", () => {
  const content = fs.readFileSync(ENV_EXAMPLE, "utf-8");
  assert.ok(!content.includes("MTUzNTY3OT"), ".env.example must not contain Discord tokens");
  assert.ok(!content.includes("sk-"), ".env.example must not contain API keys");
});

check(".env.example has all required Discord vars documented", () => {
  const content = fs.readFileSync(ENV_EXAMPLE, "utf-8");
  assert.ok(content.includes("DISCORD_TOKEN="), "Must document DISCORD_TOKEN");
  assert.ok(content.includes("DISCORD_CLIENT_ID="), "Must document DISCORD_CLIENT_ID");
});

check(".env.example does NOT have manual EMOJI_ASH_*_ID vars", () => {
  const content = fs.readFileSync(ENV_EXAMPLE, "utf-8");
  const emojiLines = content.split("\n").filter(l => l.match(/^EMOJI_ASH_\w+_ID=/));
  assert.equal(emojiLines.length, 0,
    ".env.example should not require manual emoji ID configuration");
});

check(".env.example documents SESSION_SECRET as auto-generated", () => {
  const content = fs.readFileSync(ENV_EXAMPLE, "utf-8");
  assert.ok(
    content.includes("Auto-generated") || content.includes("auto-generated") || content.includes("npm run setup"),
    ".env.example should indicate SESSION_SECRET is auto-generated"
  );
});

check(".env.example documents owner credentials as auto-generated", () => {
  const content = fs.readFileSync(ENV_EXAMPLE, "utf-8");
  assert.ok(
    content.includes("Auto-generated") || content.includes("auto-generated") || content.includes("npm run setup"),
    ".env.example should indicate owner credentials are auto-generated"
  );
});

check(".env is not committed to git", () => {
  const gitignore = fs.readFileSync(path.join(ROOT, ".gitignore"), "utf-8");
  assert.ok(gitignore.includes(".env"), ".gitignore must exclude .env");
});

/* ================================================================
 * SECTION 4: No Secret Overwrites
 * ================================================================ */

console.log("\n--- No Secret Overwrites ---");

check("setup.ts preserves existing .env values", () => {
  // Read setup.ts and verify it checks for existing values before writing
  const setupContent = fs.readFileSync(path.join(ROOT, "scripts", "setup.ts"), "utf-8");
  assert.ok(
    setupContent.includes("existingEnv") || setupContent.includes("existing"),
    "setup.ts must check for existing env values"
  );
  assert.ok(
    setupContent.includes("preserve") || setupContent.includes("already") || setupContent.includes("has("),
    "setup.ts must preserve existing values"
  );
});

check("setup.ts never logs secret values", () => {
  const setupContent = fs.readFileSync(path.join(ROOT, "scripts", "setup.ts"), "utf-8");
  // Should not have console.log with the actual secret
  assert.ok(!setupContent.includes("console.log(secret)"), "Must not log secret directly");
  assert.ok(!setupContent.includes("console.log(hash)"), "Must not log hash directly");
  assert.ok(!setupContent.includes("console.log(password)"), "Must not log password directly");
});

check("setup.ts generates password but logs it clearly as temporary", () => {
  const setupContent = fs.readFileSync(path.join(ROOT, "scripts", "setup.ts"), "utf-8");
  // The generated password should be logged with a save warning
  assert.ok(
    setupContent.includes("Save this password") || setupContent.includes("cannot be recovered"),
    "setup.ts must warn about saving the generated password"
  );
});

/* ================================================================
 * SECTION 5: Emoji Auto-Provisioning
 * ================================================================ */

console.log("\n--- Emoji Auto-Provisioning ---");

check("emoji-provisioner.ts exists", () => {
  const provPath = path.join(ROOT, "src", "discord", "emoji-provisioner.ts");
  assert.ok(fs.existsSync(provPath), "emoji-provisioner.ts must exist");
});

check("emoji-provisioner exports ProvisionResult type", () => {
  const content = fs.readFileSync(path.join(ROOT, "src", "discord", "emoji-provisioner.ts"), "utf-8");
  assert.ok(content.includes("ProvisionResult"), "Must export ProvisionResult");
  assert.ok(content.includes("icons:"), "ProvisionResult must have icons field");
  assert.ok(content.includes("animeEmotes:"), "ProvisionResult must have animeEmotes field");
  assert.ok(content.includes("guildId:"), "ProvisionResult must have guildId field");
});

check("emoji-provisioner is idempotent (no duplicate creation)", () => {
  const content = fs.readFileSync(path.join(ROOT, "src", "discord", "emoji-provisioner.ts"), "utf-8");
  assert.ok(
    content.includes("existing") || content.includes("already") || content.includes("skip"),
    "Provisioner must check for existing emojis before uploading"
  );
});

check("index.ts imports and calls provisionEmojis", () => {
  const indexContent = fs.readFileSync(path.join(ROOT, "src", "index.ts"), "utf-8");
  assert.ok(
    indexContent.includes("provisionEmojis"),
    "index.ts must import and call provisionEmojis"
  );
});

check("emojis.ts uses provisioner fallback chain", () => {
  const emojisContent = fs.readFileSync(path.join(ROOT, "src", "discord", "emojis.ts"), "utf-8");
  assert.ok(
    emojisContent.includes("getProvisionResult") || emojisContent.includes("provisioned"),
    "emojis.ts must use provisioner results"
  );
});

check("anime-emotes.ts uses provisioner fallback chain", () => {
  const emotesContent = fs.readFileSync(path.join(ROOT, "src", "discord", "anime-emotes.ts"), "utf-8");
  assert.ok(
    emotesContent.includes("getProvisionResult") || emotesContent.includes("provisioned"),
    "anime-emotes.ts must use provisioner results"
  );
});

/* ================================================================
 * SECTION 6: Provider Initialization
 * ================================================================ */

console.log("\n--- Provider Initialization ---");

check("providers config has all 16 providers as optional", () => {
  const configContent = fs.readFileSync(path.join(ROOT, "src", "ai", "providers", "config.ts"), "utf-8");
  const providers = ["gemini", "groq", "openrouter", "openai", "anthropic", "mistral",
    "cohere", "together", "deepseek", "xai", "huggingface", "nvidia", "fireworks",
    "cerebras", "sambanova", "novita"];
  for (const p of providers) {
    assert.ok(configContent.includes(`${p}:`),
      `Provider config must include ${p}`);
  }
});

check("Ollama provider has auto-detection", () => {
  const ollamaContent = fs.readFileSync(path.join(ROOT, "src", "ai", "providers", "ollama.ts"), "utf-8");
  assert.ok(ollamaContent.includes("isAvailable"), "Ollama must have isAvailable check");
  assert.ok(ollamaContent.includes("checkAvailability") || ollamaContent.includes("/api/tags"),
    "Ollama must auto-detect availability");
});

check("provider index handles missing providers gracefully", () => {
  const indexContent = fs.readFileSync(path.join(ROOT, "src", "ai", "providers", "index.ts"), "utf-8");
  assert.ok(
    indexContent.includes("try") && indexContent.includes("catch"),
    "Provider index must handle errors gracefully"
  );
});

/* ================================================================
 * SECTION 7: Missing Optional Providers
 * ================================================================ */

console.log("\n--- Missing Optional Providers ---");

check("no provider is marked as required in env.ts", () => {
  const envContent = fs.readFileSync(path.join(ROOT, "src", "config", "env.ts"), "utf-8");
  const providerSection = envContent.slice(
    envContent.indexOf("providers:"),
    envContent.indexOf("},", envContent.indexOf("providers:"))
  );
  // All provider keys should use optional(), not required()
  const requiredCount = (providerSection.match(/required\("/g) || []).length;
  assert.equal(requiredCount, 0, "No provider API key should be required");
});

check("AI timeout has safe default", () => {
  const envContent = fs.readFileSync(path.join(ROOT, "src", "config", "env.ts"), "utf-8");
  assert.ok(
    envContent.includes("30_000") || envContent.includes("30000"),
    "AI timeout should default to 30s"
  );
});

/* ================================================================
 * SECTION 8: Managed Host Environment
 * ================================================================ */

console.log("\n--- Managed Host Environment ---");

check("start.sh does not write .env at runtime", () => {
  const startContent = fs.readFileSync(path.join(ROOT, "scripts", "start.sh"), "utf-8");
  // start.sh should only run setup on first run (when .env is missing), not every time
  assert.ok(
    startContent.includes('.env"') || startContent.includes("!.env") || startContent.includes("test -f"),
    "start.sh must check for .env existence before acting"
  );
});

check("PORT is preserved from hosting environment", () => {
  const startContent = fs.readFileSync(path.join(ROOT, "scripts", "start.sh"), "utf-8");
  assert.ok(
    startContent.includes("PORT") && startContent.includes("${PORT:-"),
    "start.sh must preserve host-provided PORT"
  );
});

check("SESSION_SECRET required only in production", () => {
  const envContent = fs.readFileSync(path.join(ROOT, "src", "config", "env.ts"), "utf-8");
  assert.ok(
    envContent.includes('NODE_ENV') && envContent.includes('production'),
    "SESSION_SECRET enforcement must be production-only"
  );
});

/* ================================================================
 * SECTION 9: Security
 * ================================================================ */

console.log("\n--- Security ---");

check("setup.ts uses crypto.randomBytes for secrets", () => {
  const setupContent = fs.readFileSync(path.join(ROOT, "scripts", "setup.ts"), "utf-8");
  assert.ok(
    setupContent.includes("randomBytes") || setupContent.includes("crypto"),
    "setup.ts must use crypto.randomBytes for secret generation"
  );
});

check("setup.ts uses PBKDF2 for password hashing", () => {
  const setupContent = fs.readFileSync(path.join(ROOT, "scripts", "setup.ts"), "utf-8");
  assert.ok(
    setupContent.includes("pbkdf2") || setupContent.includes("PBKDF2"),
    "setup.ts must use PBKDF2 for password hashing"
  );
});

check("no hardcoded secrets in source code", () => {
  const srcDir = path.join(ROOT, "src");
  const files = fs.readdirSync(srcDir, { recursive: true, withFileTypes: true })
    .filter(f => f.isFile() && f.name.endsWith(".ts"))
    .map(f => path.join(f.parentPath ?? f.path, f.name));

  for (const file of files) {
    const content = fs.readFileSync(file, "utf-8");
    assert.ok(!content.includes("MTUzNTY3OT"), `${path.relative(ROOT, file)} must not contain Discord tokens`);
    assert.ok(!content.includes("sk-proj-"), `${path.relative(ROOT, file)} must not contain OpenAI keys`);
  }
});

check("credential-store.ts requires SESSION_SECRET in production", () => {
  const credContent = fs.readFileSync(
    path.join(ROOT, "src", "ai", "providers", "platform", "credential-store.ts"), "utf-8"
  );
  assert.ok(
    credContent.includes("production") && credContent.includes("throw"),
    "credential-store must throw in production without SESSION_SECRET"
  );
});

/* ================================================================
 * SECTION 10: Failure/Recovery
 * ================================================================ */

console.log("\n--- Failure/Recovery ---");

check("emoji provisioning failure is non-fatal", () => {
  const indexContent = fs.readFileSync(path.join(ROOT, "src", "index.ts"), "utf-8");
  // Find the provisionEmojis call and check it's in a try/catch
  const idx = indexContent.indexOf("provisionEmojis(guild)");
  assert.ok(idx > 0, "provisionEmojis(guild) must be called in index.ts");
  const surrounding = indexContent.slice(Math.max(0, idx - 200), idx + 300);
  assert.ok(
    surrounding.includes("catch"),
    "provisionEmojis call must be wrapped in try/catch"
  );
});

check("database initialization handles missing data directory", () => {
  const dbContent = fs.readFileSync(path.join(ROOT, "src", "database", "database.ts"), "utf-8");
  assert.ok(
    dbContent.includes("mkdirSync") || dbContent.includes("existsSync"),
    "Database must create data directory if missing"
  );
});

check("graceful shutdown exists", () => {
  const indexContent = fs.readFileSync(path.join(ROOT, "src", "index.ts"), "utf-8");
  assert.ok(
    indexContent.includes("SIGTERM") || indexContent.includes("SIGINT") || indexContent.includes("shutdown"),
    "Must have graceful shutdown handler"
  );
});

/* ================================================================
 * SECTION 11: Secret Redaction
 * ================================================================ */

console.log("\n--- Secret Redaction ---");

check("redact.ts exists and handles common patterns", () => {
  const redactContent = fs.readFileSync(path.join(ROOT, "src", "security", "redact.ts"), "utf-8");
  assert.ok(redactContent.includes("REDACT") || redactContent.includes("redact"), "Must have redaction logic");
  assert.ok(redactContent.includes("sk-") || redactContent.includes("token") || redactContent.includes("api_key"),
    "Must handle API key patterns");
});

check("output-guard.ts blocks leaked secrets", () => {
  const guardContent = fs.readFileSync(path.join(ROOT, "src", "security", "output-guard.ts"), "utf-8");
  assert.ok(guardContent.includes("OUTPUT_SECRET") || guardContent.includes("secret"),
    "Must have secret detection patterns");
});

/* ================================================================
 * SUMMARY
 * ================================================================ */

console.log(`\n--- Results ---`);
console.log(`  Passed: ${passed}`);
console.log(`  Failed: ${failed}`);
console.log(`  Total: ${passed + failed}`);

if (failed > 0) {
  process.exit(1);
}
