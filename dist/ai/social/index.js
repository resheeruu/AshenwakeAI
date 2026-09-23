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
var social_exports = {};
__export(social_exports, {
  SocialCooldown: () => import_cooldown.SocialCooldown,
  buildSocialContext: () => import_decision.buildSocialContext,
  getSocialCooldown: () => import_cooldown.getSocialCooldown,
  handleSocialMessage: () => import_listener.handleSocialMessage,
  makeSocialDecision: () => import_decision.makeSocialDecision,
  startSocialCleanup: () => import_listener.startSocialCleanup,
  stopSocialCleanup: () => import_listener.stopSocialCleanup
});
module.exports = __toCommonJS(social_exports);
var import_listener = require("./listener");
var import_decision = require("./decision");
var import_cooldown = require("./cooldown");
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  SocialCooldown,
  buildSocialContext,
  getSocialCooldown,
  handleSocialMessage,
  makeSocialDecision,
  startSocialCleanup,
  stopSocialCleanup
});
