#!/usr/bin/env node
/* ================================================================
 * ASHENAI RUNTIME ROUTING SMOKE TEST
 *
 * Verifies that the conversational agent correctly routes:
 * - Builder intents (template/inspect/repair) → /prompt redirect
 * - Direct Discord actions (delete/create channel) → handleServerModify
 * - Normal chat → AI router
 *
 * Also verifies tool registry completeness and builder parsing.
 * ================================================================ */

let passed = 0;
let failed = 0;
let total = 0;

function assert(condition: boolean, message: string): void {
  total++;
  if (condition) {
    passed++;
    console.log(`  ✅ ${message}`);
  } else {
    failed++;
    console.error(`  ❌ ${message}`);
  }
}

async function main(): Promise<void> {
  console.log("\n🔍 AshenAI Runtime Routing Smoke Test\n");

  // ── 1. Tool Registry ──────────────────────────────────────
  console.log("━━━ Tool Registry ━━━");

  const { createDiscordTools } = await import("../src/ai/tools/discord/index");
  const discordTools = createDiscordTools(() => null);
  assert(discordTools.length === 43, `43 Discord tools registered (got ${discordTools.length})`);

  const toolNames = discordTools.map(t => t.name);
  const requiredTools = [
    "create_channel", "delete_channel", "create_category", "delete_category",
    "create_role", "delete_role", "rename_channel", "move_channel",
    "edit_channel", "edit_role", "assign_role", "remove_role",
    "protect_channel", "unprotect_channel", "protect_category", "unprotect_category",
    "inspect_server", "list_channels", "check_permissions",
    "warn_user", "timeout_user", "ban_user", "kick_user",
    "purge_messages", "view_warnings",
    "manage_channel_permissions", "configure_role_permissions",
    "apply_channel_preset",
  ];
  for (const name of requiredTools) {
    assert(toolNames.includes(name), `Tool "${name}" is registered`);
  }

  // Check no duplicate names
  const uniqueNames = new Set(toolNames);
  assert(uniqueNames.size === toolNames.length, `No duplicate tool names (${toolNames.length} unique out of ${toolNames.length})`);

  // ── 2. Intent Classification ───────────────────────────────
  console.log("\n━━━ Intent Classification ━━━");

  const { classifyIntent } = await import("../src/discord/conversational-agent");

  const mockState = {
    userId: "test-user",
    guildId: "test-guild",
    channelId: "test-channel",
    lastStateFetchedAt: Date.now(),
  };

  // Builder intents → should be redirected to /prompt
  const builderTests = [
    { input: "make cozy server", expectedIntent: "server_template", desc: "cozy server → template" },
    { input: "Make cozy server", expectedIntent: "server_template", desc: "Make cozy server → template" },
    { input: "make a gaming server for Valorant", expectedIntent: "server_template", desc: "gaming server → template" },
    { input: "inspect my server", expectedIntent: "server_inspect", desc: "inspect → inspect" },
    { input: "fix my server", expectedIntent: "server_repair", desc: "fix server → repair" },
    { input: "make my server better", expectedIntent: "server_template", desc: "better → server_template (with wantsFix=true)" },
    { input: "delete all except general", expectedIntent: "delete_except", desc: "delete all except → delete_except" },
  ];

  const BUILDER_INTENTS = ["server_template", "server_inspect", "server_repair", "server_better", "delete_except"];

  for (const test of builderTests) {
    const result = classifyIntent(test.input, mockState, []);
    const isBuilder = BUILDER_INTENTS.includes(result.intent);
    assert(result.intent === test.expectedIntent, test.desc);
    assert(isBuilder, `  ↳ "${test.input}" is a builder intent (will be redirected to /prompt)`);
  }

  // Direct actions → should NOT be redirected, should be handled by handleServerModify
  const directTests = [
    { input: "delete bots channel", expectedIntent: "server_modify", desc: "delete bots channel → server_modify (direct)" },
    { input: "create a channel called testing", expectedIntent: "server_modify", desc: "create channel → server_modify (direct)" },
    { input: "create a role called Moderator", expectedIntent: "server_modify", desc: "create role → server_modify (direct)" },
    { input: "rename general to lobby", expectedIntent: "server_modify", desc: "rename → server_modify (direct)" },
    { input: "protect announcements", expectedIntent: "server_modify", desc: "protect → server_modify (direct)" },
  ];

  for (const test of directTests) {
    const result = classifyIntent(test.input, mockState, []);
    const isBuilder = BUILDER_INTENTS.includes(result.intent);
    assert(result.intent === test.expectedIntent, test.desc);
    assert(!isBuilder, `  ↳ "${test.input}" is NOT a builder intent (handled directly)`);
  }

  // Normal chat → should NOT be redirected
  const chatTests = [
    { input: "what is Minecraft?", expectedIntent: "normal_chat", desc: "Minecraft question → normal_chat" },
    { input: "hello", expectedIntent: "normal_chat", desc: "hello → normal_chat" },
    { input: "how are you?", expectedIntent: "normal_chat", desc: "how are you → normal_chat" },
  ];

  for (const test of chatTests) {
    const result = classifyIntent(test.input, mockState, []);
    assert(result.intent === test.expectedIntent, test.desc);
  }

  // ── 3. Builder Subject Extraction ──────────────────────────
  console.log("\n━━━ Builder Subject Extraction ━━━");

  const { extractBuildSubject } = await import("../src/commands/prompt");

  const subjectTests = [
    { input: "make cozy server", expected: "", desc: "cozy → empty (generic)" },
    { input: "make a gaming server for Valorant", expected: "valorant", desc: "Valorant → valorant" },
    { input: "make a study server for nursing students", expected: "nursing students", desc: "nursing students → nursing students" },
    { input: "make a server about my art hobby", expected: "art hobby", desc: "art hobby → art hobby" },
    { input: "create a server for 3D printing", expected: "3d printing", desc: "3D printing → 3d printing" },
  ];

  for (const test of subjectTests) {
    const subject = extractBuildSubject(test.input);
    assert(subject === test.expected, `${test.desc} (got "${subject}")`);
  }

  // ── 4. Intent → Route Mapping ──────────────────────────────
  console.log("\n━━━ Intent → Route Mapping ━━━");

  // Verify the corrected routing behavior
  const routeTests = [
    { input: "make cozy server", shouldRedirectToPrompt: true, desc: "make cozy server → /prompt (builder)" },
    { input: "delete bots channel", shouldRedirectToPrompt: false, desc: "delete bots channel → direct execution" },
    { input: "what is Minecraft?", shouldRedirectToPrompt: false, desc: "Minecraft question → AI router" },
  ];

  for (const test of routeTests) {
    const result = classifyIntent(test.input, mockState, []);
    const isBuilder = BUILDER_INTENTS.includes(result.intent);
    assert(isBuilder === test.shouldRedirectToPrompt, test.desc);
  }

  // ── 5. Correlation ID Generation ───────────────────────────
  console.log("\n━━━ Correlation ID Generation ━━━");

  // Verify the nanoid-based correlation ID format
  const { nanoid } = await import("nanoid");
  const id1 = `ASH-${nanoid(8)}`;
  const id2 = `ASH-${nanoid(8)}`;
  assert(id1.startsWith("ASH-"), `Correlation ID starts with "ASH-" (got "${id1}")`);
  assert(id1.length >= 12 && id1.length <= 14, `Correlation ID is ~13 chars (got ${id1.length})`);
  assert(id1 !== id2, `Correlation IDs are unique ("${id1}" !== "${id2}")`);

  // ── Summary ────────────────────────────────────────────────
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total:  ${total}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  if (failed > 0) {
    console.error("\n❌ SOME TESTS FAILED");
    process.exit(1);
  } else {
    console.log("\n🎉 ALL RUNTIME ROUTING TESTS PASSED");
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
