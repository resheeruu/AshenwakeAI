import { readJSON, writeJSON } from "../core/data-store";
import { logger } from "../logger";
import { recordAudit } from "../security/audit";

export interface ModCase {
  id: string;
  guildId: string;
  userId: string;
  moderatorId: string;
  action: "warn" | "timeout" | "kick" | "ban" | "unban" | "purge" | "note";
  reason: string;
  evidence?: string;
  timestamp: number;
  expiresAt?: number;
  active: boolean;
}

interface CaseStore {
  cases: Record<string, ModCase>;
  nextId: Record<string, number>;
}

const CASES_FILE = "mod-cases.json";

export class CaseManager {
  private store: CaseStore;

  constructor() {
    this.store = readJSON<CaseStore>(CASES_FILE, { cases: {}, nextId: {} });
  }

  private save(): void {
    writeJSON(CASES_FILE, this.store);
  }

  createCase(params: {
    guildId: string;
    userId: string;
    moderatorId: string;
    action: ModCase["action"];
    reason: string;
    evidence?: string;
    expiresAt?: number;
  }): ModCase {
    const { guildId } = params;
    this.store.nextId[guildId] = (this.store.nextId[guildId] || 0) + 1;
    const caseNum = this.store.nextId[guildId];
    const id = `${guildId}-${caseNum}`;

    const modCase: ModCase = {
      id, ...params, timestamp: Date.now(), active: true,
    };

    this.store.cases[id] = modCase;
    this.save();

    recordAudit({
      who: params.moderatorId,
      what: `Created mod case #${caseNum}: ${params.action} for ${params.userId}`,
      where: "moderation",
      guildId,
      result: "success",
      details: params.reason,
    });

    logger.info(`📋 Mod case #${caseNum} created in ${guildId}: ${params.action} for ${params.userId}`);
    return modCase;
  }

  getCase(id: string): ModCase | undefined {
    return this.store.cases[id];
  }

  getGuildCases(guildId: string, limit = 50): ModCase[] {
    return Object.values(this.store.cases)
      .filter((c) => c.guildId === guildId)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }

  getUserCases(guildId: string, userId: string, limit = 20): ModCase[] {
    return Object.values(this.store.cases)
      .filter((c) => c.guildId === guildId && c.userId === userId)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }

  getActiveWarnings(guildId: string, userId: string): ModCase[] {
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    return Object.values(this.store.cases)
      .filter((c) =>
        c.guildId === guildId &&
        c.userId === userId &&
        c.action === "warn" &&
        c.active &&
        c.timestamp > thirtyDaysAgo
      );
  }

  deactivateCase(id: string): boolean {
    const modCase = this.store.cases[id];
    if (!modCase) return false;
    modCase.active = false;
    this.save();
    return true;
  }

  getStats(guildId: string): { total: number; active: number; byAction: Record<string, number> } {
    const guildCases = this.getGuildCases(guildId, 1000);
    const byAction: Record<string, number> = {};
    for (const c of guildCases) {
      byAction[c.action] = (byAction[c.action] || 0) + 1;
    }
    return {
      total: guildCases.length,
      active: guildCases.filter((c) => c.active).length,
      byAction,
    };
  }
}
