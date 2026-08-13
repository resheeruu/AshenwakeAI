import { existsSync } from "node:fs";
import { execSync } from "node:child_process";

let failed = false;

function pass(message: string) {
  console.log(`✅ ${message}`);
}

function fail(message: string) {
  console.error(`❌ ${message}`);
  failed = true;
}

function run(command: string, silent = false): boolean {
  try {
    execSync(command, {
      stdio: silent ? "pipe" : "inherit",
    });
    return true;
  } catch {
    return false;
  }
}

console.log("\n🔥 AshenAI Automated Check\n");

console.log("📁 Checking required files...");

const requiredFiles = [
  "src/index.ts",
  "src/config/env.ts",
  "src/ai/router.ts",
  "src/ai/memory.ts",
  "src/ai/providers/index.ts",
  "src/commands/definitions.ts",
  "src/commands/handler.ts",
  "src/commands/ask.ts",
  "src/commands/help.ts",
  "src/commands/reset.ts",
  "src/commands/status.ts",
  "src/commands/register.ts",
  "src/web/server.ts",
  "src/web/public/index.html",
];

for (const file of requiredFiles) {
  if (existsSync(file)) {
    pass(file);
  } else {
    fail(`Missing ${file}`);
  }
}

console.log("\n🧪 TypeScript check...");

if (run("npx tsc --noEmit")) {
  pass("TypeScript compilation");
} else {
  fail("TypeScript compilation failed");
}

console.log("\n🔎 Checking deprecated Discord options...");

const deprecated = execSync(
  "grep -R 'ephemeral: true' -n src --include='*.ts' --exclude='*.backup*' --exclude='*.bak' --exclude='*.before-*' --exclude='*.broken' --exclude='*.working*' || true",
  { encoding: "utf8" },
).trim();

if (!deprecated) {
  pass("No deprecated ephemeral options found");
} else {
  console.log(deprecated);
  fail("Deprecated ephemeral option detected in active source");
}

console.log("\n🔎 Checking command architecture...");

if (
  run(
    "grep -q 'class CommandHandler' src/commands/handler.ts",
    true,
  )
) {
  pass("CommandHandler class");
} else {
  fail("CommandHandler class missing");
}

const factories = [
  ["createAskCommand", "src/commands/ask.ts"],
  ["createResetCommand", "src/commands/reset.ts"],
  ["createHelpCommand", "src/commands/help.ts"],
  ["createStatusCommand", "src/commands/status.ts"],
];

for (const [name, file] of factories) {
  if (run(`grep -q '${name}' '${file}'`, true)) {
    pass(`${name} exists`);
  } else {
    fail(`${name} missing`);
  }
}

console.log("\n🌐 Checking web system...");

if (
  run(
    "grep -q 'app.post.*api/chat\\|app.post(\"/api/chat\"' src/web/server.ts",
    true,
  )
) {
  pass("Web chat API");
} else {
  fail("Web chat API missing");
}

if (
  run(
    "grep -q 'app.listen' src/web/server.ts",
    true,
  )
) {
  pass("Web server listener");
} else {
  fail("Web server listener missing");
}

if (existsSync("src/web/public/index.html")) {
  pass("Web chat interface");
} else {
  fail("Web chat interface missing");
}

console.log("\n⚡ Final verification...");

if (!failed) {
  pass("All automated checks passed");
}

console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

if (failed) {
  console.log("❌ ASHENAI CHECK FAILED");
  console.log("📋 Fix the reported issue before continuing.");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  process.exit(1);
}

console.log("🎉 ASHENAI CHECK PASSED");
console.log("🚀 Safe to continue.");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
