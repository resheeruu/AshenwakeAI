import { getDatabase, safeDbOperation } from "../database/database";
import { logger } from "../logger";
import { recordAudit } from "../security/audit";
import type {
  AiCase,
  CaseType,
  CaseStatus,
  CaseMessage,
  CaseEvidence,
  CaseAnalysis,
} from "./types";
import { canTransition, VALID_TRANSITIONS } from "./types";

export class SupportCaseManager {
  private generateCaseId(guildId: string, type: CaseType): string {
    const db = getDatabase();
    const prefix = type === "support" ? "T" : type === "report" ? "R" : "A";
    const row = db.prepare(
      "SELECT COUNT(*) as cnt FROM support_cases WHERE guild_id = ? AND type = ?"
    ).get(guildId, type) as any;
    const num = (row?.cnt ?? 0) + 1;
    const rand = Math.random().toString(36).slice(2, 6);
    return `${prefix}-${guildId.slice(-4)}-${String(num).padStart(4, "0")}-${rand}`;
  }

  createCase(params: {
    guildId: string;
    channelId: string;
    type: CaseType;
    creatorId: string;
    subjectUserId?: string;
    summary?: string;
    metadata?: Record<string, unknown>;
  }): AiCase | null {
    const id = this.generateCaseId(params.guildId, params.type);
    const now = Date.now();

    return safeDbOperation(() => {
      const db = getDatabase();
      db.prepare(`
        INSERT INTO support_cases (id, guild_id, channel_id, type, status, creator_id, subject_user_id, summary, metadata_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        params.guildId,
        params.channelId,
        params.type,
        params.creatorId,
        params.subjectUserId ?? null,
        params.summary ?? null,
        params.metadata ? JSON.stringify(params.metadata) : null,
        now,
        now
      );

      recordAudit({
        who: params.creatorId,
        what: `Created support case ${id} (${params.type})`,
        where: "support",
        guildId: params.guildId,
        result: "success",
      });

      logger.info(`🎫 Support case ${id} created in ${params.guildId} by ${params.creatorId} (${params.type})`);

      return this.getCase(id)!;
    }, null, `createCase(${params.guildId})`);
  }

  getCase(id: string): AiCase | null {
    return safeDbOperation(() => {
      const db = getDatabase();
      const row = db.prepare("SELECT * FROM support_cases WHERE id = ?").get(id) as any;
      if (!row) return null;
      return this.rowToCase(row);
    }, null, `getCase(${id})`);
  }

  getGuildCases(guildId: string, status?: CaseStatus, type?: CaseType, limit = 50): AiCase[] {
    return safeDbOperation(() => {
      const db = getDatabase();
      let query = "SELECT * FROM support_cases WHERE guild_id = ?";
      const params: any[] = [guildId];

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

      const rows = db.prepare(query).all(...params) as any[];
      return rows.map((r) => this.rowToCase(r));
    }, [], `getGuildCases(${guildId})`);
  }

  getUserCases(guildId: string, userId: string, limit = 20): AiCase[] {
    return safeDbOperation(() => {
      const db = getDatabase();
      const rows = db.prepare(
        "SELECT * FROM support_cases WHERE guild_id = ? AND creator_id = ? ORDER BY created_at DESC LIMIT ?"
      ).all(guildId, userId, limit) as any[];
      return rows.map((r) => this.rowToCase(r));
    }, [], `getUserCases(${guildId}:${userId})`);
  }

  getChannelCases(channelId: string): AiCase[] {
    return safeDbOperation(() => {
      const db = getDatabase();
      const rows = db.prepare(
        "SELECT * FROM support_cases WHERE channel_id = ? ORDER BY created_at DESC"
      ).all(channelId) as any[];
      return rows.map((r) => this.rowToCase(r));
    }, [], `getChannelCases(${channelId})`);
  }

  transitionCase(id: string, newStatus: CaseStatus, actorId: string): AiCase | null {
    return safeDbOperation(() => {
      const db = getDatabase();
      const row = db.prepare("SELECT * FROM support_cases WHERE id = ?").get(id) as any;
      if (!row) return null;

      const current = row.status as CaseStatus;
      if (!canTransition(current, newStatus)) {
        logger.warn(`⚠️ Invalid case transition: ${current} → ${newStatus} for case ${id}`);
        return null;
      }

      const now = Date.now();
      const closedAt = newStatus === "closed" ? now : null;

      db.prepare(`
        UPDATE support_cases SET status = ?, updated_at = ?, closed_at = COALESCE(?, closed_at)
        WHERE id = ?
      `).run(newStatus, now, closedAt, id);

      recordAudit({
        who: actorId,
        what: `Case ${id} status: ${current} → ${newStatus}`,
        where: "support",
        guildId: row.guild_id,
        result: "success",
      });

      logger.info(`📋 Case ${id} status: ${current} → ${newStatus} by ${actorId}`);

      return this.getCase(id);
    }, null, `transitionCase(${id})`);
  }

  assignCase(id: string, staffId: string, assignedBy: string): AiCase | null {
    return safeDbOperation(() => {
      const db = getDatabase();
      const now = Date.now();
      const result = db.prepare(`
        UPDATE support_cases SET assigned_staff_id = ?, updated_at = ? WHERE id = ?
      `).run(staffId, now, id);

      if (result.changes === 0) return null;

      recordAudit({
        who: assignedBy,
        what: `Assigned case ${id} to staff ${staffId}`,
        where: "support",
        result: "success",
      });

      logger.info(`👤 Case ${id} assigned to ${staffId} by ${assignedBy}`);

      return this.getCase(id);
    }, null, `assignCase(${id})`);
  }

  updateSummary(id: string, summary: string): AiCase | null {
    return safeDbOperation(() => {
      const db = getDatabase();
      const now = Date.now();
      db.prepare("UPDATE support_cases SET summary = ?, updated_at = ? WHERE id = ?")
        .run(summary, now, id);
      return this.getCase(id);
    }, null, `updateSummary(${id})`);
  }

  updateAnalysis(id: string, analysis: CaseAnalysis): AiCase | null {
    return safeDbOperation(() => {
      const db = getDatabase();
      const now = Date.now();
      db.prepare("UPDATE support_cases SET ai_analysis_json = ?, updated_at = ? WHERE id = ?")
        .run(JSON.stringify(analysis), now, id);

      recordAudit({
        who: "ai",
        what: `AI analysis created for case ${id}`,
        where: "support",
        result: "success",
      });

      return this.getCase(id);
    }, null, `updateAnalysis(${id})`);
  }

  addMessage(caseId: string, authorId: string, content: string, isAi = false): CaseMessage | null {
    return safeDbOperation(() => {
      const db = getDatabase();
      const id = `msg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      const now = Date.now();

      db.prepare(`
        INSERT INTO support_case_messages (id, case_id, author_id, content, is_ai, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(id, caseId, authorId, content, isAi ? 1 : 0, now);

      db.prepare("UPDATE support_cases SET updated_at = ? WHERE id = ?").run(now, caseId);

      return { id, caseId, authorId, content, isAi, createdAt: now };
    }, null, `addMessage(${caseId})`);
  }

  getMessages(caseId: string, limit = 100): CaseMessage[] {
    return safeDbOperation(() => {
      const db = getDatabase();
      const rows = db.prepare(
        "SELECT * FROM support_case_messages WHERE case_id = ? ORDER BY created_at ASC LIMIT ?"
      ).all(caseId, limit) as any[];
      return rows.map((r) => ({
        id: r.id,
        caseId: r.case_id,
        authorId: r.author_id,
        content: r.content,
        isAi: r.is_ai === 1,
        createdAt: r.created_at,
      }));
    }, [], `getMessages(${caseId})`);
  }

  addEvidence(params: {
    caseId: string;
    messageId: string;
    authorId: string;
    authorName?: string;
    content?: string;
    channelId?: string;
    channelName?: string;
    messageUrl?: string;
    attachmentUrls?: string[];
    collectedBy: string;
  }): CaseEvidence | null {
    return safeDbOperation(() => {
      const db = getDatabase();
      const id = `ev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      const now = Date.now();

      db.prepare(`
        INSERT INTO support_case_evidence (id, case_id, message_id, author_id, author_name, content, channel_id, channel_name, message_url, attachment_urls_json, collected_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, params.caseId, params.messageId, params.authorId,
        params.authorName ?? null, params.content ?? null,
        params.channelId ?? null, params.channelName ?? null,
        params.messageUrl ?? null,
        params.attachmentUrls ? JSON.stringify(params.attachmentUrls) : null,
        params.collectedBy, now
      );

      return {
        id, caseId: params.caseId, messageId: params.messageId,
        authorId: params.authorId, authorName: params.authorName,
        content: params.content, channelId: params.channelId,
        channelName: params.channelName, messageUrl: params.messageUrl,
        attachmentUrls: params.attachmentUrls, collectedBy: params.collectedBy,
        createdAt: now,
      };
    }, null, `addEvidence(${params.caseId})`);
  }

  getEvidence(caseId: string): CaseEvidence[] {
    return safeDbOperation(() => {
      const db = getDatabase();
      const rows = db.prepare(
        "SELECT * FROM support_case_evidence WHERE case_id = ? ORDER BY created_at ASC"
      ).all(caseId) as any[];
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
        createdAt: r.created_at,
      }));
    }, [], `getEvidence(${caseId})`);
  }

  getStats(guildId: string): {
    total: number;
    open: number;
    byType: Record<string, number>;
    byStatus: Record<string, number>;
  } {
    return safeDbOperation(() => {
      const db = getDatabase();
      const total = (db.prepare(
        "SELECT COUNT(*) as cnt FROM support_cases WHERE guild_id = ?"
      ).get(guildId) as any)?.cnt ?? 0;

      const open = (db.prepare(
        "SELECT COUNT(*) as cnt FROM support_cases WHERE guild_id = ? AND status NOT IN ('resolved', 'closed')"
      ).get(guildId) as any)?.cnt ?? 0;

      const byTypeRows = db.prepare(
        "SELECT type, COUNT(*) as cnt FROM support_cases WHERE guild_id = ? GROUP BY type"
      ).all(guildId) as any[];
      const byType: Record<string, number> = {};
      for (const r of byTypeRows) byType[r.type] = r.cnt;

      const byStatusRows = db.prepare(
        "SELECT status, COUNT(*) as cnt FROM support_cases WHERE guild_id = ? GROUP BY status"
      ).all(guildId) as any[];
      const byStatus: Record<string, number> = {};
      for (const r of byStatusRows) byStatus[r.status] = r.cnt;

      return { total, open, byType, byStatus };
    }, { total: 0, open: 0, byType: {}, byStatus: {} }, `getStats(${guildId})`);
  }

  private rowToCase(row: any): AiCase {
    return {
      id: row.id,
      guildId: row.guild_id,
      channelId: row.channel_id,
      type: row.type as CaseType,
      status: row.status as CaseStatus,
      creatorId: row.creator_id,
      subjectUserId: row.subject_user_id ?? undefined,
      assignedStaffId: row.assigned_staff_id ?? undefined,
      summary: row.summary ?? undefined,
      aiAnalysis: row.ai_analysis_json ? JSON.parse(row.ai_analysis_json) : undefined,
      metadata: row.metadata_json ? JSON.parse(row.metadata_json) : undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      closedAt: row.closed_at ?? undefined,
    };
  }
}

let _instance: SupportCaseManager | null = null;

export function getSupportCaseManager(): SupportCaseManager {
  if (!_instance) _instance = new SupportCaseManager();
  return _instance;
}
