import {
  UserRateLimiter,
} from "../src/security/rate-limit";

import {
  createSecurityManager,
} from "../src/security/admin";

function assert(
  condition: boolean,
  message: string
): void {
  if (!condition) {
    throw new Error(
      `FAILED: ${message}`
    );
  }

  console.log(
    `✅ ${message}`
  );
}

console.log(
  "🧪 AshenAI Security Tests"
);

const limiter =
  new UserRateLimiter(
    3,
    60_000
  );

const security =
  createSecurityManager(
    limiter,
    ["admin-123"]
  );

assert(
  security.isAdmin("admin-123"),
  "Configured admin recognized"
);

assert(
  !security.isAdmin("normal-user"),
  "Normal user is not admin"
);

const status =
  security.getRateLimitStatus();

assert(
  status.config.maxRequests === 3,
  "Rate-limit configuration available"
);

limiter.check("normal-user");
limiter.check("normal-user");

security.resetUser(
  "normal-user"
);

const afterReset =
  limiter.check("normal-user");

assert(
  afterReset.allowed,
  "Admin reset clears user rate limit"
);

console.log(
  "🎉 ALL SECURITY TESTS PASSED"
);
