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
var register_exports = {};
__export(register_exports, {
  syncCommands: () => syncCommands
});
module.exports = __toCommonJS(register_exports);
var import_discord = require("discord.js");
var import_env = require("../config/env");
var import_logger = require("../logger");
async function syncCommands(commands) {
  const rest = new import_discord.REST({
    version: "10"
  }).setToken(
    import_env.config.discord.token
  );
  const commandData = commands.map(
    (command) => command.toJSON()
  );
  import_logger.logger.info(
    `Synchronizing ${commandData.length} global slash commands...`
  );
  try {
    await rest.put(
      import_discord.Routes.applicationCommands(
        import_env.config.discord.clientId
      ),
      {
        body: commandData
      }
    );
    import_logger.logger.info(
      `Global commands synchronized: ${commandData.length}`
    );
  } catch (error) {
    import_logger.logger.error("Failed to synchronize global commands:", error instanceof Error ? error.message : String(error));
    import_logger.logger.warn("Bot will continue with existing commands.");
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  syncCommands
});
