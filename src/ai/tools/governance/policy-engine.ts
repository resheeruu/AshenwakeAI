/* ================================================================
 * U7 POLICY ENGINE
 *
 * Core policy persistence and evaluation logic.
 * Guild-isolated. Uses atomic file writes.
 * ================================================================ */

import fs from "fs";
import path from "path";
import { logger } from "../../../logger";
import type {
  PolicyConfig,
  PolicyRule,
  PolicyViolation,
  PolicyCompliance,
  InspectionResult,
  PolicyStatus,
} from "./policy-schema";

/* ================================================================
 * PERSISTENCE
 * ================================================================ */

const DATA_DIR = path.join(process.cwd(), "data");
const POLICIES_DIR = path.join(DATA_DIR, "governance-policies");

function getPolicyPath(guildId: string): string {
  return path.join(POLICIES_DIR, `${guildId}.json`);
}

const CURRENT_VERSION = 1;

function defaultPolicyConfig(guildId: string): PolicyConfig {
  return {
    id: `policy_${guildId}`,
    guildId,
    name: "Default Policy",
    description: "Default governance policy",
    rules: [],
    protectedChannels: [],
    protectedCategories: [],
    exemptChannels: [],
    exemptCategories: [],
    driftDetection: {
      enabled: false,
      intervalMs: 3600_000,
    },
    version: CURRENT_VERSION,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export function loadPolicyConfig(guildId: string): PolicyConfig {
  const filePath = getPolicyPath(guildId);
  try {
    if (!fs.existsSync(filePath)) return defaultPolicyConfig(guildId);
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<PolicyConfig>;
    return { ...defaultPolicyConfig(guildId), ...parsed, guildId };
  } catch {
    return defaultPolicyConfig(guildId);
  }
}

export function savePolicyConfig(config: PolicyConfig): void {
  try {
    fs.mkdirSync(POLICIES_DIR, { recursive: true });
    config.updatedAt = Date.now();
    const filePath = getPolicyPath(config.guildId);
    const tmpPath = filePath + ".tmp";
    fs.writeFileSync(tmpPath, JSON.stringify(config, null, 2), "utf8");
    fs.renameSync(tmpPath, filePath);
  } catch (error) {
    logger.warn(
      `Could not save governance policy for ${config.guildId}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export function deletePolicyConfig(guildId: string): boolean {
  try {
    const filePath = getPolicyPath(guildId);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export function hasPolicy(guildId: string): boolean {
  const filePath = getPolicyPath(guildId);
  return fs.existsSync(filePath);
}

/* ================================================================
 * RULE HELPERS
 * ================================================================ */

export function generateRuleId(): string {
  return `rule_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function validateRule(rule: PolicyRule): { valid: boolean; error?: string } {
  if (!rule.id || typeof rule.id !== "string") return { valid: false, error: "Rule must have an id" };
  if (!rule.type) return { valid: false, error: "Rule must have a type" };
  if (!rule.description || typeof rule.description !== "string") return { valid: false, error: "Rule must have a description" };

  const validTypes: PolicyRule["type"][] = [
    "channel_type", "channel_permission", "category_protected",
    "required_channel", "required_category", "channel_restricted",
  ];
  if (!validTypes.includes(rule.type)) return { valid: false, error: `Invalid rule type: ${rule.type}` };

  if (rule.type === "channel_type" && !rule.expectedType) {
    return { valid: false, error: "channel_type rule requires expectedType" };
  }
  if (rule.type === "channel_permission" && (!rule.permission || !rule.permissionOp)) {
    return { valid: false, error: "channel_permission rule requires permission and permissionOp" };
  }
  if ((rule.type === "required_channel" || rule.type === "required_category") && !rule.requiredName) {
    return { valid: false, error: `${rule.type} rule requires requiredName` };
  }

  return { valid: true };
}

export function validatePolicyConfig(config: PolicyConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!config.guildId) errors.push("Missing guildId");
  if (!config.name) errors.push("Missing name");
  if (!Array.isArray(config.rules)) errors.push("rules must be an array");

  for (const rule of config.rules) {
    const result = validateRule(rule);
    if (!result.valid) errors.push(`Rule ${rule.id || "(no id)"}: ${result.error}`);
  }

  return { valid: errors.length === 0, errors };
}

/* ================================================================
 * PATTERN MATCHING
 * ================================================================ */

export function matchesPattern(name: string, pattern: string): boolean {
  if (pattern === "*") return true;
  if (pattern === "#*") return true;

  const cleanName = name.replace(/^#/, "");
  const cleanPattern = pattern.replace(/^#/, "");

  const regexStr = cleanPattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*");
  const regex = new RegExp(`^${regexStr}$`, "i");
  return regex.test(cleanName);
}

/* ================================================================
 * POLICY EVALUATION — DETERMINISTIC
 *
 * Given: same guildChannels + same policy + same rules
 * the result MUST be equivalent.
 * ================================================================ */

export interface ChannelInfo {
  id: string;
  name: string;
  type: number;
  parentId: string | null;
  topic?: string;
  nsfw?: boolean;
  permissionOverwrites?: Array<{
    id: string;
    type: number;
    allow: string;
    deny: string;
  }>;
}

export interface RoleInfo {
  id: string;
  name: string;
  position: number;
  permissions: string;
}

export interface GuildState {
  guildId: string;
  channels: ChannelInfo[];
  categories: ChannelInfo[];
  roles: RoleInfo[];
  everyoneRoleId: string;
}

const CHANNEL_TYPE_MAP: Record<number, string> = {
  0: "text",
  2: "voice",
  4: "category",
  5: "announcement",
  13: "stage",
  15: "forum",
};

function getChannelKind(type: number): string {
  return CHANNEL_TYPE_MAP[type] || "unknown";
}

function channelMatchesPattern(channel: ChannelInfo, pattern: string): boolean {
  return matchesPattern(`#${channel.name}`, pattern);
}

function categoryMatchesPattern(category: ChannelInfo, pattern: string): boolean {
  return matchesPattern(category.name, pattern);
}

function checkPermissionOverwrite(
  channel: ChannelInfo,
  roleId: string,
  permission: string,
): { hasAllow: boolean; hasDeny: boolean } {
  const overwrite = channel.permissionOverwrites?.find(
    (o) => o.id === roleId && o.type === 0,
  );
  if (!overwrite) return { hasAllow: false, hasDeny: false };

  const permBit = permissionToBigInt(permission);
  if (permBit === null) return { hasAllow: false, hasDeny: false };

  const allowBits = BigInt(overwrite.allow);
  const denyBits = BigInt(overwrite.deny);

  return {
    hasAllow: (allowBits & permBit) === permBit,
    hasDeny: (denyBits & permBit) === permBit,
  };
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

export function evaluateRule(
  rule: PolicyRule,
  guildState: GuildState,
  protectedChannels: string[],
  protectedCategories: string[],
  exemptChannels: string[],
  exemptCategories: string[],
): PolicyViolation | PolicyCompliance | null {
  if (!rule.enabled) return null;

  switch (rule.type) {
    case "channel_type":
      return evaluateChannelTypeRule(rule, guildState, exemptChannels);
    case "channel_permission":
      return evaluateChannelPermissionRule(rule, guildState, protectedChannels, exemptChannels);
    case "category_protected":
      return evaluateCategoryProtectedRule(rule, guildState, protectedCategories);
    case "required_channel":
      return evaluateRequiredChannelRule(rule, guildState);
    case "required_category":
      return evaluateRequiredCategoryRule(rule, guildState);
    case "channel_restricted":
      return evaluateChannelRestrictedRule(rule, guildState, exemptChannels);
    default:
      return null;
  }
}

function evaluateChannelTypeRule(
  rule: PolicyRule,
  guildState: GuildState,
  exemptChannels: string[],
): PolicyViolation | PolicyCompliance | null {
  if (!rule.channelPattern || !rule.expectedType) return null;

  const matchingChannels = guildState.channels.filter(
    (ch) => channelMatchesPattern(ch, rule.channelPattern!) && !exemptChannels.includes(ch.id),
  );

  if (matchingChannels.length === 0) {
    if (rule.type === "required_channel") {
      return {
        ruleId: rule.id,
        ruleType: rule.type,
        severity: rule.riskIfViolated || "medium",
        message: `No channels matching "${rule.channelPattern}" found`,
        expected: rule.expectedType,
        actual: "none",
      };
    }
    return null;
  }

  for (const ch of matchingChannels) {
    const actualKind = getChannelKind(ch.type);
    if (actualKind !== rule.expectedType) {
      return {
        ruleId: rule.id,
        ruleType: rule.type,
        severity: rule.riskIfViolated || "low",
        channelId: ch.id,
        message: `#${ch.name} expected to be ${rule.expectedType} but is ${actualKind}`,
        expected: rule.expectedType,
        actual: actualKind,
      };
    }
  }

  return {
    ruleId: rule.id,
    ruleType: rule.type,
    channelId: matchingChannels[0]?.id,
    message: `All channels matching "${rule.channelPattern}" have correct type`,
  };
}

function evaluateChannelPermissionRule(
  rule: PolicyRule,
  guildState: GuildState,
  protectedChannels: string[],
  exemptChannels: string[],
): PolicyViolation | PolicyCompliance | null {
  if (!rule.channelPattern || !rule.permission || !rule.permissionOp) return null;

  const matchingChannels = guildState.channels.filter(
    (ch) => channelMatchesPattern(ch, rule.channelPattern!) && !exemptChannels.includes(ch.id),
  );

  for (const ch of matchingChannels) {
    const { hasAllow, hasDeny } = checkPermissionOverwrite(
      ch,
      guildState.everyoneRoleId,
      rule.permission!,
    );

    let violated = false;
    let actualState = "neutral";

    switch (rule.permissionOp) {
      case "must_allow":
        if (!hasAllow) { violated = true; actualState = hasDeny ? "denied" : "neutral"; }
        break;
      case "must_deny":
        if (!hasDeny) { violated = true; actualState = hasAllow ? "allowed" : "neutral"; }
        break;
      case "allow":
        if (hasDeny) { violated = true; actualState = "denied"; }
        break;
      case "deny":
        if (hasAllow) { violated = true; actualState = "allowed"; }
        break;
    }

    if (violated) {
      return {
        ruleId: rule.id,
        ruleType: rule.type,
        severity: rule.riskIfViolated || "medium",
        channelId: ch.id,
        message: `#${ch.name}: @everyone ${rule.permission} should be ${rule.permissionOp} but is ${actualState}`,
        expected: rule.permissionOp,
        actual: actualState,
      };
    }
  }

  return {
    ruleId: rule.id,
    ruleType: rule.type,
    channelId: matchingChannels[0]?.id,
    message: `All channels matching "${rule.channelPattern}" satisfy ${rule.permission} = ${rule.permissionOp}`,
  };
}

function evaluateCategoryProtectedRule(
  rule: PolicyRule,
  guildState: GuildState,
  protectedCategories: string[],
): PolicyViolation | PolicyCompliance | null {
  if (!rule.categoryPattern) return null;

  const matchingCategories = guildState.categories.filter((cat) =>
    categoryMatchesPattern(cat, rule.categoryPattern!),
  );

  for (const cat of matchingCategories) {
    if (!protectedCategories.includes(cat.id)) {
      return {
        ruleId: rule.id,
        ruleType: rule.type,
        severity: rule.riskIfViolated || "high",
        categoryName: cat.id,
        message: `Category "${cat.name}" should be protected but is not`,
        expected: "protected",
        actual: "unprotected",
      };
    }
  }

  return {
    ruleId: rule.id,
    ruleType: rule.type,
    categoryName: matchingCategories[0]?.id,
    message: `Categories matching "${rule.categoryPattern}" are protected`,
  };
}

function evaluateRequiredChannelRule(
  rule: PolicyRule,
  guildState: GuildState,
): PolicyViolation | PolicyCompliance | null {
  if (!rule.requiredName) return null;

  const found = guildState.channels.some(
    (ch) => ch.name.toLowerCase() === rule.requiredName!.toLowerCase(),
  );

  if (!found) {
    return {
      ruleId: rule.id,
      ruleType: rule.type,
      severity: rule.riskIfViolated || "medium",
      message: `Required channel "#${rule.requiredName}" is missing`,
      expected: "present",
      actual: "missing",
    };
  }

  return {
    ruleId: rule.id,
    ruleType: rule.type,
    message: `Required channel "#${rule.requiredName}" exists`,
  };
}

function evaluateRequiredCategoryRule(
  rule: PolicyRule,
  guildState: GuildState,
): PolicyViolation | PolicyCompliance | null {
  if (!rule.requiredName) return null;

  const found = guildState.categories.some(
    (cat) => cat.name.toLowerCase() === rule.requiredName!.toLowerCase(),
  );

  if (!found) {
    return {
      ruleId: rule.id,
      ruleType: rule.type,
      severity: rule.riskIfViolated || "medium",
      message: `Required category "${rule.requiredName}" is missing`,
      expected: "present",
      actual: "missing",
    };
  }

  return {
    ruleId: rule.id,
    ruleType: rule.type,
    message: `Required category "${rule.requiredName}" exists`,
  };
}

function evaluateChannelRestrictedRule(
  rule: PolicyRule,
  guildState: GuildState,
  exemptChannels: string[],
): PolicyViolation | PolicyCompliance | null {
  if (!rule.channelPattern || !rule.permission) return null;

  const matchingChannels = guildState.channels.filter(
    (ch) => channelMatchesPattern(ch, rule.channelPattern!) && !exemptChannels.includes(ch.id),
  );

  for (const ch of matchingChannels) {
    const { hasAllow } = checkPermissionOverwrite(
      ch,
      guildState.everyoneRoleId,
      rule.permission!,
    );

    if (hasAllow) {
      return {
        ruleId: rule.id,
        ruleType: rule.type,
        severity: rule.riskIfViolated || "medium",
        channelId: ch.id,
        message: `#${ch.name}: @everyone should not have ${rule.permission}`,
        expected: "not allowed",
        actual: "allowed",
      };
    }
  }

  return {
    ruleId: rule.id,
    ruleType: rule.type,
    channelId: matchingChannels[0]?.id,
    message: `Channels matching "${rule.channelPattern}" correctly restrict ${rule.permission}`,
  };
}

/* ================================================================
 * FULL INSPECTION
 * ================================================================ */

export function inspectPolicy(
  policy: PolicyConfig,
  guildState: GuildState,
): InspectionResult {
  const violations: PolicyViolation[] = [];
  const compliant: PolicyCompliance[] = [];

  for (const rule of policy.rules) {
    const result = evaluateRule(
      rule,
      guildState,
      policy.protectedChannels,
      policy.protectedCategories,
      policy.exemptChannels,
      policy.exemptCategories,
    );

    if (!result) continue;

    if ("severity" in result && "expected" in result) {
      violations.push(result as PolicyViolation);
    } else {
      compliant.push(result as PolicyCompliance);
    }
  }

  const criticalViolations = violations.filter((v) => v.severity === "critical").length;
  let status: PolicyStatus = "compliant";
  if (criticalViolations > 0) status = "violation";
  else if (violations.length > 0) status = "violation";

  return {
    policyId: policy.id,
    guildId: policy.guildId,
    policyName: policy.name,
    timestamp: Date.now(),
    status,
    violations,
    compliant,
    protectedResources: {
      channels: [...policy.protectedChannels],
      categories: [...policy.protectedCategories],
    },
    totalRulesEvaluated: policy.rules.filter((r) => r.enabled).length,
    totalViolations: violations.length,
    criticalViolations,
  };
}
