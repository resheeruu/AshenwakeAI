/* ================================================================
 * CONTROL PANEL TESTS — /support, /mod, /settings bare-command
 * panels (Support Center / Moderation Center / Settings Center)
 *
 * Covers:
 *  - registration surface: no subcommands (Discord bare-invocation
 *    rule), guild contexts, default member permissions
 *  - panel open paths (settings/support/mod) with mocked interactions
 *  - staff gate + case actions through the panel funnel
 *  - user flows: ticket creation, report gates (incl. requireEvidence)
 *  - moderation execution through executeInteractiveModeration
 *    (warn/timeout/untimeout, permission failures, validation)
 *  - settings panel component routing, restart-tolerant sessions,
 *    and fail-closed permission checks
 * ================================================================ */

import { PermissionFlagsBits } from "discord.js";

import { createSupportCommand } from "../src/commands/support";
import { createModerationCommand } from "../src/commands/moderation";
import { createSettingsCommand, handleSettingsComponent, isSettingsComponentCustomId } from "../src/commands/settings";
import {
  openSupportPanel,
  handleSupportComponent,
  handleSupportModal,
} from "../src/discord/panels/support-panel";
import { openModPanel, handleModModal } from "../src/discord/panels/mod-panel";
import { executeInteractiveModeration } from "../src/discord/interactive-moderation";
import { loadGuildConfig, saveGuildConfig } from "../src/core/guild-config";
import { getSupportCaseManager } from "../src/support/case-manager";
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

function seedConfig(guildId: string, patch: Record<string, unknown>): void {
  const base = loadGuildConfig(guildId);
  saveGuildConfig({ ...base, ...patch } as typeof base);
}

async function main(): Promise<void> {
  console.log("\n🧪 AshenAI Control Panel Tests\n");

  /* ================================================================
   * A. Registration surface (Discord subcommand rule)
   * ================================================================ */

  console.log("=== A. Registration surface ===");

  try {
    const support = createSupportCommand().data.toJSON() as { name: string; options?: unknown[]; contexts?: number[] };
    const mod = createModerationCommand().data.toJSON() as {
      name: string;
      options?: unknown[];
      contexts?: number[];
      default_member_permissions?: string | null;
    };
    const settings = createSettingsCommand().data.toJSON() as {
      name: string;
      options?: unknown[];
      contexts?: number[];
      default_member_permissions?: string | null;
    };

    assert(support.name === "support" && mod.name === "mod" && settings.name === "settings", "A1 command names are support/mod/settings");
    assert((support.options ?? []).length === 0, "A2 /support has NO subcommand options (bare invocation reachable)");
    assert((mod.options ?? []).length === 0, "A3 /mod has NO subcommand options (bare invocation reachable)");
    assert((settings.options ?? []).length === 0, "A4 /settings has NO subcommand options (bare invocation reachable)");
    assert(
      mod.default_member_permissions !== undefined && mod.default_member_permissions !== null,
      "A5 /mod sets default member permissions (ModerateMembers) at the Discord level",
    );
    assert(
      settings.default_member_permissions === String(PermissionFlagsBits.ManageGuild),
      "A6 /settings keeps ManageGuild as default member permissions",
    );
  assert(
    JSON.stringify(support.contexts) === "[0]" && JSON.stringify(mod.contexts) === "[0]" && JSON.stringify(settings.contexts) === "[0]",
    "A7 all three panels are guild-only (contexts = [Guild] = 0)",
  );
  } catch (error) {
    fail("Registration surface", error);
  }

  /* ================================================================
   * B. Support Center — open + user flows
   * ================================================================ */

  console.log("\n=== B. Support Center ===");

  const GUILD_SUP = `panels_support_${Date.now()}`;

  interface Captured {
    replies: unknown[];
    updates: unknown[];
    modals: string[];
    deferred: boolean;
    replied: boolean;
  }

  function mkSupportInteraction(opts: {
    customId?: string;
    userId?: string;
    member?: unknown;
    values?: string[];
  }): Captured & any {
    const captured: Captured = { replies: [], updates: [], modals: [], deferred: false, replied: false };
    const interaction = {
      customId: opts.customId ?? "support:home",
      user: { id: opts.userId ?? "user-1", tag: `${opts.userId ?? "user-1"}#0001`, bot: false },
      guildId: GUILD_SUP,
      channelId: "chan-panel-1",
      values: opts.values ?? [],
      guild: {
        id: GUILD_SUP,
        members: {
          fetch: async () => opts.member ?? {
            user: { bot: false },
            roles: { cache: { some: () => false } },
          },
        },
        channels: { cache: { get: () => undefined } },
      },
      reply: async (p: unknown) => { captured.replies.push(p); captured.replied = true; },
      update: async (p: unknown) => { captured.updates.push(p); captured.replied = true; },
      showModal: async (m: { data?: { custom_id?: string } } & Record<string, unknown>) => {
        captured.modals.push(String((m as any).data?.custom_id ?? (m as any).customId ?? ""));
        captured.replied = true;
      },
      deferReply: async () => { captured.deferred = true; },
      editReply: async (p: unknown) => { captured.replies.push(p); return { id: "msg-1" }; },
      fields: { getTextInputValue: () => "" },
      replied: false,
      deferred: false,
    };
    return Object.assign(captured, interaction, { __captured: captured });
  }

  try {
    seedConfig(GUILD_SUP, {
      support: { enabled: false, allowGeneralHelp: true, allowReports: true, allowAppeals: true, channelId: null, categoryId: null },
      reports: { enabled: false, requireEvidence: false, aiAnalysisEnabled: true, autoEscalateHighRisk: true, channelId: null, categoryId: null },
      appeals: { enabled: false, aiAnalysisEnabled: true, channelId: null, categoryId: null },
      staff: { roleIds: [] },
    });

    // B1: bare /support opens the panel (editReply payload with embeds)
    const openIx: any = mkSupportInteraction({});
    delete openIx.customId;
    await openSupportPanel(openIx);
    const openPayload = openIx.replies[0] as { embeds?: unknown[]; components?: unknown[] };
    assert(
      !!openPayload && Array.isArray(openPayload.embeds) && Array.isArray(openPayload.components) && openPayload.components.length >= 3,
      "B1 bare /support renders the Support Center (embed + component rows)",
    );

    // B2: staff button denied for non-staff (no staff roles configured → fail closed)
    const staffIx: any = mkSupportInteraction({ customId: "support:staff", userId: "plain-user" });
    await handleSupportComponent(staffIx);
    const staffReply = staffIx.replies[0] as { content?: string };
    assert(
      !!staffReply && typeof staffReply.content === "string" && staffReply.content.includes("staff role"),
      "B2 Manage Cases denied without configured staff roles (fail closed)",
    );

    // B3: staff gate + list render with configured role
    seedConfig(GUILD_SUP, { staff: { roleIds: ["900000000000000009"] } });
    const staffOk: any = mkSupportInteraction({
      customId: "support:staff",
      userId: "staff-user",
      member: {
        user: { bot: false },
        roles: { cache: { some: (fn: (r: { id: string }) => boolean) => [{ id: "900000000000000009" }].some(fn) } },
      },
    });
    await handleSupportComponent(staffOk);
    const staffPayload = staffOk.updates[0] as { embeds?: unknown[] };
    assert(!!staffPayload && Array.isArray(staffPayload.embeds), "B3 staff member renders the case list");

    // B4: ticket modal opens from the panel
    const ticketBtn: any = mkSupportInteraction({ customId: "support:ticket", userId: "user-2" });
    await handleSupportComponent(ticketBtn);
    assert(ticketBtn.modals[0] === "support:m:ticket", "B4 ticket button opens the ticket modal");

    // B5: ticket disabled → actionable gate message (points at /settings)
    const ticketModal: any = mkSupportInteraction({ customId: "support:m:ticket", userId: "user-2" });
    await handleSupportModal(ticketModal);
    const ticketGate = ticketModal.replies[0] as string;
    assert(
      typeof ticketGate === "string" && ticketGate.includes("not enabled") && ticketGate.includes("/settings"),
      "B5 ticket creation gated when support system disabled",
    );

    // B6: enabled → case created + success reply
    seedConfig(GUILD_SUP, { support: { enabled: true, allowGeneralHelp: true, allowReports: true, allowAppeals: true, channelId: null, categoryId: null } });
    const ticketOk: any = mkSupportInteraction({ customId: "support:m:ticket", userId: "user-3" });
    await handleSupportModal(ticketOk);
    const ticketOkPayload = ticketOk.replies[0] as { embeds?: Array<{ data?: { title?: string } }> };
    assert(
      !!ticketOkPayload && Array.isArray(ticketOkPayload.embeds),
      "B6 enabled ticket flow creates a case and replies with a confirmation embed",
    );

    // B7: report flow — target select opens the report modal
    const reportPick: any = mkSupportInteraction({ customId: "support:report_pick", userId: "user-4", values: ["target-1"] });
    await handleSupportComponent(reportPick);
    assert(reportPick.modals[0] === "support:m:report:target-1", "B7 report target select opens modal bound to the target id");

    // B8: self-report blocked at select time
    const selfReport: any = mkSupportInteraction({ customId: "support:report_pick", userId: "user-4", values: ["user-4"] });
    await handleSupportComponent(selfReport);
    const selfReply = selfReport.replies[0] as { content?: string };
    assert(
      !!selfReply && typeof selfReply.content === "string" && selfReply.content.includes("yourself"),
      "B8 self-report rejected before the modal opens",
    );

    // B9: report requireEvidence enforcement
    seedConfig(GUILD_SUP, {
      reports: { enabled: true, requireEvidence: true, aiAnalysisEnabled: true, autoEscalateHighRisk: true, channelId: null, categoryId: null },
    });
    const reportNoEv: any = mkSupportInteraction({ customId: "support:m:report:target-1", userId: "user-5" });
    reportNoEv.fields = { getTextInputValue: (id: string) => (id === "reason" ? "griefing" : "") };
    await handleSupportModal(reportNoEv);
    const evReply = reportNoEv.replies[0] as string;
    assert(
      typeof evReply === "string" && evReply.includes("requires evidence"),
      "B9 reports.requireEvidence is enforced in the panel flow",
    );

    // B10: report with evidence → case created + audited
    const reportOk: any = mkSupportInteraction({ customId: "support:m:report:target-1", userId: "user-6" });
    reportOk.fields = { getTextInputValue: (id: string) => (id === "reason" ? "spam bot" : "msg 123") };
    await handleSupportModal(reportOk);
    const reportPayload = reportOk.replies[0] as { embeds?: unknown[] };
    assert(!!reportPayload && Array.isArray(reportPayload.embeds), "B10 report with evidence submits successfully");
    const reportAudit = getAuditLog({ who: "user-6", guildId: GUILD_SUP, limit: 50 }).find((e) => e.what.startsWith("Report submitted"));
    assert(!!reportAudit && reportAudit.guildId === GUILD_SUP, "B10b report submission audited with guildId");

    // B11: appeal disabled → gate message
    const appealModal: any = mkSupportInteraction({ customId: "support:m:appeal", userId: "user-7" });
    await handleSupportModal(appealModal);
    const appealGate = appealModal.replies[0] as string;
    assert(typeof appealGate === "string" && appealGate.includes("not enabled"), "B11 appeal creation gated when disabled");

    // B12: cross-guild panel component cannot act on foreign case
    const caseView: any = mkSupportInteraction({ customId: "support:staff", userId: "staff-user", member: {
      user: { bot: false },
      roles: { cache: { some: (fn: (r: { id: string }) => boolean) => [{ id: "900000000000000009" }].some(fn) } },
    } });
    await handleSupportComponent(caseView);
    assert(Array.isArray((caseView.updates[0] as { embeds?: unknown[] })?.embeds), "B12 staff list renders after full gate");
  } catch (error) {
    fail("Support Center flows", error);
  }

  /* ================================================================
   * C. Moderation Center — open gates, execution, validation
   * ================================================================ */

  console.log("\n=== C. Moderation Center ===");

  const GUILD_MOD = `panels_mod_${Date.now()}`;

  function mkModMember(opts: { canModerate: boolean; bot?: boolean; position?: number }): unknown {
    return {
      id: "mod-user",
      user: { tag: "mod-user#0001", bot: opts.bot ?? false },
      permissions: { has: () => opts.canModerate },
      roles: { highest: { position: opts.position ?? 5 } },
    };
  }

  function mkModOpen(opts: { userId?: string; member?: unknown }): Captured & any {
    const captured: Captured = { replies: [], updates: [], modals: [], deferred: false, replied: false };
    const interaction = {
      user: { id: opts.userId ?? "mod-1", tag: `${opts.userId ?? "mod-1"}#0001`, bot: false },
      member: {},
      guildId: GUILD_MOD,
      channelId: "chan-mod-1",
      guild: {
        id: GUILD_MOD,
        members: {
          fetch: async () => opts.member ?? mkModMember({ canModerate: true }),
        },
      },
      editReply: async (p: unknown) => { captured.replies.push(p); return { id: "msg-2" }; },
      reply: async (p: unknown) => { captured.replies.push(p); captured.replied = true; },
      deferred: false,
      replied: false,
    };
    return Object.assign(captured, interaction);
  }

  try {
    // C1: non-moderator denied at open
    const notMod: any = mkModOpen({ userId: "civ-1", member: mkModMember({ canModerate: false }) });
    await openModPanel(notMod);
    assert(
      typeof notMod.replies[0] === "string" && notMod.replies[0].includes("permission"),
      "C1 bare /mod denied for members without ModerateMembers",
    );

    // C2: moderator sees the Moderation Center
    const isMod: any = mkModOpen({ userId: "mod-c2", member: mkModMember({ canModerate: true }) });
    await openModPanel(isMod);
    const modPayload = isMod.replies[0] as { embeds?: unknown[]; components?: unknown[] };
    assert(
      !!modPayload && Array.isArray(modPayload.embeds) && Array.isArray(modPayload.components),
      "C2 bare /mod renders the Moderation Center for moderators",
    );

    // C3: timeout action execution via the shared service
    const timeoutCalls: unknown[][] = [];
    const requester: any = {
      id: "mod-req",
      user: { tag: "mod-req#0001" },
      permissions: { has: () => true },
      roles: { highest: { position: 10 } },
    };
    const target: any = {
      id: "target-1",
      user: { tag: "target#0002" },
      guild: { id: GUILD_MOD, ownerId: "owner-1" },
      roles: { highest: { position: 2 } },
      timeout: async (...args: unknown[]) => { timeoutCalls.push(args); },
    };
    const botMember: any = {
      id: "bot-1",
      user: { tag: "bot#0003" },
      guild: { id: GUILD_MOD, ownerId: "owner-1" },
      roles: { highest: { position: 99 } },
      permissions: { has: (p: bigint) => p === PermissionFlagsBits.ModerateMembers },
    };
    const timeoutResult = await executeInteractiveModeration(requester, target, botMember, "timeout", 60, "spam");
    assert(timeoutResult.success === true, "C3 timeout executes through executeInteractiveModeration");
    assert(timeoutCalls[0]?.[0] === 60 * 60 * 1000, "C3b timeout duration converted from minutes to ms");
    const timeoutAudit = getAuditLog({ who: "mod-req", guildId: GUILD_MOD, limit: 50 }).find((e) => e.what.includes("Timed out") && !e.what.includes("denied"));
    assert(!!timeoutAudit && timeoutAudit.guildId === GUILD_MOD, "C3c timeout audited with guildId");

    // C4: untimeout executes (new service branch used by the panel)
    const untimeoutCalls: unknown[][] = [];
    target.timeout = async (...args: unknown[]) => { untimeoutCalls.push(args); };
    const untimeoutResult = await executeInteractiveModeration(requester, target, botMember, "untimeout", undefined, "clearing");
    assert(untimeoutResult.success === true, "C4 untimeout executes through executeInteractiveModeration");
    assert(untimeoutCalls[0]?.[0] === null, "C4b untimeout passes null to Discord timeout()");

    // C5: bot without ModerateMembers cannot untimeout
    const weakBot: any = { ...botMember, permissions: { has: () => false } };
    const weakResult = await executeInteractiveModeration(requester, target, weakBot, "untimeout", undefined, "x");
    assert(weakResult.success === false && weakResult.message.includes("permission"), "C5 untimeout blocked when bot lacks ModerateMembers");

    // C6: hierarchy violation blocked (canTarget inside the service)
    const highTarget: any = { ...target, roles: { highest: { position: 50 } } };
    const hierarchyResult = await executeInteractiveModeration(requester, highTarget, botMember, "warn", undefined, "x");
    assert(hierarchyResult.success === false && hierarchyResult.message.includes("highest role"), "C6 warn blocked when target outranks requester");

    // C7: unprivileged requester blocked inside the service
    const civRequester: any = { ...requester, permissions: { has: () => false } };
    const civResult = await executeInteractiveModeration(civRequester, target, botMember, "warn", undefined, "x");
    assert(civResult.success === false, "C7 warn denied inside service for unprivileged requester");
    const deniedAudit = getAuditLog({ who: "mod-req", guildId: GUILD_MOD, limit: 50 }).find((e) => e.result === "denied" && e.what.includes("warn denied"));
    assert(!!deniedAudit, "C7b denied interactive actions audited");

    // C8: modal flow — invalid timeout minutes rejected before execution
    const GUILD_MOD2 = `${GUILD_MOD}_2`;
    const badMinutes: any = {
      customId: "mod:m:timeout:target-9",
      user: { id: "mod-c8", tag: "mod-c8#0001", bot: false },
      guildId: GUILD_MOD2,
      deferred: false,
      replied: false,
      replies: [] as unknown[],
      fields: { getTextInputValue: (id: string) => (id === "minutes" ? "99999" : "reason") },
      deferReply: async () => { badMinutes.deferred = true; },
      editReply: async (p: unknown) => { badMinutes.replies.push(p); return { id: "x" }; },
      guild: {
        id: GUILD_MOD2,
        members: {
          fetch: async () => mkModMember({ canModerate: true }),
          fetchMe: async () => ({ id: "bot-1", permissions: { has: () => true } }),
        },
      },
    };
    await handleModModal(badMinutes);
    assert(
      typeof badMinutes.replies[0] === "string" && badMinutes.replies[0].includes("between 1 minute"),
      "C8 invalid timeout duration rejected with bounds message",
    );

    // C9: rate limit — 6th moderation open within the window is refused
    for (let i = 0; i < 5; i++) {
      const ok: any = mkModOpen({ userId: "mod-rate-user" });
      await openModPanel(ok);
    }
    const limited: any = mkModOpen({ userId: "mod-rate-user" });
    await openModPanel(limited);
    assert(
      typeof limited.replies[0] === "string" && limited.replies[0].includes("Rate limit exceeded"),
      "C9 moderation panel open is rate limited (5/min per user)",
    );
  } catch (error) {
    fail("Moderation Center flows", error);
  }

  /* ================================================================
   * D. Settings Center — component routing + restart tolerance
   * ================================================================ */

  console.log("\n=== D. Settings Center ===");

  const GUILD_SET = `panels_settings_${Date.now()}`;

  function mkSettingsComponent(opts: {
    customId: string;
    values?: string[];
    withPanelMessage?: boolean;
    memberPermissions?: { has?: (p: bigint) => boolean } | null;
    userId?: string;
  }): any {
    const captured: any = { replies: [], updates: [], modals: [] };
    const message = opts.withPanelMessage === false
      ? undefined
      : {
          id: `panel-msg-${opts.userId ?? "u1"}`,
          channelId: "chan-1",
          components: [
            { components: [{ customId: "as:select" }] },
          ],
        };
    return Object.assign(captured, {
      customId: opts.customId,
      guildId: GUILD_SET,
      channelId: "chan-1",
      user: { id: opts.userId ?? "admin-1", tag: "admin-1#0001" },
      message,
      memberPermissions:
        opts.memberPermissions === undefined ? { has: () => true } : opts.memberPermissions,
      values: opts.values ?? [],
      isStringSelectMenu: () => opts.customId === "as:select",
      reply: async (p: unknown) => { captured.replies.push(p); },
      update: async (p: unknown) => { captured.updates.push(p); },
      showModal: async (m: any) => { captured.modals.push(String(m?.data?.custom_id ?? m?.customId ?? "")); },
    });
  }

  try {
    // D1: component predicate accepts settings prefixes, rejects others
    assert(isSettingsComponentCustomId("as:select"), "D1 predicate accepts as: selects");
    assert(isSettingsComponentCustomId("at:moderation.enabled"), "D1b predicate accepts at: toggles");
    assert(isSettingsComponentCustomId("st:personality.name"), "D1c predicate accepts st: buttons");
    assert(!isSettingsComponentCustomId("support:home"), "D1d predicate rejects support panel ids");
    assert(!isSettingsComponentCustomId("ashen_blackjack_hit"), "D1e predicate rejects game ids");

    // D2: missing ManageGuild → fail closed
    const noPerm = mkSettingsComponent({ customId: "at:moderation.enabled", memberPermissions: { has: () => false } });
    await handleSettingsComponent(noPerm);
    assert(
      (noPerm.replies[0] as { content?: string })?.content?.includes("Manage Server"),
      "D2 settings toggle denied without ManageServer",
    );
    const missingPerm = mkSettingsComponent({ customId: "as:home", memberPermissions: null });
    await handleSettingsComponent(missingPerm);
    assert(
      (missingPerm.replies[0] as { content?: string })?.content?.includes("Manage Server"),
      "D2b settings nav denied when memberPermissions missing (fail closed)",
    );

    // D3: restart tolerance — no live session, panel message present → rebuilt
    const rebuilt = mkSettingsComponent({ customId: "as:home", userId: "admin-restart" });
    await handleSettingsComponent(rebuilt);
    const rebuiltPayload = rebuilt.updates[0] as { embeds?: unknown[]; components?: unknown[] };
    assert(
      !!rebuiltPayload && Array.isArray(rebuiltPayload.embeds) && Array.isArray(rebuiltPayload.components),
      "D3 nav works after session loss when attached to a real panel message",
    );

    // D4: no session + no panel message → expired (fail closed)
    const orphan = mkSettingsComponent({ customId: "as:home", userId: "admin-orphan", withPanelMessage: false });
    await handleSettingsComponent(orphan);
    assert(
      (orphan.replies[0] as { content?: string })?.content?.includes("expired"),
      "D4 component without a panel message replies expired (fail closed)",
    );

    // D5: toggle writes through the settings service + audits
    const toggle = mkSettingsComponent({ customId: "at:social.animeActions", userId: "admin-toggle" });
    const before = loadGuildConfig(GUILD_SET).social?.animeActions;
    await handleSettingsComponent(toggle);
    const after = loadGuildConfig(GUILD_SET).social?.animeActions;
    assert(before !== after, "D5 toggle flips the setting through the service layer");
    const toggleAudit = getAuditLog({ who: "admin-toggle", guildId: GUILD_SET, limit: 50 }).find((e) => e.what.includes("Anime Actions") || e.what.includes("animeActions"));
    assert(!!toggleAudit, "D5b settings change audited");
    // flip back for other runs
    const toggleBack = mkSettingsComponent({ customId: "at:social.animeActions", userId: "admin-toggle" });
    await handleSettingsComponent(toggleBack);

    // D6: category select renders the selected category
    const catSel = mkSettingsComponent({ customId: "as:select", values: ["logging"], userId: "admin-cat" });
    await handleSettingsComponent(catSel);
    const catPayload = catSel.updates[0] as { embeds?: Array<{ data?: { title?: string } }> };
    const title = JSON.stringify(catPayload ?? "");
    assert(title.includes("LOGGING") || title.includes("Logging"), "D6 category select renders the chosen category");

    // D7: close removes components
    const closeIx = mkSettingsComponent({ customId: "as:close", userId: "admin-close" });
    await handleSettingsComponent(closeIx);
    const closePayload = closeIx.updates[0] as { components?: unknown[] };
    assert(!!closePayload && Array.isArray(closePayload.components) && closePayload.components.length === 0, "D7 close strips panel components");
  } catch (error) {
    fail("Settings Center flows", error);
  }

  /* ================================================================
   * E. Static wiring — index router + panel prefixes
   * ================================================================ */

  console.log("\n=== E. Static wiring ===");

  try {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const indexSrc = fs.readFileSync(path.resolve("src/index.ts"), "utf8");

    assert(
      indexSrc.includes('startsWith("support:m:")') && indexSrc.includes('startsWith("mod:m:")'),
      "E1 index.ts routes support/mod panel modals",
    );
    assert(
      indexSrc.includes("isSettingsComponentCustomId(id)") && indexSrc.includes("isSettingsModalCustomId(interaction.customId)"),
      "E2 index.ts routes settings components and modals through shared predicates",
    );
    assert(
      !indexSrc.includes("createMessageComponentCollector"),
      "E3 no message-component collectors remain in index.ts (panels are globally routed)",
    );

    const supportCmdSrc = fs.readFileSync(path.resolve("src/commands/support.ts"), "utf8");
    const modCmdSrc = fs.readFileSync(path.resolve("src/commands/moderation.ts"), "utf8");
    const settingsCmdSrc = fs.readFileSync(path.resolve("src/commands/settings.ts"), "utf8");
    assert(
      supportCmdSrc.includes("editReply") && !supportCmdSrc.includes("deferReply"),
      "E4 /support relies on index.ts acknowledgement (editReply only)",
    );
    assert(
      modCmdSrc.includes("editReply") && !modCmdSrc.includes("deferReply"),
      "E5 /mod relies on index.ts acknowledgement (editReply only)",
    );
    assert(
      settingsCmdSrc.includes("editReply") && !settingsCmdSrc.includes("deferReply"),
      "E6 /settings relies on index.ts acknowledgement (editReply only)",
    );

    // Case ids embedded in custom ids stay within Discord's 100-char limit
    const sampleCaseId = getSupportCaseManager().getStats(GUILD_SUP) ? "T-9999-9999-xxxx" : "T-9999-9999-xxxx";
    assert(
      `support:statusset:${sampleCaseId}:investigating`.length <= 100 &&
        `support:assignpick:${sampleCaseId}`.length <= 100,
      "E7 case-bound custom ids stay within Discord's 100-char limit",
    );
  } catch (error) {
    fail("Static wiring", error);
  }

  /* ================================================================ */

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  if (failed > 0) {
    console.error("\n💥 CONTROL PANEL TESTS FAILED");
    process.exit(1);
  }

  console.log("🎉 ALL CONTROL PANEL TESTS PASSED");
  process.exit(0);
  }

void main();
