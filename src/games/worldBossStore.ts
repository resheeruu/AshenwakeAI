import fs from "fs";
import path from "path";
import {
  WorldBossState,
  createWorldBoss,
  getWorldBoss,
  isWorldBossActive,
} from "./worldBosses";

const DATA_DIR = path.join(process.cwd(), "data");
const FILE = path.join(DATA_DIR, "world-boss.json");

async function ensureStore(): Promise<void> {
  await fs.promises.mkdir(DATA_DIR, { recursive: true });

  if (!fs.existsSync(FILE)) {
    await fs.promises.writeFile(FILE, "null", "utf8");
  }
}

export async function loadWorldBoss(): Promise<WorldBossState | null> {
  await ensureStore();

  try {
    const raw = await fs.promises.readFile(FILE, "utf8");
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

  const temporary = `${FILE}.tmp`;

  await fs.promises.writeFile(
    temporary,
    JSON.stringify(state, null, 2),
    "utf8",
  );

  await fs.promises.rename(temporary, FILE);
}

export async function clearWorldBoss(): Promise<void> {
  await ensureStore();

  await fs.promises.writeFile(
    FILE,
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
