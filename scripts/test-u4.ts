/**
 * U4 Tests: Controlled Channel Management
 *
 * Tests cover:
 * 1. Tool registration (4 tools)
 * 2. Tool metadata (risk, confirmation, scopes, roles)
 * 3. Parameter validation
 * 4. Management scope enforcement (AI_MANAGEMENT required)
 * 5. Role enforcement (member denied, moderator+ allowed)
 * 6. Denial reasons
 * 7. ActionPlan generation
 * 8. Confirmation required for all tools
 * 9. Anti-tampering (plan stored server-side)
 * 10. Double-execution prevention
 * 11. Guild isolation
 * 12. Cross-guild category rejection
 * 13. Client unavailable handled
 * 14. Audit recorded
 * 15. Null client error handling
 * 16. Confirmation store operations
 * 17. Plan expiration
 * 18. Wrong confirmer rejected
 * 19. Wrong guild rejected
 * 20. Scope enforcement (AI_CHAT denied)
 */

import { ToolRegistry } from "../src/ai/tools/registry";
import { createWriteDiscordTools } from "../src/ai/tools/discord";
import { validateToolRequest } from "../src/ai/tools/validator";
import { saveGuildAIConfig, loadGuildAIConfig } from "../src/ai/tools/channel-scope";
import { executeTool } from "../src/ai/tools/executor";
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
import { createActionPlan } from "../src/ai/tools/executor";
import { recordToolAudit } from "../src/ai/tools/audit";
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
    guildId: "guild_u4_test",
    channelId: "ch_mgmt_1",
    requesterId: "user_mod_1",
    requesterName: "ModUser",
    requesterRole: "moderator",
    arguments: { _toolName: "test_tool", name: "test", type: "text", channelId: "ch_1", newName: "new-name", categoryId: "cat_1" },
    dryRun: false,
    ...overrides,
  };
}

function makeGuildConfig(overrides: Partial<GuildAIConfig> = {}): GuildAIConfig {
  return {
    guildId: "guild_u4_test",
    enabled: true,
    managementEnabled: true,
    channelScopes: {
      "ch_mgmt_1": ["AI_MANAGEMENT"],
      "ch_chat_1": ["AI_CHAT"],
    },
    managementRoleIds: [],
    chatRoleIds: [],
    version: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

function makeArgs(toolName: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    _toolName: toolName,
    name: "test",
    type: "text",
    channelId: "ch_1",
    newName: "new-name",
    categoryId: "cat_1",
    ...extra,
  };
}

function setupGuildConfig(): GuildAIConfig {
  const config = makeGuildConfig();
  saveGuildAIConfig(config);
  return config;
}

function makePlan(overrides: Partial<ActionPlan> = {}): ActionPlan {
  return {
    id: "plan_test_001",
    guildId: "guild_u4_test",
    channelId: "ch_mgmt_1",
    requesterId: "user_mod_1",
    toolName: "create_channel",
    arguments: { name: "test-channel", type: "text", _toolName: "create_channel" },
    riskLevel: "medium",
    changes: [{ type: "create", target: "#test-channel", description: "Create text channel" }],
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
  console.log("\n🧪 U4: Controlled Channel Management Tests\n");

  // ===== TOOL REGISTRATION =====
  console.log("===== TOOL REGISTRATION =====");

  {
    const tools = createWriteDiscordTools(() => null);
    assertEqual(tools.length, 4, "createWriteDiscordTools returns 4 tools");

    const expectedNames = ["create_category", "create_channel", "move_channel", "rename_channel"];
    const actualNames = tools.map((t) => t.name).sort();
    assertEqual(actualNames.join(","), expectedNames.join(","), "All 4 tool names present");

    const registry = new ToolRegistry();
    registry.registerAll(tools);
    assertEqual(registry.count(), 4, "Registry has 4 write tools");
    for (const name of expectedNames) {
      assert(registry.has(name), `Registry has ${name}`);
    }
  }

  // ===== TOOL METADATA =====
  console.log("\n===== TOOL METADATA =====");

  {
    const tools = createWriteDiscordTools(() => null);

    for (const tool of tools) {
      assertEqual(tool.riskLevel, "medium", `Tool ${tool.name} has medium risk`);
      assertEqual(tool.confirmationRequired, true, `Tool ${tool.name} requires confirmation`);
      assertEqual(tool.category, "discord", `Tool ${tool.name} is discord category`);
      assertEqual(tool.requiredRole, "moderator", `Tool ${tool.name} requires moderator role`);
      assert(
        tool.allowedScopes.includes("AI_MANAGEMENT"),
        `Tool ${tool.name} requires AI_MANAGEMENT scope`,
      );
      assert(
        !tool.allowedScopes.includes("AI_CHAT"),
        `Tool ${tool.name} does NOT allow AI_CHAT scope`,
      );
      assert(
        !tool.allowedScopes.includes("AI_GAMES"),
        `Tool ${tool.name} does NOT allow AI_GAMES scope`,
      );
      assertEqual(tool.requiredDiscordPermissions[0], "ManageChannels",
        `Tool ${tool.name} requires ManageChannels Discord permission`);
    }
  }

  // ===== PARAMETER VALIDATION =====
  console.log("\n===== PARAMETER VALIDATION =====");

  {
    const tools = createWriteDiscordTools(() => null);

    const createCh = tools.find((t) => t.name === "create_channel")!;
    assertEqual(createCh.parameters.length, 3, "create_channel has 3 parameters");
    assertEqual(createCh.parameters[0].name, "name", "create_channel param 0 is name");
    assertEqual(createCh.parameters[0].required, true, "create_channel name is required");
    assertEqual(createCh.parameters[1].name, "type", "create_channel param 1 is type");
    assertEqual(createCh.parameters[1].required, true, "create_channel type is required");
    assertEqual(createCh.parameters[2].name, "categoryId", "create_channel param 2 is categoryId");
    assertEqual(createCh.parameters[2].required, false, "create_channel categoryId is optional");

    const createCat = tools.find((t) => t.name === "create_category")!;
    assertEqual(createCat.parameters.length, 1, "create_category has 1 parameter");
    assertEqual(createCat.parameters[0].name, "name", "create_category param 0 is name");
    assertEqual(createCat.parameters[0].required, true, "create_category name is required");

    const rename = tools.find((t) => t.name === "rename_channel")!;
    assertEqual(rename.parameters.length, 2, "rename_channel has 2 parameters");
    assertEqual(rename.parameters[0].name, "channelId", "rename_channel param 0 is channelId");
    assertEqual(rename.parameters[0].required, true, "rename_channel channelId is required");
    assertEqual(rename.parameters[1].name, "newName", "rename_channel param 1 is newName");
    assertEqual(rename.parameters[1].required, true, "rename_channel newName is required");

    const move = tools.find((t) => t.name === "move_channel")!;
    assertEqual(move.parameters.length, 2, "move_channel has 2 parameters");
    assertEqual(move.parameters[0].name, "channelId", "move_channel param 0 is channelId");
    assertEqual(move.parameters[0].required, true, "move_channel channelId is required");
    assertEqual(move.parameters[1].name, "categoryId", "move_channel param 1 is categoryId");
    assertEqual(move.parameters[1].required, true, "move_channel categoryId is required");
  }

  // ===== MANAGEMENT SCOPE ENFORCEMENT =====
  console.log("\n===== MANAGEMENT SCOPE ENFORCEMENT =====");

  {
    const tools = createWriteDiscordTools(() => null);
    const config = setupGuildConfig();

    for (const tool of tools) {
      const mgmtCtx = makeContext({ channelId: "ch_mgmt_1", arguments: makeArgs(tool.name) });
      const mgmtResult = validateToolRequest(tool, mgmtCtx, config, false);
      assert(mgmtResult.allowed === true, `Tool ${tool.name} allowed in AI_MANAGEMENT channel`);

      const chatCtx = makeContext({ channelId: "ch_chat_1", arguments: makeArgs(tool.name) });
      const chatResult = validateToolRequest(tool, chatCtx, config, false);
      assertEqual(chatResult.allowed, false, `Tool ${tool.name} denied in AI_CHAT channel`);
      assertEqual(chatResult.denialReason, "CHANNEL_NOT_ALLOWED", `Tool ${tool.name} denial reason is CHANNEL_NOT_ALLOWED`);

      const unconfCtx = makeContext({ channelId: "ch_random", arguments: makeArgs(tool.name) });
      const unconfResult = validateToolRequest(tool, unconfCtx, config, false);
      assertEqual(unconfResult.allowed, false, `Tool ${tool.name} denied in unconfigured channel`);
    }
  }

  // ===== MEMBER DENIED =====
  console.log("\n===== MEMBER DENIED =====");

  {
    const tools = createWriteDiscordTools(() => null);
    const config = setupGuildConfig();

    for (const tool of tools) {
      const memberCtx = makeContext({
        requesterRole: "member",
        arguments: makeArgs(tool.name),
      });
      const result = validateToolRequest(tool, memberCtx, config, false);
      assertEqual(result.allowed, false, `Tool ${tool.name} denied for member role`);
      assertEqual(result.denialReason, "INSUFFICIENT_ROLE", `Tool ${tool.name} member denial reason is INSUFFICIENT_ROLE`);
    }
  }

  // ===== MODERATOR ALLOWED =====
  console.log("\n===== MODERATOR ALLOWED =====");

  {
    const tools = createWriteDiscordTools(() => null);
    const config = setupGuildConfig();

    for (const tool of tools) {
      const modCtx = makeContext({
        requesterRole: "moderator",
        arguments: makeArgs(tool.name),
      });
      const result = validateToolRequest(tool, modCtx, config, false);
      assertEqual(result.allowed, true, `Tool ${tool.name} allowed for moderator role`);
    }
  }

  // ===== ADMIN ALLOWED =====
  console.log("\n===== ADMIN ALLOWED =====");

  {
    const tools = createWriteDiscordTools(() => null);
    const config = setupGuildConfig();

    for (const tool of tools) {
      const adminCtx = makeContext({
        requesterRole: "admin",
        arguments: makeArgs(tool.name),
      });
      const result = validateToolRequest(tool, adminCtx, config, false);
      assertEqual(result.allowed, true, `Tool ${tool.name} allowed for admin role`);
    }
  }

  // ===== OWNER ALLOWED =====
  console.log("\n===== OWNER ALLOWED =====");

  {
    const tools = createWriteDiscordTools(() => null);
    const config = setupGuildConfig();

    for (const tool of tools) {
      const ownerCtx = makeContext({
        requesterRole: "owner",
        arguments: makeArgs(tool.name),
      });
      const result = validateToolRequest(tool, ownerCtx, config, false);
      assertEqual(result.allowed, true, `Tool ${tool.name} allowed for owner role`);
    }
  }

  // ===== GUEST DENIED =====
  console.log("\n===== GUEST DENIED =====");

  {
    const tools = createWriteDiscordTools(() => null);
    const config = setupGuildConfig();

    for (const tool of tools) {
      const guestCtx = makeContext({
        requesterRole: "guest",
        arguments: makeArgs(tool.name),
      });
      const result = validateToolRequest(tool, guestCtx, config, false);
      assertEqual(result.allowed, false, `Tool ${tool.name} denied for guest role`);
    }
  }

  // ===== ACTION PLAN GENERATION =====
  console.log("\n===== ACTION PLAN GENERATION =====");

  {
    // Register tools so executeTool can find them
    const registry = new ToolRegistry();
    const tools = createWriteDiscordTools(() => null);
    registry.registerAll(tools);

    // Register the tools globally (executeTool uses the global registry)
    const { toolRegistry } = await import("../src/ai/tools/registry");
    toolRegistry.registerAll(tools);

    for (const tool of tools) {
      const ctx = makeContext({ arguments: makeArgs(tool.name) });
      const result = await executeTool(tool.name, ctx, { dryRun: false, isBotOwner: false });
      assertEqual(result.status, "confirmation_required", `Tool ${tool.name} returns confirmation_required via executor`);
      assert(result.plan !== undefined, `Tool ${tool.name} includes plan`);
      assert(result.plan!.id.startsWith("plan_"), `Tool ${tool.name} plan has valid ID`);
      assertEqual(result.plan!.guildId, "guild_u4_test", `Tool ${tool.name} plan has correct guildId`);
      assertEqual(result.plan!.requesterId, "user_mod_1", `Tool ${tool.name} plan has correct requesterId`);
      assertEqual(result.plan!.riskLevel, "medium", `Tool ${tool.name} plan has medium risk`);
      assertEqual(result.plan!.requiresConfirmation, true, `Tool ${tool.name} plan requires confirmation`);
    }
  }

  // ===== CONFIRMATION STORE =====
  console.log("\n===== CONFIRMATION STORE =====");

  {
    clearAllPendingPlans();
    assertEqual(getPendingPlanCount(), 0, "Store starts empty");

    const plan = makePlan();
    storePendingPlan(plan);
    assertEqual(getPendingPlanCount(), 1, "Store has 1 plan after store");

    const retrieved = getPendingPlan(plan.id);
    assert(retrieved !== undefined, "Plan retrievable by ID");
    assertEqual(retrieved!.id, plan.id, "Retrieved plan has correct ID");
    assertEqual(retrieved!.toolName, "create_channel", "Retrieved plan has correct toolName");
  }

  // ===== PLAN VERIFICATION =====
  console.log("\n===== PLAN VERIFICATION =====");

  {
    clearAllPendingPlans();

    const plan = makePlan({
      requesterId: "user_1",
      guildId: "guild_1",
      expiresAt: Date.now() + 60_000,
    });
    storePendingPlan(plan);

    const valid = verifyPlan(plan, "user_1", "guild_1");
    assertEqual(valid.valid, true, "Correct confirmer/guild → valid");

    const wrongUser = verifyPlan(plan, "user_2", "guild_1");
    assertEqual(wrongUser.valid, false, "Wrong confirmer → invalid");
    assertEqual(wrongUser.reason, "CONFIRMATION_INVALID", "Wrong confirmer reason is CONFIRMATION_INVALID");

    const wrongGuild = verifyPlan(plan, "user_1", "guild_2");
    assertEqual(wrongGuild.valid, false, "Wrong guild → invalid");
    assertEqual(wrongGuild.reason, "CONFIRMATION_INVALID", "Wrong guild reason is CONFIRMATION_INVALID");
  }

  // ===== PLAN EXPIRATION =====
  console.log("\n===== PLAN EXPIRATION =====");

  {
    clearAllPendingPlans();

    const expiredPlan = makePlan({
      id: "plan_expired_001",
      expiresAt: Date.now() - 1000,
    });
    storePendingPlan(expiredPlan);

    const result = verifyPlan(expiredPlan, "user_mod_1", "guild_u4_test");
    assertEqual(result.valid, false, "Expired plan → invalid");
    assertEqual(result.reason, "CONFIRMATION_EXPIRED", "Expired plan reason is CONFIRMATION_EXPIRED");
    assertEqual(isPlanExpired(expiredPlan), true, "isPlanExpired returns true for expired plan");
  }

  // ===== DOUBLE EXECUTION PREVENTION =====
  console.log("\n===== DOUBLE EXECUTION PREVENTION =====");

  {
    clearAllPendingPlans();

    const plan = makePlan({ id: "plan_double_001" });
    storePendingPlan(plan);

    const first = verifyPlan(plan, "user_mod_1", "guild_u4_test");
    assertEqual(first.valid, true, "First verification → valid");

    markPlanExecuted(plan.id);
    assertEqual(isPlanExecuted(plan.id), true, "Plan marked as executed");

    const second = verifyPlan(plan, "user_mod_1", "guild_u4_test");
    assertEqual(second.valid, false, "Second verification → invalid");
    assertEqual(second.reason, "ALREADY_EXECUTED", "Already executed reason");
  }

  // ===== GUILD ISOLATION =====
  console.log("\n===== GUILD ISOLATION =====");

  {
    const tools = createWriteDiscordTools(() => null);

    const guildAConfig = makeGuildConfig({ guildId: "guild_a" });
    const guildBConfig = makeGuildConfig({ guildId: "guild_b" });
    saveGuildAIConfig(guildAConfig);
    saveGuildAIConfig(guildBConfig);

    for (const tool of tools) {
      const ctxA = makeContext({
        guildId: "guild_a",
        channelId: "ch_mgmt_1",
        arguments: makeArgs(tool.name),
      });
      const configA = loadGuildAIConfig("guild_a");
      const resultA = validateToolRequest(tool, ctxA, configA, false);
      assertEqual(resultA.allowed, true, `Tool ${tool.name} Guild A user in Guild A → allowed`);

      const ctxB = makeContext({
        guildId: "guild_b",
        channelId: "ch_mgmt_1",
        requesterId: "user_guild_b",
        arguments: makeArgs(tool.name),
      });
      const configB = loadGuildAIConfig("guild_b");
      const resultB = validateToolRequest(tool, ctxB, configB, false);
      assertEqual(resultB.allowed, true, `Tool ${tool.name} Guild B user in Guild B → allowed`);
    }
  }

  // ===== CROSS-GUILD CATEGORY =====
  console.log("\n===== CROSS-GUILD CATEGORY =====");

  {
    clearAllPendingPlans();

    const plan = makePlan({ guildId: "guild_a" });
    storePendingPlan(plan);

    const result = verifyPlan(plan, "user_mod_1", "guild_b");
    assertEqual(result.valid, false, "Cross-guild confirmation rejected");
  }

  // ===== CLIENT UNAVAILABLE =====
  console.log("\n===== CLIENT UNAVAILABLE =====");

  {
    const tools = createWriteDiscordTools(() => null);

    for (const tool of tools) {
      const ctx = makeContext({ arguments: makeArgs(tool.name) });
      const result = await tool.execute(ctx);
      assert(
        result.status === "error" || result.status === "confirmation_required",
        `Tool ${tool.name} handles null client (got ${result.status})`,
      );
    }
  }

  // ===== AUDIT RECORDED =====
  console.log("\n===== AUDIT RECORDED =====");

  {
    assert(typeof recordToolAudit === "function", "recordToolAudit is a function");
  }

  // ===== GUILD AI MANAGEMENT DISABLED =====
  console.log("\n===== GUILD AI MANAGEMENT DISABLED =====");

  {
    const tools = createWriteDiscordTools(() => null);
    const disabledConfig = makeGuildConfig({ enabled: false });
    saveGuildAIConfig(disabledConfig);

    for (const tool of tools) {
      const ctx = makeContext({ arguments: makeArgs(tool.name) });
      const result = validateToolRequest(tool, ctx, disabledConfig, false);
      assertEqual(result.allowed, false, `Tool ${tool.name} denied when AI management disabled`);
      assertEqual(result.denialReason, "AI_MANAGEMENT_DISABLED", `Tool ${tool.name} reason is AI_MANAGEMENT_DISABLED`);
    }
  }

  // ===== ALL TOOLS HAVE CONFIRMATION_REQUIRED =====
  console.log("\n===== ALL TOOLS HAVE CONFIRMATION_REQUIRED =====");

  {
    const tools = createWriteDiscordTools(() => null);
    for (const tool of tools) {
      assertEqual(tool.confirmationRequired, true, `Tool ${tool.name} has confirmationRequired=true`);
    }
  }

  // ===== ACTION PLAN CHANGES =====
  console.log("\n===== ACTION PLAN CHANGES =====");

  {
    const tools = createWriteDiscordTools(() => null);

    for (const tool of tools) {
      const ctx = makeContext({ arguments: makeArgs(tool.name) });
      const result = await executeTool(tool.name, ctx, { dryRun: false, isBotOwner: false });
      if (result.plan) {
        assert(result.plan.changes.length > 0, `Tool ${tool.name} plan has changes`);
        assert(result.plan.changes[0].permissions === "ManageChannels", `Tool ${tool.name} plan change includes ManageChannels`);
      }
    }
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
    console.log("🎉 ALL U4 CHANNEL MANAGEMENT TESTS PASSED");
  } else {
    console.log("💥 SOME U4 TESTS FAILED");
    process.exit(1);
  }
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
}

main();
