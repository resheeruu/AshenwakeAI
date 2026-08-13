import { providers } from "../src/ai/providers";
import { AIRouter } from "../src/ai/router";
import { ConversationMemory } from "../src/ai/memory";
import { createAskCommand } from "../src/commands/ask";
import { createResetCommand } from "../src/commands/reset";
import { createHelpCommand } from "../src/commands/help";
import { createStatusCommand } from "../src/commands/status";
import { createConfigCommand } from "../src/commands/config";

let passed = 0;
let failed = 0;

function pass(name: string) {
  console.log(`✅ ${name}`);
  passed++;
}

function fail(name: string, error?: unknown) {
  console.error(`❌ ${name}`, error ?? "");
  failed++;
}

console.log("\n🧪 AshenAI Offline Command Tests\n");

// ─────────────────────────────────────
// COMMAND FACTORIES
// ─────────────────────────────────────

try {
  const memory = new ConversationMemory();
  const router = new AIRouter(providers);

  const ask = createAskCommand(router, memory);
  const reset = createResetCommand(memory);
  const help = createHelpCommand();
  const status = createStatusCommand(router, memory);
  const config = createConfigCommand();

  if (ask && ask.data.name === "ask" && typeof ask.execute === "function") {
    pass("/ask command factory");
  } else {
    fail("/ask command factory");
  }

  if (
    reset &&
    reset.data.name === "reset" &&
    typeof reset.execute === "function"
  ) {
    pass("/reset command factory");
  } else {
    fail("/reset command factory");
  }

  if (
    help &&
    help.data.name === "help" &&
    typeof help.execute === "function"
  ) {
    pass("/help command factory");
  } else {
    fail("/help command factory");
  }

  if (
    status &&
    status.data.name === "status" &&
    typeof status.execute === "function"
  ) {
    pass("/status command factory");
  } else {
    fail("/status command factory");
  }

  if (
    config &&
    config.data.name === "config" &&
    typeof config.execute === "function"
  ) {
    pass("/config command factory");
  } else {
    fail("/config command factory");
  }

  // ─────────────────────────────────────
  // COMMAND DEFINITIONS
  // ─────────────────────────────────────

  const commandNames = [
    ask.data.name,
    reset.data.name,
    help.data.name,
    status.data.name,
    config.data.name,
  ];

  const expectedNames = [
    "ask",
    "reset",
    "help",
    "status",
    "config",
  ];

  if (
    expectedNames.every((name) =>
      commandNames.includes(name)
    )
  ) {
    pass("All required command names");
  } else {
    fail(
      "All required command names",
      commandNames
    );
  }

  if (new Set(commandNames).size === commandNames.length) {
    pass("No duplicate command names");
  } else {
    fail("No duplicate command names");
  }

  // ─────────────────────────────────────
  // ASK COMMAND OPTIONS
  // ─────────────────────────────────────

  const askJson = ask.data.toJSON();

  const promptOption = askJson.options?.find(
    (option: any) => option.name === "prompt"
  );

  if (
    promptOption &&
    promptOption.type === 3 &&
    promptOption.required === true
  ) {
    pass("/ask prompt option");
  } else {
    fail("/ask prompt option");
  }

  // ─────────────────────────────────────
  // CONFIG SUBCOMMANDS
  // ─────────────────────────────────────

  const configJson = config.data.toJSON();

  const configOptions = configJson.options ?? [];

  const hasStatus = configOptions.some(
    (option: any) =>
      option.name === "status"
  );

  const hasReload = configOptions.some(
    (option: any) =>
      option.name === "reload"
  );

  if (hasStatus) {
    pass("/config status subcommand");
  } else {
    fail("/config status subcommand");
  }

  if (hasReload) {
    pass("/config reload subcommand");
  } else {
    fail("/config reload subcommand");
  }

  // ─────────────────────────────────────
  // MEMORY USED BY COMMANDS
  // ─────────────────────────────────────

  memory.add("command-test-user", {
    role: "user",
    content: "test",
  });

  if (
    memory.get("command-test-user").length === 1
  ) {
    pass("Command memory integration");
  } else {
    fail("Command memory integration");
  }

  memory.reset("command-test-user");

  if (
    memory.get("command-test-user").length === 0
  ) {
    pass("Command memory reset integration");
  } else {
    fail("Command memory reset integration");
  }

} catch (error) {
  fail("Command test execution", error);
}

// ─────────────────────────────────────
// RESULT
// ─────────────────────────────────────

console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed === 0) {
  console.log("🎉 ALL COMMAND TESTS PASSED");
} else {
  console.log("❌ COMMAND TESTS FAILED");
  process.exit(1);
}

console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
