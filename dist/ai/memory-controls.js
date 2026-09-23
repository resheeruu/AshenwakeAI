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
var memory_controls_exports = {};
__export(memory_controls_exports, {
  createMemoryControls: () => createMemoryControls
});
module.exports = __toCommonJS(memory_controls_exports);
var import_logger = require("../logger");
function createMemoryControls(memory, knowledge) {
  const disabled = /* @__PURE__ */ new Map();
  function key(userId, guildId) {
    return `${guildId}:${userId}`;
  }
  return {
    disableMemory(userId, guildId) {
      disabled.set(key(userId, guildId), true);
      memory.resetAllForUser(userId);
      import_logger.logger.debug(`\u{1F507} Memory disabled for user ${userId} in guild ${guildId}`);
    },
    enableMemory(userId, guildId) {
      disabled.delete(key(userId, guildId));
      import_logger.logger.debug(`\u{1F50A} Memory enabled for user ${userId} in guild ${guildId}`);
    },
    isMemoryDisabled(userId, guildId) {
      return disabled.get(key(userId, guildId)) === true;
    },
    deleteUserData(userId, guildId) {
      memory.resetAllForUser(userId);
      import_logger.logger.debug(`\u{1F5D1}\uFE0F Deleted memory data for user ${userId} in guild ${guildId}`);
    },
    getRetentionInfo(guildId) {
      return { maxMessages: 20, idleMinutes: 30 };
    }
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  createMemoryControls
});
