/* ================================================================
 * U13: Error Message Sanitization — Test Suite
 * 90+ assertions across 4 sections
 * ================================================================ */

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
    console.log(`  ❌ ${message} (got ${JSON.stringify(haystack)}, did not expect ${JSON.stringify(needle)})`);
  }
}

/* ==================== IMPORTS ==================== */

import { sanitizeToolError, isErrorMessageSafe } from "../src/security/sanitize";

/* ==================== TEST EXECUTION ==================== */

console.log("🧪 U13: Error Message Sanitization Tests\n");

/* ================================================================
 * SECTION A: Generic Error Messages (30+ assertions)
 * ================================================================ */

console.log("Section A: Generic Error Messages");

// A1-A10: Path leak prevention
const pathErrors = [
  { error: "ENOENT: no such file or directory, open '/home/user/.env'", desc: "Unix path in ENOENT" },
  { error: "EACCES: permission denied, open '/data/data/com.termux/files/home/AshenAI/src/index.ts'", desc: "Full Termux path" },
  { error: "spawn ENOENT", desc: "spawn ENOENT" },
  { error: "SQLITE_ERROR: disk I/O error at /var/db/ashenai.db", desc: "Database path" },
  { error: "ENOENT: no such file or directory, scandir '/tmp/ashenai-cache/'", desc: "Temp directory path" },
  { error: "Cannot find module '/home/user/AshenAI/node_modules/discord.js'", desc: "Node module path" },
  { error: "EPERM: operation not permitted, unlink '/etc/passwd'", desc: "System file path" },
  { error: "read ECONNRESET at TCP.onStreamRead (node:internal/stream_base_commons:213:20)", desc: "Stack trace with source" },
  { error: "Error: listen EADDRINUSE: address already in use :::3000", desc: "Port reference" },
  { error: "Fatal: unable to connect to 127.0.0.1:5432 (postgresql)", desc: "Localhost with port" },
];

for (const { error, desc } of pathErrors) {
  const result = sanitizeToolError("test-tool", new Error(error));
  assertNotIncludes(result, "/home/", `No /home/ path in result for ${desc}`);
  assertNotIncludes(result, "/data/", `No /data/ path in result for ${desc}`);
  assertNotIncludes(result, "/var/", `No /var/ path in result for ${desc}`);
  assertNotIncludes(result, "/etc/", `No /etc/ path in result for ${desc}`);
  assertNotIncludes(result, "node_modules", `No node_modules in result for ${desc}`);
  assertIncludes(result, "test-tool", `Tool name preserved for ${desc}`);
}

// A11-A20: Stack trace prevention
const stackErrors = [
  { error: "TypeError: Cannot read property 'id' of undefined\n    at ChannelManager.get (/home/user/src/managers.ts:142:23)", desc: "Full stack trace" },
  { error: "RangeError: Maximum call stack size exceeded\n    at Object.<anonymous> (/data/src/index.ts:5:1)", desc: "Stack with source file" },
  { error: "Error\n    at Function.execute (/src/ai/tools/executor.ts:250:15)\n    at processTicksAndRejections (node:internal/process/task_queues:96:5)", desc: "Node internal trace" },
  { error: "AssertionError [ERR_ASSERTION]: false == true\n    at test (/root/project/test.ts:42:10)", desc: "Assertion with path" },
  { error: "Error: connect ECONNREFUSED 127.0.0.1:6379\n    at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1141:16)", desc: "Network error with stack" },
];

for (const { error, desc } of stackErrors) {
  const result = sanitizeToolError("test-tool", new Error(error));
  assertNotIncludes(result, "at ", `No stack trace 'at' for ${desc}`);
  assertNotIncludes(result, ".ts:", `No source file reference for ${desc}`);
  assertNotIncludes(result, ".js:", `No JS file reference for ${desc}`);
  assertNotIncludes(result, "node:", `No node internal reference for ${desc}`);
}

// A21-A30: Internal detail prevention
const internalErrors = [
  { error: "Configuration error: missing ASHENAI_OWNER_PASSWORD_HASH in environment", desc: "Config variable name" },
  { error: "PID 12345 died unexpectedly", desc: "Process ID" },
  { error: "Port 2333 already in use by Lavalink", desc: "Internal port" },
  { error: "Failed to authenticate with Discord gateway: 401 Unauthorized", desc: "Gateway auth failure" },
  { error: "Token expired: MTUzNTY3OTk3NDM1NzM0NDI4Ng.GQGtua...", desc: "Discord token fragment" },
];

for (const { error, desc } of internalErrors) {
  const result = sanitizeToolError("test-tool", new Error(error));
  assertNotIncludes(result, "ASHENAI_", `No env var name in result for ${desc}`);
  assertNotIncludes(result, "12345", `No PID in result for ${desc}`);
  assertNotIncludes(result, "MTUz", `No token fragment in result for ${desc}`);
  assertIncludes(result, "test-tool", `Tool name preserved for ${desc}`);
}

/* ================================================================
 * SECTION B: Known Error Categories (20+ assertions)
 * ================================================================ */

console.log("\nSection B: Known Error Categories");

// Rate limiting
const rateLimitResult = sanitizeToolError("rate-tool", new Error("Rate limit exceeded: too many requests"));
assertIncludes(rateLimitResult, "rate-limited", "Rate limit message says rate-limited");
assertIncludes(rateLimitResult, "rate-tool", "Rate limit preserves tool name");

const throttleResult = sanitizeToolError("throttle-tool", new Error("Request throttled: 429"));
assertIncludes(throttleResult, "rate-limited", "Throttle message says rate-limited");

const tooManyResult = sanitizeToolError("multi-tool", new Error("Too many requests in the last minute"));
assertIncludes(tooManyResult, "rate-limited", "Too many requests message says rate-limited");

// Permissions
const permResult = sanitizeToolError("ban-tool", new Error("Permission denied: requires MANAGE_CHANNELS"));
assertIncludes(permResult, "permissions", "Permission error says permissions");
assertIncludes(permResult, "ban-tool", "Permission preserves tool name");

const unauthResult = sanitizeToolError("kick-tool", new Error("Unauthorized: missing authorization header"));
assertIncludes(unauthResult, "permissions", "Unauthorized says permissions");

const forbiddenResult = sanitizeToolError("delete-tool", new Error("Forbidden: insufficient role"));
assertIncludes(forbiddenResult, "permissions", "Forbidden says permissions");

const eaccesResult = sanitizeToolError("fs-tool", new Error("EACCES: permission denied"));
assertIncludes(eaccesResult, "permissions", "EACCES says permissions");

// Not found
const notFoundResult = sanitizeToolError("find-tool", new Error("Not found: channel does not exist"));
assertIncludes(notFoundResult, "not found", "Not found message says not found");
assertIncludes(notFoundResult, "find-tool", "Not found preserves tool name");

const enoentResult = sanitizeToolError("read-tool", new Error("ENOENT: no such file or directory"));
assertIncludes(enoentResult, "not found", "ENOENT says not found");

const missingResult = sanitizeToolError("lookup-tool", new Error("Missing required parameter: guildId"));
assertIncludes(missingResult, "not found", "Missing says not found");

// Timeout
const timeoutResult = sanitizeToolError("slow-tool", new Error("Operation timed out after 30s"));
assertIncludes(timeoutResult, "timed out", "Timeout message says timed out");

const etimedoutResult = sanitizeToolError("net-tool", new Error("ETIMEDOUT: connection timed out"));
assertIncludes(etimedoutResult, "timed out", "ETIMEDOUT says timed out");

// Network
const networkResult = sanitizeToolError("api-tool", new Error("Network error: fetch failed"));
assertIncludes(networkResult, "network error", "Network message says network error");

const connRefusedResult = sanitizeToolError("db-tool", new Error("ECONNREFUSED: connection refused"));
assertIncludes(connRefusedResult, "network error", "ECONNREFUSED says network error");

// Generic (unknown category)
const genericResult = sanitizeToolError("mystery-tool", new Error("Something completely unexpected happened"));
assertIncludes(genericResult, "encountered an error", "Generic error says encountered an error");
assertIncludes(genericResult, "mystery-tool", "Generic preserves tool name");
assertNotIncludes(genericResult, "Something completely unexpected", "Generic does not leak raw message");

/* ================================================================
 * SECTION C: Non-String Errors (15+ assertions)
 * ================================================================ */

console.log("\nSection C: Non-String Errors");

const nullResult = sanitizeToolError("null-tool", null);
assertIncludes(nullResult, "null-tool", "Null error preserves tool name");
// "null-tool" contains "null" as part of the tool name — that's expected, not a leak
assertNotIncludes(nullResult, "String(", "Null error does not leak String() conversion");

const undefinedResult = sanitizeToolError("undef-tool", undefined);
assertIncludes(undefinedResult, "undef-tool", "Undefined error preserves tool name");

const numberResult = sanitizeToolError("num-tool", 42);
assertIncludes(numberResult, "num-tool", "Number error preserves tool name");
assertNotIncludes(numberResult, "42", "Number error does not leak raw number");

const objectResult = sanitizeToolError("obj-tool", { code: "ENOENT", message: "not found" });
assertIncludes(objectResult, "obj-tool", "Object error preserves tool name");

const emptyResult = sanitizeToolError("empty-tool", "");
assertIncludes(emptyResult, "empty-tool", "Empty error preserves tool name");
assertNotIncludes(emptyResult, "empty-tool failed:", "Empty error does not include 'failed:'");

const boolResult = sanitizeToolError("bool-tool", false);
assertIncludes(boolResult, "bool-tool", "Boolean error preserves tool name");

const symbolResult = sanitizeToolError("sym-tool", Symbol("test"));
assertIncludes(symbolResult, "sym-tool", "Symbol error preserves tool name");

const arrayResult = sanitizeToolError("arr-tool", ["error", "details"]);
assertIncludes(arrayResult, "arr-tool", "Array error preserves tool name");

/* ================================================================
 * SECTION D: Safety Verification Utility (20+ assertions)
 * ================================================================ */

console.log("\nSection D: Safety Verification Utility");

// Safe messages
assert(isErrorMessageSafe(""), "Empty string is safe");
assert(isErrorMessageSafe("Tool completed successfully"), "Success message is safe");
assert(isErrorMessageSafe("No channels found"), "Simple message is safe");
assert(isErrorMessageSafe("Rate limit exceeded"), "Rate limit text is safe");

// Unsafe messages (contain paths)
assert(!isErrorMessageSafe("/home/user/.env: permission denied"), "/home/ path is unsafe");
assert(!isErrorMessageSafe("/data/data/com.termux/files/home/AshenAI/src/index.ts"), "/data/ path is unsafe");
assert(!isErrorMessageSafe("C:\\Users\\admin\\secrets.txt"), "Windows path is unsafe");
assert(!isErrorMessageSafe("file:///etc/passwd"), "file:// URI is unsafe");
assert(!isErrorMessageSafe("/var/log/ashenai.log"), "/var/ path is unsafe");
assert(!isErrorMessageSafe("/tmp/ashenai-cache/data.json"), "/tmp/ path is unsafe");
assert(!isErrorMessageSafe("/opt/ashenai/config.json"), "/opt/ path is unsafe");

// Unsafe messages (contain stack traces)
assert(!isErrorMessageSafe("at Function.execute (/src/executor.ts:250:15)"), "Stack trace 'at' is unsafe");
assert(!isErrorMessageSafe("node_modules/discord.js/src/index.js:123:45"), "node_modules reference is unsafe");
assert(!isErrorMessageSafe("test.ts:42:10"), "Source file line reference is unsafe");

// Unsafe messages (contain internal details)
assert(!isErrorMessageSafe("PID 12345 crashed"), "PID reference is unsafe");
assert(!isErrorMessageSafe("localhost:3000 connection refused"), "Localhost reference is unsafe");
assert(!isErrorMessageSafe("127.0.0.1:5432 unreachable"), "127.0.0.1 reference is unsafe");

// Safe messages that look suspicious but aren't
assert(isErrorMessageSafe("The channel was not found in the server"), "Natural language 'not found' is safe");
assert(isErrorMessageSafe("Permission required to manage this channel"), "Natural language 'permission' is safe");

/* ================================================================
 * SECTION E: Edge Cases (15+ assertions)
 * ================================================================ */

console.log("\nSection E: Edge Cases");

// Very long error messages
const longError = "A".repeat(10000);
const longResult = sanitizeToolError("long-tool", new Error(longError));
assertIncludes(longResult, "long-tool", "Very long error preserves tool name");
assert(longResult.length < 200, "Very long error result is truncated/short");

// Unicode in error messages
const unicodeResult = sanitizeToolError("unicode-tool", new Error("错误：文件未找到"));
assertIncludes(unicodeResult, "unicode-tool", "Unicode error preserves tool name");
assertNotIncludes(unicodeResult, "错误", "Unicode error message not leaked");

// Error with special characters
const specialResult = sanitizeToolError("special-tool", new Error("Error: <script>alert('xss')</script>"));
assertNotIncludes(specialResult, "<script>", "XSS in error not leaked");
assertIncludes(specialResult, "special-tool", "Special char error preserves tool name");

// Error with newlines
const newlineResult = sanitizeToolError("newline-tool", new Error("Line 1\nLine 2\nLine 3"));
assertNotIncludes(newlineResult, "Line 1", "Multi-line error not leaked");
assertIncludes(newlineResult, "newline-tool", "Newline error preserves tool name");

// Tool name with special characters
const toolNameResult = sanitizeToolError("my-tool_v2.0", new Error("Something failed"));
assertIncludes(toolNameResult, "my-tool_v2.0", "Tool name with special chars preserved");

// Verify all sanitizeToolError results never contain common leak patterns
const adversarialInputs = [
  new Error("/etc/shadow content: root:xxx:16000:0:99999:7:::"),
  new Error("Token: sk-proj-abc123def456"),
  new Error("Password: hunter2"),
  new Error("AWS key: AKIAIOSFODNN7EXAMPLE"),
  new Error("Private key: -----BEGIN RSA PRIVATE KEY-----"),
  new Error("Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"),
  new Error("Discord token: MTUzNTY3OTk3NDM1NzM0NDI4Ng.GQGtua.bL4K1X"),
];

for (const input of adversarialInputs) {
  const result = sanitizeToolError("adversarial-tool", input);
  assertNotIncludes(result, "sk-proj", `No API key in adversarial result: ${input.message.slice(0, 30)}`);
  assertNotIncludes(result, "AKIA", `No AWS key in adversarial result: ${input.message.slice(0, 30)}`);
  assertNotIncludes(result, "BEGIN", `No private key in adversarial result: ${input.message.slice(0, 30)}`);
  assertNotIncludes(result, "eyJ", `No JWT in adversarial result: ${input.message.slice(0, 30)}`);
  assertNotIncludes(result, "MTUz", `No Discord token in adversarial result: ${input.message.slice(0, 30)}`);
}

/* ================================================================
 * SUMMARY
 * ================================================================ */
console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
if (failed === 0) {
  console.log("ALL U13 ERROR SANITIZATION TESTS PASSED");
} else {
  console.log("SOME U13 TESTS FAILED");
}
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

process.exit(failed > 0 ? 1 : 0);
