/* ================================================================
 * SUPPORT CASE AUTHORIZATION + GUILD ISOLATION TESTS (P1-3 / P2-4)
 *
 * Layer 2/3:
 *  - case-manager cross-guild IDOR: transitionCase/assignCase must
 *    reject case ids from other guilds (expectedGuildId scoping).
 *  - /support case view|list|assign|status|stats are staff-only via
 *    guild_configs.staff.roleIds (fail closed when unconfigured).
 *  - static wiring: every production caller passes a guild id.
 * ================================================================ */

import fs from "node:fs";
import path from "node:path";
import type { ChatInputCommandInteraction } from "discord.js";

import { SupportCaseManager } from "../src/support/case-manager";
import { createSupportCommand } from "../src/commands/support";
import { loadGuildConfig, saveGuildConfig } from "../src/core/guild-config";
import { getAuditLog } from "../src/security/audit";

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

console.log("\n🧪 AshenAI Support Case Authorization Tests\n");

/* ================================================================
 * A. Cross-guild IDOR — case-manager scoping (behavioral)
 * ================================================================ */

console.log("=== A. Cross-guild IDOR (case-manager) ===");

const manager = new SupportCaseManager();
const GUILD_A = `authz_guild_a_${Date.now()}`;
const GUILD_B = `authz_guild_b_${Date.now()}`;

const c = manager.createCase({
  guildId: GUILD_A,
  channelId: `ch_${Date.now()}`,
  type: "report",
  creatorId: "creator-1",
  summary: "IDOR probe case",
});

assert(!!c, "A0 case created in guild A");

if (c) {
  // transition: wrong guild must be rejected with NO mutation
  const tBad = manager.transitionCase(c.id, "investigating", "actor-1", GUILD_B);
  assert(tBad === null, "A1 cross-guild transition returns null");
  assert(
    manager.getCase(c.id)?.status === "open",
    "A1b cross-guild transition did NOT mutate status",
  );

  // assign: wrong guild must be rejected with NO mutation
  const aBad = manager.assignCase(c.id, "staff-2", "actor-1", GUILD_B);
  assert(aBad === null, "A2 cross-guild assign returns null");
  assert(
    !manager.getCase(c.id)?.assignedStaffId,
    "A2b cross-guild assign did NOT mutate assignment",
  );

  // transition: correct guild succeeds
  const tOk = manager.transitionCase(c.id, "investigating", "actor-1", GUILD_A);
  assert(tOk?.status === "investigating", "A3 same-guild transition succeeds");

  // assign: correct guild succeeds
  const aOk = manager.assignCase(c.id, "staff-1", "actor-1", GUILD_A);
  assert(aOk?.assignedStaffId === "staff-1", "A4 same-guild assign succeeds");

  // audit entry for the successful assign carries the guild id
  const assignAudit = getAuditLog({ who: "actor-1", limit: 50 })
    .find(e => e.what.includes(`Assigned case ${c.id}`));
  assert(assignAudit?.guildId === GUILD_A, "A5 assign audit carries guildId");
}

/* ================================================================
 * B. /support case staff gate (behavioral via real command entry)
 * ================================================================ */

console.log("\n=== B. /support case staff gate ===");

const GUILD_S = `authz_cmd_guild_${Date.now()}`;
const STAFF_ROLE = "900000000000000001";

function seedStaffRoles(guildId: string, roleIds: string[]): void {
  const base = loadGuildConfig(guildId);
  saveGuildConfig({
    ...base,
    staff: { ...(base.staff ?? { roleIds: [] }), roleIds },
  } as typeof base);
}

function memberMock(opts: { roleIds: string[]; bot?: boolean }): {
  user: { bot: boolean };
  roles: { cache: { some: (fn: (r: { id: string }) => boolean) => boolean } };
} {
  return {
    user: { bot: opts.bot ?? false },
    roles: {
      cache: {
        // discord.js Collection.some passes Role objects ({ id }), so
        // the mock must hand the predicate objects, not raw ids.
        some: (fn) => opts.roleIds.map((id) => ({ id })).some(fn),
      },
    },
  };
}

interface MockInteraction extends Partial<ChatInputCommandInteraction> {
  replies: unknown[];
}

function mkInteraction(opts: {
  subcommand: string;
  userId: string;
  guildId: string;
  member: unknown;
  getStringValue?: string;
}): MockInteraction & { execute: () => Promise<void> } {
  const replies: unknown[] = [];
  const interaction = {
    user: { id: opts.userId, tag: `${opts.userId}#0001` },
    guild: {
      id: opts.guildId,
      members: {
        fetch: async () => opts.member,
      },
    },
    options: {
      getSubcommand: () => opts.subcommand,
      getSubcommandGroup: () => "case",
      getString: () => opts.getStringValue ?? "T-0000-0000-xxxx",
      getUser: () => ({ id: "someone" }),
    },
    editReply: async (payload: unknown) => {
      replies.push(payload);
      return payload;
    },
    replies,
  };
  return interaction as unknown as MockInteraction & { execute: () => Promise<void> };
}

async function runCaseCommand(m: MockInteraction): Promise<void> {
  const command = createSupportCommand();
  await command.execute(m as unknown as ChatInputCommandInteraction);
}

async function main(): Promise<void> {
  // B1: no staff roles configured → fail closed even for role-holders
  seedStaffRoles(GUILD_S, []);
  const m1 = mkInteraction({
    subcommand: "view",
    userId: "user-1",
    guildId: GUILD_S,
    member: memberMock({ roleIds: [STAFF_ROLE] }),
  });
  await runCaseCommand(m1);
  const r1 = m1.replies[0];
  assert(
    typeof r1 === "string" && r1.includes("staff role"),
    "B1 unconfigured staff roles → deny (fail closed)",
  );

  // B2: configured staff roles, member has the role → allowed
  seedStaffRoles(GUILD_S, [STAFF_ROLE]);
  const caseInS = manager.createCase({
    guildId: GUILD_S,
    channelId: `ch_b_${Date.now()}`,
    type: "support",
    creatorId: "creator-b",
    summary: "gate allow case",
  });
  assert(!!caseInS, "B2 precondition: case exists in command guild");

  const m2 = mkInteraction({
    subcommand: "view",
    userId: "user-staff",
    guildId: GUILD_S,
    member: memberMock({ roleIds: [STAFF_ROLE] }),
    getStringValue: caseInS?.id,
  });
  await runCaseCommand(m2);
  const r2 = m2.replies[0] as { embeds?: unknown[] } | undefined;
  assert(
    !!r2 && typeof r2 === "object" && Array.isArray(r2.embeds),
    "B2b staff member with role → case view allowed (embed reply)",
  );

  // B3: member WITHOUT the role → deny on view
  const m3 = mkInteraction({
    subcommand: "view",
    userId: "user-plain",
    guildId: GUILD_S,
    member: memberMock({ roleIds: ["12345"] }),
    getStringValue: caseInS?.id,
  });
  await runCaseCommand(m3);
  const r3 = m3.replies[0];
  assert(
    typeof r3 === "string" && r3.includes("staff role"),
    "B3 member without staff role → denied",
  );

  // B4: mutation subcommand (assign) denied for non-staff
  const m4 = mkInteraction({
    subcommand: "assign",
    userId: "user-plain2",
    guildId: GUILD_S,
    member: memberMock({ roleIds: [] }),
    getStringValue: caseInS?.id,
  });
  await runCaseCommand(m4);
  const r4 = m4.replies[0];
  assert(
    typeof r4 === "string" && r4.includes("staff role"),
    "B4 non-staff cannot assign (mutation gated)",
  );

  // B5: bot accounts denied even with staff role
  const m5 = mkInteraction({
    subcommand: "status",
    userId: "bot-user",
    guildId: GUILD_S,
    member: memberMock({ roleIds: [STAFF_ROLE], bot: true }),
    getStringValue: caseInS?.id,
  });
  await runCaseCommand(m5);
  const r5 = m5.replies[0];
  assert(
    typeof r5 === "string" && r5.includes("staff role"),
    "B5 bot member denied even with staff role",
  );

  // B6: member resolution failure → deny (fail closed)
  const m6 = {
    user: { id: "user-flaky", tag: "flaky#0001" },
    guild: {
      id: GUILD_S,
      members: {
        fetch: async () => {
          throw new Error("fetch failed");
        },
      },
    },
    options: {
      getSubcommand: () => "list",
      getSubcommandGroup: () => "case",
      getString: () => "x",
      getUser: () => ({ id: "y" }),
    },
    editReply: async (payload: unknown) => {
      m6.replies.push(payload);
      return payload;
    },
    replies: [] as unknown[],
  };
  const command6 = createSupportCommand();
  await command6.execute(m6 as unknown as ChatInputCommandInteraction);
  assert(
    typeof m6.replies[0] === "string" && (m6.replies[0] as string).includes("staff role"),
    "B6 member fetch failure → deny (fail closed)",
  );

  // B7: cross-guild case id → not found (staff of guild B cannot read guild A case)
  const GUILD_T = `${GUILD_S}_other`;
  seedStaffRoles(GUILD_T, [STAFF_ROLE]);
  const m7 = mkInteraction({
    subcommand: "view",
    userId: "user-staff-b",
    guildId: GUILD_T,
    member: memberMock({ roleIds: [STAFF_ROLE] }),
    getStringValue: caseInS?.id,
  });
  await runCaseCommand(m7);
  const r7 = m7.replies[0];
  assert(
    typeof r7 === "string" && r7.includes("not found"),
    "B7 staff guild B cannot view guild A case id",
  );

  // B7b: case ids contain a mixed-case prefix + random suffix;
  // differently-cased input must still resolve (NOCASE fallback).
  const m7b = mkInteraction({
    subcommand: "view",
    userId: "user-staff",
    guildId: GUILD_S,
    member: memberMock({ roleIds: [STAFF_ROLE] }),
    getStringValue: caseInS?.id.toLowerCase(),
  });
  await runCaseCommand(m7b);
  const r7b = m7b.replies[0] as { embeds?: unknown[] } | undefined;
  assert(
    !!r7b && Array.isArray(r7b.embeds),
    "B7b differently-cased case id still resolves (case-insensitive lookup)",
  );

  // B8: denied attempts are audited (note: getAuditLog returns
  // oldest-first — scope the match to THIS run's guild).
  const denyAudit = getAuditLog({ who: "user-plain", limit: 100 })
    .find(e =>
      e.result === "denied" &&
      e.guildId === GUILD_S &&
      e.what.includes("/support case"),
    );
  assert(!!denyAudit && denyAudit.guildId === GUILD_S, "B8 denied attempts recorded in audit with guildId");

  /* ================================================================
   * C. Static wiring — every production caller is guild-scoped
   * ================================================================ */

  console.log("\n=== C. Static wiring (callers + gate) ===");

  const supportSrc = src("src/commands/support.ts");
  assert(
    supportSrc.includes("interaction.options.getSubcommandGroup()") &&
      supportSrc.includes('subcommandGroup === "case"'),
    "C1 execute routes the case GROUP (getSubcommand returns the leaf, not \"case\")",
  );
  assert(
    !supportSrc.includes('"AI-generated case summary"') &&
      !supportSrc.includes('"Get AI recommendation for a case"') &&
      !supportSrc.includes('"View case message timeline"') &&
      !supportSrc.includes('"View collected evidence"'),
    "C2 unimplemented case subcommands removed from the builder",
  );
  assert(supportSrc.includes("config.staff?.roleIds ?? []"), "C3 gate reads guild_configs.staff.roleIds");
  assert(supportSrc.includes("Denied /support case"), "C4 denied attempts audited");
  assert(supportSrc.includes("if (staffRoleIds.length === 0) return false"), "C5 unconfigured staff roles fail closed");
  assert(
    supportSrc.includes("if (!(await hasCaseStaffAccess(interaction, guildId)))"),
    "C5b handleCase gates EVERY case subcommand (unconditional)",
  );

  const cmSrc = src("src/support/case-manager.ts");
  assert(
    cmSrc.includes("WHERE id = ? AND guild_id = ?"),
    "C6 case-manager queries are guild-scoped",
  );
  assert(
    cmSrc.includes("UPDATE support_cases SET assigned_staff_id = ?, updated_at = ? WHERE id = ? AND guild_id = ?"),
    "C7 assign UPDATE is guild-scoped",
  );
  assert(cmSrc.includes("guildId: expectedGuildId"), "C8 assign audit carries expectedGuildId");

  const webSrc = src("src/web/server.ts");
  assert(
    webSrc.includes('authReq.accountId || "web", guildId'),
    "C9 dashboard transition passes route guildId",
  );

  const orchSrc = src("src/support/ai-orchestrator.ts");
  assert(
    (orchSrc.match(/transitionCase\(aiCase\.id, "[a-z_]+", (userId|"[a-z]+"), aiCase\.guildId\)/g) ?? []).length >= 3 &&
      orchSrc.includes("assignCase(aiCase.id, userId, userId, aiCase.guildId)"),
    "C10 orchestrator callers pass aiCase.guildId",
  );

  const autoSrc = src("src/support/automation.ts");
  assert(
    autoSrc.includes('transitionCase(aiCase.id, "closed", "system", aiCase.guildId)'),
    "C11 automation auto-close passes aiCase.guildId",
  );

  const caSrc = src("src/discord/conversational-agent.ts");
  assert(
    caSrc.includes('transitionCase(activeCase.id, result.newStatus, "system", guild.id)'),
    "C12 conversational agent passes guild.id",
  );

  /* ================================================================ */

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  if (failed > 0) {
    console.error("\n💥 SUPPORT CASE AUTHORIZATION TESTS FAILED");
    process.exit(1);
  }

  console.log("🎉 ALL SUPPORT CASE AUTHORIZATION TESTS PASSED");
  process.exit(0);
}

void main();
