import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { logger } from "../logger";

// ============================================================
// U19: Lightweight Runtime Resource Monitor
// Tracks memory, CPU, disk, processes, and health.
// Never logs secrets, credentials, or user data.
// ============================================================

export type ResourcePressure = "NORMAL" | "WARNING" | "CONSTRAINED" | "CRITICAL";
export type ResourceHealth = "healthy" | "degraded" | "critical";

export interface ResourceSnapshot {
  timestamp: number;
  memory: {
    rss: number;
    heapUsed: number;
    heapTotal: number;
    external: number;
    arrayBuffers: number;
    rssMB: number;
    heapUsedMB: number;
    heapTotalMB: number;
  };
  cpu: {
    userMicros: number;
    systemMicros: number;
    userMs: number;
    systemMs: number;
  };
  system: {
    totalMemBytes: number;
    freeMemBytes: number;
    availableMemBytes: number;
    totalMemMB: number;
    freeMemMB: number;
    uptimeSeconds: number;
    loadAvg: number[];
    platform: string;
    arch: string;
    nodeVersion: string;
  };
  process: {
    pid: number;
    activeHandles: number;
    activeRequests: number;
    uptimeSeconds: number;
  };
  disk: {
    dataDirSizeKB: number;
    dataFileCount: number;
    largestFile: string;
    largestFileSizeKB: number;
  };
  pressure: ResourcePressure;
  health: ResourceHealth;
  recommendations: string[];
}

// Thresholds (documented assumptions)
const HEAP_WARNING_MB = 256;
const HEAP_CRITICAL_MB = 512;
const RSS_WARNING_MB = 512;
const RSS_CRITICAL_MB = 1024;
const FREE_MEM_WARNING_PCT = 0.15; // <15% free
const FREE_MEM_CRITICAL_PCT = 0.05; // <5% free
const DATA_DIR_WARNING_MB = 50;
const DATA_DIR_CRITICAL_MB = 200;

let previousSnapshot: ResourceSnapshot | null = null;
let snapshotCount = 0;

function measureDiskUsage(dir: string): { sizeKB: number; fileCount: number; largest: string; largestKB: number } {
  let totalKB = 0;
  let fileCount = 0;
  let largestName = "";
  let largestKB = 0;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isFile()) {
        try {
          const stat = fs.statSync(fullPath);
          const kb = Math.round(stat.size / 1024);
          totalKB += kb;
          fileCount++;
          if (kb > largestKB) { largestKB = kb; largestName = entry.name; }
        } catch { /* skip inaccessible */ }
      } else if (entry.isDirectory() && entry.name !== ".git" && entry.name !== "node_modules") {
        const sub = measureDiskUsage(fullPath);
        totalKB += sub.sizeKB;
        fileCount += sub.fileCount;
        if (sub.largestKB > largestKB) { largestKB = sub.largestKB; largestName = entry.name; }
      }
    }
  } catch { /* dir not readable */ }
  return { sizeKB: totalKB, fileCount, largest: largestName, largestKB };
}

function classifyPressure(snap: ResourceSnapshot): ResourcePressure {
  const heapMB = snap.memory.heapUsedMB;
  const rssMB = snap.memory.rssMB;
  const freeMemPct = snap.system.totalMemBytes > 0
    ? snap.system.freeMemBytes / snap.system.totalMemBytes
    : 1;
  const dataMB = snap.disk.dataDirSizeKB / 1024;

  // Critical: any critical threshold hit
  if (heapMB > HEAP_CRITICAL_MB || rssMB > RSS_CRITICAL_MB || freeMemPct < FREE_MEM_CRITICAL_PCT || dataMB > DATA_DIR_CRITICAL_MB) {
    return "CRITICAL";
  }
  // Constrained: multiple warning thresholds
  const warnings = [
    heapMB > HEAP_WARNING_MB,
    rssMB > RSS_WARNING_MB,
    freeMemPct < FREE_MEM_WARNING_PCT,
    dataMB > DATA_DIR_WARNING_MB,
  ].filter(Boolean).length;
  if (warnings >= 2) return "CONSTRAINED";
  if (warnings === 1) return "WARNING";
  return "NORMAL";
}

function classifyHealth(snap: ResourceSnapshot): ResourceHealth {
  if (snap.pressure === "CRITICAL") return "critical";
  if (snap.pressure === "CONSTRAINED") return "degraded";
  return "healthy";
}

function generateRecommendations(snap: ResourceSnapshot): string[] {
  const recs: string[] = [];
  if (snap.memory.heapUsedMB > HEAP_WARNING_MB) {
    recs.push(`Heap usage elevated (${snap.memory.heapUsedMB}MB). Consider reducing cache retention.`);
  }
  if (snap.memory.rssMB > RSS_WARNING_MB) {
    recs.push(`RSS elevated (${snap.memory.rssMB}MB). Monitor for growth.`);
  }
  const freeMemPct = snap.system.totalMemBytes > 0
    ? snap.system.freeMemBytes / snap.system.totalMemBytes : 1;
  if (freeMemPct < FREE_MEM_WARNING_PCT) {
    recs.push(`System free memory low (${(freeMemPct * 100).toFixed(1)}%). Reduce optional background work.`);
  }
  if (snap.disk.dataDirSizeKB / 1024 > DATA_DIR_WARNING_MB) {
    recs.push(`Data directory large (${(snap.disk.dataDirSizeKB / 1024).toFixed(1)}MB). Consider log rotation.`);
  }
  if (snap.process.activeHandles > 100) {
    recs.push(`Active handles elevated (${snap.process.activeHandles}). Check for timer/listener leaks.`);
  }
  // Check for heap growth
  if (previousSnapshot && snapshotCount > 1) {
    const heapGrowthMB = snap.memory.heapUsedMB - previousSnapshot.memory.heapUsedMB;
    if (heapGrowthMB > 50) {
      recs.push(`Heap grew ${heapGrowthMB.toFixed(1)}MB since last snapshot. Monitor for leaks.`);
    }
  }
  if (recs.length === 0) {
    recs.push("System operating within normal parameters.");
  }
  return recs;
}

/** Take a resource snapshot. Safe to call frequently. */
export function takeSnapshot(): ResourceSnapshot {
  const mem = process.memoryUsage();
  const cpu = process.cpuUsage();
  const dataDir = path.join(process.cwd(), "data");
  const disk = measureDiskUsage(dataDir);

  const snap: ResourceSnapshot = {
    timestamp: Date.now(),
    memory: {
      rss: mem.rss,
      heapUsed: mem.heapUsed,
      heapTotal: mem.heapTotal,
      external: mem.external,
      arrayBuffers: mem.arrayBuffers,
      rssMB: Math.round(mem.rss / 1024 / 1024),
      heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
      heapTotalMB: Math.round(mem.heapTotal / 1024 / 1024),
    },
    cpu: {
      userMicros: cpu.user,
      systemMicros: cpu.system,
      userMs: Math.round(cpu.user / 1000),
      systemMs: Math.round(cpu.system / 1000),
    },
    system: {
      totalMemBytes: os.totalmem(),
      freeMemBytes: os.freemem(),
      availableMemBytes: os.freemem(),
      totalMemMB: Math.round(os.totalmem() / 1024 / 1024),
      freeMemMB: Math.round(os.freemem() / 1024 / 1024),
      uptimeSeconds: Math.round(process.uptime()),
      loadAvg: os.loadavg(),
      platform: os.platform(),
      arch: os.arch(),
      nodeVersion: process.version,
    },
    process: {
      pid: process.pid,
      activeHandles: typeof (process as any)._getActiveHandles === "function" ? (process as any)._getActiveHandles().length : 0,
      activeRequests: typeof (process as any)._getActiveRequests === "function" ? (process as any)._getActiveRequests().length : 0,
      uptimeSeconds: Math.round(process.uptime()),
    },
    disk: {
      dataDirSizeKB: disk.sizeKB,
      dataFileCount: disk.fileCount,
      largestFile: disk.largest,
      largestFileSizeKB: disk.largestKB,
    },
    pressure: "NORMAL",
    health: "healthy",
    recommendations: [],
  };

  snap.pressure = classifyPressure(snap);
  snap.health = classifyHealth(snap);
  snap.recommendations = generateRecommendations(snap);

  previousSnapshot = snap;
  snapshotCount++;

  return snap;
}

/** Get a lightweight status summary for logging/API. */
export function getResourceStatus(): {
  pressure: ResourcePressure;
  health: ResourceHealth;
  heapMB: number;
  rssMB: number;
  freeMemMB: number;
  uptime: number;
  dataDirMB: number;
  recommendations: string[];
} {
  const snap = takeSnapshot();
  return {
    pressure: snap.pressure,
    health: snap.health,
    heapMB: snap.memory.heapUsedMB,
    rssMB: snap.memory.rssMB,
    freeMemMB: snap.system.freeMemMB,
    uptime: snap.process.uptimeSeconds,
    dataDirMB: Math.round(snap.disk.dataDirSizeKB / 1024),
    recommendations: snap.recommendations,
  };
}

/** Cleanup stale temp files in data/. Safe, bounded, non-destructive. */
export function cleanupTempFiles(): { removed: number; freedKB: number } {
  const dataDir = path.join(process.cwd(), "data");
  let removed = 0;
  let freedKB = 0;
  const now = Date.now();
  const ONE_HOUR = 60 * 60 * 1000;
  try {
    const entries = fs.readdirSync(dataDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      // Only clean .tmp files (write atomicity leftovers) and .bak files older than 1 hour
      if (entry.name.endsWith(".tmp") || entry.name.endsWith(".bak")) {
        const fullPath = path.join(dataDir, entry.name);
        try {
          const stat = fs.statSync(fullPath);
          if (now - stat.mtimeMs > ONE_HOUR) {
            const kb = Math.round(stat.size / 1024);
            fs.unlinkSync(fullPath);
            removed++;
            freedKB += kb;
          }
        } catch { /* skip */ }
      }
    }
  } catch { /* data dir not readable */ }
  if (removed > 0) {
    logger.info(`🧹 Resource cleanup: removed ${removed} temp files, freed ${freedKB}KB`);
  }
  return { removed, freedKB };
}

/** Get growth rate between two snapshots. */
export function getGrowthRate(): {
  heapGrowthMBPerHour: number;
  rssGrowthMBPerHour: number;
} {
  if (!previousSnapshot || snapshotCount < 2) {
    return { heapGrowthMBPerHour: 0, rssGrowthMBPerHour: 0 };
  }
  const elapsed = (Date.now() - previousSnapshot.timestamp) / 1000 / 3600;
  if (elapsed <= 0) return { heapGrowthMBPerHour: 0, rssGrowthMBPerHour: 0 };
  const current = takeSnapshot();
  return {
    heapGrowthMBPerHour: (current.memory.heapUsedMB - previousSnapshot.memory.heapUsedMB) / elapsed,
    rssGrowthMBPerHour: (current.memory.rssMB - previousSnapshot.memory.rssMB) / elapsed,
  };
}
