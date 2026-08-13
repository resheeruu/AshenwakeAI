export {
  UserRateLimiter,
} from "./rate-limit";

export type {
  RateLimitResult,
} from "./rate-limit";

export {
  createSecurityManager,
} from "./admin";

export {
  inspectUserInput,
  sanitizeModelOutput,
  getCreatorResponse,
  isChatAuthentication,
} from "./gateway";

export type {
  SecurityDecision,
  SecurityResult,
} from "./gateway";

import { UserRateLimiter } from "./rate-limit";

export const messageRateLimiter =
  new UserRateLimiter(
    10,
    60_000
  );
