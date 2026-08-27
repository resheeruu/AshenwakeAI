/**
 * U3 Tests: Read-Only Discord Utility Tools
 *
 * Tests cover:
 * 1. Tool registration (all 5 tools)
 * 2. inspect_server — null client error
 * 3. list_channels — null client error
 * 4. check_permissions — null client error
 * 5. inspect_ai_config — config display, empty config
 * 6. health_check — health check display
 * 7. Tool metadata — risk level, confirmation, scopes
 * 8. Registry integration — tools available via registry
 * 9. Denial reasons — guest denied member-only tools
 * 10. Scope validation — all tools have valid scopes
 */

import { ToolRegistry } from "../src/ai/tools/registry";
import { createReadOnlyDiscordTools } from "../src/ai/tools/discord";
import { validateToolRequest } from "../src/ai/tools/validator";
import { saveGuildAIConfig, loadGuildAIConfig } from "../src/ai/tools/channel-scope";
import type { ToolContext } from "../src/ai/tools/types";
import type { GuildAIConfig } from "../src/ai/tools/types";

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
    guildId: "guild_u3_test",
    channelId: "ch_u3_1",
    requesterId: "user_u3_1",
    requesterName: "U3TestUser",
    requesterRole: "member",
    arguments: { _toolName: "test_tool" },
    dryRun: false,
    ...overrides,
  };
}

function makeGuildConfig(overrides: Partial<GuildAIConfig> = {}): GuildAIConfig {
  return {
    guildId: "guild_u3_test",
    enabled: true,
    managementEnabled: true,
    channelScopes: {
      "ch_u3_1": ["AI_CHAT"],
      "ch_u3_2": ["AI_MANAGEMENT"],
      "ch_u3_3": ["AI_CHAT", "AI_MANAGEMENT"],
    },
    managementRoleIds: ["role_mgmt_1", "role_mgmt_2"],
    chatRoleIds: ["role_chat_1"],
    version: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

/* ================================================================
 * MAIN
 * ================================================================ */

async function main() {
  console.log("\n🧪 U3: Read-Only Discord Utility Tools Tests\n");

  // ===== TOOL REGISTRATION =====
  console.log("===== TOOL REGISTRATION =====");

  {
    const tools = createReadOnlyDiscordTools(() => null);
    assertEqual(tools.length, 5, "createReadOnlyDiscordTools returns 5 tools");

    const expectedNames = ["check_permissions", "health_check", "inspect_ai_config", "inspect_server", "list_channels"];
    const actualNames = tools.map((t) => t.name).sort();
    assertEqual(actualNames.join(","), expectedNames.join(","), "All 5 tool names present");

    for (const tool of tools) {
      assertEqual(tool.category, "discord", `Tool ${tool.name} is discord category`);
      assertEqual(tool.riskLevel, "low", `Tool ${tool.name} has low risk`);
      assertEqual(tool.confirmationRequired, false, `Tool ${tool.name} does not require confirmation`);
    }
  }

  // ===== REGISTRY INTEGRATION =====
  console.log("\n===== REGISTRY INTEGRATION =====");

  {
    const registry = new ToolRegistry();
    const tools = createReadOnlyDiscordTools(() => null);
    registry.registerAll(tools);

    assertEqual(registry.count(), 5, "Registry has 5 discord tools");

    for (const name of ["inspect_server", "list_channels", "check_permissions", "inspect_ai_config", "health_check"]) {
      assert(registry.has(name), `Registry has ${name}`);
      assert(registry.get(name) !== undefined, `Registry.get(${name}) returns a tool`);
    }
  }

  // ===== TOOL METADATA =====
  console.log("\n===== TOOL METADATA =====");

  {
    const tools = createReadOnlyDiscordTools(() => null);

    for (const tool of tools) {
      // Read-only tools should not require owner or admin
      assert(
        tool.requiredRole === "guest" || tool.requiredRole === "member" || tool.requiredRole === "moderator",
        `Tool ${tool.name} has reasonable role requirement: ${tool.requiredRole}`,
      );
      assert(tool.allowedScopes.includes("AI_CHAT") || tool.allowedScopes.includes("AI_MANAGEMENT"),
        `Tool ${tool.name} has AI_CHAT or AI_MANAGEMENT scope`);
    }
  }

  // ===== VALIDATOR INTEGRATION =====
  console.log("\n===== VALIDATOR INTEGRATION =====");

  {
    const tools = createReadOnlyDiscordTools(() => null);
    saveGuildAIConfig(makeGuildConfig());
    const guildConfig = loadGuildAIConfig("guild_u3_test");

    for (const tool of tools) {
      const ctx = makeContext({ arguments: { _toolName: tool.name } });
      const result = validateToolRequest(tool, ctx, guildConfig, false);
      assert(result.allowed === true, `Tool ${tool.name} passes validation for member role`);
    }
  }

  // ===== INSPECT_SERVER =====
  console.log("\n===== INSPECT_SERVER =====");

  {
    const tool = createReadOnlyDiscordTools(() => null).find((t) => t.name === "inspect_server")!;
    const ctx = makeContext();
    const result = await tool.execute(ctx);
    assertEqual(result.status, "error", "inspect_server returns error when client is null");
  }

  // ===== LIST_CHANNELS =====
  console.log("\n===== LIST_CHANNELS =====");

  {
    const tool = createReadOnlyDiscordTools(() => null).find((t) => t.name === "list_channels")!;
    const ctx = makeContext();
    const result = await tool.execute(ctx);
    assertEqual(result.status, "error", "list_channels returns error when client is null");
  }

  // ===== CHECK_PERMISSIONS =====
  console.log("\n===== CHECK_PERMISSIONS =====");

  {
    const tool = createReadOnlyDiscordTools(() => null).find((t) => t.name === "check_permissions")!;
    const ctx = makeContext();
    const result = await tool.execute(ctx);
    assertEqual(result.status, "error", "check_permissions returns error when client is null");
  }

  // ===== INSPECT_AI_CONFIG =====
  console.log("\n===== INSPECT_AI_CONFIG =====");

  {
    const tool = createReadOnlyDiscordTools(() => null).find((t) => t.name === "inspect_ai_config")!;
    const ctx = makeContext();

    saveGuildAIConfig(makeGuildConfig());

    const result = await tool.execute(ctx);
    assertEqual(result.status, "success", "inspect_ai_config returns success");
    assert(result.message.includes("AI Configuration"), "inspect_ai_config message contains header");
    assert(result.message.includes("Enabled"), "inspect_ai_config shows enabled status");
    assert(result.message.includes("ch_u3_1"), "inspect_ai_config shows channel IDs");
    assert(result.data !== undefined, "inspect_ai_config includes data");
  }

  // ===== HEALTH_CHECK =====
  console.log("\n===== HEALTH_CHECK =====");

  {
    const tool = createReadOnlyDiscordTools(() => null).find((t) => t.name === "health_check")!;
    const ctx = makeContext();
    const result = await tool.execute(ctx);
    assertEqual(result.status, "success", "health_check returns success");
    assert(result.message.includes("System Health"), "health_check message contains header");
    assert(result.message.includes("healthy") || result.message.includes("degraded") || result.message.includes("unhealthy"),
      "health_check shows overall status");
  }

  // ===== DENIAL REASONS =====
  console.log("\n===== DENIAL REASONS =====");

  {
    const tool = createReadOnlyDiscordTools(() => null).find((t) => t.name === "inspect_ai_config")!;
    saveGuildAIConfig(makeGuildConfig());
    const guildConfig = loadGuildAIConfig("guild_u3_test");

    const guestCtx = makeContext({
      requesterRole: "guest",
      arguments: { _toolName: "inspect_ai_config" },
    });
    const result = validateToolRequest(tool, guestCtx, guildConfig, false);
    assertEqual(result.allowed, false, "inspect_ai_config denies guest role");
    assertEqual(result.denialReason, "INSUFFICIENT_ROLE", "inspect_ai_config denial reason is INSUFFICIENT_ROLE");
  }

  // ===== SCOPE VALIDATION =====
  console.log("\n===== SCOPE VALIDATION =====");

  {
    const tools = createReadOnlyDiscordTools(() => null);

    for (const tool of tools) {
      assert(
        tool.allowedScopes.includes("AI_CHAT") || tool.allowedScopes.includes("AI_MANAGEMENT"),
        `Tool ${tool.name} has at least one valid scope`,
      );
    }
  }

  // ===== RISK LEVELS =====
  console.log("\n===== RISK LEVELS =====");

  {
    const tools = createReadOnlyDiscordTools(() => null);
    for (const tool of tools) {
      assertEqual(tool.riskLevel, "low", `Tool ${tool.name} has riskLevel "low"`);
    }
  }

  // ===== TOOL COUNTS =====
  console.log("\n===== TOOL COUNTS =====");

  {
    const registry = new ToolRegistry();
    registry.registerAll(createReadOnlyDiscordTools(() => null));

    const byCategory = registry.getByCategory("discord");
    assertEqual(byCategory.length, 5, "All 5 discord tools registered in category");

    const allTools = registry.getAll();
    assert(allTools.length >= 5, "Registry has at least 5 tools total");
  }

  /* ================================================================
   * SUMMARY
   * ================================================================ */

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  if (failed === 0) {
    console.log("🎉 ALL U3 DISCORD TOOLS TESTS PASSED");
  } else {
    console.log("💥 SOME U3 TESTS FAILED");
    process.exit(1);
  }
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
}

main();
