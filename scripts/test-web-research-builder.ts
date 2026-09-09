#!/usr/bin/env node
/* ================================================================
 * WEB RESEARCH BUILDER TESTS
 *
 * Tests the subject extraction, enhancement building, and template
 * merging logic for the web research integration in the Builder.
 * ================================================================ */

import {
  extractBuildSubject,
  buildSubjectEnhancements,
  mergeTemplateEnhancements,
} from "../src/commands/prompt";

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

function assertIncludes(arr: string[], item: string, label: string): void {
  if (!arr.some((x) => x.toLowerCase() === item.toLowerCase())) {
    throw new Error(`${label}: expected array to include "${item}", got [${arr.join(", ")}]`);
  }
}

console.log("\n🧪 Web Research Builder Tests\n");

/* ================================================================
 * TEST 1: extractBuildSubject — no research for generic requests
 * ================================================================ */

try {
  // "make a cozy server" → no meaningful subject
  const r1 = extractBuildSubject("make a cozy server");
  assertEqual(r1, "", "cozy server → empty");

  // "make a gaming server" → "gaming" is a template type keyword, stripped by extractBuildSubject
  const r2 = extractBuildSubject("make a gaming server");
  assertEqual(r2, "", "gaming server → empty");

  // "make a Minecraft server" → no meaningful subject (minecraft is a template keyword)
  const r3 = extractBuildSubject("make a Minecraft server");
  assertEqual(r3, "", "minecraft server → empty");

  // "make a nice server" → no meaningful subject
  const r4 = extractBuildSubject("make a nice server");
  assertEqual(r4, "", "nice server → empty");

  // "make a server" → no subject
  const r5 = extractBuildSubject("make a server");
  assertEqual(r5, "", "make a server → empty");

  pass("extractBuildSubject: generic requests return empty");
} catch (e) {
  fail("extractBuildSubject: generic requests return empty", e);
}

/* ================================================================
 * TEST 2: extractBuildSubject — research for specific subjects
 * ================================================================ */

try {
  // "make a Discord server for Valorant" → "valorant"
  const r1 = extractBuildSubject("make a Discord server for Valorant");
  assertEqual(r1, "valorant", "valorant");

  // "make a gaming server for Valorant" → "valorant" (gaming is template vocab, stripped)
  const r2 = extractBuildSubject("make a gaming server for Valorant");
  assertEqual(r2, "valorant", "gaming for valorant");

  // "make a Minecraft server for Hypixel players" → "hypixel players" or "hypixel"
  const r3 = extractBuildSubject("make a Minecraft server for Hypixel players");
  if (r3.length < 2) throw new Error(`hypixel: expected non-empty, got "${r3}"`);

  // "make a server for 3D printing" → "3d printing"
  const r4 = extractBuildSubject("make a server for 3D printing");
  if (r4.length < 2) throw new Error(`3d printing: expected non-empty, got "${r4}"`);

  // "make a study server for nursing students" → "nursing students" or "nursing"
  const r5 = extractBuildSubject("make a study server for nursing students");
  if (r5.length < 2) throw new Error(`nursing students: expected non-empty, got "${r5}"`);

  // "make a server like Dream" → something non-empty
  const r6 = extractBuildSubject("make a server like Dream");
  if (r6.length < 2) throw new Error(`like Dream: expected non-empty, got "${r6}"`);

  pass("extractBuildSubject: specific subjects are extracted");
} catch (e) {
  fail("extractBuildSubject: specific subjects are extracted", e);
}

/* ================================================================
 * TEST 3: buildSubjectEnhancements — produces categories from content
 * ================================================================ */

try {
  const content = `
    Valorant is a tactical first-person shooter developed by Riot Games.
    The game features agents with unique abilities, competitive ranked play,
    and a vibrant esports scene. Community servers often have channels for
    agent discussion, map callouts, competitive strategy, and clip sharing.
    The ranked system includes ranks from Iron to Radiant.
  `;

  const enhancements = buildSubjectEnhancements("valorant", content);

  if (enhancements.categories.length === 0) {
    throw new Error("Expected at least one category from research content");
  }

  // Each category should have discussion and resources channels
  for (const cat of enhancements.categories) {
    if (!cat.channels.some((ch) => ch.name === "discussion")) {
      throw new Error(`Category "${cat.name}" missing discussion channel`);
    }
    if (!cat.channels.some((ch) => ch.name === "resources")) {
      throw new Error(`Category "${cat.name}" missing resources channel`);
    }
  }

  pass("buildSubjectEnhancements: produces categories from content");
} catch (e) {
  fail("buildSubjectEnhancements: produces categories from content", e);
}

/* ================================================================
 * TEST 4: mergeTemplateEnhancements — preserves base template
 * ================================================================ */

try {
  const baseTemplate = {
    name: "Gaming Server",
    description: "Setup for gaming communities",
    roles: [{ name: "Gamer", color: "#FF4500" }, { name: "Streamer", color: "#9146FF" }],
    categories: [
      { name: "INFORMATION", channels: [{ name: "rules", type: "text" }, { name: "announcements", type: "text" }] },
      { name: "GENERAL", channels: [{ name: "general", type: "text" }, { name: "memes", type: "text" }] },
      { name: "GAMING", channels: [{ name: "looking-for-group", type: "text" }, { name: "game-clips", type: "text" }] },
      { name: "VOICE", channels: [{ name: "Gaming Lounge", type: "voice" }, { name: "Stream Room", type: "voice" }] },
    ],
  };

  const enhancements = {
    categories: [
      { name: "VALORANT", channels: [{ name: "discussion", type: "text" }, { name: "resources", type: "text" }] },
    ],
    roles: [],
  };

  const merged = mergeTemplateEnhancements(baseTemplate, enhancements, "valorant");

  // Base template name should be preserved
  assertEqual(merged.name, "Gaming Server", "name preserved");

  // Base template description should be preserved
  assertEqual(merged.description, "Setup for gaming communities", "description preserved");

  // Base roles should be preserved
  assertIncludes(merged.roles.map((r) => r.name), "Gamer", "base role preserved");
  assertIncludes(merged.roles.map((r) => r.name), "Streamer", "base role preserved");

  // Base categories should be preserved
  assertIncludes(merged.categories.map((c) => c.name), "INFORMATION", "base category preserved");
  assertIncludes(merged.categories.map((c) => c.name), "GENERAL", "base category preserved");
  assertIncludes(merged.categories.map((c) => c.name), "GAMING", "base category preserved");
  assertIncludes(merged.categories.map((c) => c.name), "VOICE", "base category preserved");

  // Enhancement should be added
  assertIncludes(merged.categories.map((c) => c.name), "VALORANT", "enhancement category added");

  // Enhancement should be inserted before VOICE
  const voiceIdx = merged.categories.findIndex((c) => c.name === "VOICE");
  const valIdx = merged.categories.findIndex((c) => c.name === "VALORANT");
  if (valIdx >= voiceIdx) {
    throw new Error("Enhancement should be inserted before VOICE");
  }

  pass("mergeTemplateEnhancements: preserves base template and adds enhancements");
} catch (e) {
  fail("mergeTemplateEnhancements: preserves base template and adds enhancements", e);
}

/* ================================================================
 * TEST 5: mergeTemplateEnhancements — deduplicates categories
 * ================================================================ */

try {
  const baseTemplate = {
    name: "Study Server",
    description: "Study group setup",
    roles: [{ name: "Tutor", color: "#4169E1" }],
    categories: [
      { name: "INFO", channels: [{ name: "rules", type: "text" }] },
      { name: "STUDY", channels: [{ name: "general", type: "text" }] },
      { name: "VOICE", channels: [{ name: "Study Room", type: "voice" }] },
    ],
  };

  // Enhancement has a category that already exists in base
  const enhancements = {
    categories: [
      { name: "STUDY", channels: [{ name: "extra", type: "text" }] }, // duplicate
      { name: "NURSING", channels: [{ name: "discussion", type: "text" }, { name: "resources", type: "text" }] }, // new
    ],
    roles: [],
  };

  const merged = mergeTemplateEnhancements(baseTemplate, enhancements, "nursing");

  // "STUDY" should appear only once (from base, not duplicated)
  const studyCount = merged.categories.filter((c) => c.name === "STUDY").length;
  assertEqual(studyCount, 1, "STUDY not duplicated");

  // "NURSING" should be added
  assertIncludes(merged.categories.map((c) => c.name), "NURSING", "NURSING added");

  pass("mergeTemplateEnhancements: deduplicates categories");
} catch (e) {
  fail("mergeTemplateEnhancements: deduplicates categories", e);
}

/* ================================================================
 * TEST 6: mergeTemplateEnhancements — deduplicates roles
 * ================================================================ */

try {
  const baseTemplate = {
    name: "Test",
    description: "Test",
    roles: [{ name: "Moderator", color: "#1E90FF" }],
    categories: [{ name: "VOICE", channels: [] }],
  };

  const enhancements = {
    categories: [],
    roles: [{ name: "Moderator", color: "#FF0000" }], // duplicate
  };

  const merged = mergeTemplateEnhancements(baseTemplate, enhancements, "test");

  const modCount = merged.roles.filter((r) => r.name === "Moderator").length;
  assertEqual(modCount, 1, "Moderator not duplicated");

  pass("mergeTemplateEnhancements: deduplicates roles");
} catch (e) {
  fail("mergeTemplateEnhancements: deduplicates roles", e);
}

/* ================================================================
 * TEST 7: extractBuildSubject — edge cases
 * ================================================================ */

try {
  // Empty string
  assertEqual(extractBuildSubject(""), "", "empty string");

  // Just "server"
  assertEqual(extractBuildSubject("server"), "", "just server");

  // Just "make"
  assertEqual(extractBuildSubject("make"), "", "just make");

  // Very short subject
  assertEqual(extractBuildSubject("a"), "", "just a");

  pass("extractBuildSubject: edge cases handled");
} catch (e) {
  fail("extractBuildSubject: edge cases handled", e);
}

/* ================================================================
 * TEST 8: buildSubjectEnhancements — minimal content
 * ================================================================ */

try {
  // Content with no meaningful words
  const content = "the a an is it";
  const enhancements = buildSubjectEnhancements("test", content);

  // Should return empty categories (no meaningful terms found)
  assertEqual(enhancements.categories.length, 0, "no categories from stop words");

  pass("buildSubjectEnhancements: minimal content returns empty");
} catch (e) {
  fail("buildSubjectEnhancements: minimal content returns empty", e);
}

/* ================================================================
 * SUMMARY
 * ================================================================ */

console.log(`\n${"=".repeat(50)}`);
console.log(`Web Research Builder Tests: ${passed} passed, ${failed} failed`);
console.log(`${"=".repeat(50)}\n`);

process.exit(failed > 0 ? 1 : 0);
