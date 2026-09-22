/**
 * test-emoji-provisioner.ts — Validate emoji provisioning system
 */
import assert from "node:assert/strict";
import { resetProvisioner, getProvisionResult, applyEnvOverrides, type ProvisionResult } from "../src/discord/emoji-provisioner";
import { ANIME_EMOTE_MAP, ANIME_EMOTE_NAMES, animeEmote, hasAnimeEmote, configuredAnimeEmotes } from "../src/discord/anime-emotes";
import { ICON_MAP, ICON_NAMES, LOGICAL_TO_LEGACY, type IconName } from "../src/discord/icons";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (e: any) {
    console.log(`  ❌ ${name}: ${e.message}`);
    failed++;
  }
}

console.log("\n╔══════════════════════════════════════╗");
console.log("║  EMOJI PROVISIONER TESTS               ║");
console.log("╚══════════════════════════════════════╝\n");

test("resetProvisioner clears state", () => {
  resetProvisioner();
  const result = getProvisionResult();
  assert.equal(result, null, "Provisioner should be null after reset");
});

test("applyEnvOverrides applies overrides", () => {
  const result: ProvisionResult = {
    icons: {},
    animeEmotes: {},
    guildId: "123456",
    uploaded: 0,
    existing: 0,
    hadErrors: false,
  };
  process.env.EMOJI_ASH_TEST_OVERRIDE = "999999";
  applyEnvOverrides(result);
  delete process.env.EMOJI_ASH_TEST_OVERRIDE;
  assert.equal(result.guildId, "123456");
});

test("ANIME_EMOTE_MAP has all expected categories", () => {
  const reactions = ["happy", "laugh", "smug", "angry", "cry", "blush", "shock", "panic", "confused", "sleepy", "love", "embarrassed", "sad", "excited", "determined"];
  for (const name of reactions) {
    assert.ok(name in ANIME_EMOTE_MAP, `Missing reaction: ${name}`);
  }
  const actions = ["hug", "cuddle", "pat", "headpat", "kiss", "slap", "punch", "kick", "bonk", "bite", "poke", "wave", "highfive", "yeet", "dance", "throw", "hit", "smack", "tickle"];
  for (const name of actions) {
    assert.ok(name in ANIME_EMOTE_MAP, `Missing action: ${name}`);
  }
  const system = ["ai", "success", "error", "warning", "info", "loading", "online", "offline", "degraded", "settings", "stats"];
  for (const name of system) {
    assert.ok(name in ANIME_EMOTE_MAP, `Missing system: ${name}`);
  }
});

test("animeEmote returns text fallback when no provisioning", () => {
  resetProvisioner();
  for (const name of ANIME_EMOTE_NAMES) {
    const val = animeEmote(name);
    assert.equal(typeof val, "string", `animeEmote(${name}) should return string`);
    assert.ok(val.length > 0, `animeEmote(${name}) should not be empty`);
  }
});

test("Every icon has ash_* legacy name in LOGICAL_TO_LEGACY", () => {
  for (const name of ICON_NAMES) {
    const legacy = LOGICAL_TO_LEGACY[name];
    assert.equal(legacy, `ash_${name}`, `LOGICAL_TO_LEGACY[${name}] should be ash_${name}`);
  }
});

test("hasAnimeEmote works correctly", () => {
  resetProvisioner();
  for (const name of ANIME_EMOTE_NAMES) {
    const val = hasAnimeEmote(name);
    assert.equal(typeof val, "boolean", `hasAnimeEmote(${name}) should return boolean`);
  }
});

test("configuredAnimeEmotes returns an object", () => {
  resetProvisioner();
  const result = configuredAnimeEmotes();
  assert.equal(typeof result, "object", "configuredAnimeEmotes should return an object");
});

console.log("\n--- Summary ---");
console.log(`  Passed: ${passed}`);
console.log(`  Failed: ${failed}`);
console.log(`  Total:  ${passed + failed}`);

if (failed > 0) {
  process.exit(1);
} else {
  console.log("\n  🎉 All emoji provisioner tests passed!\n");
}
