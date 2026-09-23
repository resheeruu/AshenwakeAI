"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var governance_exports = {};
__export(governance_exports, {
  applyTemplate: () => import_policy_templates.applyTemplate,
  createGovernanceTools: () => import_governance_tools.createGovernanceTools,
  deletePolicyConfig: () => import_policy_engine.deletePolicyConfig,
  detectDrift: () => import_drift_detection.detectDrift,
  executeApplyPolicyTemplatePlan: () => import_governance_tools.executeApplyPolicyTemplatePlan,
  executeCreateGuildPolicyPlan: () => import_governance_tools.executeCreateGuildPolicyPlan,
  executeUpdateGuildPolicyPlan: () => import_governance_tools.executeUpdateGuildPolicyPlan,
  generateRemediationId: () => import_remediation.generateRemediationId,
  generateRemediationPlan: () => import_remediation.generateRemediationPlan,
  generateRuleId: () => import_policy_engine.generateRuleId,
  getAllTemplateDefinitions: () => import_policy_templates.getAllTemplateDefinitions,
  getProhibitedPermissions: () => import_policy_templates.getProhibitedPermissions,
  getTemplateDefinition: () => import_policy_templates.getTemplateDefinition,
  getValidTemplateNames: () => import_policy_templates.getValidTemplateNames,
  hasPolicy: () => import_policy_engine.hasPolicy,
  inspectPolicy: () => import_policy_engine.inspectPolicy,
  isValidTemplate: () => import_policy_templates.isValidTemplate,
  loadPolicyConfig: () => import_policy_engine.loadPolicyConfig,
  matchesPattern: () => import_policy_engine.matchesPattern,
  savePolicyConfig: () => import_policy_engine.savePolicyConfig,
  templateHasProhibitedPermissions: () => import_policy_templates.templateHasProhibitedPermissions,
  validatePolicyConfig: () => import_policy_engine.validatePolicyConfig,
  validateRule: () => import_policy_engine.validateRule
});
module.exports = __toCommonJS(governance_exports);
var import_governance_tools = require("./governance-tools");
var import_policy_engine = require("./policy-engine");
var import_policy_templates = require("./policy-templates");
var import_drift_detection = require("./drift-detection");
var import_remediation = require("./remediation");
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  applyTemplate,
  createGovernanceTools,
  deletePolicyConfig,
  detectDrift,
  executeApplyPolicyTemplatePlan,
  executeCreateGuildPolicyPlan,
  executeUpdateGuildPolicyPlan,
  generateRemediationId,
  generateRemediationPlan,
  generateRuleId,
  getAllTemplateDefinitions,
  getProhibitedPermissions,
  getTemplateDefinition,
  getValidTemplateNames,
  hasPolicy,
  inspectPolicy,
  isValidTemplate,
  loadPolicyConfig,
  matchesPattern,
  savePolicyConfig,
  templateHasProhibitedPermissions,
  validatePolicyConfig,
  validateRule
});
