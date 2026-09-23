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
var cases_exports = {};
__export(cases_exports, {
  CaseManager: () => CaseManager
});
module.exports = __toCommonJS(cases_exports);
var import_data_store = require("../core/data-store");
var import_logger = require("../logger");
var import_audit = require("../security/audit");
const CASES_FILE = "mod-cases.json";
class CaseManager {
  store;
  constructor() {
    this.store = (0, import_data_store.readJSON)(CASES_FILE, { cases: {}, nextId: {} });
  }
  save() {
    (0, import_data_store.writeJSON)(CASES_FILE, this.store);
  }
  createCase(params) {
    const { guildId } = params;
    this.store.nextId[guildId] = (this.store.nextId[guildId] || 0) + 1;
    const caseNum = this.store.nextId[guildId];
    const id = `${guildId}-${caseNum}`;
    const modCase = {
      id,
      ...params,
      timestamp: Date.now(),
      active: true
    };
    this.store.cases[id] = modCase;
    this.save();
    (0, import_audit.recordAudit)({
      who: params.moderatorId,
      what: `Created mod case #${caseNum}: ${params.action} for ${params.userId}`,
      where: "moderation",
      guildId,
      result: "success",
      details: params.reason
    });
    import_logger.logger.info(`\u{1F4CB} Mod case #${caseNum} created in ${guildId}: ${params.action} for ${params.userId}`);
    return modCase;
  }
  getCase(id) {
    return this.store.cases[id];
  }
  getGuildCases(guildId, limit = 50) {
    return Object.values(this.store.cases).filter((c) => c.guildId === guildId).sort((a, b) => b.timestamp - a.timestamp).slice(0, limit);
  }
  getUserCases(guildId, userId, limit = 20) {
    return Object.values(this.store.cases).filter((c) => c.guildId === guildId && c.userId === userId).sort((a, b) => b.timestamp - a.timestamp).slice(0, limit);
  }
  getActiveWarnings(guildId, userId) {
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1e3;
    return Object.values(this.store.cases).filter(
      (c) => c.guildId === guildId && c.userId === userId && c.action === "warn" && c.active && c.timestamp > thirtyDaysAgo
    );
  }
  deactivateCase(id) {
    const modCase = this.store.cases[id];
    if (!modCase) return false;
    modCase.active = false;
    this.save();
    return true;
  }
  getStats(guildId) {
    const guildCases = this.getGuildCases(guildId, 1e3);
    const byAction = {};
    for (const c of guildCases) {
      byAction[c.action] = (byAction[c.action] || 0) + 1;
    }
    return {
      total: guildCases.length,
      active: guildCases.filter((c) => c.active).length,
      byAction
    };
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  CaseManager
});
