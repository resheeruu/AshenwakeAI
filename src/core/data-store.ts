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
  } catch {
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
    logger.warn(`⚠️ Could not write ${filename}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function dataPath(filename: string): string {
  return path.join(DATA_DIR, filename);
}
