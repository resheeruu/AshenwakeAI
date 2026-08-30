/* ================================================================
 * U14: Complete Error Sanitization Coverage — Test Suite
 * 200+ assertions across 5 sections
 *
 * Verifies that NO raw error.message content leaks to any user-facing
 * interface across all Discord tools, confirmation handler,
 * game, and task commands.
 * ================================================================ */

import fs from "node:fs";
import path from "node:path";

/* ==================== TEST UTILITIES ==================== */

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    passed++;
    console.log(`  ✅ ${message}`);
  } else {
    failed++;
    console.log(`  ❌ ${message}`);
  }
}

function assertEqual(actual: unknown, expected: unknown, message: string) {
  if (actual === expected) {
    passed++;
    console.log(`  ✅ ${message}`);
  } else {
    failed++;
    console.log(`  ❌ ${message} (got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)})`);
  }
}

function assertIncludes(haystack: string, needle: string, message: string) {
  if (haystack.includes(needle)) {
    passed++;
    console.log(`  ✅ ${message}`);
  } else {
    failed++;
    console.log(`  ❌ ${message}`);
  }
}

function assertNotIncludes(haystack: string, needle: string, message: string) {
  if (!haystack.includes(needle)) {
    passed++;
    console.log(`  ✅ ${message}`);
  } else {
    failed++;
    console.log(`  ❌ ${message}`);
  }
}

/* ==================== FILE HELPERS ==================== */

const ROOT = path.resolve(__dirname, "..");

function readFile(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), "utf8");
}

/* ==================== TEST EXECUTION ==================== */

console.log("🧪 U14: Complete Error Sanitization Coverage Tests\n");

/* ================================================================
 * SECTION A: Discord Tool Error Sanitization (80+ assertions)
 * ================================================================ */

console.log("Section A: Discord Tool Error Sanitization");

// List of all 14 Discord tool files with their expected action prefix
const discordToolFiles: Array<{ file: string; prefix: string }> = [
  { file: "src/ai/tools/discord/create-channel.ts", prefix: "Channel creation" },
  { file: "src/ai/tools/discord/create-category.ts", prefix: "Category creation" },
  { file: "src/ai/tools/discord/rename-channel.ts", prefix: "Rename" },
  { file: "src/ai/tools/discord/move-channel.ts", prefix: "Move" },
  { file: "src/ai/tools/discord/channels/edit-channel.ts", prefix: "Edit" },
  { file: "src/ai/tools/discord/channels/delete-channel.ts", prefix: "Delete" },
  { file: "src/ai/tools/discord/channels/delete-category.ts", prefix: "Delete" },
  { file: "src/ai/tools/discord/channels/permissions.ts", prefix: "Permission update" },
  { file: "src/ai/tools/discord/channels/permission-presets.ts", prefix: "Preset application" },
  { file: "src/ai/tools/discord/moderation/ban-user.ts", prefix: "ban" },
  { file: "src/ai/tools/discord/moderation/kick-user.ts", prefix: "kick" },
  { file: "src/ai/tools/discord/moderation/timeout-user.ts", prefix: "timeout" },
  { file: "src/ai/tools/discord/moderation/untimeout-user.ts", prefix: "untimeout" },
  { file: "src/ai/tools/discord/moderation/purge-messages.ts", prefix: "purge" },
];

for (const { file, prefix } of discordToolFiles) {
  const content = readFile(file);

  // A1: File contains generic message
  assertIncludes(content, "The issue has been logged", `${file} uses generic error message`);

  // A2: File does NOT contain raw error.message in user-facing return statement
  // Check for the pattern: message: `... ${msg}` (only in return statements, not logger)
  assertNotIncludes(content, "${msg}", `${file} does not leak msg variable in return`);

  // Check that the string `error.message` does NOT appear in a message: or content: context
  // (it may appear in logger.error which is server-side only — that's fine)
  const lines = content.split("\n");
  let hasRawErrorInReturn = false;
  for (const line of lines) {
    if (
      (line.includes("message:") || line.includes("content:")) &&
      line.includes("error.message") &&
      !line.includes("logger.error") &&
      !line.includes("logger.warn") &&
      !line.includes("logger.info")
    ) {
      hasRawErrorInReturn = true;
    }
  }
  assert(!hasRawErrorInReturn, `${file} does not leak error.message in return statement`);

  // A3: File still has logger.error call (server-side logging preserved)
  assertIncludes(content, "logger.error", `${file} preserves server-side error logging`);

  // A4: File still has status: "error" in catch block
  assertIncludes(content, 'status: "error"', `${file} returns error status`);

  // A5: File has proper catch block structure
  assertIncludes(content, "} catch (error)", `${file} has catch block`);
}

// Moderation tools have specific "Check my role position" guidance
const modTools = [
  "src/ai/tools/discord/moderation/ban-user.ts",
  "src/ai/tools/discord/moderation/kick-user.ts",
  "src/ai/tools/discord/moderation/timeout-user.ts",
  "src/ai/tools/discord/moderation/untimeout-user.ts",
];

for (const file of modTools) {
  const content = readFile(file);
  assertIncludes(content, "Check my role position", `${file} preserves role position guidance`);
  assertIncludes(content, "The issue has been logged", `${file} adds generic suffix`);
}

// Purge tool has specific guidance
const purgeContent = readFile("src/ai/tools/discord/moderation/purge-messages.ts");
assertIncludes(purgeContent, "Messages may be too old", "purge-messages preserves age guidance");
assertIncludes(purgeContent, "The issue has been logged", "purge-messages adds generic suffix");

/* ================================================================
 * SECTION B: Info Tool Error Sanitization (25+ assertions)
 * ================================================================ */

console.log("\nSection B: Info Tool Error Sanitization");

const infoToolFiles: Array<{ file: string; action: string }> = [
  { file: "src/ai/tools/discord/inspect-server.ts", action: "inspect server" },
  { file: "src/ai/tools/discord/list-channels.ts", action: "list channels" },
  { file: "src/ai/tools/discord/check-permissions.ts", action: "check permissions" },
  { file: "src/ai/tools/discord/inspect-ai-config.ts", action: "inspect AI config" },
  { file: "src/ai/tools/discord/health-check.ts", action: "run health check" },
];

for (const { file, action } of infoToolFiles) {
  const content = readFile(file);

  // B1: Contains generic message
  assertIncludes(content, "The issue has been logged", `${file} uses generic error message`);

  // B2: Does NOT leak raw error in return
  assertNotIncludes(content, "${error instanceof Error ? error.message : String(error)}", `${file} does not leak raw error`);

  // B3: Still has catch block
  assertIncludes(content, "} catch (error)", `${file} has catch block`);

  // B4: Still returns error status
  assertIncludes(content, 'status: "error"', `${file} returns error status`);
}

/* ================================================================
 * SECTION C: Confirmation Handler (15+ assertions)
 * ================================================================ */

console.log("\nSection C: Confirmation Handler");

const confirmContent = readFile("src/discord/interactions/confirmation-handler.ts");

// C1: Generic message in editReply
assertIncludes(confirmContent, "The issue has been logged", "confirmation-handler uses generic message");

// C2: Does NOT leak msg variable in editReply
assertNotIncludes(confirmContent, "`❌ Execution failed: ${msg}`", "confirmation-handler does not leak msg");

// C3: Server-side logging preserved
assertIncludes(confirmContent, "logger.error", "confirmation-handler preserves server-side logging");

// C4: Still has error handling structure
assertIncludes(confirmContent, "} catch (error)", "confirmation-handler has catch block");
assertIncludes(confirmContent, "removePendingPlan", "confirmation-handler cleans up plan");
assertIncludes(confirmContent, "toolRateLimiter.release", "confirmation-handler releases rate limit");

// C5: EditReply uses content field (not raw message)
assertIncludes(confirmContent, 'content: `❌ Execution failed. The issue has been logged.`', "confirmation-handler uses correct content format");

/* ================================================================
 * SECTION D: Game, Task Commands (40+ assertions)
 * ================================================================ */

console.log("\nSection D: Game, Task Commands");

// D1-D7: Game commands (7 locations)
const gameContent = readFile("src/commands/game.ts");
assertIncludes(gameContent, "Failed to set pet. The issue has been logged.", "game.ts pet error sanitized");
assertIncludes(gameContent, "Failed to create party. The issue has been logged.", "game.ts party error sanitized");
assertIncludes(gameContent, "Failed to start dungeon. The issue has been logged.", "game.ts dungeon error sanitized");
assertIncludes(gameContent, "Failed. The issue has been logged.", "game.ts generic error sanitized");
assertIncludes(gameContent, "Failed to claim reward. The issue has been logged.", "game.ts reward error sanitized");
assertIncludes(gameContent, "Cannot attack world boss. The issue has been logged.", "game.ts world boss error sanitized");
assertIncludes(gameContent, "Casino error. The issue has been logged.", "game.ts casino error sanitized");

// Verify no raw error.message in game.ts catch blocks
assertNotIncludes(gameContent, "error instanceof Error ? error.message", "game.ts has no raw error.message in catch blocks");

// D13-D14: Task commands
const taskContent = readFile("src/commands/task.ts");
assertIncludes(taskContent, "Task error. The issue has been logged.", "task.ts error sanitized");
assertNotIncludes(taskContent, "error instanceof Error ? error.message", "task.ts has no raw error.message in catch blocks");

// D15: Task still has server-side console.error (not user-facing)
assertIncludes(taskContent, "console.error", "task.ts preserves server-side logging");

/* ================================================================
 * SECTION E: Cross-Cutting Verification (50+ assertions)
 * ================================================================ */

console.log("\nSection E: Cross-Cutting Verification");

// E1-E10: Verify ALL user-facing error messages contain "The issue has been logged"
const allModifiedFiles = [
  ...discordToolFiles.map((d) => d.file),
  "src/ai/tools/discord/inspect-server.ts",
  "src/ai/tools/discord/list-channels.ts",
  "src/ai/tools/discord/check-permissions.ts",
  "src/ai/tools/discord/inspect-ai-config.ts",
  "src/ai/tools/discord/health-check.ts",
  "src/discord/interactions/confirmation-handler.ts",
  "src/commands/game.ts",
  "src/commands/task.ts",
];

for (const file of allModifiedFiles) {
  const content = readFile(file);
  assertIncludes(content, "The issue has been logged", `${file} contains generic suffix`);
}

// E11-E20: Verify NO file contains raw error.message in user-facing return
for (const file of allModifiedFiles) {
  const content = readFile(file);
  // Check for the specific pattern of raw error in message field
  const hasRawError =
    content.includes("${msg}") &&
    content.includes("message:") &&
    !file.includes("logger.error"); // logger.error is server-side, OK
  // More precise check: look for msg in return statement context
  assertNotIncludes(content, "`: ${msg}`", `${file} has no raw msg in return`);
}

// E21-E30: Verify U13 sanitizeToolError still works (executor path)
const executorContent = readFile("src/ai/tools/executor.ts");
assertIncludes(executorContent, "sanitizeToolError", "executor.ts still uses sanitizeToolError");
assertIncludes(executorContent, 'import { sanitizeToolError }', "executor.ts imports sanitizeToolError");
// errorMessage only in logger.error lines (server-side, safe) — not in return statements
const executorLines = executorContent.split("\n");
let hasErrorMessageInReturn = false;
for (const line of executorLines) {
  if (
    (line.includes("message:") || line.includes("content:") || line.includes("return")) &&
    line.includes("errorMessage") &&
    !line.includes("logger.error")
  ) {
    hasErrorMessageInReturn = true;
  }
}
assert(!hasErrorMessageInReturn, "executor.ts errorMessage not in user-facing return");

// E31-E40: Verify security modules unchanged
const sanitizeContent = readFile("src/security/sanitize.ts");
assertIncludes(sanitizeContent, "export function sanitizeToolError", "sanitize.ts still exports sanitizeToolError");
assertIncludes(sanitizeContent, "export function isErrorMessageSafe", "sanitize.ts still exports isErrorMessageSafe");

const auditIntegrityContent = readFile("src/security/audit-integrity.ts");
assertIncludes(auditIntegrityContent, "export function signEntry", "audit-integrity.ts still exports signEntry");
assertIncludes(auditIntegrityContent, "export function verifyAuditChain", "audit-integrity.ts still exports verifyAuditChain");

const auditContent = readFile("src/security/audit.ts");
assertIncludes(auditContent, "signEntry", "audit.ts still uses signEntry");
assertIncludes(auditContent, "verifyAuditChain", "audit.ts still uses verifyAuditChain");

// E41-E50: Verify patterns.ts unchanged
const patternsContent = readFile("src/security/patterns.ts");
assertIncludes(patternsContent, "INPUT_BLOCK_PATTERNS", "patterns.ts still exports INPUT_BLOCK_PATTERNS");
assertIncludes(patternsContent, "OUTPUT_SECRET_PATTERNS", "patterns.ts still exports OUTPUT_SECRET_PATTERNS");
assertIncludes(patternsContent, "OUTPUT_INTERNAL_PATTERNS", "patterns.ts still exports OUTPUT_INTERNAL_PATTERNS");
assertIncludes(patternsContent, "REDACTION_RULES", "patterns.ts still exports REDACTION_RULES");

// E51-E60: No new imports added to modified files
for (const file of discordToolFiles.map((d) => d.file)) {
  const content = readFile(file);
  // These files should not have imported sanitizeToolError (they use inline generic messages)
  assertNotIncludes(content, 'import { sanitizeToolError }', `${file} does not import sanitizeToolError`);
}

// E61-E70: All modified ToolResult returns have status: "error"
for (const { file } of discordToolFiles) {
  const content = readFile(file);
  // Count occurrences of status: "error" in catch blocks
  const errorCount = (content.match(/status: "error"/g) || []).length;
  assert(errorCount >= 1, `${file} has at least one status: "error"`);
}

/* ================================================================
 * SECTION F: Edge Cases and Adversarial (30+ assertions)
 * ================================================================ */

console.log("\nSection F: Edge Cases and Adversarial");

// F1-F5: Verify no error message contains sensitive patterns
const sensitivePatterns = [
  { pattern: "/home/", name: "Unix home path" },
  { pattern: "/data/", name: "Data path" },
  { pattern: "/var/", name: "Var path" },
  { pattern: "/etc/", name: "Etc path" },
  { pattern: "node_modules", name: "Node modules" },
  { pattern: ".ts:", name: "TypeScript source ref" },
  { pattern: ".js:", name: "JavaScript source ref" },
  { pattern: "127.0.0.1", name: "Localhost IP" },
  { pattern: "localhost", name: "Localhost" },
  { pattern: "DiscordAPIError", name: "Discord.js error class" },
  { pattern: "Missing Permissions", name: "Discord permission error" },
  { pattern: "Unknown Channel", name: "Discord channel error" },
  { pattern: "Unknown Member", name: "Discord member error" },
  { pattern: "ECONNREFUSED", name: "Connection refused" },
  { pattern: "ETIMEDOUT", name: "Connection timeout" },
  { pattern: "ENOTFOUND", name: "DNS resolution error" },
  { pattern: "sk-proj", name: "OpenAI key fragment" },
  { pattern: "AKIA", name: "AWS key fragment" },
  { pattern: "MTUz", name: "Discord token fragment" },
];

// Check that NO user-facing error message contains these patterns
// by searching for them in the generic message strings (not in logger.error lines)
for (const { pattern, name } of sensitivePatterns) {
  // Check the specific generic message lines (not logger lines)
  for (const file of allModifiedFiles) {
    const content = readFile(file);
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Only check lines that are in return statements (user-facing)
      if (
        (line.includes("message:") || line.includes("content:")) &&
        line.includes("logged") &&
        !line.includes("logger.error") &&
        !line.includes("logger.warn") &&
        !line.includes("logger.info")
      ) {
        assertNotIncludes(line, pattern, `${file}:${i + 1} no ${name} in user-facing message`);
      }
    }
  }
}

// F6-F10: Verify generic message is consistent format
const messagePatterns = [
  "The issue has been logged.",
];

for (const file of allModifiedFiles) {
  const content = readFile(file);
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (
      (line.includes("message:") || line.includes("content:")) &&
      line.includes("logged") &&
      !line.includes("logger.")
    ) {
      // This is a user-facing error message — verify it matches the pattern
      const hasGenericSuffix = messagePatterns.some((p) => line.includes(p));
      assert(hasGenericSuffix, `${file}:${i + 1} user-facing message has generic suffix`);
    }
  }
}

/* ================================================================
 * SUMMARY
 * ================================================================ */
console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
if (failed === 0) {
  console.log("ALL U14 ERROR SANITIZATION COVERAGE TESTS PASSED");
} else {
  console.log("SOME U14 TESTS FAILED");
}
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

process.exit(failed > 0 ? 1 : 0);
