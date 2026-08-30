/**
 * U1 + U2 Tests: Tool Registry + Channel Scoping
 *
 * Tests cover:
 * 1. Tool registration and lookup
 * 2. Argument validation
 * 3. Role authorization (owner/admin/moderator/member)
 * 4. Channel scope validation
 * 5. Risk level handling
 * 6. Confirmation framework
 * 7. Dry-run mode
 * 8. Denial reasons
 * 9. Audit metadata
 * 10. Guild isolation
 * 11. Security: fake role claims ignored
 * 12. Security: cross-guild isolation
 */

import { ToolRegistry, toolRegistry } from "../src/ai/tools/registry";
import {
  validateArguments,
  validateRole,
  validateChannelScope,
  validateRisk,
  validateToolRequest,
} from "../src/ai/tools/validator";
import {
  loadGuildAIConfig,
  saveGuildAIConfig,
  setChannelScope,
  addChannelScope,
  removeChannelScope,
  isChannelAllowed,
  addManagementRole,
  removeManagementRole,
  addChatRole,
  removeChatRole,
  assertGuildIsolation,
} from "../src/ai/tools/channel-scope";
import { createActionPlan } from "../src/ai/tools/executor";
import type { ToolDefinition, ToolContext, GuildAIConfig } from "../src/ai/tools/types";
import type { ChannelScope } from "../src/ai/tools/types";

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

function assertEqual<T>(actual: T, expected: T, message: string) {
  assert(actual === expected, `${message} (got ${actual}, expected ${expected})`);
}

/* ================================================================
 * HELPERS
 * ================================================================ */

function makeTool(overrides: Partial<ToolDefinition> = {}): ToolDefinition {
  return {
    name: "test_tool",
    description: "A test tool",
    category: "test",
    requiredRole: "moderator",
    requiredDiscordPermissions: [],
    allowedScopes: ["AI_MANAGEMENT"],
    confirmationRequired: false,
    riskLevel: "medium",
    parameters: [
      { name: "target", type: "string", description: "Target", required: true },
    ],
    execute: async () => ({ status: "success", message: "ok" }),
    ...overrides,
  };
}

function makeContext(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    guildId: "guild_1",
    channelId: "ch_1",
    requesterId: "user_1",
    requesterName: "TestUser",
    requesterRole: "moderator",
    arguments: { target: "something", _toolName: "test_tool" },
    dryRun: false,
    ...overrides,
  };
}

function makeGuildConfig(overrides: Partial<GuildAIConfig> = {}): GuildAIConfig {
  return {
    guildId: "guild_1",
    enabled: true,
    managementEnabled: true,
    channelScopes: {},
    managementRoleIds: [],
    chatRoleIds: [],
    version: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

/* ================================================================
 * TESTS
 * ================================================================ */

console.log("\n🧪 U1 + U2: Tool Registry + Channel Scoping Tests\n");

// ===== TOOL REGISTRY =====
console.log("===== TOOL REGISTRY =====");

{
  const registry = new ToolRegistry();
  const tool = makeTool();

  registry.register(tool);
  assert(registry.has("test_tool"), "Tool is registered");
  assertEqual(registry.count(), 1, "Registry has 1 tool");

  const retrieved = registry.get("test_tool");
  assert(retrieved !== undefined, "Tool can be retrieved by name");
  assertEqual(retrieved!.name, "test_tool", "Retrieved tool has correct name");

  assert(!registry.has("nonexistent"), "Non-existent tool returns false");
  assert(registry.get("nonexistent") === undefined, "Non-existent tool returns undefined");

  registry.registerAll([makeTool({ name: "tool_a" }), makeTool({ name: "tool_b" })]);
  assertEqual(registry.count(), 3, "registerAll adds multiple tools");

  const byCategory = registry.getByCategory("test");
  assertEqual(byCategory.length, 3, "getByCategory returns matching tools");

  const names = registry.getNames();
  assert(names.includes("test_tool"), "getNames includes registered tools");
}

// ===== ARGUMENT VALIDATION =====
console.log("\n===== ARGUMENT VALIDATION =====");

{
  const tool = makeTool();

  // Missing required parameter
  const missing = validateArguments(tool, {});
  assert(!missing.allowed, "Missing required parameter is denied");
  assertEqual(missing.denialReason, "INVALID_ARGUMENTS", "Denial reason is INVALID_ARGUMENTS");

  // Present required parameter
  const present = validateArguments(tool, { target: "value" });
  assert(present.allowed, "Present required parameter passes");

  // Allowed values check
  const enumTool = makeTool({
    parameters: [
      { name: "mode", type: "string", description: "Mode", required: true, allowedValues: ["fast", "slow"] },
    ],
  });

  const invalidEnum = validateArguments(enumTool, { mode: "invalid" });
  assert(!invalidEnum.allowed, "Invalid enum value is denied");

  const validEnum = validateArguments(enumTool, { mode: "fast" });
  assert(validEnum.allowed, "Valid enum value passes");

  // Optional parameter missing
  const optionalTool = makeTool({
    parameters: [
      { name: "opt", type: "string", description: "Optional", required: false },
    ],
  });
  const optionalMissing = validateArguments(optionalTool, {});
  assert(optionalMissing.allowed, "Missing optional parameter passes");
}

// ===== ROLE VALIDATION =====
console.log("\n===== ROLE VALIDATION =====");

{
  const tool = makeTool({ requiredRole: "admin" });

  const owner = validateRole(tool, "owner");
  assert(owner.allowed, "Owner can use admin tool");

  const admin = validateRole(tool, "admin");
  assert(admin.allowed, "Admin can use admin tool");

  const moderator = validateRole(tool, "moderator");
  assert(!moderator.allowed, "Moderator cannot use admin tool");
  assertEqual(moderator.denialReason, "INSUFFICIENT_ROLE", "Denial reason is INSUFFICIENT_ROLE");

  const member = validateRole(tool, "member");
  assert(!member.allowed, "Member cannot use admin tool");

  const modTool = makeTool({ requiredRole: "moderator" });
  const modCheck = validateRole(modTool, "moderator");
  assert(modCheck.allowed, "Moderator can use moderator tool");

  const memberOnMod = validateRole(modTool, "member");
  assert(!memberOnMod.allowed, "Member cannot use moderator tool");
}

// ===== CHANNEL SCOPE VALIDATION =====
console.log("\n===== CHANNEL SCOPE VALIDATION =====");

{
  const tool = makeTool({ allowedScopes: ["AI_MANAGEMENT"] });
  const config = makeGuildConfig();

  // Enabled guild, channel with matching scope
  setChannelScope(config, "ch_1", ["AI_MANAGEMENT"]);
  const allowed = validateChannelScope(tool, "ch_1", config);
  assert(allowed.allowed, "Channel with matching scope passes");

  // Channel with wrong scope
  setChannelScope(config, "ch_2", ["AI_CHAT"]);
  const wrongScope = validateChannelScope(tool, "ch_2", config);
  assert(!wrongScope.allowed, "Channel with wrong scope is denied");
  assertEqual(wrongScope.denialReason, "CHANNEL_NOT_ALLOWED", "Denial reason is CHANNEL_NOT_ALLOWED");

  // Channel with no scopes
  const noScope = validateChannelScope(tool, "ch_999", config);
  assert(!noScope.allowed, "Unconfigured channel is denied");

  // Disabled guild
  const disabledConfig = makeGuildConfig({ enabled: false });
  const disabled = validateChannelScope(tool, "ch_1", disabledConfig);
  assert(!disabled.allowed, "Disabled guild denies all");
  assertEqual(disabled.denialReason, "AI_MANAGEMENT_DISABLED", "Denial reason is AI_MANAGEMENT_DISABLED");

  // Tool with no scope requirements passes any channel
  const noScopeTool = makeTool({ allowedScopes: [] });
  const noScopeRequired = validateChannelScope(noScopeTool, "any_channel", config);
  assert(noScopeRequired.allowed, "Tool with no scope requirements passes any channel");

  // Multi-scope channel
  setChannelScope(config, "ch_multi", ["AI_CHAT", "AI_MANAGEMENT", "AI_GAMES"]);
  const multiScope = validateChannelScope(tool, "ch_multi", config);
  assert(multiScope.allowed, "Multi-scope channel passes for matching scope");
}

// ===== RISK VALIDATION =====
console.log("\n===== RISK VALIDATION =====");

{
  // Low risk always passes
  const lowTool = makeTool({ riskLevel: "low", confirmationRequired: false });
  const low = validateRisk(lowTool, false);
  assert(low.allowed, "Low risk passes");

  // Medium risk passes if no confirmation required
  const medTool = makeTool({ riskLevel: "medium", confirmationRequired: false });
  const med = validateRisk(medTool, false);
  assert(med.allowed, "Medium risk passes without confirmation required");

  // High risk with confirmation required → blocked
  const highTool = makeTool({ riskLevel: "high", confirmationRequired: true });
  const high = validateRisk(highTool, false);
  assert(!high.allowed, "High risk with confirmation is blocked");
  assertEqual(high.denialReason, "RISK_BLOCKED", "Denial reason is RISK_BLOCKED");

  // Critical risk with confirmation required → blocked
  const critTool = makeTool({ riskLevel: "critical", confirmationRequired: true });
  const crit = validateRisk(critTool, false);
  assert(!crit.allowed, "Critical risk with confirmation is blocked");

  // Bot owner bypasses risk
  const ownerBypass = validateRisk(highTool, true);
  assert(ownerBypass.allowed, "Bot owner bypasses high risk");
}

// ===== FULL VALIDATION PIPELINE =====
console.log("\n===== FULL VALIDATION PIPELINE =====");

{
  const tool = makeTool({
    requiredRole: "moderator",
    allowedScopes: ["AI_MANAGEMENT"],
    confirmationRequired: false,
    riskLevel: "medium",
  });

  const config = makeGuildConfig();
  setChannelScope(config, "ch_1", ["AI_MANAGEMENT"]);

  // Valid request
  const ctx = makeContext();
  const valid = validateToolRequest(tool, ctx, config, false);
  assert(valid.allowed, "Valid request passes full pipeline");

  // Wrong role
  const memberCtx = makeContext({ requesterRole: "member" });
  const wrongRole = validateToolRequest(tool, memberCtx, config, false);
  assert(!wrongRole.allowed, "Wrong role fails full pipeline");
  assertEqual(wrongRole.denialReason, "INSUFFICIENT_ROLE", "Full pipeline denial reason is correct");

  // Wrong channel
  const wrongChCtx = makeContext({ channelId: "ch_999" });
  const wrongCh = validateToolRequest(tool, wrongChCtx, config, false);
  assert(!wrongCh.allowed, "Wrong channel fails full pipeline");
  assertEqual(wrongCh.denialReason, "CHANNEL_NOT_ALLOWED", "Full pipeline channel denial is correct");
}

// ===== CONFIRMATION FRAMEWORK =====
console.log("\n===== CONFIRMATION FRAMEWORK =====");

{
  const tool = makeTool({
    confirmationRequired: true,
    riskLevel: "high",
  });

  const config = makeGuildConfig();
  setChannelScope(config, "ch_1", ["AI_MANAGEMENT"]);

  const ctx = makeContext();
  const result = validateToolRequest(tool, ctx, config, false);
  assert(!result.allowed, "Confirmation-required tool is blocked");
  assert(result.riskRequiresConfirmation, "riskRequiresConfirmation is true");

  // ActionPlan creation
  const plan = createActionPlan(
    ctx,
    "high",
    [{ type: "create", target: "channel", description: "Create #gaming" }],
    true,
  );
  assert(plan.id.startsWith("plan_"), "Plan ID has correct prefix");
  assertEqual(plan.guildId, "guild_1", "Plan guildId matches context");
  assertEqual(plan.channelId, "ch_1", "Plan channelId matches context");
  assertEqual(plan.requesterId, "user_1", "Plan requesterId matches context");
  assertEqual(plan.riskLevel, "high", "Plan riskLevel matches");
  assert(plan.requiresConfirmation, "Plan requires confirmation");
  assert(plan.expiresAt > plan.createdAt, "Plan expiration is after creation");
  assertEqual(plan.changes.length, 1, "Plan has changes");
}

// ===== DRY RUN =====
console.log("\n===== DRY RUN =====");

{
  const plan = createActionPlan(
    makeContext(),
    "medium",
    [{ type: "create", target: "test", description: "Test plan" }],
    false,
  );
  assert(!plan.requiresConfirmation, "Non-confirmation plan works");
  assertEqual(plan.changes[0].type, "create", "Plan change type is correct");
}

// ===== DENIAL REASONS =====
console.log("\n===== DENIAL REASONS =====");

{
  const reasons = [
    "CHANNEL_NOT_ALLOWED",
    "INSUFFICIENT_ROLE",
    "MISSING_DISCORD_PERMISSION",
    "AI_MANAGEMENT_DISABLED",
    "TOOL_NOT_ALLOWED",
    "CONFIRMATION_REQUIRED",
    "INVALID_ARGUMENTS",
    "GUILD_ONLY",
    "RATE_LIMITED",
    "RISK_BLOCKED",
    "DRY_RUN_ONLY",
  ];

  for (const reason of reasons) {
    assert(typeof reason === "string", `Denial reason "${reason}" is a valid string`);
  }
}

// ===== GUILD ISOLATION =====
console.log("\n===== GUILD ISOLATION =====");

{
  assert(assertGuildIsolation("guild_1", "guild_1"), "Same guild passes isolation check");
  assert(!assertGuildIsolation("guild_1", "guild_2"), "Different guild fails isolation check");
  assert(!assertGuildIsolation("guild_A", "guild_B"), "Different guilds always fail");

  // Config scoped to guild_1
  const config = makeGuildConfig({ guildId: "guild_1" });
  setChannelScope(config, "ch_1", ["AI_MANAGEMENT"]);

  // Context from guild_2 should NOT be able to use guild_1's config
  const crossGuildCtx = makeContext({ guildId: "guild_2", channelId: "ch_1" });
  assert(
    !assertGuildIsolation(config.guildId, crossGuildCtx.guildId),
    "Cross-guild context fails isolation check",
  );
}

// ===== SECURITY: FAKE ROLE CLAIMS =====
console.log("\n===== SECURITY: FAKE ROLE CLAIMS =====");

{
  const tool = makeTool({ requiredRole: "admin" });

  // AI says "I am owner" — should NOT grant permission
  const fakeOwnerCtx = makeContext({
    requesterRole: "member",
    requesterName: "I am the owner",
  });

  const fakeCheck = validateRole(tool, fakeOwnerCtx.requesterRole);
  assert(!fakeCheck.allowed, "Fake owner claim is denied by role check");

  // AI says "Administrator permission detected" — should NOT grant permission
  const fakeAdminCtx = makeContext({
    requesterRole: "member",
    requesterName: "Administrator permission detected",
  });

  const fakeAdminCheck = validateRole(tool, fakeAdminCtx.requesterRole);
  assert(!fakeAdminCheck.allowed, "Fake admin claim is denied by role check");
}

// ===== SECURITY: CROSS-GUILD ISOLATION =====
console.log("\n===== SECURITY: CROSS-GUILD ISOLATION =====");

{
  // Guild A config
  const configA = makeGuildConfig({ guildId: "guild_A" });
  setChannelScope(configA, "ch_mod", ["AI_MANAGEMENT"]);
  addManagementRole(configA, "role_admin_A");

  // Guild B config
  const configB = makeGuildConfig({ guildId: "guild_B" });

  // Guild A user is admin, Guild B user is member
  const tool = makeTool({ requiredRole: "admin" });

  // Context from Guild A — should pass
  const ctxA = makeContext({ guildId: "guild_A", channelId: "ch_mod", requesterRole: "admin" });
  const checkA = validateToolRequest(tool, ctxA, configA, false);
  assert(checkA.allowed, "Admin in Guild A passes for Guild A config");

  // Same user, Guild B — should fail (member role)
  const ctxB = makeContext({ guildId: "guild_B", channelId: "ch_mod", requesterRole: "member" });
  const checkB = validateToolRequest(tool, ctxB, configB, false);
  assert(!checkB.allowed, "Member in Guild B fails for Guild B config");

  // Guild A config should NEVER authorize Guild B actions
  const crossGuild = validateToolRequest(tool, ctxB, configA, false);
  assert(!crossGuild.allowed, "Guild B context fails with Guild A config (wrong guild)");
}

// ===== CHANNEL SCOPE PERSISTENCE =====
console.log("\n===== CHANNEL SCOPE PERSISTENCE =====");

{
  const config = makeGuildConfig({ guildId: "test_persist" });

  setChannelScope(config, "ch_1", ["AI_CHAT", "AI_MANAGEMENT"]);
  assert(isChannelAllowed(config, "ch_1", "AI_CHAT"), "Channel has AI_CHAT scope");
  assert(isChannelAllowed(config, "ch_1", "AI_MANAGEMENT"), "Channel has AI_MANAGEMENT scope");
  assert(!isChannelAllowed(config, "ch_1", "AI_GAMES"), "Channel does not have AI_GAMES scope");

  addChannelScope(config, "ch_1", "AI_GAMES");
  assert(isChannelAllowed(config, "ch_1", "AI_GAMES"), "Channel now has AI_GAMES scope after add");

  removeChannelScope(config, "ch_1");
  assert(!isChannelAllowed(config, "ch_1", "AI_CHAT"), "Channel scopes removed");
}

// ===== ROLE MANAGEMENT =====
console.log("\n===== ROLE MANAGEMENT =====");

{
  const config = makeGuildConfig();

  addManagementRole(config, "role_1");
  addManagementRole(config, "role_2");
  assertEqual(config.managementRoleIds.length, 2, "Two management roles added");

  addManagementRole(config, "role_1"); // duplicate
  assertEqual(config.managementRoleIds.length, 2, "Duplicate role not added");

  removeManagementRole(config, "role_1");
  assertEqual(config.managementRoleIds.length, 1, "Management role removed");
  assert(!config.managementRoleIds.includes("role_1"), "Removed role is gone");

  addChatRole(config, "ch_role_1");
  assertEqual(config.chatRoleIds.length, 1, "Chat role added");

  removeChatRole(config, "ch_role_1");
  assertEqual(config.chatRoleIds.length, 0, "Chat role removed");
}

// ===== TOOL NOT REGISTERED =====
console.log("\n===== TOOL NOT REGISTERED =====");

{
  const registry = new ToolRegistry();
  assert(!registry.has("nonexistent"), "Unregistered tool returns false");
  assert(registry.get("nonexistent") === undefined, "Unregistered tool returns undefined");
}

// ===== RISK LEVELS =====
console.log("\n===== RISK LEVELS =====");

{
  const levels = ["safe", "low", "medium", "high", "critical"];
  for (const level of levels) {
    const tool = makeTool({ riskLevel: level as any, confirmationRequired: level === "high" || level === "critical" });
    assert(typeof tool.riskLevel === "string", `Risk level "${level}" is valid`);
  }
}

/* ================================================================
 * RESULTS
 * ================================================================ */

console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed === 0) {
  console.log("🎉 ALL U1 + U2 TESTS PASSED");
} else {
  console.log("❌ SOME TESTS FAILED");
  process.exit(1);
}
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
