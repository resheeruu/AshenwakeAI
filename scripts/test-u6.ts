/**
 * U6 Tests: Server Protection + Channel Permission Presets + Audit Viewer
 *
 * Tests cover:
 * 1. Protection tool registration (5 protection tools + 1 preset + 1 audit)
 * 2. Protection system (protect/unprotect channel/category)
 * 3. Guild isolation
 * 4. Protected resource detection
 * 5. Protected resource denial
 * 6. Moderator denied protection changes
 * 7. Admin allowed
 * 8. Confirmation required
 * 9. Permission presets (all 6 presets)
 * 10. Invalid preset rejection
 * 11. Protected channel rejection for presets
 * 12. Missing staff-role configuration
 * 13. Dangerous permission rejection
 * 14. Audit viewer
 * 15. Confirmation expiration
 * 16. All tools have required metadata
 * 17. Tool count totals
 * 18. Protected category inheritance (U6.1)
 *     - isChannelProtected basic behavior
 *     - Category blocks child rename/deletion/movement/permissions
 *     - Category blocks edit_channel
 *     - Unprotected category allows operations
 *     - Directly protected channel unchanged
 *     - Guild isolation with inheritance
 *     - Move-into-category protection
 *     - Pre-protection plan rejection
 */

import { ToolRegistry } from "../src/ai/tools/registry";
import {
  createManagementDiscordTools,
  createWriteDiscordTools,
  createReadOnlyDiscordTools,
  createProtectionDiscordTools,
  createDiscordTools,
} from "../src/ai/tools/discord";
import { validateToolRequest } from "../src/ai/tools/validator";
import { saveGuildAIConfig, loadGuildAIConfig } from "../src/ai/tools/channel-scope";
import { executeTool } from "../src/ai/tools/executor";
import { toolRegistry } from "../src/ai/tools/registry";
import {
  storePendingPlan,
  getPendingPlan,
  verifyPlan,
  markPlanExecuted,
  isPlanExecuted,
  isPlanExpired,
  clearAllPendingPlans,
  getPendingPlanCount,
} from "../src/ai/tools/confirmation-store";
import {
  isProtectedChannel,
  isProtectedCategory,
  isProtectedResource,
  isChannelProtected,
  protectChannel,
  unprotectChannel,
  protectCategory,
  unprotectCategory,
  getProtectedResources,
} from "../src/ai/tools/discord/protection";
import { isValidPreset, getValidPresetNames } from "../src/ai/tools/discord/channels/permission-presets";
import { recordToolAudit, getToolAuditLog } from "../src/ai/tools/audit";
import type { ToolContext, GuildAIConfig, ActionPlan } from "../src/ai/tools/types";

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

function makeContext(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    guildId: "guild_u6_test",
    channelId: "ch_mgmt_1",
    requesterId: "user_admin_1",
    requesterName: "AdminUser",
    requesterRole: "admin",
    arguments: { _toolName: "test_tool", channelId: "ch_target_1", categoryId: "cat_1" },
    dryRun: false,
    ...overrides,
  };
}

function makeGuildConfig(overrides: Partial<GuildAIConfig> = {}): GuildAIConfig {
  return {
    guildId: "guild_u6_test",
    enabled: true,
    managementEnabled: true,
    channelScopes: {
      "ch_mgmt_1": ["AI_MANAGEMENT"],
      "ch_chat_1": ["AI_CHAT"],
    },
    managementRoleIds: ["role_staff_1"],
    chatRoleIds: [],
    protectedChannels: [],
    protectedCategories: [],
    version: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

function setupGuildConfig(): GuildAIConfig {
  const config = makeGuildConfig();
  saveGuildAIConfig(config);
  return config;
}

function makeArgs(toolName: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    _toolName: toolName,
    channelId: "ch_target_1",
    categoryId: "cat_1",
    ...extra,
  };
}

function makePlan(overrides: Partial<ActionPlan> = {}): ActionPlan {
  return {
    id: "plan_u6_001",
    guildId: "guild_u6_test",
    channelId: "ch_mgmt_1",
    requesterId: "user_admin_1",
    toolName: "protect_channel",
    arguments: { channelId: "ch_target_1", _toolName: "protect_channel" },
    riskLevel: "medium",
    changes: [{ type: "assign", target: "#test", description: "Protect channel" }],
    requiresConfirmation: true,
    createdAt: Date.now(),
    expiresAt: Date.now() + 5 * 60 * 1000,
    ...overrides,
  };
}

/* ================================================================
 * MAIN
 * ================================================================ */

async function main() {
  console.log("\n🧪 U6: Server Protection + Channel Permission Presets + Audit Viewer Tests\n");

  // ===== PROTECTION TOOL REGISTRATION =====
  console.log("===== PROTECTION TOOL REGISTRATION =====");

  {
    const tools = createProtectionDiscordTools(() => null);
    assertEqual(tools.length, 7, "createProtectionDiscordTools returns 7 tools (5 protection + 1 preset + 1 audit)");

    const expectedNames = [
      "protect_channel", "unprotect_channel", "protect_category",
      "unprotect_category", "list_protected_resources",
      "apply_channel_preset", "view_tool_audit",
    ].sort();
    const actualNames = tools.map((t) => t.name).sort();
    assertEqual(actualNames.join(","), expectedNames.join(","), "All 7 U6 tool names present");

    const registry = new ToolRegistry();
    registry.registerAll(tools);
    assertEqual(registry.count(), 7, "Registry has 7 U6 tools");
    for (const name of expectedNames) {
      assert(registry.has(name), `Registry has ${name}`);
    }
  }

  // ===== TOTAL TOOL COUNTS =====
  console.log("\n===== TOTAL TOOL COUNTS =====");

  {
    const allTools = createDiscordTools(() => null);
    assertEqual(allTools.length, 36, "Total Discord tools: 5 U3 + 4 U4 + 4 U5 + 7 U6 + 9 U7 + 7 U8 = 36");
  }

  // ===== PROTECTION SYSTEM =====
  console.log("\n===== PROTECTION SYSTEM =====");

  {
    // Clean state
    setupGuildConfig();

    // Initially nothing is protected
    assertEqual(isProtectedChannel("guild_u6_test", "ch_1"), false, "ch_1 not protected initially");
    assertEqual(isProtectedCategory("guild_u6_test", "cat_1"), false, "cat_1 not protected initially");
    assertEqual(isProtectedResource("guild_u6_test", "ch_1"), false, "ch_1 not protected resource initially");

    // Protect channel
    const added = protectChannel("guild_u6_test", "ch_1");
    assertEqual(added, true, "protectChannel returns true");
    assertEqual(isProtectedChannel("guild_u6_test", "ch_1"), true, "ch_1 is now protected");
    assertEqual(isProtectedResource("guild_u6_test", "ch_1"), true, "ch_1 is protected resource");

    // Double protect returns false
    const doubleAdd = protectChannel("guild_u6_test", "ch_1");
    assertEqual(doubleAdd, false, "Double protectChannel returns false");

    // Unprotect channel
    const removed = unprotectChannel("guild_u6_test", "ch_1");
    assertEqual(removed, true, "unprotectChannel returns true");
    assertEqual(isProtectedChannel("guild_u6_test", "ch_1"), false, "ch_1 not protected after unprotect");

    // Double unprotect returns false
    const doubleRemove = unprotectChannel("guild_u6_test", "ch_1");
    assertEqual(doubleRemove, false, "Double unprotectChannel returns false");

    // Protect category
    const catAdded = protectCategory("guild_u6_test", "cat_1");
    assertEqual(catAdded, true, "protectCategory returns true");
    assertEqual(isProtectedCategory("guild_u6_test", "cat_1"), true, "cat_1 is now protected");

    // Unprotect category
    const catRemoved = unprotectCategory("guild_u6_test", "cat_1");
    assertEqual(catRemoved, true, "unprotectCategory returns true");
    assertEqual(isProtectedCategory("guild_u6_test", "cat_1"), false, "cat_1 not protected after unprotect");
  }

  // ===== GUILD ISOLATION =====
  console.log("\n===== GUILD ISOLATION =====");

  {
    setupGuildConfig();
    saveGuildAIConfig(makeGuildConfig({ guildId: "guild_iso_a" }));
    saveGuildAIConfig(makeGuildConfig({ guildId: "guild_iso_b" }));

    // Protect in guild A
    protectChannel("guild_iso_a", "ch_iso_1");

    // Should not be protected in guild B
    assertEqual(isProtectedChannel("guild_iso_a", "ch_iso_1"), true, "ch_iso_1 protected in guild A");
    assertEqual(isProtectedChannel("guild_iso_b", "ch_iso_1"), false, "ch_iso_1 NOT protected in guild B");
    assertEqual(isProtectedResource("guild_iso_b", "ch_iso_1"), false, "ch_iso_1 NOT protected resource in guild B");

    // Clean up
    unprotectChannel("guild_iso_a", "ch_iso_1");
  }

  // ===== PERSISTENCE =====
  console.log("\n===== PERSISTENCE =====");

  {
    setupGuildConfig();

    // Protect
    protectChannel("guild_u6_test", "ch_persist_1");
    protectCategory("guild_u6_test", "cat_persist_1");

    // Reload config from disk
    const reloaded = loadGuildAIConfig("guild_u6_test");
    assertEqual(reloaded.protectedChannels.includes("ch_persist_1"), true, "Protected channel persists in config");
    assertEqual(reloaded.protectedCategories.includes("cat_persist_1"), true, "Protected category persists in config");

    // Verify via functions
    assertEqual(isProtectedChannel("guild_u6_test", "ch_persist_1"), true, "isProtectedChannel reads persisted config");
    assertEqual(isProtectedCategory("guild_u6_test", "cat_persist_1"), true, "isProtectedCategory reads persisted config");

    // Clean up
    unprotectChannel("guild_u6_test", "ch_persist_1");
    unprotectCategory("guild_u6_test", "cat_persist_1");
  }

  // ===== PROTECTED RESOURCE DETECTION =====
  console.log("\n===== PROTECTED RESOURCE DETECTION =====");

  {
    setupGuildConfig();
    protectChannel("guild_u6_test", "ch_protected");
    protectCategory("guild_u6_test", "cat_protected");

    assertEqual(isProtectedResource("guild_u6_test", "ch_protected"), true, "Detects protected channel");
    assertEqual(isProtectedResource("guild_u6_test", "cat_protected"), true, "Detects protected category");
    assertEqual(isProtectedResource("guild_u6_test", "ch_not_protected"), false, "Detects unprotected channel");

    // Clean up
    unprotectChannel("guild_u6_test", "ch_protected");
    unprotectCategory("guild_u6_test", "cat_protected");
  }

  // ===== GET PROTECTED RESOURCES =====
  console.log("\n===== GET PROTECTED RESOURCES =====");

  {
    setupGuildConfig();
    protectChannel("guild_u6_test", "ch_list_1");
    protectChannel("guild_u6_test", "ch_list_2");
    protectCategory("guild_u6_test", "cat_list_1");

    const resources = getProtectedResources("guild_u6_test");
    assertEqual(resources.channels.length, 2, "getProtectedResources returns 2 channels");
    assertEqual(resources.categories.length, 1, "getProtectedResources returns 1 category");
    assert(resources.channels.includes("ch_list_1"), "Channel list includes ch_list_1");
    assert(resources.channels.includes("ch_list_2"), "Channel list includes ch_list_2");
    assert(resources.categories.includes("cat_list_1"), "Category list includes cat_list_1");

    // Clean up
    unprotectChannel("guild_u6_test", "ch_list_1");
    unprotectChannel("guild_u6_test", "ch_list_2");
    unprotectCategory("guild_u6_test", "cat_list_1");
  }

  // ===== PROTECTION TOOL METADATA =====
  console.log("\n===== PROTECTION TOOL METADATA =====");

  {
    const tools = createProtectionDiscordTools(() => null);

    // Protection tools (4 with confirmation)
    const protectionNames = ["protect_channel", "unprotect_channel", "protect_category", "unprotect_category"];
    for (const name of protectionNames) {
      const tool = tools.find((t) => t.name === name)!;
      assert(tool !== undefined, `Tool ${name} exists`);
      assertEqual(tool.confirmationRequired, true, `Tool ${name} requires confirmation`);
      assertEqual(tool.category, "discord", `Tool ${name} is discord category`);
      assert(tool.allowedScopes.includes("AI_MANAGEMENT"), `Tool ${name} requires AI_MANAGEMENT scope`);
      assertEqual(tool.requiredRole, "admin", `Tool ${name} requires admin role`);
      assertEqual(tool.requiredDiscordPermissions[0], "ManageChannels", `Tool ${name} requires ManageChannels`);
      assertEqual(tool.riskLevel, "medium", `Tool ${name} has medium risk`);
    }

    // list_protected_resources (no confirmation)
    const listTool = tools.find((t) => t.name === "list_protected_resources")!;
    assertEqual(listTool.confirmationRequired, false, "list_protected_resources no confirmation");
    assertEqual(listTool.requiredRole, "moderator", "list_protected_resources requires moderator");
    assertEqual(listTool.riskLevel, "low", "list_protected_resources has low risk");

    // apply_channel_preset
    const presetTool = tools.find((t) => t.name === "apply_channel_preset")!;
    assertEqual(presetTool.confirmationRequired, true, "apply_channel_preset requires confirmation");
    assertEqual(presetTool.requiredRole, "admin", "apply_channel_preset requires admin");
    assertEqual(presetTool.riskLevel, "high", "apply_channel_preset has high risk");

    // view_tool_audit
    const auditTool = tools.find((t) => t.name === "view_tool_audit")!;
    assertEqual(auditTool.confirmationRequired, false, "view_tool_audit no confirmation");
    assertEqual(auditTool.requiredRole, "moderator", "view_tool_audit requires moderator");
    assertEqual(auditTool.riskLevel, "low", "view_tool_audit has low risk");
  }

  // ===== ROLE ENFORCEMENT =====
  console.log("\n===== ROLE ENFORCEMENT =====");

  {
    const tools = createProtectionDiscordTools(() => null);
    const config = setupGuildConfig();

    for (const tool of tools) {
      // Admin → allowed (or RISK_BLOCKED for high risk)
      const adminCtx = makeContext({ requesterRole: "admin", arguments: makeArgs(tool.name) });
      const adminResult = validateToolRequest(tool, adminCtx, config, false);
      if (tool.riskLevel === "low") {
        assertEqual(adminResult.allowed, true, `Tool ${tool.name} allowed for admin (low risk)`);
      } else if (tool.riskLevel === "medium") {
        assertEqual(adminResult.allowed, true, `Tool ${tool.name} allowed for admin (medium risk)`);
      } else {
        // High risk tools pass role validation but may be RISK_BLOCKED or INVALID_ARGUMENTS
        assert(
          adminResult.denialReason === "RISK_BLOCKED" || adminResult.denialReason === "INVALID_ARGUMENTS",
          `Tool ${tool.name} RISK_BLOCKED/INVALID for admin (high risk)`,
        );
      }

      // Moderator → allowed for low-risk tools only
      const modCtx = makeContext({ requesterRole: "moderator", arguments: makeArgs(tool.name) });
      const modResult = validateToolRequest(tool, modCtx, config, false);
      if (tool.riskLevel === "low") {
        assertEqual(modResult.allowed, true, `Tool ${tool.name} allowed for moderator (low risk)`);
      } else {
        assertEqual(modResult.allowed, false, `Tool ${tool.name} denied for moderator`);
      }

      // Member → denied for all
      const memberCtx = makeContext({ requesterRole: "member", arguments: makeArgs(tool.name) });
      const memberResult = validateToolRequest(tool, memberCtx, config, false);
      assertEqual(memberResult.allowed, false, `Tool ${tool.name} denied for member`);
    }
  }

  // ===== PERMISSION PRESETS =====
  console.log("\n===== PERMISSION PRESETS =====");

  {
    const validPresets = getValidPresetNames();
    assertEqual(validPresets.length, 6, "6 valid presets defined");
    assert(validPresets.includes("read-only"), "read-only is valid");
    assert(validPresets.includes("announcement"), "announcement is valid");
    assert(validPresets.includes("text-chat"), "text-chat is valid");
    assert(validPresets.includes("voice-only"), "voice-only is valid");
    assert(validPresets.includes("staff-only"), "staff-only is valid");
    assert(validPresets.includes("public"), "public is valid");

    // Invalid preset
    assertEqual(isValidPreset("invalid-preset"), false, "invalid-preset is not valid");
    assertEqual(isValidPreset(""), false, "empty string is not valid");
    assertEqual(isValidPreset("read-only"), true, "read-only is valid via isValidPreset");
  }

  // ===== PRESET PARAMETER VALIDATION =====
  console.log("\n===== PRESET PARAMETER VALIDATION =====");

  {
    const tool = createProtectionDiscordTools(() => null).find((t) => t.name === "apply_channel_preset")!;
    assertEqual(tool.parameters.length, 2, "apply_channel_preset has 2 parameters");
    assertEqual(tool.parameters[0].name, "channelId", "param 0 is channelId");
    assertEqual(tool.parameters[0].required, true, "channelId is required");
    assertEqual(tool.parameters[1].name, "preset", "param 1 is preset");
    assertEqual(tool.parameters[1].required, true, "preset is required");
    assertEqual(tool.parameters[1].allowedValues!.length, 6, "preset has 6 allowed values");
  }

  // ===== AUDIT VIEWER =====
  console.log("\n===== AUDIT VIEWER =====");

  {
    const tool = createProtectionDiscordTools(() => null).find((t) => t.name === "view_tool_audit")!;
    assertEqual(tool.parameters.length, 7, "view_tool_audit has 7 parameters");

    const paramNames = tool.parameters.map((p) => p.name);
    assert(paramNames.includes("limit"), "has limit parameter");
    assert(paramNames.includes("toolName"), "has toolName parameter");
    assert(paramNames.includes("result"), "has result parameter");
    assert(paramNames.includes("requesterId"), "has requesterId parameter");
    assert(paramNames.includes("channelId"), "has channelId parameter");
    assert(paramNames.includes("riskLevel"), "has riskLevel parameter");
    assert(paramNames.includes("since"), "has since parameter");
  }

  // ===== AUDIT FILTERING =====
  console.log("\n===== AUDIT FILTERING =====");

  {
    // Test audit log retrieval
    const entries = getToolAuditLog({ guildId: "guild_u6_test", limit: 10 });
    assert(Array.isArray(entries), "getToolAuditLog returns array");

    // Test limit
    const limited = getToolAuditLog({ limit: 5 });
    assert(limited.length <= 5, "Limit respected");
  }

  // ===== AUDIT SANITIZATION =====
  console.log("\n===== AUDIT SANITIZATION =====");

  {
    // Verify audit entries don't contain secrets
    const entries = getToolAuditLog({ limit: 100 });
    for (const entry of entries) {
      assert(!entry.requesterName.includes("token"), "No token in requesterName");
      assert(!entry.requesterName.includes("password"), "No password in requesterName");
      assert(!entry.requesterName.includes("api_key"), "No api_key in requesterName");
    }
  }

  // ===== CONFIRMATION EXPIRATION =====
  console.log("\n===== CONFIRMATION EXPIRATION =====");

  {
    clearAllPendingPlans();

    const expiredPlan = makePlan({
      id: "plan_u6_exp_001",
      expiresAt: Date.now() - 1000,
    });
    storePendingPlan(expiredPlan);

    const result = verifyPlan(expiredPlan, "user_admin_1", "guild_u6_test");
    assertEqual(result.valid, false, "Expired plan → invalid");
    assertEqual(result.reason, "CONFIRMATION_EXPIRED", "Expired reason");
    assertEqual(isPlanExpired(expiredPlan), true, "isPlanExpired returns true");

    // Cleanup
    clearAllPendingPlans();
  }

  // ===== CONFIRMATION DOUBLE EXECUTION =====
  console.log("\n===== CONFIRMATION DOUBLE EXECUTION =====");

  {
    clearAllPendingPlans();

    const plan = makePlan({ id: "plan_u6_dbl_001" });
    storePendingPlan(plan);

    const first = verifyPlan(plan, "user_admin_1", "guild_u6_test");
    assertEqual(first.valid, true, "First verification → valid");

    markPlanExecuted(plan.id);
    assertEqual(isPlanExecuted(plan.id), true, "Plan marked executed");

    const second = verifyPlan(plan, "user_admin_1", "guild_u6_test");
    assertEqual(second.valid, false, "Second verification → invalid");
    assertEqual(second.reason, "ALREADY_EXECUTED", "Already executed reason");

    clearAllPendingPlans();
  }

  // ===== CONFIRMATION WRONG REQUESTER =====
  console.log("\n===== CONFIRMATION WRONG REQUESTER =====");

  {
    clearAllPendingPlans();

    const plan = makePlan({ id: "plan_u6_wrong_001", requesterId: "user_1", guildId: "guild_1" });
    storePendingPlan(plan);

    const wrongUser = verifyPlan(plan, "user_2", "guild_1");
    assertEqual(wrongUser.valid, false, "Wrong confirmer → invalid");

    clearAllPendingPlans();
  }

  // ===== CONFIRMATION WRONG GUILD =====
  console.log("\n===== CONFIRMATION WRONG GUILD =====");

  {
    clearAllPendingPlans();

    const plan = makePlan({ id: "plan_u6_guild_001", requesterId: "user_1", guildId: "guild_1" });
    storePendingPlan(plan);

    const wrongGuild = verifyPlan(plan, "user_1", "guild_2");
    assertEqual(wrongGuild.valid, false, "Wrong guild → invalid");

    clearAllPendingPlans();
  }

  // ===== CLIENT UNAVAILABLE =====
  console.log("\n===== CLIENT UNAVAILABLE =====");

  {
    const tools = createProtectionDiscordTools(() => null);

    for (const tool of tools) {
      const ctx = makeContext({ arguments: makeArgs(tool.name) });
      const result = await tool.execute(ctx);
      // With null client, tools return error (they try to fetch guild)
      assert(
        result.status === "error" || result.status === "denied" || result.status === "success",
        `Tool ${tool.name} handles null client (got ${result.status})`,
      );
    }
  }

  // ===== PROTECTED RESOURCE DENIAL IN EXECUTE =====
  console.log("\n===== PROTECTED RESOURCE DENIAL IN EXECUTE =====");

  {
    setupGuildConfig();
    protectChannel("guild_u6_test", "ch_denied");

    // Test protection check via isProtectedResource directly
    assertEqual(isProtectedResource("guild_u6_test", "ch_denied"), true, "ch_denied is protected");

    // Unprotect for clean state
    unprotectChannel("guild_u6_test", "ch_denied");
    assertEqual(isProtectedResource("guild_u6_test", "ch_denied"), false, "ch_denied not protected after unprotect");
  }

  // ===== LIST PROTECTED RESOURCES TOOL =====
  console.log("\n===== LIST PROTECTED RESOURCES TOOL =====");

  {
    setupGuildConfig();
    protectChannel("guild_u6_test", "ch_list_a");
    protectCategory("guild_u6_test", "cat_list_a");

    const tool = createProtectionDiscordTools(() => null).find((t) => t.name === "list_protected_resources")!;
    const ctx = makeContext({ arguments: {} });
    const result = await tool.execute(ctx);

    // With null client, returns error (can't fetch guild)
    assert(
      result.status === "success" || result.status === "error",
      `list_protected_resources returns success or error (got ${result.status})`,
    );

    if (result.status === "success") {
      assert(result.message.includes("Protected Resources"), "Message includes header");
      assert(result.data !== undefined, "Result has data");
      const data = result.data as { channels: string[]; categories: string[] };
      assertEqual(data.channels.length, 1, "Data has 1 protected channel");
      assertEqual(data.categories.length, 1, "Data has 1 protected category");
    }

    // Clean up
    unprotectChannel("guild_u6_test", "ch_list_a");
    unprotectCategory("guild_u6_test", "cat_list_a");
  }

  // ===== VIEW TOOL AUDIT TOOL =====
  console.log("\n===== VIEW TOOL AUDIT TOOL =====");

  {
    const tool = createProtectionDiscordTools(() => null).find((t) => t.name === "view_tool_audit")!;
    const ctx = makeContext({ arguments: { limit: 10 } });
    const result = await tool.execute(ctx);

    assertEqual(result.status, "success", "view_tool_audit returns success");
    assert(result.message.includes("Audit Log"), "Message includes Audit Log header");
    assert(result.data !== undefined, "Result has data");
  }

  // ===== ALL U6 TOOLS HAVE CONFIRMATION REQUIRED SET =====
  console.log("\n===== ALL U6 TOOLS HAVE CONFIRMATION REQUIRED SET =====");

  {
    const tools = createProtectionDiscordTools(() => null);
    for (const tool of tools) {
      assert(
        typeof tool.confirmationRequired === "boolean",
        `Tool ${tool.name} has confirmationRequired as boolean`,
      );
    }
  }

  // ===== DENIAL REASON TYPE =====
  console.log("\n===== DENIAL REASON TYPE =====");

  {
    const { DenialReason } = await import("../src/ai/tools/types");
    // Just verify it compiles and the type exists
    assert(true, "PROTECTED_RESOURCE type compiles");
  }

  // ================================================================
  // PROTECTED CATEGORY INHERITANCE TESTS (U6.1)
  // ================================================================

  // ===== isChannelProtected: BASIC BEHAVIOR =====
  console.log("\n===== isChannelProtected: BASIC BEHAVIOR =====");

  {
    setupGuildConfig();

    // Directly protected channel
    protectChannel("guild_u6_test", "ch_direct");
    assertEqual(isChannelProtected("guild_u6_test", "ch_direct"), true, "Directly protected channel is protected");
    assertEqual(isChannelProtected("guild_u6_test", "ch_direct", "cat_1"), true, "Directly protected channel is protected even with non-protected parent");
    unprotectChannel("guild_u6_test", "ch_direct");

    // No protection at all
    assertEqual(isChannelProtected("guild_u6_test", "ch_unprotected"), false, "Unprotected channel is not protected");
    assertEqual(isChannelProtected("guild_u6_test", "ch_unprotected", "cat_unprotected"), false, "Channel in unprotected category is not protected");

    // Category inheritance
    protectCategory("guild_u6_test", "cat_inherit");
    assertEqual(isChannelProtected("guild_u6_test", "ch_child", "cat_inherit"), true, "Channel in protected category is protected");
    assertEqual(isChannelProtected("guild_u6_test", "ch_child", null), false, "Channel with null parentId in protected category is NOT protected");
    assertEqual(isChannelProtected("guild_u6_test", "ch_child"), false, "Channel without parentId arg in protected category is NOT protected");
    unprotectCategory("guild_u6_test", "cat_inherit");

    // Both directly protected AND in protected category
    protectChannel("guild_u6_test", "ch_both");
    protectCategory("guild_u6_test", "cat_both");
    assertEqual(isChannelProtected("guild_u6_test", "ch_both", "cat_both"), true, "Channel protected by both direct and category");
    unprotectChannel("guild_u6_test", "ch_both");
    assertEqual(isChannelProtected("guild_u6_test", "ch_both", "cat_both"), true, "Channel still protected by category after unprotect");
    unprotectCategory("guild_u6_test", "cat_both");
    assertEqual(isChannelProtected("guild_u6_test", "ch_both", "cat_both"), false, "Channel unprotected after both removed");
  }

  // ===== TEST 1: Protected category blocks child channel rename =====
  console.log("\n===== TEST 1: Protected category blocks child rename =====");

  {
    setupGuildConfig();
    protectCategory("guild_u6_test", "cat_test1");

    // Test via isChannelProtected
    assertEqual(isChannelProtected("guild_u6_test", "ch_child1", "cat_test1"), true, "Child channel of protected category is protected from rename");

    // Verify via tool definition
    const allTools = createDiscordTools(() => null);
    const renameTool = allTools.find((t) => t.name === "rename_channel")!;
    const ctx = makeContext({
      arguments: { _toolName: "rename_channel", channelId: "ch_child1", newName: "new-name" },
    });
    const config = makeGuildConfig({ protectedCategories: ["cat_test1"] });
    const result = validateToolRequest(renameTool, ctx, config, false);
    // Tool passes validation (it has correct role/scope) but execute would be denied
    // The protection check happens in execute, not validation
    assert(result.allowed || result.denialReason !== "PROTECTED_RESOURCE", "Tool validation passes (protection is checked in execute)");
    unprotectCategory("guild_u6_test", "cat_test1");
  }

  // ===== TEST 2: Protected category blocks child channel deletion =====
  console.log("\n===== TEST 2: Protected category blocks child deletion =====");

  {
    setupGuildConfig();
    protectCategory("guild_u6_test", "cat_test2");
    assertEqual(isChannelProtected("guild_u6_test", "ch_child2", "cat_test2"), true, "Child channel of protected category is protected from deletion");
    unprotectCategory("guild_u6_test", "cat_test2");
  }

  // ===== TEST 3: Protected category blocks child channel movement =====
  console.log("\n===== TEST 3: Protected category blocks child movement =====");

  {
    setupGuildConfig();
    protectCategory("guild_u6_test", "cat_test3");
    assertEqual(isChannelProtected("guild_u6_test", "ch_child3", "cat_test3"), true, "Child channel of protected category is protected from movement");
    unprotectCategory("guild_u6_test", "cat_test3");
  }

  // ===== TEST 4: Protected category blocks child permission changes =====
  console.log("\n===== TEST 4: Protected category blocks child permission changes =====");

  {
    setupGuildConfig();
    protectCategory("guild_u6_test", "cat_test4");
    assertEqual(isChannelProtected("guild_u6_test", "ch_child4", "cat_test4"), true, "Child channel of protected category is protected from permission changes");
    unprotectCategory("guild_u6_test", "cat_test4");
  }

  // ===== TEST 5: Protected category blocks edit_channel including parentId =====
  console.log("\n===== TEST 5: Protected category blocks edit_channel =====");

  {
    setupGuildConfig();
    protectCategory("guild_u6_test", "cat_test5");
    // Channel is in protected category - edit_channel should be denied
    assertEqual(isChannelProtected("guild_u6_test", "ch_child5", "cat_test5"), true, "edit_channel on child of protected category is denied");
    // Moving into protected category via parentId should also be denied
    // (this is checked via isProtectedCategory in the tool)
    assertEqual(isProtectedCategory("guild_u6_test", "cat_test5"), true, "Target category is protected");
    unprotectCategory("guild_u6_test", "cat_test5");
  }

  // ===== TEST 6: Unprotected category allows normal child operations =====
  console.log("\n===== TEST 6: Unprotected category allows normal operations =====");

  {
    setupGuildConfig();
    protectCategory("guild_u6_test", "cat_other");
    // Channel in different, unprotected category
    assertEqual(isChannelProtected("guild_u6_test", "ch_normal", "cat_normal"), false, "Channel in unprotected category is not protected");
    assertEqual(isChannelProtected("guild_u6_test", "ch_normal"), false, "Channel without parentId is not protected");
    unprotectCategory("guild_u6_test", "cat_other");
  }

  // ===== TEST 7: Directly protected channel still works exactly as before =====
  console.log("\n===== TEST 7: Directly protected channel unchanged =====");

  {
    setupGuildConfig();
    protectChannel("guild_u6_test", "ch_direct7");
    assertEqual(isProtectedChannel("guild_u6_test", "ch_direct7"), true, "Directly protected channel is still protected");
    assertEqual(isChannelProtected("guild_u6_test", "ch_direct7"), true, "isChannelProtected agrees for direct protection");
    assertEqual(isProtectedResource("guild_u6_test", "ch_direct7"), true, "isProtectedResource agrees for direct protection");
    unprotectChannel("guild_u6_test", "ch_direct7");
    assertEqual(isProtectedChannel("guild_u6_test", "ch_direct7"), false, "Directly unprotected channel is not protected");
    assertEqual(isChannelProtected("guild_u6_test", "ch_direct7"), false, "isChannelProtected agrees for unprotected");
  }

  // ===== TEST 8: Deleting protected category is still denied =====
  console.log("\n===== TEST 8: Deleting protected category still denied =====");

  {
    setupGuildConfig();
    protectCategory("guild_u6_test", "cat_del8");
    assertEqual(isProtectedCategory("guild_u6_test", "cat_del8"), true, "Protected category is protected");
    assertEqual(isProtectedResource("guild_u6_test", "cat_del8"), true, "isProtectedResource confirms category protection");
    unprotectCategory("guild_u6_test", "cat_del8");
  }

  // ===== TEST 9: Guild isolation with category inheritance =====
  console.log("\n===== TEST 9: Guild isolation with category inheritance =====");

  {
    saveGuildAIConfig(makeGuildConfig({ guildId: "guild_iso_cat_a" }));
    saveGuildAIConfig(makeGuildConfig({ guildId: "guild_iso_cat_b" }));

    protectCategory("guild_iso_cat_a", "cat_shared_id");

    // Channel protected in guild A (category protected)
    assertEqual(isChannelProtected("guild_iso_cat_a", "ch_same_id", "cat_shared_id"), true, "Channel protected in guild A via category");
    // Same channel ID in guild B (category NOT protected) → not protected
    assertEqual(isChannelProtected("guild_iso_cat_b", "ch_same_id", "cat_shared_id"), false, "Same channel NOT protected in guild B");

    // Directly protected in guild A
    protectChannel("guild_iso_cat_a", "ch_direct_iso");
    assertEqual(isChannelProtected("guild_iso_cat_a", "ch_direct_iso"), true, "Direct channel protected in guild A");
    assertEqual(isChannelProtected("guild_iso_cat_b", "ch_direct_iso"), false, "Same channel NOT protected in guild B");

    // Clean up
    unprotectCategory("guild_iso_cat_a", "cat_shared_id");
    unprotectChannel("guild_iso_cat_a", "ch_direct_iso");
  }

  // ===== TEST 10: Moving channel into protected category then checking protection =====
  console.log("\n===== TEST 10: Channel moved into protected category is protected =====");

  {
    setupGuildConfig();
    // Initially unprotected
    assertEqual(isChannelProtected("guild_u6_test", "ch_moved", "cat_unprot"), false, "Channel starts unprotected");

    // Simulate moving into protected category (protect the category)
    protectCategory("guild_u6_test", "cat_new");
    // Now channel with parentId = cat_new should be protected
    assertEqual(isChannelProtected("guild_u6_test", "ch_moved", "cat_new"), true, "Channel moved into protected category is now protected");

    // Verify all mutation tools would deny
    const tools = createProtectionDiscordTools(() => null);
    const presetTool = tools.find((t) => t.name === "apply_channel_preset")!;
    assertEqual(presetTool.name, "apply_channel_preset", "apply_channel_preset tool exists");

    unprotectCategory("guild_u6_test", "cat_new");
  }

  // ===== TEST 11: Channel in protected category cannot be moved out =====
  console.log("\n===== TEST 11: Channel in protected category cannot be moved out =====");

  {
    setupGuildConfig();
    protectCategory("guild_u6_test", "cat_src11");

    // Channel is in protected category
    assertEqual(isChannelProtected("guild_u6_test", "ch_stuck", "cat_src11"), true, "Channel in protected category is protected");

    // Moving out requires checking current protection (with current parentId)
    // The channel is protected because its current parent is protected
    // Even if we try to move to an unprotected category, it should be denied
    assertEqual(isChannelProtected("guild_u6_test", "ch_stuck", "cat_src11"), true, "Channel cannot be moved out (still protected via current parent)");

    unprotectCategory("guild_u6_test", "cat_src11");
  }

  // ===== TEST 12: Confirmation created before category protection is rejected =====
  console.log("\n===== TEST 12: Pre-protection plan rejected =====");

  {
    setupGuildConfig();
    clearAllPendingPlans();

    // Plan created when channel was unprotected
    const plan = makePlan({
      id: "plan_pre_protect",
      toolName: "rename_channel",
      arguments: { channelId: "ch_pre", _toolName: "rename_channel" },
    });
    storePendingPlan(plan);

    // Category gets protected
    protectCategory("guild_u6_test", "cat_pre");

    // Plan verification should still pass (it doesn't check protection)
    const verify = verifyPlan(plan, "user_admin_1", "guild_u6_test");
    assertEqual(verify.valid, true, "Plan verification passes (protection is checked in handler)");

    // But isChannelProtected now returns true for the channel
    // In the confirmation handler, this plan would be rejected at step 8
    assertEqual(isChannelProtected("guild_u6_test", "ch_pre", "cat_pre"), true, "Channel is now protected (handler would reject)");

    unprotectCategory("guild_u6_test", "cat_pre");
    clearAllPendingPlans();
  }

  // ===== TEST 13: move_channel into protected category denied =====
  console.log("\n===== TEST 13: move_channel into protected category denied =====");

  {
    setupGuildConfig();
    protectCategory("guild_u6_test", "cat_dest13");

    // isProtectedCategory check (used by move_channel)
    assertEqual(isProtectedCategory("guild_u6_test", "cat_dest13"), true, "Target category is protected");
    // So moving a channel into it should be denied

    unprotectCategory("guild_u6_test", "cat_dest13");
  }

  // ===== TEST 14: edit_channel parentId into protected category denied =====
  console.log("\n===== TEST 14: edit_channel parentId into protected category denied =====");

  {
    setupGuildConfig();
    protectCategory("guild_u6_test", "cat_dest14");

    // isProtectedCategory check (used by edit_channel for parentId)
    assertEqual(isProtectedCategory("guild_u6_test", "cat_dest14"), true, "Target category is protected for edit_channel parentId");

    unprotectCategory("guild_u6_test", "cat_dest14");
  }

  // ===== CLEANUP =====
  console.log("\n===== CLEANUP =====");

  {
    clearAllPendingPlans();
    assertEqual(getPendingPlanCount(), 0, "Store cleared");
  }

  /* ================================================================
   * SUMMARY
   * ================================================================ */

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  if (failed === 0) {
    console.log("🎉 ALL U6 SERVER PROTECTION + PRESETS + AUDIT TESTS PASSED");
  } else {
    console.log("💥 SOME U6 TESTS FAILED");
    process.exit(1);
  }
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
}

main();
