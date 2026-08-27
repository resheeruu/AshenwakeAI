import { config } from "./config/env";
import { recordLog } from "./log-stream";
import { redactLogMessage } from "./security/redact";

const levels = {
  silent: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
} as const;

type LogLevel = keyof typeof levels;

const currentLevel: LogLevel =
  (config.logLevel.toLowerCase() as LogLevel) in levels
    ? (config.logLevel.toLowerCase() as LogLevel)
    : "info";

function enabled(level: LogLevel): boolean {
  return levels[currentLevel] >= levels[level];
}

export const logger = {
  error(...args: unknown[]) {
    const safe = redactLogMessage(...args);
    recordLog("error", ...safe);

    if (enabled("error")) {
      console.error(...safe);
    }
  },

  warn(...args: unknown[]) {
    const safe = redactLogMessage(...args);
    recordLog("warn", ...safe);

    if (enabled("warn")) {
      console.warn(...safe);
    }
  },

  info(...args: unknown[]) {
    const safe = redactLogMessage(...args);
    recordLog("info", ...safe);

    if (enabled("info")) {
      console.log(...safe);
    }
  },

  debug(...args: unknown[]) {
    const safe = redactLogMessage(...args);
    recordLog("debug", ...safe);

    if (enabled("debug")) {
      console.log(...safe);
    }
  },
};
