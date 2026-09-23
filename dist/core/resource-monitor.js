"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var resource_monitor_exports = {};
__export(resource_monitor_exports, {
  cleanupTempFiles: () => cleanupTempFiles,
  getGrowthRate: () => getGrowthRate,
  getResourceStatus: () => getResourceStatus,
  takeSnapshot: () => takeSnapshot
});
module.exports = __toCommonJS(resource_monitor_exports);
var import_node_os = __toESM(require("node:os"));
var import_node_fs = __toESM(require("node:fs"));
var import_node_path = __toESM(require("node:path"));
var import_logger = require("../logger");
const HEAP_WARNING_MB = 256;
const HEAP_CRITICAL_MB = 512;
const RSS_WARNING_MB = 512;
const RSS_CRITICAL_MB = 1024;
const FREE_MEM_WARNING_PCT = 0.15;
const FREE_MEM_CRITICAL_PCT = 0.05;
const DATA_DIR_WARNING_MB = 50;
const DATA_DIR_CRITICAL_MB = 200;
let previousSnapshot = null;
let snapshotCount = 0;
function measureDiskUsage(dir) {
  let totalKB = 0;
  let fileCount = 0;
  let largestName = "";
  let largestKB = 0;
  try {
    const entries = import_node_fs.default.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = import_node_path.default.join(dir, entry.name);
      if (entry.isFile()) {
        try {
          const stat = import_node_fs.default.statSync(fullPath);
          const kb = Math.round(stat.size / 1024);
          totalKB += kb;
          fileCount++;
          if (kb > largestKB) {
            largestKB = kb;
            largestName = entry.name;
          }
        } catch {
        }
      } else if (entry.isDirectory() && entry.name !== ".git" && entry.name !== "node_modules") {
        const sub = measureDiskUsage(fullPath);
        totalKB += sub.sizeKB;
        fileCount += sub.fileCount;
        if (sub.largestKB > largestKB) {
          largestKB = sub.largestKB;
          largestName = entry.name;
        }
      }
    }
  } catch {
  }
  return { sizeKB: totalKB, fileCount, largest: largestName, largestKB };
}
function classifyPressure(snap) {
  const heapMB = snap.memory.heapUsedMB;
  const rssMB = snap.memory.rssMB;
  const freeMemPct = snap.system.totalMemBytes > 0 ? snap.system.freeMemBytes / snap.system.totalMemBytes : 1;
  const dataMB = snap.disk.dataDirSizeKB / 1024;
  if (heapMB > HEAP_CRITICAL_MB || rssMB > RSS_CRITICAL_MB || freeMemPct < FREE_MEM_CRITICAL_PCT || dataMB > DATA_DIR_CRITICAL_MB) {
    return "CRITICAL";
  }
  const warnings = [
    heapMB > HEAP_WARNING_MB,
    rssMB > RSS_WARNING_MB,
    freeMemPct < FREE_MEM_WARNING_PCT,
    dataMB > DATA_DIR_WARNING_MB
  ].filter(Boolean).length;
  if (warnings >= 2) return "CONSTRAINED";
  if (warnings === 1) return "WARNING";
  return "NORMAL";
}
function classifyHealth(snap) {
  if (snap.pressure === "CRITICAL") return "critical";
  if (snap.pressure === "CONSTRAINED") return "degraded";
  return "healthy";
}
function generateRecommendations(snap) {
  const recs = [];
  if (snap.memory.heapUsedMB > HEAP_WARNING_MB) {
    recs.push(`Heap usage elevated (${snap.memory.heapUsedMB}MB). Consider reducing cache retention.`);
  }
  if (snap.memory.rssMB > RSS_WARNING_MB) {
    recs.push(`RSS elevated (${snap.memory.rssMB}MB). Monitor for growth.`);
  }
  const freeMemPct = snap.system.totalMemBytes > 0 ? snap.system.freeMemBytes / snap.system.totalMemBytes : 1;
  if (freeMemPct < FREE_MEM_WARNING_PCT) {
    recs.push(`System free memory low (${(freeMemPct * 100).toFixed(1)}%). Reduce optional background work.`);
  }
  if (snap.disk.dataDirSizeKB / 1024 > DATA_DIR_WARNING_MB) {
    recs.push(`Data directory large (${(snap.disk.dataDirSizeKB / 1024).toFixed(1)}MB). Consider log rotation.`);
  }
  if (snap.process.activeHandles > 100) {
    recs.push(`Active handles elevated (${snap.process.activeHandles}). Check for timer/listener leaks.`);
  }
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
function takeSnapshot() {
  const mem = process.memoryUsage();
  const cpu = process.cpuUsage();
  const dataDir = import_node_path.default.join(process.cwd(), "data");
  const disk = measureDiskUsage(dataDir);
  const snap = {
    timestamp: Date.now(),
    memory: {
      rss: mem.rss,
      heapUsed: mem.heapUsed,
      heapTotal: mem.heapTotal,
      external: mem.external,
      arrayBuffers: mem.arrayBuffers,
      rssMB: Math.round(mem.rss / 1024 / 1024),
      heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
      heapTotalMB: Math.round(mem.heapTotal / 1024 / 1024)
    },
    cpu: {
      userMicros: cpu.user,
      systemMicros: cpu.system,
      userMs: Math.round(cpu.user / 1e3),
      systemMs: Math.round(cpu.system / 1e3)
    },
    system: {
      totalMemBytes: import_node_os.default.totalmem(),
      freeMemBytes: import_node_os.default.freemem(),
      availableMemBytes: import_node_os.default.freemem(),
      totalMemMB: Math.round(import_node_os.default.totalmem() / 1024 / 1024),
      freeMemMB: Math.round(import_node_os.default.freemem() / 1024 / 1024),
      uptimeSeconds: Math.round(process.uptime()),
      loadAvg: import_node_os.default.loadavg(),
      platform: import_node_os.default.platform(),
      arch: import_node_os.default.arch(),
      nodeVersion: process.version
    },
    process: {
      pid: process.pid,
      activeHandles: typeof process._getActiveHandles === "function" ? process._getActiveHandles().length : 0,
      activeRequests: typeof process._getActiveRequests === "function" ? process._getActiveRequests().length : 0,
      uptimeSeconds: Math.round(process.uptime())
    },
    disk: {
      dataDirSizeKB: disk.sizeKB,
      dataFileCount: disk.fileCount,
      largestFile: disk.largest,
      largestFileSizeKB: disk.largestKB
    },
    pressure: "NORMAL",
    health: "healthy",
    recommendations: []
  };
  snap.pressure = classifyPressure(snap);
  snap.health = classifyHealth(snap);
  snap.recommendations = generateRecommendations(snap);
  previousSnapshot = snap;
  snapshotCount++;
  return snap;
}
function getResourceStatus() {
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
    hostingQuota: "unknown",
    filesystemCapacity: "unknown"
  };
}
function cleanupTempFiles() {
  const dataDir = import_node_path.default.join(process.cwd(), "data");
  let removed = 0;
  let freedKB = 0;
  const now = Date.now();
  const ONE_HOUR = 60 * 60 * 1e3;
  try {
    const entries = import_node_fs.default.readdirSync(dataDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (entry.name.endsWith(".tmp") || entry.name.endsWith(".bak")) {
        const fullPath = import_node_path.default.join(dataDir, entry.name);
        try {
          const stat = import_node_fs.default.statSync(fullPath);
          if (now - stat.mtimeMs > ONE_HOUR) {
            const kb = Math.round(stat.size / 1024);
            import_node_fs.default.unlinkSync(fullPath);
            removed++;
            freedKB += kb;
          }
        } catch {
        }
      }
    }
  } catch {
  }
  if (removed > 0) {
    import_logger.logger.info(`\u{1F9F9} Resource cleanup: removed ${removed} temp files, freed ${freedKB}KB`);
  }
  return { removed, freedKB };
}
function getGrowthRate() {
  if (!previousSnapshot || snapshotCount < 2) {
    return { heapGrowthMBPerHour: 0, rssGrowthMBPerHour: 0 };
  }
  const elapsed = (Date.now() - previousSnapshot.timestamp) / 1e3 / 3600;
  if (elapsed <= 0) return { heapGrowthMBPerHour: 0, rssGrowthMBPerHour: 0 };
  const current = takeSnapshot();
  return {
    heapGrowthMBPerHour: (current.memory.heapUsedMB - previousSnapshot.memory.heapUsedMB) / elapsed,
    rssGrowthMBPerHour: (current.memory.rssMB - previousSnapshot.memory.rssMB) / elapsed
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  cleanupTempFiles,
  getGrowthRate,
  getResourceStatus,
  takeSnapshot
});
