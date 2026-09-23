"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var logger_exports = {};
__export(logger_exports, {
  logger: () => logger,
  prettyLog: () => prettyLog
});
module.exports = __toCommonJS(logger_exports);
var import_pino = __toESM(require("pino"));
var import_env = require("./config/env");
var import_log_stream = require("./log-stream");
var import_redact = require("./security/redact");
const levels = {
  silent: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4
};
const currentLevel = import_env.config.logLevel.toLowerCase() in levels ? import_env.config.logLevel.toLowerCase() : "info";
function enabled(level) {
  return levels[currentLevel] >= levels[level];
}
const pinoLogger = (0, import_pino.default)({
  level: currentLevel === "silent" ? "silent" : currentLevel,
  formatters: {
    level(label) {
      return { level: label };
    }
  },
  timestamp: import_pino.default.stdTimeFunctions.isoTime,
  browser: {
    write: (obj) => {
      const o = obj;
      const level = o.level || "info";
      const msg = o.msg || "";
      const safe = (0, import_redact.redactLogMessage)(msg, o);
      (0, import_log_stream.recordLog)(level, ...safe);
      if (enabled(level)) {
        const fn = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
        fn(`[${level.toUpperCase()}] ${msg}`);
      }
    }
  }
});
const logger = {
  error(...args) {
    const safe = (0, import_redact.redactLogMessage)(...args);
    (0, import_log_stream.recordLog)("error", ...safe);
    if (enabled("error")) {
      pinoLogger.error(args[0] instanceof Error ? args[0] : { msg: String(args[0]) }, ...args.slice(1).map(String));
    }
  },
  warn(...args) {
    const safe = (0, import_redact.redactLogMessage)(...args);
    (0, import_log_stream.recordLog)("warn", ...safe);
    if (enabled("warn")) {
      pinoLogger.warn(args[0] instanceof Error ? args[0] : { msg: String(args[0]) }, ...args.slice(1).map(String));
    }
  },
  info(...args) {
    const safe = (0, import_redact.redactLogMessage)(...args);
    (0, import_log_stream.recordLog)("info", ...safe);
    if (enabled("info")) {
      pinoLogger.info(args[0] instanceof Error ? args[0] : { msg: String(args[0]) }, ...args.slice(1).map(String));
    }
  },
  debug(...args) {
    const safe = (0, import_redact.redactLogMessage)(...args);
    (0, import_log_stream.recordLog)("debug", ...safe);
    if (enabled("debug")) {
      pinoLogger.debug(args[0] instanceof Error ? args[0] : { msg: String(args[0]) }, ...args.slice(1).map(String));
    }
  }
};
function prettyLog(obj) {
  try {
    const pretty = require("pino-pretty");
    return pretty.default({ colorize: false, translateTime: "SYS:standard" })(obj);
  } catch {
    return JSON.stringify(obj, null, 2);
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  logger,
  prettyLog
});
