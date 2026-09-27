import fs from "fs";
import path from "path";
import {
  WorldBossState,
  createWorldBoss,
  getWorldBoss,
  isWorldBossActive,
} from "./worldBosses";
import { getDataDir, getDataPath, getWorldBossPath } from "../config/data-dir";

async function ensureStore(): Promise<void> {
  await fs.promises.mkdir(getDataDir(), { recursive: true });

  if (!fs.existsSync(getWorldBossPath())) {
    await fs.promises.writeFile(getWorldBossPath(), "null", "utf8");
  }
}

export async function loadWorldBoss(): Promise<WorldBossState | null> {
  await ensureStore();

  try {
    const raw = await fs.promises.readFile(getWorldBossPath(), "utf8");
    const parsed = JSON.parse(raw);

    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    return parsed as WorldBossState;
  } catch {
    return null;
  }
}

export async function saveWorldBoss(
  state: WorldBossState,
): Promise<void> {
  await ensureStore();

  const temporary = `${getWorldBossPath()}.tmp`;

  await fs.promises.writeFile(
    temporary,
    JSON.stringify(state, null, 2),
    "utf8",
  );

  await fs.promises.rename(temporary, getWorldBossPath());
}

export async function clearWorldBoss(): Promise<void> {
  await ensureStore();

  await fs.promises.writeFile(
    getWorldBossPath(),
    "null",
    "utf8",
  );
}

export async function getActiveWorldBoss(
  now = Date.now(),
): Promise<WorldBossState | null> {
  const state = await loadWorldBoss();

  if (!state) {
    return null;
  }

  if (!isWorldBossActive(state, now)) {
    await saveWorldBoss(state);
    return null;
  }

  return state;
}

export async function spawnWorldBoss(
  bossId: string,
  now = Date.now(),
): Promise<WorldBossState> {
  const existing = await getActiveWorldBoss(now);

  if (existing) {
    throw new Error("WORLD_BOSS_ALREADY_ACTIVE");
  }

  if (!getWorldBoss(bossId)) {
    throw new Error("INVALID_WORLD_BOSS");
  }

  const state = createWorldBoss(bossId, now);

  await saveWorldBoss(state);

  return state;
}
