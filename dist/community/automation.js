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
var automation_exports = {};
__export(automation_exports, {
  createAutomationRule: () => createAutomationRule,
  deleteAutomationRule: () => deleteAutomationRule,
  getAutomationRules: () => getAutomationRules,
  updateAutomationRule: () => updateAutomationRule
});
module.exports = __toCommonJS(automation_exports);
var import_automation_rules_repo = require("../database/automation-rules-repo");
var import_audit = require("../security/audit");
var import_logger = require("../logger");
function getAutomationRules(guildId) {
  return import_automation_rules_repo.automationRulesRepo.listByGuild(guildId);
}
function createAutomationRule(input, actorUserId, actorUserName) {
  const rule = import_automation_rules_repo.automationRulesRepo.create(input);
  (0, import_audit.recordAudit)({
    who: actorUserId,
    whoName: actorUserName,
    what: `Created automation rule: ${rule.name} (${rule.id})`,
    where: "automation",
    guildId: rule.guildId,
    result: "success"
  });
  import_logger.logger.info(`\u2699\uFE0F Automation rule created: ${rule.id} for guild ${rule.guildId} by ${actorUserName}`);
  return rule;
}
function updateAutomationRule(guildId, ruleId, updates, actorUserId, actorUserName) {
  const existing = import_automation_rules_repo.automationRulesRepo.getById(ruleId);
  if (!existing || existing.guildId !== guildId) return void 0;
  const rule = import_automation_rules_repo.automationRulesRepo.update(ruleId, updates);
  if (rule) {
    (0, import_audit.recordAudit)({
      who: actorUserId,
      whoName: actorUserName,
      what: `Updated automation rule: ${rule.name} (${rule.id})`,
      where: "automation",
      guildId,
      result: "success"
    });
  }
  return rule;
}
function deleteAutomationRule(guildId, ruleId, actorUserId, actorUserName) {
  const existing = import_automation_rules_repo.automationRulesRepo.getById(ruleId);
  if (!existing || existing.guildId !== guildId) return false;
  const ok = import_automation_rules_repo.automationRulesRepo.delete(guildId, ruleId);
  if (ok) {
    (0, import_audit.recordAudit)({
      who: actorUserId,
      whoName: actorUserName,
      what: `Deleted automation rule: ${existing.name} (${ruleId})`,
      where: "automation",
      guildId,
      result: "success"
    });
    import_logger.logger.info(`\u2699\uFE0F Automation rule deleted: ${ruleId} from guild ${guildId} by ${actorUserName}`);
  }
  return ok;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  createAutomationRule,
  deleteAutomationRule,
  getAutomationRules,
  updateAutomationRule
});
