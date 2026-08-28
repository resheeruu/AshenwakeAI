/* ================================================================
 * U7 GOVERNANCE BARREL
 * ================================================================ */

export {
  createGovernanceTools,
  executeCreateGuildPolicyPlan,
  executeUpdateGuildPolicyPlan,
  executeApplyPolicyTemplatePlan,
} from "./governance-tools";

export type {
  PolicyConfig,
  PolicyRule,
  RuleType,
  ChannelKind,
  PermissionOp,
  PolicyStatus,
  DriftSeverity,
  PolicyViolation,
  PolicyCompliance,
  InspectionResult,
  DriftEntry,
  DriftReport,
  RemediationAction,
  RemediationStep,
  RemediationPlan,
  GovernanceReport,
} from "./policy-schema";

export {
  loadPolicyConfig,
  savePolicyConfig,
  deletePolicyConfig,
  hasPolicy,
  validatePolicyConfig,
  validateRule,
  inspectPolicy,
  matchesPattern,
  generateRuleId,
  type GuildState,
  type ChannelInfo,
} from "./policy-engine";

export {
  isValidTemplate,
  getValidTemplateNames,
  getTemplateDefinition,
  getAllTemplateDefinitions,
  applyTemplate,
  templateHasProhibitedPermissions,
  getProhibitedPermissions,
  type TemplateName,
} from "./policy-templates";

export { detectDrift } from "./drift-detection";
export { generateRemediationPlan, generateRemediationId } from "./remediation";
