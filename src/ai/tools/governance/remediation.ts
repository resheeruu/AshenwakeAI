/* ================================================================
 * U7 REMEDIATION PLANNING
 *
 * Generates safe remediation plans for detected drift.
 * Does NOT execute — only plans. Execution goes through the
 * existing U1-U6.1 confirmation and execution pipeline.
 * ================================================================ */

import type {
  DriftEntry,
  RemediationPlan,
  RemediationStep,
  RemediationAction,
} from "./policy-schema";
import { isChannelProtected, isProtectedCategory } from "../discord/protection";

/* ================================================================
 * REMEDIATION PLAN GENERATION
 * ================================================================ */

let planCounter = 0;

export function generateRemediationId(): string {
  return `rem_${Date.now().toString(36)}_${++planCounter}`;
}

export function generateRemediationPlan(
  guildId: string,
  drift: DriftEntry,
): RemediationPlan | null {
  const steps = generateSteps(guildId, drift);
  if (steps.length === 0) return null;

  const riskLevel = classifyRemediationRisk(drift, steps);

  return {
    id: generateRemediationId(),
    guildId,
    driftEntry: drift,
    steps,
    riskLevel,
    requiresConfirmation: riskLevel !== "low",
    createdAt: Date.now(),
    expiresAt: Date.now() + 5 * 60 * 1000,
  };
}

function generateSteps(
  guildId: string,
  drift: DriftEntry,
): RemediationStep[] {
  switch (drift.ruleType) {
    case "channel_permission":
      return generatePermissionSteps(guildId, drift);
    case "channel_type":
      return generateTypeSteps(drift);
    case "required_channel":
      return generateMissingChannelSteps(drift);
    case "required_category":
      return generateMissingCategorySteps(drift);
    case "category_protected":
      return generateCategoryProtectionSteps(guildId, drift);
    case "channel_restricted":
      return generateRestrictedSteps(guildId, drift);
    default:
      return [];
  }
}

function generatePermissionSteps(
  guildId: string,
  drift: DriftEntry,
): RemediationStep[] {
  if (!drift.channelId) return [];

  // Check protection — cannot remediate protected channels
  if (isChannelProtected(guildId, drift.channelId)) return [];

  const isAllow = drift.actual === "allowed" || drift.actual === "neutral";
  const action: RemediationAction = isAllow ? "remove_permission" : "add_permission";
  const permission = extractPermissionFromDrift(drift);

  return [{
    action,
    targetId: drift.channelId,
    targetName: `channel ${drift.channelId}`,
    description: `Fix permission drift: ${drift.expected} (was ${drift.actual})`,
    toolName: "manage_channel_permissions",
    toolArgs: {
      channelId: drift.channelId,
      roleId: "role_everyone",
      permission,
      allow: !isAllow,
    },
    payload: {
      channelId: drift.channelId,
      permission,
      effect: drift.expected,
    },
  }];
}

function generateTypeSteps(drift: DriftEntry): RemediationStep[] {
  if (!drift.channelId) return [];

  // Type changes require channel recreation — too dangerous for automated remediation
  return [{
    action: "rename_channel",
    targetId: drift.channelId,
    targetName: `channel ${drift.channelId}`,
    description: `Channel type mismatch: expected ${drift.expected}, found ${drift.actual}. Manual intervention required.`,
    toolName: "rename_channel",
    toolArgs: { channelId: drift.channelId, newName: "manual_rename_required" },
    payload: {
      channelId: drift.channelId,
      note: "Channel type cannot be changed programmatically. Recreate the channel.",
    },
  }];
}

function generateMissingChannelSteps(drift: DriftEntry): RemediationStep[] {
  const channelName = drift.expected === "present" ? drift.actual : "unknown";

  return [{
    action: "create_channel",
    targetId: "",
    targetName: channelName,
    description: `Create missing channel: #${channelName}`,
    toolName: "create_channel",
    toolArgs: { name: channelName, type: "text" },
    payload: {
      name: channelName,
      type: "text",
    },
  }];
}

function generateMissingCategorySteps(drift: DriftEntry): RemediationStep[] {
  const catName = drift.expected === "present" ? drift.actual : "unknown";

  return [{
    action: "create_category",
    targetId: "",
    targetName: catName,
    description: `Create missing category: ${catName}`,
    toolName: "create_category",
    toolArgs: { name: catName },
    payload: {
      name: catName,
      type: "category",
    },
  }];
}

function generateCategoryProtectionSteps(
  guildId: string,
  drift: DriftEntry,
): RemediationStep[] {
  if (!drift.categoryName) return [];

  if (isProtectedCategory(guildId, drift.categoryName)) return [];

  return [{
    action: "modify_permissions",
    targetId: drift.categoryName,
    targetName: `category ${drift.categoryName}`,
    description: `Protect category: ${drift.categoryName}`,
    toolName: "protect_category",
    toolArgs: { categoryId: drift.categoryName },
    payload: {
      categoryId: drift.categoryName,
      action: "protect",
    },
  }];
}

function generateRestrictedSteps(
  guildId: string,
  drift: DriftEntry,
): RemediationStep[] {
  if (!drift.channelId) return [];

  if (isChannelProtected(guildId, drift.channelId)) return [];

  return [{
    action: "remove_permission",
    targetId: drift.channelId,
    targetName: `channel ${drift.channelId}`,
    description: `Remove restricted permission: ${drift.actual}`,
    toolName: "manage_channel_permissions",
    toolArgs: {
      channelId: drift.channelId,
      roleId: "role_everyone",
      permission: extractPermissionFromDrift(drift),
      allow: false,
    },
    payload: {
      channelId: drift.channelId,
      permission: extractPermissionFromDrift(drift),
      effect: "deny",
    },
  }];
}

/* ================================================================
 * RISK CLASSIFICATION
 * ================================================================ */

function classifyRemediationRisk(
  drift: DriftEntry,
  steps: RemediationStep[],
): "low" | "medium" | "high" | "critical" {
  // If any step involves protected resources, deny
  for (const step of steps) {
    if (step.action === "modify_permissions") return "critical";
    if (step.action === "delete_channel") return "critical";
  }

  // Drift severity is a good baseline
  const baseSeverity = drift.severity;

  // Escalate based on action type
  for (const step of steps) {
    if (step.action === "remove_permission" || step.action === "add_permission") {
      if (baseSeverity === "low") return "medium";
    }
    if (step.action === "create_channel" || step.action === "create_category") {
      if (baseSeverity === "low") return "medium";
    }
  }

  return baseSeverity === "none" ? "low" : baseSeverity;
}

/* ================================================================
 * HELPERS
 * ================================================================ */

function extractPermissionFromDrift(_drift: DriftEntry): string {
  // The permission name is not stored in DriftEntry; callers should
  // pass it explicitly when generating permission remediation steps.
  return "Unknown";
}
