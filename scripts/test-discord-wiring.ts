/* ================================================================
 * DISCORD WIRING REGRESSION TESTS
 *
 * Layer 2 (wiring): proves the PRODUCTION composition root actually
 * wires the pieces together — not merely that the pieces exist.
 *
 * P1-1: tool registry registration in src/index.ts
 *       (static composition-root assertions + dynamic bootstrap)
 * P1-2: confirmation button rendering, planId integrity, and the
 *       double-execution guard (static assertions + behavioral)
 * ================================================================ */

import fs from "node:fs";
import path from "node:path";
import type { Guild, Message, ModalSubmitInteraction } from "discord.js";

import { toolRegistry } from "../src/ai/tools/registry";
import {
  registerProductionDiscordTools,
  isProductionToolRegistrationComplete,
} from "../src/ai/tools/discord/bootstrap";
import {
  storePendingPlan,
  getPendingPlan,
  markPlanExecuted,
  removePendingPlan,
} from "../src/ai/tools/confirmation-store";
import { createActionPlan } from "../src/ai/tools/executor";
import { buildToolConfirmationComponents } from "../src/discord/interactions/tool-confirmation-ui";
import {
  executeUnifiedPlan,
  type ConversationState,
} from "../src/discord/conversational-agent";
import type { ResolvedUserContext } from "../src/ai/tools/discord/agent-orchestrator";
import {
  createSettingsCommand,
  handleSettingsModalSubmit,
  isSettingsModalCustomId,
} from "../src/commands/settings";

let passed = 0;
let failed = 0;

function pass(name: string): void {
  console.log(`✅ ${name}`);
  passed++;
}

function fail(name: string, error?: unknown): void {
  console.error(`❌ ${name}`, error ?? "");
  failed++;
}

function assert(cond: unknown, name: string): void {
  if (cond) pass(name);
  else fail(name);
}

function src(rel: string): string {
  return fs.readFileSync(path.resolve(rel), "utf8");
}

function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

console.log("\n🧪 AshenAI Discord Wiring Tests\n");

/* ================================================================
 * A. P1-1 — index.ts composition root (static)
 * ================================================================ */

console.log("=== A. Production tool registration (index.ts, static) ===");

const indexSrc = src("src/index.ts");

assert(
  indexSrc.includes('import { registerProductionDiscordTools } from "./ai/tools/discord/bootstrap"'),
  "A1 index.ts imports the production registration entrypoint",
);

const regCall = indexSrc.indexOf("registerProductionDiscordTools(() => client)");
assert(regCall !== -1, "A2 index.ts calls registerProductionDiscordTools with the live client factory");

const clientCreate = indexSrc.indexOf("new Client(");
assert(clientCreate !== -1 && regCall > clientCreate, "A3 registration runs after the Discord client exists");

assert(
  /registeredToolCount <= 0[\s\S]{0,400}?process\.exit\(1\)/.test(indexSrc),
  "A4 startup fails fast (process.exit(1)) when registration yields 0 tools",
);

const preflightCall = indexSrc.indexOf("runPreflight(");
assert(preflightCall !== -1 && regCall < preflightCall, "A5 registration happens before runPreflight sees the registry");

/* ================================================================
 * B. P1-1 — preflight + supervisor mirror production (static)
 * ================================================================ */

console.log("\n=== B. Preflight + supervisor registry checks (static) ===");

const preflightSrc = src("src/core/preflight.ts");

assert(preflightSrc.includes('"tool_registry"'), "B1 preflight exposes a tool_registry check");

assert(
  /status: count > 0 \? "READY" : "FAILED"/.test(preflightSrc),
  "B2 empty registry reports FAILED — never a silent DEGRADED",
);

assert(
  /name: "tool_registry",[\s\S]{0,160}?required: true/.test(preflightSrc),
  "B3 tool_registry check is REQUIRED (drives BLOCKED overall state)",
);

assert(
  preflightSrc.includes('"Tool registry could not be loaded'),
  "B4 registry load failure also fails closed",
);

assert(
  preflightSrc.includes('"AI tool registry is empty (0 tools registered)"'),
  "B5 supervisor health check reports empty registry as unhealthy",
);

/* ================================================================
 * C. P1-1 — regression suite itself exists (static)
 * ================================================================ */

console.log("\n=== C. Preflight regression suite covers recovery (static) ===");

const pfTest = src("scripts/test-preflight.ts");

assert(pfTest.includes("Tool Registry Required"), "C1 test-preflight has the empty-registry section");
assert(pfTest.includes("toolRegistry.clear()"), "C2 test-preflight really empties the registry");
assert(pfTest.includes('"BLOCKED"'), "C3 test-preflight asserts overall BLOCKED on empty registry");
assert(pfTest.includes("registerProductionDiscordTools"), "C4 test-preflight re-registers and asserts recovery");

/* ================================================================
 * D. P1-2 — planId integrity + guard (static)
 * ================================================================ */

console.log("\n=== D. Confirmation planId integrity (conversational-agent, static) ===");

const caSrc = src("src/discord/conversational-agent.ts");

assert(
  count(caSrc, "planId: actionPlan.id") >= 2,
  "D1 template + unified creation sites return the STORED plan id",
);

assert(
  !caSrc.includes("planId: state.unifiedPlan.id"),
  "D2 no flow returns the display-only unified plan id",
);

assert(
  count(caSrc, "state.pendingConfirmation?.planId") >= 2,
  "D3 preview + details return the pendingConfirmation (stored) plan id",
);

assert(
  count(caSrc, "storePendingPlan(actionPlan)") >= 3,
  "D4 all three unified flows (template, combined, delete_except) store a plan",
);

assert(
  caSrc.includes("isPlanExecuted(confirmPlanId)"),
  "D5 executeUnifiedPlan checks the executed flag before running",
);

assert(
  caSrc.includes("markPlanExecuted(confirmPlanId)") && caSrc.includes("removePendingPlan(confirmPlanId)"),
  "D6 execution consumes the stored plan (mark executed + remove)",
);

assert(
  caSrc.includes("already confirmed, cancelled, or has expired"),
  "D7 double-exec rejection has an explicit user-facing message",
);

assert(
  caSrc.includes("removePendingPlan(state.pendingConfirmation.planId)"),
  "D8 text-cancel (handleDenial) removes the stored plan so Confirm dies",
);

/* ================================================================
 * E. P1-2 — button renderer wiring in index.ts (static)
 * ================================================================ */

console.log("\n=== E. Button renderer wiring (index.ts + handler, static) ===");

assert(
  indexSrc.includes('import { buildToolConfirmationComponents } from "./discord/interactions/tool-confirmation-ui"'),
  "E1 index.ts imports the button renderer",
);

assert(
  indexSrc.includes("agentResponse.requiresConfirmation && agentResponse.planId"),
  "E2 buttons render only for confirmation plans with a planId",
);

const handlerSrc = src("src/discord/interactions/confirmation-handler.ts");

assert(
  handlerSrc.includes('export const CONFIRM_PREFIX = "ashen_tool_confirm:"') &&
    handlerSrc.includes('export const CANCEL_PREFIX = "ashen_tool_cancel:"'),
  "E3 confirm/cancel prefixes are exported for shared use",
);

/* ================================================================
 * F. P1-1 — dynamic: production registration behaves like index.ts
 * ================================================================ */

async function main(): Promise<void> {
  console.log("\n=== F. Production registration (dynamic) ===");

  toolRegistry.clear();
  assert(toolRegistry.count() === 0, "F1 registry cleared to simulate a broken composition root");
  assert(isProductionToolRegistrationComplete() === false, "F2 completeness check fails on empty registry");

  const n1 = registerProductionDiscordTools(() => null as never);
  assert(n1 > 0, `F3 production registration registers tools (count=${n1})`);
  assert(isProductionToolRegistrationComplete() === true, "F4 completeness check passes after registration");

  const n2 = registerProductionDiscordTools(() => null as never);
  assert(n2 === n1 && toolRegistry.count() === n1, "F5 registration is idempotent (no duplicate entries)");

  const names = toolRegistry.getNames();
  assert(names.includes("create_channel") && names.includes("inspect_server"), "F6 core Discord tools present");

  toolRegistry.clear();
  const n3 = registerProductionDiscordTools(() => null as never);
  assert(n3 === n1 && isProductionToolRegistrationComplete(), "F7 re-registration after clear fully recovers");

  /* ================================================================
   * G. P1-2 — dynamic: button renderer behavior
   * ================================================================ */

  console.log("\n=== G. Confirmation button renderer (dynamic) ===");

  const guildId = "guild-wiring-test";

  function mkPlan(): string {
    const plan = createActionPlan(
      {
        guildId,
        channelId: "channel-wiring",
        requesterId: "111",
        requesterName: "tester",
        requesterRole: "admin",
        arguments: { _toolName: "apply_template" },
        dryRun: false,
      },
      "safe",
      [{ type: "create", target: "x", description: "x" }],
      true,
    );
    storePendingPlan(plan);
    return plan.id;
  }

  const p1 = mkPlan();
  const rows = buildToolConfirmationComponents(p1);
  assert(rows.length === 1, "G1 pending plan renders exactly one action row");

  const buttons = (rows[0]?.components ?? []) as Array<{ data?: { custom_id?: string; label?: string } }>;
  assert(buttons.length === 2, "G2 row contains Confirm + Cancel");
  assert(
    buttons[0]?.data?.custom_id === `ashen_tool_confirm:${p1}` && buttons[1]?.data?.custom_id === `ashen_tool_cancel:${p1}`,
    "G3 custom_ids embed the stored plan id",
  );
  assert(
    buttons[0]?.data?.label === "Confirm" && buttons[1]?.data?.label === "Cancel",
    "G4 button labels are Confirm/Cancel",
  );

  const stored1 = getPendingPlan(p1);
  assert(!!stored1, "G5 precondition: fresh plan is pending in the store");
  if (stored1) stored1.expiresAt = Date.now() - 1000;
  assert(buildToolConfirmationComponents(p1).length === 0, "G5b expired plan renders no buttons");
  removePendingPlan(p1);

  const p2 = mkPlan();
  markPlanExecuted(p2);
  assert(!!getPendingPlan(p2), "G6 precondition: executed plan still resolvable (flag set, not yet removed)");
  assert(buildToolConfirmationComponents(p2).length === 0, "G6b already-executed plan renders no buttons");
  removePendingPlan(p2);

  const p3 = `plan_${Date.now().toString(16)}dead`;
  assert(buildToolConfirmationComponents(p3).length === 0, "G7 unknown plan id renders no buttons");

  const invalidIds = ["", "x".repeat(31), "has space", "semi;colon", "u/slash", "😀"];
  let invalidOk = true;
  for (const id of invalidIds) {
    if (buildToolConfirmationComponents(id).length !== 0) invalidOk = false;
  }
  assert(invalidOk, "G8 malformed/oversized plan ids render no buttons");

  /* ================================================================
   * H. P1-2 — dynamic: double-execution guard (behavioral)
   * ================================================================ */

  console.log("\n=== H. Double-execution guard (behavioral) ===");

  const userContext: ResolvedUserContext = {
    userId: "111",
    username: "tester",
    guildId,
    ashenRole: "admin",
    discordPermissions: 0n,
    isGuildOwner: false,
    roleIds: [],
  };
  const guild = { id: guildId } as unknown as Guild;
  const message = {} as unknown as Message;

  function mkState(planId: string): ConversationState {
    return {
      userId: "111",
      guildId,
      channelId: "channel-wiring",
      unifiedPlan: {
        id: `unified-wiring-${Date.now()}`,
        goal: "wiring test",
        steps: [],
        duplicates: [],
        riskLevel: "safe",
        createdAt: Date.now(),
        expiresAt: Date.now() + 300000,
      },
      pendingConfirmation: {
        planId,
        toolName: "apply_template",
        args: {},
        timestamp: Date.now(),
      },
      lastStateFetchedAt: Date.now(),
    };
  }

  // H1: the Confirm button already ran → a later "yes" must not re-run.
  const h1plan = mkPlan();
  markPlanExecuted(h1plan);
  removePendingPlan(h1plan);
  const st1 = mkState(h1plan);
  assert(st1.pendingConfirmation?.planId === h1plan, "H1 precondition: state references the stored plan id");
  assert(getPendingPlan(h1plan) === undefined, "H1 precondition: plan consumed by prior button confirm");
  const res1 = await executeUnifiedPlan(st1, userContext, guild, message);
  assert(res1.executed === false, "H1 prior button confirm → text confirm does NOT execute");
  assert(
    typeof res1.reply === "string" && res1.reply.includes("already confirmed, cancelled, or has expired"),
    "H1 rejection message is explicit",
  );
  assert(
    st1.unifiedPlan === undefined && st1.pendingConfirmation === undefined,
    "H1 stale state is cleared after rejection",
  );

  // H2: normal text confirm executes once and consumes the stored plan.
  const h2plan = mkPlan();
  const st2 = mkState(h2plan);
  assert(getPendingPlan(h2plan) !== undefined, "H2 precondition: plan pending before text confirm");
  const res2 = await executeUnifiedPlan(st2, userContext, guild, message);
  assert(res2.executed === true, "H2 pending plan executes via text confirm");
  assert(getPendingPlan(h2plan) === undefined, "H2 stored plan consumed → button can no longer re-run");
  assert(st2.unifiedPlan === undefined, "H2 state cleared after execution");

  // H3: text-cancel removes the stored plan → Confirm button dies too.
  const h3plan = mkPlan();
  assert(getPendingPlan(h3plan) !== undefined, "H3 precondition: plan pending before text-cancel");
  removePendingPlan(h3plan);
  assert(buildToolConfirmationComponents(h3plan).length === 0, "H3 Confirm button dead after text-cancel");

  // H4: renderer must refuse a plan id that is not the stored id
  // (regression for the planId-mismatch bug: unified display ids are
  // never stored, so they must never get buttons).
  const displayOnlyId = `template-preview-${Date.now()}`;
  assert(buildToolConfirmationComponents(displayOnlyId).length === 0, "H4 display-only unified id gets NO buttons");

  // Cleanup registry for any suites sharing this process.
  toolRegistry.clear();
  registerProductionDiscordTools(() => null as never);

  /* ================================================================
   * I. P2-1 — /settings audit shows guild-scoped audit entries ONLY
   * ================================================================ */

  console.log("\n=== I. Settings audit log isolation (static) ===");

  const settingsCmdSrc = src("src/commands/settings.ts");
  const settingsServiceSrc = src("src/settings/service.ts");
  const settingsIndexSrc = src("src/settings/index.ts");

  assert(
    !settingsCmdSrc.includes("getRecentLogEntries("),
    "I1 settings command never CALLS getRecentLogEntries (comment references only)",
  );
  assert(!settingsCmdSrc.includes("Recent Logs"), 'I2 settings audit embed has no "Recent Logs" field');
  assert(
    !settingsServiceSrc.includes("getRecentLogEntries") && !settingsServiceSrc.includes("LogStreamEntry"),
    "I3 settings service no longer exports getRecentLogEntries/LogStreamEntry",
  );
  assert(!settingsIndexSrc.includes("getRecentLogEntries"), "I4 settings index barrel no longer re-exports it");
  assert(
    settingsCmdSrc.includes("getRecentAuditEntries(guildId, 10)"),
    "I5 audit embed reads guild-scoped audit entries (auditor only, not global stream)",
  );

  /* ================================================================
   * J. P2-2 — settings modal dispatch (static + behavioral)
   * ================================================================ */

  console.log("\n=== J. Settings modal dispatch (static + behavioral) ===");

  assert(
    indexSrc.includes("isSettingsModalCustomId(interaction.customId)"),
    "J1 index.ts gates settings modals through the shared predicate",
  );
  assert(
    !indexSrc.includes('startsWith("an:') && !indexSrc.includes("startsWith(`an:"),
    "J2 index.ts no longer hardcodes the an: prefix (an:/st: asymmetry regression)",
  );
  assert(isSettingsModalCustomId("st:ai.responseStyle"), 'J3 predicate accepts st: modals');
  assert(isSettingsModalCustomId("an:moderation.automod"), 'J4 predicate accepts an: modals (parity with st:)');
  assert(!isSettingsModalCustomId("zz:whatever"), "J5 predicate rejects unknown prefixes");
  assert(!isSettingsModalCustomId("stale_no_colon"), "J6 predicate rejects bare prefixes without colon");

  function mkModal(
    customId: string,
    guildId: string | null,
    opts: { memberPermissions?: { has?: (p: unknown) => boolean } | null } = {},
  ): ModalSubmitInteraction {
    const replies: Array<{ content?: string }> = [];
    const ix = {
      customId,
      guildId,
      user: { id: "111", tag: "tester#0001" },
      replied: false,
      deferred: false,
      memberPermissions:
        opts.memberPermissions === undefined
          ? ({ has: () => true } as unknown as ModalSubmitInteraction["memberPermissions"])
          : (opts.memberPermissions as ModalSubmitInteraction["memberPermissions"]),
      reply: async (payload: { content?: string }) => {
        replies.push(payload);
        ix.replied = true;
      },
      editReply: async () => ({}) as never,
      fields: { getTextInputValue: () => "" },
    };
    (ix as unknown as { __replies: typeof replies }).__replies = replies;
    return ix as unknown as ModalSubmitInteraction;
  }
  function repliesOf(ix: ModalSubmitInteraction): Array<{ content?: string }> {
    return (ix as unknown as { __replies: Array<{ content?: string }> }).__replies;
  }

  // No panel session exists in this process → every valid modal must
  // expire cleanly instead of silently dropping the interaction.
  const j7 = mkModal("st:ai.responseStyle", "guild-wiring-test");
  await handleSettingsModalSubmit(j7);
  assert(
    repliesOf(j7)[0]?.content === "This panel has expired. Use `/settings panel` to open a new one.",
    "J7 st: modal with no live session replies (not dropped)",
  );

  const j8 = mkModal("an:moderation.automod", "guild-wiring-test");
  await handleSettingsModalSubmit(j8);
  assert(
    repliesOf(j8)[0]?.content === "This panel has expired. Use `/settings panel` to open a new one.",
    "J8 an: modal with no live session replies identically (P2-2 regression)",
  );

  const j9 = mkModal("st:ai.responseStyle", null);
  await handleSettingsModalSubmit(j9);
  assert(repliesOf(j9)[0]?.content === "Must be used in a server.", "J9 st: modal outside a guild is rejected");

  const j10 = mkModal("zz:not_a_settings_modal", "guild-wiring-test");
  await handleSettingsModalSubmit(j10);
  assert(repliesOf(j10).length === 0, "J10 foreign modal ids are ignored (no reply, no throw)");

  // J11: memberPermissions missing (fail closed) — no session needed,
  // permission is re-checked BEFORE the session on every write.
  const j11 = mkModal("st:ai.responseStyle", "guild-wiring-test", { memberPermissions: null });
  await handleSettingsModalSubmit(j11);
  assert(
    repliesOf(j11)[0]?.content === "You need the Manage Server permission to change settings.",
    "J11 modal without ManageGuild memberPermissions is denied (fail closed)",
  );

  // J12: revoked permission (has → false) — demoted admin mid-session
  // must lose write access; checked before the session lookup.
  const j12 = mkModal("an:moderation.automod", "guild-wiring-test", {
    memberPermissions: { has: () => false },
  });
  await handleSettingsModalSubmit(j12);
  assert(
    repliesOf(j12)[0]?.content === "You need the Manage Server permission to change settings.",
    "J12 modal with revoked ManageGuild is denied (demotion mid-session)",
  );

  // J13: every panel write handler re-checks permission via the shared
  // gate and binds to the panel message; role select drops @everyone.
  assert((settingsCmdSrc.match(/panelDenyReason\(/g) ?? []).length >= 6,
    "J13 panelDenyReason gate used by all five write handlers + definition");
  assert(settingsCmdSrc.includes("id !== guildId"),
    "J14 staff role select filters out the @everyone role (guild id)");

  /* ================================================================
   * K. P2-5 — /settings panel reachability (Discord subcommand rule)
   *
   * Discord: a command WITH subcommands cannot be invoked bare, so
   * when `update` was the only subcommand the interactive panel
   * (session + collector + modals) was unreachable. Both documented
   * modes must be explicit subcommands.
   * ================================================================ */

  console.log("\n=== K. Settings panel reachability (dynamic builder) ===");

  const settingsCmd = createSettingsCommand();
  const settingsJson = settingsCmd.data.toJSON() as unknown as {
    options?: Array<{ name?: string; type?: number }>;
  };
  const subNames = (settingsJson.options ?? [])
    .filter((o) => o.type === 1)
    .map((o) => o.name);
  assert(
    subNames.includes("panel") && subNames.includes("update"),
    `K1 /settings exposes BOTH modes as subcommands (got: ${JSON.stringify(subNames)})`,
  );
  assert(
    !indexSrc.includes("createSettingsUpdateCommand"),
    "K2 index.ts does not import the removed createSettingsUpdateCommand",
  );
  assert(
    settingsCmdSrc.includes('getSubcommand() === "update"'),
    "K3 execute routes the update subcommand and lets panel fall through",
  );
  assert(
    settingsCmdSrc.includes('what: "Opened /settings panel"'),
    "K4 panel path still audits its opening",
  );

  /* ================================================================ */

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  if (failed > 0) {
    console.error("\n💥 DISCORD WIRING TESTS FAILED");
    process.exit(1);
  }

  console.log("🎉 ALL DISCORD WIRING TESTS PASSED");
  process.exit(0);
}

void main();
