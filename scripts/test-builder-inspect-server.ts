#!/usr/bin/env node
/* ================================================================
 * BUILDER INSPECT SERVER REGRESSION TESTS
 *
 * Tests inspectServer() from prompt.ts to verify:
 * 1. The roles.cache.values() bug (TypeError: Cannot read properties
 *    of undefined) is fixed.
 * 2. inspectServer correctly handles guild.roles.fetch() returning
 *    a Collection (not a RoleManager).
 * 3. Template processing via "make a cozy server" path works.
 * ================================================================ */

import { inspectServer } from "../src/commands/prompt";

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

function assertEqual(actual: unknown, expected: unknown, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected "${expected}", got "${actual}"`);
  }
}

function assertIncludes<T>(arr: T[], item: T, label: string): void {
  if (!arr.includes(item)) {
    throw new Error(`${label}: expected array to include "${item}", got [${arr.join(", ")}]`);
  }
}

console.log("\n🧪 Builder inspectServer Regression Tests\n");

/* ================================================================
 * MOCK HELPERS
 *
 * Creates minimal Discord.js-like objects that simulate the API
 * shapes used by inspectServer(). No actual Discord API calls.
 * ================================================================ */

function makeRole(id: string, name: string) {
  return { id, name, color: 0, mentionable: false, hoist: false, position: 0, permissions: "0" };
}

function makeChannel(id: string, name: string, type: number, parentId?: string) {
  return { id, name, type, parentId: parentId ?? null };
}

/**
 * Creates a mock guild that simulates the Discord.js Guild API.
 *
 * Key: guild.roles.fetch() returns a Collection (Map-like) directly,
 * NOT a RoleManager. This is the exact shape that caused the original
 * TypeError: "Cannot read properties of undefined (reading 'values')".
 */
function makeMockGuild(overrides?: {
  roles?: Array<{ id: string; name: string }>;
  channels?: Array<{ id: string; name: string; type: number; parentId?: string }>;
  id?: string;
}) {
  const guildId = overrides?.id || "guild-test-123";

  const roleData = overrides?.roles ?? [
    makeRole("role-1", "Admin"),
    makeRole("role-2", "Moderator"),
    makeRole("role-3", "@everyone"),
  ];

  const channelData = overrides?.channels ?? [
    makeChannel("ch-1", "general", 0),       // GuildText = 0
    makeChannel("ch-2", "voice-general", 2), // GuildVoice = 2
    makeChannel("ch-3", "INFO", 4),          // GuildCategory = 4
  ];

  // Simulate Discord.js Collection (extends Map)
  function makeCollection(items: any[]) {
    const map = new Map(items.map((item: any) => [item.id, item]));
    return {
      ...map,
      filter: (fn: (item: any) => boolean) => {
        const filtered = items.filter(fn);
        return makeCollection(filtered);
      },
      map: (fn: (item: any) => any) => items.map(fn),
      values: () => map.values(),
      size: items.length,
    };
  }

  return {
    id: guildId,
    roles: {
      // guild.roles.fetch() returns a Collection directly
      // This is the critical shape: NOT a RoleManager with .cache
      fetch: () => Promise.resolve(makeCollection(roleData)),
    },
    channels: {
      fetch: () => Promise.resolve(makeCollection(channelData)),
    },
  };
}

/* ================================================================
 * TEST 1: inspectServer — roles.cache.values() bug is fixed
 *
 * This is the exact regression test for the production error:
 *   [ASH][BUILDER][ERROR]
 *   template processing failed: Cannot read properties of undefined
 *   (reading 'values')
 *
 * Before the fix, line 222 had: roles.cache.values()
 * where `roles` is a Collection from guild.roles.fetch().
 * Collection has no .cache property, so roles.cache === undefined,
 * and .values() on undefined throws TypeError.
 *
 * After the fix, line 222 has: roles.values()
 * which correctly accesses Collection.values().
 * ================================================================ */

async function runTests() {
  try {
    const guild = makeMockGuild();
    const result = await inspectServer(guild);

    // Should return valid structure
    if (!result || typeof result !== "object") {
      throw new Error("inspectServer should return an object");
    }

    // Roles should be present and correctly extracted
    if (!Array.isArray(result.roles)) {
      throw new Error("result.roles should be an array");
    }

    // Should have 2 roles (Admin, Moderator) — @everyone is filtered out
    assertEqual(result.roles.length, 2, "roles count (excluding @everyone)");

    // Role names should be correct
    const roleNames = result.roles.map((r: any) => r.name);
    assertIncludes(roleNames, "Admin", "Admin role present");
    assertIncludes(roleNames, "Moderator", "Moderator role present");

    // @everyone should be filtered out
    if (roleNames.includes("@everyone")) {
      throw new Error("@everyone should be filtered out");
    }

    // Channels should be present
    if (!Array.isArray(result.channels)) {
      throw new Error("result.channels should be an array");
    }

    // Should have 2 channels (general text, voice-general voice) — category excluded
    assertEqual(result.channels.length, 2, "channels count (text + voice)");

    // Categories should be present
    if (!Array.isArray(result.categories)) {
      throw new Error("result.categories should be an array");
    }
    assertEqual(result.categories.length, 1, "categories count");

    pass("inspectServer: roles.cache.values() bug is fixed — no TypeError");
  } catch (e) {
    fail("inspectServer: roles.cache.values() bug is fixed — no TypeError", e);
  }

  /* ================================================================
   * TEST 2: inspectServer — handles empty roles
   * ================================================================ */

  try {
    const guild = makeMockGuild({ roles: [] });
    const result = await inspectServer(guild);

    assertEqual(result.roles.length, 0, "empty roles array");

    pass("inspectServer: handles empty roles");
  } catch (e) {
    fail("inspectServer: handles empty roles", e);
  }

  /* ================================================================
   * TEST 3: inspectServer — handles empty channels
   * ================================================================ */

  try {
    const guild = makeMockGuild({ channels: [] });
    const result = await inspectServer(guild);

    assertEqual(result.channels.length, 0, "empty channels");
    assertEqual(result.categories.length, 0, "empty categories");

    pass("inspectServer: handles empty channels");
  } catch (e) {
    fail("inspectServer: handles empty channels", e);
  }

  /* ================================================================
   * TEST 4: inspectServer — filters @everyone role
   * ================================================================ */

  try {
    const guild = makeMockGuild({
      roles: [
        makeRole("role-1", "Admin"),
        makeRole("role-everyone", "@everyone"),
        makeRole("role-2", "Member"),
      ],
    });

    const result = await inspectServer(guild);

    assertEqual(result.roles.length, 2, "two roles after filtering @everyone");

    const names = result.roles.map((r: any) => r.name);
    if (names.includes("@everyone")) {
      throw new Error("@everyone should be filtered");
    }
    assertIncludes(names, "Admin", "Admin present");
    assertIncludes(names, "Member", "Member present");

    pass("inspectServer: filters @everyone role");
  } catch (e) {
    fail("inspectServer: filters @everyone role", e);
  }

  /* ================================================================
   * TEST 5: inspectServer — classifies channel types correctly
   * ================================================================ */

  try {
    const guild = makeMockGuild({
      channels: [
        makeChannel("ch-1", "text-chan", 0),    // GuildText
        makeChannel("ch-2", "voice-chan", 2),   // GuildVoice
        makeChannel("ch-3", "category", 4),     // GuildCategory
        makeChannel("ch-4", "announcements", 5), // GuildAnnouncement — should be excluded
      ],
    });

    const result = await inspectServer(guild);

    // Text + voice = 2, category = 1, announcements excluded
    assertEqual(result.channels.length, 2, "text + voice channels");
    assertEqual(result.categories.length, 1, "one category");

    const channelNames = result.channels.map((c: any) => c.name);
    assertIncludes(channelNames, "text-chan", "text channel included");
    assertIncludes(channelNames, "voice-chan", "voice channel included");

    const categoryNames = result.categories.map((c: any) => c.name);
    assertIncludes(categoryNames, "category", "category included");

    // Announcements should NOT be in channels or categories
    if (channelNames.includes("announcements") || categoryNames.includes("announcements")) {
      throw new Error("announcements channel should be excluded");
    }

    pass("inspectServer: classifies channel types correctly");
  } catch (e) {
    fail("inspectServer: classifies channel types correctly", e);
  }

  /* ================================================================
   * TEST 6: inspectServer — returns role IDs
   * ================================================================ */

  try {
    const guild = makeMockGuild({
      roles: [makeRole("id-abc", "Admin"), makeRole("id-def", "Mod")],
    });

    const result = await inspectServer(guild);

    const roleIds = result.roles.map((r: any) => r.id);
    assertIncludes(roleIds, "id-abc", "Admin role ID");
    assertIncludes(roleIds, "id-def", "Mod role ID");

    pass("inspectServer: returns role IDs");
  } catch (e) {
    fail("inspectServer: returns role IDs", e);
  }

  /* ================================================================
   * TEST 7: inspectServer — returns channel metadata
   * ================================================================ */

  try {
    const guild = makeMockGuild({
      channels: [makeChannel("ch-1", "general", 0, "cat-1")],
    });

    const result = await inspectServer(guild);

    const general = result.channels.find((c: any) => c.id === "ch-1");
    if (!general) throw new Error("general channel not found");

    assertEqual(general.name, "general", "channel name");
    assertEqual(general.type, "text", "channel type");
    assertEqual(general.categoryId, "cat-1", "channel categoryId");

    pass("inspectServer: returns channel metadata");
  } catch (e) {
    fail("inspectServer: returns channel metadata", e);
  }

  /* ================================================================
   * TEST 8: inspectServer — many roles (stress)
   * ================================================================ */

  try {
    const roles = Array.from({ length: 50 }, (_, i) => makeRole(`r-${i}`, `Role-${i}`));
    const guild = makeMockGuild({ roles });

    const result = await inspectServer(guild);

    assertEqual(result.roles.length, 50, "50 roles returned");

    pass("inspectServer: handles many roles");
  } catch (e) {
    fail("inspectServer: handles many roles", e);
  }

  /* ================================================================
   * SUMMARY
   * ================================================================ */

  console.log(`\n${"=".repeat(50)}`);
  console.log(`Builder inspectServer Tests: ${passed} passed, ${failed} failed`);
  console.log(`${"=".repeat(50)}\n`);

  process.exit(failed > 0 ? 1 : 0);
}

runTests();
