interface RateLimitState {
  timestamps: number[];
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

export class UserRateLimiter {
  private readonly users = new Map<string, RateLimitState>();

  private readonly maxRequests: number;
  private readonly windowMs: number;

  constructor(
    maxRequests = 10,
    windowMs = 60_000
  ) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;

    setInterval(
      () => this.cleanup(),
      windowMs
    ).unref();
  }

  check(userId: string): RateLimitResult {
    const now = Date.now();

    let state = this.users.get(userId);

    if (!state) {
      state = {
        timestamps: [],
      };

      this.users.set(
        userId,
        state
      );
    }

    state.timestamps =
      state.timestamps.filter(
        (timestamp) =>
          now - timestamp < this.windowMs
      );

    if (
      state.timestamps.length >=
      this.maxRequests
    ) {
      const oldest =
        state.timestamps[0] ?? now;

      const retryAfterMs =
        Math.max(
          0,
          this.windowMs -
            (now - oldest)
        );

      return {
        allowed: false,
        remaining: 0,
        retryAfterMs,
      };
    }

    state.timestamps.push(now);

    return {
      allowed: true,
      remaining:
        this.maxRequests -
        state.timestamps.length,
      retryAfterMs: 0,
    };
  }

  reset(userId: string): void {
    this.users.delete(userId);
  }

  cleanup(): void {
    const now = Date.now();

    for (
      const [
        userId,
        state,
      ] of this.users
    ) {
      state.timestamps =
        state.timestamps.filter(
          (timestamp) =>
            now - timestamp <
            this.windowMs
        );

      if (
        state.timestamps.length ===
        0
      ) {
        this.users.delete(userId);
      }
    }
  }

  getUserCount(): number {
    return this.users.size;
  }

  getConfig() {
    return {
      maxRequests:
        this.maxRequests,
      windowMs:
        this.windowMs,
      windowSeconds:
        Math.floor(
          this.windowMs / 1000
        ),
    };
  }
}
