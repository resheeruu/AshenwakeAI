#!/usr/bin/env node
/* ================================================================
 * ASHENAI PROVIDER CAPABILITY MATRIX — LIVE PROBE
 *
 * For every provider × representative action:
 *   provider request → candidate URL → download → GIF validation →
 *   SHA-256 → temp-dir cache write → read-back
 *
 * Cell verdicts: PASS (full pipeline) | PARTIAL (URL ok, download
 * failed) | NO (unsupported action) | ERROR (HTTP/timeout/network).
 *
 * Writes ONLY to a temp dir (never production). Gentle pacing
 * (~2s between calls) to respect provider rate limits.
 *
 * Usage: npx tsx scripts/probe-media-matrix.ts
 * ================================================================ */

import * as crypto from "node:crypto";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { buildProviders } from "../src/games/anime-actions/providers";
import {
  hardenedFetch,
  readLimitedBytes,
} from "../src/security/outbound-fetch";

const ACTIONS = [
  "hug",
  "pat",
  "cry",
  "dance",
  "sleep",
  "kiss",
  "slap",
  "punch",
  "kick",
  "shoot",
  "yeet",
  // known gap actions
  "destroy",
  "explode",
  "stab",
  "throw",
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function isGif(buf: Buffer): boolean {
  if (buf.length < 10) return false;
  const sig = buf.toString("latin1", 0, 6);
  return sig === "GIF87a" || sig === "GIF89a";
}

async function main() {
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "ashen-matrix-"));
  const providers = buildProviders();
  console.log("Providers: " + providers.map((p) => p.name).join(" -> "));
  console.log("Actions: " + ACTIONS.join(", "));
  console.log("");

  const matrix = new Map<string, Map<string, string>>();

  for (const provider of providers) {
    const row = new Map<string, string>();
    matrix.set(provider.name, row);
    for (const action of ACTIONS) {
      let verdict = "ERROR";
      try {
        const attempt = await provider.fetch(action);
        if (attempt.result === "unsupported_action") {
          verdict = "NO";
        } else if (!attempt.animation?.url) {
          verdict = `ERROR(${attempt.result})`;
        } else {
          // Full download → validate → hash → temp cache → read-back
          try {
            const { response } = await hardenedFetch(attempt.animation.url, {
              timeoutMs: 15000,
              maxRedirects: 3,
              maxResponseBytes: 8 * 1024 * 1024,
              policy: "public",
              requireHttps: true,
              headers:
                provider.name === "nekosbest"
                  ? { "User-Agent": "AshenAI/1.0" }
                  : undefined,
            });
            if (!response.ok) {
              verdict = `PARTIAL(http_${response.status})`;
            } else {
              const buf = await readLimitedBytes(response, 8 * 1024 * 1024);
              if (!isGif(buf)) {
                verdict = "PARTIAL(invalid_gif)";
              } else {
                const hash = crypto.createHash("sha256").update(buf).digest("hex");
                const tmpFile = path.join(tmpRoot, `${provider.name}-${action}.gif`);
                await fs.writeFile(tmpFile, buf);
                const back = await fs.readFile(tmpFile);
                verdict =
                  isGif(back) &&
                  crypto.createHash("sha256").update(back).digest("hex") === hash
                    ? `PASS(${buf.length}b)`
                    : "PARTIAL(readback)";
              }
            }
          } catch (e) {
            verdict = `PARTIAL(${String((e as Error).message).slice(0, 40)})`;
          }
        }
      } catch (e) {
        verdict = `ERROR(${String((e as Error).message).slice(0, 30)})`;
      }
      row.set(action, verdict);
      console.log(`${provider.name.padEnd(10)} ${action.padEnd(8)} ${verdict}`);
      await sleep(2000);
    }
  }

  console.log("\n=== MATRIX ===");
  console.log("action   | " + providers.map((p) => p.name.padEnd(12)).join(" | "));
  for (const action of ACTIONS) {
    const cells = providers.map((p) =>
      (matrix.get(p.name)?.get(action) || "?").slice(0, 12).padEnd(12),
    );
    console.log(action.padEnd(8) + " | " + cells.join(" | "));
  }

  await fs.rm(tmpRoot, { recursive: true, force: true });
  console.log("\nTemp dir cleaned. Production untouched.");
}

main().catch((e) => {
  console.error("Matrix fatal:", e);
  process.exit(1);
});
