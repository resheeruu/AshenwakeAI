import { config } from "./config/env";

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
    if (enabled("error")) console.error(...args);
  },

  warn(...args: unknown[]) {
    if (enabled("warn")) console.warn(...args);
  },

  info(...args: unknown[]) {
    if (enabled("info")) console.log(...args);
  },

  debug(...args: unknown[]) {
    if (enabled("debug")) console.log(...args);
  },
};
