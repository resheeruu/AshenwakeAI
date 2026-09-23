/**
 * Vision SSRF Security Regression Tests
 *
 * Tests that validateOutboundUrl correctly rejects malicious image URLs
 * before any DNS resolution or network connection is attempted.
 *
 * This is a regression test for the SSRF fix in src/ai/vision.ts,
 * which now uses validateOutboundUrl from src/security/network-boundary.ts
 * to enforce the network boundary on image retrieval.
 */

import { validateOutboundUrl } from "../src/security/network-boundary";

let passed = 0;
let failed = 0;

function pass(name: string): void {
  passed++;
  console.log(`  ✅ ${name}`);
}

function fail(name: string, error: unknown): void {
  failed++;
  console.error(`  ❌ ${name}`);
  console.error(error instanceof Error ? error.message : String(error));
}

function assertBlock(url: string, label: string): void {
  const result = validateOutboundUrl(url);
  if (!result.valid) {
    pass(`${label} blocked (${url})`);
  } else {
    fail(`${label} NOT blocked (${url})`, new Error(`Expected rejection but got valid=${result.valid}`));
  }
}

function assertAllow(url: string, label: string): void {
  const result = validateOutboundUrl(url);
  if (result.valid) {
    pass(`${label} allowed (${url})`);
  } else {
    fail(`${label} incorrectly blocked (${url})`, new Error(`Expected valid but got reason: ${result.reason}`));
  }
}

/* ================================================================
 * VISION SSRF SECURITY REGRESSION TESTS
 * ================================================================ */

console.log("\n===== Vision SSRF Security Tests =====\n");

/* --- Loopback addresses --- */
console.log("--- Loopback addresses ---");
assertBlock("http://localhost", "Loopback hostname");
assertBlock("http://127.0.0.1", "IPv4 loopback");
assertBlock("http://[::1]", "IPv6 loopback");
assertBlock("http://[::ffff:127.0.0.1]", "IPv4-mapped IPv6 loopback");

/* --- Cloud metadata endpoints --- */
console.log("--- Cloud metadata endpoints ---");
assertBlock("http://169.254.169.254", "AWS metadata endpoint");

/* --- RFC1918 private ranges --- */
console.log("--- RFC1918 private ranges ---");
assertBlock("http://10.0.0.1", "10.0.0.0/8 private range");
assertBlock("http://172.16.0.1", "172.16.0.0/12 private range");
assertBlock("http://192.168.1.1", "192.168.0.0/16 private range");

/* --- TEST-NET reserved ranges --- */
console.log("--- TEST-NET reserved ranges ---");
assertBlock("http://192.0.2.1", "TEST-NET-1 (192.0.2.0/24)");

/* --- Credential-bearing URLs --- */
console.log("--- Credential-bearing URLs ---");
assertBlock("http://user:pass@localhost", "Credentials in URL");

/* --- Unsupported protocols --- */
console.log("--- Unsupported protocols ---");
assertBlock("file:///etc/passwd", "file:// protocol");
assertBlock("javascript:alert(1)", "javascript: protocol");

/* --- Legitimate URLs --- */
console.log("--- Legitimate URLs ---");
assertAllow("https://example.com", "https://example.com");
assertAllow("https://google.com", "https://google.com");

/* ================================================================
 * SUMMARY
 * ================================================================ */

console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) {
  console.log("\n❌ VISION SSRF SECURITY TESTS FAILED");
  process.exit(1);
}

console.log("\n🎉 ALL VISION SSRF SECURITY TESTS PASSED");
process.exit(0);
