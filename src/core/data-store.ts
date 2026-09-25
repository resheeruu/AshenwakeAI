import fs from "fs";
import path from "path";
import { logger } from "../logger";

const DATA_DIR = path.join(process.cwd(), "data");

export function ensureDataDir(): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export function readJSON<T>(filename: string, fallback: T): T {
  const filePath = path.join(DATA_DIR, filename);
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

export function writeJSON(filename: string, data: unknown): void {
  ensureDataDir();
  const filePath = path.join(DATA_DIR, filename);
  const tmpPath = filePath + ".tmp";
  try {
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), "utf8");
    fs.renameSync(tmpPath, filePath);
  } catch (error) {
    logger.error(
      `⚠️ Could not write ${filename} (data NOT persisted): ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

export function dataPath(filename: string): string {
  return path.join(DATA_DIR, filename);
}
