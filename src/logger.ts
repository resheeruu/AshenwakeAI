import pino from "pino";
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

const pinoLogger = pino({
  level: currentLevel === "silent" ? "silent" : currentLevel,
  formatters: {
    level(label: string) {
      return { level: label };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  browser: {
    write: (obj: unknown) => {
      const o = obj as Record<string, unknown>;
      const level = (o.level as string) || "info";
      const msg = o.msg || "";
      const safe = redactLogMessage(msg, o);
      recordLog(level as any, ...safe);

      if (enabled(level as LogLevel)) {
        const fn = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
        fn(`[${level.toUpperCase()}] ${msg}`);
      }
    },
  },
});

export const logger = {
  error(...args: unknown[]) {
    const safe = redactLogMessage(...args);
    recordLog("error", ...safe);

    if (enabled("error")) {
      pinoLogger.error(args[0] instanceof Error ? args[0] : { msg: String(args[0]) }, ...args.slice(1).map(String));
    }
  },

  warn(...args: unknown[]) {
    const safe = redactLogMessage(...args);
    recordLog("warn", ...safe);

    if (enabled("warn")) {
      pinoLogger.warn(args[0] instanceof Error ? args[0] : { msg: String(args[0]) }, ...args.slice(1).map(String));
    }
  },

  info(...args: unknown[]) {
    const safe = redactLogMessage(...args);
    recordLog("info", ...safe);

    if (enabled("info")) {
      pinoLogger.info(args[0] instanceof Error ? args[0] : { msg: String(args[0]) }, ...args.slice(1).map(String));
    }
  },

  debug(...args: unknown[]) {
    const safe = redactLogMessage(...args);
    recordLog("debug", ...safe);

    if (enabled("debug")) {
      pinoLogger.debug(args[0] instanceof Error ? args[0] : { msg: String(args[0]) }, ...args.slice(1).map(String));
    }
  },
};
