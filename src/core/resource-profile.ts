import os from "node:os";
import fs from "node:fs";
import path from "node:path";

// ============================================================
// U19: Resource Profile — hosting-aware resource classification
// Standalone module — does not import from scripts/ to stay within rootDir.
// ============================================================

export type HostClassification = "healthy" | "constrained" | "degraded" | "critical" | "unknown";

export interface ResourceProfile {
  host: string;
  classification: HostClassification;
  memory: {
    totalMB: number;
    freeMB: number;
    availableMB: number;
    nodeRSS_MB: number;
    nodeHeap_MB: number;
  };
  cpu: {
    cores: number;
    arch: string;
    loadAvg: number[];
  };
  disk: {
    totalGB: number;
    freeGB: number;
    usedPct: number;
    dataDirMB: number;
  };
  runtime: {
    nodeVersion: string;
    platform: string;
    uptime: number;
  };
  capabilities: string[];
  recommendations: string[];
}

/** Detect hosting provider from environment (inline, no scripts/ import). */
function detectHostProvider(): string {
  if (process.env.RENDER) return "render";
  if (process.env.RAILWAY_ENVIRONMENT) return "railway";
  if (process.env.FLY_APP_NAME) return "fly.io";
  if (process.env.KOYEB_APP_NAME) return "koyeb";
  if (process.env.HEROKU_APP_NAME) return "heroku";
  if (process.env.REPL_ID) return "replit";
  if (process.env.KUBERNETES_SERVICE_HOST || fs.existsSync("/.dockerenv")) return "docker/container";
  if (process.env.TERMUX_VERSION) return "termux";
  if (process.env.SSH_CLIENT || process.env.SSH_TTY) return "generic-vps";
  return "local";
}

/** Build a complete resource profile. */
export function buildResourceProfile(): ResourceProfile {
  const host = detectHostProvider();
  const mem = process.memoryUsage();

  const totalMemMB = Math.round(os.totalmem() / 1024 / 1024);
  const freeMemMB = Math.round(os.freemem() / 1024 / 1024);
  const rssMB = Math.round(mem.rss / 1024 / 1024);
  const heapMB = Math.round(mem.heapUsed / 1024 / 1024);

  // Disk usage
  let totalGB = 0, freeGB = 0, usedPct = 0;
  try {
    const { statfsSync } = fs as any;
    if (typeof statfsSync === "function") {
      const stats = statfsSync(process.cwd());
      const bsize = stats.bsize || stats.blksize || 4096;
      totalGB = Math.round((stats.blocks * bsize) / 1024 / 1024 / 1024);
      freeGB = Math.round((stats.bavail * bsize) / 1024 / 1024 / 1024);
      usedPct = totalGB > 0 ? Math.round(((totalGB - freeGB) / totalGB) * 100) : 0;
    }
  } catch { /* statfs not available */ }

  // Data directory size
  let dataDirMB = 0;
  try {
    const dataDir = path.join(process.cwd(), "data");
    const entries = fs.readdirSync(dataDir);
    for (const entry of entries) {
      try {
        const stat = fs.statSync(path.join(dataDir, entry));
        if (stat.isFile()) dataDirMB += stat.size;
      } catch { /* skip */ }
    }
    dataDirMB = Math.round(dataDirMB / 1024 / 1024);
  } catch { /* data dir not accessible */ }

  // Capabilities from env
  const capabilities: string[] = ["node.js", "npm"];
  if (fs.existsSync("node_modules/typescript")) capabilities.push("typescript/build");

  // Classification
  const classification = classifyHost(totalMemMB, freeMemMB, rssMB, heapMB, usedPct);

  // Recommendations
  const recommendations = generateProfileRecommendations(classification, totalMemMB, freeMemMB, rssMB, heapMB, usedPct, dataDirMB);

  return {
    host,
    classification,
    memory: { totalMB: totalMemMB, freeMB: freeMemMB, availableMB: freeMemMB, nodeRSS_MB: rssMB, nodeHeap_MB: heapMB },
    cpu: { cores: os.cpus().length || 1, arch: os.arch(), loadAvg: os.loadavg() },
    disk: { totalGB, freeGB, usedPct, dataDirMB },
    runtime: { nodeVersion: process.version, platform: os.platform(), uptime: Math.round(process.uptime()) },
    capabilities,
    recommendations,
  };
}

function classifyHost(totalMemMB: number, freeMemMB: number, rssMB: number, heapMB: number, diskUsedPct: number): HostClassification {
  // Critical: severe resource pressure
  if (diskUsedPct > 95 || freeMemMB < 100 || heapMB > 512) return "critical";
  // Degraded: significant constraints
  if (diskUsedPct > 90 || freeMemMB < 300 || heapMB > 256) return "degraded";
  // Constrained: moderate pressure
  if (diskUsedPct > 80 || freeMemMB < 500 || totalMemMB < 1024) return "constrained";
  // Healthy: normal operation
  if (totalMemMB > 0) return "healthy";
  return "unknown";
}

function generateProfileRecommendations(
  classification: HostClassification,
  totalMemMB: number, freeMemMB: number,
  rssMB: number, heapMB: number,
  diskUsedPct: number, dataDirMB: number,
): string[] {
  const recs: string[] = [];
  if (classification === "critical") {
    recs.push("Host is in CRITICAL state. Protect core Discord/Web/AI. Stop nonessential work.");
  }
  if (classification === "degraded") {
    recs.push("Host is DEGRADED. Reduce optional background activity.");
  }
  if (diskUsedPct > 90) {
    recs.push(`Disk usage ${diskUsedPct}%. Rotate/clean logs and temp files.`);
  } else if (diskUsedPct > 80) {
    recs.push(`Disk usage ${diskUsedPct}%. Monitor growth.`);
  }
  if (freeMemMB < 300 && totalMemMB > 0) {
    recs.push(`Free memory ${freeMemMB}MB of ${totalMemMB}MB. Reduce cache sizes.`);
  }
  if (heapMB > 256) {
    recs.push(`Node.js heap ${heapMB}MB. Check for memory leaks.`);
  }
  if (dataDirMB > 50) {
    recs.push(`Data directory ${dataDirMB}MB. Consider log rotation.`);
  }
  if (totalMemMB < 1024) {
    recs.push(`Total memory ${totalMemMB}MB. This is a constrained host — limit concurrent operations.`);
  }
  if (recs.length === 0) {
    recs.push("Host operating within normal parameters. No optimizations needed.");
  }
  return recs;
}
