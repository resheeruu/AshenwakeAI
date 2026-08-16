/**
 * AshenAI Concurrency Lock Manager
 *
 * Provides in-memory per-key mutex locks with queueing and timeout safeguards
 * to prevent race conditions across concurrent player actions, casino games,
 * and database updates.
 */

type LockQueueItem = {
  resolve: () => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
};

class KeyedLockManager {
  private readonly queues = new Map<string, LockQueueItem[]>();
  private readonly active = new Set<string>();

  /**
   * Acquire a lock for the specified key and run the provided function.
   * Ensures strictly sequential execution per key.
   */
  async acquire<T>(
    key: string,
    fn: () => Promise<T>,
    timeoutMs = 15000,
  ): Promise<T> {
    await this.lock(key, timeoutMs);
    try {
      return await fn();
    } finally {
      this.unlock(key);
    }
  }

  /**
   * Internal lock acquisition with timeout protection.
   */
  private lock(key: string, timeoutMs: number): Promise<void> {
    if (!this.active.has(key)) {
      this.active.add(key);
      return Promise.resolve();
    }

    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        // Remove from queue on timeout to avoid leaking or delayed execution
        const queue = this.queues.get(key);
        if (queue) {
          const index = queue.findIndex((item) => item.timer === timer);
          if (index !== -1) {
            queue.splice(index, 1);
            if (queue.length === 0) {
              this.queues.delete(key);
            }
          }
        }
        reject(
          new Error(
            `LOCK_TIMEOUT: Failed to acquire lock for '${key}' within ${timeoutMs}ms`,
          ),
        );
      }, timeoutMs);

      const queue = this.queues.get(key) ?? [];
      queue.push({ resolve, reject, timer });
      this.queues.set(key, queue);
    });
  }

  /**
   * Release the lock for the specified key and dispatch next queued operation.
   */
  private unlock(key: string): void {
    const queue = this.queues.get(key);

    if (queue && queue.length > 0) {
      const next = queue.shift()!;
      clearTimeout(next.timer);
      if (queue.length === 0) {
        this.queues.delete(key);
      }
      next.resolve();
    } else {
      this.active.delete(key);
      this.queues.delete(key);
    }
  }

  /**
   * Check if a given key is currently locked.
   */
  isLocked(key: string): boolean {
    return this.active.has(key);
  }

  /**
   * Get count of pending operations waiting for a key.
   */
  getQueueLength(key: string): number {
    return this.queues.get(key)?.length ?? 0;
  }
}

export const lockManager = new KeyedLockManager();

/**
 * Execute an async operation with an exclusive lock on a generic key.
 */
export async function withLock<T>(
  key: string,
  fn: () => Promise<T>,
  timeoutMs = 15000,
): Promise<T> {
  return lockManager.acquire(key, fn, timeoutMs);
}

/**
 * Execute an async operation with an exclusive lock on a specific player.
 */
export async function withPlayerLock<T>(
  userId: string,
  fn: () => Promise<T>,
  timeoutMs = 15000,
): Promise<T> {
  return withLock(`player:${userId}`, fn, timeoutMs);
}

/**
 * Execute an async operation with an exclusive lock on a global resource.
 */
export async function withGlobalLock<T>(
  resource: string,
  fn: () => Promise<T>,
  timeoutMs = 15000,
): Promise<T> {
  return withLock(`global:${resource}`, fn, timeoutMs);
}
