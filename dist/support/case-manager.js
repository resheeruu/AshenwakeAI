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
var case_manager_exports = {};
__export(case_manager_exports, {
  SupportCaseManager: () => SupportCaseManager,
  getSupportCaseManager: () => getSupportCaseManager
});
module.exports = __toCommonJS(case_manager_exports);
var import_database = require("../database/database");
var import_logger = require("../logger");
var import_audit = require("../security/audit");
var import_types = require("./types");
class SupportCaseManager {
  generateCaseId(guildId, type) {
    const db = (0, import_database.getDatabase)();
    const prefix = type === "support" ? "T" : type === "report" ? "R" : "A";
    const row = db.prepare(
      "SELECT COUNT(*) as cnt FROM support_cases WHERE guild_id = ? AND type = ?"
    ).get(guildId, type);
    const num = (row?.cnt ?? 0) + 1;
    const rand = Math.random().toString(36).slice(2, 6);
    return `${prefix}-${guildId.slice(-4)}-${String(num).padStart(4, "0")}-${rand}`;
  }
  createCase(params) {
    const now = Date.now();
    return (0, import_database.safeDbOperation)(() => {
      const db = (0, import_database.getDatabase)();
      if (params.idempotencyKey) {
        const existing = db.prepare(
          "SELECT * FROM support_cases WHERE idempotency_key = ?"
        ).get(params.idempotencyKey);
        if (existing) {
          import_logger.logger.info(`\u{1F3AB} Idempotent case creation: returning existing case ${existing.id} for key ${params.idempotencyKey}`);
          return this.rowToCase(existing);
        }
      }
      const id = this.generateCaseId(params.guildId, params.type);
      db.prepare(`
        INSERT INTO support_cases (id, guild_id, channel_id, type, status, creator_id, subject_user_id, summary, metadata_json, idempotency_key, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        params.guildId,
        params.channelId,
        params.type,
        params.creatorId,
        params.subjectUserId ?? null,
        params.summary ?? null,
        params.metadata ? JSON.stringify(params.metadata) : null,
        params.idempotencyKey ?? null,
        now,
        now
      );
      (0, import_audit.recordAudit)({
        who: params.creatorId,
        what: `Created support case ${id} (${params.type})`,
        where: "support",
        guildId: params.guildId,
        result: "success"
      });
      import_logger.logger.info(`\u{1F3AB} Support case ${id} created in ${params.guildId} by ${params.creatorId} (${params.type})`);
      return this.getCase(id);
    }, null, `createCase(${params.guildId})`);
  }
  getCase(id) {
    return (0, import_database.safeDbOperation)(() => {
      const db = (0, import_database.getDatabase)();
      const row = db.prepare("SELECT * FROM support_cases WHERE id = ?").get(id);
      if (!row) return null;
      return this.rowToCase(row);
    }, null, `getCase(${id})`);
  }
  getGuildCases(guildId, status, type, limit = 50) {
    return (0, import_database.safeDbOperation)(() => {
      const db = (0, import_database.getDatabase)();
      let query = "SELECT * FROM support_cases WHERE guild_id = ?";
      const params = [guildId];
      if (status) {
        query += " AND status = ?";
        params.push(status);
      }
      if (type) {
        query += " AND type = ?";
        params.push(type);
      }
      query += " ORDER BY created_at DESC LIMIT ?";
      params.push(limit);
      const rows = db.prepare(query).all(...params);
      return rows.map((r) => this.rowToCase(r));
    }, [], `getGuildCases(${guildId})`);
  }
  getUserCases(guildId, userId, limit = 20) {
    return (0, import_database.safeDbOperation)(() => {
      const db = (0, import_database.getDatabase)();
      const rows = db.prepare(
        "SELECT * FROM support_cases WHERE guild_id = ? AND creator_id = ? ORDER BY created_at DESC LIMIT ?"
      ).all(guildId, userId, limit);
      return rows.map((r) => this.rowToCase(r));
    }, [], `getUserCases(${guildId}:${userId})`);
  }
  getChannelCases(channelId) {
    return (0, import_database.safeDbOperation)(() => {
      const db = (0, import_database.getDatabase)();
      const rows = db.prepare(
        "SELECT * FROM support_cases WHERE channel_id = ? ORDER BY created_at DESC"
      ).all(channelId);
      return rows.map((r) => this.rowToCase(r));
    }, [], `getChannelCases(${channelId})`);
  }
  transitionCase(id, newStatus, actorId) {
    return (0, import_database.safeDbOperation)(() => {
      const db = (0, import_database.getDatabase)();
      const row = db.prepare("SELECT * FROM support_cases WHERE id = ?").get(id);
      if (!row) return null;
      const current = row.status;
      const currentVersion = row.version ?? 1;
      if (!(0, import_types.canTransition)(current, newStatus)) {
        import_logger.logger.warn(`\u26A0\uFE0F Invalid case transition: ${current} \u2192 ${newStatus} for case ${id}`);
        return null;
      }
      const now = Date.now();
      const closedAt = newStatus === "closed" ? now : null;
      const result = db.prepare(`
        UPDATE support_cases
        SET status = ?, updated_at = ?, closed_at = COALESCE(?, closed_at), version = version + 1
        WHERE id = ? AND version = ?
      `).run(newStatus, now, closedAt, id, currentVersion);
      if (result.changes === 0) {
        import_logger.logger.warn(`\u26A0\uFE0F Stale transition rejected for case ${id}: expected version ${currentVersion}`);
        return null;
      }
      (0, import_audit.recordAudit)({
        who: actorId,
        what: `Case ${id} status: ${current} \u2192 ${newStatus}`,
        where: "support",
        guildId: row.guild_id,
        result: "success"
      });
      import_logger.logger.info(`\u{1F4CB} Case ${id} status: ${current} \u2192 ${newStatus} by ${actorId}`);
      return this.getCase(id);
    }, null, `transitionCase(${id})`);
  }
  assignCase(id, staffId, assignedBy) {
    return (0, import_database.safeDbOperation)(() => {
      const db = (0, import_database.getDatabase)();
      const now = Date.now();
      const result = db.prepare(`
        UPDATE support_cases SET assigned_staff_id = ?, updated_at = ? WHERE id = ?
      `).run(staffId, now, id);
      if (result.changes === 0) return null;
      (0, import_audit.recordAudit)({
        who: assignedBy,
        what: `Assigned case ${id} to staff ${staffId}`,
        where: "support",
        result: "success"
      });
      import_logger.logger.info(`\u{1F464} Case ${id} assigned to ${staffId} by ${assignedBy}`);
      return this.getCase(id);
    }, null, `assignCase(${id})`);
  }
  updateSummary(id, summary) {
    return (0, import_database.safeDbOperation)(() => {
      const db = (0, import_database.getDatabase)();
      const now = Date.now();
      db.prepare("UPDATE support_cases SET summary = ?, updated_at = ? WHERE id = ?").run(summary, now, id);
      return this.getCase(id);
    }, null, `updateSummary(${id})`);
  }
  updateAnalysis(id, analysis) {
    return (0, import_database.safeDbOperation)(() => {
      const db = (0, import_database.getDatabase)();
      const now = Date.now();
      db.prepare("UPDATE support_cases SET ai_analysis_json = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(analysis), now, id);
      (0, import_audit.recordAudit)({
        who: "ai",
        what: `AI analysis created for case ${id}`,
        where: "support",
        result: "success"
      });
      return this.getCase(id);
    }, null, `updateAnalysis(${id})`);
  }
  addMessage(caseId, authorId, content, isAi = false, discordMessageId) {
    return (0, import_database.safeDbOperation)(() => {
      const db = (0, import_database.getDatabase)();
      if (discordMessageId) {
        const existing = db.prepare(
          "SELECT * FROM support_case_messages WHERE discord_message_id = ?"
        ).get(discordMessageId);
        if (existing) {
          return {
            id: existing.id,
            caseId: existing.case_id,
            authorId: existing.author_id,
            content: existing.content,
            isAi: existing.is_ai === 1,
            createdAt: existing.created_at
          };
        }
      }
      const id = `msg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      const now = Date.now();
      db.prepare(`
        INSERT INTO support_case_messages (id, case_id, author_id, content, is_ai, discord_message_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(id, caseId, authorId, content, isAi ? 1 : 0, discordMessageId ?? null, now);
      db.prepare("UPDATE support_cases SET updated_at = ? WHERE id = ?").run(now, caseId);
      return { id, caseId, authorId, content, isAi, createdAt: now };
    }, null, `addMessage(${caseId})`);
  }
  getMessages(caseId, limit = 100) {
    return (0, import_database.safeDbOperation)(() => {
      const db = (0, import_database.getDatabase)();
      const rows = db.prepare(
        "SELECT * FROM support_case_messages WHERE case_id = ? ORDER BY created_at ASC LIMIT ?"
      ).all(caseId, limit);
      return rows.map((r) => ({
        id: r.id,
        caseId: r.case_id,
        authorId: r.author_id,
        content: r.content,
        isAi: r.is_ai === 1,
        createdAt: r.created_at
      }));
    }, [], `getMessages(${caseId})`);
  }
  addEvidence(params) {
    return (0, import_database.safeDbOperation)(() => {
      const db = (0, import_database.getDatabase)();
      const existing = db.prepare(
        "SELECT * FROM support_case_evidence WHERE case_id = ? AND message_id = ?"
      ).get(params.caseId, params.messageId);
      if (existing) {
        return {
          id: existing.id,
          caseId: existing.case_id,
          messageId: existing.message_id,
          authorId: existing.author_id,
          authorName: existing.author_name,
          content: existing.content,
          channelId: existing.channel_id,
          channelName: existing.channel_name,
          messageUrl: existing.message_url,
          attachmentUrls: existing.attachment_urls_json ? JSON.parse(existing.attachment_urls_json) : [],
          collectedBy: existing.collected_by,
          createdAt: existing.created_at
        };
      }
      const id = `ev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      const now = Date.now();
      db.prepare(`
        INSERT INTO support_case_evidence (id, case_id, message_id, author_id, author_name, content, channel_id, channel_name, message_url, attachment_urls_json, collected_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        params.caseId,
        params.messageId,
        params.authorId,
        params.authorName ?? null,
        params.content ?? null,
        params.channelId ?? null,
        params.channelName ?? null,
        params.messageUrl ?? null,
        params.attachmentUrls ? JSON.stringify(params.attachmentUrls) : null,
        params.collectedBy,
        now
      );
      return {
        id,
        caseId: params.caseId,
        messageId: params.messageId,
        authorId: params.authorId,
        authorName: params.authorName,
        content: params.content,
        channelId: params.channelId,
        channelName: params.channelName,
        messageUrl: params.messageUrl,
        attachmentUrls: params.attachmentUrls,
        collectedBy: params.collectedBy,
        createdAt: now
      };
    }, null, `addEvidence(${params.caseId})`);
  }
  getEvidence(caseId) {
    return (0, import_database.safeDbOperation)(() => {
      const db = (0, import_database.getDatabase)();
      const rows = db.prepare(
        "SELECT * FROM support_case_evidence WHERE case_id = ? ORDER BY created_at ASC"
      ).all(caseId);
      return rows.map((r) => ({
        id: r.id,
        caseId: r.case_id,
        messageId: r.message_id,
        authorId: r.author_id,
        authorName: r.author_name,
        content: r.content,
        channelId: r.channel_id,
        channelName: r.channel_name,
        messageUrl: r.message_url,
        attachmentUrls: r.attachment_urls_json ? JSON.parse(r.attachment_urls_json) : [],
        collectedBy: r.collected_by,
        createdAt: r.created_at
      }));
    }, [], `getEvidence(${caseId})`);
  }
  /**
   * Compound operation: create a case and add the initial user message atomically.
   * If the message insert fails, the case is still created (partial failure is recorded).
   * Returns both the case and the message (message may be null if insert failed).
   */
  createCaseWithMessage(params) {
    const aiCase = this.createCase(params);
    if (!aiCase) return { case: null, message: null };
    let message = null;
    if (params.messageContent) {
      message = this.addMessage(
        aiCase.id,
        params.creatorId,
        params.messageContent,
        false,
        params.discordMessageId
      );
    }
    return { case: aiCase, message };
  }
  getStats(guildId) {
    return (0, import_database.safeDbOperation)(() => {
      const db = (0, import_database.getDatabase)();
      const total = db.prepare(
        "SELECT COUNT(*) as cnt FROM support_cases WHERE guild_id = ?"
      ).get(guildId)?.cnt ?? 0;
      const open = db.prepare(
        "SELECT COUNT(*) as cnt FROM support_cases WHERE guild_id = ? AND status NOT IN ('resolved', 'closed')"
      ).get(guildId)?.cnt ?? 0;
      const byTypeRows = db.prepare(
        "SELECT type, COUNT(*) as cnt FROM support_cases WHERE guild_id = ? GROUP BY type"
      ).all(guildId);
      const byType = {};
      for (const r of byTypeRows) byType[r.type] = r.cnt;
      const byStatusRows = db.prepare(
        "SELECT status, COUNT(*) as cnt FROM support_cases WHERE guild_id = ? GROUP BY status"
      ).all(guildId);
      const byStatus = {};
      for (const r of byStatusRows) byStatus[r.status] = r.cnt;
      return { total, open, byType, byStatus };
    }, { total: 0, open: 0, byType: {}, byStatus: {} }, `getStats(${guildId})`);
  }
  rowToCase(row) {
    return {
      id: row.id,
      guildId: row.guild_id,
      channelId: row.channel_id,
      type: row.type,
      status: row.status,
      creatorId: row.creator_id,
      subjectUserId: row.subject_user_id ?? void 0,
      assignedStaffId: row.assigned_staff_id ?? void 0,
      summary: row.summary ?? void 0,
      aiAnalysis: row.ai_analysis_json ? JSON.parse(row.ai_analysis_json) : void 0,
      metadata: row.metadata_json ? JSON.parse(row.metadata_json) : void 0,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      closedAt: row.closed_at ?? void 0,
      version: row.version ?? 1
    };
  }
}
let _instance = null;
function getSupportCaseManager() {
  if (!_instance) _instance = new SupportCaseManager();
  return _instance;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  SupportCaseManager,
  getSupportCaseManager
});
