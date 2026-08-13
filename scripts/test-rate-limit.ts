import {
  UserRateLimiter,
} from "../src/security/rate-limit";

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
  "🧪 AshenAI Rate Limiter Tests"
);

const limiter =
  new UserRateLimiter(
    3,
    60_000
  );

const user =
  "test-user";

const first =
  limiter.check(user);

assert(
  first.allowed,
  "First request allowed"
);

const second =
  limiter.check(user);

assert(
  second.allowed,
  "Second request allowed"
);

const third =
  limiter.check(user);

assert(
  third.allowed,
  "Third request allowed"
);

const fourth =
  limiter.check(user);

assert(
  !fourth.allowed,
  "Fourth request blocked"
);

assert(
  fourth.remaining === 0,
  "Remaining requests reach zero"
);

assert(
  fourth.retryAfterMs > 0,
  "Retry time is provided"
);

limiter.reset(user);

const afterReset =
  limiter.check(user);

assert(
  afterReset.allowed,
  "User can request again after reset"
);

console.log(
  "🎉 ALL RATE LIMIT TESTS PASSED"
);
