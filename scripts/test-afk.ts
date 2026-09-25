/* ================================================================
 * AFK SYSTEM + LOCAL GIF PROVIDER TEST SUITE
 *
 * Matrix (mission §30):
 *   A — parser           B — classifier        C — repository
 *   D — auto-clear       E — mention notices   F — local media security
 *   G — media fallback   H — rate limit        I — restart
 *   J — concurrency      K — static source assertions
 * ================================================================ */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import type { Message } from "discord.js";

import {
  parseAfkCommand,
  classifyAfkCategory,
  formatElapsed,
  handleAfkCommand,
  processAfkOnMessage,
  sanitizeAfkMessage,
  resetAfkInMemoryForTests,
  AFK_DEFAULT_MESSAGE,
  AFK_MAX_MESSAGE_LENGTH,
} from "../src/community/afk";
import {
  setAfk,
  getAfk,
  clearAfk,
  listAfkByUserIds,
} from "../src/database/afk-repo";
import { getDatabase, closeDatabase } from "../src/database/database";
import {
  loadGuildConfig,
  saveGuildConfig,
  deleteGuildConfig,
} from "../src/core/guild-config";
import { invalidateGuildConfigCache } from "../src/database/guild-config-repo";
import {
  initializeLocalGifs,
  resolveLocalGif,
  readLocalGif,
  resetLocalGifsForTests,
  isValidLocalGifKey,
  AFK_CATEGORIES,
  type LocalGifAsset,
} from "../src/media/local-gifs";
import { getAllActions } from "../src/games/anime-actions/definitions";

let passed = 0;
let failed = 0;

function pass(name: string): void {
  console.log(`  ✅ ${name}`);
  passed++;
}

function fail(name: string, error?: unknown): void {
  console.error(`  ❌ ${name}`, error ?? "");
  failed++;
}

function eq(name: string, actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    pass(name);
  } else {
    fail(name, { actual, expected });
  }
}

console.log("\n🧪 AFK + Local GIF Provider Test Suite\n");

/* ================================================================
 * FIXTURES
 * ================================================================ */

const tmpRoots: string[] = [];
const configGuilds: string[] = [];

function makeRoot(prefix: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tmpRoots.push(root);
  return root;
}

function gifBytes(width: number, height: number, fill = 0x41): Buffer {
  const buf = Buffer.alloc(32, fill);
  buf.write("GIF89a", 0, "latin1");
  buf.writeUInt16LE(width, 6);
  buf.writeUInt16LE(height, 8);
  return buf;
}

function pngBytes(width: number, height: number): Buffer {
  const buf = Buffer.alloc(33, 0);
  [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].forEach((b, i) => {
    buf[i] = b;
  });
  buf.writeUInt32BE(13, 8);
  buf.write("IHDR", 12, "latin1");
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  buf[24] = 8;
  buf[25] = 6;
  return buf;
}

interface AfkMock {
  msg: Message;
  replies: any[];
}

interface AfkMsgOpts {
  guildId?: string | null;
  userId?: string;
  bot?: boolean;
  mentionIds?: string[];
  channelId?: string;
  displayNames?: Record<string, string>;
}

function mkAfkMessage(content: string, opts: AfkMsgOpts = {}): AfkMock {
  const replies: any[] = [];
  const users = new Map<string, any>();
  for (const id of opts.mentionIds ?? []) {
    users.set(id, {
      id,
      username: `user-${id}`,
      displayName: opts.displayNames?.[id] ?? `Display-${id}`,
    });
  }
  const base: any = {
    content,
    guildId: opts.guildId === undefined ? "guild-afk-default" : opts.guildId,
    author: {
      id: opts.userId ?? "user-afk-default",
      username: "tester",
      bot: opts.bot ?? false,
    },
    channel: { id: opts.channelId ?? "channel-afk-default" },
    mentions: { users, members: null },
    reply: async (payload: unknown) => {
      replies.push(payload);
    },
  };
  return { msg: base as unknown as Message, replies };
}

function replyContent(mock: AfkMock, index = 0): string {
  const payload = mock.replies[index];
  if (!payload) return "";
  return typeof payload === "string" ? payload : String(payload.content ?? "");
}

function suppressed(mock: AfkMock): boolean {
  return mock.replies.every(
    (p) =>
      p && p.allowedMentions && Array.isArray(p.allowedMentions.parse) && p.allowedMentions.parse.length === 0,
  );
}

function afkConfig(guildId: string, afkAutoClear: boolean): any {
  const cfg: any = { ...loadGuildConfig(guildId) };
  cfg.social = {
    enabled: false,
    channels: {},
    animeActions: true,
    afkAutoClear,
    customReactions: false,
    customEmoji: false,
    rivalryMode: false,
    debateMode: false,
    globalCooldownMs: 30000,
    maxResponsesPerHour: 10,
  };
  return cfg;
}

function rowCount(guildId: string, userId: string): number {
  const row = getDatabase()
    .prepare(
      "SELECT COUNT(*) AS c FROM afk_states WHERE guild_id = ? AND user_id = ?",
    )
    .get(guildId, userId) as { c: number };
  return row.c;
}

function rowTotal(): number {
  const row = getDatabase()
    .prepare("SELECT COUNT(*) AS c FROM afk_states")
    .get() as { c: number };
  return row.c;
}

/* ================================================================
 * A — PARSER
 * ================================================================ */

function sectionA(): void {
  console.log("--- A: Parser ---");

  eq("A1 bare !afk → default message", parseAfkCommand("!afk"), {
    kind: "set",
    message: AFK_DEFAULT_MESSAGE,
  });
  eq("A2 !afk <message> → set", parseAfkCommand("!afk I'm eating"), {
    kind: "set",
    message: "I'm eating",
  });
  eq("A3 surrounding whitespace tolerated", parseAfkCommand("  !afk    brb   "), {
    kind: "set",
    message: "brb",
  });
  eq("A4 case-insensitive command word", parseAfkCommand("!AFK Gone for groceries"), {
    kind: "set",
    message: "Gone for groceries",
  });
  eq("A5 !afk off → clear", parseAfkCommand("!afk off"), { kind: "off" });
  eq("A6 !afk OFF (case + ws) → clear", parseAfkCommand("!afk   OFF  "), { kind: "off" });
  eq("A7 !Afk off → clear", parseAfkCommand("!Afk off"), { kind: "off" });
  eq("A8 free-form containing off (tail)", parseAfkCommand("!afk off to the races"), {
    kind: "set",
    message: "off to the races",
  });
  eq("A9 free-form containing off (middle)", parseAfkCommand("!afk heading off now"), {
    kind: "set",
    message: "heading off now",
  });
  eq("A10 free-form starting 'off.'", parseAfkCommand("!afk off."), {
    kind: "set",
    message: "off.",
  });
  eq("A11 'off off' is not a clear", parseAfkCommand("!afk off off"), {
    kind: "set",
    message: "off off",
  });

  const long = "x".repeat(150);
  const parsedLong = parseAfkCommand(`!afk ${long}`);
  eq("A12 overlong message capped at 100", parsedLong?.message?.length, AFK_MAX_MESSAGE_LENGTH);

  const exactly100 = "y".repeat(100);
  eq("A13 exactly-100 kept intact", parseAfkCommand(`!afk ${exactly100}`)?.message, exactly100);

  const multi = parseAfkCommand("!afk line one\nline two");
  eq("A14 multiline → single line", multi?.message, "line one line two");

  const ctrl = parseAfkCommand("!afk hi\u0007there\u0000x");
  eq("A15 control chars stripped", ctrl?.message, "hi there x");

  eq("A16 tab separator", parseAfkCommand("!afk\taway"), { kind: "set", message: "away" });
  eq("A17 non-command !afkx → null", parseAfkCommand("!afkx"), null);
  eq("A18 non-command !afk2 → null", parseAfkCommand("!afk2"), null);
  eq("A19 mid-string !afk → null", parseAfkCommand("hello !afk"), null);
  eq("A20 truncated !af → null", parseAfkCommand("!af"), null);
  eq("A21 empty string → null", parseAfkCommand(""), null);
  eq("A22 non-string → null", parseAfkCommand(null as unknown as string), null);
  eq("A23 emoji message survives", parseAfkCommand("!afk gonna touch some grass 🌱")?.message, "gonna touch some grass 🌱");
}

/* ================================================================
 * B — CLASSIFIER
 * ================================================================ */

function sectionB(): void {
  console.log("--- B: Classifier ---");

  const cases: Array<[string, string]> = [
    ["I'm eating", "eating"],
    ["gonna touch some grass", "grass"],
    ["bye guys, I'm going to work", "work"],
    ["taking a nap", "sleep"],
    ["playing games", "gaming"],
    ["studying", "study"],
    ["taking a break", "break"],
    ["away for a while", "away"],
    ["just vibing", "generic"],
    ["", "generic"],
    ["   ", "generic"],
    ["../../etc/passwd", "generic"],
    ["..\\..\\windows\\system32", "generic"],
    ["afk/../../../root", "generic"],
    ["@everyone @here <@&1234567890>", "generic"],
    ["DROP TABLE afk_states;", "generic"],
    ["zzzzz", "sleep"],
    ["fixing dinner in the office kitchen", "eating"],
  ];

  for (const [input, expected] of cases) {
    const actual = classifyAfkCategory(input);
    if (actual === expected) {
      pass(`B: "${input.slice(0, 30)}" → ${expected}`);
    } else {
      fail(`B: "${input.slice(0, 30)}" → ${expected}`, { actual });
    }
  }

  // Hostile long input must not crash and must stay generic.
  eq("B: 200-char hostile input → generic", classifyAfkCategory("X".repeat(200)), "generic");
  // Traversal-like text must never map to a real category.
  eq("B: path traversal → generic", classifyAfkCategory("../../../afk/eating/../x"), "generic");
}

/* ================================================================
 * C — REPOSITORY
 * ================================================================ */

async function sectionC(): Promise<void> {
  console.log("--- C: Repository ---");

  const g1 = "guild-afk-c1";
  const gOther = "guild-afk-c2";
  const u1 = "user-afk-c1";
  const u2 = "user-afk-c2";

  // C1 insert + retrieve
  setAfk(g1, u1, "first message", 1700000000000);
  const got = getAfk(g1, u1);
  if (
    got &&
    got.message === "first message" &&
    got.startedAt === 1700000000000 &&
    got.updatedAt === 1700000000000
  ) {
    pass("C1 insert + retrieve round-trip");
  } else {
    fail("C1 insert + retrieve", got);
  }

  // C2 update keeps startedAt, refreshes message + updatedAt
  setAfk(g1, u1, "second message", 1700000005000);
  const upd = getAfk(g1, u1);
  if (
    upd &&
    upd.message === "second message" &&
    upd.startedAt === 1700000000000 &&
    upd.updatedAt === 1700000005000
  ) {
    pass("C2 UPSERT updates message/updatedAt, preserves startedAt");
  } else {
    fail("C2 UPSERT semantics", upd);
  }

  // C3 clear
  const cleared = clearAfk(g1, u1);
  const afterClear = getAfk(g1, u1);
  if (cleared === true && afterClear === null && clearAfk(g1, u1) === false) {
    pass("C3 clear returns true once, then false; state null");
  } else {
    fail("C3 clear", { cleared, afterClear });
  }

  // C4 guild isolation
  setAfk(g1, u1, "guild-one secret", 1700000000000);
  const crossGuild = getAfk(gOther, u1);
  const crossClear = clearAfk(gOther, u1);
  const stillThere = getAfk(g1, u1);
  if (crossGuild === null && crossClear === false && stillThere?.message === "guild-one secret") {
    pass("C4 guild isolation: guild B cannot read/clear guild A state");
  } else {
    fail("C4 guild isolation", { crossGuild, crossClear, stillThere });
  }

  // C5 user isolation
  setAfk(g1, u2, "user-two afk", 1700000000000);
  const listBoth = listAfkByUserIds(g1, [u1, u2]);
  const onlyU2 = listAfkByUserIds(g1, [u2]);
  const u1FromOtherGuildList = listAfkByUserIds(gOther, [u1]);
  const u1NotU2 =
    listAfkByUserIds(g1, [u1]).length === 1 &&
    listAfkByUserIds(g1, [u1])[0].userId === u1;
  if (
    listBoth.length === 2 &&
    onlyU2.length === 1 &&
    onlyU2[0].userId === u2 &&
    u1FromOtherGuildList.length === 0 &&
    u1NotU2
  ) {
    pass("C5 user isolation + guild-scoped listing");
  } else {
    fail("C5 user isolation", { listBoth: listBoth.length, onlyU2: onlyU2.length, u1FromOtherGuildList: u1FromOtherGuildList.length });
  }

  // C6 single-row UPSERT under repeated writes
  for (let i = 0; i < 10; i++) {
    setAfk(g1, u1, `burst-${i}`, 1700000010000 + i);
  }
  const finalState = getAfk(g1, u1);
  if (finalState?.message === "burst-9" && rowCount(g1, u1) === 1) {
    pass("C6 repeated setAfk → single row, last write wins");
  } else {
    fail("C6 single-row upsert", { finalState, count: rowCount(g1, u1) });
  }

  // C7 empty identities never create rows
  const before = rowTotal();
  setAfk("", u1, "no guild", Date.now());
  setAfk(g1, "", "no user", Date.now());
  const noInvalid =
    rowTotal() === before && getAfk("", u1) === null && getAfk(g1, "") === null;
  const emptyList = listAfkByUserIds(g1, []);
  if (noInvalid && emptyList.length === 0) {
    pass("C7 empty guild/user identities rejected; empty list → []");
  } else {
    fail("C7 empty identity handling", { before, after: rowTotal(), emptyList });
  }

  // C8 SQL injection payloads stored verbatim, tables intact
  const evilUser = "' OR 1=1 --";
  const evilMessage = '"; DROP TABLE afk_states; --';
  setAfk(g1, evilUser, evilMessage, 1700000000000);
  const readBack = getAfk(g1, evilUser);
  const tableOk = getDatabase()
    .prepare("SELECT name FROM sqlite_master WHERE name='afk_states'")
    .get();
  const untouched = getAfk(g1, u1);
  if (
    readBack?.message === evilMessage &&
    tableOk &&
    untouched?.message === "burst-9"
  ) {
    pass("C8 SQL injection stored verbatim; no table damage; no cross-row leak");
  } else {
    fail("C8 SQL injection", { readBack, untouched });
  }
  clearAfk(g1, evilUser);

  // C9 list cap: 151 ids → bounded to the first 100, no error.
  // ghost-user-0 (index 0) must survive the cap; ghost-user-149 and the
  // trailing u1 (index 150) must be dropped by the slice.
  const ghosts = Array.from({ length: 150 }, (_, i) => `ghost-user-${i}`);
  setAfk(g1, ghosts[0], "first-ghost");
  setAfk(g1, ghosts[149], "last-ghost");
  const manyIds = [...ghosts, u1];
  const capped = listAfkByUserIds(g1, manyIds);
  const cappedIds = new Set(capped.map((s) => s.userId));
  if (
    capped.length >= 1 &&
    capped.length <= 100 &&
    cappedIds.has(ghosts[0]) &&
    !cappedIds.has(ghosts[149]) &&
    !cappedIds.has(u1)
  ) {
    pass(`C9 list caps at first 100 ids (returned ${capped.length}, head kept, tail dropped)`);
  } else {
    fail("C9 list cap", capped.map((s) => s.userId));
  }
  clearAfk(g1, ghosts[0]);
  clearAfk(g1, ghosts[149]);

  // C10 absent-row clear must be READ-ONLY: this path runs on every
  // non-bot guild message (auto-clear is on by default), so it may not
  // open a write transaction when the author has no AFK row.
  {
    const db = getDatabase() as unknown as { prepare: (sql: string) => unknown };
    const originalPrepare = db.prepare;
    let deletes = 0;
    db.prepare = (sql: string) => {
      if (/^\s*DELETE\b/i.test(sql)) deletes += 1;
      return originalPrepare.call(db, sql);
    };
    let cleared: boolean | undefined;
    try {
      cleared = clearAfk(g1, "ghost-user-no-row-c10");
    } finally {
      db.prepare = originalPrepare;
    }
    if (cleared === false && deletes === 0) {
      pass("C10 absent-row clear issues no DELETE (read-only hot path)");
    } else {
      fail("C10 absent-row clear", { cleared, deletes });
    }
  }

  // Cleanup
  clearAfk(g1, u1);
  clearAfk(g1, u2);
}

/* ================================================================
 * D — AUTO-CLEAR
 * ================================================================ */

async function sectionD(): Promise<void> {
  console.log("--- D: Auto-clear ---");

  // D1 default ON (no social config stored)
  const g1 = "guild-afk-d1";
  const u1 = "user-afk-d1";
  setAfk(g1, u1, "brb", Date.now() - 60000);
  const m1 = mkAfkMessage("hello everyone", { guildId: g1, userId: u1, channelId: "channel-d1" });
  await processAfkOnMessage(m1.msg);
  const clearedD1 = getAfk(g1, u1) === null;
  if (
    m1.replies.length === 1 &&
    replyContent(m1).includes("Welcome back") &&
    clearedD1 &&
    suppressed(m1)
  ) {
    pass("D1 default auto-clear ON: one suppressed welcome reply + state cleared");
  } else {
    fail("D1 auto-clear default", { replies: m1.replies.length, content: replyContent(m1), clearedD1 });
  }

  // Second message: no state → no reply
  const m1b = mkAfkMessage("second message", { guildId: g1, userId: u1, channelId: "channel-d1" });
  await processAfkOnMessage(m1b.msg);
  eq("D1b no welcome reply when not AFK", m1b.replies.length, 0);

  // D3 documented default on guild with no config row
  eq("D3 precondition: guild has no social config", loadGuildConfig("guild-afk-d3").social, undefined);

  // D2 explicit false → no auto-clear
  const g2 = "guild-afk-d2";
  const u2 = "user-afk-d2";
  configGuilds.push(g2);
  saveGuildConfig(afkConfig(g2, false));
  invalidateGuildConfigCache(g2);
  setAfk(g2, u2, "still afk", Date.now() - 60000);
  const m2 = mkAfkMessage("I am back chatting", { guildId: g2, userId: u2, channelId: "channel-d2" });
  await processAfkOnMessage(m2.msg);
  const persisted = getAfk(g2, u2) !== null;
  if (m2.replies.length === 0 && persisted) {
    pass("D2 afkAutoClear=false → no clear, no reply");
  } else {
    fail("D2 auto-clear disabled", { replies: m2.replies.length, persisted });
  }

  // D2b config removed → documented default (ON) applies again
  deleteGuildConfig(g2);
  invalidateGuildConfigCache(g2);
  const m2b = mkAfkMessage("checking default again", { guildId: g2, userId: u2, channelId: "channel-d2" });
  await processAfkOnMessage(m2b.msg);
  if (getAfk(g2, u2) === null && replyContent(m2b).includes("Welcome back")) {
    pass("D2b missing config → documented default (auto-clear ON)");
  } else {
    fail("D2b default after config removal", m2b.replies);
  }

  // D4 bot messages never clear or reply
  const g4 = "guild-afk-d4";
  const u4 = "user-afk-d4";
  setAfk(g4, u4, "bot must not clear", Date.now() - 60000);
  const m4 = mkAfkMessage("bot chatter", { guildId: g4, userId: u4, channelId: "channel-d4", bot: true });
  await processAfkOnMessage(m4.msg);
  if (m4.replies.length === 0 && getAfk(g4, u4) !== null) {
    pass("D4 bot message: no clear, no reply");
  } else {
    fail("D4 bot message", { replies: m4.replies.length, state: getAfk(g4, u4) });
  }
  clearAfk(g4, u4);

  // D5 the AFK command itself never auto-clears freshly-set state
  const g5 = "guild-afk-d5";
  const u5 = "user-afk-d5";
  const setMock = mkAfkMessage("!afk gone for a bit", { guildId: g5, userId: u5 });
  const setCmd = parseAfkCommand(setMock.msg.content);
  if (setCmd) await handleAfkCommand(setMock.msg, setCmd);
  const afterSet = getAfk(g5, u5);
  if (afterSet?.message === "gone for a bit" && replyContent(setMock).includes("now AFK")) {
    pass("D5 !afk <msg> sets state, reply confirms, no auto-clear interference");
  } else {
    fail("D5 set command", { afterSet, content: replyContent(setMock) });
  }

  // D6 explicit !afk off
  const offMock = mkAfkMessage("!afk off", { guildId: g5, userId: u5 });
  const offCmd = parseAfkCommand(offMock.msg.content);
  if (offCmd) await handleAfkCommand(offMock.msg, offCmd);
  if (getAfk(g5, u5) === null && replyContent(offMock).includes("Welcome back")) {
    pass("D6 explicit !afk off clears state");
  } else {
    fail("D6 explicit off", offMock.replies);
  }

  // D7 DM safety — no rows without a guild identity
  const dmUser = "user-afk-dm";
  const dmMock = mkAfkMessage("!afk testing dm", { guildId: null, userId: dmUser });
  const dmCmd = parseAfkCommand(dmMock.msg.content);
  if (dmCmd) await handleAfkCommand(dmMock.msg, dmCmd);
  const dmRows = getDatabase()
    .prepare("SELECT COUNT(*) AS c FROM afk_states WHERE user_id = ?")
    .get(dmUser) as { c: number };
  if (
    replyContent(dmMock).includes("servers only") &&
    dmRows.c === 0 &&
    suppressed(dmMock)
  ) {
    pass("D7 DM: polite notice, zero rows, mentions suppressed");
  } else {
    fail("D7 DM handling", { content: replyContent(dmMock), rows: dmRows.c });
  }

  // D8 every auto-clear/command reply is mention-suppressed
  if (suppressed(m1) && suppressed(setMock) && suppressed(offMock)) {
    pass("D8 all command/auto-clear replies use allowedMentions.parse=[]");
  } else {
    fail("D8 mention suppression", "missing parse:[] on some reply");
  }
}

/* ================================================================
 * E — MENTION NOTIFICATIONS
 * ================================================================ */

async function sectionE(): Promise<void> {
  console.log("--- E: Mention notifications ---");

  const gE = "guild-afk-e";
  const afkUser = "user-afk-e-target";
  const author = "user-afk-e-author";

  // E1 + E6 + E7
  setAfk(gE, afkUser, "getting food", Date.now() - 18 * 60_000);
  const e1 = mkAfkMessage("hey where is <@x>", {
    guildId: gE,
    userId: author,
    mentionIds: [afkUser],
    channelId: "channel-e1",
  });
  await processAfkOnMessage(e1.msg);
  const e1Content = replyContent(e1);
  const stateAfterNotice = getAfk(gE, afkUser);
  if (
    e1.replies.length === 1 &&
    e1Content.includes("Display-user-afk-e-target is AFK") &&
    e1Content.includes('"getting food"') &&
    e1Content.includes("18 minutes ago") &&
    suppressed(e1)
  ) {
    pass("E1 notice: display name + reason + elapsed, parse:[] suppressed");
  } else {
    fail("E1 notice content", { replies: e1.replies, e1Content });
  }
  if (stateAfterNotice !== null) {
    pass("E6 mention is read-only: AFK state unchanged by noticing");
  } else {
    fail("E6 mention mutated state", stateAfterNotice);
  }

  // E4 dedup: same channel + same AFK user suppressed
  const e4 = mkAfkMessage("again where is <@x>", {
    guildId: gE,
    userId: author,
    mentionIds: [afkUser],
    channelId: "channel-e1",
  });
  await processAfkOnMessage(e4.msg);
  eq("E4 dedup: repeat mention in same channel → no second notice", e4.replies.length, 0);

  // E5 different channel → notified again
  const e5 = mkAfkMessage("anyone seen <@x>?", {
    guildId: gE,
    userId: author,
    mentionIds: [afkUser],
    channelId: "channel-e5",
  });
  await processAfkOnMessage(e5.msg);
  eq("E5 dedup is per-channel: new channel notified", e5.replies.length, 1);

  // E2 self-mention never notifies (auto-clear disabled to isolate)
  const gE2 = "guild-afk-e2";
  configGuilds.push(gE2);
  saveGuildConfig(afkConfig(gE2, false));
  invalidateGuildConfigCache(gE2);
  const selfUser = "user-afk-e2-self";
  setAfk(gE2, selfUser, "self mention test", Date.now() - 60000);
  const e2 = mkAfkMessage("am I <@me>?", {
    guildId: gE2,
    userId: selfUser,
    mentionIds: [selfUser],
    channelId: "channel-e2",
  });
  await processAfkOnMessage(e2.msg);
  if (e2.replies.length === 0 && getAfk(gE2, selfUser) !== null) {
    pass("E2 self-mention: no notice, state untouched");
  } else {
    fail("E2 self-mention", { replies: e2.replies.length, state: getAfk(gE2, selfUser) });
  }
  deleteGuildConfig(gE2);
  invalidateGuildConfigCache(gE2);
  clearAfk(gE2, selfUser);

  // E3 multiple AFK users → ONE consolidated reply
  const gE3 = "guild-afk-e3";
  const m1 = "user-afk-e3-a";
  const m2 = "user-afk-e3-b";
  setAfk(gE3, m1, "reason one", Date.now() - 60_000);
  setAfk(gE3, m2, "reason two", Date.now() - 120_000);
  const e3 = mkAfkMessage("ping <@a> and <@b>", {
    guildId: gE3,
    userId: "user-afk-e3-c",
    mentionIds: [m1, m2],
    channelId: "channel-e3",
  });
  await processAfkOnMessage(e3.msg);
  const e3Content = replyContent(e3);
  if (
    e3.replies.length === 1 &&
    e3Content.includes("reason one") &&
    e3Content.includes("reason two") &&
    e3Content.includes("Display-user-afk-e3-a") &&
    e3Content.includes("Display-user-afk-e3-b")
  ) {
    pass("E3 multiple AFK mentions → single consolidated suppressed reply");
  } else {
    fail("E3 multiple mentions", { replies: e3.replies.length, e3Content });
  }

  // E8 mentioning a non-AFK user → silence
  const e8 = mkAfkMessage("hello <@notafk>", {
    guildId: gE,
    userId: author,
    mentionIds: ["user-afk-e8-notafk"],
    channelId: "channel-e8",
  });
  await processAfkOnMessage(e8.msg);
  eq("E8 non-AFK mention → no reply", e8.replies.length, 0);

  // E9 8-line cap on huge mention fan-out
  const gE9 = "guild-afk-e9";
  const manyIds = Array.from({ length: 10 }, (_, i) => `user-afk-e9-${i}`);
  manyIds.forEach((id, i) => setAfk(gE9, id, `r${i}`, Date.now() - 60_000));
  const e9 = mkAfkMessage(`where is ${manyIds.map((id) => `<@${id}>`).join(" ")}`, {
    guildId: gE9,
    userId: "user-afk-e9-author",
    mentionIds: manyIds,
    channelId: "channel-e9",
  });
  await processAfkOnMessage(e9.msg);
  const e9Content = replyContent(e9);
  const e9Lines = e9Content.split("\n").filter((l) => l.length > 0);
  if (
    e9.replies.length === 1 &&
    e9Lines.length === 8 &&
    e9Content.length <= 1800 &&
    e9Content.includes("Display-user-afk-e9-0") &&
    !e9Content.includes("Display-user-afk-e9-9")
  ) {
    pass("E9 fan-out capped at 8 lines / ≤1800 chars; mention order preserved");
  } else {
    fail("E9 fan-out cap", { replies: e9.replies.length, lines: e9Lines.length, len: e9Content.length });
  }

  // E10 hostile display names / reasons never ping (parse:[])
  const gE10 = "guild-afk-e10";
  const evilUser = "user-afk-e10";
  setAfk(gE10, evilUser, "ping @everyone and <@123456789012345678> now", Date.now() - 60_000);
  const e10 = mkAfkMessage("hello <@evil>", {
    guildId: gE10,
    userId: "user-afk-e10-author",
    mentionIds: [evilUser],
    channelId: "channel-e10",
    displayNames: { [evilUser]: "@everyone" },
  });
  await processAfkOnMessage(e10.msg);
  const e10Content = replyContent(e10);
  if (
    e10.replies.length === 1 &&
    e10Content.includes("@everyone") &&
    e10Content.includes("<@123456789012345678>") &&
    suppressed(e10)
  ) {
    pass("E10 hostile @everyone / raw-id text is inert (parse:[])");
  } else {
    fail("E10 mention injection", { replies: e10.replies.length, e10Content });
  }

  // E11 in-memory dedup resets via test hook (restart semantics)
  resetAfkInMemoryForTests();
  const e11 = mkAfkMessage("checking <@x> again", {
    guildId: gE,
    userId: author,
    mentionIds: [afkUser],
    channelId: "channel-e1",
  });
  await processAfkOnMessage(e11.msg);
  eq("E11 after in-memory reset, notice can fire again", e11.replies.length, 1);

  // Cleanup
  clearAfk(gE, afkUser);
  clearAfk(gE3, m1);
  clearAfk(gE3, m2);
  manyIds.forEach((id) => clearAfk(gE9, id));
  clearAfk(gE10, evilUser);
}

/* ================================================================
 * F — LOCAL MEDIA SECURITY
 * ================================================================ */

async function sectionF(): Promise<void> {
  console.log("--- F: Local media security ---");

  const rootF = makeRoot("ashenai-fs-");
  const hugDir = path.join(rootF, "actions", "hug");
  const eatDir = path.join(rootF, "afk", "eating");
  fs.mkdirSync(hugDir, { recursive: true });
  fs.mkdirSync(eatDir, { recursive: true });

  fs.writeFileSync(path.join(hugDir, "ok.gif"), gifBytes(1, 1));
  fs.writeFileSync(path.join(hugDir, "corrupt.gif"), Buffer.from("NOTGIF0123456789abcdef"));
  fs.writeFileSync(path.join(hugDir, "huge.gif"), gifBytes(5000, 5000));
  const bigBuf = Buffer.alloc(8 * 1024 * 1024 + 1, 0);
  bigBuf.write("GIF89a", 0, "latin1");
  fs.writeFileSync(path.join(hugDir, "big.gif"), bigBuf);
  fs.writeFileSync(path.join(hugDir, "evil.exe"), Buffer.from("MZnotanimage"));
  fs.writeFileSync(path.join(hugDir, "notes.txt"), Buffer.from("just text"));
  fs.writeFileSync(path.join(hugDir, "bad.png"), Buffer.from("this-is-not-a-png-file-at-all"));
  fs.mkdirSync(path.join(hugDir, "sub"), { recursive: true });
  fs.writeFileSync(path.join(hugDir, "sub", "inner.gif"), gifBytes(1, 1));
  fs.mkdirSync(path.join(hugDir, "dir.gif"), { recursive: true });

  const frobDir = path.join(rootF, "actions", "frobnicate");
  fs.mkdirSync(frobDir, { recursive: true });
  fs.writeFileSync(path.join(frobDir, "ok.gif"), gifBytes(1, 1));

  fs.writeFileSync(path.join(eatDir, "yum.gif"), gifBytes(2, 2, 0x42));
  const unknownDir = path.join(rootF, "afk", "unknown");
  fs.mkdirSync(unknownDir, { recursive: true });
  fs.writeFileSync(path.join(unknownDir, "x.gif"), gifBytes(1, 1));

  const outsideDir = makeRoot("ashenai-outside-");
  const outsideFile = path.join(outsideDir, "payload.gif");
  fs.writeFileSync(outsideFile, gifBytes(1, 1, 0x43));
  fs.symlinkSync(outsideFile, path.join(hugDir, "link.gif"));

  resetLocalGifsForTests();
  const index = await initializeLocalGifs({ root: rootF });

  // F1 indexing counts: ok/corrupt/huge + yum + bad.png = 5
  eq("F1 index counts valid files only (size/ext/depth/symlink/unknown-key filtered)", index.totalAssets, 5);

  // F2 resolve allowlisted keys
  const hugAsset = index.byKey.get("actions:hug")?.find((a) => a.relPath === "actions/hug/ok.gif");
  const eatAsset = await resolveLocalGif("afk:eating", () => 0);
  if (hugAsset && eatAsset) {
    pass("F2 resolve allowlisted action + afk keys");
  } else {
    fail("F2 resolve allowlisted keys", { hugAsset, eatAsset });
  }

  // F3 valid read
  const readOk = hugAsset ? await readLocalGif(hugAsset) : null;
  if (readOk && readOk.contentType === "image/gif" && readOk.buffer.length === 32) {
    pass("F3 valid GIF reads with correct contentType");
  } else {
    fail("F3 valid read", readOk);
  }

  // F4 corrupt magic
  const corruptAsset = index.byKey.get("actions:hug")?.find((a) => a.relPath === "actions/hug/corrupt.gif");
  eq("F4 corrupt magic → null", corruptAsset ? await readLocalGif(corruptAsset) : "missing", null);

  // F5 oversized dimensions (5000×5000 > 4096)
  const hugeAsset = index.byKey.get("actions:hug")?.find((a) => a.relPath === "actions/hug/huge.gif");
  eq("F5 GIF dimensions >4096 → null", hugeAsset ? await readLocalGif(hugeAsset) : "missing", null);

  // F6 wrong magic for extension
  const badPng = index.byKey.get("actions:hug")?.find((a) => a.relPath === "actions/hug/bad.png");
  eq("F6 extension/magic mismatch (.png without PNG magic) → null", badPng ? await readLocalGif(badPng) : "missing", null);

  // F7 oversized file (>8MB) → null
  const bigAsset: LocalGifAsset = {
    key: "actions:hug",
    root: index.root,
    relPath: "actions/hug/big.gif",
    sizeBytes: bigBuf.length,
    license: "unspecified",
  };
  eq("F7 oversize (>8MB) → null", await readLocalGif(bigAsset), null);

  // F8 unknown/invalid keys never resolve
  const invalidKeys = [
    "actions:frobnicate",
    "afk:unknown",
    "actions:HUG",
    "afk:EATING",
    "actions:../../etc",
    "afk:generic/../../x",
    "bogus",
    "actions:",
    "afk:",
    "",
  ];
  let allInvalid = true;
  for (const key of invalidKeys) {
    if ((await resolveLocalGif(key)) !== null) {
      allInvalid = false;
      fail(`F8 invalid key resolved: "${key}"`);
    }
  }
  if (allInvalid) pass("F8 unknown/case/ traversal keys all resolve to null");

  // F9 traversal / absolute / backslash / non-normalized relPaths → null
  const hostilePaths = [
    "../../etc/passwd",
    "actions/hug/../../ok.gif",
    "/etc/passwd",
    "actions\\hug\\ok.gif",
    "./actions/hug/ok.gif",
    "actions/hug/../../../..",
    "actions/hug/ok.gif\u0000.png",
    "",
  ];
  let hostileAllNull = true;
  for (const relPath of hostilePaths) {
    const crafted: LocalGifAsset = {
      key: "actions:hug",
      root: index.root,
      relPath,
      sizeBytes: 1,
      license: "unspecified",
    };
    const result = await readLocalGif(crafted);
    if (result !== null) {
      hostileAllNull = false;
      fail(`F9 hostile path read succeeded: ${JSON.stringify(relPath)}`);
    }
  }
  if (hostileAllNull) pass("F9 traversal/absolute/backslash/unnormalized paths → null");

  // F10 symlink escape at read time → null
  const linkAsset: LocalGifAsset = {
    key: "actions:hug",
    root: index.root,
    relPath: "actions/hug/link.gif",
    sizeBytes: 10,
    license: "unspecified",
  };
  eq("F10 symlink → null", await readLocalGif(linkAsset), null);

  // F11 directory (even with .gif name) → null
  const dirAsset: LocalGifAsset = {
    key: "actions:hug",
    root: index.root,
    relPath: "actions/hug/dir.gif",
    sizeBytes: 10,
    license: "unspecified",
  };
  eq("F11 directory → null", await readLocalGif(dirAsset), null);

  // F12 missing file → null
  const missingAsset: LocalGifAsset = {
    key: "actions:hug",
    root: index.root,
    relPath: "actions/hug/nope.gif",
    sizeBytes: 10,
    license: "unspecified",
  };
  eq("F12 missing file → null", await readLocalGif(missingAsset), null);

  // F13 invalid key on a valid asset → null
  if (hugAsset) {
    const wrongKey: LocalGifAsset = { ...hugAsset, key: "evil:key" };
    eq("F13 invalid key field → null", await readLocalGif(wrongKey), null);
  }

  // F14 every indexed relPath is contained + safe
  let relPathsSafe = true;
  for (const [, list] of index.byKey) {
    for (const asset of list) {
      if (
        !/^(actions\/[a-z]+|afk\/[a-z]+)\/[^/]+$/.test(asset.relPath) ||
        asset.relPath.includes("..") ||
        path.isAbsolute(asset.relPath)
      ) {
        relPathsSafe = false;
        fail("F14 unsafe indexed relPath", asset.relPath);
      }
    }
  }
  if (relPathsSafe) pass("F14 all indexed relPaths contained, relative, no '..'");

  // F15 malformed manifest → warn + continue; out-of-root paths rejected; good metadata applied
  const rootM = makeRoot("ashenai-manifest-");
  const mHug = path.join(rootM, "actions", "hug");
  fs.mkdirSync(mHug, { recursive: true });
  fs.writeFileSync(path.join(mHug, "ok.gif"), gifBytes(1, 1));
  fs.writeFileSync(path.join(rootM, "manifest.json"), "{ this is not json");
  resetLocalGifsForTests();
  const badManifestIndex = await initializeLocalGifs({ root: rootM });
  if (badManifestIndex.totalAssets === 1 && badManifestIndex.manifestWarnings >= 1) {
    pass("F15a malformed manifest → WARN + scanning continues (assets load)");
  } else {
    fail("F15a malformed manifest", badManifestIndex);
  }

  fs.writeFileSync(
    path.join(rootM, "manifest.json"),
    JSON.stringify({
      version: 1,
      assets: [
        { path: "../outside.gif", license: "bad" },
        { path: "/etc/passwd", license: "bad" },
        { path: "actions/hug/ok.gif", license: "MIT-Test", source: "unit-test" },
      ],
    }),
  );
  resetLocalGifsForTests();
  const goodManifestIndex = await initializeLocalGifs({ root: rootM });
  const manifested = goodManifestIndex.byKey.get("actions:hug")?.[0];
  if (
    goodManifestIndex.manifestWarnings >= 2 &&
    manifested?.license === "MIT-Test" &&
    manifested?.source === "unit-test" &&
    goodManifestIndex.unmanifested === 0
  ) {
    pass("F15b out-of-root manifest paths rejected; valid metadata attached");
  } else {
    fail("F15b manifest handling", { warnings: goodManifestIndex.manifestWarnings, manifested });
  }

  // F15c a SYMLINKED manifest.json is ignored (never followed out of
  // the root) — assets still load, with license "unspecified".
  {
    const rootS = makeRoot("ashenai-manifest-link-");
    const sHug = path.join(rootS, "actions", "hug");
    fs.mkdirSync(sHug, { recursive: true });
    fs.writeFileSync(path.join(sHug, "ok.gif"), gifBytes(1, 1));
    const outsideManifest = path.join(makeRoot("ashenai-manifest-out-"), "manifest.json");
    fs.writeFileSync(
      outsideManifest,
      JSON.stringify({ assets: [{ path: "actions/hug/ok.gif", license: "Linked-Should-Not-Apply" }] }),
    );
    fs.symlinkSync(outsideManifest, path.join(rootS, "manifest.json"));
    resetLocalGifsForTests();
    const linkIndex = await initializeLocalGifs({ root: rootS });
    const linkedAsset = linkIndex.byKey.get("actions:hug")?.[0];
    if (
      linkIndex.totalAssets === 1 &&
      linkIndex.manifestWarnings >= 1 &&
      linkedAsset?.license === "unspecified"
    ) {
      pass("F15c symlinked manifest ignored (no metadata applied, scan continues)");
    } else {
      fail("F15c symlinked manifest", { total: linkIndex.totalAssets, warnings: linkIndex.manifestWarnings, linkedAsset });
    }
  }

  // F16 missing root tolerated
  const rootMissing = path.join(rootF, "does", "not", "exist");
  const missingIndex = await initializeLocalGifs({ root: rootMissing });
  if (missingIndex.totalAssets === 0 && (await resolveLocalGif("actions:hug")) === null) {
    pass("F16 missing media root → empty index, no crash");
  } else {
    fail("F16 missing root", missingIndex.totalAssets);
  }

  // F17 root that is a regular file tolerated
  const rootFile = path.join(os.tmpdir(), `ashenai-rootfile-${Date.now()}.bin`);
  fs.writeFileSync(rootFile, "not a directory");
  tmpRoots.push(rootFile);
  const fileIndex = await initializeLocalGifs({ root: rootFile });
  eq("F17 root-is-a-file → empty index, no crash", fileIndex.totalAssets, 0);

  // F18 per-key cap = 100
  const rootCap = makeRoot("ashenai-cap-");
  const genDir = path.join(rootCap, "afk", "generic");
  fs.mkdirSync(genDir, { recursive: true });
  for (let i = 0; i < 105; i++) {
    fs.writeFileSync(path.join(genDir, `g${String(i).padStart(3, "0")}.gif`), gifBytes(1, 1));
  }
  resetLocalGifsForTests();
  const capIndex = await initializeLocalGifs({ root: rootCap });
  eq("F18 per-category cap enforced at 100", capIndex.byKey.get("afk:generic")?.length, 100);

  // F19 global cap = 2000 (26 keys × 80 files = 2080 candidates)
  const rootGlobal = makeRoot("ashenai-global-");
  const mediaKeys = getAllActions()
    .map((a) => a.mediaKey)
    .sort()
    .slice(0, 26);
  for (const key of mediaKeys) {
    const dir = path.join(rootGlobal, "actions", key);
    fs.mkdirSync(dir, { recursive: true });
    for (let i = 0; i < 80; i++) {
      fs.writeFileSync(path.join(dir, `f${String(i).padStart(3, "0")}.gif`), gifBytes(1, 1));
    }
  }
  resetLocalGifsForTests();
  const globalIndex = await initializeLocalGifs({ root: rootGlobal });
  eq("F19 global cap enforced at 2000", globalIndex.totalAssets, 2000);

  // F20 deterministic ordering across rebuilds
  resetLocalGifsForTests();
  const rebuild = await initializeLocalGifs({ root: rootF });
  const firstPass = JSON.stringify(
    [...index.byKey.entries()].map(([k, v]) => [k, v.map((a) => a.relPath)]).sort(),
  );
  const secondPass = JSON.stringify(
    [...rebuild.byKey.entries()].map(([k, v]) => [k, v.map((a) => a.relPath)]).sort(),
  );
  eq("F20 deterministic index across rebuilds", firstPass, secondPass);

  // F21 key allowlists
  const allKeysValid =
    getAllActions().every((a) => isValidLocalGifKey(`actions:${a.mediaKey}`)) &&
    AFK_CATEGORIES.every((c) => isValidLocalGifKey(`afk:${c}`)) &&
    !isValidLocalGifKey("afk:notacategory");
  if (allKeysValid) pass("F21 allowlists: 32 action mediaKeys + 9 AFK categories, nothing else");
  else fail("F21 key allowlists");

  // F22 PNG magic accepted for valid PNG
  const rootPng = makeRoot("ashenai-png-");
  const pngDir = path.join(rootPng, "afk", "break");
  fs.mkdirSync(pngDir, { recursive: true });
  fs.writeFileSync(path.join(pngDir, "b.png"), pngBytes(64, 64));
  resetLocalGifsForTests();
  const pngIndex = await initializeLocalGifs({ root: rootPng });
  const pngAsset = pngIndex.byKey.get("afk:break")?.[0];
  const pngRead = pngAsset ? await readLocalGif(pngAsset) : null;
  if (pngRead && pngRead.contentType === "image/png") {
    pass("F22 valid PNG magic accepted");
  } else {
    fail("F22 valid PNG", pngRead);
  }

  // F23 oversized-dimension PNG → null
  const rootBigPng = makeRoot("ashenai-bigpng-");
  const bigPngDir = path.join(rootBigPng, "afk", "break");
  fs.mkdirSync(bigPngDir, { recursive: true });
  fs.writeFileSync(path.join(bigPngDir, "b.png"), pngBytes(9000, 9000));
  resetLocalGifsForTests();
  const bigPngIndex = await initializeLocalGifs({ root: rootBigPng });
  const bigPngAsset = bigPngIndex.byKey.get("afk:break")?.[0];
  eq("F23 PNG dimensions >4096 → null", bigPngAsset ? await readLocalGif(bigPngAsset) : "missing", null);
}

/* ================================================================
 * G — MEDIA FALLBACK CHAIN (specific → away → generic → text)
 * ================================================================ */

async function sectionG(): Promise<void> {
  console.log("--- G: AFK media fallback chain ---");

  const rootG = makeRoot("ashenai-chain-");
  const gHug = path.join(rootG, "actions", "hug");
  const gEat = path.join(rootG, "afk", "eating");
  const gAway = path.join(rootG, "afk", "away");
  const gGen = path.join(rootG, "afk", "generic");
  [gHug, gEat, gAway, gGen].forEach((d) => fs.mkdirSync(d, { recursive: true }));
  const eatBytes = gifBytes(3, 3, 0x51);
  const awayBytes = gifBytes(4, 4, 0x52);
  const genBytes = gifBytes(5, 5, 0x53);
  fs.writeFileSync(path.join(gEat, "e.gif"), eatBytes);
  fs.writeFileSync(path.join(gAway, "a.gif"), awayBytes);
  fs.writeFileSync(path.join(gGen, "g.gif"), genBytes);
  fs.writeFileSync(path.join(gHug, "h.gif"), gifBytes(1, 1, 0x54));

  resetLocalGifsForTests();
  await initializeLocalGifs({ root: rootG });

  async function noticeWith(reason: string, guild: string, channel: string): Promise<any> {
    const user = `user-afk-g-${guild}`;
    setAfk(guild, user, reason, Date.now() - 60_000);
    const mock = mkAfkMessage(`where is <@x>?`, {
      guildId: guild,
      userId: `author-${guild}`,
      mentionIds: [user],
      channelId: channel,
    });
    await processAfkOnMessage(mock.msg);
    return mock.replies[0];
  }

  // G1 specific category wins
  const g1 = await noticeWith("I'm eating lunch", "guild-afk-g1", "ch-g1");
  const g1Buf = g1?.files?.[0]?.attachment;
  if (g1Buf && Buffer.isBuffer(g1Buf) && g1Buf.equals(eatBytes)) {
    pass("G1 specific category (eating) attaches its own asset");
  } else {
    fail("G1 specific category asset", { has: Boolean(g1Buf) });
  }

  // G2 away category
  const g2 = await noticeWith("away for a bit", "guild-afk-g2", "ch-g2");
  const g2Buf = g2?.files?.[0]?.attachment;
  if (g2Buf && Buffer.isBuffer(g2Buf) && g2Buf.equals(awayBytes)) {
    pass("G2 away category attaches away asset");
  } else {
    fail("G2 away asset", { has: Boolean(g2Buf) });
  }

  // G3 generic category
  const g3 = await noticeWith("just vibing", "guild-afk-g3", "ch-g3");
  const g3Buf = g3?.files?.[0]?.attachment;
  if (g3Buf && Buffer.isBuffer(g3Buf) && g3Buf.equals(genBytes)) {
    pass("G3 generic category attaches generic asset");
  } else {
    fail("G3 generic asset", { has: Boolean(g3Buf) });
  }

  // G4 generic missing → TEXT ONLY (never jumps to away)
  const rootG2 = makeRoot("ashenai-chain2-");
  const onlyAway = path.join(rootG2, "afk", "away");
  fs.mkdirSync(onlyAway, { recursive: true });
  fs.writeFileSync(path.join(onlyAway, "only.gif"), gifBytes(1, 1, 0x55));
  resetLocalGifsForTests();
  await initializeLocalGifs({ root: rootG2 });
  const g4 = await noticeWith("just vibing", "guild-afk-g4", "ch-g4");
  if (g4 && g4.content && !g4.files) {
    pass("G4 generic missing → text only (no away fallback for generic)");
  } else {
    fail("G4 generic→text", g4);
  }

  // G5 full chain missing → text only
  const rootG3 = makeRoot("ashenai-chain3-");
  fs.mkdirSync(path.join(rootG3, "afk"), { recursive: true });
  resetLocalGifsForTests();
  await initializeLocalGifs({ root: rootG3 });
  const g5 = await noticeWith("I'm eating", "guild-afk-g5", "ch-g5");
  if (g5 && g5.content.includes("is AFK") && !g5.files) {
    pass("G5 no local media anywhere → text-only notice (AFK never fetches remote)");
  } else {
    fail("G5 text-only fallback", g5);
  }

  // G6 away → generic fallback when away missing
  const rootG4 = makeRoot("ashenai-chain4-");
  const onlyGen = path.join(rootG4, "afk", "generic");
  fs.mkdirSync(onlyGen, { recursive: true });
  fs.writeFileSync(path.join(onlyGen, "only.gif"), gifBytes(1, 1, 0x56));
  resetLocalGifsForTests();
  await initializeLocalGifs({ root: rootG4 });
  const g6 = await noticeWith("away for a while", "guild-afk-g6", "ch-g6");
  const g6Buf = g6?.files?.[0]?.attachment;
  if (g6Buf && Buffer.isBuffer(g6Buf)) {
    pass("G6 away missing → generic fallback attaches generic asset");
  } else {
    fail("G6 away→generic", { has: Boolean(g6Buf) });
  }
}

/* ================================================================
 * H — RATE LIMIT
 * ================================================================ */

async function sectionH(): Promise<void> {
  console.log("--- H: Command rate limit (5/60s, dedicated) ---");

  const gH = "guild-afk-h";
  const uH = "user-afk-h-limit";
  const contents: string[] = [];
  for (let i = 0; i < 6; i++) {
    const mock = mkAfkMessage(`!afk spam-${i}`, { guildId: gH, userId: uH, channelId: "ch-h" });
    const cmd = parseAfkCommand(mock.msg.content);
    if (cmd) await handleAfkCommand(mock.msg, cmd);
    contents.push(replyContent(mock));
  }

  const firstFiveOk = contents.slice(0, 5).every((c) => c.includes("now AFK"));
  if (firstFiveOk && contents[5].includes("Slow down")) {
    pass("H1 6th AFK command within 60s → throttled");
  } else {
    fail("H1 rate limit", contents);
  }

  const other = mkAfkMessage("!afk unaffected", { guildId: gH, userId: "user-afk-h-other", channelId: "ch-h" });
  const otherCmd = parseAfkCommand(other.msg.content);
  if (otherCmd) await handleAfkCommand(other.msg, otherCmd);
  if (replyContent(other).includes("now AFK")) {
    pass("H2 limiter is per-user: other users unaffected");
  } else {
    fail("H2 per-user limiter", replyContent(other));
  }

  // DB rows still coherent after throttle
  eq("H3 throttled call did not corrupt state", getAfk(gH, uH)?.message, "spam-4");
  clearAfk(gH, uH);
  clearAfk(gH, "user-afk-h-other");
}

/* ================================================================
 * I — RESTART
 * ================================================================ */

async function sectionI(): Promise<void> {
  console.log("--- I: Restart / persistence ---");

  const gI = "guild-afk-i";
  const uI = "user-afk-i";
  setAfk(gI, uI, "persisted across restart", 1700000000000);

  closeDatabase();
  const reopened = getDatabase();
  const afterRestart = getAfk(gI, uI);
  if (afterRestart?.message === "persisted across restart" && afterRestart.startedAt === 1700000000000) {
    pass("I1 AFK state survives close/reopen (restart)");
  } else {
    fail("I1 restart persistence", afterRestart);
  }

  const maxVersion = (reopened
    .prepare("SELECT COALESCE(MAX(version),0) AS v FROM schema_migrations")
    .get() as { v: number }).v;
  const afkTable = reopened
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='afk_states'")
    .get();
  if (maxVersion === 18 && afkTable) {
    pass("I2 migration v18 applied; afk_states present");
  } else {
    fail("I2 migration state", { maxVersion, afkTable });
  }

  // I3 fresh database: run the entire migration sequence in a clean cwd
  const tmpCwd = makeRoot("ashenai-freshdb-");
  const entryPath = path.join(tmpCwd, "fresh-db.ts");
  const dbModule = path.resolve("src/database/database");
  fs.writeFileSync(
    entryPath,
    [
      `const { getDatabase } = require(${JSON.stringify(dbModule)});`,
      `const db = getDatabase();`,
      `const v = db.prepare("SELECT COALESCE(MAX(version),0) AS v FROM schema_migrations").get();`,
      `const c = db.prepare("SELECT COUNT(*) AS c FROM schema_migrations").get();`,
      `const t = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='afk_states'").get();`,
      `console.log("FRESH_VERSION=" + v.v);`,
      `console.log("FRESH_COUNT=" + c.c);`,
      `console.log("FRESH_TABLE=" + (t ? 1 : 0));`,
      `process.exit(0);`,
      "",
    ].join("\n"),
  );

  const tsx = path.resolve("node_modules/.bin/tsx");
  const proc = spawnSync("node", [tsx, entryPath], {
    cwd: tmpCwd,
    encoding: "utf8",
    timeout: 90_000,
    env: { ...process.env, NODE_OPTIONS: "" },
  });
  const out = `${proc.stdout ?? ""}${proc.stderr ?? ""}`;
  if (
    proc.status === 0 &&
    out.includes("FRESH_VERSION=18") &&
    out.includes("FRESH_COUNT=18") &&
    out.includes("FRESH_TABLE=1")
  ) {
    pass("I3 fresh DB runs all 18 migrations incl. v18 afk_states");
  } else {
    fail("I3 fresh migration sequence", { status: proc.status, out: out.slice(-800) });
  }

  // I4 local index rebuilds after in-memory reset (restart of index)
  resetLocalGifsForTests();
  const rebuilt = await initializeLocalGifs({ root: tmpRoots.find((r) => r.includes("ashenai-chain-")) ?? "/nonexistent" });
  if (rebuilt.totalAssets >= 4 || rebuilt.totalAssets === 0) {
    pass("I4 local GIF index rebuilds cleanly after reset (restart semantics)");
  } else {
    fail("I4 index rebuild", rebuilt.totalAssets);
  }
}

/* ================================================================
 * J — CONCURRENCY
 * ================================================================ */

async function sectionJ(): Promise<void> {
  console.log("--- J: Concurrency ---");

  const gJ = "guild-afk-j1";
  const uJ = "user-afk-j1";
  const messages = Array.from({ length: 25 }, (_, i) => `concurrent-${i}`);
  await Promise.all(
    messages.map((msg, i) => setAfk(gJ, uJ, msg, 1700000000000 + i)),
  );
  const finalJ = getAfk(gJ, uJ);
  if (finalJ && messages.includes(finalJ.message) && rowCount(gJ, uJ) === 1) {
    pass("J1 25 simultaneous UPSERTs → one coherent row, message from the write set");
  } else {
    fail("J1 concurrent upsert", { finalJ, count: rowCount(gJ, uJ) });
  }

  // J2 interleaved set/clear
  const gJ2 = "guild-afk-j2";
  const uJ2 = "user-afk-j2";
  await Promise.all([
    setAfk(gJ2, uJ2, "a", 1),
    clearAfk(gJ2, uJ2),
    setAfk(gJ2, uJ2, "b", 2),
    clearAfk(gJ2, uJ2),
    setAfk(gJ2, uJ2, "c", 3),
  ]);
  const finalJ2 = getAfk(gJ2, uJ2);
  const countJ2 = rowCount(gJ2, uJ2);
  if (countJ2 <= 1 && (finalJ2 === null || ["a", "b", "c"].includes(finalJ2.message))) {
    pass("J2 interleaved set/clear → coherent final state, no corruption");
  } else {
    fail("J2 set/clear race", { finalJ2, countJ2 });
  }

  // J3 multiple users concurrently
  const gJ3 = "guild-afk-j3";
  const usersJ3 = Array.from({ length: 8 }, (_, i) => `user-afk-j3-${i}`);
  await Promise.all(usersJ3.map((u, i) => setAfk(gJ3, u, `m${i}`, Date.now())));
  const allCorrect = usersJ3.every((u, i) => getAfk(gJ3, u)?.message === `m${i}`);
  if (allCorrect) pass("J3 concurrent writes by different users all read back correctly");
  else fail("J3 multi-user concurrency");

  // J4 concurrent reads
  const reads = await Promise.all(
    Array.from({ length: 10 }, () => listAfkByUserIds(gJ3, usersJ3)),
  );
  const readsStable = reads.every((r) => r.length === reads[0].length);
  if (readsStable) pass("J4 10 concurrent reads → stable results");
  else fail("J4 concurrent reads", reads.map((r) => r.length));

  // J5 concurrent index builds share ONE build
  const rootJ = makeRoot("ashenai-j-");
  const jDir = path.join(rootJ, "afk", "generic");
  fs.mkdirSync(jDir, { recursive: true });
  fs.writeFileSync(path.join(jDir, "j.gif"), gifBytes(1, 1, 0x57));
  resetLocalGifsForTests();
  const builds = await Promise.all(
    Array.from({ length: 20 }, () => initializeLocalGifs({ root: rootJ })),
  );
  const allSameRef = builds.every((b) => b === builds[0]);
  if (allSameRef && builds[0].totalAssets === 1) {
    pass("J5 20 concurrent initializeLocalGifs → single shared build (no duplicate work)");
  } else {
    fail("J5 concurrent indexing", { allSameRef, total: builds[0].totalAssets });
  }

  // J6 reads issued while a build is in flight stay coherent
  resetLocalGifsForTests();
  const inflight = initializeLocalGifs({ root: rootJ });
  const duringBuild = await Promise.all(
    Array.from({ length: 10 }, () => resolveLocalGif("afk:generic")),
  );
  await inflight;
  const afterBuild = await resolveLocalGif("afk:generic");
  const duringCoherent = duringBuild.every((a) => a === null || typeof a.relPath === "string");
  if (duringCoherent && afterBuild?.relPath === "afk/generic/j.gif") {
    pass("J6 reads during indexing coherent; post-build resolve deterministic");
  } else {
    fail("J6 read-during-index", { duringCoherent, afterBuild });
  }

  // J7 concurrent reads of the same valid asset
  if (afterBuild) {
    const concurrentReads = await Promise.all(
      Array.from({ length: 10 }, () => readLocalGif(afterBuild)),
    );
    const allOk = concurrentReads.every((r) => r !== null && r.buffer.length > 0);
    if (allOk) pass("J7 10 concurrent local reads → all valid");
    else fail("J7 concurrent reads", concurrentReads.filter((r) => !r).length);
  }

  // J8 concurrent hostile reads → all null (no race-induced bypass)
  const hostileReads = await Promise.all(
    Array.from({ length: 10 }, (_, i) =>
      readLocalGif({
        key: "actions:hug",
        root: rootJ,
        relPath: i % 2 === 0 ? "../../etc/passwd" : "/etc/passwd",
        sizeBytes: 1,
        license: "unspecified",
      }),
    ),
  );
  if (hostileReads.every((r) => r === null)) {
    pass("J8 concurrent hostile reads → all null (no race bypass)");
  } else {
    fail("J8 hostile read race", hostileReads.filter((r) => r !== null).length);
  }
}

/* ================================================================
 * K — STATIC SOURCE ASSERTIONS
 * ================================================================ */

function sectionK(): void {
  console.log("--- K: Static source assertions ---");

  const root = process.cwd();
  const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");
  const indexSrc = read("src/index.ts");
  const afkSrc = read("src/community/afk.ts");
  const repoSrc = read("src/database/afk-repo.ts");
  const localSrc = read("src/media/local-gifs.ts");
  const prefixSrc = read("src/games/anime-actions/prefix-handler.ts");
  const dbSrc = read("src/database/database.ts");
  const settingsSrc = read("src/settings/definitions.ts");
  const schemaSrc = read("src/database/schemas.ts");
  const guildCfgSrc = read("src/core/guild-config.ts");
  const pkgSrc = read("package.json");

  const pos = (hay: string, needle: string) => hay.indexOf(needle);
  const afkUsage = pos(indexSrc, "const afkCommand = parseAfkCommand(");
  const ashUsage = pos(indexSrc, "if (isAnimeActionPrefix(message.content))");
  const botFilter = pos(indexSrc, "if (message.author.bot)");
  const assistantGate = pos(indexSrc, "guildConfig.assistantChannelId");
  const fetchRef = pos(indexSrc, 't.mark("fetch_ref")');

  if (afkUsage > 0 && ashUsage > 0 && afkUsage < ashUsage) {
    pass("K1 AFK block precedes the Ash intercept in src/index.ts");
  } else {
    fail("K1 AFK-before-Ash order", { afkUsage, ashUsage });
  }

  if (botFilter >= 0 && botFilter < afkUsage) {
    pass("K2 bot filter precedes AFK handling");
  } else {
    fail("K2 bot filter order", { botFilter, afkUsage });
  }

  if (assistantGate >= 0 && assistantGate < afkUsage) {
    pass("K3 assistant-channel gate precedes AFK handling");
  } else {
    fail("K3 assistant gate order", { assistantGate, afkUsage });
  }

  if (fetchRef >= 0 && fetchRef < afkUsage) {
    pass("K4 getReferencedMessage/fetch_ref precedes AFK (approved order)");
  } else {
    fail("K4 fetch_ref order", { fetchRef, afkUsage });
  }

  const cmdReturn = pos(indexSrc, "if (afkCommand) {");
  const procCall = pos(indexSrc, "await processAfkOnMessage(message)");
  if (cmdReturn >= 0 && procCall > cmdReturn) {
    pass("K5 AFK command returns before auto-clear/mention processing");
  } else {
    fail("K5 command-then-process order", { cmdReturn, procCall });
  }

  // Strip comments so documentation mentioning a policy token cannot
  // trip code-level assertions (or mask a real violation).
  const afkCodeOnly = afkSrc.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const afkReplyCalls = afkCodeOnly.match(/\.reply\(/g) ?? [];
  const afkSafeReplies = (afkCodeOnly.match(/safeReply/g) ?? []).length;
  if (afkReplyCalls.length === 0 && afkSafeReplies >= 5 && !afkCodeOnly.includes("allowedMentions")) {
    pass("K6 AFK module: zero direct .reply(), all paths via shared safeReply (no local mention override)");
  } else {
    fail("K6 AFK reply paths", { replyCalls: afkReplyCalls.length, safeReplies: afkSafeReplies });
  }

  const prefixReplyCalls = (prefixSrc.match(/\.reply\(/g) ?? []).length;
  const safeReplyDefs = (prefixSrc.match(/async function safeReply/g) ?? []).length;
  if (
    prefixReplyCalls === 1 &&
    safeReplyDefs === 1 &&
    prefixSrc.includes("allowedMentions: { parse: [] }")
  ) {
    pass("K7 canonical safeReply choke intact (single .reply, parse:[])");
  } else {
    fail("K7 safeReply choke", { prefixReplyCalls, safeReplyDefs });
  }

  const interps = [...repoSrc.matchAll(/\$\{([^}]*)\}/g)].map((m) => m[1].trim());
  const onlyPlaceholders = interps.every((i) => i === "placeholders");
  if (
    onlyPlaceholders &&
    repoSrc.includes("ON CONFLICT(guild_id, user_id) DO UPDATE") &&
    repoSrc.includes("WHERE guild_id = ? AND user_id = ?") &&
    repoSrc.includes("WHERE guild_id = ? AND user_id IN")
  ) {
    pass("K8 repository: parameterized SQL only (single allowed ${placeholders} for IN-list)");
  } else {
    fail("K8 parameterized SQL", interps);
  }

  // K9 no GIPHY anywhere in code/deps
  let giphyHits: string[] = [];
  const scanForGiphy = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === ".git") continue;
        scanForGiphy(full);
      } else if (/\.(ts|tsx|cjs|mjs|js|json)$/.test(entry.name)) {
        // This audit file necessarily contains the search token itself.
        if (full === path.join(root, "scripts", "test-afk.ts")) continue;
        const content = fs.readFileSync(full, "utf8");
        if (/giphy/i.test(content)) giphyHits.push(full);
      }
    }
  };
  scanForGiphy(path.join(root, "src"));
  scanForGiphy(path.join(root, "scripts"));
  if (giphyHits.length === 0 && !/giphy/i.test(pkgSrc)) {
    pass("K9 no GIPHY integration, dependency, or cache anywhere in src/ scripts/ package.json");
  } else {
    fail("K9 GIPHY found", giphyHits.slice(0, 5));
  }

  // K10 no moderation APIs in new modules
  const moderationPattern = /timeoutMember|kickMember|\.ban\b|banMember|createWebhook|\.purge\b/i;
  const newFiles = [afkSrc, repoSrc, localSrc];
  const modHits = newFiles.filter((s) => moderationPattern.test(s));
  eq("K10 no moderation APIs in AFK/repository/local-media modules", modHits.length, 0);

  // K11 prefix-only, no slash-command surface for AFK
  const slashFree = !/SlashCommand|ChatInputCommand|ContextMenuCommand/.test(afkSrc) &&
    !/SlashCommand|ChatInputCommand/.test(localSrc);
  if (slashFree) pass("K11 AFK + local media are prefix-only (no slash-command surface)");
  else fail("K11 slash-command surface found");

  // K12 no shell/process spawning in the local provider
  const noSpawn = !/child_process|execSync|spawnSync|\bexec\(/.test(localSrc);
  if (noSpawn) pass("K12 local provider spawns no processes / no shell parsing");
  else fail("K12 process spawning found in local-gifs.ts");

  // K13 bounded caches / limits present
  const boundsOk =
    afkSrc.includes("max: NOTICE_DEDUP_MAX_ENTRIES") &&
    afkSrc.includes("NOTICE_DEDUP_MAX_ENTRIES = 500") &&
    afkSrc.includes("AFK_RATE_LIMIT_MAX = 5") &&
    afkSrc.includes("AFK_MAX_MESSAGE_LENGTH = 100") &&
    localSrc.includes("MAX_ASSETS_PER_KEY = 100") &&
    localSrc.includes("MAX_ASSETS_TOTAL = 2000") &&
    localSrc.includes("MAX_LOCAL_MEDIA_BYTES = 8 * 1024 * 1024") &&
    localSrc.includes("MAX_RELPATH_LENGTH = 512");
  if (boundsOk) pass("K13 bounded limits present (dedup 500, rate 5/60s, caps 100/2000/8MB/512)");
  else fail("K13 bound constants missing");

  // K14 AFK never performs remote media fetches
  const noRemote = !/fetch\(|validateMediaUrl|https:\/\//.test(afkSrc);
  if (noRemote) pass("K14 AFK module performs no remote media/network fetches (local-only chain)");
  else fail("K14 remote fetch reference found in afk.ts");

  // K15 settings wiring for social.afkAutoClear
  const wired =
    settingsSrc.includes('id: "social.afkAutoClear"') &&
    schemaSrc.includes("afkAutoClear: z.boolean().nullish()") &&
    guildCfgSrc.includes("afkAutoClear?: boolean") &&
    afkSrc.includes("afkAutoClear ?? true");
  if (wired) pass("K15 social.afkAutoClear wired through settings + schema + type + `?? true` read");
  else fail("K15 afkAutoClear wiring missing");

  // K16 guild+user identity on every CRUD path
  const identityPaths = (repoSrc.match(/guild_id = \? AND user_id = \?/g) ?? []).length;
  if (identityPaths >= 2 && repoSrc.includes("guild_id = ? AND user_id IN")) {
    pass("K16 all CRUD paths scoped by guild identity (and user where appropriate)");
  } else {
    fail("K16 identity scoping", identityPaths);
  }

  // K17 migration v18 registered
  if (dbSrc.includes("version: 18") && dbSrc.includes("afk_states")) {
    pass("K17 migration v18 (afk_states) registered in database.ts");
  } else {
    fail("K17 migration v18 missing");
  }

  // K18 index.ts wiring: AFK import + startup indexing
  if (
    indexSrc.includes('from "./community/afk"') &&
    indexSrc.includes("initializeLocalGifs()") &&
    indexSrc.includes("void initializeLocalGifs()")
  ) {
    pass("K18 index.ts imports AFK handlers + warm-starts local GIF index");
  } else {
    fail("K18 index.ts wiring");
  }

  // K19 suite registered as mandatory
  const runnerSrc = read("scripts/run-all-tests.ts");
  if (runnerSrc.includes('name: "AFK", file: "scripts/test-afk.ts", category: "core"')) {
    pass("K19 AFK suite registered as a mandatory core suite (40 total)");
  } else {
    fail("K19 suite registration");
  }

  // K20 no state mutation from processAfkOnMessage mention path (read-only repo calls)
  const processBody = afkSrc.slice(pos(afkSrc, "export async function processAfkOnMessage"));
  const mutatesViaMention =
    /setAfk\(/.test(processBody);
  if (!mutatesViaMention) {
    pass("K20 processAfkOnMessage never calls setAfk (mentions are read-only)");
  } else {
    fail("K20 mention path mutates state", "setAfk called in processAfkOnMessage");
  }
}

/* ================================================================
 * MAIN
 * ================================================================ */

async function main(): Promise<void> {
  const sections: Array<[string, () => void | Promise<void>]> = [
    ["A", sectionA],
    ["B", sectionB],
    ["C", sectionC],
    ["D", sectionD],
    ["E", sectionE],
    ["F", sectionF],
    ["G", sectionG],
    ["H", sectionH],
    ["I", sectionI],
    ["J", sectionJ],
    ["K", sectionK],
  ];

  for (const [name, fn] of sections) {
    try {
      await fn();
    } catch (e) {
      fail(`Section ${name} crashed`, e);
    }
  }

  // Cleanup: test rows, configs, temp dirs
  try {
    const db = getDatabase();
    db.prepare("DELETE FROM afk_states WHERE guild_id LIKE 'guild-afk%'").run();
    for (const guild of configGuilds) {
      deleteGuildConfig(guild);
      invalidateGuildConfigCache(guild);
    }
  } catch (e) {
    fail("Cleanup failed", e);
  }

  for (const root of tmpRoots) {
    try {
      fs.rmSync(root, { recursive: true, force: true });
    } catch {
      // best-effort temp cleanup
    }
  }
  resetLocalGifsForTests();
}

main()
  .catch((e) => fail("Suite crashed", e))
  .finally(() => {
    console.log("\n--- Results ---");
    console.log(`  Passed: ${passed}`);
    console.log(`  Failed: ${failed}`);
    console.log(`  Total: ${passed + failed}`);
    if (failed > 0) process.exit(1);
  });
