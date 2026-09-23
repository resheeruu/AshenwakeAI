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
var automation_rules_repo_exports = {};
__export(automation_rules_repo_exports, {
  automationRulesRepo: () => automationRulesRepo
});
module.exports = __toCommonJS(automation_rules_repo_exports);
var import_database = require("./database");
var import_nanoid = require("nanoid");
function rowToRule(row) {
  return {
    id: row.id,
    guildId: row.guild_id,
    name: row.name,
    description: row.description ?? void 0,
    enabled: Boolean(row.enabled),
    triggerType: row.trigger_type,
    triggerConfig: row.trigger_config_json ? JSON.parse(row.trigger_config_json) : {},
    conditions: row.conditions_json ? JSON.parse(row.conditions_json) : [],
    actions: row.actions_json ? JSON.parse(row.actions_json) : [],
    createdBy: row.created_by ?? void 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
const automationRulesRepo = {
  listByGuild(guildId) {
    const db = (0, import_database.getDatabase)();
    return (0, import_database.safeDbOperation)(() => {
      const rows = db.prepare("SELECT * FROM automation_rules WHERE guild_id = ? ORDER BY created_at DESC").all(guildId);
      return rows.map(rowToRule);
    }, [], `automationRules.listByGuild(${guildId})`);
  },
  getById(id) {
    const db = (0, import_database.getDatabase)();
    return (0, import_database.safeDbOperation)(() => {
      const row = db.prepare("SELECT * FROM automation_rules WHERE id = ?").get(id);
      return row ? rowToRule(row) : void 0;
    }, void 0, `automationRules.getById(${id})`);
  },
  create(input) {
    const db = (0, import_database.getDatabase)();
    const id = `rule_${(0, import_nanoid.nanoid)(12)}`;
    const now = Date.now();
    const rule = {
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
      updatedAt: now
    };
    (0, import_database.safeDbOperation)(() => {
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
        rule.updatedAt
      );
    }, void 0, `automationRules.create(${input.guildId})`);
    return rule;
  },
  update(id, updates) {
    const existing = automationRulesRepo.getById(id);
    if (!existing) return void 0;
    const next = {
      ...existing,
      ...updates,
      updatedAt: Date.now()
    };
    const db = (0, import_database.getDatabase)();
    (0, import_database.safeDbOperation)(() => {
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
        next.guildId
      );
    }, void 0, `automationRules.update(${id})`);
    return next;
  },
  delete(guildId, ruleId) {
    const db = (0, import_database.getDatabase)();
    return (0, import_database.safeDbOperation)(() => {
      const result = db.prepare("DELETE FROM automation_rules WHERE id = ? AND guild_id = ?").run(ruleId, guildId);
      return result.changes > 0;
    }, false, `automationRules.delete(${guildId}:${ruleId})`);
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  automationRulesRepo
});
