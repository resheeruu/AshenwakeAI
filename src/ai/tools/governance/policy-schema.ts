/* ================================================================
 * U7 POLICY SCHEMA
 *
 * Defines the types and interfaces for the Guild Governance Policy
 * Engine. All types are guild-isolated.
 * ================================================================ */

/* ================================================================
 * RULE TYPES
 * ================================================================ */

export type RuleType =
  | "channel_type"
  | "channel_permission"
  | "category_protected"
  | "required_channel"
  | "required_category"
  | "channel_restricted";

export type ChannelKind =
  | "text"
  | "announcement"
  | "voice"
  | "stage"
  | "forum"
  | "category"
  | "any";

export type PermissionOp = "allow" | "deny" | "must_allow" | "must_deny";

export type PolicyStatus = "compliant" | "violation" | "missing" | "unexpected" | "conflict";

export type DriftSeverity = "none" | "low" | "medium" | "high" | "critical";

/* ================================================================
 * POLICY RULE
 * ================================================================ */

export interface PolicyRule {
  id: string;
  type: RuleType;
  enabled: boolean;
  description: string;

  /** Channel name pattern (glob-style: "#moderation", "#*", "#staff-*") */
  channelPattern?: string;

  /** Category name pattern */
  categoryPattern?: string;

  /** For channel_type rules */
  expectedType?: ChannelKind;

  /** For channel_permission rules */
  permission?: string;
  permissionOp?: PermissionOp;

  /** For required_channel / required_category rules */
  requiredName?: string;

  /** Risk level if violated */
  riskIfViolated?: "low" | "medium" | "high" | "critical";
}

/* ================================================================
 * POLICY CONFIGURATION
 * ================================================================ */

export interface PolicyConfig {
  /** Unique policy identifier */
  id: string;

  /** Guild this policy belongs to (mandatory) */
  guildId: string;

  /** Human-readable policy name */
  name: string;

  /** Policy description */
  description: string;

  /** Template this policy was created from (if any) */
  template?: string;

  /** Active policy rules */
  rules: PolicyRule[];

  /** Protected channel IDs (mirrored from GuildAIConfig for reference) */
  protectedChannels: string[];

  /** Protected category IDs (mirrored from GuildAIConfig for reference) */
  protectedCategories: string[];

  /** Channels explicitly exempt from policy evaluation */
  exemptChannels: string[];

  /** Categories explicitly exempt from policy evaluation */
  exemptCategories: string[];

  /** Drift detection settings */
  driftDetection: {
    enabled: boolean;
    /** How often to check (ms) — informational only, not enforced */
    intervalMs: number;
  };

  /** Config version for future migration */
  version: number;

  createdAt: number;
  updatedAt: number;
}

/* ================================================================
 * INSPECTION RESULTS
 * ================================================================ */

export interface PolicyViolation {
  ruleId: string;
  ruleType: RuleType;
  severity: "low" | "medium" | "high" | "critical";
  channelId?: string;
  categoryName?: string;
  message: string;
  expected?: string;
  actual?: string;
}

export interface PolicyCompliance {
  ruleId: string;
  ruleType: RuleType;
  channelId?: string;
  categoryName?: string;
  message: string;
}

export interface InspectionResult {
  policyId: string;
  guildId: string;
  policyName: string;
  timestamp: number;
  status: PolicyStatus;
  violations: PolicyViolation[];
  compliant: PolicyCompliance[];
  protectedResources: { channels: string[]; categories: string[] };
  totalRulesEvaluated: number;
  totalViolations: number;
  criticalViolations: number;
}

/* ================================================================
 * DRIFT DETECTION
 * ================================================================ */

export interface DriftEntry {
  ruleId: string;
  ruleType: RuleType;
  channelId?: string;
  categoryName?: string;
  expected: string;
  actual: string;
  severity: DriftSeverity;
  detectedAt: number;
}

export interface DriftReport {
  policyId: string;
  guildId: string;
  timestamp: number;
  drift: DriftEntry[];
  totalDrifts: number;
  status: "NO_DRIFT" | "DRIFT_DETECTED";
}

/* ================================================================
 * REMEDIATION
 * ================================================================ */

export type RemediationAction =
  | "remove_permission"
  | "add_permission"
  | "rename_channel"
  | "create_channel"
  | "create_category"
  | "delete_channel"
  | "modify_permissions";

export interface RemediationStep {
  action: RemediationAction;
  targetId: string;
  targetName: string;
  description: string;
  /** The existing U5/U6 tool that can perform this action */
  toolName: string;
  /** Arguments to pass to the tool */
  toolArgs: Record<string, unknown>;
  /** Discord API payload for the action (informational) */
  payload: Record<string, unknown>;
}

export interface RemediationPlan {
  id: string;
  guildId: string;
  driftEntry: DriftEntry;
  steps: RemediationStep[];
  riskLevel: "low" | "medium" | "high" | "critical";
  requiresConfirmation: boolean;
  createdAt: number;
  expiresAt: number;
}

/* ================================================================
 * GOVERNANCE REPORT
 * ================================================================ */

export interface GovernanceReport {
  policyId: string;
  policyName: string;
  guildId: string;
  timestamp: number;
  status: PolicyStatus;
  summary: {
    totalRules: number;
    violations: number;
    criticalViolations: number;
    compliant: number;
    protectedResources: number;
    drifts: number;
  };
  violations: PolicyViolation[];
  drifts: DriftEntry[];
  protectedResources: { channels: string[]; categories: string[] };
}
