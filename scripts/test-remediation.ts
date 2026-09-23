/* ================================================================
 * FINAL PRODUCTION REMEDIATION REGRESSION TESTS
 *
 * Covers:
 * 1. Support API uses real SupportCaseManager methods + guild isolation
 * 2. Automation rules persist via DB (create/list/update/delete)
 * 3. Model discovery returns authoritative provider models
 * 4. Provider async mutations are awaitable (Promise-returning)
 * 5. Trusted-local policy for Ollama vs public-only for other protocols
 * 6. Provider runtime state machine transitions
 * 7. Dashboard mutation route security markers (source-level)
 * 8. CI npm audit gate is blocking (source-level)
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

/* ================================================================
 * 1. SUPPORT API — real methods + guild isolation
 * ================================================================ */

function testSupportApiContract(): void {
  console.log("\n🎫 Support API contract");

  const serverPath = path.resolve("src/web/server.ts");
  const serverSrc = fs.readFileSync(serverPath, "utf8");

  assert(serverSrc.includes("manager.getGuildCases"), "GET support uses getGuildCases (real method)");
  assert(!serverSrc.includes("manager.getCases"), "GET support does not call nonexistent getCases");
  assert(serverSrc.includes("manager.transitionCase"), "PUT support uses transitionCase (real method)");
  assert(!serverSrc.includes("manager.updateCaseStatus"), "PUT support does not call nonexistent updateCaseStatus");
  assert(serverSrc.includes("supportCase.guildId !== guildId"), "PUT support verifies case belongs to guild (IDOR)");
  assert(
    serverSrc.includes('/support/:caseId', ) && /app\.put\("\/api\/guilds\/:guildId\/support\/:caseId",\s*requireAuth,\s*requireRole\("admin"\),\s*requireCsrf/.test(serverSrc),
    "PUT support requires admin role + CSRF",
  );
  assert(
    serverSrc.includes('app.get("/api/guilds/:guildId/support/:caseId"'),
    "GET single support case route exists",
  );

  // Real manager methods exist
  const caseManagerSrc = fs.readFileSync(path.resolve("src/support/case-manager.ts"), "utf8");
  assert(caseManagerSrc.includes("getGuildCases("), "SupportCaseManager has getGuildCases");
  assert(caseManagerSrc.includes("transitionCase("), "SupportCaseManager has transitionCase");
  assert(caseManagerSrc.includes("getCase("), "SupportCaseManager has getCase");

  // Runtime: getGuildCases + transition work against DB
  const { SupportCaseManager } = require("../src/support/case-manager");
  const { canTransition } = require("../src/support/types");
  const manager = new SupportCaseManager();
  const guildId = `remediation_${Date.now()}`;
  const created = manager.createCase({
    guildId,
    channelId: "ch_remediation",
    type: "support",
    creatorId: "user_remediation",
    summary: "Regression case",
  });
  assert(!!created, "createCase succeeds");
  if (created) {
    const listed = manager.getGuildCases(guildId);
    assert(listed.some((c: any) => c.id === created.id), "getGuildCases returns created case");
    const otherGuild = manager.getGuildCases(`${guildId}_other`);
    assert(!otherGuild.some((c: any) => c.id === created.id), "getGuildCases isolates guilds");
    assert(canTransition(created.status, "investigating"), "open → investigating is valid");
    const updated = manager.transitionCase(created.id, "investigating", "tester");
    assertEqual(updated?.status, "investigating", "transitionCase applies status");
    const bad = manager.transitionCase(created.id, "closed", "tester");
    assertEqual(bad, null, "invalid transition rejected (investigating→closed returns null)");
    const still = manager.getCase(created.id);
    assertEqual(still?.status, "investigating", "status unchanged after invalid transition");
  }
}

/* ================================================================
 * 2. AUTOMATION PERSISTENCE
 * ================================================================ */

function testAutomationPersistence(): void {
  console.log("\n⚙️ Automation rule persistence");

  const serverPath = path.resolve("src/web/server.ts");
  const serverSrc = fs.readFileSync(serverPath, "utf8");

  assert(serverSrc.includes("createAutomationRule"), "POST automation uses createAutomationRule");
  assert(serverSrc.includes("deleteAutomationRule"), "DELETE automation uses deleteAutomationRule");
  assert(serverSrc.includes("updateAutomationRule"), "PUT automation uses updateAutomationRule");
  assert(
    !serverSrc.includes('id: "automation_" + Date.now()'),
    "POST automation no longer returns fake in-memory id",
  );
  assert(
    !/app\.delete\("\/api\/guilds\/:guildId\/automation\/rules\/:ruleId".*_req: Request, res: Response\) => \{\s*res\.json\(\{ ok: true \}\);/s.test(serverSrc),
    "DELETE automation no longer no-ops",
  );

  // Module exists and is importable
  const automationMod = require("../src/community/automation");
  assert(typeof automationMod.getAutomationRules === "function", "getAutomationRules exported");
  assert(typeof automationMod.createAutomationRule === "function", "createAutomationRule exported");
  assert(typeof automationMod.deleteAutomationRule === "function", "deleteAutomationRule exported");

  const guildId = `auto_guild_${Date.now()}`;
  const rule = automationMod.createAutomationRule(
    {
      guildId,
      name: "Welcome ping",
      triggerType: "member_join",
      triggerConfig: { channel: "general" },
      conditions: [],
      actions: [{ type: "send_message", content: "Welcome!" }],
      createdBy: "tester",
    },
    "tester",
    "tester",
  );
  assert(!!rule.id, "rule has persistent id");
  assert(rule.id.startsWith("rule_"), "rule id uses rule_ prefix (not timestamp fake)");

  const listed = automationMod.getAutomationRules(guildId);
  assert(listed.some((r: any) => r.id === rule.id), "list returns created rule");

  const updated = automationMod.updateAutomationRule(
    guildId,
    rule.id,
    { enabled: false, name: "Welcome ping v2" },
    "tester",
    "tester",
  );
  assertEqual(updated?.enabled, false, "rule update persists enabled=false");
  assertEqual(updated?.name, "Welcome ping v2", "rule update persists name");

  // Cross-guild delete must fail (IDOR)
  const otherDelete = automationMod.deleteAutomationRule(`${guildId}_x`, rule.id, "tester", "tester");
  assertEqual(otherDelete, false, "cross-guild delete rejected");

  const deleted = automationMod.deleteAutomationRule(guildId, rule.id, "tester", "tester");
  assertEqual(deleted, true, "owner-guild delete succeeds");
  assert(
    !automationMod.getAutomationRules(guildId).some((r: any) => r.id === rule.id),
    "deleted rule no longer listed",
  );
}

/* ================================================================
 * 3. MODEL DISCOVERY
 * ================================================================ */

function testModelDiscovery(): void {
  console.log("\n🔎 Model discovery");

  const serverPath = path.resolve("src/web/server.ts");
  const serverSrc = fs.readFileSync(serverPath, "utf8");
  assert(
    serverSrc.includes("providerService.getAllDiscoveredModels()"),
    "models endpoint uses providerService.getAllDiscoveredModels",
  );
  assert(
    !serverSrc.includes("const runtime = { enabled: true, models: [] }"),
    "models endpoint no longer hardcodes empty runtime.models",
  );

  const { providerService } = require("../src/ai/providers/platform/provider-service");
  const { providerRepo } = require("../src/ai/providers/platform/provider-repo");

  const models = providerService.getAllDiscoveredModels();
  assert(Array.isArray(models), "getAllDiscoveredModels returns array");

  // Seed a provider + model and verify discovery reflects it
  const pid = `disc_${Date.now()}`;
  providerRepo.create({
    id: pid,
    name: `disc-provider-${Date.now()}`,
    displayName: "Discovery Provider",
    providerType: "custom",
    protocol: "openai_compatible",
    endpoint: "https://api.example.com/v1",
    enabled: false,
    priority: 200,
    defaultModel: undefined,
    timeoutMs: 5000,
    retryMaxAttempts: 1,
    metadata: {},
  } as any);
  providerRepo.upsertModel({
    providerId: pid,
    modelId: "test-model-a",
    displayName: "Test Model A",
    capabilities: ["chat"],
    enabled: true,
    priority: 100,
    isDefault: true,
  });

  const discovered = providerService.getAllDiscoveredModels();
  const mine = discovered.filter((m: any) => m.providerId === pid);
  assertEqual(mine.length, 1, "discovered models include seeded provider model");
  assertEqual(mine[0]?.modelId, "test-model-a", "modelId correct");
  assertEqual(mine[0]?.isDefault, true, "isDefault correct");

  providerRepo.delete(pid); // cascades models via FK... actually FK is ON DELETE CASCADE on provider_models
}

/* ================================================================
 * 4. PROVIDER ASYNC MUTATIONS
 * ================================================================ */

function testProviderAsyncMutations(): void {
  console.log("\n⚡ Provider async mutations");

  const serverPath = path.resolve("src/web/server.ts");
  const serverSrc = fs.readFileSync(serverPath, "utf8");

  // PUT/DELETE/toggle must await service promises
  const putIdx = serverSrc.indexOf('app.put("/api/providers/manage/:id"');
  assert(putIdx >= 0, "PUT provider route exists");
  const putSlice = serverSrc.slice(putIdx, putIdx + 4500);
  assert(putSlice.includes("await providerService.updateProvider"), "PUT provider awaits updateProvider");
  assert(putSlice.includes("async ("), "PUT provider handler is async");

  const delIdx = serverSrc.indexOf('app.delete("/api/providers/manage/:id"');
  assert(delIdx >= 0, "DELETE provider route exists");
  const delSlice = serverSrc.slice(delIdx, delIdx + 500);
  assert(delSlice.includes("await providerService.deleteProvider"), "DELETE provider awaits deleteProvider");
  assert(delSlice.includes("async ("), "DELETE provider handler is async");

  const toggleIdx = serverSrc.indexOf('app.post("/api/providers/manage/:id/toggle"');
  assert(toggleIdx >= 0, "TOGGLE provider route exists");
  const toggleSlice = serverSrc.slice(toggleIdx, toggleIdx + 700);
  assert(toggleSlice.includes("await providerService.toggleProvider"), "TOGGLE provider awaits toggleProvider");
  assert(toggleSlice.includes("async ("), "TOGGLE provider handler is async");

  const { providerService } = require("../src/ai/providers/platform/provider-service");
  const toggleResult = providerService.toggleProvider("missing", true, "u", "n");
  assert(toggleResult instanceof Promise || typeof (toggleResult as any)?.then === "function",
    "providerService.toggleProvider returns a Promise");
  // swallow expected rejection
  (toggleResult as Promise<void>).catch(() => {});
}

/* ================================================================
 * 5. TRUSTED-LOCAL PROVIDER POLICY (SSRF boundary)
 * ================================================================ */

function testTrustedLocalPolicy(): void {
  console.log("\n🛡️ Trusted-local provider policy");

  const {
    validateOutboundUrl,
    validateTrustedLocalProviderUrl,
  } = require("../src/security/network-boundary");
  const { isSafeEndpoint, isSafeEndpointForProtocol } =
    require("../src/ai/providers/platform/connection-tester");

  // Default policy still blocks loopback
  assertEqual(validateOutboundUrl("http://localhost:11434").valid, false, "default policy blocks localhost");
  assertEqual(isSafeEndpoint("http://localhost:11434"), false, "isSafeEndpoint still blocks localhost");

  // Ollama/trusted-local allows loopback
  assertEqual(validateTrustedLocalProviderUrl("http://localhost:11434").valid, true, "trusted-local allows localhost Ollama");
  assertEqual(validateTrustedLocalProviderUrl("http://127.0.0.1:11434").valid, true, "trusted-local allows 127.0.0.1");
  assertEqual(validateTrustedLocalProviderUrl("http://192.168.1.10:11434").valid, true, "trusted-local allows RFC1918");
  assertEqual(isSafeEndpointForProtocol("http://localhost:11434", "ollama"), true, "ollama protocol allows localhost");
  assertEqual(isSafeEndpointForProtocol("http://localhost:11434", "openai_compatible"), false, "openai still blocks localhost");

  // Still fail-closed on metadata / link-local / non-HTTP
  assertEqual(validateTrustedLocalProviderUrl("http://169.254.169.254/").valid, false, "trusted-local blocks metadata IP");
  assertEqual(validateTrustedLocalProviderUrl("http://metadata.google.internal/").valid, false, "trusted-local blocks metadata hostname");
  assertEqual(validateTrustedLocalProviderUrl("file:///etc/passwd").valid, false, "trusted-local blocks file://");
  assertEqual(validateTrustedLocalProviderUrl("ftp://127.0.0.1/").valid, false, "trusted-local blocks ftp://");
  assertEqual(validateTrustedLocalProviderUrl("http://user:pass@localhost/").valid, false, "trusted-local blocks credentials in URL");
  assertEqual(validateTrustedLocalProviderUrl("http://[fe80::1]/").valid, false, "trusted-local blocks link-local IPv6");
  assertEqual(validateTrustedLocalProviderUrl("http://0.0.0.0:8080/").valid, false, "trusted-local blocks 0.0.0.0");

  // Dynamic adapter validates endpoints
  const adapterSrc = fs.readFileSync(path.resolve("src/ai/providers/platform/provider-adapter.ts"), "utf8");
  assert(adapterSrc.includes("assertSafeProviderEndpoint"), "provider-adapter validates endpoints");
  assert(adapterSrc.includes("redirect: \"manual\""), "provider-adapter uses redirect: manual");
  assert(adapterSrc.includes("validateTrustedLocalProviderUrl"), "provider-adapter uses trusted-local for local providers");
}

/* ================================================================
 * 6. PROVIDER RUNTIME STATE MACHINE
 * ================================================================ */

function testRuntimeStateMachine(): void {
  console.log("\n🔁 Provider runtime state machine");

  const {
    canTransitionState,
  } = require("../src/ai/providers/platform/provider-runtime-manager");

  assertEqual(canTransitionState("idle", "starting"), true, "idle → starting allowed");
  assertEqual(canTransitionState("starting", "running"), true, "starting → running allowed");
  assertEqual(canTransitionState("starting", "quarantined"), true, "starting → quarantined allowed");
  assertEqual(canTransitionState("running", "quarantined"), true, "running → quarantined allowed");
  assertEqual(canTransitionState("running", "disabled"), true, "running → disabled allowed");
  assertEqual(canTransitionState("disabled", "starting"), true, "disabled → starting allowed");
  assertEqual(canTransitionState("closed" as any, "running"), false, "unknown state rejected");
  assertEqual(canTransitionState("disabled", "running"), false, "disabled → running illegal (must go through starting)");
  assertEqual(canTransitionState("idle", "running"), false, "idle → running illegal (must go through starting)");
  assertEqual(canTransitionState("quarantined", "running"), false, "quarantined → running illegal (must re-start)");
}

/* ================================================================
 * 7. DASHBOARD MUTATION SECURITY MARKERS
 * ================================================================ */

function testDashboardMutationSecurity(): void {
  console.log("\n🔐 Dashboard mutation security markers");

  const serverSrc = fs.readFileSync(path.resolve("src/web/server.ts"), "utf8");

  // Support mutation
  assert(
    /app\.put\("\/api\/guilds\/:guildId\/support\/:caseId",\s*requireAuth,\s*requireRole\("admin"\),\s*requireCsrf,\s*requireGuildAuth/.test(serverSrc),
    "support PUT has auth+role+csrf+guild",
  );

  // Automation mutations already owner+csrf — verify present
  assert(
    /app\.post\("\/api\/guilds\/:guildId\/automation\/rules",\s*requireAuth,\s*requireRole\("owner"\),\s*requireCsrf,\s*requireGuildAuth/.test(serverSrc),
    "automation POST has owner+csrf",
  );
  assert(
    /app\.delete\("\/api\/guilds\/:guildId\/automation\/rules\/:ruleId",\s*requireAuth,\s*requireRole\("owner"\),\s*requireCsrf,\s*requireGuildAuth/.test(serverSrc),
    "automation DELETE has owner+csrf",
  );

  // Support GET does not leak other guilds (route scoped + IDOR check on single-case)
  assert(serverSrc.includes("supportCase.guildId !== guildId"), "single case fetch checks guild ownership");

  // Provider health probe should require CSRF for POST mutation-ish endpoint
  const healthIdx = serverSrc.indexOf('app.post("/api/providers/:id/health"');
  if (healthIdx >= 0) {
    const slice = serverSrc.slice(healthIdx, healthIdx + 200);
    assert(slice.includes("requireCsrf"), "provider health POST requires CSRF");
  } else {
    fail("provider health POST route missing");
  }

  // Async provider mutations keep CSRF
  assert(
    /app\.put\("\/api\/providers\/manage\/:id",\s*requireAuth,\s*requireRole\("owner"\),\s*requireCsrf/.test(serverSrc),
    "provider PUT keeps owner+csrf",
  );

  // Dashboard mutation hardening markers (security audit follow-up)
  assert(serverSrc.includes("function isPlainObject"), "mutation body helpers present");
  assert(serverSrc.includes("providerErrorStatus"), "provider not-found maps to 404");
  assert(serverSrc.includes('app.post("/api/seraph/doctor"'), "seraph doctor is POST+CSRF (no mutating GET)");
  assert(!serverSrc.includes('app.get("/api/seraph/doctor"'), "no mutating GET seraph doctor");
  assert(serverSrc.includes("VALID_ADMIN_ACTIONS"), "actions/execute validates AdminAction enum");
  assert(serverSrc.includes("providerService.toggleProvider"), "provider actions perform real toggle");
  const sessionRevokeIdx = serverSrc.indexOf('app.post("/api/security/sessions/:id/revoke"');
  if (sessionRevokeIdx >= 0) {
    const slice = serverSrc.slice(sessionRevokeIdx, sessionRevokeIdx + 1800);
    assert(slice.includes("recordAudit"), "security session revoke is audited");
    assert(slice.includes("startsWith"), "security session revoke matches by prefix only");
  } else {
    fail("security session revoke route missing");
  }
}

/* ================================================================
 * 8. CI AUDIT GATE
 * ================================================================ */

function testCiAuditGate(): void {
  console.log("\n🔒 CI npm audit gate");

  const ciPath = path.resolve(".github/workflows/ci.yml");
  const ci = fs.readFileSync(ciPath, "utf8");

  assert(ci.includes("npm audit --omit=dev --audit-level=high"), "audit uses --audit-level=high");

  const auditIdx = ci.indexOf("npm audit --omit=dev --audit-level=high");
  assert(auditIdx >= 0, "audit command present");

  // Extract the audit step block: from its name line to the next "name:" step or EOF
  const stepStart = ci.lastIndexOf("- name:", auditIdx);
  const nextStep = ci.indexOf("\n      - name:", auditIdx);
  const stepBlock = ci.slice(stepStart, nextStep === -1 ? ci.length : nextStep);

  assert(stepBlock.includes("npm audit --omit=dev --audit-level=high"), "audit command is in its step block");
  assert(!stepBlock.includes("continue-on-error: true"), "audit gate does not use continue-on-error");
  assert(stepBlock.includes("exit 1") || ci.includes('echo "❌ npm audit found'), "audit gate fails CI on high/critical");
}

/* ================================================================
 * RUN
 * ================================================================ */

function main(): void {
  console.log("=== Final Production Remediation Regression Tests ===");

  try { testSupportApiContract(); } catch (e) { fail("Support API contract crashed", e); }
  try { testAutomationPersistence(); } catch (e) { fail("Automation persistence crashed", e); }
  try { testModelDiscovery(); } catch (e) { fail("Model discovery crashed", e); }
  try { testProviderAsyncMutations(); } catch (e) { fail("Provider async mutations crashed", e); }
  try { testTrustedLocalPolicy(); } catch (e) { fail("Trusted-local policy crashed", e); }
  try { testRuntimeStateMachine(); } catch (e) { fail("Runtime state machine crashed", e); }
  try { testDashboardMutationSecurity(); } catch (e) { fail("Dashboard mutation security crashed", e); }
  try { testCiAuditGate(); } catch (e) { fail("CI audit gate crashed", e); }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log("\nFailures:");
    for (const f of failures) console.log(`  - ${f}`);
    process.exit(1);
  }
}

main();
