export {
  UserRateLimiter,
} from "./rate-limit";

export type {
  RateLimitResult,
} from "./rate-limit";

export {
  createSecurityManager,
} from "./admin";

import { UserRateLimiter } from "./rate-limit";

export const messageRateLimiter =
  new UserRateLimiter(
    10,
    60_000
  );
