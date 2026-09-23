import { getDatabase, safeDbOperation } from "./database";
import { nanoid } from "nanoid";

export interface AutomationRule {
  id: string;
  guildId: string;
  name: string;
  description?: string;
  enabled: boolean;
  triggerType: string;
  triggerConfig: Record<string, unknown>;
  conditions: unknown[];
  actions: unknown[];
  createdBy?: string;
  createdAt: number;
  updatedAt: number;
}

export interface CreateAutomationRuleInput {
  guildId: string;
  name: string;
  description?: string;
  enabled?: boolean;
  triggerType: string;
  triggerConfig?: Record<string, unknown>;
  conditions?: unknown[];
  actions?: unknown[];
  createdBy?: string;
}

function rowToRule(row: any): AutomationRule {
  return {
    id: row.id,
    guildId: row.guild_id,
    name: row.name,
    description: row.description ?? undefined,
    enabled: Boolean(row.enabled),
    triggerType: row.trigger_type,
    triggerConfig: row.trigger_config_json ? JSON.parse(row.trigger_config_json) : {},
    conditions: row.conditions_json ? JSON.parse(row.conditions_json) : [],
    actions: row.actions_json ? JSON.parse(row.actions_json) : [],
    createdBy: row.created_by ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const automationRulesRepo = {
  listByGuild(guildId: string): AutomationRule[] {
    const db = getDatabase();
    return safeDbOperation(() => {
      const rows = db
        .prepare("SELECT * FROM automation_rules WHERE guild_id = ? ORDER BY created_at DESC")
        .all(guildId) as any[];
      return rows.map(rowToRule);
    }, [], `automationRules.listByGuild(${guildId})`);
  },

  getById(id: string): AutomationRule | undefined {
    const db = getDatabase();
    return safeDbOperation(() => {
      const row = db.prepare("SELECT * FROM automation_rules WHERE id = ?").get(id) as any;
      return row ? rowToRule(row) : undefined;
    }, undefined, `automationRules.getById(${id})`);
  },

  create(input: CreateAutomationRuleInput): AutomationRule {
    const db = getDatabase();
    const id = `rule_${nanoid(12)}`;
    const now = Date.now();
    const rule: AutomationRule = {
      id,
      guildId: input.guildId,
      name: input.name,
      description: input.description,
      enabled: input.enabled ?? true,
      triggerType: input.triggerType,
      triggerConfig: input.triggerConfig ?? {},
      conditions: input.conditions ?? [],
      actions: input.actions ?? [],
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
    };

    safeDbOperation(() => {
      db.prepare(`
        INSERT INTO automation_rules
          (id, guild_id, name, description, enabled, trigger_type, trigger_config_json, conditions_json, actions_json, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        rule.id,
        rule.guildId,
        rule.name,
        rule.description ?? null,
        rule.enabled ? 1 : 0,
        rule.triggerType,
        JSON.stringify(rule.triggerConfig),
        JSON.stringify(rule.conditions),
        JSON.stringify(rule.actions),
        rule.createdBy ?? null,
        rule.createdAt,
        rule.updatedAt,
      );
    }, undefined, `automationRules.create(${input.guildId})`);

    return rule;
  },

  update(
    id: string,
    updates: Partial<Pick<AutomationRule, "name" | "description" | "enabled" | "triggerType" | "triggerConfig" | "conditions" | "actions">>,
  ): AutomationRule | undefined {
    const existing = automationRulesRepo.getById(id);
    if (!existing) return undefined;

    const next: AutomationRule = {
      ...existing,
      ...updates,
      updatedAt: Date.now(),
    };

    const db = getDatabase();
    safeDbOperation(() => {
      db.prepare(`
        UPDATE automation_rules
        SET name = ?, description = ?, enabled = ?, trigger_type = ?, trigger_config_json = ?, conditions_json = ?, actions_json = ?, updated_at = ?
        WHERE id = ? AND guild_id = ?
      `).run(
        next.name,
        next.description ?? null,
        next.enabled ? 1 : 0,
        next.triggerType,
        JSON.stringify(next.triggerConfig),
        JSON.stringify(next.conditions),
        JSON.stringify(next.actions),
        next.updatedAt,
        id,
        next.guildId,
      );
    }, undefined, `automationRules.update(${id})`);

    return next;
  },

  delete(guildId: string, ruleId: string): boolean {
    const db = getDatabase();
    return safeDbOperation(() => {
      const result = db
        .prepare("DELETE FROM automation_rules WHERE id = ? AND guild_id = ?")
        .run(ruleId, guildId);
      return result.changes > 0;
    }, false, `automationRules.delete(${guildId}:${ruleId})`);
  },
};
