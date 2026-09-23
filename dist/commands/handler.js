"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
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
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var handler_exports = {};
__export(handler_exports, {
  CommandHandler: () => CommandHandler
});
module.exports = __toCommonJS(handler_exports);
var import_logger = require("../logger");
const ACTIVITY_INTERVAL_MS = 5 * 60 * 1e3;
class CommandHandler {
  commands = /* @__PURE__ */ new Map();
  activity = /* @__PURE__ */ new Map();
  usageStats;
  activityTimer;
  constructor(commands = [], usageStats) {
    this.usageStats = usageStats;
    this.registerMany(commands);
    this.activityTimer = setInterval(
      () => this.flushActivity(),
      ACTIVITY_INTERVAL_MS
    );
    this.activityTimer.unref();
  }
  register(command) {
    this.commands.set(command.data.name, command);
  }
  registerMany(commands) {
    for (const command of commands) {
      this.register(command);
    }
  }
  async handle(interaction) {
    const commandName = interaction.commandName;
    const command = this.commands.get(commandName);
    if (!command) {
      throw new Error(
        `Command not found: /${commandName}`
      );
    }
    if (!interaction.deferred && !interaction.replied) {
      throw new Error(
        `/${commandName} reached CommandHandler without being acknowledged.`
      );
    }
    this.activity.set(
      commandName,
      (this.activity.get(commandName) ?? 0) + 1
    );
    this.usageStats.recordCommand(
      interaction.user.id,
      commandName
    );
    try {
      await command.execute(interaction);
    } catch (error) {
      this.usageStats.recordFailure(
        interaction.user.id,
        "command"
      );
      import_logger.logger.error(
        `\u274C /${commandName} failed:`,
        error instanceof Error ? error.message : String(error)
      );
      throw error;
    }
  }
  flushActivity() {
    if (this.activity.size === 0) {
      return;
    }
    const summary = [...this.activity.entries()].sort((a, b) => b[1] - a[1]).map(
      ([command, count]) => `/${command}=${count}`
    ).join(" | ");
    import_logger.logger.info(
      `\u{1F4CA} Command activity (last 5m) | ${summary}`
    );
    this.activity.clear();
  }
  getCommands() {
    return this.commands;
  }
  getActivity() {
    return new Map(this.activity);
  }
  destroy() {
    clearInterval(this.activityTimer);
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  CommandHandler
});
