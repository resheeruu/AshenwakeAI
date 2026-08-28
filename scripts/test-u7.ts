/**
 * U7 Tests: Governance & Policy Engine
 *
 * Tests cover:
 * 1. Policy creation, loading, persistence
 * 2. Malformed policy rejection
 * 3. Guild isolation
 * 4. Inspection: compliant, violations, missing resources
 * 5. Templates: all 5, invalid template, prohibited permissions
 * 6. Drift detection: no drift, permission drift, channel drift
 * 7. Remediation: plan generation, protected resource rejection
 * 8. Pattern matching
 * 9. Rule validation
 * 10. Tool registration and metadata
 * 11. Authorization (role enforcement)
 * 12. Deterministic evaluation
 */

import {
  loadPolicyConfig,
  savePolicyConfig,
  deletePolicyConfig,
  hasPolicy,
  validatePolicyConfig,
  validateRule,
  inspectPolicy,
  matchesPattern,
  generateRuleId,
  type GuildState,
  type ChannelInfo,
} from "../src/ai/tools/governance/policy-engine";

import {
  isValidTemplate,
  getValidTemplateNames,
  applyTemplate,
  templateHasProhibitedPermissions,
  getProhibitedPermissions,
  type TemplateName,
} from "../src/ai/tools/governance/policy-templates";

import { detectDrift } from "../src/ai/tools/governance/drift-detection";
import { generateRemediationPlan } from "../src/ai/tools/governance/remediation";
import { createGovernanceTools } from "../src/ai/tools/governance/governance-tools";
import {
  executeCreateGuildPolicyPlan,
  executeUpdateGuildPolicyPlan,
  executeApplyPolicyTemplatePlan,
} from "../src/ai/tools/governance/governance-tools";
import { ToolRegistry } from "../src/ai/tools/registry";
import { validateToolRequest } from "../src/ai/tools/validator";
import type { PolicyConfig, PolicyRule, GuildAIConfig, ToolContext, ActionPlan } from "../src/ai/tools/types";
import { saveGuildAIConfig } from "../src/ai/tools/channel-scope";

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

function makeGuildConfig(overrides: Partial<GuildAIConfig> = {}): GuildAIConfig {
  return {
    guildId: "guild_u7_test",
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

function makePolicyConfig(overrides: Partial<PolicyConfig> = {}): PolicyConfig {
  return {
    id: "policy_u7_test",
    guildId: "guild_u7_test",
    name: "Test Policy",
    description: "Test governance policy",
    rules: [],
    protectedChannels: [],
    protectedCategories: [],
    exemptChannels: [],
    exemptCategories: [],
    driftDetection: { enabled: false, intervalMs: 3600_000 },
    version: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

function makeRule(overrides: Partial<PolicyRule> = {}): PolicyRule {
  return {
    id: generateRuleId(),
    type: "channel_type",
    enabled: true,
    description: "Test rule",
    channelPattern: "#test",
    expectedType: "text",
    riskIfViolated: "low",
    ...overrides,
  };
}

function makeGuildState(overrides: Partial<GuildState> = {}): GuildState {
  return {
    guildId: "guild_u7_test",
    channels: [],
    categories: [],
    roles: [],
    everyoneRoleId: "role_everyone",
    ...overrides,
  };
}

function makeContext(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    guildId: "guild_u7_test",
    channelId: "ch_mgmt_1",
    requesterId: "user_admin_1",
    requesterName: "AdminUser",
    requesterRole: "admin",
    arguments: {},
    dryRun: false,
    ...overrides,
  };
}

/* ================================================================
 * MAIN
 * ================================================================ */

async function main() {
  console.log("\n🧪 U7: Governance & Policy Engine Tests\n");

  // ===== POLICY PERSISTENCE =====
  console.log("===== POLICY PERSISTENCE =====");

  {
    const config = makePolicyConfig();
    savePolicyConfig(config);

    assert(hasPolicy("guild_u7_test"), "Policy exists after save");
    const loaded = loadPolicyConfig("guild_u7_test");
    assertEqual(loaded.name, "Test Policy", "Loaded policy name matches");
    assertEqual(loaded.rules.length, 0, "Loaded policy has 0 rules");
    assertEqual(loaded.guildId, "guild_u7_test", "Loaded policy has correct guildId");

    // Delete
    assert(deletePolicyConfig("guild_u7_test"), "Delete returns true");
    assert(!hasPolicy("guild_u7_test"), "Policy gone after delete");

    // Load non-existent returns default
    const defaults = loadPolicyConfig("guild_nonexistent");
    assertEqual(defaults.name, "Default Policy", "Non-existent policy returns defaults");
    assertEqual(defaults.rules.length, 0, "Default policy has 0 rules");
  }

  // ===== GUILD ISOLATION =====
  console.log("\n===== GUILD ISOLATION =====");

  {
    savePolicyConfig(makePolicyConfig({ guildId: "guild_iso_a", name: "Policy A" }));
    savePolicyConfig(makePolicyConfig({ guildId: "guild_iso_b", name: "Policy B" }));

    const policyA = loadPolicyConfig("guild_iso_a");
    const policyB = loadPolicyConfig("guild_iso_b");

    assertEqual(policyA.name, "Policy A", "Guild A has Policy A");
    assertEqual(policyB.name, "Policy B", "Guild B has Policy B");
    assertEqual(policyA.guildId, "guild_iso_a", "Policy A belongs to Guild A");
    assertEqual(policyB.guildId, "guild_iso_b", "Policy B belongs to Guild B");

    deletePolicyConfig("guild_iso_a");
    deletePolicyConfig("guild_iso_b");
  }

  // ===== RULE VALIDATION =====
  console.log("\n===== RULE VALIDATION =====");

  {
    // Valid rule
    const valid = makeRule();
    assertEqual(validateRule(valid).valid, true, "Valid rule passes validation");

    // Missing id
    const noId = makeRule({ id: "" });
    assertEqual(validateRule(noId).valid, false, "Rule without id fails");

    // Invalid type
    const badType = makeRule({ type: "invalid" as any });
    assertEqual(validateRule(badType).valid, false, "Rule with invalid type fails");

    // channel_type without expectedType
    const noExpected = makeRule({ type: "channel_type", expectedType: undefined });
    assertEqual(validateRule(noExpected).valid, false, "channel_type without expectedType fails");

    // channel_permission without permission
    const noPerm = makeRule({ type: "channel_permission", permission: undefined, permissionOp: undefined });
    assertEqual(validateRule(noPerm).valid, false, "channel_permission without permission fails");

    // required_channel without requiredName
    const noReq = makeRule({ type: "required_channel", requiredName: undefined });
    assertEqual(validateRule(noReq).valid, false, "required_channel without requiredName fails");

    // required_category without requiredName
    const noReqCat = makeRule({ type: "required_category", requiredName: undefined });
    assertEqual(validateRule(noReqCat).valid, false, "required_category without requiredName fails");
  }

  // ===== POLICY CONFIG VALIDATION =====
  console.log("\n===== POLICY CONFIG VALIDATION =====");

  {
    // Valid config
    const valid = makePolicyConfig();
    assertEqual(validatePolicyConfig(valid).valid, true, "Valid config passes");

    // Missing guildId
    const noGuild = makePolicyConfig({ guildId: "" });
    assertEqual(validatePolicyConfig(noGuild).valid, false, "Config without guildId fails");

    // Missing name
    const noName = makePolicyConfig({ name: "" });
    assertEqual(validatePolicyConfig(noName).valid, false, "Config without name fails");

    // Invalid rule in config
    const badRule = makePolicyConfig({
      rules: [makeRule({ id: "" })],
    });
    assertEqual(validatePolicyConfig(badRule).valid, false, "Config with invalid rule fails");
  }

  // ===== PATTERN MATCHING =====
  console.log("\n===== PATTERN MATCHING =====");

  {
    assert(matchesPattern("#general", "#general"), "Exact match");
    assert(matchesPattern("#general", "#*"), "Wildcard match");
    assert(!matchesPattern("#general", "#announcements"), "No match");
    assert(matchesPattern("Staff", "Staff"), "Exact category match");
    assert(matchesPattern("Staff", "*"), "Wildcard category match");
    assert(matchesPattern("staff-chat", "staff-*"), "Prefix match");
    assert(!matchesPattern("general", "staff-*"), "Prefix no match");
  }

  // ===== INSPECTION: COMPLIANT =====
  console.log("\n===== INSPECTION: COMPLIANT =====");

  {
    const policy = makePolicyConfig({
      rules: [
        makeRule({
          id: "r1",
          type: "required_channel",
          requiredName: "general",
        }),
      ],
    });

    const state = makeGuildState({
      channels: [
        { id: "ch1", name: "general", type: 0, parentId: null },
      ],
    });

    const result = inspectPolicy(policy, state);
    assertEqual(result.status, "compliant", "Compliant status");
    assertEqual(result.totalViolations, 0, "No violations");
    assertEqual(result.totalRulesEvaluated, 1, "1 rule evaluated");
  }

  // ===== INSPECTION: VIOLATION =====
  console.log("\n===== INSPECTION: VIOLATION =====");

  {
    const policy = makePolicyConfig({
      rules: [
        makeRule({
          id: "r1",
          type: "required_channel",
          requiredName: "moderation",
          riskIfViolated: "high",
        }),
      ],
    });

    const state = makeGuildState({
      channels: [
        { id: "ch1", name: "general", type: 0, parentId: null },
      ],
    });

    const result = inspectPolicy(policy, state);
    assertEqual(result.status, "violation", "Violation status");
    assertEqual(result.totalViolations, 1, "1 violation");
    assert(result.violations[0].message.includes("missing"), "Violation mentions missing");
  }

  // ===== INSPECTION: PERMISSION VIOLATION =====
  console.log("\n===== INSPECTION: PERMISSION VIOLATION =====");

  {
    const policy = makePolicyConfig({
      rules: [
        makeRule({
          id: "r1",
          type: "channel_permission",
          channelPattern: "#announcements",
          permission: "SendMessages",
          permissionOp: "must_deny",
          riskIfViolated: "critical",
        }),
      ],
    });

    const state = makeGuildState({
      channels: [
        {
          id: "ch1",
          name: "announcements",
          type: 5,
          parentId: null,
          permissionOverwrites: [{
            id: "role_everyone",
            type: 0,
            allow: "2048",
            deny: "0",
          }],
        },
      ],
    });

    const result = inspectPolicy(policy, state);
    assertEqual(result.status, "violation", "Permission violation detected");
    assertEqual(result.totalViolations, 1, "1 violation");
    assertEqual(result.criticalViolations, 1, "1 critical violation");
  }

  // ===== INSPECTION: EXEMPT CHANNELS =====
  console.log("\n===== INSPECTION: EXEMPT CHANNELS =====");

  {
    const policy = makePolicyConfig({
      rules: [
        makeRule({
          id: "r1",
          type: "channel_permission",
          channelPattern: "#*",
          permission: "SendMessages",
          permissionOp: "must_deny",
          riskIfViolated: "high",
        }),
      ],
      exemptChannels: ["ch_exempt"],
    });

    const state = makeGuildState({
      channels: [
        { id: "ch_normal", name: "normal", type: 0, parentId: null },
        { id: "ch_exempt", name: "exempt", type: 0, parentId: null },
      ],
    });

    const result = inspectPolicy(policy, state);
    // ch_normal has SendMessages neutral → violation
    // ch_exempt is exempted → not checked
    assert(result.violations.length > 0, "Violation on non-exempt channel");
    // ch_exempt should NOT be in violations
    const exemptViolation = result.violations.find((v) => v.channelId === "ch_exempt");
    assert(!exemptViolation, "Exempt channel not checked");
  }

  // ===== TEMPLATES =====
  console.log("\n===== TEMPLATES =====");

  {
    const names = getValidTemplateNames();
    assertEqual(names.length, 5, "5 templates defined");
    assert(names.includes("community"), "community template exists");
    assert(names.includes("gaming"), "gaming template exists");
    assert(names.includes("moderated"), "moderated template exists");
    assert(names.includes("staff-managed"), "staff-managed template exists");
    assert(names.includes("private"), "private template exists");

    // Invalid template
    assertEqual(isValidTemplate("invalid"), false, "Invalid template rejected");
    assertEqual(isValidTemplate(""), false, "Empty template rejected");

    // Apply template
    const communityConfig = applyTemplate("community", "guild_test");
    assertEqual(communityConfig.guildId, "guild_test", "Applied template has correct guildId");
    assert(communityConfig.rules.length > 0, "Applied template has rules");
    assertEqual(communityConfig.template, "community", "Applied template records source");

    // Prohibited permissions
    assertEqual(templateHasProhibitedPermissions("community"), false, "community has no prohibited perms");
    assertEqual(templateHasProhibitedPermissions("gaming"), false, "gaming has no prohibited perms");
    assertEqual(templateHasProhibitedPermissions("moderated"), false, "moderated has no prohibited perms");
    assertEqual(templateHasProhibitedPermissions("staff-managed"), false, "staff-managed has no prohibited perms");
    assertEqual(templateHasProhibitedPermissions("private"), false, "private has no prohibited perms");
  }

  // ===== DRIFT DETECTION: NO DRIFT =====
  console.log("\n===== DRIFT DETECTION: NO DRIFT =====");

  {
    const policy = makePolicyConfig({
      rules: [
        makeRule({
          id: "r1",
          type: "channel_permission",
          channelPattern: "#announcements",
          permission: "SendMessages",
          permissionOp: "must_deny",
        }),
      ],
    });

    const state = makeGuildState({
      channels: [{
        id: "ch1",
        name: "announcements",
        type: 5,
        parentId: null,
        permissionOverwrites: [{
          id: "role_everyone",
          type: 0,
          allow: "0",
          deny: "2048",
        }],
      }],
    });

    const report = detectDrift(policy, state);
    assertEqual(report.status, "NO_DRIFT", "No drift detected");
    assertEqual(report.totalDrifts, 0, "0 drifts");
  }

  // ===== DRIFT DETECTION: PERMISSION DRIFT =====
  console.log("\n===== DRIFT DETECTION: PERMISSION DRIFT =====");

  {
    const policy = makePolicyConfig({
      rules: [
        makeRule({
          id: "r1",
          type: "channel_permission",
          channelPattern: "#announcements",
          permission: "SendMessages",
          permissionOp: "must_deny",
          riskIfViolated: "high",
        }),
      ],
    });

    const state = makeGuildState({
      channels: [{
        id: "ch1",
        name: "announcements",
        type: 5,
        parentId: null,
        permissionOverwrites: [{
          id: "role_everyone",
          type: 0,
          allow: "2048",
          deny: "0",
        }],
      }],
    });

    const report = detectDrift(policy, state);
    assertEqual(report.status, "DRIFT_DETECTED", "Drift detected");
    assertEqual(report.totalDrifts, 1, "1 drift");
    assertEqual(report.drift[0].expected, "denied", "Expected denied");
    assertEqual(report.drift[0].actual, "allowed", "Actual allowed");
  }

  // ===== DRIFT DETECTION: MISSING CHANNEL =====
  console.log("\n===== DRIFT DETECTION: MISSING CHANNEL =====");

  {
    const policy = makePolicyConfig({
      rules: [
        makeRule({
          id: "r1",
          type: "required_channel",
          requiredName: "announcements",
          riskIfViolated: "medium",
        }),
      ],
    });

    const state = makeGuildState({
      channels: [],
    });

    const report = detectDrift(policy, state);
    assertEqual(report.status, "DRIFT_DETECTED", "Drift detected for missing channel");
    assertEqual(report.totalDrifts, 1, "1 drift");
    assertEqual(report.drift[0].expected, "present", "Expected present");
    assertEqual(report.drift[0].actual, "missing", "Actual missing");
  }

  // ===== REMEDIATION: PLAN GENERATION =====
  console.log("\n===== REMEDIATION: PLAN GENERATION =====");

  {
    const drift = {
      ruleId: "r1",
      ruleType: "channel_permission" as const,
      channelId: "ch1",
      expected: "denied",
      actual: "allowed",
      severity: "high" as const,
      detectedAt: Date.now(),
    };

    const plan = generateRemediationPlan("guild_test", drift);
    assert(plan !== null, "Remediation plan generated");
    assertEqual(plan!.steps.length, 1, "1 step in plan");
    assertEqual(plan!.guildId, "guild_test", "Plan has correct guildId");
    assert(plan!.riskLevel === "high" || plan!.riskLevel === "critical", "Plan risk is high or critical");
    assertEqual(plan!.requiresConfirmation, true, "Plan requires confirmation");

    // Verify tool dispatch mapping
    const step = plan!.steps[0];
    assertEqual(step.toolName, "manage_channel_permissions", "Step maps to manage_channel_permissions");
    assert(step.toolArgs.channelId !== undefined, "Step has channelId in toolArgs");
    assert(step.toolArgs.permission !== undefined, "Step has permission in toolArgs");
    assert(step.toolArgs.allow !== undefined, "Step has allow in toolArgs");
  }

  // ===== REMEDIATION: PROTECTED RESOURCE REJECTION =====
  console.log("\n===== REMEDIATION: PROTECTED RESOURCE REJECTION =====");

  {
    saveGuildAIConfig(makeGuildConfig({
      guildId: "guild_protected",
      protectedChannels: ["ch_protected"],
    }));

    const drift = {
      ruleId: "r1",
      ruleType: "channel_permission" as const,
      channelId: "ch_protected",
      expected: "denied",
      actual: "allowed",
      severity: "high" as const,
      detectedAt: Date.now(),
    };

    const plan = generateRemediationPlan("guild_protected", drift);
    assertEqual(plan, null, "No remediation plan for protected channel");

    deletePolicyConfig("guild_protected");
  }

  // ===== TOOL REGISTRATION =====
  console.log("\n===== TOOL REGISTRATION =====");

  {
    const tools = createGovernanceTools(() => null);
    assertEqual(tools.length, 9, "9 governance tools");

    const expectedNames = [
      "view_guild_policy",
      "inspect_guild_governance",
      "detect_policy_drift",
      "generate_governance_report",
      "create_guild_policy",
      "update_guild_policy",
      "list_policy_templates",
      "apply_policy_template",
      "plan_policy_remediation",
    ].sort();
    const actualNames = tools.map((t) => t.name).sort();
    assertEqual(actualNames.join(","), expectedNames.join(","), "All 9 tool names present");

    const registry = new ToolRegistry();
    registry.registerAll(tools);
    assertEqual(registry.count(), 9, "Registry has 9 tools");
  }

  // ===== TOOL METADATA =====
  console.log("\n===== TOOL METADATA =====");

  {
    const tools = createGovernanceTools(() => null);

    // Read-only tools (5 — includes plan_policy_remediation)
    const readOnlyTools = ["view_guild_policy", "inspect_guild_governance", "detect_policy_drift", "generate_governance_report", "plan_policy_remediation"];
    for (const name of readOnlyTools) {
      const tool = tools.find((t) => t.name === name)!;
      assert(tool !== undefined, `Tool ${name} exists`);
      assertEqual(tool.requiredRole, name === "plan_policy_remediation" ? "admin" : "moderator", `${name} requires correct role`);
      assertEqual(tool.riskLevel, "low", `${name} has low risk`);
      assertEqual(tool.confirmationRequired, false, `${name} no confirmation`);
    }

    // Policy management tools (2)
    const policyTools = ["create_guild_policy", "update_guild_policy"];
    for (const name of policyTools) {
      const tool = tools.find((t) => t.name === name)!;
      assert(tool !== undefined, `Tool ${name} exists`);
      assertEqual(tool.requiredRole, "admin", `${name} requires admin`);
      assertEqual(tool.riskLevel, "medium", `${name} has medium risk`);
      assertEqual(tool.confirmationRequired, true, `${name} requires confirmation`);
    }

    // Template tools
    const listTool = tools.find((t) => t.name === "list_policy_templates")!;
    assertEqual(listTool.requiredRole, "moderator", "list_policy_templates requires moderator");
    assertEqual(listTool.riskLevel, "low", "list_policy_templates has low risk");

    const applyTool = tools.find((t) => t.name === "apply_policy_template")!;
    assertEqual(applyTool.requiredRole, "admin", "apply_policy_template requires admin");
    assertEqual(applyTool.riskLevel, "high", "apply_policy_template has high risk");
    assertEqual(applyTool.confirmationRequired, true, "apply_policy_template requires confirmation");
  }

  // ===== TOTAL TOOL COUNT =====
  console.log("\n===== TOTAL TOOL COUNT =====");

  {
    const { createDiscordTools } = await import("../src/ai/tools/discord");
    const allTools = createDiscordTools(() => null);
    assertEqual(allTools.length, 36, "Total Discord tools: 5 U3 + 4 U4 + 4 U5 + 7 U6 + 9 U7 + 7 U8 = 36");
  }

  // ===== DETERMINISTIC EVALUATION =====
  console.log("\n===== DETERMINISTIC EVALUATION =====");

  {
    const policy = makePolicyConfig({
      rules: [
        makeRule({
          id: "r1",
          type: "channel_permission",
          channelPattern: "#test",
          permission: "SendMessages",
          permissionOp: "must_deny",
        }),
      ],
    });

    const state = makeGuildState({
      channels: [{
        id: "ch1",
        name: "test",
        type: 0,
        parentId: null,
        permissionOverwrites: [{
          id: "role_everyone",
          type: 0,
          allow: "0",
          deny: "2048",
        }],
      }],
    });

    // Run 3 times — must be identical
    const r1 = inspectPolicy(policy, state);
    const r2 = inspectPolicy(policy, state);
    const r3 = inspectPolicy(policy, state);

    assertEqual(r1.status, r2.status, "Deterministic: run 1 == run 2");
    assertEqual(r2.status, r3.status, "Deterministic: run 2 == run 3");
    assertEqual(r1.totalViolations, r2.totalViolations, "Deterministic: violations 1 == 2");
    assertEqual(r2.totalViolations, r3.totalViolations, "Deterministic: violations 2 == 3");
  }

  // ===== TOOL CLIENT UNAVAILABLE =====
  console.log("\n===== TOOL CLIENT UNAVAILABLE =====");

  {
    const tools = createGovernanceTools(() => null);
    const clientTools = tools.filter((t) =>
      ["inspect_guild_governance", "detect_policy_drift", "generate_governance_report", "plan_policy_remediation"].includes(t.name),
    );

    for (const tool of clientTools) {
      const ctx = makeContext();
      const result = await tool.execute(ctx);
      assert(
        result.status === "error" || result.status === "denied",
        `Tool ${tool.name} handles null client (got ${result.status})`,
      );
    }
  }

  // ===== CONFIRMATION DISPATCHER: GOVERNANCE PLANS =====
  console.log("\n===== CONFIRMATION DISPATCHER: GOVERNANCE PLANS =====");

  {
    function makePlan(toolName: string, args: Record<string, unknown> = {}): ActionPlan {
      return {
        id: `plan_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        guildId: "guild_u7_test",
        channelId: "ch_mgmt_1",
        requesterId: "user_admin_1",
        toolName,
        arguments: args,
        riskLevel: "medium",
        changes: [],
        requiresConfirmation: true,
        createdAt: Date.now(),
        expiresAt: Date.now() + 300_000,
      };
    }

    // --- create_guild_policy: success ---
    {
      const config = makePolicyConfig({ name: "Dispatcher Test Policy" });
      const plan = makePlan("create_guild_policy", { name: "Dispatcher Test Policy", _policyConfig: config });

      const result = await executeCreateGuildPolicyPlan(plan);
      assertEqual(result.status, "success", "create_guild_policy plan executes successfully");
      assert(result.message.includes("Policy created"), "create_guild_policy result mentions created");
      assert(hasPolicy("guild_u7_test"), "Policy persisted after create_guild_policy plan");

      const loaded = loadPolicyConfig("guild_u7_test");
      assertEqual(loaded.name, "Dispatcher Test Policy", "Persisted policy has correct name");
    }

    // --- create_guild_policy: missing _policyConfig ---
    {
      const plan = makePlan("create_guild_policy", { name: "No Config" });
      const result = await executeCreateGuildPolicyPlan(plan);
      assertEqual(result.status, "error", "create_guild_policy missing config returns error");
    }

    // --- create_guild_policy: invalid policy config ---
    {
      const badConfig = makePolicyConfig({ name: "" });
      const plan = makePlan("create_guild_policy", { name: "", _policyConfig: badConfig });
      const result = await executeCreateGuildPolicyPlan(plan);
      assertEqual(result.status, "validation_error", "create_guild_policy invalid config returns validation_error");
    }

    // --- update_guild_policy: success ---
    {
      const existing = makePolicyConfig({ name: "Original Name" });
      savePolicyConfig(existing);

      const updated = makePolicyConfig({ name: "Updated Name", version: 2 });
      const plan = makePlan("update_guild_policy", { name: "Updated Name", _policyConfig: updated });

      const result = await executeUpdateGuildPolicyPlan(plan);
      assertEqual(result.status, "success", "update_guild_policy plan executes successfully");
      assert(result.message.includes("Policy updated"), "update_guild_policy result mentions updated");

      const loaded = loadPolicyConfig("guild_u7_test");
      assertEqual(loaded.name, "Updated Name", "Policy name updated after plan execution");
    }

    // --- update_guild_policy: missing _policyConfig ---
    {
      const plan = makePlan("update_guild_policy", {});
      const result = await executeUpdateGuildPolicyPlan(plan);
      assertEqual(result.status, "error", "update_guild_policy missing config returns error");
    }

    // --- apply_policy_template: success ---
    {
      const config = applyTemplate("community", "guild_u7_test");
      const plan = makePlan("apply_policy_template", {
        template: "community",
        _policyConfig: config,
      });

      const result = await executeApplyPolicyTemplatePlan(plan);
      assertEqual(result.status, "success", "apply_policy_template plan executes successfully");
      assert(result.message.includes("template applied"), "apply_policy_template result mentions template");
      assert(result.message.includes("community"), "apply_policy_template result mentions template name");

      const loaded = loadPolicyConfig("guild_u7_test");
      assertEqual(loaded.template, "community", "Persisted policy has template source");
    }

    // --- apply_policy_template: invalid template ---
    {
      const plan = makePlan("apply_policy_template", { template: "invalid", _policyConfig: makePolicyConfig() });
      const result = await executeApplyPolicyTemplatePlan(plan);
      assertEqual(result.status, "validation_error", "apply_policy_template invalid template returns validation_error");
    }

    // --- apply_policy_template: missing _policyConfig ---
    {
      const plan = makePlan("apply_policy_template", { template: "community" });
      const result = await executeApplyPolicyTemplatePlan(plan);
      assertEqual(result.status, "error", "apply_policy_template missing config returns error");
    }

    // --- Guild isolation: mismatched config guildId is rejected ---
    {
      // create_guild_policy: config.guildId != plan.guildId → rejected
      const mismatchedConfig = makePolicyConfig({ guildId: "guild_other", name: "Mismatched Policy" });
      const createPlan = makePlan("create_guild_policy", {
        name: "Mismatched Policy",
        _policyConfig: mismatchedConfig,
      });
      const createResult = await executeCreateGuildPolicyPlan(createPlan);
      assertEqual(createResult.status, "denied", "create_guild_policy rejects mismatched guild");
      assert(!hasPolicy("guild_other"), "No policy persisted for mismatched create_guild_policy");

      // update_guild_policy: config.guildId != plan.guildId → rejected
      const updatePlan = makePlan("update_guild_policy", {
        name: "Mismatched Update",
        _policyConfig: mismatchedConfig,
      });
      const updateResult = await executeUpdateGuildPolicyPlan(updatePlan);
      assertEqual(updateResult.status, "denied", "update_guild_policy rejects mismatched guild");
      assert(!hasPolicy("guild_other"), "No policy persisted for mismatched update_guild_policy");

      // apply_policy_template: config.guildId != plan.guildId → rejected
      const applyPlan = makePlan("apply_policy_template", {
        template: "community",
        _policyConfig: mismatchedConfig,
      });
      const applyResult = await executeApplyPolicyTemplatePlan(applyPlan);
      assertEqual(applyResult.status, "denied", "apply_policy_template rejects mismatched guild");
      assert(!hasPolicy("guild_other"), "No policy persisted for mismatched apply_policy_template");
    }

    // --- Guild isolation: matching guild succeeds ---
    {
      const matchingConfig = makePolicyConfig({ guildId: "guild_u7_test", name: "Matching Policy" });
      const plan = makePlan("create_guild_policy", {
        name: "Matching Policy",
        _policyConfig: matchingConfig,
      });
      const result = await executeCreateGuildPolicyPlan(plan);
      assertEqual(result.status, "success", "create_guild_policy succeeds with matching guild");
    }
  }

  // ===== CLEANUP =====
  console.log("\n===== CLEANUP =====");

  {
    deletePolicyConfig("guild_u7_test");
    deletePolicyConfig("guild_test");
    assert(true, "Cleanup complete");
  }

  /* ================================================================
   * SUMMARY
   * ================================================================ */

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  if (failed === 0) {
    console.log("🎉 ALL U7 GOVERNANCE & POLICY ENGINE TESTS PASSED");
  } else {
    console.log("💥 SOME U7 TESTS FAILED");
    process.exit(1);
  }
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
}

main();
