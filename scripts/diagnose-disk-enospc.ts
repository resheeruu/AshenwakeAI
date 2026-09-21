#!/usr/bin/env node
/* ================================================================
 * DISK / ENOSPC DIAGNOSTIC (hosting-aware, read-only by default)
 *
 * PURPOSE
 * Diagnose "ENOSPC: no space left on device" during the Playwright
 * ~184 MB Chromium download without assuming that `df -h` output
 * represents the hosting account's allocated storage.
 *
 * It distinguishes five DIFFERENT things that are commonly conflated:
 *   1. Physical device storage   (datacenter disk hardware)
 *   2. Host machine storage      (what the host OS sees)
 *   3. Container-visible fs capacity (what df/statfs report inside the
 *                                   container — often the host fs, an
 *                                   overlay upperdir, or a volume)
 *   4. Hosting account/server quota (Wispbyte's limit for this server —
 *                                   normally NOT exposed inside the
 *                                   container)
 *   5. Filesystem / writable-layer limits (overlay upperdir size, /tmp
 *                                   tmpfs size, inode exhaustion,
 *                                   per-directory quotas, cgroup limits)
 *
 * It probes ONLY the filesystems actually used by:
 *   - Playwright cache (PLAYWRIGHT_BROWSERS_PATH)
 *   - npm cache       (npm config get cache)
 *   - temp downloads  (TMPDIR, /tmp)
 *   - application runtime data (APP_DIR, HOME)
 *
 * SAFETY
 *   - Never deletes arbitrary files.
 *   - Optional write probe (--probe[=MB], default 16 MB) creates exactly
 *     one uniquely-named probe file per path and removes only that file.
 *   - Performs no network access.
 *
 * EXIT CODE
 *   Always 0 (diagnostic tool). Use --json for machine-readable output.
 * ================================================================ */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";
import { randomBytes } from "node:crypto";

interface PathReport {
  label: string;
  path: string;
  resolved: string;
  exists: boolean;
  device: string | null;
  mountPoint: string | null;
  fstype: string | null;
  totalMB: number | null;
  freeMB: number | null;
  freePct: number | null;
  inodesTotal: number | null;
  inodesFree: number | null;
  inodeUsePct: string | null;
  writable: boolean;
  writeProbe: {
    attempted: boolean;
    mbWritten: number;
    error: string | null;
    errno: string | null;
    freedAfterCleanup: boolean;
  };
  notes: string[];
}

const QUOTA_NOTE =
  "Actual Wispbyte storage quota could not be verified from inside the container.";

function sh(cmd: string): string | null {
  try {
    return execSync(cmd, { encoding: "utf-8", timeout: 8000 }).trim();
  } catch {
    return null;
  }
}

function readFileSafe(p: string): string | null {
  try {
    return fs.readFileSync(p, "utf-8");
  } catch {
    return null;
  }
}
/* ---------------- df parsing (df -P uses 512-byte blocks) --------------- */

function parseDf(target: string): Partial<PathReport> {
  const raw = sh(`df -P "${target}"`);
  if (!raw) return {};
  const cols = (raw.split("\n")[1] || "").split(/\s+/);
  if (cols.length < 6) return {};
  const totalBlocks = Number(cols[1]);
  const freeBlocks = Number(cols[3]);
  const totalMB = Number.isFinite(totalBlocks) ? Math.round((totalBlocks * 512) / 1048576) : null;
  const freeMB = Number.isFinite(freeBlocks) ? Math.round((freeBlocks * 512) / 1048576) : null;
  const freePct =
    totalBlocks > 0 && Number.isFinite(freeBlocks)
      ? Number(((freeBlocks / totalBlocks) * 100).toFixed(1))
      : null;

  const inoRaw = sh(`df -i -P "${target}"`);
  let inodesTotal: number | null = null;
  let inodesFree: number | null = null;
  let inodeUsePct: string | null = null;
  if (inoRaw) {
    // df -i -P: Filesystem Inodes IUsed IFree IUse% Mounted_on
    const ic = (inoRaw.split("\n")[1] || "").split(/\s+/);
    if (ic.length >= 5) {
      inodesTotal = Number.isFinite(Number(ic[1])) ? Number(ic[1]) : null;
      inodesFree = Number.isFinite(Number(ic[3])) ? Number(ic[3]) : null;
      inodeUsePct = ic[4] || null;
    }
  }

  return {
    device: cols[0],
    mountPoint: cols[5],
    totalMB,
    freeMB,
    freePct,
    inodesTotal,
    inodesFree,
    inodeUsePct,
  };
}

/* ---------------- mountinfo: detect overlay / tmpfs / volumes ---------- */

function mountInfoFor(fsPath: string): { mountPoint: string | null; fstype: string | null } {
  const mi = readFileSafe("/proc/self/mountinfo");
  if (!mi) return { mountPoint: null, fstype: null };
  let bestLen = -1;
  let best: { mountPoint: string | null; fstype: string | null } = { mountPoint: null, fstype: null };
  for (const line of mi.split("\n")) {
    const parts = line.split(" ");
    if (parts.length < 10) continue;
    const sep = parts.indexOf("-");
    if (sep < 0 || sep + 1 >= parts.length) continue;
    const mountPoint = parts[4];
    const fstype = parts[sep + 1];
    if (!mountPoint) continue;
    const normalised =
      mountPoint.endsWith("/") && mountPoint !== "/" ? mountPoint.slice(0, -1) : mountPoint;
    const prefix = normalised === "/" ? "/" : normalised + "/";
    if (fsPath === normalised || fsPath.startsWith(prefix)) {
      if (normalised.length > bestLen) {
        bestLen = normalised.length;
        best = { mountPoint: normalised, fstype };
      }
    }
  }
  return best;
}

/* ---------------- bounded write probe (creates 1 file, removes it) ------ */

function writeProbe(dir: string, maxMB: number): PathReport["writeProbe"] {
  const result: PathReport["writeProbe"] = {
    attempted: false,
    mbWritten: 0,
    error: null,
    errno: null,
    freedAfterCleanup: false,
  };
  if (maxMB <= 0) return result;
  result.attempted = true;

  const target = path.join(
    dir,
    `.ashenai-diskprobe-${process.pid}-${randomBytes(4).toString("hex")}`,
  );
  const chunk = Buffer.alloc(1024 * 1024, 0x61); // 1 MiB
  let fd: number | null = null;
  try {
    fd = fs.openSync(target, "w");
    for (let i = 0; i < maxMB; i++) {
      try {
        fs.writeSync(fd, chunk);
        result.mbWritten += 1;
      } catch (err: any) {
        result.error = err?.message ? String(err.message) : String(err);
        result.errno = err?.code ? String(err.code) : null;
        break;
      }
    }
  } catch (err: any) {
    result.error = err?.message ? String(err.message) : String(err);
    result.errno = err?.code ? String(err.code) : null;
  } finally {
    if (fd !== null) {
      try {
        fs.closeSync(fd);
      } catch {
        /* ignore */
      }
    }
    try {
      fs.unlinkSync(target);
      result.freedAfterCleanup = true;
    } catch {
      result.freedAfterCleanup = false;
    }
  }
  return result;
}

/* ---------------- per-path inspection ---------------------------------- */

function inspectPath(label: string, rawPath: string, probeMB: number): PathReport {
  const notes: string[] = [];
  let resolved = rawPath;
  if (!fs.existsSync(resolved)) {
    let cur = path.dirname(resolved);
    while (!fs.existsSync(cur) && cur !== "/" && cur !== ".") cur = path.dirname(cur);
    notes.push(`path missing; probed nearest existing ancestor: ${cur}`);
    resolved = cur;
  }
  const exists = fs.existsSync(resolved);
  let real = resolved;
  try {
    if (exists) real = fs.realpathSync(resolved);
  } catch {
    /* keep resolved */
  }
  const df = exists ? parseDf(real) : {};
  const mi = exists ? mountInfoFor(real) : { mountPoint: null, fstype: null };

  let writable = false;
  try {
    fs.accessSync(real, fs.constants.W_OK);
    writable = true;
  } catch {
    writable = false;
  }

  const report: PathReport = {
    label,
    path: rawPath,
    resolved: real,
    exists,
    device: df.device ?? null,
    mountPoint: df.mountPoint ?? mi.mountPoint ?? null,
    fstype: mi.fstype ?? null,
    totalMB: df.totalMB ?? null,
    freeMB: df.freeMB ?? null,
    freePct: df.freePct ?? null,
    inodesTotal: df.inodesTotal ?? null,
    inodesFree: df.inodesFree ?? null,
    inodeUsePct: df.inodeUsePct ?? null,
    writable,
    writeProbe: {
      attempted: false,
      mbWritten: 0,
      error: null,
      errno: null,
      freedAfterCleanup: false,
    },
    notes,
  };

  if (exists && writable && probeMB > 0) {
    report.writeProbe = writeProbe(real, probeMB);
  }

  if (report.inodeUsePct === "100%") {
    notes.push("INODE EXHAUSTION: df -i reports 100% inodes used on this filesystem.");
  }
  if (report.fstype === "overlay") {
    notes.push(
      "overlay filesystem: writes consume the container writable layer (upperdir), which may be size-limited independently of df.",
    );
  }
  if (report.fstype === "tmpfs") {
    notes.push(
      "tmpfs: size-limited by its mount option (RAM backed); not part of the account disk quota.",
    );
  }
  if (report.writeProbe.attempted && report.writeProbe.error) {
    notes.push(
      `write probe failed after ${report.writeProbe.mbWritten} MB (${report.writeProbe.errno ?? "unknown"}): ${report.writeProbe.error}`,
    );
  }
  return report;
}

function human(mb: number | null): string {
  if (mb === null) return "(unknown)";
  if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`;
  return `${mb} MB`;
}

/* ---------------- environment / container / cgroup signals -------------- */

function envSignals(): string[] {
  const out: string[] = [];
  const keys = [
    "WISPBYTE",
    "WISPBYTE_SERVER_ID",
    "PTERODACTYL",
    "P_SERVER_UUID",
    "DOCKER_CONTAINER",
    "container",
    "RAILWAY_ENVIRONMENT",
    "FLY_APP_NAME",
    "KOYEB_APP_NAME",
    "RENDER",
    "HEROKU_APP_NAME",
    "TERMUX_VERSION",
    "TMPDIR",
    "PLAYWRIGHT_BROWSERS_PATH",
    "npm_config_cache",
    "HOME",
  ];
  for (const k of keys) {
    if (process.env[k]) out.push(`${k}=(set)`);
  }
  out.push(`/.dockerenv exists: ${fs.existsSync("/.dockerenv")}`);
  const cgroup = readFileSafe("/proc/1/cgroup");
  if (cgroup) {
    const line = cgroup.split("\n").find((l) => l.trim().length > 0) || "";
    out.push(`/proc/1/cgroup: ${line.slice(0, 160)}`);
  }
  const own = readFileSafe("/proc/self/cgroup");
  if (own) {
    const line = own.split("\n").find((l) => l.trim().length > 0) || "";
    out.push(`/proc/self/cgroup: ${line.slice(0, 160)}`);
  }
  return out;
}

function cgroupLimits(): string[] {
  const out: string[] = [];
  const candidates: Array<[string, string]> = [
    ["cgroup v2 memory.max", "/sys/fs/cgroup/memory.max"],
    ["cgroup v2 memory.high", "/sys/fs/cgroup/memory.high"],
    ["cgroup v2 pids.max", "/sys/fs/cgroup/pids.max"],
    ["cgroup v1 memory.limit_in_bytes", "/sys/fs/cgroup/memory/memory.limit_in_bytes"],
    ["cgroup v1 pids.max", "/sys/fs/cgroup/pids/pids.max"],
    ["cgroup v2 io.max", "/sys/fs/cgroup/io.max"],
  ];
  for (const [label, p] of candidates) {
    const v = readFileSafe(p);
    if (v !== null) out.push(`${label}: ${v.trim() === "" ? "(empty)" : v.trim().slice(0, 120)}`);
  }
  if (out.length === 0) out.push("no cgroup memory/pids/io limit files readable");
  out.push("NOTE: cgroup files expose per-container CPU/RAM/IO limits, not the storage quota.");
  return out;
}

function quotaTooling(): string[] {
  const out: string[] = [];
  const tools = ["quota", "repquota", "xfs_quota", "btrfs"];
  for (const t of tools) {
    const p = sh(`command -v ${t}`);
    out.push(`${t}: ${p ? p : "not installed"}`);
  }
  const fstab = readFileSafe("/etc/fstab");
  if (fstab) {
    const quotaMounts = fstab.split("\n").filter((l) => /usrquota|grpquota|prjquota/.test(l));
    out.push(
      `/etc/fstab quota mount options: ${quotaMounts.length > 0 ? quotaMounts.join(" | ") : "none visible"}`,
    );
  } else {
    out.push("/etc/fstab: not readable");
  }
  out.push(
    "NOTE: filesystem quota tooling inside a container usually cannot see the hosting account quota.",
  );
  return out;
}

/* ---------------- verdict ---------------------------------------------- */

function classify(reports: PathReport[], probeMB: number): string[] {
  const lines: string[] = [];
  const anyEnospc = reports.filter((r) => r.writeProbe.errno === "ENOSPC");
  const anyInodeExhausted = reports.filter((r) => r.inodeUsePct === "100%");
  const anyTmpfs = reports.filter((r) => r.fstype === "tmpfs");
  const anyOverlay = reports.filter((r) => r.fstype === "overlay");
  const anyUnwritable = reports.filter((r) => !r.writable);

  if (anyEnospc.length > 0) {
    lines.push(
      `EVIDENCE: writes failed with ENOSPC on: ${anyEnospc.map((r) => r.resolved).join(", ")} ` +
        `(only a ${probeMB} MB probe was attempted). The binding limit is NOT the df free space reported for that path.`,
    );
    for (const r of anyEnospc) {
      lines.push(
        `  -> path=${r.resolved} df_free=${human(r.freeMB)} fstype=${r.fstype ?? "unknown"} ` +
          `mount=${r.mountPoint ?? "unknown"} inodes_free=${r.inodesFree ?? "unknown"}`,
      );
    }
  } else {
    lines.push(
      probeMB > 0
        ? `NO EVIDENCE of ENOSPC at a ${probeMB} MB probe size on the probed paths. A ~184 MB Chromium download may still hit ` +
            `a limit that only appears at larger sizes (account quota, writable layer, or provider-injected limits).`
        : `NO WRITE PROBE RUN (probe size 0; pass --probe[=MB] to attempt reproducible bounded writes). ` +
            `df free space alone cannot prove that a ~184 MB Chromium download will succeed.`,
    );
  }

  if (anyInodeExhausted.length > 0) {
    lines.push(`EVIDENCE: inode exhaustion on: ${anyInodeExhausted.map((r) => r.resolved).join(", ")}`);
  }
  if (anyTmpfs.length > 0) {
    lines.push(
      `NOTE: tmpfs-backed paths detected (${anyTmpfs.map((r) => r.mountPoint ?? r.resolved).join(", ")}). ` +
        `Playwright/npm temp extraction can use /tmp; a small tmpfs yields ENOSPC despite large disk free space.`,
    );
  }
  if (anyOverlay.length > 0) {
    lines.push(
      "NOTE: overlay filesystem detected. The container writable layer (upperdir) can be size-limited separately from the reported filesystem.",
    );
  }
  if (anyUnwritable.length > 0) {
    lines.push(
      `NOTE: not writable by this process: ${anyUnwritable.map((r) => r.resolved).join(", ")}. ` +
        `Playwright may fall back elsewhere; EACCES/EROFS is distinct from ENOSPC.`,
    );
  }

  lines.push("NOT VERIFIED: Wispbyte hosting account/server quota (invisible from inside the container).");
  lines.push(`  ${QUOTA_NOTE}`);
  lines.push(
    "NOT VERIFIED: provider-side per-container limits, unless the provider panel exposes them.",
  );
  lines.push(
    "NOT VERIFIED: host machine total/free storage and physical device storage (container-only view).",
  );
  return lines;
}

/* ---------------- main -------------------------------------------------- */

function main(): void {
  const argv = process.argv.slice(2);
  const json = argv.includes("--json");
  const probeArg = argv.find((a) => a.startsWith("--probe"));
  let probeMB = 0;
  if (probeArg) {
    const eq = probeArg.split("=")[1];
    const parsed = eq !== undefined ? Number(eq) : Number(process.env.ASHENAI_DISK_PROBE_MB ?? 16);
    probeMB = Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 512) : 16;
  }

  const appDir = process.cwd();
  const browsersPath =
    process.env.PLAYWRIGHT_BROWSERS_PATH || path.join(os.homedir(), ".cache", "ms-playwright");
  const npmCache =
    sh("npm config get cache") || process.env.npm_config_cache || path.join(os.homedir(), ".npm");
  const tmpDir = process.env.TMPDIR || os.tmpdir() || "/tmp";

  const targets: Array<[string, string]> = [
    ["app runtime data (cwd)", appDir],
    ["Playwright browser cache", browsersPath],
    ["npm cache", npmCache],
    ["TMPDIR temp downloads", tmpDir],
    ["/tmp (system temp)", "/tmp"],
    ["HOME", os.homedir()],
  ];

  if (!json) {
    console.log("");
    console.log("╔══════════════════════════════════════════════════════════════╗");
    console.log("║   ASHENAI DISK / ENOSPC DIAGNOSTIC                           ║");
    console.log("╚══════════════════════════════════════════════════════════════╝");
    console.log("");
    console.log("  These storage layers are NOT the same thing:");
    console.log("   1. physical device storage          2. host machine storage");
    console.log("   3. container-visible filesystem      4. hosting account quota");
    console.log("   5. filesystem / writable-layer limits (overlay, tmpfs, inodes)");
    console.log("");
    console.log("  A large df value is NOT proof of sufficient hosting storage.");
    console.log(`  ${QUOTA_NOTE}`);
    console.log("");
  }

  const reports: PathReport[] = [];
  const seen = new Set<string>();
  for (const [label, p] of targets) {
    let key = p;
    try {
      key = fs.existsSync(p) ? fs.realpathSync(p) : p;
    } catch {
      /* keep raw */
    }
    if (seen.has(key)) continue;
    seen.add(key);
    reports.push(inspectPath(label, p, probeMB));
  }

  if (!json) {
    console.log("── Paths used by the Chromium download pipeline ──────────────");
    for (const r of reports) {
      console.log("");
      console.log(`  ${r.label}`);
      console.log(`    requested path     : ${r.path}`);
      console.log(`    resolved path      : ${r.resolved}`);
      console.log(
        `    device / mount     : ${r.device ?? "?"} / ${r.mountPoint ?? "?"} (${r.fstype ?? "fstype unknown"})`,
      );
      console.log(
        `    free / total       : ${human(r.freeMB)} / ${human(r.totalMB)} (${r.freePct ?? "?"}% free)`,
      );
      console.log(
        `    inodes free / total: ${r.inodesFree ?? "?"} / ${r.inodesTotal ?? "?"} (used: ${r.inodeUsePct ?? "?"})`,
      );
      console.log(`    writable by process: ${r.writable ? "yes" : "no"}`);
      if (r.writeProbe.attempted) {
        console.log(
          `    write probe        : wrote ${r.writeProbe.mbWritten} MB` +
            (r.writeProbe.error
              ? ` then FAILED (${r.writeProbe.errno ?? "errno?"}): ${r.writeProbe.error}`
              : " with no error") +
            ` [probe file removed: ${r.writeProbe.freedAfterCleanup ? "yes" : "NO"}]`,
        );
      } else {
        console.log("    write probe        : skipped (no --probe, path missing, or not writable)");
      }
      for (const n of r.notes) console.log(`    note               : ${n}`);
    }

    console.log("");
    console.log("── Environment / container signals ───────────────────────────");
    for (const s of envSignals()) console.log(`  ${s}`);

    console.log("");
    console.log("── cgroup limits ─────────────────────────────────────────────");
    for (const s of cgroupLimits()) console.log(`  ${s}`);

    console.log("");
    console.log("── quota tooling ─────────────────────────────────────────────");
    for (const s of quotaTooling()) console.log(`  ${s}`);
  }

  const verdict = classify(reports, probeMB);

  if (json) {
    console.log(
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          probeMB,
          quotaNote: QUOTA_NOTE,
          paths: reports,
          environment: envSignals(),
          cgroup: cgroupLimits(),
          quotaTooling: quotaTooling(),
          verdict,
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log("");
  console.log("── Verdict ───────────────────────────────────────────────────");
  for (const v of verdict) console.log(`  ${v}`);
  console.log("");
  console.log("── Next steps (run on the Wispbyte server / control panel) ────");
  console.log("  1. Check the host panel for the account's REAL disk quota/usage (df cannot show it).");
  console.log("  2. Re-run: npx tsx scripts/diagnose-disk-enospc.ts --probe=220");
  console.log("     to reproduce a Chromium-sized (184 MB+) write on each pipeline path.");
  console.log("  3. If the probe fails while df shows free space, the binding limit is");
  console.log("     the account quota, the container writable layer, or a provider limit.");
  console.log("  4. Then free space through the host panel (or raise the plan quota) and set");
  console.log("     ASHENAI_PLAYWRIGHT_BOOTSTRAP_FORCE=1 to retry the Chromium install.");
  console.log("");
}

main();
