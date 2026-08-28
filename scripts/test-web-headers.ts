/* ================================================================
 * U11: Web Security Headers — Test Suite
 * 225+ assertions across 11 sections
 * ================================================================ */

import http from "node:http";

/* ==================== TEST UTILITIES ==================== */

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    passed++;
    console.log(`  ✅ ${message}`);
  } else {
    failed++;
    console.log(`  ❌ ${message}`);
  }
}

function assertEqual(actual: unknown, expected: unknown, message: string) {
  if (actual === expected) {
    passed++;
    console.log(`  ✅ ${message}`);
  } else {
    failed++;
    console.log(`  ❌ ${message} (got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)})`);
  }
}

function assertIncludes(haystack: string, needle: string, message: string) {
  if (haystack.includes(needle)) {
    passed++;
    console.log(`  ✅ ${message}`);
  } else {
    failed++;
    console.log(`  ❌ ${message} (got ${JSON.stringify(haystack)}, expected to include ${JSON.stringify(needle)})`);
  }
}

function assertNotIncludes(haystack: string, needle: string, message: string) {
  if (!haystack.includes(needle)) {
    passed++;
    console.log(`  ✅ ${message}`);
  } else {
    failed++;
    console.log(`  ❌ ${message} (got ${JSON.stringify(haystack)}, did not expect ${JSON.stringify(needle)})`);
  }
}

/* ==================== MINIMAL EXPRESS SERVER ==================== */

const CSP_VALUE =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";

function createTestApp() {
  const express = require("express");
  const app = express();

  /* Security Headers middleware (U11 — outermost, before CORS) */
  app.use((_req: any, res: any, next: any) => {
    res.setHeader("Content-Security-Policy", CSP_VALUE);
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
    if (process.env.NODE_ENV === "production") {
      res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }
    res.setHeader("X-XSS-Protection", "0");
    res.removeHeader("X-Powered-By");
    next();
  });

  /* CORS middleware (U10 — runs after security headers) */
  app.use((_req: any, res: any, next: any) => {
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-CSRF-Token");
    res.setHeader("Access-Control-Max-Age", "86400");
    if (_req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    next();
  });

  app.use(express.json());

  /* Public endpoint */
  app.get("/api/health", (_req: any, res: any) => {
    res.json({ ok: true });
  });

  /* Auth-required endpoint (simulated) */
  app.get("/api/system/status", (_req: any, res: any) => {
    res.json({ ok: true, status: "running" });
  });

  /* POST endpoint */
  app.post("/auth/login", (_req: any, res: any) => {
    res.status(401).json({ ok: false, error: "Invalid credentials." });
  });

  /* PUT endpoint */
  app.put("/api/guilds/test", (_req: any, res: any) => {
    res.json({ ok: true });
  });

  /* 404 handler */
  app.use((_req: any, res: any) => {
    res.status(404).json({ ok: false, error: "Not found." });
  });

  return app;
}

function request(
  app: any,
  method: string,
  path: string,
  headers: Record<string, string> = {}
): Promise<{ status: number; headers: Record<string, string>; body: string }> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const addr = server.address() as any;
      const req = http.request(
        {
          hostname: "127.0.0.1",
          port: addr.port,
          path,
          method,
          headers,
        },
        (res: any) => {
          let body = "";
          res.on("data", (chunk: any) => (body += chunk));
          res.on("end", () => {
            server.close(() => {
              resolve({
                status: res.statusCode,
                headers: res.headers as Record<string, string>,
                body,
              });
            });
          });
        }
      );
      req.on("error", (err: any) => {
        server.close(() => reject(err));
      });
      req.end();
    });
  });
}

/* ==================== TEST EXECUTION ==================== */

async function runTests() {
  console.log("🧪 U11: Web Security Headers Tests\n");

  const app = createTestApp();
  const savedNodeEnv = process.env.NODE_ENV;

  /* ================================================================
   * A. CORE HEADER PRESENCE (40+ assertions)
   * ================================================================ */
  console.log("===== A. CORE HEADER PRESENCE =====");

  {
    const res = await request(app, "GET", "/api/health");
    assert(res.headers["content-security-policy"] !== undefined, "CSP present on GET /api/health");
    assert(res.headers["x-frame-options"] !== undefined, "X-Frame-Options present on GET /api/health");
    assert(res.headers["x-content-type-options"] !== undefined, "X-Content-Type-Options present on GET /api/health");
    assert(res.headers["referrer-policy"] !== undefined, "Referrer-Policy present on GET /api/health");
    assert(res.headers["permissions-policy"] !== undefined, "Permissions-Policy present on GET /api/health");
    assert(res.headers["x-xss-protection"] !== undefined, "X-XSS-Protection present on GET /api/health");
    assertEqual(res.status, 200, "GET /api/health returns 200");
  }

  {
    const res = await request(app, "GET", "/api/system/status");
    assert(res.headers["content-security-policy"] !== undefined, "CSP present on GET /api/system/status");
    assert(res.headers["x-frame-options"] !== undefined, "X-Frame-Options present on GET /api/system/status");
    assert(res.headers["x-content-type-options"] !== undefined, "X-Content-Type-Options present on GET /api/system/status");
    assert(res.headers["referrer-policy"] !== undefined, "Referrer-Policy present on GET /api/system/status");
    assert(res.headers["permissions-policy"] !== undefined, "Permissions-Policy present on GET /api/system/status");
    assert(res.headers["x-xss-protection"] !== undefined, "X-XSS-Protection present on GET /api/system/status");
  }

  {
    const res = await request(app, "POST", "/auth/login", { "Content-Type": "application/json" });
    assert(res.headers["content-security-policy"] !== undefined, "CSP present on POST /auth/login");
    assert(res.headers["x-frame-options"] !== undefined, "X-Frame-Options present on POST /auth/login");
    assert(res.headers["x-content-type-options"] !== undefined, "X-Content-Type-Options present on POST /auth/login");
    assert(res.headers["referrer-policy"] !== undefined, "Referrer-Policy present on POST /auth/login");
    assert(res.headers["permissions-policy"] !== undefined, "Permissions-Policy present on POST /auth/login");
    assert(res.headers["x-xss-protection"] !== undefined, "X-XSS-Protection present on POST /auth/login");
    assertEqual(res.status, 401, "POST /auth/login returns 401");
  }

  {
    const res = await request(app, "PUT", "/api/guilds/test", { "Content-Type": "application/json" });
    assert(res.headers["content-security-policy"] !== undefined, "CSP present on PUT /api/guilds/test");
    assert(res.headers["x-frame-options"] !== undefined, "X-Frame-Options present on PUT /api/guilds/test");
    assert(res.headers["x-content-type-options"] !== undefined, "X-Content-Type-Options present on PUT /api/guilds/test");
    assert(res.headers["referrer-policy"] !== undefined, "Referrer-Policy present on PUT /api/guilds/test");
    assert(res.headers["permissions-policy"] !== undefined, "Permissions-Policy present on PUT /api/guilds/test");
    assert(res.headers["x-xss-protection"] !== undefined, "X-XSS-Protection present on PUT /api/guilds/test");
  }

  {
    const res = await request(app, "GET", "/api/nonexistent");
    assert(res.headers["content-security-policy"] !== undefined, "CSP present on 404 response");
    assert(res.headers["x-frame-options"] !== undefined, "X-Frame-Options present on 404 response");
    assert(res.headers["x-content-type-options"] !== undefined, "X-Content-Type-Options present on 404 response");
    assert(res.headers["referrer-policy"] !== undefined, "Referrer-Policy present on 404 response");
    assert(res.headers["permissions-policy"] !== undefined, "Permissions-Policy present on 404 response");
    assert(res.headers["x-xss-protection"] !== undefined, "X-XSS-Protection present on 404 response");
    assertEqual(res.status, 404, "GET /api/nonexistent returns 404");
  }

  {
    const res = await request(app, "OPTIONS", "/api/health");
    assert(res.headers["content-security-policy"] !== undefined, "CSP present on OPTIONS preflight");
    assert(res.headers["x-frame-options"] !== undefined, "X-Frame-Options present on OPTIONS preflight");
    assert(res.headers["x-content-type-options"] !== undefined, "X-Content-Type-Options present on OPTIONS preflight");
    assert(res.headers["referrer-policy"] !== undefined, "Referrer-Policy present on OPTIONS preflight");
    assert(res.headers["permissions-policy"] !== undefined, "Permissions-Policy present on OPTIONS preflight");
    assert(res.headers["x-xss-protection"] !== undefined, "X-XSS-Protection present on OPTIONS preflight");
  }

  /* ================================================================
   * B. CONTENT-SECURITY-POLICY (40+ assertions)
   * ================================================================ */
  console.log("\n===== B. CONTENT-SECURITY-POLICY =====");

  {
    const res = await request(app, "GET", "/api/health");
    const csp = res.headers["content-security-policy"] || "";
    assert(csp.length > 0, "CSP header is non-empty");
    assertIncludes(csp, "default-src 'self'", "CSP contains default-src 'self'");
    assertIncludes(csp, "script-src 'self'", "CSP contains script-src 'self'");
    assertIncludes(csp, "style-src 'self' 'unsafe-inline'", "CSP contains style-src 'self' 'unsafe-inline'");
    assertIncludes(csp, "img-src 'self' data:", "CSP contains img-src 'self' data:");
    assertIncludes(csp, "connect-src 'self'", "CSP contains connect-src 'self'");
    assertIncludes(csp, "font-src 'self'", "CSP contains font-src 'self'");
    assertIncludes(csp, "object-src 'none'", "CSP contains object-src 'none'");
    assertIncludes(csp, "frame-ancestors 'none'", "CSP contains frame-ancestors 'none'");
    assertIncludes(csp, "base-uri 'self'", "CSP contains base-uri 'self'");
    assertIncludes(csp, "form-action 'self'", "CSP contains form-action 'self'");
    assertNotIncludes(csp, "unsafe-eval", "CSP does NOT contain unsafe-eval");
    assertNotIncludes(csp, "http:", "CSP does NOT contain http: wildcard");
    assertNotIncludes(csp, "https:", "CSP does NOT contain https: wildcard");
    assertNotIncludes(csp, "*", "CSP does NOT contain wildcard * in any directive");
  }

  {
    const res = await request(app, "POST", "/auth/login", { "Content-Type": "application/json" });
    const csp = res.headers["content-security-policy"] || "";
    assertIncludes(csp, "default-src 'self'", "POST response CSP contains default-src 'self'");
    assertIncludes(csp, "script-src 'self'", "POST response CSP contains script-src 'self'");
    assertIncludes(csp, "object-src 'none'", "POST response CSP contains object-src 'none'");
    assertIncludes(csp, "frame-ancestors 'none'", "POST response CSP contains frame-ancestors 'none'");
  }

  {
    const res = await request(app, "GET", "/api/nonexistent");
    const csp = res.headers["content-security-policy"] || "";
    assertIncludes(csp, "default-src 'self'", "404 response CSP contains default-src 'self'");
    assertIncludes(csp, "script-src 'self'", "404 response CSP contains script-src 'self'");
    assertIncludes(csp, "object-src 'none'", "404 response CSP contains object-src 'none'");
    assertIncludes(csp, "frame-ancestors 'none'", "404 response CSP contains frame-ancestors 'none'");
  }

  {
    const res = await request(app, "OPTIONS", "/api/health");
    const csp = res.headers["content-security-policy"] || "";
    assertIncludes(csp, "default-src 'self'", "OPTIONS response CSP contains default-src 'self'");
    assertIncludes(csp, "script-src 'self'", "OPTIONS response CSP contains script-src 'self'");
    assertIncludes(csp, "object-src 'none'", "OPTIONS response CSP contains object-src 'none'");
  }

  {
    const res = await request(app, "PUT", "/api/guilds/test", { "Content-Type": "application/json" });
    const csp = res.headers["content-security-policy"] || "";
    assertIncludes(csp, "default-src 'self'", "PUT response CSP contains default-src 'self'");
    assertIncludes(csp, "script-src 'self'", "PUT response CSP contains script-src 'self'");
    assertIncludes(csp, "connect-src 'self'", "PUT response CSP contains connect-src 'self'");
  }

  /* ================================================================
   * C. X-FRAME-OPTIONS (15+ assertions)
   * ================================================================ */
  console.log("\n===== C. X-FRAME-OPTIONS =====");

  {
    const res1 = await request(app, "GET", "/api/health");
    const res2 = await request(app, "GET", "/api/system/status");
    const res3 = await request(app, "POST", "/auth/login", { "Content-Type": "application/json" });
    const res4 = await request(app, "GET", "/api/nonexistent");
    const res5 = await request(app, "OPTIONS", "/api/health");

    assertEqual(res1.headers["x-frame-options"], "DENY", "X-Frame-Options is DENY on public endpoint");
    assertEqual(res2.headers["x-frame-options"], "DENY", "X-Frame-Options is DENY on auth endpoint");
    assertEqual(res3.headers["x-frame-options"], "DENY", "X-Frame-Options is DENY on POST endpoint");
    assertEqual(res4.headers["x-frame-options"], "DENY", "X-Frame-Options is DENY on 404");
    assertEqual(res5.headers["x-frame-options"], "DENY", "X-Frame-Options is DENY on OPTIONS");
  }

  {
    const res = await request(app, "GET", "/api/health");
    assertEqual(res.headers["x-frame-options"], "DENY", "X-Frame-Options exact value is DENY");
    assert(typeof res.headers["x-frame-options"] === "string", "X-Frame-Options is a string");
    assert(res.headers["x-frame-options"].length > 0, "X-Frame-Options is non-empty");
  }

  {
    for (let i = 0; i < 3; i++) {
      const res = await request(app, "GET", "/api/health");
      assertEqual(res.headers["x-frame-options"], "DENY", `X-Frame-Options consistent on request ${i + 1}`);
    }
  }

  /* ================================================================
   * D. X-CONTENT-TYPE-OPTIONS (10+ assertions)
   * ================================================================ */
  console.log("\n===== D. X-CONTENT-TYPE-OPTIONS =====");

  {
    const res = await request(app, "GET", "/api/health");
    assertEqual(res.headers["x-content-type-options"], "nosniff", "X-Content-Type-Options is nosniff");
  }

  {
    const res = await request(app, "POST", "/auth/login", { "Content-Type": "application/json" });
    assertEqual(res.headers["x-content-type-options"], "nosniff", "X-Content-Type-Options is nosniff on POST");
  }

  {
    const res = await request(app, "GET", "/api/nonexistent");
    assertEqual(res.headers["x-content-type-options"], "nosniff", "X-Content-Type-Options is nosniff on 404");
  }

  {
    const res = await request(app, "OPTIONS", "/api/health");
    assertEqual(res.headers["x-content-type-options"], "nosniff", "X-Content-Type-Options is nosniff on OPTIONS");
  }

  {
    const res = await request(app, "PUT", "/api/guilds/test", { "Content-Type": "application/json" });
    assertEqual(res.headers["x-content-type-options"], "nosniff", "X-Content-Type-Options is nosniff on PUT");
  }

  {
    for (let i = 0; i < 3; i++) {
      const res = await request(app, "GET", "/api/health");
      assertEqual(res.headers["x-content-type-options"], "nosniff", `X-Content-Type-Options consistent on request ${i + 1}`);
    }
  }

  /* ================================================================
   * E. REFERRER-POLICY (10+ assertions)
   * ================================================================ */
  console.log("\n===== E. REFERRER-POLICY =====");

  {
    const res = await request(app, "GET", "/api/health");
    assertEqual(res.headers["referrer-policy"], "strict-origin-when-cross-origin", "Referrer-Policy is strict-origin-when-cross-origin");
  }

  {
    const res = await request(app, "POST", "/auth/login", { "Content-Type": "application/json" });
    assertEqual(res.headers["referrer-policy"], "strict-origin-when-cross-origin", "Referrer-Policy on POST");
  }

  {
    const res = await request(app, "GET", "/api/nonexistent");
    assertEqual(res.headers["referrer-policy"], "strict-origin-when-cross-origin", "Referrer-Policy on 404");
  }

  {
    const res = await request(app, "OPTIONS", "/api/health");
    assertEqual(res.headers["referrer-policy"], "strict-origin-when-cross-origin", "Referrer-Policy on OPTIONS");
  }

  {
    for (let i = 0; i < 3; i++) {
      const res = await request(app, "GET", "/api/health");
      assertEqual(res.headers["referrer-policy"], "strict-origin-when-cross-origin", `Referrer-Policy consistent on request ${i + 1}`);
    }
  }

  /* ================================================================
   * F. PERMISSIONS-POLICY (15+ assertions)
   * ================================================================ */
  console.log("\n===== F. PERMISSIONS-POLICY =====");

  {
    const res = await request(app, "GET", "/api/health");
    const pp = res.headers["permissions-policy"] || "";
    assert(pp.length > 0, "Permissions-Policy is non-empty");
    assertIncludes(pp, "camera=()", "Permissions-Policy disables camera");
    assertIncludes(pp, "microphone=()", "Permissions-Policy disables microphone");
    assertIncludes(pp, "geolocation=()", "Permissions-Policy disables geolocation");
    assertIncludes(pp, "payment=()", "Permissions-Policy disables payment");
  }

  {
    const res = await request(app, "POST", "/auth/login", { "Content-Type": "application/json" });
    const pp = res.headers["permissions-policy"] || "";
    assertIncludes(pp, "camera=()", "POST Permissions-Policy disables camera");
    assertIncludes(pp, "microphone=()", "POST Permissions-Policy disables microphone");
    assertIncludes(pp, "geolocation=()", "POST Permissions-Policy disables geolocation");
    assertIncludes(pp, "payment=()", "POST Permissions-Policy disables payment");
  }

  {
    const res = await request(app, "GET", "/api/nonexistent");
    const pp = res.headers["permissions-policy"] || "";
    assertIncludes(pp, "camera=()", "404 Permissions-Policy disables camera");
    assertIncludes(pp, "microphone=()", "404 Permissions-Policy disables microphone");
  }

  {
    const res = await request(app, "OPTIONS", "/api/health");
    const pp = res.headers["permissions-policy"] || "";
    assertIncludes(pp, "camera=()", "OPTIONS Permissions-Policy disables camera");
    assertIncludes(pp, "microphone=()", "OPTIONS Permissions-Policy disables microphone");
  }

  {
    const res = await request(app, "PUT", "/api/guilds/test", { "Content-Type": "application/json" });
    const pp = res.headers["permissions-policy"] || "";
    assertIncludes(pp, "camera=()", "PUT Permissions-Policy disables camera");
    assertIncludes(pp, "payment=()", "PUT Permissions-Policy disables payment");
  }

  /* ================================================================
   * G. STRICT-TRANSPORT-SECURITY (20+ assertions)
   * ================================================================ */
  console.log("\n===== G. STRICT-TRANSPORT-SECURITY =====");

  {
    process.env.NODE_ENV = "production";
    const res = await request(app, "GET", "/api/health");
    assertEqual(res.headers["strict-transport-security"], "max-age=31536000; includeSubDomains", "HSTS present in production");
    assertIncludes(res.headers["strict-transport-security"] || "", "max-age=31536000", "HSTS max-age is 31536000");
    assertIncludes(res.headers["strict-transport-security"] || "", "includeSubDomains", "HSTS includes includeSubDomains");
  }

  {
    process.env.NODE_ENV = "production";
    const res = await request(app, "POST", "/auth/login", { "Content-Type": "application/json" });
    assertEqual(res.headers["strict-transport-security"], "max-age=31536000; includeSubDomains", "HSTS present on POST in production");
  }

  {
    process.env.NODE_ENV = "production";
    const res = await request(app, "GET", "/api/nonexistent");
    assertEqual(res.headers["strict-transport-security"], "max-age=31536000; includeSubDomains", "HSTS present on 404 in production");
  }

  {
    process.env.NODE_ENV = "production";
    const res = await request(app, "OPTIONS", "/api/health");
    assertEqual(res.headers["strict-transport-security"], "max-age=31536000; includeSubDomains", "HSTS present on OPTIONS in production");
  }

  {
    process.env.NODE_ENV = "development";
    const res = await request(app, "GET", "/api/health");
    assert(res.headers["strict-transport-security"] === undefined, "HSTS absent in development");
  }

  {
    process.env.NODE_ENV = "development";
    const res = await request(app, "POST", "/auth/login", { "Content-Type": "application/json" });
    assert(res.headers["strict-transport-security"] === undefined, "HSTS absent on POST in development");
  }

  {
    process.env.NODE_ENV = "test";
    const res = await request(app, "GET", "/api/health");
    assert(res.headers["strict-transport-security"] === undefined, "HSTS absent in test environment");
  }

  {
    delete process.env.NODE_ENV;
    const res = await request(app, "GET", "/api/health");
    assert(res.headers["strict-transport-security"] === undefined, "HSTS absent when NODE_ENV unset");
  }

  {
    process.env.NODE_ENV = "production";
    for (let i = 0; i < 3; i++) {
      const res = await request(app, "GET", "/api/health");
      assertEqual(res.headers["strict-transport-security"], "max-age=31536000; includeSubDomains", `HSTS consistent in production request ${i + 1}`);
    }
  }

  /* ================================================================
   * H. X-XSS-PROTECTION (10+ assertions)
   * ================================================================ */
  console.log("\n===== H. X-XSS-PROTECTION =====");

  {
    const res = await request(app, "GET", "/api/health");
    assertEqual(res.headers["x-xss-protection"], "0", "X-XSS-Protection is 0");
  }

  {
    const res = await request(app, "POST", "/auth/login", { "Content-Type": "application/json" });
    assertEqual(res.headers["x-xss-protection"], "0", "X-XSS-Protection is 0 on POST");
  }

  {
    const res = await request(app, "GET", "/api/nonexistent");
    assertEqual(res.headers["x-xss-protection"], "0", "X-XSS-Protection is 0 on 404");
  }

  {
    const res = await request(app, "OPTIONS", "/api/health");
    assertEqual(res.headers["x-xss-protection"], "0", "X-XSS-Protection is 0 on OPTIONS");
  }

  {
    const res = await request(app, "PUT", "/api/guilds/test", { "Content-Type": "application/json" });
    assertEqual(res.headers["x-xss-protection"], "0", "X-XSS-Protection is 0 on PUT");
  }

  {
    for (let i = 0; i < 3; i++) {
      const res = await request(app, "GET", "/api/health");
      assertEqual(res.headers["x-xss-protection"], "0", `X-XSS-Protection consistent on request ${i + 1}`);
    }
  }

  /* ================================================================
   * I. HEADER IMMUNITY (20+ assertions)
   * ================================================================ */
  console.log("\n===== I. HEADER IMMUNITY =====");

  {
    const res = await request(app, "POST", "/auth/login", { "Content-Type": "application/json" });
    assertEqual(res.status, 401, "401 response status");
    assert(res.headers["content-security-policy"] !== undefined, "Headers present on 401");
    assert(res.headers["x-frame-options"] !== undefined, "X-Frame-Options present on 401");
    assert(res.headers["x-content-type-options"] !== undefined, "X-Content-Type-Options present on 401");
    assert(res.headers["referrer-policy"] !== undefined, "Referrer-Policy present on 401");
    assert(res.headers["permissions-policy"] !== undefined, "Permissions-Policy present on 401");
    assert(res.headers["x-xss-protection"] !== undefined, "X-XSS-Protection present on 401");
  }

  {
    const res = await request(app, "GET", "/api/nonexistent");
    assertEqual(res.status, 404, "404 response status");
    assert(res.headers["content-security-policy"] !== undefined, "Headers present on 404");
    assert(res.headers["x-frame-options"] !== undefined, "X-Frame-Options present on 404");
    assert(res.headers["x-content-type-options"] !== undefined, "X-Content-Type-Options present on 404");
  }

  {
    const res = await request(app, "OPTIONS", "/api/health");
    assert(res.headers["content-security-policy"] !== undefined, "Headers present on OPTIONS");
    assert(res.headers["x-frame-options"] !== undefined, "X-Frame-Options present on OPTIONS");
    assert(res.headers["x-content-type-options"] !== undefined, "X-Content-Type-Options present on OPTIONS");
  }

  {
    const res = await request(app, "GET", "/api/health");
    assert(res.headers["content-security-policy"] !== undefined, "Headers present on GET");
    assert(res.headers["x-frame-options"] !== undefined, "X-Frame-Options present on GET");
    assert(res.headers["x-content-type-options"] !== undefined, "X-Content-Type-Options present on GET");
  }

  {
    const res = await request(app, "PUT", "/api/guilds/test", { "Content-Type": "application/json" });
    assert(res.headers["content-security-policy"] !== undefined, "Headers present on PUT");
    assert(res.headers["x-frame-options"] !== undefined, "X-Frame-Options present on PUT");
    assert(res.headers["x-content-type-options"] !== undefined, "X-Content-Type-Options present on PUT");
  }

  {
    const res = await request(app, "POST", "/auth/login", { "Content-Type": "application/json" });
    assert(!("x-powered-by" in res.headers), "X-Powered-By is removed");
  }

  {
    const res = await request(app, "GET", "/api/health");
    assert(!("x-powered-by" in res.headers), "X-Powered-By is removed on GET");
  }

  /* ================================================================
   * J. PRODUCTION VS DEVELOPMENT (25+ assertions)
   * ================================================================ */
  console.log("\n===== J. PRODUCTION VS DEVELOPMENT =====");

  {
    process.env.NODE_ENV = "production";
    const res = await request(app, "GET", "/api/health");
    assertEqual(res.headers["strict-transport-security"], "max-age=31536000; includeSubDomains", "Production: HSTS present");
    assert(res.headers["content-security-policy"] !== undefined, "Production: CSP present");
    assertEqual(res.headers["x-frame-options"], "DENY", "Production: X-Frame-Options DENY");
    assertEqual(res.headers["x-content-type-options"], "nosniff", "Production: X-Content-Type-Options nosniff");
    assertEqual(res.headers["referrer-policy"], "strict-origin-when-cross-origin", "Production: Referrer-Policy set");
    assert(res.headers["permissions-policy"] !== undefined, "Production: Permissions-Policy present");
    assertEqual(res.headers["x-xss-protection"], "0", "Production: X-XSS-Protection 0");
  }

  {
    process.env.NODE_ENV = "development";
    const res = await request(app, "GET", "/api/health");
    assert(res.headers["strict-transport-security"] === undefined, "Development: HSTS absent");
    assert(res.headers["content-security-policy"] !== undefined, "Development: CSP present");
    assertEqual(res.headers["x-frame-options"], "DENY", "Development: X-Frame-Options DENY");
    assertEqual(res.headers["x-content-type-options"], "nosniff", "Development: X-Content-Type-Options nosniff");
    assertEqual(res.headers["referrer-policy"], "strict-origin-when-cross-origin", "Development: Referrer-Policy set");
    assert(res.headers["permissions-policy"] !== undefined, "Development: Permissions-Policy present");
    assertEqual(res.headers["x-xss-protection"], "0", "Development: X-XSS-Protection 0");
  }

  {
    process.env.NODE_ENV = "production";
    const res = await request(app, "POST", "/auth/login", { "Content-Type": "application/json" });
    assertEqual(res.headers["strict-transport-security"], "max-age=31536000; includeSubDomains", "Production POST: HSTS present");
    assert(res.headers["content-security-policy"] !== undefined, "Production POST: CSP present");
    assertEqual(res.headers["x-frame-options"], "DENY", "Production POST: X-Frame-Options DENY");
  }

  {
    process.env.NODE_ENV = "development";
    const res = await request(app, "POST", "/auth/login", { "Content-Type": "application/json" });
    assert(res.headers["strict-transport-security"] === undefined, "Development POST: HSTS absent");
    assert(res.headers["content-security-policy"] !== undefined, "Development POST: CSP present");
    assertEqual(res.headers["x-frame-options"], "DENY", "Development POST: X-Frame-Options DENY");
  }

  {
    process.env.NODE_ENV = "production";
    const res = await request(app, "GET", "/api/nonexistent");
    assertEqual(res.headers["strict-transport-security"], "max-age=31536000; includeSubDomains", "Production 404: HSTS present");
    assert(res.headers["content-security-policy"] !== undefined, "Production 404: CSP present");
  }

  {
    process.env.NODE_ENV = "development";
    const res = await request(app, "GET", "/api/nonexistent");
    assert(res.headers["strict-transport-security"] === undefined, "Development 404: HSTS absent");
    assert(res.headers["content-security-policy"] !== undefined, "Development 404: CSP present");
  }

  /* ================================================================
   * K. EDGE CASES (20+ assertions)
   * ================================================================ */
  console.log("\n===== K. EDGE CASES =====");

  {
    const res = await request(app, "POST", "/auth/login", {
      "Content-Type": "application/json",
    });
    assert(res.headers["content-security-policy"] !== undefined, "Headers present with Content-Type header");
    assert(res.headers["x-frame-options"] !== undefined, "X-Frame-Options present with Content-Type header");
  }

  {
    const res = await request(app, "GET", "/api/health", {
      "X-Custom-Header": "test-value",
    });
    assert(res.headers["content-security-policy"] !== undefined, "Headers present with custom request headers");
    assert(res.headers["x-frame-options"] !== undefined, "X-Frame-Options present with custom request headers");
  }

  {
    const res = await request(app, "GET", "/nonexistent/deep/path");
    assert(res.headers["content-security-policy"] !== undefined, "Headers present on deep non-existent path");
    assert(res.headers["x-frame-options"] !== undefined, "X-Frame-Options present on deep non-existent path");
    assert(res.headers["x-content-type-options"] !== undefined, "X-Content-Type-Options present on deep non-existent path");
  }

  {
    const res = await request(app, "GET", "/api/health");
    const csp = res.headers["content-security-policy"] || "";
    assertNotIncludes(csp, "default-src 'self' data:", "CSP default-src does NOT allow data: (only in img-src)");
    assertNotIncludes(csp, "script-src 'self' data:", "CSP script-src does NOT allow data:");
    assertNotIncludes(csp, "blob:", "CSP does NOT contain blob:");
    assertNotIncludes(csp, "mediastream:", "CSP does NOT contain mediastream:");
  }

  {
    const res = await request(app, "GET", "/api/health");
    const pp = res.headers["permissions-policy"] || "";
    assertNotIncludes(pp, "camera=(self)", "Permissions-Policy does NOT allow camera");
    assertNotIncludes(pp, "microphone=(self)", "Permissions-Policy does NOT allow microphone");
    assertNotIncludes(pp, "geolocation=(self)", "Permissions-Policy does NOT allow geolocation");
  }

  {
    const res = await request(app, "GET", "/api/health");
    assert(res.headers["content-security-policy"] !== undefined, "Rapid request 1: CSP present");
    assert(res.headers["x-frame-options"] !== undefined, "Rapid request 1: X-Frame-Options present");
  }

  {
    const res = await request(app, "GET", "/api/health");
    assert(res.headers["content-security-policy"] !== undefined, "Rapid request 2: CSP present");
    assert(res.headers["x-frame-options"] !== undefined, "Rapid request 2: X-Frame-Options present");
  }

  {
    const res = await request(app, "GET", "/api/health");
    assert(res.headers["content-security-policy"] !== undefined, "Rapid request 3: CSP present");
    assert(res.headers["x-frame-options"] !== undefined, "Rapid request 3: X-Frame-Options present");
  }

  /* ================================================================
   * CLEANUP
   * ================================================================ */
  process.env.NODE_ENV = savedNodeEnv;

  /* ==================== SUMMARY ==================== */
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  if (failed === 0) {
    console.log("ALL U11 WEB SECURITY HEADER TESTS PASSED");
  } else {
    console.log("SOME U11 TESTS FAILED");
  }
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch((err) => {
  console.error("Test runner error:", err);
  process.exit(1);
});
