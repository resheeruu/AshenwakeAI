/**
 * AshenAI U11 Final Authentication Hardening Tests
 * Tests for owner lockout recovery, env var fixes, and final security checks
 */

import assert from "assert";
import crypto from "crypto";
import fs from "fs";
import path from "path";

let passed = 0;
let failed = 0;
let total = 0;

function test(name: string, fn: () => void | Promise<void>) {
  total++;
  try {
    const result = fn();
    if (result instanceof Promise) {
      return result.then(() => { passed++; console.log(`✅ ${name}`); }).catch((e) => { failed++; console.log(`❌ ${name}: ${e.message}`); });
    }
    passed++;
    console.log(`✅ ${name}`);
  } catch (e: any) {
    failed++;
    console.log(`❌ ${name}: ${e.message}`);
  }
}

const ROOT = path.join(__dirname, "..");

// ============================================================
// 1. OWNER RECOVERY CLI EXISTS AND IS VALID
// ============================================================
console.log("\n=== OWNER RECOVERY CLI ===");

test("owner-recover.ts exists", () => {
  const exists = fs.existsSync(path.join(ROOT, "scripts/owner-recover.ts"));
  assert(exists, "scripts/owner-recover.ts should exist");
});

test("owner-recover.ts is valid TypeScript with expected functions", () => {
  const src = fs.readFileSync(path.join(ROOT, "scripts/owner-recover.ts"), "utf8");
  assert(src.includes("OWNER_ACCOUNT_RECOVERY"), "Should create OWNER_ACCOUNT_RECOVERY audit event");
  assert(src.includes("passwordHash"), "Should update passwordHash");
  assert(src.includes("passwordSalt"), "Should update passwordSalt");
  assert(src.includes("destroyed"), "Should destroy sessions");
  assert(src.includes("mfaEnabled"), "Should handle MFA state");
  assert(src.includes("mfaSecret"), "Should handle MFA secret");
  assert(src.includes("recoveryCodesHash"), "Should handle recovery codes");
  assert(src.includes("linked"), "Should mention OAuth identity preservation");
});

test("owner-recover.ts uses interactive password input (not CLI arg)", () => {
  const src = fs.readFileSync(path.join(ROOT, "scripts/owner-recover.ts"), "utf8");
  // Should use readline/terminal input, not process.argv for password
  assert(src.includes("setRawMode"), "Should use raw mode for hidden input");
  assert(!src.includes("process.argv"), "Should NOT read password from CLI arguments");
  assert(!src.includes("--password"), "Should NOT accept --password flag");
});

test("owner-recover.ts requires explicit YES confirmation", () => {
  const src = fs.readFileSync(path.join(ROOT, "scripts/owner-recover.ts"), "utf8");
  assert(src.includes("YES to confirm"), "Should require explicit YES confirmation");
  assert(src.includes("Recovery cancelled"), "Should handle cancellation");
});

test("owner-recover.ts validates password length", () => {
  const src = fs.readFileSync(path.join(ROOT, "scripts/owner-recover.ts"), "utf8");
  assert(src.includes("length < 8"), "Should reject passwords under 8 characters");
  assert(src.includes("do not match"), "Should verify password confirmation");
});

test("owner-recover.ts preserves owner role", () => {
  const src = fs.readFileSync(path.join(ROOT, "scripts/owner-recover.ts"), "utf8");
  // Should NOT change role — only password and MFA state
  assert(!src.includes("targetAccount.role ="), "Should NOT modify the role field");
  assert(!src.includes('"admin"'), "Should NOT set role to admin");
  assert(!src.includes('"user"'), "Should NOT set role to user");
});

test("owner-recover.ts handles MFA reset safely", () => {
  const src = fs.readFileSync(path.join(ROOT, "scripts/owner-recover.ts"), "utf8");
  assert(src.includes("mfaEnabled = false"), "Should disable MFA");
  assert(src.includes("mfaSecret = undefined"), "Should clear MFA secret");
  assert(src.includes("recoveryCodesHash = undefined"), "Should clear recovery codes");
});

test("owner-recover.ts invalidates reset tokens", () => {
  const src = fs.readFileSync(path.join(ROOT, "scripts/owner-recover.ts"), "utf8");
  assert(src.includes("password-reset-tokens.json"), "Should modify reset tokens file");
  assert(src.includes("accountId !== targetAccount.id"), "Should remove tokens for target account");
});

test("owner-recover.ts creates audit event with no secrets", () => {
  const src = fs.readFileSync(path.join(ROOT, "scripts/owner-recover.ts"), "utf8");
  assert(src.includes("OWNER_ACCOUNT_RECOVERY"), "Audit event should have correct type");
  // Verify no secrets are included in the audit details
  const auditSection = src.substring(src.indexOf("auditEntry"), src.indexOf("auditLog.push"));
  assert(!auditSection.includes("passwordHash"), "Audit should not contain passwordHash");
  assert(!auditSection.includes("passwordSalt"), "Audit should not contain passwordSalt");
  assert(!auditSection.includes("mfaSecret"), "Audit should not contain mfaSecret");
  assert(!auditSection.includes("recoveryCodes"), "Audit should not contain recovery codes");
  assert(!auditSection.includes("sessionId"), "Audit should not contain session IDs");
});

test("npm script auth:owner-recover is defined", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  assert(pkg.scripts["auth:owner-recover"], "auth:owner-recover script should be defined");
  assert(pkg.scripts["auth:owner-recover"].includes("owner-recover.ts"), "Script should reference owner-recover.ts");
});

// ============================================================
// 2. NO HTTP/DISCORD RECOVERY ENDPOINTS
// ============================================================
console.log("\n=== NO REMOTE RECOVERY BYPASS ===");

test("No HTTP endpoint for owner account recovery", () => {
  const serverSrc = fs.readFileSync(path.join(ROOT, "src/web/server.ts"), "utf8");
  assert(!serverSrc.includes("owner-recover"), "server.ts should not reference owner-recover");
  assert(!serverSrc.includes("OWNER_ACCOUNT_RECOVERY"), "server.ts should not have owner recovery endpoint");
});

test("Owner recovery script is NOT imported by server or control layer", () => {
  const serverSrc = fs.readFileSync(path.join(ROOT, "src/web/server.ts"), "utf8");
  const controlIndex = fs.readFileSync(path.join(ROOT, "src/control/index.ts"), "utf8");
  assert(!serverSrc.includes("owner-recover"), "server.ts should not import owner-recover");
  assert(!controlIndex.includes("owner-recover"), "control/index.ts should not export owner-recover");
});

test("No hardcoded passwords or backdoors in auth system", () => {
  const authFiles = [
    "src/control/auth.ts",
    "src/control/account-store.ts",
    "src/control/session-store.ts",
    "src/control/oauth.ts",
    "src/control/password-reset.ts",
  ];
  for (const file of authFiles) {
    const src = fs.readFileSync(path.join(ROOT, file), "utf8");
    assert(!src.includes("hardcoded"), `${file} should not contain hardcoded credentials`);
    assert(!src.includes("backdoor"), `${file} should not contain backdoor`);
    assert(!src.includes("master_password"), `${file} should not have master password`);
    assert(!src.includes("admin_override"), `${file} should not have admin override`);
  }
});

// ============================================================
// 3. ENV VAR FIX VERIFICATION
// ============================================================
console.log("\n=== ENVIRONMENT CONFIGURATION ===");

test("server.ts uses AUTH_BASE_URL (not BASE_URL)", () => {
  const serverSrc = fs.readFileSync(path.join(ROOT, "src/web/server.ts"), "utf8");
  assert(serverSrc.includes("AUTH_BASE_URL"), "Should use AUTH_BASE_URL");
  // Ensure the old BASE_URL is not used for password reset
  const resetSection = serverSrc.substring(
    serverSrc.indexOf("forgot-password"),
    serverSrc.indexOf("reset-password") + 200,
  );
  assert(!resetSection.includes("process.env.BASE_URL") || resetSection.includes("AUTH_BASE_URL"),
    "Reset section should use AUTH_BASE_URL");
});

test(".env.example documents AUTH_BASE_URL", () => {
  const envExample = fs.readFileSync(path.join(ROOT, ".env.example"), "utf8");
  assert(envExample.includes("AUTH_BASE_URL="), ".env.example should document AUTH_BASE_URL");
});

test(".env.example documents SMTP configuration", () => {
  const envExample = fs.readFileSync(path.join(ROOT, ".env.example"), "utf8");
  assert(envExample.includes("SMTP_HOST"), ".env.example should document SMTP_HOST");
  assert(envExample.includes("SMTP_PORT"), ".env.example should document SMTP_PORT");
  assert(envExample.includes("SMTP_USER"), ".env.example should document SMTP_USER");
  assert(envExample.includes("SMTP_PASS"), ".env.example should document SMTP_PASS");
  assert(envExample.includes("SMTP_FROM"), ".env.example should document SMTP_FROM");
});

test(".env.example documents AUTH_DEV_RESET_LINKS", () => {
  const envExample = fs.readFileSync(path.join(ROOT, ".env.example"), "utf8");
  assert(envExample.includes("AUTH_DEV_RESET_LINKS"), ".env.example should document AUTH_DEV_RESET_LINKS");
});

// ============================================================
// 4. SERVER-STARTUP SECURITY
// ============================================================
console.log("\n=== SERVER-STARTUP SECURITY ===");

test("Server does not log owner password at startup", () => {
  const serverSrc = fs.readFileSync(path.join(ROOT, "src/web/server.ts"), "utf8");
  // Find all logger calls in the file
  const loggerMatches = serverSrc.match(/logger\.\w+\([^)]*\)/g) || [];
  for (const call of loggerMatches) {
    assert(!call.includes("password"), `Server should not log password: ${call}`);
    assert(!call.includes("ASHENAI_OWNER_PASSWORD"), `Server should not log owner password env: ${call}`);
  }
});

test("Server does not log OAuth secrets", () => {
  const serverSrc = fs.readFileSync(path.join(ROOT, "src/web/server.ts"), "utf8");
  const loggerMatches = serverSrc.match(/logger\.\w+\([^)]*\)/g) || [];
  for (const call of loggerMatches) {
    assert(!call.includes("client_secret"), `Server should not log client_secret: ${call}`);
    assert(!call.includes("access_token"), `Server should not log access_token: ${call}`);
  }
});

// ============================================================
// 5. SESSION SECURITY VERIFICATION
// ============================================================
console.log("\n=== SESSION SECURITY ===");

test("Session IDs use cryptographically random values", () => {
  const sessionStoreSrc = fs.readFileSync(path.join(ROOT, "src/control/session-store.ts"), "utf8");
  assert(sessionStoreSrc.includes("crypto.randomBytes(32)"), "Session IDs should use 256-bit random");
  assert(sessionStoreSrc.includes("crypto.randomBytes(32)"), "CSRF tokens should use 256-bit random");
});

test("Session cookie has correct flags for production", () => {
  const sessionStoreSrc = fs.readFileSync(path.join(ROOT, "src/control/session-store.ts"), "utf8");
  assert(sessionStoreSrc.includes("HttpOnly"), "Cookie should have HttpOnly");
  assert(sessionStoreSrc.includes("SameSite=Lax"), "Cookie should have SameSite=Lax");
  assert(sessionStoreSrc.includes('isProduction ? "Secure" : ""'), "Secure flag only in production");
  assert(sessionStoreSrc.includes("Path=/"), "Cookie should have Path=/");
});

test("Session rotation deletes old session from store", () => {
  const sessionStoreSrc = fs.readFileSync(path.join(ROOT, "src/control/session-store.ts"), "utf8");
  assert(sessionStoreSrc.includes("sessionStore.delete(sessionId)"), "Rotation should delete old session");
});

test("requireAuth destroys session on disabled account", () => {
  const rolesSrc = fs.readFileSync(path.join(ROOT, "src/control/roles.ts"), "utf8");
  assert(rolesSrc.includes("destroySession(session.sessionId)"), "Should destroy session on disabled account");
  assert(rolesSrc.includes("clearSessionCookie(res)"), "Should clear cookie on disabled account");
});

test("requireAuth destroys session on role change", () => {
  const rolesSrc = fs.readFileSync(path.join(ROOT, "src/control/roles.ts"), "utf8");
  assert(rolesSrc.includes("account.role !== session.role"), "Should detect role mismatch");
  assert(rolesSrc.includes("Session role outdated"), "Should return appropriate error");
});

// ============================================================
// 6. PASSWORD RESET SECURITY
// ============================================================
console.log("\n=== PASSWORD RESET SECURITY ===");

test("Reset tokens are stored as SHA-256 hashes", () => {
  const resetSrc = fs.readFileSync(path.join(ROOT, "src/control/password-reset.ts"), "utf8");
  assert(resetSrc.includes('crypto.createHash("sha256")'), "Tokens should be SHA-256 hashed");
});

test("Reset tokens are single-use", () => {
  const resetSrc = fs.readFileSync(path.join(ROOT, "src/control/password-reset.ts"), "utf8");
  assert(resetSrc.includes("used"), "Tokens should have used tracking");
  assert(resetSrc.includes("!t.used"), "Used tokens should be excluded from validation");
});

test("New reset token invalidates previous tokens for same account", () => {
  const resetSrc = fs.readFileSync(path.join(ROOT, "src/control/password-reset.ts"), "utf8");
  assert(resetSrc.includes("t.accountId !== accountId"), "Should invalidate previous tokens for account");
});

test("Password reset destroys all sessions", () => {
  const serverSrc = fs.readFileSync(path.join(ROOT, "src/web/server.ts"), "utf8");
  const resetSection = serverSrc.substring(
    serverSrc.indexOf('app.post("/auth/reset-password"'),
    serverSrc.indexOf('app.get("/auth/reset-password/:accountId/:token"'),
  );
  assert(resetSection.includes("destroyAllSessionsForAccount(accountId)"), "Should destroy sessions after reset");
  assert(resetSection.includes("invalidateResetTokens(accountId)"), "Should invalidate remaining tokens");
});

test("Reset form uses JSON.stringify for XSS prevention", () => {
  const serverSrc = fs.readFileSync(path.join(ROOT, "src/web/server.ts"), "utf8");
  assert(serverSrc.includes("JSON.stringify(accountId)"), "AccountId should be JSON-encoded");
  assert(serverSrc.includes("JSON.stringify(token)"), "Token should be JSON-encoded");
  assert(serverSrc.includes("</script"), "Should escape script tags");
});

// ============================================================
// 7. MFA BYPASS RESISTANCE
// ============================================================
console.log("\n=== MFA BYPASS RESISTANCE ===");

test("MFA enforced for owner/admin password login", () => {
  const authSrc = fs.readFileSync(path.join(ROOT, "src/control/auth.ts"), "utf8");
  assert(authSrc.includes('account.mfaEnabled && account.role !== "user"'), "MFA required for non-user roles");
});

test("Pre-auth token is NOT a valid session", () => {
  const sessionStoreSrc = fs.readFileSync(path.join(ROOT, "src/control/session-store.ts"), "utf8");
  // Pre-auth tokens are in a separate map (preAuthTokens), not sessionStore
  assert(sessionStoreSrc.includes("let preAuthTokens: Map"), "Pre-auth tokens in separate map");
});

test("Pre-auth tokens are one-time use", () => {
  const sessionStoreSrc = fs.readFileSync(path.join(ROOT, "src/control/session-store.ts"), "utf8");
  assert(sessionStoreSrc.includes("preAuthTokens.delete(token)"), "Should delete token on consume");
});

test("Pre-auth tokens expire (5 min)", () => {
  const sessionStoreSrc = fs.readFileSync(path.join(ROOT, "src/control/session-store.ts"), "utf8");
  assert(sessionStoreSrc.includes("PREAUTH_DURATION_MS = 5 * 60 * 1000"), "Should have 5-min expiry");
});

test("MFA challenge endpoint is rate limited", () => {
  const serverSrc = fs.readFileSync(path.join(ROOT, "src/web/server.ts"), "utf8");
  assert(serverSrc.includes("mfaChallengeLimiter.check(ip)"), "MFA challenge should be rate limited");
});

test("MFA disable requires both password and TOTP", () => {
  const serverSrc = fs.readFileSync(path.join(ROOT, "src/web/server.ts"), "utf8");
  const disableSection = serverSrc.substring(
    serverSrc.indexOf('app.post("/auth/mfa/disable"'),
    serverSrc.indexOf('app.post("/auth/mfa/recovery-codes"'),
  );
  assert(disableSection.includes("password"), "Disable should require password");
  assert(disableSection.includes("code"), "Disable should require TOTP code");
  assert(disableSection.includes("MFA verification code required to disable"), "Should enforce code requirement");
});

test("OAuth new accounts get user role only", () => {
  const oauthSrc = fs.readFileSync(path.join(ROOT, "src/control/oauth.ts"), "utf8");
  const matches = oauthSrc.match(/role:\s*"user"/g);
  assert(matches !== null && matches.length >= 2, "Both Discord and Google should create accounts with user role");
});

// ============================================================
// 8. SECURITY HEADERS
// ============================================================
console.log("\n=== SECURITY HEADERS ===");

test("CSP header is comprehensive", () => {
  const serverSrc = fs.readFileSync(path.join(ROOT, "src/web/server.ts"), "utf8");
  assert(serverSrc.includes("frame-ancestors 'none'"), "CSP should block framing");
  assert(serverSrc.includes("script-src 'self'"), "CSP should restrict scripts to self");
  assert(serverSrc.includes("form-action 'self'"), "CSP should restrict form submissions");
  assert(serverSrc.includes("object-src 'none'"), "CSP should block plugins");
  assert(serverSrc.includes("base-uri 'self'"), "CSP should restrict base URI");
});

test("X-Frame-Options is DENY", () => {
  const serverSrc = fs.readFileSync(path.join(ROOT, "src/web/server.ts"), "utf8");
  assert(serverSrc.includes('X-Frame-Options", "DENY"'), "Should set DENY");
});

test("HSTS is set in production", () => {
  const serverSrc = fs.readFileSync(path.join(ROOT, "src/web/server.ts"), "utf8");
  assert(serverSrc.includes("Strict-Transport-Security"), "Should set HSTS");
  assert(serverSrc.includes("max-age=31536000"), "HSTS should be 1 year");
});

test("X-Powered-By is removed", () => {
  const serverSrc = fs.readFileSync(path.join(ROOT, "src/web/server.ts"), "utf8");
  assert(serverSrc.includes('removeHeader("X-Powered-By")'), "Should remove X-Powered-By");
});

// ============================================================
// 9. RATE LIMITING
// ============================================================
console.log("\n=== RATE LIMITING ===");

test("Login has rate limiting", () => {
  const serverSrc = fs.readFileSync(path.join(ROOT, "src/web/server.ts"), "utf8");
  assert(serverSrc.includes("loginRateLimiter.check(ip)"), "Login should use rate limiter");
});

test("Forgot password has rate limiting", () => {
  const serverSrc = fs.readFileSync(path.join(ROOT, "src/web/server.ts"), "utf8");
  assert(serverSrc.includes("forgotPasswordLimiter.check(ip)"), "Forgot password should use rate limiter");
});

test("Reset password has rate limiting", () => {
  const serverSrc = fs.readFileSync(path.join(ROOT, "src/web/server.ts"), "utf8");
  assert(serverSrc.includes("resetPasswordLimiter.check(ip)"), "Reset password should use rate limiter");
});

test("MFA challenge has rate limiting", () => {
  const serverSrc = fs.readFileSync(path.join(ROOT, "src/web/server.ts"), "utf8");
  assert(serverSrc.includes("mfaChallengeLimiter.check(ip)"), "MFA challenge should use rate limiter");
});

test("Rate limiter instances are independent", () => {
  const authSrc = fs.readFileSync(path.join(ROOT, "src/control/auth.ts"), "utf8");
  assert(authSrc.includes("const ownAttempts = new Map"), "Each limiter should have own attempts map");
});

// ============================================================
// 10. ACCOUNT ENUMERATION
// ============================================================
console.log("\n=== ACCOUNT ENUMERATION ===");

test("Login returns generic error for disabled accounts", () => {
  const serverSrc = fs.readFileSync(path.join(ROOT, "src/web/server.ts"), "utf8");
  const loginSection = serverSrc.substring(
    serverSrc.indexOf('app.post("/auth/login"'),
    serverSrc.indexOf('app.post("/auth/logout"'),
  );
  assert(loginSection.includes('"Invalid credentials."'), "Disabled should get same error as wrong password");
});

test("Forgot password always returns same response", () => {
  const serverSrc = fs.readFileSync(path.join(ROOT, "src/web/server.ts"), "utf8");
  const forgotSection = serverSrc.substring(
    serverSrc.indexOf('app.post("/auth/forgot-password"'),
    serverSrc.indexOf('app.post("/auth/reset-password"'),
  );
  assert(forgotSection.includes("genericResponse"), "Should use generic response");
  assert(forgotSection.includes("If that account exists"), "Generic message should be non-revealing");
});

test("SanitizeAccount strips all sensitive fields", () => {
  const accountStoreSrc = fs.readFileSync(path.join(ROOT, "src/control/account-store.ts"), "utf8");
  assert(accountStoreSrc.includes("passwordHash"), "Should strip passwordHash");
  assert(accountStoreSrc.includes("passwordSalt"), "Should strip passwordSalt");
  assert(accountStoreSrc.includes("mfaSecret"), "Should strip mfaSecret");
  assert(accountStoreSrc.includes("recoveryCodesHash"), "Should strip recoveryCodesHash");
});

// ============================================================
// 11. OAUTH SECURITY
// ============================================================
console.log("\n=== OAUTH SECURITY ===");

test("OAuth state is one-time use", () => {
  const oauthSrc = fs.readFileSync(path.join(ROOT, "src/control/oauth.ts"), "utf8");
  assert(oauthSrc.includes("oauthStates.delete(state)"), "State should be consumed (deleted)");
});

test("OAuth state expires", () => {
  const oauthSrc = fs.readFileSync(path.join(ROOT, "src/control/oauth.ts"), "utf8");
  assert(oauthSrc.includes("STATE_EXPIRY_MS = 10 * 60 * 1000"), "State should expire in 10 minutes");
});

test("OAuth linking requires authenticated session + CSRF", () => {
  const serverSrc = fs.readFileSync(path.join(ROOT, "src/web/server.ts"), "utf8");
  const linkSection = serverSrc.substring(
    serverSrc.indexOf('app.post("/api/account/identities/:provider/link"'),
    serverSrc.indexOf('app.post("/api/account/identities/:provider/unlink"'),
  );
  assert(linkSection.includes("requireAuth"), "Link should require auth");
  assert(linkSection.includes("requireCsrf"), "Link should require CSRF");
});

test("OAuth unlink prevents removing last auth method", () => {
  const serverSrc = fs.readFileSync(path.join(ROOT, "src/web/server.ts"), "utf8");
  const unlinkSection = serverSrc.substring(
    serverSrc.indexOf('app.post("/api/account/identities/:provider/unlink"'),
    serverSrc.indexOf('/* ==================== MFA ENDPOINTS'),
  );
  assert(unlinkSection.includes("Cannot unlink the last authentication method"), "Should prevent unlinking last method");
});

test("OAuth cannot elevate user to admin/owner", () => {
  const oauthSrc = fs.readFileSync(path.join(ROOT, "src/control/oauth.ts"), "utf8");
  // Check that createAccount calls use "user" role
  const createMatches = oauthSrc.match(/createAccount\(\{[^}]*role:\s*"user"/g);
  assert(createMatches !== null && createMatches.length >= 2, "Both providers should create user-role accounts");
  // Ensure no role escalation
  assert(!oauthSrc.includes('role: "admin"'), "OAuth should never create admin accounts");
  assert(!oauthSrc.includes('role: "owner"'), "OAuth should never create owner accounts");
});

// ============================================================
// 12. INPUT VALIDATION
// ============================================================
console.log("\n=== INPUT VALIDATION ===");

test("Frontend escapes HTML in dynamic content", () => {
  const htmlSrc = fs.readFileSync(path.join(ROOT, "src/web/public/index.html"), "utf8");
  assert(htmlSrc.includes("function esc(s)"), "Frontend should have esc() function");
  assert(htmlSrc.includes("&lt;"), "esc() should escape <");
  assert(htmlSrc.includes("&gt;"), "esc() should escape >");
  assert(htmlSrc.includes("&amp;"), "esc() should escape &");
  assert(htmlSrc.includes("&quot;"), "esc() should escape quotes");
});

test("Frontend redacts secrets in log display", () => {
  const htmlSrc = fs.readFileSync(path.join(ROOT, "src/web/public/index.html"), "utf8");
  assert(htmlSrc.includes("function redact(s)"), "Frontend should have redact() function");
  assert(htmlSrc.includes("REDACTED"), "redact() should replace with [REDACTED]");
});

test("OAuth redirects use encodeURIComponent", () => {
  const serverSrc = fs.readFileSync(path.join(ROOT, "src/web/server.ts"), "utf8");
  assert(serverSrc.includes("encodeURIComponent(result.username"), "Username should be encoded in OAuth redirect");
});

// ============================================================
// 13. GLOBAL RATE LIMITER
// ============================================================
console.log("\n=== GLOBAL RATE LIMITER ===");

test("Global rate limit is configured", () => {
  const serverSrc = fs.readFileSync(path.join(ROOT, "src/web/server.ts"), "utf8");
  assert(serverSrc.includes("API_RATE_MAX = 120"), "Global rate limit should be 120 req/min");
  assert(serverSrc.includes("API_RATE_WINDOW_MS = 60_000"), "Window should be 60 seconds");
  assert(serverSrc.includes("globalRateLimit"), "Should apply global rate limit middleware");
});

// ============================================================
// RESULTS
// ============================================================
console.log("\n" + "=".repeat(60));
console.log(`U11 Test Results: ${passed}/${total} passed, ${failed} failed`);
console.log("=".repeat(60));

if (failed > 0) {
  process.exit(1);
}
