import { loadGuildConfig } from "../src/core/guild-config";
import {
  validateSettingValue,
  applySettingValue,
  getOverviewData,
  formatValue,
  formatChannelMention,
  formatRoleMention,
  ensureConfigSections,
} from "../src/settings/service";
import {
  ALL_SETTINGS,
  getSettingsByCategory,
  getSettingById,
  SETTINGS_CATEGORIES,
} from "../src/settings/definitions";
import { getConfigValue, setConfigValue } from "../src/settings/types";

let passed = 0;
let failed = 0;

function pass(name: string) {
  console.log(`\u2705 ${name}`);
  passed++;
}

function fail(name: string, error?: unknown) {
  console.error(`\u274c ${name}`, error ?? "");
  failed++;
}

console.log("\n\uD83E\uDDEA AshenAI Settings Service Tests\n");

// DEFINITIONS INTEGRITY

try {
  if (ALL_SETTINGS.length > 0) {
    pass(`Settings definitions loaded (${ALL_SETTINGS.length} settings)`);
  } else {
    fail("Settings definitions loaded");
  }
} catch (error) { fail("Settings definitions loaded", error); }

try {
  const categories = new Set(ALL_SETTINGS.map((s) => s.category));
  if (categories.size >= 6) {
    pass(`Settings cover ${categories.size} categories`);
  } else {
    fail(`Expected at least 6 categories, got ${categories.size}`);
  }
} catch (error) { fail("Settings categories", error); }

try {
  let allOk = true;
  for (const s of ALL_SETTINGS) {
    if (!s.id || !s.label || !s.path || !s.type) {
      fail(`Setting ${s.id} missing required fields`);
      allOk = false;
    }
  }
  if (allOk) pass("All settings have required fields");
} catch (error) { fail("Settings field check", error); }

try {
  let allOk = true;
  for (const s of ALL_SETTINGS) {
    if (s.defaultValue === undefined && s.type !== "channel") {
      fail(`Setting ${s.id} missing defaultValue`);
      allOk = false;
    }
  }
  if (allOk) pass("All non-channel settings have default values");
} catch (error) { fail("Settings defaults check", error); }

// CATEGORY LOOKUP

try {
  const modSettings = getSettingsByCategory("moderation");
  if (modSettings.length === 4) pass("Moderation category has 4 settings");
  else fail(`Expected 4 moderation settings, got ${modSettings.length}`);
} catch (error) { fail("Moderation category lookup", error); }

try {
  const supportSettings = getSettingsByCategory("support");
  if (supportSettings.length === 6) pass("Support category has 6 settings");
  else fail(`Expected 6 support settings, got ${supportSettings.length}`);
} catch (error) { fail("Support category lookup", error); }

try {
  const aiSettings = getSettingsByCategory("ai");
  if (aiSettings.length === 4) pass("AI category has 4 settings");
  else fail(`Expected 4 AI settings, got ${aiSettings.length}`);
} catch (error) { fail("AI category lookup", error); }

try {
  const byId = getSettingById("moderation.enabled");
  if (byId && byId.type === "boolean" && byId.path === "moderation.enabled") {
    pass("getSettingById works for moderation.enabled");
  } else {
    fail("getSettingById moderation.enabled", byId);
  }
} catch (error) { fail("getSettingById", error); }

try {
  const missing = getSettingById("nonexistent.setting");
  if (missing === undefined) pass("getSettingById returns undefined for missing");
  else fail("getSettingById should return undefined for missing");
} catch (error) { fail("getSettingById missing", error); }

// VALIDATION: BOOLEAN

const boolDesc = getSettingById("moderation.enabled")!;

try {
  const r = validateSettingValue(boolDesc, "true", "g1");
  if (r.valid && r.normalized === true) pass("Validate boolean true");
  else fail("Validate boolean true", r);
} catch (error) { fail("Validate boolean true", error); }

try {
  const r = validateSettingValue(boolDesc, "false", "g1");
  if (r.valid && r.normalized === false) pass("Validate boolean false");
  else fail("Validate boolean false", r);
} catch (error) { fail("Validate boolean false", error); }

try {
  const r = validateSettingValue(boolDesc, "yes", "g1");
  if (r.valid && r.normalized === true) pass("Validate boolean yes");
  else fail("Validate boolean yes", r);
} catch (error) { fail("Validate boolean yes", error); }

try {
  const r = validateSettingValue(boolDesc, "no", "g1");
  if (r.valid && r.normalized === false) pass("Validate boolean no");
  else fail("Validate boolean no", r);
} catch (error) { fail("Validate boolean no", error); }

try {
  const r = validateSettingValue(boolDesc, "1", "g1");
  if (r.valid && r.normalized === true) pass("Validate boolean 1");
  else fail("Validate boolean 1", r);
} catch (error) { fail("Validate boolean 1", error); }

try {
  const r = validateSettingValue(boolDesc, "0", "g1");
  if (r.valid && r.normalized === false) pass("Validate boolean 0");
  else fail("Validate boolean 0", r);
} catch (error) { fail("Validate boolean 0", error); }

try {
  const r = validateSettingValue(boolDesc, "on", "g1");
  if (r.valid && r.normalized === true) pass("Validate boolean on");
  else fail("Validate boolean on", r);
} catch (error) { fail("Validate boolean on", error); }

try {
  const r = validateSettingValue(boolDesc, "off", "g1");
  if (r.valid && r.normalized === false) pass("Validate boolean off");
  else fail("Validate boolean off", r);
} catch (error) { fail("Validate boolean off", error); }

try {
  const r = validateSettingValue(boolDesc, "invalid", "g1");
  if (!r.valid) pass("Validate boolean rejects invalid");
  else fail("Validate boolean should reject invalid");
} catch (error) { fail("Validate boolean rejects invalid", error); }

// VALIDATION: NUMBER

const numDesc = getSettingById("moderation.defaultTimeoutMinutes")!;

try {
  const r = validateSettingValue(numDesc, "10", "g1");
  if (r.valid && r.normalized === 10) pass("Validate number 10");
  else fail("Validate number 10", r);
} catch (error) { fail("Validate number 10", error); }

try {
  const r = validateSettingValue(numDesc, "0", "g1");
  if (!r.valid) pass("Validate number rejects below min (0)");
  else fail("Validate number should reject 0 (min is 1)");
} catch (error) { fail("Validate number min", error); }

try {
  const r = validateSettingValue(numDesc, "99999", "g1");
  if (!r.valid) pass("Validate number rejects above max");
  else fail("Validate number should reject above max");
} catch (error) { fail("Validate number max", error); }

try {
  const r = validateSettingValue(numDesc, "abc", "g1");
  if (!r.valid) pass("Validate number rejects non-numeric");
  else fail("Validate number should reject non-numeric");
} catch (error) { fail("Validate number non-numeric", error); }

try {
  const r = validateSettingValue(numDesc, "3.5", "g1");
  if (!r.valid) pass("Validate number rejects decimal");
  else fail("Validate number should reject decimal");
} catch (error) { fail("Validate number decimal", error); }

// VALIDATION: CHANNEL

const chDesc = getSettingById("support.channelId")!;

try {
  const r = validateSettingValue(chDesc, "123456789012345678", "g1");
  if (r.valid && r.normalized === "123456789012345678") pass("Validate channel ID");
  else fail("Validate channel ID", r);
} catch (error) { fail("Validate channel ID", error); }

try {
  const r = validateSettingValue(chDesc, "none", "g1");
  if (r.valid && r.normalized === undefined) pass("Validate channel none");
  else fail("Validate channel none", r);
} catch (error) { fail("Validate channel none", error); }

try {
  const r = validateSettingValue(chDesc, "abc", "g1");
  if (!r.valid) pass("Validate channel rejects non-ID");
  else fail("Validate channel should reject non-ID");
} catch (error) { fail("Validate channel invalid", error); }

try {
  const r = validateSettingValue(chDesc, "123", "g1");
  if (!r.valid) pass("Validate channel rejects short ID");
  else fail("Validate channel should reject short ID");
} catch (error) { fail("Validate channel short", error); }

// CONFIG VALUE GET/SET

try {
  const config = loadGuildConfig("test-settings-getset");
  const val = getConfigValue(config, "moderation.enabled");
  if (val === true) pass("getConfigValue reads moderation.enabled");
  else fail("getConfigValue reads moderation.enabled", val);
} catch (error) { fail("getConfigValue", error); }

try {
  const config = loadGuildConfig("test-settings-getset2");
  setConfigValue(config, "moderation.defaultTimeoutMinutes", 42);
  const val = getConfigValue(config, "moderation.defaultTimeoutMinutes");
  if (val === 42) pass("setConfigValue sets nested value");
  else fail("setConfigValue sets nested value", val);
} catch (error) { fail("setConfigValue", error); }

try {
  const config = loadGuildConfig("test-settings-getset3");
  setConfigValue(config, "newSection.nested.key", "hello");
  const val = getConfigValue(config, "newSection.nested.key");
  if (val === "hello") pass("setConfigValue creates nested path");
  else fail("setConfigValue creates nested path", val);
} catch (error) { fail("setConfigValue nested", error); }

// APPLY SETTING VALUE

try {
  const config = loadGuildConfig("test-settings-apply");
  ensureConfigSections(config);
  const old = applySettingValue(config, "moderation.enabled");
  if (old === true) pass("applySettingValue reads current value");
  else fail("applySettingValue reads current value", old);
} catch (error) { fail("applySettingValue read", error); }

try {
  const config = loadGuildConfig("test-settings-apply2");
  ensureConfigSections(config);
  applySettingValue(config, "moderation.enabled", false);
  const val = applySettingValue(config, "moderation.enabled");
  if (val === false) pass("applySettingValue sets and reads back");
  else fail("applySettingValue sets and reads back", val);
} catch (error) { fail("applySettingValue set", error); }

try {
  const config = loadGuildConfig("test-settings-apply3");
  const result = applySettingValue(config, "nonexistent.setting");
  if (result === null) pass("applySettingValue returns null for missing setting");
  else fail("applySettingValue should return null for missing", result);
} catch (error) { fail("applySettingValue missing", error); }

// ENSURE CONFIG SECTIONS

try {
  const config = loadGuildConfig("test-settings-ensure");
  delete (config as any).support;
  delete (config as any).reports;
  delete (config as any).appeals;
  delete (config as any).supportAi;
  delete (config as any).supportLogging;
  delete (config as any).staff;
  ensureConfigSections(config);
  if (config.support && config.reports && config.appeals && config.supportAi && config.supportLogging && config.staff) {
    pass("ensureConfigSections creates all missing sections");
  } else {
    fail("ensureConfigSections missing sections", {
      support: !!config.support,
      reports: !!config.reports,
      appeals: !!config.appeals,
      supportAi: !!config.supportAi,
      supportLogging: !!config.supportLogging,
      staff: !!config.staff,
    });
  }
} catch (error) { fail("ensureConfigSections", error); }

try {
  const config = loadGuildConfig("test-settings-ensure2");
  ensureConfigSections(config);
  const orig = config.support?.enabled;
  ensureConfigSections(config);
  if (config.support?.enabled === orig) {
    pass("ensureConfigSections preserves existing values");
  } else {
    fail("ensureConfigSections should preserve existing values");
  }
} catch (error) { fail("ensureConfigSections preserve", error); }

// FORMAT HELPERS

try {
  if (formatValue(true) === "Enabled" && formatValue(false) === "Disabled") {
    pass("formatValue boolean");
  } else {
    fail("formatValue boolean", { true: formatValue(true), false: formatValue(false) });
  }
} catch (error) { fail("formatValue boolean", error); }

try {
  if (formatValue(undefined) === "Not set" && formatValue(null) === "Not set") {
    pass("formatValue nullish");
  } else {
    fail("formatValue nullish", { undef: formatValue(undefined), null: formatValue(null) });
  }
} catch (error) { fail("formatValue nullish", error); }

try {
  if (formatValue(42) === "42") pass("formatValue number");
  else fail("formatValue number", formatValue(42));
} catch (error) { fail("formatValue number", error); }

try {
  if (formatValue([]) === "None") pass("formatValue empty array");
  else fail("formatValue empty array", formatValue([]));
} catch (error) { fail("formatValue empty array", error); }

try {
  if (formatValue(["a", "b"]) === "a, b") pass("formatValue array");
  else fail("formatValue array", formatValue(["a", "b"]));
} catch (error) { fail("formatValue array", error); }

try {
  if (formatChannelMention(undefined) === "Not set") pass("formatChannelMention undefined");
  else fail("formatChannelMention undefined", formatChannelMention(undefined));
} catch (error) { fail("formatChannelMention undefined", error); }

try {
  if (formatChannelMention("123") === "<#123>") pass("formatChannelMention valid");
  else fail("formatChannelMention valid", formatChannelMention("123"));
} catch (error) { fail("formatChannelMention valid", error); }

try {
  if (formatRoleMention("456") === "<@&456>") pass("formatRoleMention valid");
  else fail("formatRoleMention valid", formatRoleMention("456"));
} catch (error) { fail("formatRoleMention valid", error); }

// OVERVIEW DATA

try {
  const config = loadGuildConfig("test-settings-overview");
  ensureConfigSections(config);
  const ov = getOverviewData(config);
  if (ov && Array.isArray(ov.enabledModules) && Array.isArray(ov.configuredChannels) && Array.isArray(ov.staffRoles)) {
    pass("getOverviewData returns valid structure");
  } else {
    fail("getOverviewData structure", ov);
  }
} catch (error) { fail("getOverviewData", error); }

try {
  const config = loadGuildConfig("test-settings-overview2");
  ensureConfigSections(config);
  config.moderation.enabled = true;
  config.support!.enabled = true;
  config.reports!.enabled = false;
  const ov = getOverviewData(config);
  if (ov.enabledModules.includes("Moderation") && ov.enabledModules.includes("Support") && !ov.enabledModules.includes("Reports")) {
    pass("getOverviewData correct enabled modules");
  } else {
    fail("getOverviewData enabled modules", ov.enabledModules);
  }
} catch (error) { fail("getOverviewData modules", error); }

// SETTINGS CATEGORIES METADATA

try {
  if (SETTINGS_CATEGORIES.length === 9) {
    pass("SETTINGS_CATEGORIES has 9 categories");
  } else {
    fail(`Expected 9 categories, got ${SETTINGS_CATEGORIES.length}`);
  }
} catch (error) { fail("SETTINGS_CATEGORIES count", error); }

try {
  const ids = SETTINGS_CATEGORIES.map((c) => c.id);
  if (ids.includes("overview") && ids.includes("moderation") && ids.includes("audit")) {
    pass("SETTINGS_CATEGORIES has expected categories");
  } else {
    fail("SETTINGS_CATEGORIES missing categories", ids);
  }
} catch (error) { fail("SETTINGS_CATEGORIES content", error); }

// ALL SETTINGS UNIQUE IDS

try {
  const ids = ALL_SETTINGS.map((s) => s.id);
  const unique = new Set(ids);
  if (unique.size === ids.length) {
    pass("All setting IDs are unique");
  } else {
    fail(`Duplicate setting IDs found: ${ids.length} total, ${unique.size} unique`);
  }
} catch (error) { fail("Setting ID uniqueness", error); }

// ALL SETTINGS PATHS VALID

try {
  let allPaths = true;
  for (const s of ALL_SETTINGS) {
    if (!s.path.includes(".")) {
      fail(`Setting ${s.id} has invalid path: ${s.path}`);
      allPaths = false;
    }
  }
  if (allPaths) pass("All setting paths contain dot separator");
} catch (error) { fail("Setting path validation", error); }

// NUMERIC BOUNDS

try {
  const timeoutDesc = getSettingById("moderation.defaultTimeoutMinutes")!;
  if (timeoutDesc.min === 1 && timeoutDesc.max === 40320) {
    pass("Timeout setting has correct bounds (1-40320)");
  } else {
    fail("Timeout setting bounds", { min: timeoutDesc.min, max: timeoutDesc.max });
  }
} catch (error) { fail("Timeout bounds", error); }

try {
  const warnDesc = getSettingById("moderation.maxWarnBeforeAction")!;
  if (warnDesc.min === 1 && warnDesc.max === 50) {
    pass("Max warns setting has correct bounds (1-50)");
  } else {
    fail("Max warns setting bounds", { min: warnDesc.min, max: warnDesc.max });
  }
} catch (error) { fail("Max warns bounds", error); }

// CHANNEL TYPE FILTERS

try {
  const supportChannel = getSettingById("support.channelId")!;
  if (supportChannel.channelTypes && supportChannel.channelTypes.includes("Text")) {
    pass("Support channel allows Text type");
  } else {
    fail("Support channel type filter", supportChannel.channelTypes);
  }
} catch (error) { fail("Support channel type", error); }

try {
  const supportCategory = getSettingById("support.categoryId")!;
  if (supportCategory.channelTypes && supportCategory.channelTypes.includes("Category")) {
    pass("Support category allows Category type");
  } else {
    fail("Support category type filter", supportCategory.channelTypes);
  }
} catch (error) { fail("Support category type", error); }

// COMBINED GUILD CONFIG ROUNDTRIP

try {
  const config = loadGuildConfig("test-settings-roundtrip");
  ensureConfigSections(config);

  applySettingValue(config, "moderation.enabled", false);
  applySettingValue(config, "moderation.defaultTimeoutMinutes", 15);
  applySettingValue(config, "support.enabled", true);
  applySettingValue(config, "support.channelId", "111222333444555666");
  applySettingValue(config, "supportAi.enabled", false);

  if (
    applySettingValue(config, "moderation.enabled") === false &&
    applySettingValue(config, "moderation.defaultTimeoutMinutes") === 15 &&
    applySettingValue(config, "support.enabled") === true &&
    applySettingValue(config, "support.channelId") === "111222333444555666" &&
    applySettingValue(config, "supportAi.enabled") === false
  ) {
    pass("Combined config roundtrip");
  } else {
    fail("Combined config roundtrip mismatch");
  }
} catch (error) { fail("Combined config roundtrip", error); }

// RESULTS

console.log(`\n\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed === 0) {
  console.log("\uD83C\uDF89 ALL SETTINGS TESTS PASSED");
} else {
  console.log("\u274C SETTINGS TESTS FAILED");
  process.exit(1);
}

console.log("\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n");
