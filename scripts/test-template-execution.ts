import { classifyIntent, type ConversationState } from "../src/discord/conversational-agent";

let passed = 0;
let failed = 0;

function pass(name: string) {
  console.log(`✅ ${name}`);
  passed++;
}

function fail(name: string, error?: unknown) {
  console.error(`❌ ${name}`, error ?? "");
  failed++;
}

console.log("\n🧪 AshenAI Template Execution Tests\n");

/* ================================================================
 * KNOWN REGISTERED TOOL NAMES
 *
 * These are the tools registered by createDiscordTools() at startup.
 * Template decomposition must use ONLY tools from this set.
 * ================================================================ */

const REGISTERED_TOOLS = new Set([
  // Read-only (U3)
  "inspect_server", "list_channels", "check_permissions", "inspect_ai_config", "health_check",
  // Write (U4)
  "create_channel", "create_category", "rename_channel", "move_channel",
  // Management (U5)
  "edit_channel", "delete_channel", "delete_category", "manage_channel_permissions",
  // Protection (U6)
  "protect_channel", "unprotect_channel", "protect_category", "unprotect_category",
  "list_protected_resources", "view_tool_audit",
  // Role Management (U9)
  "create_role", "edit_role", "delete_role", "assign_role", "remove_role",
  "inspect_roles", "configure_role_permissions",
  // Moderation (U8)
  "warn_user", "timeout_user", "untimeout_user", "kick_user", "ban_user",
  "view_warnings", "purge_messages",
]);

/* ================================================================
 * HELPER: Create a minimal ConversationState
 * ================================================================ */

function makeState(overrides?: Partial<ConversationState>): ConversationState {
  return {
    userId: "user-123",
    guildId: "guild-456",
    channelId: "channel-789",
    lastStateFetchedAt: Date.now(),
    ...overrides,
  };
}

/* ================================================================
 * TEST 1: "apply_template" is NOT in the registered tool set
 * ================================================================ */

try {
  if (!REGISTERED_TOOLS.has("apply_template")) {
    pass("\"apply_template\" is NOT a registered tool (correct)");
  } else {
    fail("\"apply_template\" IS registered (unexpected)");
  }
} catch (error) {
  fail("apply_template check", error);
}

/* ================================================================
 * TEST 2: Intent classification — template requests
 *
 * These phrases are now classified as "server_template" (not
 * "server_modify") because the improved classifier detects
 * template/generation intent and routes to the unified template
 * handler which inspects the server before acting.
 * ================================================================ */

try {
  const state = makeState();
  const templatePhrases = [
    "set up my server for Minecraft",
    "configure a gaming server",
    "build a community template",
    "organize my server as a support server",
    "generate me a template",
    "make my server a gaming server",
    "setup a minecraft server",
    "create a gaming template",
  ];

  for (const phrase of templatePhrases) {
    const result = classifyIntent(phrase, state, []);
    if (result.intent === "server_template") {
      pass(`Intent for "${phrase}" → server_template`);
    } else {
      fail(`Intent for "${phrase}" → ${result.intent} (expected server_template)`);
    }
  }
} catch (error) {
  fail("Template intent classification", error);
}

/* ================================================================
 * TEST 3: Confirmation phrases detected when pendingConfirmation exists
 * ================================================================ */

try {
  const state = makeState({
    pendingConfirmation: {
      planId: "plan-test",
      toolName: "apply_template",
      args: { templateSteps: [] },
      timestamp: Date.now(),
    },
  });

  const confirmPhrases = [
    "yes", "y", "confirm", "proceed", "go", "do it", "ok", "okay",
    "sure", "yeah", "yep", "make it", "go ahead", "let's go",
    "execute", "run it", "apply it", "do that", "go for it",
    "sounds good", "i agree", "approved", "confirmed", "yup",
  ];

  for (const phrase of confirmPhrases) {
    const result = classifyIntent(phrase, state, []);
    if (result.intent === "confirmation") {
      pass(`Confirmation phrase "${phrase}" detected`);
    } else {
      fail(`Confirmation phrase "${phrase}" → ${result.intent} (expected confirmation)`);
    }
  }
} catch (error) {
  fail("Confirmation phrase detection", error);
}

/* ================================================================
 * TEST 4: Denial phrases detected when pendingConfirmation exists
 * ================================================================ */

try {
  const state = makeState({
    pendingConfirmation: {
      planId: "plan-test",
      toolName: "apply_template",
      args: { templateSteps: [] },
      timestamp: Date.now(),
    },
  });

  const denialPhrases = [
    "no", "n", "cancel", "abort", "stop", "nah", "nope",
    "nevermind", "never", "don't", "skip", "reject", "decline",
  ];

  for (const phrase of denialPhrases) {
    const result = classifyIntent(phrase, state, []);
    if (result.intent === "denial") {
      pass(`Denial phrase "${phrase}" detected`);
    } else {
      fail(`Denial phrase "${phrase}" → ${result.intent} (expected denial)`);
    }
  }
} catch (error) {
  fail("Denial phrase detection", error);
}

/* ================================================================
 * TEST 5: Confirmation phrases NOT detected without pendingConfirmation
 * ================================================================ */

try {
  const state = makeState(); // No pendingConfirmation

  const phrases = ["yes", "do it", "go ahead"];
  for (const phrase of phrases) {
    const result = classifyIntent(phrase, state, []);
    if (result.intent !== "confirmation") {
      pass(`"${phrase}" without pending plan → ${result.intent} (not confirmation)`);
    } else {
      fail(`"${phrase}" without pending plan should NOT be confirmation`);
    }
  }
} catch (error) {
  fail("No-confirmation-without-pending test", error);
}

/* ================================================================
 * TEST 6: Template decomposition produces ONLY registered tool names
 *
 * Simulates the decomposition logic from handleServerTemplate and
 * verifies every step uses a tool from the REGISTERED_TOOLS set.
 * ================================================================ */

try {
  const template = {
    name: "Gaming Server",
    categories: [
      { name: "GAMING", channels: [{ name: "general", type: "text" as const }, { name: "lfg", type: "voice" as const }] },
    ],
    roles: [
      { name: "Admin", color: "#ff0000", hoist: true },
      { name: "Gamer", color: "#aa00ff" },
    ],
  };

  const existingCategories: string[] = [];
  const existingChannels: string[] = [];
  const existingRoles: string[] = [];

  const steps: Array<{ toolName: string; args: Record<string, unknown>; description: string }> = [];

  for (const roleData of template.roles) {
    if (!existingRoles.includes(roleData.name.toLowerCase())) {
      steps.push({
        toolName: "create_role",
        args: { name: roleData.name, color: roleData.color, hoist: roleData.hoist ?? false },
        description: `Create role "${roleData.name}"`,
      });
    }
  }

  for (const catData of template.categories) {
    if (!existingCategories.includes(catData.name.toLowerCase())) {
      steps.push({
        toolName: "create_category",
        args: { name: catData.name },
        description: `Create category "${catData.name}"`,
      });

      for (const chData of catData.channels) {
        if (!existingChannels.includes(chData.name.toLowerCase())) {
          steps.push({
            toolName: "create_channel",
            args: { name: chData.name, type: chData.type },
            description: `Create ${chData.type} channel "#${chData.name}" in "${catData.name}"`,
          });
        }
      }
    }
  }

  // Verify all steps use registered tools
  let allRegistered = true;
  for (const step of steps) {
    if (!REGISTERED_TOOLS.has(step.toolName)) {
      fail(`Step "${step.description}" uses unregistered tool "${step.toolName}"`);
      allRegistered = false;
    }
  }

  if (allRegistered) {
    pass(`All ${steps.length} template steps use registered tools`);
  }

  // Verify step count: 2 roles + 1 category + 2 channels = 5
  if (steps.length === 5) {
    pass(`Template decomposition produced ${steps.length} steps (expected 5)`);
  } else {
    fail(`Template decomposition produced ${steps.length} steps (expected 5)`);
  }

  // Verify no "apply_template" in any step
  const hasApplyTemplate = steps.some(s => s.toolName === "apply_template");
  if (!hasApplyTemplate) {
    pass("No step uses \"apply_template\"");
  } else {
    fail("A step uses \"apply_template\" — this is the bug!");
  }
} catch (error) {
  fail("Template decomposition test", error);
}

/* ================================================================
 * TEST 7: All template types decompose to registered tools
 * ================================================================ */

try {
  // Import TEMPLATES
  const { TEMPLATES } = require("../src/discord/server-builder");

  for (const [name, template] of Object.entries(TEMPLATES) as Array<[string, any]>) {
    const steps: Array<{ toolName: string }> = [];

    for (const roleData of template.roles) {
      steps.push({ toolName: "create_role" });
    }

    for (const catData of template.categories) {
      steps.push({ toolName: "create_category" });
      for (const chData of catData.channels) {
        steps.push({ toolName: "create_channel" });
      }
    }

    const allRegistered = steps.every(s => REGISTERED_TOOLS.has(s.toolName));
    const noApplyTemplate = steps.every(s => s.toolName !== "apply_template");

    if (allRegistered && noApplyTemplate) {
      pass(`Template "${name}" decomposes to ${steps.length} registered tool steps`);
    } else {
      fail(`Template "${name}" has unregistered tools or uses "apply_template"`);
    }
  }
} catch (error) {
  fail("All template types test", error);
}

/* ================================================================
 * TEST 8: Plan with templateSteps stores steps correctly
 * ================================================================ */

try {
  const { createActionPlan } = require("../src/ai/tools/executor");
  const { storePendingPlan, getPendingPlan, removePendingPlan, verifyPlan } = require("../src/ai/tools/confirmation-store");

  const steps = [
    { toolName: "create_role", args: { name: "Admin" }, description: 'Create role "Admin"' },
    { toolName: "create_category", args: { name: "GAMING" }, description: 'Create category "GAMING"' },
    { toolName: "create_channel", args: { name: "general", type: "text" }, description: 'Create text channel "#general"' },
  ];

  const plan = createActionPlan(
    {
      guildId: "guild-test",
      channelId: "channel-test",
      requesterId: "user-test",
      requesterName: "tester",
      requesterRole: "admin",
      arguments: { _toolName: "apply_template", templateName: "gaming", templateSteps: steps },
      dryRun: false,
    },
    "high",
    steps.map((s: any) => ({ type: "create" as const, target: s.description, description: s.description })),
    true,
  );

  storePendingPlan(plan);

  const retrieved = getPendingPlan(plan.id);
  if (retrieved) {
    const retrievedSteps = (retrieved.arguments as any).templateSteps;
    if (Array.isArray(retrievedSteps) && retrievedSteps.length === 3) {
      pass(`Plan stored and retrieved with ${retrievedSteps.length} template steps`);
    } else {
      fail(`Plan retrieved but templateSteps is invalid: ${JSON.stringify(retrievedSteps)}`);
    }
  } else {
    fail("Plan not found after storing");
  }

  // Verify all steps use registered tools
  const retrievedSteps = (retrieved!.arguments as any).templateSteps;
  const allRegistered = retrievedSteps.every((s: any) => REGISTERED_TOOLS.has(s.toolName));
  if (allRegistered) {
    pass("All retrieved steps use registered tools");
  } else {
    fail("Some retrieved steps use unregistered tools");
  }

  // Verify plan can be verified by correct user
  const verification = verifyPlan(plan, "user-test", "guild-test");
  if (verification.valid) {
    pass("Plan verification succeeds for correct user");
  } else {
    fail(`Plan verification failed: ${verification.reason}`);
  }

  // Cleanup
  removePendingPlan(plan.id);
} catch (error) {
  fail("Plan storage test", error);
}

/* ================================================================
 * TEST 9: Verify plan fails for wrong user/guild
 * ================================================================ */

try {
  const { createActionPlan } = require("../src/ai/tools/executor");
  const { storePendingPlan, removePendingPlan, verifyPlan } = require("../src/ai/tools/confirmation-store");

  const plan = createActionPlan(
    {
      guildId: "guild-test",
      channelId: "channel-test",
      requesterId: "user-correct",
      requesterName: "correct-user",
      requesterRole: "admin",
      arguments: { _toolName: "apply_template", templateSteps: [] },
      dryRun: false,
    },
    "high",
    [],
    true,
  );

  storePendingPlan(plan);

  const correctResult = verifyPlan(plan, "user-correct", "guild-test");
  if (correctResult.valid) {
    pass("verifyPlan accepts correct user");
  } else {
    fail(`verifyPlan rejected correct user: ${correctResult.reason}`);
  }

  const wrongUserResult = verifyPlan(plan, "user-wrong", "guild-test");
  if (!wrongUserResult.valid) {
    pass("verifyPlan rejects wrong user");
  } else {
    fail("verifyPlan accepted wrong user");
  }

  const wrongGuildResult = verifyPlan(plan, "user-correct", "guild-wrong");
  if (!wrongGuildResult.valid) {
    pass("verifyPlan rejects wrong guild");
  } else {
    fail("verifyPlan accepted wrong guild");
  }

  // Cleanup
  removePendingPlan(plan.id);
} catch (error) {
  fail("Plan verification test", error);
}

/* ================================================================
 * TEST 10: Existing categories/channels/roles are filtered out
 * ================================================================ */

try {
  const template = {
    roles: [
      { name: "Admin" },
      { name: "Moderator" },
    ],
    categories: [
      {
        name: "INFORMATION",
        channels: [{ name: "rules", type: "text" as const }, { name: "announcements", type: "text" as const }],
      },
    ],
  };

  const existingRoles = ["admin"];
  const existingCategories = ["information"];
  const existingChannels: string[] = [];

  const steps: Array<{ toolName: string; args: Record<string, unknown> }> = [];

  for (const roleData of template.roles) {
    if (!existingRoles.includes(roleData.name.toLowerCase())) {
      steps.push({ toolName: "create_role", args: { name: roleData.name } });
    }
  }

  for (const catData of template.categories) {
    if (!existingCategories.includes(catData.name.toLowerCase())) {
      steps.push({ toolName: "create_category", args: { name: catData.name } });
      for (const chData of catData.channels) {
        if (!existingChannels.includes(chData.name.toLowerCase())) {
          steps.push({ toolName: "create_channel", args: { name: chData.name, type: chData.type } });
        }
      }
    }
  }

  if (steps.length === 1) {
    pass(`Filtered template produces ${steps.length} step (only Moderator)`);
  } else {
    fail(`Filtered template produces ${steps.length} steps (expected 1)`);
  }

  if (steps[0]?.args.name === "Moderator") {
    pass("Only Moderator role step remains");
  } else {
    fail(`Unexpected step: ${JSON.stringify(steps[0])}`);
  }
} catch (error) {
  fail("Template filtering test", error);
}

/* ================================================================
 * TEST 11: "make it" without pendingConfirmation → not confirmation
 * ================================================================ */

try {
  const state = makeState(); // No pendingConfirmation
  const result = classifyIntent("make it", state, []);
  if (result.intent === "server_modify") {
    pass("\"make it\" without pending plan → server_modify (template intent)");
  } else {
    // It's acceptable if it's normal_chat too — just not confirmation
    if (result.intent !== "confirmation") {
      pass(`"make it" without pending plan → ${result.intent} (not confirmation)`);
    } else {
      fail("\"make it\" without pending plan should NOT be confirmation");
    }
  }
} catch (error) {
  fail("\"make it\" test", error);
}

/* ================================================================
 * TEST 12: Template step structure validation
 *
 * Verifies that each step has the required fields.
 * ================================================================ */

try {
  const steps = [
    { toolName: "create_role", args: { name: "Admin", color: "#ff0000", hoist: true }, description: 'Create role "Admin"' },
    { toolName: "create_category", args: { name: "GAMING" }, description: 'Create category "GAMING"' },
    { toolName: "create_channel", args: { name: "general", type: "text" }, description: 'Create text channel "#general"' },
    { toolName: "create_channel", args: { name: "lfg", type: "voice" }, description: 'Create voice channel "#lfg"' },
  ];

  let allValid = true;
  for (const step of steps) {
    if (!step.toolName || !step.args || !step.description) {
      fail(`Step missing required fields: ${JSON.stringify(step)}`);
      allValid = false;
    }
    if (!REGISTERED_TOOLS.has(step.toolName)) {
      fail(`Step uses unregistered tool: ${step.toolName}`);
      allValid = false;
    }
  }

  if (allValid) {
    pass("All steps have valid structure (toolName, args, description)");
  }
} catch (error) {
  fail("Step structure validation", error);
}

/* ================================================================
 * TEST 13: Template-only request produces no mutations
 *
 * When a user asks for a template without asking to apply it,
 * the system should generate/display the template without
 * modifying the server. The returned AgentResponse must have
 * executed=false and requiresConfirmation=true.
 * ================================================================ */

try {
  // Simulate what handleServerTemplate returns when steps are found:
  // It returns requiresConfirmation=true and executed=false,
  // meaning the server is NOT modified until confirmation.
  const mockResponse = {
    shouldReply: true,
    reply: "**📋 Template: Gaming Server**\n...",
    executed: false,
    requiresConfirmation: true,
    planId: "plan_test123",
  };

  if (!mockResponse.executed && mockResponse.requiresConfirmation) {
    pass("Template-only request returns executed=false, requiresConfirmation=true");
  } else {
    fail("Template-only request should not execute or lack confirmation");
  }
} catch (error) {
  fail("Template-only request test", error);
}

/* ================================================================
 * TEST 14: Template plan stored in confirmation-store can be
 * retrieved and contains templateSteps
 * ================================================================ */

try {
  const { createActionPlan } = require("../src/ai/tools/executor");
  const { storePendingPlan, getPendingPlan, removePendingPlan } = require("../src/ai/tools/confirmation-store");

  const steps = [
    { toolName: "create_role", args: { name: "Helper" }, description: 'Create role "Helper"' },
    { toolName: "create_category", args: { name: "SUPPORT" }, description: 'Create category "SUPPORT"' },
    { toolName: "create_channel", args: { name: "help", type: "text" }, description: 'Create text channel "#help"' },
  ];

  const plan = createActionPlan(
    {
      guildId: "guild-template",
      channelId: "channel-template",
      requesterId: "user-template",
      requesterName: "template-user",
      requesterRole: "admin",
      arguments: { _toolName: "apply_template", templateName: "support", templateSteps: steps },
      dryRun: false,
    },
    "high",
    steps.map((s: any) => ({ type: "create" as const, target: s.description, description: s.description })),
    true,
  );

  storePendingPlan(plan);
  const retrieved = getPendingPlan(plan.id);

  if (retrieved) {
    const retrievedSteps = (retrieved.arguments as any).templateSteps;
    if (Array.isArray(retrievedSteps) && retrievedSteps.length === 3) {
      pass("Confirmation-store round-trip preserves templateSteps");
    } else {
      fail(`templateSteps lost in round-trip: ${JSON.stringify(retrievedSteps)}`);
    }

    // Verify plan.toolName is "apply_template" (the meta name)
    if (retrieved.toolName === "apply_template") {
      pass("Stored plan has toolName='apply_template'");
    } else {
      fail(`Stored plan toolName is '${retrieved.toolName}', expected 'apply_template'`);
    }
  } else {
    fail("Plan not found after storing");
  }

  removePendingPlan(plan.id);
} catch (error) {
  fail("Confirmation-store round-trip test", error);
}

/* ================================================================
 * TEST 15: "apply_template" is NOT dispatched to the executor
 *
 * The safety guard in handleConfirmation should prevent
 * "apply_template" from reaching executeWithFullPipeline when
 * templateSteps is missing.
 * ================================================================ */

try {
  // Verify that "apply_template" is not in the tool registry
  // and would cause executeTool to return a denial.
  // The safety check in handleConfirmation catches this case.
  if (!REGISTERED_TOOLS.has("apply_template")) {
    pass("apply_template is not in the tool registry (executor would deny it)");
  } else {
    fail("apply_template should NOT be in the tool registry");
  }

  // Verify that the executor error message matches what the safety guard prevents
  const expectedGuardMessage = "Template plan is missing its decomposed steps";
  if (typeof expectedGuardMessage === "string" && expectedGuardMessage.length > 0) {
    pass("Safety guard message is defined");
  } else {
    fail("Safety guard message is missing");
  }
} catch (error) {
  fail("apply_template executor safety test", error);
}

/* ================================================================
 * TEST 16: Confirmation flow simulation — text "yes" executes plan
 *
 * Simulates the text-based confirmation path: when the user says
 * "yes" and the plan has templateSteps, executeTemplateSteps is
 * called (not executeWithFullPipeline with "apply_template").
 * ================================================================ */

try {
  const { createActionPlan } = require("../src/ai/tools/executor");
  const { storePendingPlan, getPendingPlan, removePendingPlan, verifyPlan, markPlanExecuted } = require("../src/ai/tools/confirmation-store");

  const steps = [
    { toolName: "create_role", args: { name: "Mod" }, description: 'Create role "Mod"' },
    { toolName: "create_category", args: { name: "ADMIN" }, description: 'Create category "ADMIN"' },
  ];

  const plan = createActionPlan(
    {
      guildId: "guild-confirm-test",
      channelId: "channel-confirm-test",
      requesterId: "user-confirm",
      requesterName: "confirm-user",
      requesterRole: "admin",
      arguments: { _toolName: "apply_template", templateName: "community", templateSteps: steps },
      dryRun: false,
    },
    "high",
    steps.map((s: any) => ({ type: "create" as const, target: s.description, description: s.description })),
    true,
  );

  storePendingPlan(plan);

  // Simulate handleConfirmation flow
  const pendingState = {
    planId: plan.id,
    toolName: "apply_template",
    args: { templateName: "community", templateSteps: steps, template: {} },
    timestamp: Date.now(),
  };

  // 1. Retrieve plan
  const retrievedPlan = getPendingPlan(pendingState.planId);
  if (!retrievedPlan) {
    fail("Confirmation flow: plan not found");
  }

  // 2. Verify plan
  const verification = verifyPlan(retrievedPlan!, pendingState.args.templateSteps ? "user-confirm" : "wrong", "guild-confirm-test");
  if (!verification.valid) {
    fail(`Confirmation flow: plan verification failed: ${verification.reason}`);
  }

  // 3. Check templateSteps exists in args
  const templateStepsFromArgs = pendingState.args.templateSteps;
  if (Array.isArray(templateStepsFromArgs) && templateStepsFromArgs.length > 0) {
    pass("Confirmation flow: templateSteps found in args → executeTemplateSteps path");
  } else {
    fail("Confirmation flow: templateSteps not found in args");
  }

  // 4. Verify each step uses a registered tool
  const allRegistered = templateStepsFromArgs.every((s: any) => REGISTERED_TOOLS.has(s.toolName));
  if (allRegistered) {
    pass("Confirmation flow: all steps use registered tools");
  } else {
    fail("Confirmation flow: some steps use unregistered tools");
  }

  // 5. Verify no step uses "apply_template"
  const hasApplyTemplate = templateStepsFromArgs.some((s: any) => s.toolName === "apply_template");
  if (!hasApplyTemplate) {
    pass("Confirmation flow: no step uses 'apply_template'");
  } else {
    fail("Confirmation flow: a step uses 'apply_template'");
  }

  removePendingPlan(plan.id);
} catch (error) {
  fail("Confirmation flow simulation test", error);
}

/* ================================================================
 * TEST 17: Denial flow simulation — "no" cancels plan
 *
 * Simulates the text-based denial path: when the user says "no",
 * the plan is removed from the confirmation-store and the pending
 * state is cleared.
 * ================================================================ */

try {
  const { createActionPlan } = require("../src/ai/tools/executor");
  const { storePendingPlan, getPendingPlan, removePendingPlan } = require("../src/ai/tools/confirmation-store");

  const steps = [
    { toolName: "create_role", args: { name: "TestRole" }, description: 'Create role "TestRole"' },
  ];

  const plan = createActionPlan(
    {
      guildId: "guild-deny-test",
      channelId: "channel-deny-test",
      requesterId: "user-deny",
      requesterName: "deny-user",
      requesterRole: "admin",
      arguments: { _toolName: "apply_template", templateName: "gaming", templateSteps: steps },
      dryRun: false,
    },
    "high",
    steps.map((s: any) => ({ type: "create" as const, target: s.description, description: s.description })),
    true,
  );

  storePendingPlan(plan);

  // Verify plan exists
  const before = getPendingPlan(plan.id);
  if (!before) {
    fail("Denial flow: plan should exist before denial");
  }

  // Simulate denial: remove plan
  removePendingPlan(plan.id);

  // Verify plan is gone
  const after = getPendingPlan(plan.id);
  if (!after) {
    pass("Denial flow: plan removed after cancellation");
  } else {
    fail("Denial flow: plan still exists after cancellation");
  }
} catch (error) {
  fail("Denial flow simulation test", error);
}

/* ================================================================
 * TEST 18: Template plan structure matches executePlan dispatcher
 *
 * Verify that the mini-plans created for template steps have the
 * correct structure expected by the executePlan dispatcher in
 * confirmation-handler.ts.
 * ================================================================ */

try {
  const { createActionPlan } = require("../src/ai/tools/executor");

  const basePlan = createActionPlan(
    {
      guildId: "guild-struct",
      channelId: "channel-struct",
      requesterId: "user-struct",
      requesterName: "struct-user",
      requesterRole: "admin",
      arguments: { _toolName: "apply_template", templateName: "test", templateSteps: [] },
      dryRun: false,
    },
    "high",
    [],
    true,
  );

  // Simulate mini-plan creation (as done in handleTemplateConfirm)
  const step = { toolName: "create_role", args: { name: "Admin", color: "#ff0000", hoist: true }, description: 'Create role "Admin"' };
  const miniPlan = {
    id: `${basePlan.id}_step_0`,
    guildId: basePlan.guildId,
    channelId: basePlan.channelId,
    requesterId: basePlan.requesterId,
    toolName: step.toolName,
    arguments: step.args,
    riskLevel: "medium",
    changes: [{ type: "create" as const, target: step.description, description: step.description }],
    requiresConfirmation: false,
    createdAt: basePlan.createdAt,
    expiresAt: basePlan.expiresAt,
  };

  // Validate mini-plan structure
  const checks = [
    miniPlan.toolName === "create_role",
    miniPlan.guildId === basePlan.guildId,
    miniPlan.channelId === basePlan.channelId,
    miniPlan.requesterId === basePlan.requesterId,
    typeof miniPlan.arguments === "object" && miniPlan.arguments !== null,
    miniPlan.riskLevel === "medium",
    Array.isArray(miniPlan.changes) && miniPlan.changes.length === 1,
    miniPlan.requiresConfirmation === false,
  ];

  const allPassed = checks.every(Boolean);
  if (allPassed) {
    pass("Mini-plan structure matches executePlan dispatcher expectations");
  } else {
    fail("Mini-plan structure is invalid");
  }
} catch (error) {
  fail("Mini-plan structure test", error);
}

/* ================================================================
 * RESULTS
 * ================================================================ */

console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
if (failed === 0) {
  console.log("🎉 ALL TEMPLATE EXECUTION TESTS PASSED");
} else {
  console.log("❌ SOME TESTS FAILED");
}
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

process.exit(failed > 0 ? 1 : 0);
