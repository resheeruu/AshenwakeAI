#!/usr/bin/env node
/* ================================================================
 * ASHENAI FIRST-RUN BOOTSTRAP
 *
 * Usage: npm run setup
 *
 * Detects first-run state and configures everything that can be
 * safely auto-generated:
 *   - SESSION_SECRET (cryptographic random)
 *   - Owner account (generated credentials)
 *   - Data directories
 *   - .env from .env.example (preserves existing values)
 *   - Ollama detection
 *
 * Never overwrites existing secrets or API keys.
 * Never logs sensitive values.
 * ================================================================ */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { hashPassword } from "../src/utils/password-hash";

const ROOT = process.cwd();
const ENV_EXAMPLE = path.join(ROOT, ".env.example");
const ENV_FILE = path.join(ROOT, ".env");
const DATA_DIR = path.join(ROOT, "data");
const BACKUPS_DIR = path.join(ROOT, "backups");
const ACCOUNTS_FILE = path.join(DATA_DIR, "accounts.json");

/* ================================================================
 * HELPERS
 * ================================================================ */

function log(msg: string) {
  console.log(`  ${msg}`);
}

function logOk(msg: string) {
  console.log(`  \x1b[32m✓\x1b[0m ${msg}`);
}

function logWarn(msg: string) {
  console.log(`  \x1b[33m⚠\x1b[0m ${msg}`);
}

function logInfo(msg: string) {
  console.log(`  \x1b[36mℹ\x1b[0m ${msg}`);
}

function generateSecret(length = 48): string {
  return crypto.randomBytes(length).toString("hex");
}

function parseEnvFile(content: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    map.set(key, value);
  }
  return map;
}

/* ================================================================
 * STEP 1: Ensure directories
 * ================================================================ */

function ensureDirectories(): void {
  for (const dir of [DATA_DIR, BACKUPS_DIR]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      logOk(`Created ${path.relative(ROOT, dir)}/`);
    } else {
      logOk(`${path.relative(ROOT, dir)}/ exists`);
    }
  }
}

/* ================================================================
 * STEP 2: Generate SESSION_SECRET if missing
 * ================================================================ */

function ensureSessionSecret(existingEnv: Map<string, string>): string | undefined {
  const existing = existingEnv.get("SESSION_SECRET");
  if (existing) {
    logOk("SESSION_SECRET already configured");
    return undefined;
  }

  const secret = generateSecret(48);
  logOk("Generated SESSION_SECRET (48-byte hex)");
  return secret;
}

/* ================================================================
 * STEP 3: Create owner account if missing
 * ================================================================ */

function ensureOwnerAccount(existingEnv: Map<string, string>): Promise<{
  username?: string;
  passwordHash?: string;
  passwordSalt?: string;
}> {
  // Check if accounts.json already has an owner
  if (fs.existsSync(ACCOUNTS_FILE)) {
    try {
      const accounts = JSON.parse(fs.readFileSync(ACCOUNTS_FILE, "utf-8"));
      if (accounts.owner && accounts.owner.enabled !== false) {
        logOk("Owner account exists in data/accounts.json");
        return Promise.resolve({});
      }
    } catch {
      // Corrupted file — will be recreated
    }
  }

  // Check if env vars provide owner (from .env file or process.env for managed hosts)
  const envUsername = existingEnv.get("ASHENAI_OWNER_USERNAME") || process.env.ASHENAI_OWNER_USERNAME?.trim();
  const envHash = existingEnv.get("ASHENAI_OWNER_PASSWORD_HASH") || process.env.ASHENAI_OWNER_PASSWORD_HASH?.trim();
  const envSalt = existingEnv.get("ASHENAI_OWNER_PASSWORD_SALT") || process.env.ASHENAI_OWNER_PASSWORD_SALT?.trim();
  if (envUsername && envHash && envSalt) {
    logOk("Owner credentials found in environment");
    return Promise.resolve({ username: envUsername, passwordHash: envHash, passwordSalt: envSalt });
  }

  // Headless/non-interactive mode: never prompt, fail clearly
  if (process.stdin.isTTY !== true) {
    const missing: string[] = [];
    if (!envUsername) missing.push("ASHENAI_OWNER_USERNAME");
    if (!envHash) missing.push("ASHENAI_OWNER_PASSWORD_HASH");
    if (!envSalt) missing.push("ASHENAI_OWNER_PASSWORD_SALT");
    throw new Error(
      `Owner credentials are not configured for non-interactive setup. Set ${missing.join(", ")}, or run npm run setup interactively.`
    );
  }

  // Interactive mode: prompt for password, hash with PBKDF2
  return new Promise<{
    username?: string;
    passwordHash?: string;
    passwordSalt?: string;
  }>((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const askForPassword = (): void => {
      rl.question(
        "Set owner password (will not be echoed): ",
        (password: string) => {
          const { hash, salt } = hashPassword(password);
          rl.close();
          logOk("Owner account configured");
          logInfo(`  Username: admin`);
          resolve({ username: "admin", passwordHash: hash, passwordSalt: salt });
        },
      );
    };

    askForPassword();
  });
}

/* ================================================================
 * STEP 4: Create .env from .env.example (preserve existing)
 * ================================================================ */

function createEnvFile(
  existingEnv: Map<string, string>,
  newSecret?: string,
  ownerCreds?: { username?: string; passwordHash?: string; passwordSalt?: string },
): boolean {
  if (!fs.existsSync(ENV_EXAMPLE)) {
    logWarn(".env.example not found — skipping .env creation");
    return false;
  }

  if (fs.existsSync(ENV_FILE)) {
    logOk(".env already exists — preserving existing values");
    return false;
  }

  const exampleContent = fs.readFileSync(ENV_EXAMPLE, "utf-8");
  const lines: string[] = [];

  for (const line of exampleContent.split("\n")) {
    const trimmed = line.trim();

    // Handle commented-out auto-generated variables
    if (trimmed.startsWith("#")) {
      const commentedKey = trimmed.slice(1).split("=")[0].trim();
      if (commentedKey === "SESSION_SECRET" && newSecret) {
        lines.push(`${commentedKey}=${newSecret}`);
        continue;
      }
      if (commentedKey === "ASHENAI_OWNER_USERNAME" && ownerCreds?.username) {
        lines.push(`${commentedKey}=${ownerCreds.username}`);
        continue;
      }
      if (commentedKey === "ASHENAI_OWNER_PASSWORD_HASH" && ownerCreds?.passwordHash) {
        lines.push(`${commentedKey}=${ownerCreds.passwordHash}`);
        continue;
      }
      if (commentedKey === "ASHENAI_OWNER_PASSWORD_SALT" && ownerCreds?.passwordSalt) {
        lines.push(`${commentedKey}=${ownerCreds.passwordSalt}`);
        continue;
      }
      lines.push(line);
      continue;
    }

    // Preserve blank lines
    if (!trimmed) {
      lines.push(line);
      continue;
    }

    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) {
      lines.push(line);
      continue;
    }

    const key = trimmed.slice(0, eqIdx).trim();

    // Keep existing values
    if (existingEnv.has(key)) {
      lines.push(`${key}=${existingEnv.get(key)}`);
      continue;
    }

    // Inject generated values
    if (key === "SESSION_SECRET" && newSecret) {
      lines.push(`${key}=${newSecret}`);
      continue;
    }

    if (key === "ASHENAI_OWNER_USERNAME" && ownerCreds?.username) {
      lines.push(`${key}=${ownerCreds.username}`);
      continue;
    }

    if (key === "ASHENAI_OWNER_PASSWORD_HASH" && ownerCreds?.passwordHash) {
      lines.push(`${key}=${ownerCreds.passwordHash}`);
      continue;
    }

    if (key === "ASHENAI_OWNER_PASSWORD_SALT" && ownerCreds?.passwordSalt) {
      lines.push(`${key}=${ownerCreds.passwordSalt}`);
      continue;
    }

    // Leave other values empty (user must fill in)
    lines.push(line);
  }

  fs.writeFileSync(ENV_FILE, lines.join("\n"), "utf-8");
  logOk("Created .env from .env.example");
  return true;
}

/* ================================================================
 * STEP 5: Detect Ollama
 * ================================================================ */

async function detectOllama(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const resp = await fetch("http://127.0.0.1:11434/api/tags", {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (resp.ok) {
      const data = await resp.json() as { models?: Array<{ name: string }> };
      const modelCount = data.models?.length ?? 0;
      logOk(`Ollama detected (${modelCount} model${modelCount !== 1 ? "s" : ""} available)`);
      return true;
    }
  } catch {
    // Not available
  }
  logInfo("Ollama not detected — using cloud providers only");
  return false;
}

/* ================================================================
 * MAIN
 * ================================================================ */

async function main() {
  console.log("\n╔══════════════════════════════════════════╗");
  console.log("║       AshenAI First-Run Setup            ║");
  console.log("╚══════════════════════════════════════════╝\n");

  // Load existing .env if present
  const existingEnv = new Map<string, string>();
  if (fs.existsSync(ENV_FILE)) {
    const content = fs.readFileSync(ENV_FILE, "utf-8");
    for (const [k, v] of parseEnvFile(content)) {
      existingEnv.set(k, v);
    }
    logOk("Loaded existing .env");
  }

  console.log("\n--- Directories ---");
  ensureDirectories();

  console.log("\n--- Security ---");
  const newSecret = ensureSessionSecret(existingEnv);

  console.log("\n--- Owner Account ---");
  const ownerCreds = await ensureOwnerAccount(existingEnv);

  console.log("\n--- Configuration ---");
  const created = createEnvFile(existingEnv, newSecret, ownerCreds);
  if (created) {
    logOk(".env file created with generated secrets");
  }

  console.log("\n--- Provider Detection ---");
  const configuredProviders: string[] = [];
  for (const [key, value] of existingEnv) {
    if (key.endsWith("_API_KEY") && value) {
      configuredProviders.push(key.replace("_API_KEY", ""));
    }
  }
  if (configuredProviders.length > 0) {
    logOk(`AI providers configured: ${configuredProviders.join(", ")}`);
  } else {
    logWarn("No AI provider API keys configured — AI features will be unavailable");
    logInfo("Add at least one API key to .env (e.g., GEMINI_API_KEY, OPENAI_API_KEY)");
  }

  await detectOllama();

  // Summary
  console.log("\n╔══════════════════════════════════════════╗");
  console.log("║              Setup Complete              ║");
  console.log("╚══════════════════════════════════════════╝\n");

  console.log("  What was auto-configured:");
  console.log("    ✓ SESSION_SECRET (if missing)");
  console.log("    ✓ Owner account (if missing)");
  console.log("    ✓ Data directories");
  console.log("    ✓ .env file (if first run)");

  console.log("\n[Discord]");
  const discordTokenConfigured = existingEnv.has("DISCORD_TOKEN")
    && existingEnv.get("DISCORD_TOKEN")!.trim().length > 0;
  const discordClientIdConfigured = existingEnv.has("DISCORD_CLIENT_ID")
    && existingEnv.get("DISCORD_CLIENT_ID")!.trim().length > 0;
  console.log(`  DISCORD_TOKEN: ${discordTokenConfigured ? "Configured" : "Missing"}`);
  console.log(`  DISCORD_CLIENT_ID: ${discordClientIdConfigured ? "Configured" : "Missing"}`);

  console.log("\n[AI Providers]");
  if (configuredProviders.length > 0) {
    console.log(`  Configured providers: ${configuredProviders.join(", ")}`);
  } else {
    console.log("  No AI provider configured");
  }

  console.log("\n[Remaining Required Configuration]");
  const required: string[] = [];
  if (!discordTokenConfigured) required.push("DISCORD_TOKEN");
  if (!discordClientIdConfigured) required.push("DISCORD_CLIENT_ID");
  if (configuredProviders.length === 0) required.push("AI provider API key");

  if (required.length > 0) {
    for (const r of required) {
      console.log(`  • ${r}`);
    }
  } else {
    console.log("  None — configuration is ready");
  }

  console.log("\n[Next steps]");
  if (required.length > 0) {
    if (!discordTokenConfigured) {
      console.log("  • Add your DISCORD_TOKEN to .env");
    }
    if (!discordClientIdConfigured) {
      console.log("  • Add your DISCORD_CLIENT_ID to .env");
    }
    if (configuredProviders.length === 0) {
      console.log("  • Add at least one AI provider API key to .env (e.g., GEMINI_API_KEY)");
    }
    console.log("  • Run: npm start");
  } else {
    console.log("  • Configuration is ready — run: npm start");
  }
  console.log("");
}

main().catch((err) => {
  console.error("\n❌ Setup failed:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
