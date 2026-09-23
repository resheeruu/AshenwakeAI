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
var admin_exports = {};
__export(admin_exports, {
  createSecurityManager: () => createSecurityManager
});
module.exports = __toCommonJS(admin_exports);
function createSecurityManager(limiter, adminIds) {
  const admins = new Set(
    adminIds.map((id) => id.trim()).filter(Boolean)
  );
  return {
    isAdmin(userId) {
      return admins.has(userId);
    },
    getRateLimitStatus() {
      return {
        usersTracked: limiter.getUserCount(),
        config: limiter.getConfig()
      };
    },
    resetUser(userId) {
      if (!admins.size) {
        return false;
      }
      limiter.reset(userId);
      return true;
    }
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  createSecurityManager
});
