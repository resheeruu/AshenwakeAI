import type { AshenRole } from "../../security/permissions";
import { logger } from "../../logger";

/* ================================================================
 * TOOL RATE LIMITER
 *
 * Per-user, per-guild rate limiting for tool executions.
 * Two tiers: global (all tools combined) + per-tool (optional).
 * Keyed by guildId:requesterId (trusted context, never user args).
 *
 * Reservation system prevents double-consumption during
 * confirmation: token consumed at plan creation, confirmed
 * at execution time without consuming another token.
 *
 * Priority escalation:
 *   owner   → bypass (always allowed)
 *   admin   → 2× global limit
 *   moderator → 1× global limit
 *   member  → 0.5× global limit (rounded down, min 1)
 * ================================================================ */

export interface ToolRateLimitConfig {
  /** Max requests in the global window (before role multiplier) */
  maxRequests: number;
  /** Window duration in milliseconds */
  windowMs: number;
}

export interface ToolRateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

interface TimestampBucket {
  timestamps: number[];
}

interface ReservationEntry {
  toolName: string;
  createdAt: number;
}

/* ================================================================
 * ROLE MULTIPLIERS
 * ================================================================ */

const ROLE_MULTIPLIERS: Record<AshenRole, number> = {
  owner: Infinity,
  admin: 2,
  moderator: 1,
  member: 0.5,
  guest: 0.25,
};

function getEffectiveLimit(
  baseLimit: number,
  role: AshenRole,
): number {
  const multiplier = ROLE_MULTIPLIERS[role] ?? 1;
  if (!isFinite(multiplier)) return Infinity;
  return Math.max(1, Math.floor(baseLimit * multiplier));
}

/* ================================================================
 * TOOL RATE LIMITER CLASS
 * ================================================================ */

export class ToolRateLimiter {
  /** Global buckets: key = "guildId:requesterId" */
  private readonly globalBuckets = new Map<string, TimestampBucket>();

  /** Per-tool buckets: key = "guildId:requesterId:toolName" */
  private readonly toolBuckets = new Map<string, TimestampBucket>();

  /** Active reservations: key = "guildId:requesterId:planId" */
  private readonly reservations = new Map<string, ReservationEntry>();

  private readonly globalConfig: ToolRateLimitConfig;
  private readonly perToolLimits = new Map<string, ToolRateLimitConfig>();
  private readonly cleanupInterval: ReturnType<typeof setInterval>;

  constructor(
    globalConfig: ToolRateLimitConfig = {
      maxRequests: 20,
      windowMs: 60_000,
    },
  ) {
    this.globalConfig = globalConfig;

    this.cleanupInterval = setInterval(
      () => this.cleanup(),
      globalConfig.windowMs,
    );
    this.cleanupInterval.unref();
  }

  /* ==============================================================
   * CHECK — Verify rate limit and CONSUME a token if allowed.
   *
   * Uses trusted guildId + requesterId from ToolContext.
   * NEVER uses user-controlled tool arguments for the key.
   *
   * Returns { allowed: false } if over limit.
   * Owner role always returns { allowed: true }.
   * ============================================================== */

  check(
    guildId: string,
    requesterId: string,
    role: AshenRole,
    toolName?: string,
  ): ToolRateLimitResult {
    // Owner bypass — trusted role state, not spoofable via args
    if (role === "owner") {
      return { allowed: true, remaining: Infinity, retryAfterMs: 0 };
    }

    const now = Date.now();

    // Check global limit
    const globalResult = this.checkBucket(
      this.globalBuckets,
      `${guildId}:${requesterId}`,
      getEffectiveLimit(this.globalConfig.maxRequests, role),
      this.globalConfig.windowMs,
      now,
    );

    if (!globalResult.allowed) {
      return globalResult;
    }

    // Check per-tool limit if configured
    if (toolName) {
      const toolConfig = this.perToolLimits.get(toolName);
      if (toolConfig) {
        const toolResult = this.checkBucket(
          this.toolBuckets,
          `${guildId}:${requesterId}:${toolName}`,
          getEffectiveLimit(toolConfig.maxRequests, role),
          toolConfig.windowMs,
          now,
        );

        if (!toolResult.allowed) {
          return toolResult;
        }

        return {
          allowed: true,
          remaining: Math.min(globalResult.remaining, toolResult.remaining),
          retryAfterMs: 0,
        };
      }
    }

    return globalResult;
  }

  /* ==============================================================
   * IS LIMITED — Check rate limit WITHOUT consuming a token.
   *
   * Used by validateRateLimit for validation-only checks that
   * must not consume tokens (consumption happens in reserve/check).
   * ============================================================== */

  isLimited(
    guildId: string,
    requesterId: string,
    role: AshenRole,
    toolName?: string,
  ): ToolRateLimitResult {
    // Owner bypass
    if (role === "owner") {
      return { allowed: true, remaining: Infinity, retryAfterMs: 0 };
    }

    const now = Date.now();

    const globalResult = this.peekBucket(
      this.globalBuckets,
      `${guildId}:${requesterId}`,
      getEffectiveLimit(this.globalConfig.maxRequests, role),
      this.globalConfig.windowMs,
      now,
    );

    if (!globalResult.allowed) {
      return globalResult;
    }

    if (toolName) {
      const toolConfig = this.perToolLimits.get(toolName);
      if (toolConfig) {
        const toolResult = this.peekBucket(
          this.toolBuckets,
          `${guildId}:${requesterId}:${toolName}`,
          getEffectiveLimit(toolConfig.maxRequests, role),
          toolConfig.windowMs,
          now,
        );

        if (!toolResult.allowed) {
          return toolResult;
        }

        return {
          allowed: true,
          remaining: Math.min(globalResult.remaining, toolResult.remaining),
          retryAfterMs: 0,
        };
      }
    }

    return globalResult;
  }

  /* ==============================================================
   * RESERVE — Create a rate-limit reservation for a plan.
   *
   * Called during plan creation (executor step 5). Consumes a
   * token and stores the reservation so confirmation can verify
   * without double-consuming.
   *
   * Returns true if reservation was created, false if rate-limited.
   * ============================================================== */

  reserve(
    guildId: string,
    requesterId: string,
    role: AshenRole,
    planId: string,
    toolName: string,
  ): boolean {
    const result = this.check(guildId, requesterId, role, toolName);
    if (!result.allowed) return false;

    const key = `${guildId}:${requesterId}:${planId}`;
    this.reservations.set(key, {
      toolName,
      createdAt: Date.now(),
    });

    return true;
  }

  /* ==============================================================
   * CONFIRM RESERVATION — Verify a reservation exists for the plan.
   *
   * Called during confirmation execution. Does NOT consume another
   * token — the token was already consumed at reserve() time.
   *
   * Returns true if reservation is valid (not expired).
   * ============================================================== */

  confirmReservation(
    guildId: string,
    requesterId: string,
    planId: string,
  ): boolean {
    const key = `${guildId}:${requesterId}:${planId}`;
    const reservation = this.reservations.get(key);

    if (!reservation) return false;

    // Check if reservation has expired (same window as plan TTL)
    const RESERVATION_TTL = 5 * 60 * 1000; // 5 minutes
    if (Date.now() - reservation.createdAt > RESERVATION_TTL) {
      this.reservations.delete(key);
      return false;
    }

    return true;
  }

  /* ==============================================================
   * RELEASE — Remove a reservation (e.g., on plan cancellation).
   * ============================================================== */

  release(
    guildId: string,
    requesterId: string,
    planId: string,
  ): void {
    const key = `${guildId}:${requesterId}:${planId}`;
    this.reservations.delete(key);
  }

  /* ==============================================================
   * CONFIGURATION
   * ============================================================== */

  setPerToolLimit(toolName: string, config: ToolRateLimitConfig): void {
    this.perToolLimits.set(toolName, config);
  }

  removePerToolLimit(toolName: string): void {
    this.perToolLimits.delete(toolName);
  }

  getGlobalConfig(): ToolRateLimitConfig {
    return { ...this.globalConfig };
  }

  getPerToolConfig(toolName: string): ToolRateLimitConfig | undefined {
    const config = this.perToolLimits.get(toolName);
    return config ? { ...config } : undefined;
  }

  /* ==============================================================
   * RESET — Clear all state for a user in a guild.
   * ============================================================== */

  reset(guildId: string, requesterId: string): void {
    const prefix = `${guildId}:${requesterId}`;
    for (const key of this.globalBuckets.keys()) {
      if (key.startsWith(prefix)) {
        this.globalBuckets.delete(key);
      }
    }
    for (const key of this.toolBuckets.keys()) {
      if (key.startsWith(prefix)) {
        this.toolBuckets.delete(key);
      }
    }
    for (const key of this.reservations.keys()) {
      if (key.startsWith(prefix)) {
        this.reservations.delete(key);
      }
    }
  }

  /* ==============================================================
   * CLEANUP — Remove expired entries to prevent memory leaks.
   * ============================================================== */

  cleanup(): void {
    const now = Date.now();

    for (const [key, bucket] of this.globalBuckets) {
      bucket.timestamps = bucket.timestamps.filter(
        (ts) => now - ts < this.globalConfig.windowMs,
      );
      if (bucket.timestamps.length === 0) {
        this.globalBuckets.delete(key);
      }
    }

    for (const [key, bucket] of this.toolBuckets) {
      const toolName = key.split(":").pop()!;
      const config = this.perToolLimits.get(toolName);
      const windowMs = config?.windowMs ?? this.globalConfig.windowMs;
      bucket.timestamps = bucket.timestamps.filter(
        (ts) => now - ts < windowMs,
      );
      if (bucket.timestamps.length === 0) {
        this.toolBuckets.delete(key);
      }
    }

    const RESERVATION_TTL = 5 * 60 * 1000;
    for (const [key, entry] of this.reservations) {
      if (now - entry.createdAt > RESERVATION_TTL) {
        this.reservations.delete(key);
      }
    }
  }

  /* ==============================================================
   * STATS — For testing and monitoring.
   * ============================================================== */

  getStats(): {
    globalBuckets: number;
    toolBuckets: number;
    reservations: number;
  } {
    return {
      globalBuckets: this.globalBuckets.size,
      toolBuckets: this.toolBuckets.size,
      reservations: this.reservations.size,
    };
  }

  /* ==============================================================
   * INTERNAL — Check a single bucket (consume token).
   * ============================================================== */

  private checkBucket(
    buckets: Map<string, TimestampBucket>,
    key: string,
    maxRequests: number,
    windowMs: number,
    now: number,
  ): ToolRateLimitResult {
    if (!isFinite(maxRequests)) {
      return { allowed: true, remaining: Infinity, retryAfterMs: 0 };
    }

    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { timestamps: [] };
      buckets.set(key, bucket);
    }

    // Evict expired timestamps
    bucket.timestamps = bucket.timestamps.filter(
      (ts) => now - ts < windowMs,
    );

    if (bucket.timestamps.length >= maxRequests) {
      const oldest = bucket.timestamps[0] ?? now;
      const retryAfterMs = Math.max(0, windowMs - (now - oldest));
      return { allowed: false, remaining: 0, retryAfterMs };
    }

    // Atomic consume: push timestamp
    bucket.timestamps.push(now);

    return {
      allowed: true,
      remaining: maxRequests - bucket.timestamps.length,
      retryAfterMs: 0,
    };
  }

  /* ==============================================================
   * INTERNAL — Peek at a single bucket without consuming.
   * ============================================================== */

  private peekBucket(
    buckets: Map<string, TimestampBucket>,
    key: string,
    maxRequests: number,
    windowMs: number,
    now: number,
  ): ToolRateLimitResult {
    if (!isFinite(maxRequests)) {
      return { allowed: true, remaining: Infinity, retryAfterMs: 0 };
    }

    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { timestamps: [] };
      buckets.set(key, bucket);
    }

    // Evict expired timestamps (read-only, don't persist)
    const activeTimestamps = bucket.timestamps.filter(
      (ts) => now - ts < windowMs,
    );

    if (activeTimestamps.length >= maxRequests) {
      const oldest = activeTimestamps[0] ?? now;
      const retryAfterMs = Math.max(0, windowMs - (now - oldest));
      return { allowed: false, remaining: 0, retryAfterMs };
    }

    return {
      allowed: true,
      remaining: maxRequests - activeTimestamps.length,
      retryAfterMs: 0,
    };
  }
}

/* ================================================================
 * SINGLETON
 * ================================================================ */

export const toolRateLimiter = new ToolRateLimiter();
