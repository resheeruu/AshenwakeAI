export type LogLevel = "error" | "warn" | "info" | "debug";

export interface LogEntry {
  id: number;
  timestamp: string;
  level: LogLevel;
  message: string;
}

const MAX_LOGS = 500;

let nextId = 1;
const logs: LogEntry[] = [];

type Listener = (entry: LogEntry) => void;

const listeners = new Set<Listener>();

function normalizeArgs(args: unknown[]): string {
  return args
    .map((value) => {
      if (value instanceof Error) {
        return value.stack || value.message;
      }

      if (typeof value === "string") {
        return value;
      }

      try {
        return JSON.stringify(value);
      } catch {
        return String(value);
      }
    })
    .join(" ");
}

export function recordLog(
  level: LogLevel,
  ...args: unknown[]
): LogEntry {
  const entry: LogEntry = {
    id: nextId++,
    timestamp: new Date().toISOString(),
    level,
    message: normalizeArgs(args),
  };

  logs.push(entry);

  if (logs.length > MAX_LOGS) {
    logs.shift();
  }

  for (const listener of listeners) {
    try {
      listener(entry);
    } catch {
      // Never allow a log listener to crash AshenAI.
    }
  }

  return entry;
}

export function getRecentLogs(limit = 100): LogEntry[] {
  const safeLimit = Math.max(1, Math.min(limit, MAX_LOGS));

  return logs.slice(-safeLimit);
}

export function subscribeLogs(listener: Listener): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}
