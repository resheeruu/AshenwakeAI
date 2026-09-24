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
var resource_profile_exports = {};
__export(resource_profile_exports, {
  buildResourceProfile: () => buildResourceProfile,
  detectHostProvider: () => detectHostProvider
});
module.exports = __toCommonJS(resource_profile_exports);
var import_node_os = __toESM(require("node:os"));
var import_node_fs = __toESM(require("node:fs"));
var import_node_path = __toESM(require("node:path"));
function detectHostProvider() {
  if (process.env.RENDER) return "render";
  if (process.env.RAILWAY_ENVIRONMENT) return "railway";
  if (process.env.FLY_APP_NAME) return "fly.io";
  if (process.env.KOYEB_APP_NAME) return "koyeb";
  if (process.env.HEROKU_APP_NAME) return "heroku";
  if (process.env.REPL_ID) return "replit";
  if (process.env.KUBERNETES_SERVICE_HOST || import_node_fs.default.existsSync("/.dockerenv")) return "docker/container";
  if (process.env.TERMUX_VERSION) return "termux";
  if (process.env.SSH_CLIENT || process.env.SSH_TTY) return "generic-vps";
  return "local";
}
function buildResourceProfile() {
  const host = detectHostProvider();
  const mem = process.memoryUsage();
  const totalMemMB = Math.round(import_node_os.default.totalmem() / 1024 / 1024);
  const freeMemMB = Math.round(import_node_os.default.freemem() / 1024 / 1024);
  const rssMB = Math.round(mem.rss / 1024 / 1024);
  const heapMB = Math.round(mem.heapUsed / 1024 / 1024);
  let totalGB = 0, freeGB = 0, usedPct = 0;
  try {
    const { statfsSync } = import_node_fs.default;
    if (typeof statfsSync === "function") {
      const stats = statfsSync(process.cwd());
      const bsize = stats.bsize || stats.blksize || 4096;
      totalGB = Math.round(stats.blocks * bsize / 1024 / 1024 / 1024);
      freeGB = Math.round(stats.bavail * bsize / 1024 / 1024 / 1024);
      usedPct = totalGB > 0 ? Math.round((totalGB - freeGB) / totalGB * 100) : 0;
    }
  } catch {
  }
  let dataDirMB = 0;
  try {
    const dataDir = import_node_path.default.join(process.cwd(), "data");
    const entries = import_node_fs.default.readdirSync(dataDir);
    for (const entry of entries) {
      try {
        const stat = import_node_fs.default.statSync(import_node_path.default.join(dataDir, entry));
        if (stat.isFile()) dataDirMB += stat.size;
      } catch {
      }
    }
    dataDirMB = Math.round(dataDirMB / 1024 / 1024);
  } catch {
  }
  const capabilities = ["node.js", "npm"];
  if (import_node_fs.default.existsSync("node_modules/typescript")) capabilities.push("typescript/build");
  const classification = classifyHost(totalMemMB, freeMemMB, rssMB, heapMB, usedPct, import_node_os.default.loadavg());
  const recommendations = generateProfileRecommendations(classification, totalMemMB, freeMemMB, rssMB, heapMB, usedPct, dataDirMB, import_node_os.default.loadavg());
  return {
    host,
    classification,
    memory: { totalMB: totalMemMB, freeMB: freeMemMB, availableMB: freeMemMB, nodeRSS_MB: rssMB, nodeHeap_MB: heapMB },
    cpu: { cores: import_node_os.default.cpus().length || 1, arch: import_node_os.default.arch(), loadAvg: import_node_os.default.loadavg() },
    disk: {
      totalGB,
      freeGB,
      usedPct,
      dataDirMB,
      quotaVerified: false,
      quotaNote: "Actual Wispbyte storage quota could not be verified from inside the container. Disk values are container-visible filesystem capacity, NOT hosting account quota."
    },
    runtime: { nodeVersion: process.version, platform: import_node_os.default.platform(), uptime: Math.round(process.uptime()) },
    capabilities,
    recommendations
  };
}
function classifyHost(totalMemMB, freeMemMB, rssMB, heapMB, diskUsedPct, loadAvg) {
  const cores = import_node_os.default.cpus().length || 1;
  const normalizedLoad = loadAvg[0] / cores;
  if (diskUsedPct > 95 || freeMemMB < 100 || heapMB > 512 || normalizedLoad > 3) return "critical";
  if (diskUsedPct > 90 || freeMemMB < 300 || heapMB > 256 || normalizedLoad > 2) return "degraded";
  if (diskUsedPct > 80 || freeMemMB < 500 || totalMemMB < 1024 || normalizedLoad > 1.5) return "constrained";
  if (totalMemMB > 0) return "healthy";
  return "unknown";
}
function generateProfileRecommendations(classification, totalMemMB, freeMemMB, rssMB, heapMB, diskUsedPct, dataDirMB, loadAvg) {
  const cores = import_node_os.default.cpus().length || 1;
  const normalizedLoad = loadAvg[0] / cores;
  const recs = [];
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
    recs.push(`Total memory ${totalMemMB}MB. This is a constrained host \u2014 limit concurrent operations.`);
  }
  if (recs.length === 0) {
    recs.push("Host operating within normal parameters. No optimizations needed.");
  }
  return recs;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  buildResourceProfile,
  detectHostProvider
});
