import fs from "fs";
import path from "path";
import { getDataDir, getDataPath, ensureDataDir } from "../config/data-dir";
import { logger } from "../logger";

export function readJSON<T>(filename: string, fallback: T): T {
  const filePath = getDataPath(filename);
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch (error) {
    // Quarantine unreadable content so a later write cannot destroy it.
    try {
      const quarantine = `${filePath}.corrupt-${Date.now()}`;
      fs.renameSync(filePath, quarantine);
      logger.error(
        `⚠️ ${filename} is unreadable — moved to ${path.basename(quarantine)}, using fallback`
      );
    } catch {
      logger.error(
        `⚠️ Could not read ${filename}, using fallback: ${error instanceof Error ? error.message : String(error)}`
      );
    }
    return fallback;
  }
}

export function writeJSON<T>(filename: string, data: T): void {
  const filePath = getDataPath(filename);
  const tmp = `${filePath}.tmp-${process.pid}`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
    fs.renameSync(tmp, filePath);
  } catch (error) {
    try { fs.rmSync(tmp, { force: true }); } catch {}
    throw error;
  }
}

export function dataPath(filename: string): string {
  return getDataPath(filename);
}
