import { config } from "./config/env";
import { recordLog } from "./log-stream";

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
    recordLog("error", ...args);

    if (enabled("error")) {
      console.error(...args);
    }
  },

  warn(...args: unknown[]) {
    recordLog("warn", ...args);

    if (enabled("warn")) {
      console.warn(...args);
    }
  },

  info(...args: unknown[]) {
    recordLog("info", ...args);

    if (enabled("info")) {
      console.log(...args);
    }
  },

  debug(...args: unknown[]) {
    recordLog("debug", ...args);

    if (enabled("debug")) {
      console.log(...args);
    }
  },
};
