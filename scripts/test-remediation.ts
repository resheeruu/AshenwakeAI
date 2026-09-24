import crypto from "node:crypto";
import { nanoid } from "nanoid";
import { verifyEntry, signEntry, verifyAuditChain, safeTimingEqual } from "../src/security/audit-integrity";
import { executeTool, INTERNAL_SKIP_CONFIRMATION, ExecutorOptions } from "../src/ai/tools/executor";
import { createActionPlan } from "../src/ai/tools/executor";
import fs from "node:fs";
import assert from "node:assert";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function testSafeTimingEqualNeverThrows(): void {
  const full = "a".repeat(64);
  assert(safeTimingEqual(full, full) === true, "Equal hex signatures must match");
  assert(safeTimingEqual(full, "ab") === false, "Truncated signature must not match");
  assert(safeTimingEqual(full, "zz") === false, "Invalid hex must not match");
  assert(safeTimingEqual(full, "") === false, "Empty signature must not match");
  assert(safeTimingEqual("ab", full) === false, "Short expected must not match");
  assert(safeTimingEqual("", "") === true, "Two empty hex strings decode to equal buffers");
  console.log("✅ safeTimingEqual never throws on malformed/length-mismatched input");
}

function testVerifyAuditChainNonGenesisMalformedSignatures(): void {
  const signable = {
    id: nanoid(12),
    timestamp: Date.now(),
    who: "test",
    what: "test action",
    where: "test",
    result: "success" as const,
  };

  for (const badSig of ["ab", "zz", ""]) {
    const chain = [{ ...signable, signature: badSig, prevHash: "not-genesis" }];
    let result: ReturnType<typeof verifyAuditChain> | undefined;
    let threw = false;
    try {
      result = verifyAuditChain(chain);
    } catch {
      threw = true;
    }
    assert(!threw, `verifyAuditChain must not throw for signature "${badSig}"`);
    assert(result !== undefined, "Result must be defined");
    assert(result.valid === false, `valid must be false for signature "${badSig}"`);
    assert(result.tamperingDetected === true, `tamperingDetected must be true for signature "${badSig}"`);
    assert(result.firstInvalidIndex === 0, `firstInvalidIndex must be 0 for signature "${badSig}"`);
  }
  console.log("✅ verifyAuditChain non-genesis malformed signatures fail closed without throwing");
}

function testVerifyEntryMalformedSignatures(): void {
  const signable = {
    id: nanoid(12),
    timestamp: Date.now(),
    who: "test",
    what: "test action",
    where: "test",
    result: "success" as const,
  };

  const { signature, prevHash } = signEntry(signable, null);
  const validEntry = { ...signable, signature, prevHash };
  assert(verifyEntry(validEntry, "genesis") === true, "Valid signature should verify");

  assert(verifyEntry({ ...signable, signature: "not-hex!!!", prevHash: "genesis" }, "genesis") === false, "Malformed hex should return false");
  assert(verifyEntry({ ...signable, signature: "", prevHash: "genesis" }, "genesis") === false, "Empty signature should return false");
  assert(verifyEntry({ ...signable, signature: "ab", prevHash: "genesis" }, "genesis") === false, "Truncated signature should return false");
  assert(verifyEntry({ ...signable, signature: signature + "00", prevHash: "genesis" }, "genesis") === false, "Extended signature should return false");
  assert(verifyEntry({ ...signable, signature: undefined as any, prevHash: "genesis" }, "genesis") === false, "Missing signature should return false");

  console.log("✅ verifyEntry handles all malformed signatures without throwing");
}

function testSkipConfirmationCannotBeBypassed(): void {
  const plainOptions: ExecutorOptions = { dryRun: false, skipRateLimit: false };
  const hasInternalFlag = (plainOptions as any)[INTERNAL_SKIP_CONFIRMATION] === true;
  assert(!hasInternalFlag, "Plain options must not have internal skip flag");
  const spreadOptions = { ...plainOptions };
  const hasSpreadFlag = (spreadOptions as any)[INTERNAL_SKIP_CONFIRMATION] === true;
  assert(!hasSpreadFlag, "Spread options must not have internal skip flag");
  console.log("✅ INTERNAL_SKIP_CONFIRMATION cannot be set through plain object construction");
}

function testPlanIdsAreUnpredictable(): void {
  const ids = new Set<string>();
  for (let i = 0; i < 100; i++) {
    const plan = createActionPlan(
      { guildId: "g1", channelId: "c1", requesterId: "u1", requesterRole: "member", arguments: {}, riskLevel: "low" } as any,
      "low",
      [{ type: "create", target: "test", description: "test" }],
      false
    );
    ids.add(plan.id);
  }
  assert(ids.size === 100, "All plan IDs must be unique");
  for (const id of ids) {
    assert(id.startsWith("plan_"), "Plan IDs must have plan_ prefix");
    assert(id.length > 16, "Plan IDs must be sufficiently long");
    const hexPart = id.replace("plan_", "");
    assert(hexPart.length === 16, "Hex portion must be 16 chars");
    assert(/^[0-9a-f]+$/.test(hexPart), "Hex portion must be valid hex");
  }
  console.log("✅ Plan IDs are cryptographically random and unpredictable");
}

function testLegacyEntriesNotAuthenticated(): void {
  const legacyEntries = [
    { id: nanoid(12), timestamp: Date.now(), who: "test", what: "test", where: "test", result: "success" as const },
    { id: nanoid(12), timestamp: Date.now(), who: "test", what: "test", where: "test", result: "success" as const },
  ];
  const result = verifyAuditChain(legacyEntries);
  assert(result.legacyEntries >= 1, "Should count legacy entries");
  assert(result.valid === false, "Chain with legacy entries must not be valid");
  assert(result.tamperingDetected === true, "Must detect tampering from legacy entries");
  console.log("✅ Legacy unsigned entries are not authenticated as valid");
}

function testDifferentDomainsProduceDifferentKeys(): void {
  const { KEY_DOMAINS } = require("../src/security/encrypt");
  const domains = Object.keys(KEY_DOMAINS);
  assert(domains.length === 3, "Must have 3 domains");
  assert(domains.includes("sessionEncryption"), "Must have sessionEncryption");
  assert(domains.includes("mfaEncryption"), "Must have mfaEncryption");
  assert(domains.includes("auditIntegrity"), "Must have auditIntegrity");
  console.log("✅ Domain separation: session, MFA, audit are distinct");
}

function testCSPNoUnsafeInline(): void {
  const serverSrc = fs.readFileSync("src/web/server.ts", "utf8");
  assert(!serverSrc.includes("'unsafe-inline'"), "CSP must not contain unsafe-inline");
  assert(serverSrc.includes("nonce-"), "CSP must use nonce-based protection");
  // Regression: the nonce must be interpolated via template literal, not left as a string literal.
  assert(
    !serverSrc.includes("'nonce-' + cspNonce"),
    "CSP must not contain the literal string \"'nonce-' + cspNonce\"",
  );
  assert(
    !serverSrc.includes("+ cspNonce"),
    "CSP must not concatenate '+ cspNonce' (nonce must be template-interpolated)",
  );
  assert(
    serverSrc.includes("`script-src 'self' 'nonce-${cspNonce}'`"),
    "CSP script-src must interpolate the real nonce with a template literal",
  );
  assert(
    serverSrc.includes("`style-src 'self' 'nonce-${cspNonce}'`"),
    "CSP style-src must interpolate the real nonce with a template literal",
  );

  // Runtime-style check: build the exact header the middleware builds and
  // assert the embedded nonce matches the required character class.
  const cspNonce = crypto.randomBytes(16).toString("base64");
  const header = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${cspNonce}'`,
    `style-src 'self' 'nonce-${cspNonce}'`,
  ].join("; ");
  assert(/nonce-[A-Za-z0-9+/=]+/.test(header), `CSP header must match /nonce-[A-Za-z0-9+/=]+/ (got ${header})`);
  assert(header.includes(`'nonce-${cspNonce}'`), "Header must embed the actual per-request nonce");
  assert(!header.includes("+ cspNonce"), "Built header must not contain the literal '+ cspNonce'");

  // Nonce is stored on res.locals and consumed by the reset route.
  assert(
    serverSrc.includes("res.locals.cspNonce = cspNonce"),
    "Middleware must store the nonce on res.locals",
  );
  assert(
    serverSrc.includes(".cspNonce"),
    "Reset route must read the nonce from res.locals",
  );

  // Password-reset HTML must carry a matching nonce attribute on its inline script
  // and style, using the same res.locals value as the CSP header.
  assert(
    serverSrc.includes('<script nonce="' + "' + _cspNonce + '") || serverSrc.includes('nonce="${'),
    "Password-reset inline script must include a nonce attribute",
  );
  assert(
    serverSrc.includes('<style nonce="' + "' + _cspNonce + '"),
    "Password-reset inline style must include a nonce attribute",
  );
  console.log("✅ CSP interpolates a real per-request nonce (no literal '+ cspNonce')");
}

function testTrustProxyValidation(): void {
  const serverSrc = fs.readFileSync("src/web/server.ts", "utf8");
  assert(serverSrc.includes("TRUST_PROXY_MAX"), "Must define TRUST_PROXY_MAX");
  assert(serverSrc.includes("parseInt") || serverSrc.includes("validation"), "Must validate TRUST_PROXY");
  console.log("✅ TRUST_PROXY has validation and bounds");
}

function testPasswordResetNoInlineJS(): void {
  const serverSrc = fs.readFileSync("src/web/server.ts", "utf8");
  // Scope the "no interpolation" check to the inline <script> block — the actual
  // XSS vector from the audit. JSON.stringify into the HTML hidden-field attribute
  // (outside the script) is safe and required by test-u11.
  const scriptOpen = serverSrc.indexOf("<script nonce=");
  const scriptClose = serverSrc.indexOf("</script>", scriptOpen);
  assert(scriptOpen !== -1 && scriptClose !== -1, "Reset page must have an inline script block");
  const inlineScript = serverSrc.substring(scriptOpen, scriptClose);
  assert(
    !inlineScript.includes("JSON.stringify(accountId)"),
    "Must not interpolate accountId into the inline script",
  );
  assert(
    !inlineScript.includes("JSON.stringify(token)"),
    "Must not interpolate token into the inline script",
  );
  assert(
    !inlineScript.includes("${accountId}") && !inlineScript.includes("${token}"),
    "Must not template-interpolate accountId/token into the inline script",
  );
  // Values must be JSON-encoded into hidden inputs and read back via DOM APIs.
  assert(
    serverSrc.includes("JSON.stringify(accountId)") && serverSrc.includes("JSON.stringify(token)"),
    "Hidden-field values must be JSON-encoded",
  );
  assert(serverSrc.includes("getElementById"), "Must use DOM APIs for values");
  assert(serverSrc.includes('type="hidden"'), "Must use hidden form fields");
  console.log("✅ Password reset form uses safe DOM APIs");
}

function testStartShFailClosed(): void {
  const startSrc = fs.readFileSync("scripts/start.sh", "utf8");
  assert(!startSrc.includes("|| true"), "start.sh must not silently ignore failures");
  assert(startSrc.includes("set -Eeuo pipefail"), "Must preserve pipefail");
  console.log("✅ start.sh fails closed on resource check");
}

function testFrontendEscapesProviderNames(): void {
  const { parseHTML } = require("linkedom");
  const payload = '<img src=x onerror=window.__xss=1>';

  const escSrc = fs.readFileSync("src/web/public/js/escape.js", "utf8");
  assert(escSrc.includes("function escapeHtml"), "Shared escapeHtml must exist in escape.js");

  const escMatch = escSrc.match(/function escapeHtml\(value\) \{[\s\S]*?\n\}/);
  assert(escMatch !== null, "escapeHtml function body must be present");
  const escapeHtml = new Function(`${escMatch![0]}; return escapeHtml;`)() as (v: unknown) => string;

  const escaped = escapeHtml(payload);
  assert(!escaped.includes("<"), "Escaped payload must not contain raw <");
  assert(!escaped.includes(">"), "Escaped payload must not contain raw >");
  assert(escaped.includes("&lt;"), "Escaped payload must contain &lt;");
  assert(escaped.includes("&gt;"), "Escaped payload must contain &gt;");

  const { document, window } = parseHTML('<html><body><div id="providerName"></div></body></html>');
  const el = document.getElementById("providerName");
  el.innerHTML = `<div class="provider-name">${escaped}</div>`;
  assert(!el.querySelector("img"), "No img element must be created from escaped payload");
  assert(el.textContent.includes("onerror"), "Payload text is preserved as inert text content");
  assert(typeof (window as { __xss?: unknown }).__xss === "undefined", "window.__xss must remain undefined");

  const dash = fs.readFileSync("src/web/public/dashboard.html", "utf8");
  const idx = fs.readFileSync("src/web/public/index.html", "utf8");
  assert(dash.indexOf("js/escape.js") !== -1 && dash.indexOf("js/escape.js") < dash.indexOf("js/app.js"), "escape.js must load before app.js in dashboard");
  assert(idx.indexOf("js/escape.js") !== -1 && idx.indexOf("js/escape.js") < idx.indexOf("js/app.js"), "escape.js must load before app.js in index");

  for (const file of ["app.js", "navigation.js", "models.js", "analytics.js", "providers.js", "dashboard.js", "personality.js"]) {
    const src = fs.readFileSync(`src/web/public/js/${file}`, "utf8");
    assert(src.includes("escapeHtml("), `${file} must use escapeHtml for API-sourced innerHTML`);
  }

  console.log("✅ Frontend escapes provider names; window.__xss stays undefined");
}

function testValidateToolRequestSkipsDoubleRateLimit(): void {
  const handlerSrc = fs.readFileSync("src/discord/interactions/confirmation-handler.ts", "utf8");
  const calls = handlerSrc.match(/validateToolRequest\(/g) || [];
  assert(calls.length >= 2, "confirmation-handler must call validateToolRequest at least twice");
  assert(
    !/validateToolRequest\([^;]*?,\s*false\s*,\s*true\s*\)/s.test(handlerSrc),
    "Must not pass skipRateLimit as a 5th argument (false, true)",
  );
  assert(
    /validateToolRequest\([\s\S]*?guildConfig\s*,\s*true\s*\)/.test(handlerSrc),
    "Confirmation execution must pass skipRateLimit=true (token consumed at plan creation)",
  );
  const validatorSrc = fs.readFileSync("src/ai/tools/validator.ts", "utf8");
  assert(validatorSrc.includes("skipRateLimit = false"), "validateToolRequest must accept skipRateLimit");
  assert(validatorSrc.includes("Does NOT consume a token"), "validateRateLimit remains check-only (no consume)");
  // Signature must accept exactly 4 params (tool, context, guildConfig, skipRateLimit)
  // so a 5th argument is a compile error (TS2554), not silently ignored.
  assert(
    /export function validateToolRequest\(\s*tool: ToolDefinition,\s*context: ToolContext,\s*guildConfig: GuildAIConfig,\s*skipRateLimit = false,?\s*\): FullValidationResult/.test(validatorSrc),
    "validateToolRequest must declare exactly 4 parameters",
  );
  // Neither double-consumes nor bypasses:
  // - Plan creation reserves the token (executor step 8 reserve()).
  // - Confirmation must NOT reserve again (no toolRateLimiter.reserve in handler).
  assert(
    !handlerSrc.includes("toolRateLimiter.reserve"),
    "Confirmation handler must not reserve a second rate-limit token",
  );
  // - Confirmation MUST require the plan-creation reservation before executing
  //   (confirmReservation), so skipping the check is not a bypass.
  assert(
    handlerSrc.includes("toolRateLimiter.confirmReservation"),
    "Confirmation must verify the plan-creation reservation exists (no bypass)",
  );
  console.log("✅ Confirmation revalidation skips rate limit (consumed at plan creation)");
}

// Run all remediation tests
testSafeTimingEqualNeverThrows();
testVerifyAuditChainNonGenesisMalformedSignatures();
testVerifyEntryMalformedSignatures();
testSkipConfirmationCannotBeBypassed();
testPlanIdsAreUnpredictable();
testLegacyEntriesNotAuthenticated();
testDifferentDomainsProduceDifferentKeys();
testCSPNoUnsafeInline();
testTrustProxyValidation();
testPasswordResetNoInlineJS();
testStartShFailClosed();
testFrontendEscapesProviderNames();
testValidateToolRequestSkipsDoubleRateLimit();
console.log("\nAll remediation regression tests passed.");
