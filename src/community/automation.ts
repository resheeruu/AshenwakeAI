import { automationRulesRepo, type AutomationRule, type CreateAutomationRuleInput } from "../database/automation-rules-repo";
import { recordAudit } from "../security/audit";
import { logger } from "../logger";

export type { AutomationRule, CreateAutomationRuleInput };

export function getAutomationRules(guildId: string): AutomationRule[] {
  return automationRulesRepo.listByGuild(guildId);
}

export function createAutomationRule(
  input: CreateAutomationRuleInput,
  actorUserId: string,
  actorUserName: string,
): AutomationRule {
  const rule = automationRulesRepo.create(input);
  recordAudit({
    who: actorUserId,
    whoName: actorUserName,
    what: `Created automation rule: ${rule.name} (${rule.id})`,
    where: "automation",
    guildId: rule.guildId,
    result: "success",
  });
  logger.info(`⚙️ Automation rule created: ${rule.id} for guild ${rule.guildId} by ${actorUserName}`);
  return rule;
}

export function updateAutomationRule(
  guildId: string,
  ruleId: string,
  updates: Parameters<typeof automationRulesRepo.update>[1],
  actorUserId: string,
  actorUserName: string,
): AutomationRule | undefined {
  const existing = automationRulesRepo.getById(ruleId);
  if (!existing || existing.guildId !== guildId) return undefined;
  const rule = automationRulesRepo.update(ruleId, updates);
  if (rule) {
    recordAudit({
      who: actorUserId,
      whoName: actorUserName,
      what: `Updated automation rule: ${rule.name} (${rule.id})`,
      where: "automation",
      guildId,
      result: "success",
    });
  }
  return rule;
}

export function deleteAutomationRule(
  guildId: string,
  ruleId: string,
  actorUserId: string,
  actorUserName: string,
): boolean {
  const existing = automationRulesRepo.getById(ruleId);
  if (!existing || existing.guildId !== guildId) return false;
  const ok = automationRulesRepo.delete(guildId, ruleId);
  if (ok) {
    recordAudit({
      who: actorUserId,
      whoName: actorUserName,
      what: `Deleted automation rule: ${existing.name} (${ruleId})`,
      where: "automation",
      guildId,
      result: "success",
    });
    logger.info(`⚙️ Automation rule deleted: ${ruleId} from guild ${guildId} by ${actorUserName}`);
  }
  return ok;
}
