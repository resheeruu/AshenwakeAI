/* ================================================================
 * U7 DRIFT DETECTION
 *
 * Detects when Discord state diverges from the configured policy.
 * Uses current Discord state — never trusts stale data.
 * ================================================================ */

import type {
  PolicyConfig,
  DriftEntry,
  DriftReport,
  DriftSeverity,
} from "./policy-schema";
import type { GuildState, ChannelInfo } from "./policy-engine";
import { matchesPattern } from "./policy-engine";

/* ================================================================
 * DRIFT DETECTION
 * ================================================================ */

export function detectDrift(
  policy: PolicyConfig,
  guildState: GuildState,
): DriftReport {
  const drifts: DriftEntry[] = [];

  for (const rule of policy.rules) {
    if (!rule.enabled) continue;

    const ruleDrifts = detectRuleDrift(rule, policy, guildState);
    drifts.push(...ruleDrifts);
  }

  return {
    policyId: policy.id,
    guildId: policy.guildId,
    timestamp: Date.now(),
    drift: drifts,
    totalDrifts: drifts.length,
    status: drifts.length === 0 ? "NO_DRIFT" : "DRIFT_DETECTED",
  };
}

function detectRuleDrift(
  rule: PolicyConfig["rules"][0],
  policy: PolicyConfig,
  guildState: GuildState,
): DriftEntry[] {
  const drifts: DriftEntry[] = [];

  switch (rule.type) {
    case "channel_permission":
      drifts.push(...detectPermissionDrift(rule, policy, guildState));
      break;
    case "channel_type":
      drifts.push(...detectTypeDrift(rule, guildState));
      break;
    case "required_channel":
      drifts.push(...detectMissingChannelDrift(rule, guildState));
      break;
    case "required_category":
      drifts.push(...detectMissingCategoryDrift(rule, guildState));
      break;
    case "category_protected":
      drifts.push(...detectCategoryProtectionDrift(rule, policy, guildState));
      break;
    case "channel_restricted":
      drifts.push(...detectChannelRestrictedDrift(rule, guildState));
      break;
  }

  return drifts;
}

function detectPermissionDrift(
  rule: PolicyConfig["rules"][0],
  policy: PolicyConfig,
  guildState: GuildState,
): DriftEntry[] {
  if (!rule.channelPattern || !rule.permission || !rule.permissionOp) return [];

  const drifts: DriftEntry[] = [];
  const channels = getMatchingChannels(rule.channelPattern, guildState, policy);

  for (const ch of channels) {
    const overwrite = ch.permissionOverwrites?.find(
      (o) => o.id === guildState.everyoneRoleId && o.type === 0,
    );

    const permBit = permissionToBigInt(rule.permission);
    if (permBit === null) continue;

    const allowBits = overwrite ? BigInt(overwrite.allow) : 0n;
    const denyBits = overwrite ? BigInt(overwrite.deny) : 0n;
    const hasAllow = (allowBits & permBit) === permBit;
    const hasDeny = (denyBits & permBit) === permBit;

    let expected = "";
    let actual = "";
    let hasDrift = false;

    switch (rule.permissionOp) {
      case "must_allow":
        if (!hasAllow) { hasDrift = true; expected = "allowed"; actual = hasDeny ? "denied" : "neutral"; }
        break;
      case "must_deny":
        if (!hasDeny) { hasDrift = true; expected = "denied"; actual = hasAllow ? "allowed" : "neutral"; }
        break;
      case "allow":
        if (hasDeny) { hasDrift = true; expected = "not denied"; actual = "denied"; }
        break;
      case "deny":
        if (hasAllow) { hasDrift = true; expected = "not allowed"; actual = "allowed"; }
        break;
    }

    if (hasDrift) {
      drifts.push({
        ruleId: rule.id,
        ruleType: rule.type,
        channelId: ch.id,
        expected,
        actual,
        severity: rule.riskIfViolated || "medium",
        detectedAt: Date.now(),
      });
    }
  }

  return drifts;
}

function detectTypeDrift(
  rule: PolicyConfig["rules"][0],
  guildState: GuildState,
): DriftEntry[] {
  if (!rule.channelPattern || !rule.expectedType) return [];

  const drifts: DriftEntry[] = [];
  const channels = guildState.channels.filter((ch) =>
    matchesPattern(`#${ch.name}`, rule.channelPattern!),
  );

  const typeMap: Record<string, number> = {
    text: 0,
    announcement: 5,
    voice: 2,
    stage: 13,
    forum: 15,
    category: 4,
  };
  const expectedTypeNum = typeMap[rule.expectedType] ?? -1;

  for (const ch of channels) {
    if (ch.type !== expectedTypeNum) {
      const actualKind = CHANNEL_TYPE_MAP[ch.type] || "unknown";
      drifts.push({
        ruleId: rule.id,
        ruleType: rule.type,
        channelId: ch.id,
        expected: rule.expectedType,
        actual: actualKind,
        severity: rule.riskIfViolated || "low",
        detectedAt: Date.now(),
      });
    }
  }

  return drifts;
}

const CHANNEL_TYPE_MAP: Record<number, string> = {
  0: "text",
  2: "voice",
  4: "category",
  5: "announcement",
  13: "stage",
  15: "forum",
};

function detectMissingChannelDrift(
  rule: PolicyConfig["rules"][0],
  guildState: GuildState,
): DriftEntry[] {
  if (!rule.requiredName) return [];

  const found = guildState.channels.some(
    (ch) => ch.name.toLowerCase() === rule.requiredName!.toLowerCase(),
  );

  if (!found) {
    return [{
      ruleId: rule.id,
      ruleType: rule.type,
      expected: "present",
      actual: "missing",
      severity: rule.riskIfViolated || "medium",
      detectedAt: Date.now(),
    }];
  }

  return [];
}

function detectMissingCategoryDrift(
  rule: PolicyConfig["rules"][0],
  guildState: GuildState,
): DriftEntry[] {
  if (!rule.requiredName) return [];

  const found = guildState.categories.some(
    (cat) => cat.name.toLowerCase() === rule.requiredName!.toLowerCase(),
  );

  if (!found) {
    return [{
      ruleId: rule.id,
      ruleType: rule.type,
      expected: "present",
      actual: "missing",
      severity: rule.riskIfViolated || "medium",
      detectedAt: Date.now(),
    }];
  }

  return [];
}

function detectCategoryProtectionDrift(
  rule: PolicyConfig["rules"][0],
  policy: PolicyConfig,
  guildState: GuildState,
): DriftEntry[] {
  if (!rule.categoryPattern) return [];

  const drifts: DriftEntry[] = [];
  const categories = guildState.categories.filter((cat) =>
    matchesPattern(cat.name, rule.categoryPattern!),
  );

  for (const cat of categories) {
    if (!policy.protectedCategories.includes(cat.id)) {
      drifts.push({
        ruleId: rule.id,
        ruleType: rule.type,
        categoryName: cat.id,
        expected: "protected",
        actual: "unprotected",
        severity: rule.riskIfViolated || "high",
        detectedAt: Date.now(),
      });
    }
  }

  return drifts;
}

function detectChannelRestrictedDrift(
  rule: PolicyConfig["rules"][0],
  guildState: GuildState,
): DriftEntry[] {
  if (!rule.channelPattern || !rule.permission) return [];

  const drifts: DriftEntry[] = [];
  const channels = guildState.channels.filter((ch) =>
    matchesPattern(`#${ch.name}`, rule.channelPattern!),
  );

  for (const ch of channels) {
    const overwrite = ch.permissionOverwrites?.find(
      (o) => o.id === guildState.everyoneRoleId && o.type === 0,
    );

    const permBit = permissionToBigInt(rule.permission);
    if (permBit === null) continue;

    const allowBits = overwrite ? BigInt(overwrite.allow) : 0n;
    const hasAllow = (allowBits & permBit) === permBit;

    if (hasAllow) {
      drifts.push({
        ruleId: rule.id,
        ruleType: rule.type,
        channelId: ch.id,
        expected: "restricted",
        actual: "allowed",
        severity: rule.riskIfViolated || "medium",
        detectedAt: Date.now(),
      });
    }
  }

  return drifts;
}

/* ================================================================
 * HELPERS
 * ================================================================ */

function getMatchingChannels(
  pattern: string,
  guildState: GuildState,
  policy: PolicyConfig,
): ChannelInfo[] {
  return guildState.channels.filter(
    (ch) =>
      matchesPattern(`#${ch.name}`, pattern) &&
      !policy.exemptChannels.includes(ch.id),
  );
}

function permissionToBigInt(perm: string): bigint | null {
  const map: Record<string, bigint> = {
    ViewChannel: 1n << 10n,
    SendMessages: 1n << 11n,
    SendMessagesInThreads: 1n << 38n,
    ReadMessageHistory: 1n << 16n,
    EmbedLinks: 1n << 14n,
    AttachFiles: 1n << 15n,
    AddReactions: 1n << 6n,
    UseExternalEmojis: 1n << 18n,
    Connect: 1n << 20n,
    Speak: 1n << 21n,
    UseVAD: 1n << 25n,
    ManageChannels: 1n << 4n,
    ManageRoles: 1n << 3n,
  };
  return map[perm] ?? null;
}
