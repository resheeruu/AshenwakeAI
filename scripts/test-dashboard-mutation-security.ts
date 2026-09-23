/* ================================================================
 * DASHBOARD MUTATION SECURITY — REGRESSION TESTS
 *
 * 12 dimensions across every mutation route:
 *  1. Authentication
 *  2. Authorization / roles
 *  3. Guild / resource IDOR
 *  4. CSRF
 *  5. Input validation
 *  6. Provider secrets not exposed
 *  7. Automation mutations
 *  8. Support mutations
 *  9. Health / control mutations (no fake success)
 * 10. Audit logging
 * 11. HTTP status codes
 * 12. Async awaiting of mutations
 * ================================================================ */

import fs from "node:fs";
import path from "node:path";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function pass(name: string): void {
  passed++;
  console.log(`  ✅ ${name}`);
}

function fail(name: string, error?: unknown): void {
  failed++;
  const msg = error instanceof Error ? error.message : String(error);
  failures.push(`${name}: ${msg}`);
  console.log(`  ❌ ${name}: ${msg}`);
}

function assert(condition: boolean, name: string): void {
  if (condition) pass(name);
  else fail(name, "assertion failed");
}

function assertEqual<T>(actual: T, expected: T, name: string): void {
  if (actual === expected) pass(name);
  else fail(name, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function assertNotEqual<T>(actual: T, expected: T, name: string): void {
  if (actual !== expected) pass(name);
  else fail(name, `expected value !== ${JSON.stringify(expected)}`);
}

const serverSrc = fs.readFileSync(path.resolve("src/web/server.ts"), "utf8");
const rolesSrc = fs.readFileSync(path.resolve("src/control/roles.ts"), "utf8");
const automationSrc = fs.readFileSync(path.resolve("src/community/automation.ts"), "utf8");
const controlSrc = fs.readFileSync(path.resolve("src/control/control-service.ts"), "utf8");
const providerServiceSrc = fs.readFileSync(path.resolve("src/ai/providers/platform/provider-service.ts"), "utf8");
const credentialStoreSrc = fs.readFileSync(path.resolve("src/ai/providers/platform/credential-store.ts"), "utf8");

/** Extract a route handler slice starting at a route declaration. */
function routeSlice(declaration: string, length = 3500): string {
  const idx = serverSrc.indexOf(declaration);
  if (idx < 0) return "";
  return serverSrc.slice(idx, idx + length);
}

/* ================================================================
 * 1–4. AUTH / ROLE / GUILD / CSRF MATRIX
 * ================================================================ */

interface RouteSecuritySpec {
  label: string;
  declaration: string;
  mustInclude: string[];
  mustNotInclude?: string[];
  sliceLen?: number;
}

const MUTATION_MATRIX: RouteSecuritySpec[] = [
  // Auth (pre-auth intentional exceptions documented separately)
  { label: "POST /auth/change-password", declaration: 'app.post("/auth/change-password"', mustInclude: ["requireAuth", "requireCsrf"] },
  { label: "POST /auth/mfa/setup", declaration: 'app.post("/auth/mfa/setup"', mustInclude: ["requireAuth", "requireCsrf"] },
  { label: "POST /auth/mfa/verify", declaration: 'app.post("/auth/mfa/verify"', mustInclude: ["requireAuth", "requireCsrf"] },
  { label: "POST /auth/mfa/disable", declaration: 'app.post("/auth/mfa/disable"', mustInclude: ["requireAuth", "requireCsrf"] },
  { label: "POST /auth/mfa/recovery-codes", declaration: 'app.post("/auth/mfa/recovery-codes"', mustInclude: ["requireAuth", "requireCsrf"] },
  { label: "POST /auth/logout", declaration: 'app.post("/auth/logout"', mustInclude: ["requireCsrf"] },

  // Providers
  { label: "POST /api/providers/manage", declaration: 'app.post("/api/providers/manage"', mustInclude: ["requireAuth", 'requireRole("owner")', "requireCsrf"] },
  { label: "PUT /api/providers/manage/:id", declaration: 'app.put("/api/providers/manage/:id"', mustInclude: ["requireAuth", 'requireRole("owner")', "requireCsrf", "await providerService.updateProvider"] },
  { label: "DELETE /api/providers/manage/:id", declaration: 'app.delete("/api/providers/manage/:id"', mustInclude: ["requireAuth", 'requireRole("owner")', "requireCsrf", "await providerService.deleteProvider"] },
  { label: "POST toggle", declaration: 'app.post("/api/providers/manage/:id/toggle"', mustInclude: ["requireAuth", 'requireRole("owner")', "requireCsrf", "await providerService.toggleProvider"] },
  { label: "PUT default-model", declaration: 'app.put("/api/providers/manage/:id/default-model"', mustInclude: ["requireAuth", 'requireRole("owner")', "requireCsrf"] },
  { label: "POST test", declaration: 'app.post("/api/providers/manage/:id/test"', mustInclude: ["requireAuth", 'requireRole("admin")', "requireCsrf", "await providerService.testConnection"] },
  { label: "POST discover-models", declaration: 'app.post("/api/providers/manage/:id/discover-models"', mustInclude: ["requireAuth", 'requireRole("admin")', "requireCsrf", "await providerService.discoverModelsForProvider"] },
  { label: "POST test-connection raw", declaration: 'app.post("/api/providers/test-connection"', mustInclude: ["requireAuth", 'requireRole("admin")', "requireCsrf"] },
  { label: "POST provider health", declaration: 'app.post("/api/providers/:id/health"', mustInclude: ["requireAuth", 'requireRole("admin")', "requireCsrf"] },

  // Guild / settings
  { label: "PUT guild config", declaration: 'app.put("/api/guilds/:guildId",', mustInclude: ["requireAuth", 'requireRole("owner")', "requireCsrf", "requireGuildAuth"] },
  { label: "PUT guild settings", declaration: 'app.put("/api/guilds/:guildId/settings"', mustInclude: ["requireAuth", 'requireRole("owner")', "requireCsrf", "requireGuildAuth"] },
  { label: "PUT personality", declaration: 'app.put("/api/guilds/:guildId/personality"', mustInclude: ["requireAuth", 'requireRole("owner")', "requireCsrf", "requireGuildAuth"] },
  { label: "PUT moderation", declaration: 'app.put("/api/guilds/:guildId/moderation"', mustInclude: ["requireAuth", 'requireRole("owner")', "requireCsrf", "requireGuildAuth"] },
  { label: "PUT ai", declaration: 'app.put("/api/guilds/:guildId/ai"', mustInclude: ["requireAuth", 'requireRole("owner")', "requireCsrf", "requireGuildAuth"] },
  { label: "PUT ai/routing", declaration: 'app.put("/api/guilds/:guildId/ai/routing"', mustInclude: ["requireAuth", 'requireRole("owner")', "requireCsrf", "requireGuildAuth"] },
  { label: "PUT ai/limits", declaration: 'app.put("/api/guilds/:guildId/ai/limits"', mustInclude: ["requireAuth", 'requireRole("owner")', "requireCsrf", "requireGuildAuth"] },
  { label: "PUT models", declaration: 'app.put("/api/guilds/:guildId/models"', mustInclude: ["requireAuth", 'requireRole("owner")', "requireCsrf", "requireGuildAuth"] },
  { label: "PUT social config", declaration: 'app.put("/api/guilds/:guildId/social/config"', mustInclude: ["requireAuth", 'requireRole("owner")', "requireCsrf", "requireGuildAuth"] },

  // Actions / control
  { label: "POST actions/confirm", declaration: 'app.post("/api/actions/confirm"', mustInclude: ["requireAuth", 'requireRole("owner")', "requireCsrf"] },
  { label: "POST actions/execute", declaration: 'app.post("/api/actions/execute"', mustInclude: ["requireAuth", 'requireRole("owner")', "requireCsrf", "await executeAction"] },

  // Accounts / sessions / security
  { label: "POST accounts", declaration: 'app.post("/api/accounts",', mustInclude: ["requireAuth", 'requireRole("owner")', "requireCsrf"] },
  { label: "PUT accounts/:id", declaration: 'app.put("/api/accounts/:id"', mustInclude: ["requireAuth", 'requireRole("owner")', "requireCsrf"] },
  { label: "DELETE accounts/:id", declaration: 'app.delete("/api/accounts/:id"', mustInclude: ["requireAuth", 'requireRole("owner")', "requireCsrf"] },
  { label: "POST account session revoke", declaration: 'app.post("/api/account/sessions/:id/revoke"', mustInclude: ["requireAuth", "requireCsrf", "recordAudit"] },
  { label: "POST account revoke-all", declaration: 'app.post("/api/account/sessions/revoke-all"', mustInclude: ["requireAuth", "requireCsrf", "recordAudit"] },
  { label: "POST security session revoke", declaration: 'app.post("/api/security/sessions/:id/revoke"', mustInclude: ["requireAuth", "requireCsrf", "recordAudit"] },
  { label: "POST security revoke-all", declaration: 'app.post("/api/security/sessions/revoke-all"', mustInclude: ["requireAuth", "requireCsrf", "recordAudit"] },
  { label: "POST identities link", declaration: 'app.post("/api/account/identities/:provider/link"', mustInclude: ["requireAuth", "requireCsrf"] },
  { label: "POST identities unlink", declaration: 'app.post("/api/account/identities/:provider/unlink"', mustInclude: ["requireAuth", "requireCsrf", "recordAudit"] },

  // Support
  { label: "PUT support case", declaration: 'app.put("/api/guilds/:guildId/support/:caseId"', mustInclude: ["requireAuth", 'requireRole("admin")', "requireCsrf", "requireGuildAuth", "supportCase.guildId !== guildId"] },

  // Automation
  { label: "POST automation", declaration: 'app.post("/api/guilds/:guildId/automation/rules"', mustInclude: ["requireAuth", 'requireRole("owner")', "requireCsrf", "requireGuildAuth"] },
  { label: "PUT automation", declaration: 'app.put("/api/guilds/:guildId/automation/rules/:ruleId"', mustInclude: ["requireAuth", 'requireRole("owner")', "requireCsrf", "requireGuildAuth", "404"] },
  { label: "DELETE automation", declaration: 'app.delete("/api/guilds/:guildId/automation/rules/:ruleId"', mustInclude: ["requireAuth", 'requireRole("owner")', "requireCsrf", "requireGuildAuth", "404"] },

  // Seraph mutations
  { label: "POST seraph/doctor", declaration: 'app.post("/api/seraph/doctor"', mustInclude: ["requireAuth", 'requireRole("admin")', "requireCsrf"] },
  { label: "POST seraph/investigate", declaration: 'app.post("/api/seraph/investigate"', mustInclude: ["requireAuth", 'requireRole("owner")', "requireCsrf"] },
  { label: "POST seraph/reports/generate", declaration: 'app.post("/api/seraph/reports/generate"', mustInclude: ["requireAuth", 'requireRole("owner")', "requireCsrf"] },
];

function testRouteSecurityMatrix(): void {
  console.log("\n🔐 Route security matrix (auth/role/csrf/guild)");
  for (const spec of MUTATION_MATRIX) {
    const slice = routeSlice(spec.declaration, spec.sliceLen ?? 3500);
    if (!slice) {
      fail(`${spec.label}: route not found`);
      continue;
    }
    for (const marker of spec.mustInclude) {
      assert(slice.includes(marker), `${spec.label} includes ${marker}`);
    }
  }

  // Pre-auth intentional exceptions (must remain rate-limited / generic where applicable)
  assert(serverSrc.includes('app.post("/auth/login"'), "login route exists (pre-auth)");
  assert(serverSrc.includes("loginRateLimiter.check"), "login is rate limited");
  assert(serverSrc.includes('app.post("/auth/forgot-password"'), "forgot-password exists (pre-auth)");
  assert(serverSrc.includes('app.post("/auth/reset-password"'), "reset-password exists (pre-auth)");
  assert(serverSrc.includes('app.post("/auth/mfa/challenge"'), "mfa challenge exists (pre-auth)");
  assert(serverSrc.includes("mfaChallengeLimiter.check"), "mfa challenge is rate limited");

  // No mutating GET for seraph doctor anymore
  assert(!serverSrc.includes('app.get("/api/seraph/doctor"'), "seraph doctor is not a mutating GET");
  assert(serverSrc.includes('app.post("/api/seraph/doctor"'), "seraph doctor is POST+CSRF");
}

/* ================================================================
 * 5. INPUT VALIDATION
 * ================================================================ */

function testInputValidation(): void {
  console.log("\n🧾 Input validation");

  assert(serverSrc.includes("function isPlainObject"), "isPlainObject helper present");
  assert(serverSrc.includes("function optionalBoundedString"), "optionalBoundedString helper present");
  assert(serverSrc.includes("function optionalBoundedNumber"), "optionalBoundedNumber helper present");
  assert(serverSrc.includes("VALID_PROVIDER_PROTOCOLS"), "protocol enum enforced");
  assert(serverSrc.includes("VALID_ADMIN_ACTIONS"), "admin action enum enforced");
  assert(serverSrc.includes("VALID_PROVIDER_TYPES"), "provider type enum enforced");

  const createSlice = routeSlice('app.post("/api/providers/manage"', 8000);
  assert(createSlice.includes("endpoint must be a valid absolute URL"), "create validates endpoint URL");
  assert(createSlice.includes("endpoint must not include credentials"), "create rejects credentials in endpoint URL");
  assert(
    createSlice.includes('optionalBoundedNumber(timeoutMs, "timeoutMs", 1000, 120000)'),
    "create bounds timeoutMs",
  );
  assert(
    createSlice.includes('optionalBoundedNumber(retryMaxAttempts, "retryMaxAttempts", 0, 10, true)'),
    "create bounds retryMaxAttempts as integer",
  );
  assert(createSlice.includes("metadata must be a plain object"), "create validates metadata object");
  assert(createSlice.includes("displayName must be a non-empty string"), "create validates displayName");

  const putSlice = routeSlice('app.put("/api/providers/manage/:id"', 5000);
  assert(putSlice.includes("enabled must be a boolean"), "PUT validates enabled boolean");
  assert(putSlice.includes("providerErrorStatus"), "PUT maps provider errors");
  assert(putSlice.includes("await providerService.updateProvider"), "PUT awaits updateProvider");

  const defaultModelSlice = routeSlice('app.put("/api/providers/manage/:id/default-model"', 1500);
  assert(defaultModelSlice.includes("max 256"), "default-model bounds modelId length");
  assert(defaultModelSlice.includes("invalid characters"), "default-model validates modelId charset");
  assert(defaultModelSlice.includes("providerErrorStatus"), "default-model maps provider errors");

  const testConnSlice = routeSlice('app.post("/api/providers/test-connection"', 2500);
  assert(testConnSlice.includes("Protocol must be one of"), "test-connection validates protocol enum");
  assert(testConnSlice.includes("timeout must be a number between 1000 and 120000"), "test-connection bounds timeout");

  // Guild body shape checks
  assert(
    /app\.put\("\/api\/guilds\/:guildId\/personality"[\s\S]{0,600}isPlainObject\(req\.body\)/.test(serverSrc),
    "personality PUT requires plain object body",
  );
  assert(
    /app\.put\("\/api\/guilds\/:guildId\/models"[\s\S]{0,600}Array\.isArray\(req\.body\)/.test(serverSrc),
    "models PUT requires array body",
  );
  assert(
    /app\.put\("\/api\/guilds\/:guildId\/settings"[\s\S]{0,600}isPlainObject\(req\.body\)/.test(serverSrc),
    "settings PUT requires plain object body",
  );

  // Automation limits
  const autoPost = routeSlice('app.post("/api/guilds/:guildId/automation/rules"', 3500);
  assert(autoPost.includes("description must be a string (max 500 chars)"), "automation description length capped");
  assert(autoPost.includes("conditions must contain at most 50 entries"), "automation conditions size capped");
  assert(autoPost.includes("actions must contain at most 50 entries"), "automation actions size capped");

  const autoPut = routeSlice('app.put("/api/guilds/:guildId/automation/rules/:ruleId"', 4000);
  assert(autoPut.includes("enabled must be a boolean"), "automation PUT validates enabled");
  assert(autoPut.includes("404"), "automation PUT returns 404 for missing rule");

  // Support note length
  const supportPut = routeSlice('app.put("/api/guilds/:guildId/support/:caseId"', 2500);
  assert(supportPut.includes("note must be at most 4000 characters"), "support note length capped");

  // Account update validation
  const accountPut = routeSlice('app.put("/api/accounts/:id"', 2000);
  assert(accountPut.includes("role must be one of"), "account PUT validates role enum");
  assert(accountPut.includes("enabled must be a boolean"), "account PUT validates enabled boolean");
  assert(accountPut.includes("404"), "account PUT returns 404 for missing account");

  // Actions validation
  const executeSlice = routeSlice('app.post("/api/actions/execute"', 4500);
  assert(executeSlice.includes("Valid action required"), "actions/execute validates action enum");
  assert(executeSlice.includes("target must be a string"), "actions/execute validates target type");
}

/* ================================================================
 * 6. PROVIDER SECRETS
 * ================================================================ */

function testProviderSecrets(): void {
  console.log("\n🔑 Provider secrets");

  assert(providerServiceSrc.includes("toStatusView"), "providerService uses toStatusView");
  assert(
    !providerServiceSrc.includes("apiKey: def") && !providerServiceSrc.includes("apiKey: def."),
    "status view does not project definition apiKey",
  );
  assert(!providerServiceSrc.includes("credentialValue"), "status view does not include credentialValue");
  assert(!/return\s*\{[^}]*apiKey\s*:/s.test(providerServiceSrc), "status view return object has no apiKey");
  assert(credentialStoreSrc.includes("encryptCredential") || credentialStoreSrc.includes("createCipher"), "credentials encrypted at rest");
  assert(
    !serverSrc.includes("console.log(body.apiKey") && !serverSrc.includes("logger.info(body.apiKey"),
    "server does not log apiKey from request body",
  );

  // Response path uses getProvider (status view) after create/update
  assert(serverSrc.includes("provider: providerService.getProvider(provider.id)"), "create returns sanitized status view");
  assert(serverSrc.includes("provider: providerService.getProvider(id)"), "update returns sanitized status view");
}

/* ================================================================
 * 7–8. AUTOMATION + SUPPORT PERSISTENCE / IDOR
 * ================================================================ */

function testAutomationAndSupportBehavior(): void {
  console.log("\n⚙️🎫 Automation + support runtime isolation");

  const automationMod = require("../src/community/automation");
  const guildId = `sec_guild_${Date.now()}`;
  const rule = automationMod.createAutomationRule(
    {
      guildId,
      name: "Security rule",
      triggerType: "member_join",
      triggerConfig: {},
      conditions: [],
      actions: [],
      createdBy: "tester",
    },
    "tester",
    "tester",
  );
  assert(!!rule.id, "automation rule created");
  assert(
    automationMod.deleteAutomationRule(`${guildId}_other`, rule.id, "tester", "tester") === false,
    "cross-guild automation delete rejected",
  );
  assert(
    automationMod.updateAutomationRule(`${guildId}_other`, rule.id, { enabled: false }, "t", "t") === undefined,
    "cross-guild automation update rejected",
  );
  automationMod.deleteAutomationRule(guildId, rule.id, "tester", "tester");

  const { SupportCaseManager } = require("../src/support/case-manager");
  const { canTransition } = require("../src/support/types");
  const manager = new SupportCaseManager();
  const sGuild = `sec_support_${Date.now()}`;
  const created = manager.createCase({
    guildId: sGuild,
    channelId: "ch_sec",
    type: "support",
    creatorId: "u1",
    summary: "sec",
  });
  assert(!!created, "support case created");
  if (created) {
    assertEqual(
      manager.getGuildCases(`${sGuild}_other`).some((c: any) => c.id === created.id),
      false,
      "support list isolates guilds",
    );
    assertEqual(canTransition(created.status, "investigating"), true, "valid support transition allowed");
    assertEqual(canTransition(created.status, "closed"), false, "invalid support transition rejected before mutation");
    const updated = manager.transitionCase(created.id, "investigating", "tester");
    assertEqual(updated?.status, "investigating", "support transition persists");
    assertEqual(manager.getCase(created.id)?.status, "investigating", "support status persisted");
  }
}

/* ================================================================
 * 9. HEALTH / CONTROL — NO FAKE SUCCESS
 * ================================================================ */

function testNoFakeSuccess(): void {
  console.log("\n🏥 Health/control no fake success");

  assert(controlSrc.includes("providerService.toggleProvider"), "executeAction performs real provider toggle");
  assert(!/case "provider_disable":[\s\S]{0,300}return \{ success: true, message: `Provider "\$\{request.target\}" disabled/.test(controlSrc),
    "provider_disable no longer fakes success without mutation");

  const executeSlice = routeSlice('app.post("/api/actions/execute"', 5000);
  assert(executeSlice.includes("providerService.toggleProvider"), "actions/execute wires real provider toggle");
  assert(executeSlice.includes("Provider not found"), "provider action returns 404 when missing");

  const healthSlice = routeSlice('app.post("/api/providers/:id/health"', 1200);
  assert(!healthSlice.includes("res.json({ ok: false, error: msg })"), "provider health does not return HTTP 200 on failure");
  assert(healthSlice.includes("502") || healthSlice.includes("404"), "provider health uses 404/502 on failure");

  // Unknown action rejected
  assert(controlSrc.includes("Unknown action"), "unknown control action rejected");
}

/* ================================================================
 * 10. AUDIT LOGGING
 * ================================================================ */

function testAuditLogging(): void {
  console.log("\n📋 Audit logging");

  assert(automationSrc.includes("recordAudit"), "automation create/update/delete audited");
  assert(serverSrc.includes('what: "Session revoked"'), "session revoke audited");
  assert(serverSrc.includes('what: "All sessions revoked"'), "session revoke-all audited");
  assert(serverSrc.includes('what: "MFA enabled"'), "MFA enable audited");
  assert(serverSrc.includes('what: "MFA disabled"'), "MFA disable audited");
  assert(serverSrc.includes('what: "Password reset completed"'), "password reset audited");
  assert(serverSrc.includes("what: `Updated account: ${id}`") || serverSrc.includes("Updated account:"), "account update audited");
  assert(serverSrc.includes("provider via action"), "provider control action audited");
  assert(providerServiceSrc.includes("recordAudit"), "providerService records audit");
}

/* ================================================================
 * 11. STATUS CODES
 * ================================================================ */

function testStatusCodes(): void {
  console.log("\n📊 HTTP status codes");

  assert(serverSrc.includes("function providerErrorStatus"), "providerErrorStatus helper present");
  assert(serverSrc.includes('msg === "Provider not found") return 404'), "provider not found maps to 404");

  for (const decl of [
    'app.put("/api/providers/manage/:id"',
    'app.delete("/api/providers/manage/:id"',
    'app.post("/api/providers/manage/:id/toggle"',
    'app.put("/api/providers/manage/:id/default-model"',
    'app.post("/api/providers/manage/:id/test"',
    'app.post("/api/providers/manage/:id/discover-models"',
  ]) {
    const slice = routeSlice(decl, 5000);
    assert(slice.includes("providerErrorStatus(err)"), `${decl} maps provider errors via providerErrorStatus`);
  }

  const supportPut = routeSlice('app.put("/api/guilds/:guildId/support/:caseId"', 2500);
  assert(supportPut.includes("404"), "support missing case → 404");
  assert(supportPut.includes("409"), "support invalid transition → 409");

  const autoPut = routeSlice('app.put("/api/guilds/:guildId/automation/rules/:ruleId"', 4000);
  assert(autoPut.includes("404"), "automation missing rule → 404");
  const autoDel = routeSlice('app.delete("/api/guilds/:guildId/automation/rules/:ruleId"', 1200);
  assert(autoDel.includes("404"), "automation delete missing rule → 404");
}

/* ================================================================
 * 12. ASYNC AWAITING
 * ================================================================ */

function testAsyncAwaiting(): void {
  console.log("\n⚡ Async awaiting");

  for (const [decl, marker] of [
    ['app.post("/api/providers/manage"', "await providerService.createProvider"],
    ['app.put("/api/providers/manage/:id"', "await providerService.updateProvider"],
    ['app.delete("/api/providers/manage/:id"', "await providerService.deleteProvider"],
    ['app.post("/api/providers/manage/:id/toggle"', "await providerService.toggleProvider"],
    ['app.post("/api/providers/manage/:id/test"', "await providerService.testConnection"],
    ['app.post("/api/providers/manage/:id/discover-models"', "await providerService.discoverModelsForProvider"],
    ['app.post("/api/actions/execute"', "await executeAction"],
  ] as const) {
    const slice = routeSlice(decl, 4500);
    assert(slice.includes("async ("), `${decl} handler is async`);
    assert(slice.includes(marker), `${decl} awaits ${marker}`);
  }

  assert(controlSrc.includes("export async function executeAction"), "executeAction is async");
}

/* ================================================================
 * RUN
 * ================================================================ */

function main(): void {
  console.log("=== Dashboard Mutation Security Tests ===");

  try { testRouteSecurityMatrix(); } catch (e) { fail("route matrix crashed", e); }
  try { testInputValidation(); } catch (e) { fail("input validation crashed", e); }
  try { testProviderSecrets(); } catch (e) { fail("provider secrets crashed", e); }
  try { testAutomationAndSupportBehavior(); } catch (e) { fail("automation/support crashed", e); }
  try { testNoFakeSuccess(); } catch (e) { fail("no-fake-success crashed", e); }
  try { testAuditLogging(); } catch (e) { fail("audit crashed", e); }
  try { testStatusCodes(); } catch (e) { fail("status codes crashed", e); }
  try { testAsyncAwaiting(); } catch (e) { fail("async crashed", e); }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log("\nFailures:");
    for (const f of failures) console.log(`  - ${f}`);
    process.exit(1);
  }
}

main();
