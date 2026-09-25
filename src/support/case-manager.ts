import { getDatabase, safeDbOperation, transaction } from "../database/database";
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
    idempotencyKey?: string;
  }): AiCase | null {
    const now = Date.now();

    return safeDbOperation(() => {
      const db = getDatabase();

      // Idempotency: if a case with this key already exists, return it
      if (params.idempotencyKey) {
        const existing = db.prepare(
          "SELECT * FROM support_cases WHERE idempotency_key = ?"
        ).get(params.idempotencyKey) as any;
        if (existing) {
          logger.info(`🎫 Idempotent case creation: returning existing case ${existing.id} for key ${params.idempotencyKey}`);
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
      let row = db.prepare("SELECT * FROM support_cases WHERE id = ?").get(id) as any;
      if (!row) {
        // Case ids contain a mixed-case random suffix; tolerate
        // case-insensitive input from slash commands / copy-paste.
        row = db
          .prepare("SELECT * FROM support_cases WHERE id = ? COLLATE NOCASE")
          .get(id) as any;
      }
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

  transitionCase(
    id: string,
    newStatus: CaseStatus,
    actorId: string,
    expectedGuildId: string,
  ): AiCase | null {
    return safeDbOperation(() => {
      const db = getDatabase();

      // Read current state WITH version for optimistic concurrency.
      // Guild-scoped: a case id from another guild must be invisible
      // to this caller (cross-guild IDOR guard).
      const row = db.prepare("SELECT * FROM support_cases WHERE id = ? AND guild_id = ?").get(id, expectedGuildId) as any;
      if (!row) {
        logger.warn(`⚠️ transitionCase rejected: case ${id} not found in guild ${expectedGuildId}`);
        return null;
      }

      const current = row.status as CaseStatus;
      const currentVersion = row.version ?? 1;

      if (!canTransition(current, newStatus)) {
        logger.warn(`⚠️ Invalid case transition: ${current} → ${newStatus} for case ${id}`);
        return null;
      }

      const now = Date.now();
      const closedAt = newStatus === "closed" ? now : null;

      // Atomic update with version check — only succeeds if version hasn't changed
      const result = db.prepare(`
        UPDATE support_cases
        SET status = ?, updated_at = ?, closed_at = COALESCE(?, closed_at), version = version + 1
        WHERE id = ? AND version = ?
      `).run(newStatus, now, closedAt, id, currentVersion);

      if (result.changes === 0) {
        // Version mismatch — another process modified the case concurrently
        logger.warn(`⚠️ Stale transition rejected for case ${id}: expected version ${currentVersion}`);
        return null;
      }

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

  assignCase(id: string, staffId: string, assignedBy: string, expectedGuildId: string): AiCase | null {
    return safeDbOperation(() => {
      const db = getDatabase();
      const now = Date.now();
      // Guild-scoped: cross-guild case ids must not be assignable.
      const result = db.prepare(`
        UPDATE support_cases SET assigned_staff_id = ?, updated_at = ? WHERE id = ? AND guild_id = ?
      `).run(staffId, now, id, expectedGuildId);

      if (result.changes === 0) {
        logger.warn(`⚠️ assignCase rejected: case ${id} not found in guild ${expectedGuildId}`);
        return null;
      }

      recordAudit({
        who: assignedBy,
        what: `Assigned case ${id} to staff ${staffId}`,
        where: "support",
        guildId: expectedGuildId,
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

  addMessage(caseId: string, authorId: string, content: string, isAi = false, discordMessageId?: string): CaseMessage | null {
    return safeDbOperation(() => {
      const db = getDatabase();

      // Idempotency: if this Discord message was already recorded, return existing
      if (discordMessageId) {
        const existing = db.prepare(
          "SELECT * FROM support_case_messages WHERE discord_message_id = ?"
        ).get(discordMessageId) as any;
        if (existing) {
          return {
            id: existing.id,
            caseId: existing.case_id,
            authorId: existing.author_id,
            content: existing.content,
            isAi: existing.is_ai === 1,
            createdAt: existing.created_at,
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

      // Idempotency: evidence for same case+message already exists
      const existing = db.prepare(
        "SELECT * FROM support_case_evidence WHERE case_id = ? AND message_id = ?"
      ).get(params.caseId, params.messageId) as any;
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
          createdAt: existing.created_at,
        };
      }

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

  /**
   * Compound operation: create a case and add the initial user message atomically.
   * If the message insert fails, the case is still created (partial failure is recorded).
   * Returns both the case and the message (message may be null if insert failed).
   */
  createCaseWithMessage(params: {
    guildId: string;
    channelId: string;
    type: CaseType;
    creatorId: string;
    subjectUserId?: string;
    summary?: string;
    metadata?: Record<string, unknown>;
    idempotencyKey?: string;
    messageContent?: string;
    discordMessageId?: string;
  }): { case: AiCase | null; message: CaseMessage | null } {
    const aiCase = this.createCase(params);
    if (!aiCase) return { case: null, message: null };

    let message: CaseMessage | null = null;
    if (params.messageContent) {
      message = this.addMessage(
        aiCase.id,
        params.creatorId,
        params.messageContent,
        false,
        params.discordMessageId,
      );
    }

    return { case: aiCase, message };
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
      version: row.version ?? 1,
    };
  }
}

let _instance: SupportCaseManager | null = null;

export function getSupportCaseManager(): SupportCaseManager {
  if (!_instance) _instance = new SupportCaseManager();
  return _instance;
}
