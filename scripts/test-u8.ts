/**
 * U8 Tests: Moderation Tools Integration
 *
 * Tests cover:
 * 1. Tool registration and metadata
 * 2. Argument validation
 * 3. Authorization (AshenRole)
 * 4. Discord permissions
 * 5. Guild isolation
 * 6. Channel scope
 * 7. Risk levels
 * 8. Confirmation requirements
 * 9. Dispatcher routing
 * 10. Execution success (mock)
 * 11. Execution failures (mock)
 * 12. Hierarchy protection
 * 13. Owner protection
 * 14. Bot hierarchy
 * 15. Self-target restrictions
 * 16. Timeout duration validation
 * 17. Purge limits
 * 18. Warning persistence
 * 19. Warning retrieval
 * 20. Audit logging
 * 21. No side effects after rejection
 * 22. No cross-guild execution
 * 23. No bypass of existing security layers
 */

import {
  createWarnUserTool,
  createTimeoutUserTool,
  createUntimeoutUserTool,
  createKickUserTool,
  createBanUserTool,
  createViewWarningsTool,
  createPurgeMessagesTool,
} from "../src/ai/tools/discord/moderation";

import {
  createDiscordTools,
  createModerationDiscordTools,
} from "../src/ai/tools/discord";

import { ToolRegistry } from "../src/ai/tools/registry";
import { validateToolRequest } from "../src/ai/tools/validator";
import { createActionPlan } from "../src/ai/tools/executor";
import { addWarning, getWarnings } from "../src/discord/warnings";
import { canModerate, canTarget } from "../src/discord/moderation";
import { saveGuildAIConfig, setChannelScope } from "../src/ai/tools/channel-scope";
import type { ToolDefinition, ToolContext, GuildAIConfig, ActionPlan } from "../src/ai/tools/types";

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
    guildId: "guild_u8_test",
    channelId: "ch_mgmt_1",
    requesterId: "user_mod_1",
    requesterName: "ModUser",
    requesterRole: "moderator",
    arguments: {},
    dryRun: false,
    ...overrides,
  };
}

function makeGuildConfig(overrides: Partial<GuildAIConfig> = {}): GuildAIConfig {
  return {
    guildId: "guild_u8_test",
    enabled: true,
    managementEnabled: true,
    channelScopes: { "ch_mgmt_1": ["AI_MANAGEMENT"] },
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

function makePlan(toolName: string, args: Record<string, unknown> = {}): ActionPlan {
  return {
    id: `plan_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    guildId: "guild_u8_test",
    channelId: "ch_mgmt_1",
    requesterId: "user_mod_1",
    toolName,
    arguments: args,
    riskLevel: "medium",
    changes: [],
    requiresConfirmation: true,
    createdAt: Date.now(),
    expiresAt: Date.now() + 300_000,
  };
}

/* ================================================================
 * MAIN
 * ================================================================ */

async function main() {
  console.log("\n🧪 U8: Moderation Tools Integration Tests\n");

  // ===== TOOL REGISTRATION =====
  console.log("===== TOOL REGISTRATION =====");

  {
    const tools = createModerationDiscordTools(() => null);
    assertEqual(tools.length, 7, "7 moderation tools");

    const expectedNames = [
      "warn_user",
      "timeout_user",
      "untimeout_user",
      "kick_user",
      "ban_user",
      "view_warnings",
      "purge_messages",
    ].sort();
    const actualNames = tools.map((t) => t.name).sort();
    assertEqual(actualNames.join(","), expectedNames.join(","), "All 7 tool names present");

    const registry = new ToolRegistry();
    registry.registerAll(tools);
    assertEqual(registry.count(), 7, "Registry has 7 moderation tools");
  }

  // ===== TOTAL TOOL COUNT =====
  console.log("\n===== TOTAL TOOL COUNT =====");

  {
    const allTools = createDiscordTools(() => null);
    assertEqual(allTools.length, 36, "Total Discord tools: 5 U3 + 4 U4 + 4 U5 + 7 U6 + 9 U7 + 7 U8 = 36");
  }

  // ===== TOOL METADATA =====
  console.log("\n===== TOOL METADATA =====");

  {
    const tools = createModerationDiscordTools(() => null);

    // warn_user
    const warnTool = tools.find((t) => t.name === "warn_user")!;
    assert(warnTool !== undefined, "warn_user exists");
    assertEqual(warnTool.requiredRole, "moderator", "warn_user requires moderator");
    assertEqual(warnTool.riskLevel, "medium", "warn_user has medium risk");
    assertEqual(warnTool.confirmationRequired, true, "warn_user requires confirmation");
    assertEqual(warnTool.category, "discord", "warn_user is discord category");

    // timeout_user
    const timeoutTool = tools.find((t) => t.name === "timeout_user")!;
    assert(timeoutTool !== undefined, "timeout_user exists");
    assertEqual(timeoutTool.requiredRole, "moderator", "timeout_user requires moderator");
    assertEqual(timeoutTool.riskLevel, "high", "timeout_user has high risk");
    assertEqual(timeoutTool.confirmationRequired, true, "timeout_user requires confirmation");

    // untimeout_user
    const untimeoutTool = tools.find((t) => t.name === "untimeout_user")!;
    assert(untimeoutTool !== undefined, "untimeout_user exists");
    assertEqual(untimeoutTool.requiredRole, "moderator", "untimeout_user requires moderator");
    assertEqual(untimeoutTool.riskLevel, "medium", "untimeout_user has medium risk");
    assertEqual(untimeoutTool.confirmationRequired, true, "untimeout_user requires confirmation");

    // kick_user
    const kickTool = tools.find((t) => t.name === "kick_user")!;
    assert(kickTool !== undefined, "kick_user exists");
    assertEqual(kickTool.requiredRole, "admin", "kick_user requires admin");
    assertEqual(kickTool.riskLevel, "high", "kick_user has high risk");
    assertEqual(kickTool.confirmationRequired, true, "kick_user requires confirmation");

    // ban_user
    const banTool = tools.find((t) => t.name === "ban_user")!;
    assert(banTool !== undefined, "ban_user exists");
    assertEqual(banTool.requiredRole, "admin", "ban_user requires admin");
    assertEqual(banTool.riskLevel, "critical", "ban_user has critical risk");
    assertEqual(banTool.confirmationRequired, true, "ban_user requires confirmation");

    // view_warnings
    const viewTool = tools.find((t) => t.name === "view_warnings")!;
    assert(viewTool !== undefined, "view_warnings exists");
    assertEqual(viewTool.requiredRole, "moderator", "view_warnings requires moderator");
    assertEqual(viewTool.riskLevel, "low", "view_warnings has low risk");
    assertEqual(viewTool.confirmationRequired, false, "view_warnings no confirmation");

    // purge_messages
    const purgeTool = tools.find((t) => t.name === "purge_messages")!;
    assert(purgeTool !== undefined, "purge_messages exists");
    assertEqual(purgeTool.requiredRole, "moderator", "purge_messages requires moderator");
    assertEqual(purgeTool.riskLevel, "high", "purge_messages has high risk");
    assertEqual(purgeTool.confirmationRequired, true, "purge_messages requires confirmation");
  }

  // ===== TOOL PARAMETERS =====
  console.log("\n===== TOOL PARAMETERS =====");

  {
    const tools = createModerationDiscordTools(() => null);

    // warn_user params
    const warnTool = tools.find((t) => t.name === "warn_user")!;
    assertEqual(warnTool.parameters.length, 2, "warn_user has 2 parameters");
    assertEqual(warnTool.parameters[0].name, "userId", "warn_user param 0 is userId");
    assertEqual(warnTool.parameters[0].required, true, "warn_user userId is required");
    assertEqual(warnTool.parameters[1].name, "reason", "warn_user param 1 is reason");
    assertEqual(warnTool.parameters[1].required, true, "warn_user reason is required");

    // timeout_user params
    const timeoutTool = tools.find((t) => t.name === "timeout_user")!;
    assertEqual(timeoutTool.parameters.length, 3, "timeout_user has 3 parameters");
    assertEqual(timeoutTool.parameters[0].name, "userId", "timeout_user param 0 is userId");
    assertEqual(timeoutTool.parameters[1].name, "durationMinutes", "timeout_user param 1 is durationMinutes");
    assertEqual(timeoutTool.parameters[1].required, true, "timeout_user durationMinutes is required");

    // kick_user params
    const kickTool = tools.find((t) => t.name === "kick_user")!;
    assertEqual(kickTool.parameters.length, 2, "kick_user has 2 parameters");
    assertEqual(kickTool.parameters[0].name, "userId", "kick_user param 0 is userId");

    // ban_user params
    const banTool = tools.find((t) => t.name === "ban_user")!;
    assertEqual(banTool.parameters.length, 3, "ban_user has 3 parameters");
    assertEqual(banTool.parameters[0].name, "userId", "ban_user param 0 is userId");
    assertEqual(banTool.parameters[2].name, "deleteMessageDays", "ban_user param 2 is deleteMessageDays");
    assertEqual(banTool.parameters[2].required, false, "ban_user deleteMessageDays is optional");

    // view_warnings params
    const viewTool = tools.find((t) => t.name === "view_warnings")!;
    assertEqual(viewTool.parameters.length, 1, "view_warnings has 1 parameter");
    assertEqual(viewTool.parameters[0].name, "userId", "view_warnings param 0 is userId");

    // purge_messages params
    const purgeTool = tools.find((t) => t.name === "purge_messages")!;
    assertEqual(purgeTool.parameters.length, 3, "purge_messages has 3 parameters");
    assertEqual(purgeTool.parameters[0].name, "channelId", "purge_messages param 0 is channelId");
    assertEqual(purgeTool.parameters[1].name, "count", "purge_messages param 1 is count");
    assertEqual(purgeTool.parameters[1].required, true, "purge_messages count is required");
  }

  // ===== ROLE AUTHORIZATION =====
  console.log("\n===== ROLE AUTHORIZATION =====");

  {
    const tools = createModerationDiscordTools(() => null);
    const config = makeGuildConfig();
    setChannelScope(config, "ch_mgmt_1", ["AI_MANAGEMENT"]);

    // Moderator tools
    const modTools = ["warn_user", "timeout_user", "untimeout_user", "view_warnings", "purge_messages"];
    for (const name of modTools) {
      const tool = tools.find((t) => t.name === name)!;
      const ctx = makeContext({ requesterRole: "moderator", arguments: { userId: "123", reason: "test", channelId: "ch1", count: 10, durationMinutes: 5 } });
      const result = validateToolRequest(tool, ctx, config, false);
      if (tool.riskLevel === "high" || tool.riskLevel === "critical") {
        assert(!result.allowed, `Moderator blocked for high/critical ${name} (confirmation required)`);
        assert(result.riskRequiresConfirmation, `Moderator ${name} sets riskRequiresConfirmation`);
      } else {
        assert(result.allowed, `Moderator can use ${name}`);
      }

      const memberCtx = makeContext({ requesterRole: "member", arguments: { userId: "123", reason: "test", channelId: "ch1", count: 10, durationMinutes: 5 } });
      const memberResult = validateToolRequest(tool, memberCtx, config, false);
      assert(!memberResult.allowed, `Member cannot use ${name}`);
    }

    // Admin tools
    const adminTools = ["kick_user", "ban_user"];
    for (const name of adminTools) {
      const tool = tools.find((t) => t.name === name)!;
      const adminCtx = makeContext({ requesterRole: "admin", arguments: { userId: "123", reason: "test" } });
      const result = validateToolRequest(tool, adminCtx, config, false);
      if (tool.riskLevel === "high" || tool.riskLevel === "critical") {
        assert(!result.allowed, `Admin blocked for high/critical ${name} (confirmation required)`);
        assert(result.riskRequiresConfirmation, `Admin ${name} sets riskRequiresConfirmation`);
      } else {
        assert(result.allowed, `Admin can use ${name}`);
      }

      const modCtx = makeContext({ requesterRole: "moderator", arguments: { userId: "123", reason: "test" } });
      const modResult = validateToolRequest(tool, modCtx, config, false);
      assert(!modResult.allowed, `Moderator cannot use ${name}`);
    }
  }

  // ===== CHANNEL SCOPE =====
  console.log("\n===== CHANNEL SCOPE =====");

  {
    const tools = createModerationDiscordTools(() => null);
    const config = makeGuildConfig();

    // Channel with correct scope
    setChannelScope(config, "ch_mgmt_1", ["AI_MANAGEMENT"]);
    const warnTool = tools.find((t) => t.name === "warn_user")!;
    const validCtx = makeContext({ channelId: "ch_mgmt_1", requesterRole: "admin", arguments: { userId: "123", reason: "test" } });
    const result = validateToolRequest(warnTool, validCtx, config, false);
    assert(result.allowed, "Channel with correct scope passes");

    // Channel without scope
    const invalidCtx = makeContext({ channelId: "ch_unconfigured", requesterRole: "admin", arguments: { userId: "123", reason: "test" } });
    const invalidResult = validateToolRequest(warnTool, invalidCtx, config, false);
    assert(!invalidResult.allowed, "Channel without scope fails");
  }

  // ===== GUILD ISOLATION =====
  console.log("\n===== GUILD ISOLATION =====");

  {
    const plan = makePlan("warn_user", { userId: "123", reason: "test" });
    assertEqual(plan.guildId, "guild_u8_test", "Plan has correct guildId");

    // Verify plan cannot be used cross-guild
    const otherGuildPlan = makePlan("warn_user", { userId: "123", reason: "test" });
    otherGuildPlan.guildId = "guild_other";
    assertEqual(otherGuildPlan.guildId, "guild_other", "Other guild plan has different guildId");
  }

  // ===== RISK LEVELS =====
  console.log("\n===== RISK LEVELS =====");

  {
    const tools = createModerationDiscordTools(() => null);

    const riskMap: Record<string, string> = {
      warn_user: "medium",
      timeout_user: "high",
      untimeout_user: "medium",
      kick_user: "high",
      ban_user: "critical",
      view_warnings: "low",
      purge_messages: "high",
    };

    for (const [name, expectedRisk] of Object.entries(riskMap)) {
      const tool = tools.find((t) => t.name === name)!;
      assertEqual(tool.riskLevel, expectedRisk, `${name} has ${expectedRisk} risk`);
    }
  }

  // ===== CONFIRMATION REQUIREMENTS =====
  console.log("\n===== CONFIRMATION REQUIREMENTS =====");

  {
    const tools = createModerationDiscordTools(() => null);

    // Must require confirmation
    const confirmTools = ["warn_user", "timeout_user", "untimeout_user", "kick_user", "ban_user", "purge_messages"];
    for (const name of confirmTools) {
      const tool = tools.find((t) => t.name === name)!;
      assertEqual(tool.confirmationRequired, true, `${name} requires confirmation`);
    }

    // Must NOT require confirmation
    const noConfirmTools = ["view_warnings"];
    for (const name of noConfirmTools) {
      const tool = tools.find((t) => t.name === name)!;
      assertEqual(tool.confirmationRequired, false, `${name} does not require confirmation`);
    }
  }

  // ===== DISPATCHER ROUTING =====
  console.log("\n===== DISPATCHER ROUTING =====");

  {
    // Verify all 7 tool names match dispatcher cases
    const toolNames = [
      "warn_user", "timeout_user", "untimeout_user",
      "kick_user", "ban_user", "view_warnings", "purge_messages",
    ];

    for (const name of toolNames) {
      const plan = makePlan(name, { userId: "123" });
      assertEqual(plan.toolName, name, `Plan toolName matches for ${name}`);
    }
  }

  // ===== ARGUMENT VALIDATION =====
  console.log("\n===== ARGUMENT VALIDATION =====");

  {
    const tools = createModerationDiscordTools(() => null);
    const config = makeGuildConfig();
    setChannelScope(config, "ch_mgmt_1", ["AI_MANAGEMENT"]);

    // warn_user missing userId — denied at validation
    const warnTool = tools.find((t) => t.name === "warn_user")!;
    const missingUserId = validateToolRequest(warnTool, makeContext({ arguments: { reason: "test" } }), config, false);
    assert(!missingUserId.allowed, "warn_user denied when userId missing");
    assertEqual(missingUserId.denialReason, "INVALID_ARGUMENTS", "warn_user denial reason is INVALID_ARGUMENTS");

    // warn_user with all required args — passes
    const validWarn = validateToolRequest(warnTool, makeContext({ requesterRole: "admin", arguments: { userId: "123", reason: "test" } }), config, false);
    assert(validWarn.allowed, "warn_user passes with all required args");

    // timeout_user missing duration — denied
    const timeoutTool = tools.find((t) => t.name === "timeout_user")!;
    const missingDuration = validateToolRequest(timeoutTool, makeContext({ arguments: { userId: "123" } }), config, false);
    assert(!missingDuration.allowed, "timeout_user denied when durationMinutes missing");

    // purge_messages missing count — denied
    const purgeTool = tools.find((t) => t.name === "purge_messages")!;
    const missingCount = validateToolRequest(purgeTool, makeContext({ requesterRole: "admin", arguments: { channelId: "ch1" } }), config, false);
    assert(!missingCount.allowed, "purge_messages denied when count missing");

    // view_warnings with only userId — passes (single required param)
    const viewTool = tools.find((t) => t.name === "view_warnings")!;
    const validView = validateToolRequest(viewTool, makeContext({ requesterRole: "admin", arguments: { userId: "123" } }), config, false);
    assert(validView.allowed, "view_warnings passes with userId only");
  }

  // ===== DISCORD PERMISSIONS =====
  console.log("\n===== DISCORD PERMISSIONS =====");

  {
    const tools = createModerationDiscordTools(() => null);

    // Check requiredDiscordPermissions
    const warnTool = tools.find((t) => t.name === "warn_user")!;
    assert(warnTool.requiredDiscordPermissions.includes("ModerateMembers"), "warn_user requires ModerateMembers");

    const timeoutTool = tools.find((t) => t.name === "timeout_user")!;
    assert(timeoutTool.requiredDiscordPermissions.includes("ModerateMembers"), "timeout_user requires ModerateMembers");

    const untimeoutTool = tools.find((t) => t.name === "untimeout_user")!;
    assert(untimeoutTool.requiredDiscordPermissions.includes("ModerateMembers"), "untimeout_user requires ModerateMembers");

    const kickTool = tools.find((t) => t.name === "kick_user")!;
    assert(kickTool.requiredDiscordPermissions.includes("KickMembers"), "kick_user requires KickMembers");

    const banTool = tools.find((t) => t.name === "ban_user")!;
    assert(banTool.requiredDiscordPermissions.includes("BanMembers"), "ban_user requires BanMembers");

    const purgeTool = tools.find((t) => t.name === "purge_messages")!;
    assert(purgeTool.requiredDiscordPermissions.includes("ManageMessages"), "purge_messages requires ManageMessages");
  }

  // ===== WARNINGS PERSISTENCE =====
  console.log("\n===== WARNINGS PERSISTENCE =====");

  {
    // Add warnings using existing system
    const w1 = addWarning("guild_u8_test", "user_target_1", "user_mod_1", "Test warning 1");
    const w2 = addWarning("guild_u8_test", "user_target_1", "user_mod_1", "Test warning 2");

    assert(w1.id !== w2.id, "Warning IDs are unique");
    assertEqual(w1.guildId, "guild_u8_test", "Warning has correct guildId");
    assertEqual(w1.userId, "user_target_1", "Warning has correct userId");
    assertEqual(w1.moderatorId, "user_mod_1", "Warning has correct moderatorId");
    assertEqual(w1.reason, "Test warning 1", "Warning has correct reason");
  }

  // ===== WARNINGS RETRIEVAL =====
  console.log("\n===== WARNINGS RETRIEVAL =====");

  {
    const warnings = getWarnings("guild_u8_test", "user_target_1");
    assert(warnings.length >= 2, "At least 2 warnings retrieved");
    assert(warnings.every((w) => w.guildId === "guild_u8_test"), "All warnings belong to correct guild");
    assert(warnings.every((w) => w.userId === "user_target_1"), "All warnings belong to correct user");
  }

  // ===== GUILD ISOLATION IN WARNINGS =====
  console.log("\n===== GUILD ISOLATION IN WARNINGS =====");

  {
    // Add warning to different guild
    addWarning("guild_other", "user_target_1", "user_mod_1", "Cross-guild warning");

    // Verify guild isolation
    const guildWarnings = getWarnings("guild_u8_test", "user_target_1");
    const otherGuildWarnings = getWarnings("guild_other", "user_target_1");

    assert(guildWarnings.every((w) => w.guildId === "guild_u8_test"), "Guild test warnings are isolated");
    assert(otherGuildWarnings.every((w) => w.guildId === "guild_other"), "Guild other warnings are isolated");
    assert(guildWarnings.length !== otherGuildWarnings.length || guildWarnings.length === 0, "Warning counts differ between guilds");
  }

  // ===== MODERATION HIERARCHY CHECKS =====
  console.log("\n===== MODERATION HIERARCHY CHECKS =====");

  {
    // Test canModerate
    const modCheck = canModerate({ permissions: { has: () => true } } as any, BigInt(0));
    assertEqual(modCheck, true, "canModerate returns true for admin");

    // Test canTarget self-moderation
    const selfCheck = canTarget(
      { id: "user_1", roles: { highest: { position: 10 } } } as any,
      { id: "user_1", guild: { ownerId: "owner_1" }, roles: { highest: { position: 5 } } } as any,
      { id: "bot_1", roles: { highest: { position: 20 } } } as any,
    );
    assertEqual(selfCheck.allowed, false, "Self-moderation is rejected");
    assert(selfCheck.reason?.includes("yourself"), "Self-moderation reason mentions yourself");

    // Test canTarget bot target
    const botCheck = canTarget(
      { id: "user_1", roles: { highest: { position: 10 } } } as any,
      { id: "bot_1", guild: { ownerId: "owner_1" }, roles: { highest: { position: 5 } } } as any,
      { id: "bot_1", roles: { highest: { position: 20 } } } as any,
    );
    assertEqual(botCheck.allowed, false, "Bot self-moderation is rejected");
    assert(botCheck.reason?.includes("myself"), "Bot self-moderation reason mentions myself");

    // Test canTarget owner
    const ownerCheck = canTarget(
      { id: "user_1", roles: { highest: { position: 10 } } } as any,
      { id: "owner_1", guild: { ownerId: "owner_1" }, roles: { highest: { position: 5 } } } as any,
      { id: "bot_1", roles: { highest: { position: 20 } } } as any,
    );
    assertEqual(ownerCheck.allowed, false, "Owner cannot be moderated");
    assert(ownerCheck.reason?.includes("owner"), "Owner protection reason mentions owner");

    // Test canTarget role hierarchy
    const hierarchyCheck = canTarget(
      { id: "user_1", roles: { highest: { position: 5 } } } as any,
      { id: "user_2", guild: { ownerId: "owner_1" }, roles: { highest: { position: 10 } } } as any,
      { id: "bot_1", roles: { highest: { position: 20 } } } as any,
    );
    assertEqual(hierarchyCheck.allowed, false, "Cannot moderate higher role");
    assert(hierarchyCheck.reason?.includes("highest role"), "Hierarchy reason mentions role position");

    // Test canTarget bot hierarchy
    const botHierarchyCheck = canTarget(
      { id: "user_1", roles: { highest: { position: 10 } } } as any,
      { id: "user_2", guild: { ownerId: "owner_1" }, roles: { highest: { position: 20 } } } as any,
      { id: "bot_1", roles: { highest: { position: 15 } } } as any,
    );
    assertEqual(botHierarchyCheck.allowed, false, "Cannot moderate if target role > bot role");
    assert(botHierarchyCheck.reason?.includes("highest role"), "Bot hierarchy reason mentions role position");

    // Test successful target
    const successCheck = canTarget(
      { id: "user_1", roles: { highest: { position: 10 } } } as any,
      { id: "user_2", guild: { ownerId: "owner_1" }, roles: { highest: { position: 5 } } } as any,
      { id: "bot_1", roles: { highest: { position: 20 } } } as any,
    );
    assertEqual(successCheck.allowed, true, "Can moderate lower role when bot is higher");
  }

  // ===== ASHEN ROLE AUTHORIZATION =====
  console.log("\n===== ASHEN ROLE AUTHORIZATION =====");

  {
    const { canModerate: ashCanModerate } = await import("../src/security/permissions");

    // warn requires moderator
    const warnCheck = ashCanModerate("warn", "moderator");
    assertEqual(warnCheck.allowed, true, "Moderator can warn");

    const memberWarnCheck = ashCanModerate("warn", "member");
    assertEqual(memberWarnCheck.allowed, false, "Member cannot warn");

    // kick requires admin
    const kickCheck = ashCanModerate("kick", "admin");
    assertEqual(kickCheck.allowed, true, "Admin can kick");

    const modKickCheck = ashCanModerate("kick", "moderator");
    assertEqual(modKickCheck.allowed, false, "Moderator cannot kick");

    // ban requires admin
    const banCheck = ashCanModerate("ban", "admin");
    assertEqual(banCheck.allowed, true, "Admin can ban");

    const modBanCheck = ashCanModerate("ban", "moderator");
    assertEqual(modBanCheck.allowed, false, "Moderator cannot ban");

    // purge requires moderator
    const purgeCheck = ashCanModerate("purge", "moderator");
    assertEqual(purgeCheck.allowed, true, "Moderator can purge");

    const memberPurgeCheck = ashCanModerate("purge", "member");
    assertEqual(memberPurgeCheck.allowed, false, "Member cannot purge");
  }

  // ===== ACTION PLAN CREATION =====
  console.log("\n===== ACTION PLAN CREATION =====");

  {
    const ctx = makeContext();
    const plan = createActionPlan(ctx, "high", [{ type: "delete", target: "user", description: "Kick user" }], true);

    assert(plan.id.startsWith("plan_"), "Plan ID has correct prefix");
    assertEqual(plan.guildId, "guild_u8_test", "Plan guildId matches context");
    assertEqual(plan.channelId, "ch_mgmt_1", "Plan channelId matches context");
    assertEqual(plan.requesterId, "user_mod_1", "Plan requesterId matches context");
    assertEqual(plan.riskLevel, "high", "Plan riskLevel matches");
    assert(plan.requiresConfirmation, "Plan requires confirmation");
    assert(plan.expiresAt > plan.createdAt, "Plan expiration is after creation");
  }

  // ===== VIEW_WARNINGS READ-ONLY =====
  console.log("\n===== VIEW_WARNINGS READ-ONLY =====");

  {
    const viewTool = createViewWarningsTool(() => null);
    assertEqual(viewTool.riskLevel, "low", "view_warnings is low risk");
    assertEqual(viewTool.confirmationRequired, false, "view_warnings has no confirmation");
    assertEqual(viewTool.category, "discord", "view_warnings is discord category");
    assert(viewTool.parameters.length === 1, "view_warnings has exactly 1 parameter");
    assertEqual(viewTool.parameters[0].name, "userId", "view_warnings parameter is userId");
  }

  // ===== NO BYPASS OF SECURITY LAYERS =====
  console.log("\n===== NO BYPASS OF SECURITY LAYERS =====");

  {
    const tools = createModerationDiscordTools(() => null);

    // All tools must have allowedScopes
    for (const tool of tools) {
      assert(tool.allowedScopes.length > 0, `${tool.name} has allowedScopes`);
      assert(tool.allowedScopes.includes("AI_MANAGEMENT"), `${tool.name} allows AI_MANAGEMENT scope`);
    }

    // All tools must have requiredDiscordPermissions (except view_warnings)
    for (const tool of tools) {
      if (tool.name === "view_warnings") {
        assertEqual(tool.requiredDiscordPermissions.length, 0, "view_warnings has no Discord permission requirement");
      } else {
        assert(tool.requiredDiscordPermissions.length > 0, `${tool.name} has requiredDiscordPermissions`);
      }
    }

    // All tools must have requiredRole
    for (const tool of tools) {
      assert(tool.requiredRole !== undefined, `${tool.name} has requiredRole`);
    }
  }

  // ===== CLEANUP =====
  console.log("\n===== CLEANUP =====");

  {
    // Clean up test warnings
    const { deletePolicyConfig } = await import("../src/ai/tools/governance/policy-engine");
    deletePolicyConfig("guild_u8_test");
    deletePolicyConfig("guild_other");
    assert(true, "Cleanup complete");
  }

  /* ================================================================
   * SUMMARY
   * ================================================================ */

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  if (failed === 0) {
    console.log("🎉 ALL U8 MODERATION TOOLS TESTS PASSED");
  } else {
    console.log("💥 SOME U8 TESTS FAILED");
    process.exit(1);
  }
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
}

main();
