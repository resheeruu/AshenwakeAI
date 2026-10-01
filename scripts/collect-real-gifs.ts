/* ================================================================
 * ASHENAI REAL GIF COLLECTOR — resumable / batchable
 *
 * Downloads real GIFs from the existing providers (Gifukai, OtakuGIFs)
 * and builds the production library with global SHA-256 dedup,
 * validation, immediate manifest persistence, and attribution tracking.
 *
 * Resumable: every completed provider pass is journaled to
 * data/anime-gifs/.collection-progress.json. A killed/timed-out run
 * never loses assets already saved (each asset is written atomically
 * and added to the manifest immediately) and the interrupted pass is
 * simply retried on the next invocation.
 *
 * Usage:
 *   npx tsx scripts/collect-real-gifs.ts --report
 *   npx tsx scripts/collect-real-gifs.ts --action=<mediaKey>
 *   npx tsx scripts/collect-real-gifs.ts --batch=<n>
 *   npx tsx scripts/collect-real-gifs.ts --all
 *   npx tsx scripts/collect-real-gifs.ts --remediate-manifest
 *
 * Options:
 *   --requests=<n>      API requests per provider per pass (default 10)
 *   --target=<n>        per-action GIF target (default 10)
 *   --time-budget=<sec> exit cleanly after N seconds (resumable)
 *   --reset-selection   reset anti-repeat selection state
 *
 * Licensing policy: no CC0 / Public Domain / CC BY claim is ever
 * written without verifiable licensing evidence. See LICENSE_EVIDENCE.
 * ================================================================ */

import * as fsp from "node:fs/promises";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { getAllActions } from "../src/games/anime-actions/definitions";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const GIF_ROOT = path.join(ROOT, "data", "anime-gifs");
const ACTIONS_DIR = path.join(GIF_ROOT, "actions");
const MANIFEST_PATH = path.join(GIF_ROOT, "manifest.json");
const ATTRIBUTIONS_PATH = path.join(GIF_ROOT, "ATTRIBUTIONS.md");
const JOURNAL_PATH = path.join(GIF_ROOT, ".collection-progress.json");
const SELECTION_STATE_PATH = path.join(GIF_ROOT, ".selection-state.json");
const TEST_GIF_DIR = path.join(ROOT, "data", "anime-gifs-test");

/* ================================================================
 * PROVIDER ENDPOINTS
 * ================================================================ */

const GIFUKAI_BASE = "https://api.gifukai.com/v1";
const OTAKUGIFS_BASE = "https://api.otakugifs.xyz";

/* Live Gifukai action list (GET /v1/actions) snapshot, used as a
 * fallback when the API is unreachable. Keys are real actions. */
const GIFUKAI_FALLBACK_ACTIONS = [
  "angry", "bite", "bleh", "blowkiss", "blush", "bonk", "bored", "bye",
  "carry", "clap", "confused", "cry", "cuddle", "dance", "eat", "facepalm",
  "feed", "handhold", "handshake", "happy", "hi", "highfive", "hug", "kick",
  "kill", "kiss", "lappillow", "laugh", "lick", "nod", "nope", "nya", "pat",
  "peek", "poke", "pout", "punch", "run", "salute", "scared", "shake",
  "shocked", "shoot", "shrug", "shy", "sing", "sip", "slap", "sleep", "smile",
  "smug", "sorry", "spin", "stare", "surprised", "taunt", "teehee", "think",
  "thumbsup", "tickle", "tired", "wag", "wallslam", "wave", "wink", "yawn",
  "yay", "yeet",
];

/* Live Gifukai aliases (alias -> canonical action), fallback snapshot. */
const GIFUKAI_FALLBACK_ALIASES: Record<string, string> = {
  mad: "angry", rage: "angry", mwah: "blowkiss", flustered: "blush",
  cya: "bye", goodbye: "bye", claps: "clap", sob: "cry", snuggle: "cuddle",
  nom: "eat", hello: "hi", hey: "hi", murder: "kill", peck: "kiss",
  lmao: "laugh", lol: "laugh", agree: "nod", yes: "nod", deny: "nope",
  no: "nope", meow: "nya", neko: "nya", headpat: "pat", boop: "poke",
  surprised: "shocked", bang: "shoot", dunno: "shrug", idk: "shrug",
  drink: "sip", nap: "sleep", zzz: "sleep", gaze: "stare", thinking: "think",
  like: "thumbsup", kabedon: "wallslam",
};

/* OtakuGIFs reaction vocabulary (from their published FAQ list).
 * The API has no list endpoint, so this snapshot gates our queries. */
const OTAKUGIFS_REACTIONS = new Set([
  "airkiss", "angrystare", "bite", "bleh", "blush", "brofist", "celebrate",
  "cheers", "clap", "confused", "cool", "cry", "cuddle", "dance", "drool",
  "evillaugh", "facepalm", "handhold", "happy", "headbang", "hug", "huh",
  "kiss", "laugh", "lick", "love", "mad", "nervous", "no", "nom",
  "nosebleed", "nuzzle", "nyah", "pat", "peek", "pinch", "poke", "pout",
  "punch", "roll", "run", "sad", "scared", "shout", "shrug", "shy", "sigh",
  "sing", "sip", "slap", "sleep", "slowclap", "smack", "smile", "smug",
  "sneeze", "sorry", "stare", "stop", "surprised", "sweat", "thumbsup",
  "tickle", "tired", "wave", "wink", "woah", "yawn", "yay", "yes",
]);

/* ================================================================
 * SEMANTIC ALIAS CANDIDATES FOR ZERO-RESULT ACTIONS
 *
 * Each candidate was verified against the providers before being
 * retained (HTTP 200 + valid GIF payload). Terms that returned
 * 404 (Gifukai) / 400 (OtakuGIFs) were dropped:
 *   hit     : hit(404/400) dropped, punch/slap/bonk/kick/smack kept
 *   throw   : throw,toss(404/400) dropped, yeet kept
 *   stab    : stab,attack(404/400) dropped, kill kept (review: violent)
 *   destroy : destroy,smash,break(404/400) dropped, no appropriate term
 *   explode : explode,explosion,boom(404/400) dropped, no appropriate term
 *   panic   : panic,fear(404/400) dropped, scared/nervous/sweat kept
 *   roast   : roast,insult,mock(404/400) dropped, taunt kept
 *   simp    : simp,adoration(404/400) dropped, love/nosebleed kept
 * ================================================================ */

interface AliasCandidate {
  provider: "gifukai" | "otakugifs" | "any";
  query: string;
  rationale: string;
}

const ALIAS_CANDIDATES: Record<string, AliasCandidate[]> = {
  hit: [
    { provider: "any", query: "punch", rationale: "strike is equivalent to hit" },
    { provider: "any", query: "slap", rationale: "strike is equivalent to hit" },
    { provider: "gifukai", query: "bonk", rationale: "blunt strike is equivalent to hit" },
    { provider: "gifukai", query: "kick", rationale: "strike is equivalent to hit" },
    { provider: "otakugifs", query: "smack", rationale: "strike is equivalent to hit" },
  ],
  throw: [
    { provider: "gifukai", query: "yeet", rationale: "yeet is the slang for throwing" },
  ],
  stab: [
    { provider: "gifukai", query: "kill", rationale: "lethal attack is adjacent to stab (flagged for review)" },
  ],
  destroy: [],
  explode: [],
  panic: [
    { provider: "any", query: "scared", rationale: "fear reaction is equivalent to panic" },
    { provider: "otakugifs", query: "nervous", rationale: "nervous reaction is equivalent to panic" },
    { provider: "otakugifs", query: "sweat", rationale: "nervous sweat is equivalent to panic" },
  ],
  roast: [
    { provider: "gifukai", query: "taunt", rationale: "taunting is equivalent to roasting" },
  ],
  simp: [
    { provider: "otakugifs", query: "love", rationale: "adoration is equivalent to simp" },
    { provider: "otakugifs", query: "nosebleed", rationale: "anime attraction reaction is equivalent to simp" },
  ],
};

/* ================================================================
 * LICENSING EVIDENCE (retrieved 2026-09-29)
 *
 * NO asset is marked CC0 / Public Domain / CC BY / CC BY-SA.
 * Evidence below is what the providers actually state.
 * ================================================================ */

const LICENSE_EVIDENCE = {
  gifukai: {
    license: "all-rights-reserved — provider ToS: rights remain with content owners",
    evidence:
      "https://gifukai.com/legal/terms/ (retrieved 2026-09-29) §3: 'We do not own the anime, images, or GIFs… All rights remain with the respective content owners.' §4: user may not 'scrape, bulk-download, or perform automated extraction or archiving of the GIF library' nor 'rehost or redistribute the GIF library as a competing dataset or service'. §2 permits use of the service in one's own bots.",
  },
  otakugifs: {
    license: "unverified — no license grant found; provider TOS discourages saving/indexing",
    evidence:
      "https://otakugifs.xyz/ ToS page (retrieved 2026-09-29): 'You are discouraged from saving or indexing any of the media files provided to you.' No CC0/CC BY/public-domain grant was located.",
  },
} as const;

/* ================================================================
 * INTERFACES
 * ================================================================ */

type ProviderName = "gifukai" | "otakugifs";

interface ProviderResult {
  url: string;
  source: ProviderName;
  query: string;
  canonicalAction?: string;
  anime?: string;
}

interface ManifestAsset {
  file: string;
  action: string;
  category: string;
  source: string;
  providerQuery: string;
  sourceUrl: string;
  license: string;
  licenseEvidence: string;
  anime?: string;
  creator: string;
  attribution: string;
  retrievedAt: string;
  sha256: string;
  bytes: number;
  mediaKey: string;
}

interface Manifest {
  version: number;
  generatedAt: string;
  totalAssets: number;
  totalBytes: number;
  assets: ManifestAsset[];
}

interface PassRecord {
  action: string;
  provider: ProviderName;
  query: string;
  requests: number;
  passIndex: number;
  completedAt: string;
  httpResponses: number;
  urlsReturned: number;
  newSaved: number;
  duplicates: number;
  failedDownloads: number;
  statusCodes: number[];
  saturated: boolean;
  interrupted?: boolean;
}

interface Journal {
  version: number;
  updatedAt: string;
  passes: PassRecord[];
}

/* ================================================================
 * CLI
 * ================================================================ */

interface CliArgs {
  report: boolean;
  remediate: boolean;
  resetSelection: boolean;
  action?: string;
  batch?: number;
  all: boolean;
  requests: number;
  target: number;
  timeBudgetSec?: number;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    report: false,
    remediate: false,
    resetSelection: false,
    all: false,
    requests: 10,
    target: 10,
  };
  for (const raw of argv) {
    if (raw === "--report") args.report = true;
    else if (raw === "--remediate-manifest") args.remediate = true;
    else if (raw === "--reset-selection") args.resetSelection = true;
    else if (raw === "--all") args.all = true;
    else if (raw.startsWith("--action=")) args.action = raw.slice("--action=".length);
    else if (raw.startsWith("--batch=")) args.batch = Number(raw.slice("--batch=".length));
    else if (raw.startsWith("--requests=")) args.requests = Number(raw.slice("--requests=".length));
    else if (raw.startsWith("--target=")) args.target = Number(raw.slice("--target=".length));
    else if (raw.startsWith("--time-budget=")) args.timeBudgetSec = Number(raw.slice("--time-budget=".length));
    else {
      console.error(`Unknown argument: ${raw}`);
      process.exit(2);
    }
  }
  if (!Number.isFinite(args.requests) || args.requests < 1) args.requests = 10;
  if (!Number.isFinite(args.target) || args.target < 1) args.target = 10;
  if (args.timeBudgetSec !== undefined && (!Number.isFinite(args.timeBudgetSec) || args.timeBudgetSec <= 0)) {
    delete args.timeBudgetSec;
  }
  return args;
}

/* ================================================================
 * HELPERS
 * ================================================================ */

const deadline = { at: Infinity, exceeded: false };
function startBudget(seconds?: number): void {
  deadline.at = seconds ? Date.now() + seconds * 1000 : Infinity;
  deadline.exceeded = false;
}
function budgetExceeded(): boolean {
  if (deadline.exceeded) return true;
  if (Date.now() >= deadline.at) {
    deadline.exceeded = true;
    return true;
  }
  return false;
}

function sha256Buffer(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function isValidGif(buffer: Buffer): boolean {
  if (buffer.length < 10) return false;
  const sig = buffer.toString("latin1", 0, 6);
  return sig === "GIF87a" || sig === "GIF89a";
}

async function validateGifFile(filePath: string): Promise<{ valid: boolean; size: number; sha256: string } | null> {
  try {
    const buffer = await fsp.readFile(filePath);
    if (!isValidGif(buffer)) return null;
    if (buffer.length === 0 || buffer.length > 8 * 1024 * 1024) return null;
    return { valid: true, size: buffer.length, sha256: sha256Buffer(buffer) };
  } catch {
    return null;
  }
}

const MAX_GIF_BYTES = 8 * 1024 * 1024;

async function downloadGif(url: string, timeoutMs = 15000): Promise<Buffer | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!response.ok) {
      console.warn(`  ✗ Download ${response.status} ${response.statusText}: ${url}`);
      return null;
    }
    const declared = Number(response.headers.get("content-length") || "0");
    if (declared > MAX_GIF_BYTES) {
      console.warn(`  ✗ Declared size too large: ${declared} bytes`);
      return null;
    }
    const reader = response.body?.getReader();
    if (!reader) return null;
    const chunks: Buffer[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_GIF_BYTES) {
        await reader.cancel().catch(() => {});
        console.warn(`  ✗ Download exceeded ${MAX_GIF_BYTES} bytes, aborted`);
        return null;
      }
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks);
  } catch (error) {
    console.warn(`  ✗ Error downloading ${url}: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

async function downloadAndValidate(url: string): Promise<Buffer | null> {
  const buffer = await downloadGif(url);
  if (!buffer) return null;
  if (!isValidGif(buffer)) {
    console.warn(`  ✗ Not a valid GIF payload`);
    return null;
  }
  if (buffer.length === 0) {
    console.warn(`  ✗ Empty payload`);
    return null;
  }
  return buffer;
}

/* ================================================================
 * GLOBAL HASH INDEX (cross-action exact-duplicate prevention)
 * ================================================================ */

async function buildGlobalHashIndex(): Promise<Map<string, string>> {
  const index = new Map<string, string>();
  let actions: string[] = [];
  try {
    actions = (await fsp.readdir(ACTIONS_DIR, { withFileTypes: true }))
      .filter(e => e.isDirectory())
      .map(e => e.name);
  } catch {
    return index;
  }
  for (const action of actions) {
    const dir = path.join(ACTIONS_DIR, action);
    let files: string[] = [];
    try {
      files = (await fsp.readdir(dir)).filter(f => f.endsWith(".gif"));
    } catch {
      continue;
    }
    for (const file of files) {
      try {
        const buffer = await fsp.readFile(path.join(dir, file));
        index.set(sha256Buffer(buffer), `${action}/${file}`);
      } catch {
        // unreadable file: ignore here, report in --report
      }
    }
  }
  return index;
}

async function countAction(action: string): Promise<number> {
  try {
    const files = await fsp.readdir(path.join(ACTIONS_DIR, action));
    return files.filter(f => f.endsWith(".gif")).length;
  } catch {
    return 0;
  }
}

/* ================================================================
 * JOURNAL (resumability)
 * ================================================================ */

async function loadJournal(): Promise<Journal> {
  try {
    const raw = await fsp.readFile(JOURNAL_PATH, "utf8");
    const parsed = JSON.parse(raw) as Journal;
    if (Array.isArray(parsed.passes)) return parsed;
  } catch {
    // no journal yet
  }
  return { version: 1, updatedAt: new Date().toISOString(), passes: [] };
}

async function saveJournal(journal: Journal): Promise<void> {
  journal.updatedAt = new Date().toISOString();
  const tmpPath = `${JOURNAL_PATH}.tmp-${process.pid}`;
  await fsp.writeFile(tmpPath, JSON.stringify(journal, null, 2), "utf8");
  await fsp.rename(tmpPath, JOURNAL_PATH);
}

function passKey(p: { action: string; provider: string; query: string; requests: number }): string {
  return `${p.action}|${p.provider}|${p.query}|${p.requests}`;
}

function isSaturated(journal: Journal, key: string): boolean {
  const completed = journal.passes.filter(
    p => passKey(p) === key && p.httpResponses > 0 && !p.interrupted
  );
  if (completed.length === 0) return false;
  const last = completed[completed.length - 1];
  // Provider does not recognize the query at all.
  if (last.urlsReturned === 0) return true;
  // Three consecutive completed passes returned only already-saved GIFs
  // (or failed downloads): treat the pool as exhausted for this action.
  const recent = completed.slice(-3);
  if (recent.length >= 3 && recent.every(p => p.newSaved === 0)) return true;
  return false;
}

function nextPassIndex(journal: Journal, key: string): number {
  return journal.passes.filter(p => passKey(p) === key).length + 1;
}

/* ================================================================
 * MANIFEST
 * ================================================================ */

async function loadManifest(): Promise<Manifest> {
  try {
    const raw = await fsp.readFile(MANIFEST_PATH, "utf8");
    return JSON.parse(raw);
  } catch {
    return { version: 1, generatedAt: new Date().toISOString(), totalAssets: 0, totalBytes: 0, assets: [] };
  }
}

async function saveManifest(manifest: Manifest): Promise<void> {
  manifest.totalAssets = manifest.assets.length;
  manifest.totalBytes = manifest.assets.reduce((sum, a) => sum + a.bytes, 0);
  manifest.generatedAt = new Date().toISOString();
  const tmpPath = `${MANIFEST_PATH}.tmp-${process.pid}`;
  await fsp.writeFile(tmpPath, JSON.stringify(manifest, null, 2), "utf8");
  await fsp.rename(tmpPath, MANIFEST_PATH);
}

async function updateManifest(asset: ManifestAsset): Promise<void> {
  const manifest = await loadManifest();
  // Replace any entry for the same file path; drop same-sha256 entries
  // (collection-time global dedup guarantees sha256 uniqueness).
  manifest.assets = manifest.assets.filter(a => a.file !== asset.file && a.sha256 !== asset.sha256);
  manifest.assets.push(asset);
  await saveManifest(manifest);
}

async function generateAttributions(manifest: Manifest): Promise<void> {
  let md = "# AshenAI Local GIF Attributions\n\n";
  md += `Generated: ${new Date().toISOString()}\n`;
  md += `Total Assets: ${manifest.totalAssets}\n`;
  md += `Total Size: ${manifest.totalBytes} bytes (${(manifest.totalBytes / 1024 / 1024).toFixed(1)} MB)\n\n`;

  md += `## Licensing status\n\n`;
  md += `No asset in this library is claimed to be CC0, Public Domain, CC BY, or CC BY-SA.\n`;
  md += `Provider licensing evidence (retrieved 2026-09-29):\n\n`;
  md += `- **Gifukai** — ${LICENSE_EVIDENCE.gifukai.license}\n  Evidence: ${LICENSE_EVIDENCE.gifukai.evidence}\n`;
  md += `- **OtakuGIFs** — ${LICENSE_EVIDENCE.otakugifs.license}\n  Evidence: ${LICENSE_EVIDENCE.otakugifs.evidence}\n\n`;

  const bySource = new Map<string, ManifestAsset[]>();
  for (const asset of manifest.assets) {
    const list = bySource.get(asset.source) || [];
    list.push(asset);
    bySource.set(asset.source, list);
  }

  for (const [source, assets] of bySource) {
    const ev = LICENSE_EVIDENCE[source as ProviderName];
    md += `## ${source} (${assets.length} assets)\n\n`;
    md += `License status: ${ev ? ev.license : "unverified"}\n\n`;
    const queryCounts = new Map<string, number>();
    for (const a of assets) queryCounts.set(a.providerQuery, (queryCounts.get(a.providerQuery) || 0) + 1);
    md += `Provider queries used: ${[...queryCounts.entries()].map(([q, n]) => `${q} (${n})`).join(", ")}\n\n`;
    for (const asset of assets) {
      md += `- **${asset.action}** (\`${asset.file}\`) via query \`${asset.providerQuery}\``;
      if (asset.anime) md += ` — source anime: ${asset.anime}`;
      md += `\n  Source: ${asset.sourceUrl}\n`;
    }
    md += "\n";
  }

  await fsp.writeFile(ATTRIBUTIONS_PATH, md);
}

/* ================================================================
 * PROVIDER VOCABULARY
 * ================================================================ */

interface GifukaiVocab {
  actions: Set<string>;
  aliasToCanonical: Record<string, string>;
  live: boolean;
}

async function loadGifukaiVocab(): Promise<GifukaiVocab> {
  const fallback: GifukaiVocab = {
    actions: new Set(GIFUKAI_FALLBACK_ACTIONS),
    aliasToCanonical: { ...GIFUKAI_FALLBACK_ALIASES },
    live: false,
  };
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(`${GIFUKAI_BASE}/actions`, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return fallback;
    const data = (await res.json()) as {
      actions?: Record<string, { aliases?: Array<{ alias: string; type?: string }> }>;
    };
    const actions = data.actions || {};
    const keys = Object.keys(actions);
    if (keys.length === 0) return fallback;
    const vocab: GifukaiVocab = { actions: new Set(keys), aliasToCanonical: {}, live: true };
    for (const [canonical, meta] of Object.entries(actions)) {
      for (const aliasDef of meta.aliases || []) {
        if (aliasDef && typeof aliasDef.alias === "string") {
          vocab.aliasToCanonical[aliasDef.alias] = canonical;
        }
      }
    }
    return vocab;
  } catch {
    return fallback;
  }
}

function gifukaiSupported(vocab: GifukaiVocab, query: string): boolean {
  return vocab.actions.has(query) || query in vocab.aliasToCanonical;
}

function gifukaiExpectedAction(vocab: GifukaiVocab, query: string): string {
  return vocab.aliasToCanonical[query] || query;
}

function otakugifsSupported(query: string): boolean {
  return OTAKUGIFS_REACTIONS.has(query);
}

/* ================================================================
 * PROVIDER PASS
 * ================================================================ */

interface PassOutcome {
  saved: number;
  completed: boolean;
}

async function runProviderPass(opts: {
  action: string;
  provider: ProviderName;
  query: string;
  requests: number;
  target: number;
  vocab: GifukaiVocab;
  globalHashes: Map<string, string>;
  journal: Journal;
  budgetAware: boolean;
}): Promise<PassOutcome> {
  const { action, provider, query, requests, target, vocab, globalHashes, journal } = opts;
  const key = passKey({ action, provider, query, requests });
  const passIndex = nextPassIndex(journal, key);

  console.log(`\n=== PASS ${action} via ${provider} query "${query}" (pass #${passIndex}, ${requests} requests) ===`);

  const statusCodes: number[] = [];
  let httpResponses = 0;
  const candidates: ProviderResult[] = [];

  for (let i = 0; i < requests; i++) {
    if (opts.budgetAware && budgetExceeded()) break;
    try {
      const url =
        provider === "gifukai"
          ? `${GIFUKAI_BASE}/${encodeURIComponent(query)}`
          : `${OTAKUGIFS_BASE}/gif?reaction=${encodeURIComponent(query)}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const res = await fetch(url, { headers: { Accept: "application/json" }, signal: controller.signal });
      clearTimeout(timeout);
      httpResponses++;
      statusCodes.push(res.status);
      if (!res.ok) continue;
      const data = (await res.json()) as Record<string, unknown>;
      const gifUrl = data.url;
      if (!gifUrl || typeof gifUrl !== "string") continue;

      let canonicalAction: string | undefined;
      let anime: string | undefined;
      if (provider === "gifukai") {
        const expected = gifukaiExpectedAction(vocab, query);
        const reported = typeof data.action === "string" ? data.action : undefined;
        if (reported && reported !== expected) {
          console.warn(`  ✗ Response action "${reported}" does not match expected "${expected}" — rejected`);
          continue;
        }
        canonicalAction = reported || expected;
        if (typeof data.anime === "string") anime = data.anime;
      }
      candidates.push({ url: gifUrl, source: provider, query, canonicalAction, anime });
    } catch {
      // network/abort error: not an HTTP response
    }
    await new Promise(r => setTimeout(r, 50));
  }

  let newSaved = 0;
  let duplicates = 0;
  let failedDownloads = 0;
  let targetReached = (await countAction(action)) >= target;

  for (const cand of candidates) {
    if (opts.budgetAware && budgetExceeded()) break;
    if (targetReached) break;
    console.log(`  → ${cand.source} "${cand.query}": ${cand.url}`);
    const buffer = await downloadAndValidate(cand.url);
    if (!buffer) {
      failedDownloads++;
      continue;
    }
    const hash = sha256Buffer(buffer);
    if (globalHashes.has(hash)) {
      duplicates++;
      console.log(`  = exact duplicate of ${globalHashes.get(hash)} (sha256 ${hash.slice(0, 16)}…), skipping`);
      continue;
    }
    const saved = await saveGifAsset(buffer, action, cand);
    if (!saved) {
      failedDownloads++;
      continue;
    }
    globalHashes.set(hash, `${action}/${saved.file}`);
    await updateManifest(saved);
    newSaved++;
    console.log(`  ✓ saved ${saved.file} (${saved.bytes} B, sha256 ${hash.slice(0, 16)}…) [manifest updated]`);
    targetReached = (await countAction(action)) >= target;
  }

  const budgetHit = opts.budgetAware && budgetExceeded();
  const record: PassRecord = {
    action,
    provider,
    query,
    requests,
    passIndex,
    completedAt: new Date().toISOString(),
    httpResponses,
    urlsReturned: candidates.length,
    newSaved,
    duplicates,
    failedDownloads,
    statusCodes,
    saturated: false,
    interrupted: budgetHit || undefined,
  };
  journal.passes.push(record);
  record.saturated = isSaturated(journal, passKey(record));
  await saveJournal(journal);

  if (budgetHit) {
    console.log(`  ⏱ time budget reached mid-pass — pass recorded as interrupted; will resume next run`);
    return { saved: newSaved, completed: false };
  }

  console.log(
    `  pass complete: ${newSaved} saved, ${duplicates} dupes, ${failedDownloads} failed, ` +
      `${candidates.length} candidate URLs, HTTP [${statusCodes.join(",")}]${record.saturated ? " → SATURATED" : ""}`
  );
  return { saved: newSaved, completed: true };
}

/* ================================================================
 * QUERY SELECTION PER ACTION
 * ================================================================ */

interface QueryPlan {
  query: string;
  providers: ProviderName[];
  kind: "direct" | "alias";
  rationale?: string;
}

function queriesForAction(action: string, vocab: GifukaiVocab): QueryPlan[] {
  const plans: QueryPlan[] = [];

  const directProviders: ProviderName[] = [];
  if (gifukaiSupported(vocab, action)) directProviders.push("gifukai");
  if (otakugifsSupported(action)) directProviders.push("otakugifs");
  if (directProviders.length > 0) {
    plans.push({ query: action, providers: directProviders, kind: "direct" });
  }

  for (const cand of ALIAS_CANDIDATES[action] || []) {
    const providers: ProviderName[] = [];
    if ((cand.provider === "any" || cand.provider === "gifukai") && gifukaiSupported(vocab, cand.query)) {
      providers.push("gifukai");
    }
    if ((cand.provider === "any" || cand.provider === "otakugifs") && otakugifsSupported(cand.query)) {
      providers.push("otakugifs");
    }
    if (providers.length > 0) {
      plans.push({ query: cand.query, providers, kind: "alias", rationale: cand.rationale });
    }
  }

  return plans;
}

/* ================================================================
 * SAVE ASSET
 * ================================================================ */

async function saveGifAsset(
  buffer: Buffer,
  mediaKey: string,
  cand: ProviderResult
): Promise<ManifestAsset | null> {
  const dir = path.join(ACTIONS_DIR, mediaKey);
  await fsp.mkdir(dir, { recursive: true });

  const existing = await fsp.readdir(dir).catch(() => [] as string[]);
  let index = existing.filter(f => f.endsWith(".gif")).length + 1;
  let fileName = `${mediaKey}-${index.toString().padStart(3, "0")}.gif`;
  while (existing.includes(fileName)) {
    index++;
    fileName = `${mediaKey}-${index.toString().padStart(3, "0")}.gif`;
  }
  const finalPath = path.join(dir, fileName);

  const hash = sha256Buffer(buffer);
  const tmpPath = `${finalPath}.tmp-${process.pid}-${Date.now()}`;
  try {
    await fsp.writeFile(tmpPath, buffer);
    await fsp.rename(tmpPath, finalPath);
  } catch (error) {
    await fsp.unlink(tmpPath).catch(() => {});
    console.warn(`  ✗ Save failed: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }

  const relPath = path.relative(GIF_ROOT, finalPath).split(path.sep).join("/");
  const ev = LICENSE_EVIDENCE[cand.source];

  const def = getAllActions().find(a => a.mediaKey === mediaKey);
  const category = def ? def.category : "unknown";

  const asset: ManifestAsset = {
    file: relPath,
    action: mediaKey,
    category,
    source: cand.source,
    providerQuery: cand.query,
    sourceUrl: cand.url,
    license: ev.license,
    licenseEvidence: ev.evidence,
    creator: "collected from provider API",
    attribution: `${cand.source} API (query "${cand.query}")`,
    retrievedAt: new Date().toISOString(),
    sha256: hash,
    bytes: buffer.length,
    mediaKey,
  };
  if (cand.anime) asset.anime = cand.anime;
  return asset;
}

/* ================================================================
 * COLLECTION FLOW
 * ================================================================ */

async function collect(
  selectedActions: string[],
  args: CliArgs
): Promise<void> {
  const vocab = await loadGifukaiVocab();
  console.log(
    `Gifukai vocabulary: ${vocab.actions.size} actions + ${Object.keys(vocab.aliasToCanonical).length} aliases (${vocab.live ? "live" : "FALLBACK snapshot"})`
  );
  console.log(`OtakuGIFs vocabulary: ${OTAKUGIFS_REACTIONS.size} reactions (FAQ snapshot)`);

  const journal = await loadJournal();
  const globalHashes = await buildGlobalHashIndex();
  console.log(`Global index: ${globalHashes.size} unique GIF hashes already on disk\n`);

  let ranPass = false;
  for (const action of selectedActions) {
    const count = await countAction(action);
    if (count >= args.target) {
      console.log(`— ${action}: ${count}/${args.target} (at target, skip)`);
      continue;
    }
    const plans = queriesForAction(action, vocab);
    if (plans.length === 0) {
      console.log(`— ${action}: ${count}/${args.target} — NO supported provider query (documented shortage)`);
      continue;
    }

    for (const plan of plans) {
      const current = await countAction(action);
      if (current >= args.target) break;
      for (const provider of plan.providers) {
        const currentInner = await countAction(action);
        if (currentInner >= args.target) break;
        const key = passKey({ action, provider, query: plan.query, requests: args.requests });
        if (isSaturated(journal, key)) continue;
        if (budgetExceeded()) break;
        ranPass = true;
        const result = await runProviderPass({
          action,
          provider,
          query: plan.query,
          requests: args.requests,
          target: args.target,
          vocab,
          globalHashes,
          journal,
          budgetAware: true,
        });
        if (!result.completed) break;
      }
      if (budgetExceeded()) break;
    }
    if (budgetExceeded()) break;
  }

  if (budgetExceeded()) {
    console.log(`\n⏱ TIME BUDGET REACHED — exiting resumable. Re-run to continue.`);
  } else if (!ranPass) {
    console.log(`\nNo passes run: every selected action is at target or saturated.`);
  }

  const manifest = await loadManifest();
  await generateAttributions(manifest);
  console.log(`\nManifest: ${manifest.totalAssets} assets, ${manifest.totalBytes} bytes`);
  console.log(`Attributions regenerated.`);
}

/* ================================================================
 * MANIFEST REMEDIATION (honest licensing + providerQuery backfill)
 * ================================================================ */

async function remediateManifest(): Promise<void> {
  const manifest = await loadManifest();
  let changed = 0;
  for (const asset of manifest.assets) {
    const ev = LICENSE_EVIDENCE[asset.source as ProviderName];
    if (!ev) continue;
    if (!asset.providerQuery) {
      asset.providerQuery = asset.action;
      changed++;
    }
    if (asset.license !== ev.license || asset.licenseEvidence !== ev.evidence) {
      asset.license = ev.license;
      asset.licenseEvidence = ev.evidence;
      asset.attribution = `${asset.source} API (query "${asset.providerQuery}")`;
      changed++;
    }
  }
  await saveManifest(manifest);
  await generateAttributions(manifest);
  console.log(`Manifest remediated: ${changed} field updates, ${manifest.totalAssets} assets.`);
}

/* ================================================================
 * PLACEHOLDER FINGERPRINTS
 * ================================================================ */

async function loadPlaceholderHashes(): Promise<Set<string>> {
  const hashes = new Set<string>();
  const walk = async (dir: string): Promise<void> => {
    let entries;
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.name.endsWith(".gif")) {
        try {
          hashes.add(sha256Buffer(await fsp.readFile(full)));
        } catch {
          // ignore
        }
      }
    }
  };
  await walk(TEST_GIF_DIR);
  return hashes;
}

/* ================================================================
 * AUTHORITATIVE INVENTORY (--report)
 * ================================================================ */

async function report(args: CliArgs): Promise<number> {
  console.log("=== ASHENAI PRODUCTION GIF INVENTORY ===\n");

  const manifest = await loadManifest();
  const placeholderHashes = await loadPlaceholderHashes();

  const perAction = new Map<string, number>();
  const allHashes = new Set<string>();
  const hashOwners = new Map<string, string>();
  let totalFiles = 0;
  let invalidCount = 0;
  let placeholderCount = 0;
  let duplicateFiles = 0;
  let totalBytes = 0;

  const actionNames = getAllActions().map(a => a.mediaKey);
  for (const action of actionNames) {
    const dir = path.join(ACTIONS_DIR, action);
    let files: string[] = [];
    try {
      files = (await fsp.readdir(dir)).filter(f => f.endsWith(".gif"));
    } catch {
      perAction.set(action, 0);
      continue;
    }
    let valid = 0;
    for (const file of files) {
      totalFiles++;
      const result = await validateGifFile(path.join(dir, file));
      if (!result || !result.valid) {
        invalidCount++;
        console.log(`  ✗ INVALID: ${action}/${file}`);
        continue;
      }
      if (placeholderHashes.has(result.sha256)) {
        placeholderCount++;
        console.log(`  ✗ PLACEHOLDER: ${action}/${file}`);
        continue;
      }
      if (allHashes.has(result.sha256)) {
        duplicateFiles++;
        console.log(`  ✗ DUPLICATE sha256 of ${hashOwners.get(result.sha256)}: ${action}/${file}`);
        continue;
      }
      allHashes.add(result.sha256);
      hashOwners.set(result.sha256, `${action}/${file}`);
      totalBytes += result.size;
      valid++;
    }
    perAction.set(action, valid);
  }

  // files outside the 32 known actions?
  let strayFiles = 0;
  try {
    const dirs = (await fsp.readdir(ACTIONS_DIR, { withFileTypes: true })).filter(e => e.isDirectory());
    for (const d of dirs) {
      if (actionNames.includes(d.name)) continue;
      const files = await fsp.readdir(path.join(ACTIONS_DIR, d.name)).catch(() => [] as string[]);
      strayFiles += files.filter(f => f.endsWith(".gif")).length;
    }
  } catch {
    // ignore
  }

  // manifest <-> filesystem comparison
  const manifestPaths = new Set(manifest.assets.map(a => a.file));
  const manifestHashes = new Set(manifest.assets.map(a => a.sha256));
  const fsPaths = new Set<string>();
  for (const action of actionNames) {
    const dir = path.join(ACTIONS_DIR, action);
    const files = await fsp.readdir(dir).catch(() => [] as string[]);
    for (const f of files) if (f.endsWith(".gif")) fsPaths.add(`actions/${action}/${f}`);
  }
  const inManifestNotFs = [...manifestPaths].filter(p => !fsPaths.has(p));
  const inFsNotManifest = [...fsPaths].filter(p => !manifestPaths.has(p));
  const manifestMatches =
    inManifestNotFs.length === 0 &&
    inFsNotManifest.length === 0 &&
    manifest.assets.length === fsPaths.size &&
    manifestPaths.size === manifestHashes.size;

  // provider contributions
  const providerCounts = new Map<string, number>();
  const queryCounts = new Map<string, number>();
  let aliasedAssets = 0;
  for (const a of manifest.assets) {
    providerCounts.set(a.source, (providerCounts.get(a.source) || 0) + 1);
    const qk = `${a.source}:${a.providerQuery || a.action}`;
    queryCounts.set(qk, (queryCounts.get(qk) || 0) + 1);
    if (a.providerQuery && a.providerQuery !== a.action) aliasedAssets++;
  }

  const covered = [...perAction.values()].filter(n => n > 0).length;
  const atTarget = [...perAction.values()].filter(n => n >= args.target).length;
  const zeroActions = [...perAction.entries()].filter(([, n]) => n === 0).map(([a]) => a);

  // journal stats
  const journal = await loadJournal();
  const saturatedKeys = new Set(
    [...new Set(journal.passes.map(passKey))].filter(k => isSaturated(journal, k))
  );

  console.log(`\n--- INVENTORY ---`);
  console.log(`Total files (production):        ${totalFiles}`);
  console.log(`Unique SHA-256 (valid, non-placeholder): ${allHashes.size}`);
  console.log(`Real production assets:          ${allHashes.size}`);
  console.log(`Placeholder matches:             ${placeholderCount} (fingerprints: ${placeholderHashes.size} from data/anime-gifs-test)`);
  console.log(`Invalid GIFs:                    ${invalidCount}`);
  console.log(`Duplicate files (sha256):        ${duplicateFiles}`);
  console.log(`Stray files in unknown dirs:     ${strayFiles}`);
  console.log(`Total bytes:                     ${totalBytes} (${(totalBytes / 1024 / 1024).toFixed(1)} MB)`);
  console.log(`Manifest entries:                ${manifest.assets.length} (manifest.totalAssets=${manifest.totalAssets})`);
  console.log(`Manifest matches filesystem:     ${manifestMatches ? "YES" : "NO"} (only-manifest: ${inManifestNotFs.length}, only-fs: ${inFsNotManifest.length})`);
  console.log(`Actions covered:                 ${covered}/32`);
  console.log(`Actions at target (${args.target}):            ${atTarget}/32`);
  console.log(`Zero-result actions:             ${zeroActions.length ? zeroActions.join(", ") : "none"}`);

  console.log(`\n--- PER-ACTION COUNTS ---`);
  for (const action of actionNames) {
    const n = perAction.get(action) || 0;
    console.log(`  ${action.padEnd(12)} ${String(n).padStart(3)}${n === 0 ? "  ← ZERO" : n < 8 ? "  ← below 8" : ""}`);
  }

  console.log(`\n--- PROVIDER CONTRIBUTIONS ---`);
  for (const [src, n] of [...providerCounts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${src.padEnd(12)} ${n}`);
  }
  console.log(`  aliased (providerQuery != action): ${aliasedAssets}`);
  console.log(`  query breakdown:`);
  for (const [qk, n] of [...queryCounts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${qk.padEnd(28)} ${n}`);
  }

  console.log(`\n--- COLLECTOR JOURNAL ---`);
  console.log(`  completed passes recorded: ${journal.passes.length}`);
  console.log(`  saturated (action|provider|query) keys: ${saturatedKeys.size}`);
  const savedTotal = journal.passes.reduce((s, p) => s + p.newSaved, 0);
  const dupTotal = journal.passes.reduce((s, p) => s + p.duplicates, 0);
  console.log(`  saved via journal: ${savedTotal}, duplicates skipped: ${dupTotal}`);

  console.log(`\n--- LICENSING ---`);
  const licenseCounts = new Map<string, number>();
  for (const a of manifest.assets) licenseCounts.set(a.license, (licenseCounts.get(a.license) || 0) + 1);
  for (const [lic, n] of licenseCounts) console.log(`  [${n}] ${lic}`);
  const falseClaims = manifest.assets.filter(a => /CC0|Public Domain|CC BY/i.test(a.license)).length;
  console.log(`  assets claiming CC0/PD/CC-BY: ${falseClaims}`);

  // gates
  console.log(`\n--- HARD REQUIREMENT GATES ---`);
  const gates: Array<[string, boolean, string]> = [
    ["≥300 unique real production GIFs", allHashes.size >= 300, `${allHashes.size}/300`],
    ["32/32 actions covered", covered === 32, `${covered}/32`],
    ["≥8 per action", zeroActions.length === 0 && [...perAction.values()].every(n => n >= 8), `min=${Math.min(...[...perAction.values()])}`],
    ["zero production placeholders", placeholderCount === 0, `${placeholderCount} found`],
    ["zero invalid files", invalidCount === 0, `${invalidCount} found`],
    ["zero sha256 duplicates", duplicateFiles === 0 && allHashes.size === totalFiles - invalidCount - placeholderCount - duplicateFiles, `${duplicateFiles} dup files`],
    ["manifest exactly matches filesystem", manifestMatches, manifestMatches ? "match" : "MISMATCH"],
    ["no unverified CC0/PD/CC-BY claims", falseClaims === 0, `${falseClaims} claims`],
  ];
  let allPass = true;
  for (const [name, pass, detail] of gates) {
    console.log(`  ${pass ? "PASS" : "FAIL"}  ${name} (${detail})`);
    if (!pass) allPass = false;
  }

  const redistributionEvidence = false; // providers grant no redistribution license
  console.log(`\n  LICENSING GATE: ${redistributionEvidence ? "PASS" : "FAIL"}  legally redistributable evidence`);
  console.log(`    Gifukai: ${LICENSE_EVIDENCE.gifukai.evidence}`);
  console.log(`    OtakuGIFs: ${LICENSE_EVIDENCE.otakugifs.evidence}`);
  allPass = allPass && redistributionEvidence;

  if (allPass) {
    console.log(`\n✅ VERDICT: READY`);
    return 0;
  }
  console.log(`\n❌ VERDICT: NOT READY — BLOCKERS REMAIN`);
  return 1;
}

/* ================================================================
 * ENTRY POINT
 * ================================================================ */

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.report) {
    process.exit(await report(args));
  }

  if (args.remediate) {
    await remediateManifest();
    return;
  }

  console.log("=== ASHENAI REAL GIF COLLECTOR (resumable) ===");
  console.log(`requests/provider/pass: ${args.requests}, per-action target: ${args.target}`);
  if (args.timeBudgetSec) console.log(`time budget: ${args.timeBudgetSec}s`);

  await fsp.mkdir(ACTIONS_DIR, { recursive: true });
  for (const def of getAllActions()) {
    await fsp.mkdir(path.join(ACTIONS_DIR, def.mediaKey), { recursive: true });
  }

  if (args.resetSelection) {
    await fsp.writeFile(
      SELECTION_STATE_PATH,
      JSON.stringify({ version: 1, updatedAt: Date.now(), states: {} }, null, 2)
    );
    console.log("Selection state reset.");
  }

  const allMediaKeys = getAllActions().map(a => a.mediaKey);
  let selected: string[];
  if (args.action) {
    if (!allMediaKeys.includes(args.action)) {
      console.error(`Unknown action mediaKey: ${args.action}`);
      process.exit(2);
    }
    selected = [args.action];
  } else if (args.batch !== undefined) {
    // biggest deficit first so zero/low-coverage actions are never starved
    const counts = await Promise.all(allMediaKeys.map(async k => ({ k, n: await countAction(k) })));
    counts.sort((a, b) => a.n - b.n || a.k.localeCompare(b.k));
    selected = counts.slice(0, args.batch).map(c => c.k);
  } else if (args.all) {
    // biggest deficit first so zero/low-coverage actions are never starved
    const counts = await Promise.all(allMediaKeys.map(async k => ({ k, n: await countAction(k) })));
    counts.sort((a, b) => a.n - b.n || a.k.localeCompare(b.k));
    selected = counts.map(c => c.k);
  } else {
    console.error("Specify --action=<key>, --batch=<n>, --all, --report or --remediate-manifest");
    process.exit(2);
  }

  startBudget(args.timeBudgetSec);
  await collect(selected, args);
}

(async () => {
  try {
    await main();
  } catch (error) {
    console.error("Fatal error:", error);
    process.exit(1);
  }
})();
