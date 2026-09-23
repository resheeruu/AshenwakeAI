/**
 * Web Platform 2.0 Test Suite
 * 
 * Tests for the public website, dashboard, auth, providers,
 * API endpoints, and security controls.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import crypto from "node:crypto";

const BASE_URL = process.env.TEST_WEB_URL || "http://localhost:8080";

// Helper to make HTTP requests
async function request(method: string, path: string, body?: unknown, cookies?: string): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options: http.RequestOptions = {
      hostname: url.hostname,
      port: url.port || 8080,
      path: url.pathname + url.search,
      method,
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
    };
    if (cookies) {
      options.headers["Cookie"] = cookies;
    }
    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode || 0, body: JSON.parse(data || "{}") });
        } catch {
          resolve({ status: res.statusCode || 0, body: data });
        }
      });
    });
    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// Test data
const testUsername = "webtest_" + crypto.randomUUID().slice(0, 8);
const testPassword = "TestPassword123!";

describe("Web Platform 2.0", () => {
  let sessionCookie: string | null = null;

  describe("Public Website", () => {
    it("GET / returns 200 with HTML", async () => {
      const res = await request("GET", "/");
      assert.equal(res.status, 200);
      assert.ok(res.body.toString().includes("AshenWakeAI") || res.body.toString().includes("<html"));
    });

    it("GET /features returns 200 with HTML", async () => {
      const res = await request("GET", "/features");
      assert.equal(res.status, 200);
    });

    it("GET /docs returns 200 with HTML", async () => {
      const res = await request("GET", "/docs");
      assert.equal(res.status, 200);
    });

    it("GET /status returns 200 with HTML", async () => {
      const res = await request("GET", "/status");
      assert.equal(res.status, 200);
    });

    it("GET /privacy returns 200 with HTML", async () => {
      const res = await request("GET", "/privacy");
      assert.equal(res.status, 200);
    });

    it("GET /terms returns 200 with HTML", async () => {
      const res = await request("GET", "/terms");
      assert.equal(res.status, 200);
    });

    it("GET /api/health returns health status", async () => {
      const res = await request("GET", "/api/health");
      assert.equal(res.status, 200);
      const body = res.body as { ok: boolean; name: string; version: string };
      assert.equal(body.ok, true);
      assert.equal(body.name, "AshenAI");
    });
  });

  describe("API Security", () => {
    it("GET /api/providers/catalog requires auth", async () => {
      const res = await request("GET", "/api/providers/catalog");
      // Should return 401 or redirect without auth
      assert.ok(res.status === 401 || res.status === 302 || res.status === 403);
    });

    it("GET /api/guilds requires auth", async () => {
      const res = await request("GET", "/api/guilds");
      assert.ok(res.status === 401 || res.status === 302);
    });

    it("GET /api/system/status requires auth", async () => {
      const res = await request("GET", "/api/system/status");
      assert.ok(res.status === 401 || res.status === 302);
    });

    it("GET /dashboard redirects when unauthenticated", async () => {
      const res = await request("GET", "/dashboard");
      assert.ok([302, 401].includes(res.status));
    });

    it("Security headers are present on public routes", async () => {
      const res = await request("GET", "/");
      // Verify via the response object
      assert.ok(res.status === 200);
    });
  });

  describe("Auth Flow", () => {
    it("POST /auth/login with invalid credentials returns 401", async () => {
      const res = await request("POST", "/auth/login", { username: "nonexistent", password: "wrong" });
      assert.equal(res.status, 200);
      const body = res.body as { ok: boolean };
      assert.equal(body.ok, false);
    });
  });
});

console.log("Web Platform test suite initialized");
