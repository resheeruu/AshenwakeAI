import { readJSON, writeJSON } from "../core/data-store";
import { logger } from "../logger";

export type AIFeature =
  | "ask"
  | "chat"
  | "vision"
  | "ticket_ai"
  | "server_assistant"
  | "server_copilot"
  | "ai_search"
  | "ai_summary"
  | "ai_agent"
  | "moderation_ai"
  | "knowledge_query"
  | "automod_ai"
  | "incident_investigate";

export interface CreditCosts {
  simple: number;
  normal: number;
  long: number;
  vision: number;
  document: number;
  agent: number;
}

const DEFAULT_COSTS: CreditCosts = {
  simple: 1,
  normal: 1,
  long: 3,
  vision: 3,
  document: 5,
  agent: 10,
};

interface UsageRecord {
  feature: AIFeature;
  timestamp: number;
  credits: number;
  tokens?: number;
  inputTokens?: number;
  outputTokens?: number;
  provider?: string;
  latencyMs?: number;
  success: boolean;
}

interface UsageLimits {
  dailyLimit: number;
  monthlyLimit: number;
  rateLimitPerMinute: number;
  burstLimit: number;
  cooldownMs: number;
  maxPromptSize: number;
  maxOutputSize: number;
  maxConcurrent: number;
}

const DEFAULT_LIMITS: UsageLimits = {
  dailyLimit: 100,
  monthlyLimit: 2000,
  rateLimitPerMinute: 10,
  burstLimit: 3,
  cooldownMs: 5000,
  maxPromptSize: 4000,
  maxOutputSize: 2000,
  maxConcurrent: 3,
};

interface UserData {
  records: UsageRecord[];
  dailyCredits: number;
  monthlyCredits: number;
  lastResetDay: string;
  lastResetMonth: string;
  cooldownUntil: number;
}

interface GuildData {
  records: UsageRecord[];
  dailyCredits: number;
  monthlyCredits: number;
  lastResetDay: string;
  lastResetMonth: string;
}

interface GlobalData {
  totalRequests: number;
  totalCredits: number;
  totalTokens: number;
  failures: number;
  providerUsage: Record<string, { requests: number; credits: number; latency: number }>;
}

interface ConcurrentState {
  count: number;
  waiters: Array<() => void>;
}

const defaultConcurrent: ConcurrentState = { count: 0, waiters: [] };

const DATA_FILE = "usage-data.json";

interface StoredUsage {
  users: Record<string, UserData>;
  guilds: Record<string, GuildData>;
  global: GlobalData;
}

function dayKey(ts = Date.now()): string {
  return new Date(ts).toISOString().slice(0, 10);
}

function monthKey(ts = Date.now()): string {
  return new Date(ts).toISOString().slice(0, 7);
}

export class UsageManager {
  private data: StoredUsage;
  private limits: UsageLimits;
  private costs: CreditCosts;
  private concurrent: ConcurrentState = { count: 0, waiters: [] };
  private rateLimitBuckets = new Map<string, number[]>();
  private burstBuckets = new Map<string, number[]>();

  constructor(limits?: Partial<UsageLimits>, costs?: Partial<CreditCosts>) {
    this.limits = { ...DEFAULT_LIMITS, ...limits };
    this.costs = { ...DEFAULT_COSTS, ...costs };
    this.data = readJSON<StoredUsage>(DATA_FILE, {
      users: {},
      guilds: {},
      global: { totalRequests: 0, totalCredits: 0, totalTokens: 0, failures: 0, providerUsage: {} },
    });

    setInterval(() => this.cleanupRateLimits(), 60_000).unref();
  }

  private cleanupRateLimits(): void {
    const now = Date.now();
    for (const [key, timestamps] of this.rateLimitBuckets) {
      const filtered = timestamps.filter((t) => now - t < 60_000);
      if (filtered.length === 0) this.rateLimitBuckets.delete(key);
      else this.rateLimitBuckets.set(key, filtered);
    }
    for (const [key, timestamps] of this.burstBuckets) {
      const filtered = timestamps.filter((t) => now - t < 10_000);
      if (filtered.length === 0) this.burstBuckets.delete(key);
      else this.burstBuckets.set(key, filtered);
    }
  }

  private getUser(userId: string): UserData {
    if (!this.data.users[userId]) {
      this.data.users[userId] = {
        records: [],
        dailyCredits: 0,
        monthlyCredits: 0,
        lastResetDay: dayKey(),
        lastResetMonth: monthKey(),
        cooldownUntil: 0,
      };
    }
    const user = this.data.users[userId];
    const today = dayKey();
    const thisMonth = monthKey();
    if (user.lastResetDay !== today) {
      user.dailyCredits = 0;
      user.lastResetDay = today;
    }
    if (user.lastResetMonth !== thisMonth) {
      user.monthlyCredits = 0;
      user.lastResetMonth = thisMonth;
    }
    return user;
  }

  private getGuild(guildId: string): GuildData {
    if (!this.data.guilds[guildId]) {
      this.data.guilds[guildId] = {
        records: [],
        dailyCredits: 0,
        monthlyCredits: 0,
        lastResetDay: dayKey(),
        lastResetMonth: monthKey(),
      };
    }
    const guild = this.data.guilds[guildId];
    const today = dayKey();
    const thisMonth = monthKey();
    if (guild.lastResetDay !== today) {
      guild.dailyCredits = 0;
      guild.lastResetDay = today;
    }
    if (guild.lastResetMonth !== thisMonth) {
      guild.monthlyCredits = 0;
      guild.lastResetMonth = thisMonth;
    }
    return guild;
  }

  estimateCredits(feature: AIFeature, inputLength: number): number {
    if (feature === "vision") return this.costs.vision;
    if (feature === "ai_agent") return this.costs.agent;
    if (inputLength > 2000) return this.costs.long;
    if (inputLength > 500) return this.costs.normal;
    return this.costs.simple;
  }

  check(userId: string, guildId: string, feature: AIFeature, inputLength = 0): {
    allowed: boolean;
    reason?: string;
    credits: number;
    retryAfterMs?: number;
  } {
    const credits = this.estimateCredits(feature, inputLength);
    const now = Date.now();
    const user = this.getUser(userId);

    if (user.cooldownUntil > now) {
      return {
        allowed: false,
        reason: "cooldown",
        credits,
        retryAfterMs: user.cooldownUntil - now,
      };
    }

    if (user.dailyCredits + credits > this.limits.dailyLimit) {
      return {
        allowed: false,
        reason: "daily_limit",
        credits,
        retryAfterMs: this.msUntilMidnight(),
      };
    }

    if (user.monthlyCredits + credits > this.limits.monthlyLimit) {
      return {
        allowed: false,
        reason: "monthly_limit",
        credits,
        retryAfterMs: this.msUntilMonthEnd(),
      };
    }

    if (guildId) {
      const guild = this.getGuild(guildId);
      if (guild.dailyCredits + credits > this.limits.dailyLimit * 5) {
        return { allowed: false, reason: "guild_daily_limit", credits };
      }
    }

    const rlKey = `rate:${userId}`;
    const rlBucket = this.rateLimitBuckets.get(rlKey) || [];
    const recentRl = rlBucket.filter((t) => now - t < 60_000);
    if (recentRl.length >= this.limits.rateLimitPerMinute) {
      const oldest = recentRl[0];
      return {
        allowed: false,
        reason: "rate_limit",
        credits,
        retryAfterMs: 60_000 - (now - oldest),
      };
    }

    const burstKey = `burst:${userId}`;
    const burstBucket = this.burstBuckets.get(burstKey) || [];
    const recentBurst = burstBucket.filter((t) => now - t < 10_000);
    if (recentBurst.length >= this.limits.burstLimit) {
      return {
        allowed: false,
        reason: "burst_limit",
        credits,
        retryAfterMs: 10_000 - (now - recentBurst[0]),
      };
    }

    if (this.concurrent.count >= this.limits.maxConcurrent) {
      return {
        allowed: false,
        reason: "concurrent_limit",
        credits,
      };
    }

    return { allowed: true, credits };
  }

  private writePending = false;

  record(params: {
    userId: string;
    guildId?: string;
    feature: AIFeature;
    credits: number;
    tokens?: number;
    inputTokens?: number;
    outputTokens?: number;
    provider?: string;
    latencyMs?: number;
    success: boolean;
  }): void {
    this.recordInternal(params);
    writeJSON(DATA_FILE, this.data);
  }

  /**
   * Record usage without writing to disk immediately.
   * Call flush() after response delivery to persist.
   * In-memory state is updated immediately so check() stays accurate.
   */
  recordDeferred(params: {
    userId: string;
    guildId?: string;
    feature: AIFeature;
    credits: number;
    tokens?: number;
    inputTokens?: number;
    outputTokens?: number;
    provider?: string;
    latencyMs?: number;
    success: boolean;
  }): void {
    this.recordInternal(params);
    this.writePending = true;
  }

  /**
   * Flush any deferred record to disk. Call after response delivery.
   */
  flush(): void {
    if (this.writePending) {
      this.writePending = false;
      writeJSON(DATA_FILE, this.data);
    }
  }

  private recordInternal(params: {
    userId: string;
    guildId?: string;
    feature: AIFeature;
    credits: number;
    tokens?: number;
    inputTokens?: number;
    outputTokens?: number;
    provider?: string;
    latencyMs?: number;
    success: boolean;
  }): void {
    const { userId, guildId, feature, credits, tokens, inputTokens, outputTokens, provider, latencyMs, success } = params;
    const record: UsageRecord = {
      feature,
      timestamp: Date.now(),
      credits,
      tokens,
      inputTokens,
      outputTokens,
      provider,
      latencyMs,
      success,
    };

    const user = this.getUser(userId);
    user.records.push(record);
    if (user.records.length > 200) user.records = user.records.slice(-200);
    if (success) {
      user.dailyCredits += credits;
      user.monthlyCredits += credits;
    }

    if (guildId) {
      const guild = this.getGuild(guildId);
      guild.records.push(record);
      if (guild.records.length > 500) guild.records = guild.records.slice(-500);
      if (success) {
        guild.dailyCredits += credits;
        guild.monthlyCredits += credits;
      }
    }

    this.data.global.totalRequests++;
    if (success) {
      this.data.global.totalCredits += credits;
      this.data.global.totalTokens += tokens || 0;
    } else {
      this.data.global.failures++;
    }

    if (provider) {
      if (!this.data.global.providerUsage[provider]) {
        this.data.global.providerUsage[provider] = { requests: 0, credits: 0, latency: 0 };
      }
      const pu = this.data.global.providerUsage[provider];
      pu.requests++;
      pu.credits += credits;
      pu.latency = latencyMs || 0;
    }

    if (!success) {
      user.cooldownUntil = Date.now() + this.limits.cooldownMs;
    }
  }

  acquire(): boolean {
    if (this.concurrent.count >= this.limits.maxConcurrent) return false;
    this.concurrent.count++;
    return true;
  }

  release(): void {
    this.concurrent.count = Math.max(0, this.concurrent.count - 1);
    const waiter = this.concurrent.waiters.shift();
    if (waiter) waiter();
  }

  getUserUsage(userId: string): {
    dailyCredits: number;
    monthlyCredits: number;
    dailyLimit: number;
    monthlyLimit: number;
    recentRequests: number;
    features: Record<string, number>;
  } {
    const user = this.getUser(userId);
    const now = Date.now();
    const recent = user.records.filter((r) => now - r.timestamp < 60_000).length;
    const features: Record<string, number> = {};
    for (const r of user.records.filter((r) => now - r.timestamp < 86_400_000)) {
      features[r.feature] = (features[r.feature] || 0) + 1;
    }
    return {
      dailyCredits: user.dailyCredits,
      monthlyCredits: user.monthlyCredits,
      dailyLimit: this.limits.dailyLimit,
      monthlyLimit: this.limits.monthlyLimit,
      recentRequests: recent,
      features,
    };
  }

  getGuildUsage(guildId: string): {
    dailyCredits: number;
    monthlyCredits: number;
    totalRequests: number;
    topFeatures: Array<{ feature: string; count: number }>;
  } {
    const guild = this.getGuild(guildId);
    const features: Record<string, number> = {};
    for (const r of guild.records) {
      features[r.feature] = (features[r.feature] || 0) + 1;
    }
    return {
      dailyCredits: guild.dailyCredits,
      monthlyCredits: guild.monthlyCredits,
      totalRequests: guild.records.length,
      topFeatures: Object.entries(features)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([feature, count]) => ({ feature, count })),
    };
  }

  getGlobalUsage(): GlobalData {
    return { ...this.data.global };
  }

  getProviderUsage(): Record<string, { requests: number; credits: number; latency: number }> {
    return { ...this.data.global.providerUsage };
  }

  detectSuspicious(userId: string): boolean {
    const user = this.getUser(userId);
    const now = Date.now();
    const recentRecords = user.records.filter((r) => now - r.timestamp < 3600_000);
    if (recentRecords.length > 50) return true;
    const failures = recentRecords.filter((r) => !r.success).length;
    if (failures > 10) return true;
    const uniqueFeatures = new Set(recentRecords.map((r) => r.feature));
    if (uniqueFeatures.size > 8) return true;
    return false;
  }

  private msUntilMidnight(): number {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setUTCHours(24, 0, 0, 0);
    return midnight.getTime() - now.getTime();
  }

  private msUntilMonthEnd(): number {
    const now = new Date();
    const end = new Date(now);
    end.setUTCMonth(end.getUTCMonth() + 1, 0);
    end.setUTCHours(23, 59, 59, 999);
    return end.getTime() - now.getTime();
  }

  updateLimits(limits: Partial<UsageLimits>): void {
    Object.assign(this.limits, limits);
  }

  updateCosts(costs: Partial<CreditCosts>): void {
    Object.assign(this.costs, costs);
  }

  getLimits(): UsageLimits {
    return { ...this.limits };
  }

  getCosts(): CreditCosts {
    return { ...this.costs };
  }
}
