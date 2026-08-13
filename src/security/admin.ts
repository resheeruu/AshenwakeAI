import { UserRateLimiter } from "./rate-limit";

export function createSecurityManager(
  limiter: UserRateLimiter,
  adminIds: string[]
) {
  const admins = new Set(
    adminIds
      .map((id) => id.trim())
      .filter(Boolean)
  );

  return {
    isAdmin(userId: string): boolean {
      return admins.has(userId);
    },

    getRateLimitStatus() {
      return {
        usersTracked: limiter.getUserCount(),
        config: limiter.getConfig(),
      };
    },

    resetUser(userId: string): boolean {
      if (!admins.size) {
        return false;
      }

      limiter.reset(userId);
      return true;
    },
  };
}
