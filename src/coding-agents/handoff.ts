import fs from "node:fs";
import path from "node:path";
import { AgentHandoff } from "./types";

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "data");
const HANDOFF_FILE = path.join(DATA_DIR, "coding-agent-handoffs.json");

async function ensureStore(): Promise<void> {
  await fs.promises.mkdir(DATA_DIR, { recursive: true });

  if (!fs.existsSync(HANDOFF_FILE)) {
    await fs.promises.writeFile(
      HANDOFF_FILE,
      "[]",
      "utf8",
    );
  }
}

export async function loadHandoffs(): Promise<AgentHandoff[]> {
  await ensureStore();

  try {
    const raw = await fs.promises.readFile(
      HANDOFF_FILE,
      "utf8",
    );

    const parsed = JSON.parse(raw);

    return Array.isArray(parsed)
      ? parsed
      : [];
  } catch {
    return [];
  }
}

export async function saveHandoffs(
  handoffs: AgentHandoff[],
): Promise<void> {
  await ensureStore();

  const temporary = `${HANDOFF_FILE}.tmp`;

  await fs.promises.writeFile(
    temporary,
    JSON.stringify(handoffs, null, 2),
    "utf8",
  );

  await fs.promises.rename(
    temporary,
    HANDOFF_FILE,
  );
}

export async function recordHandoff(
  handoff: AgentHandoff,
): Promise<void> {
  const handoffs = await loadHandoffs();

  handoffs.push(handoff);

  await saveHandoffs(handoffs);
}

export async function getHandoffsForTask(
  taskId: string,
): Promise<AgentHandoff[]> {
  const handoffs = await loadHandoffs();

  return handoffs.filter(
    handoff => handoff.taskId === taskId,
  );
}

export async function getLatestHandoff(
  taskId: string,
): Promise<AgentHandoff | undefined> {
  const handoffs = await getHandoffsForTask(taskId);

  return handoffs.length > 0
    ? handoffs[handoffs.length - 1]
    : undefined;
}
