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
var engine_exports = {};
__export(engine_exports, {
  cleanupSessions: () => cleanupSessions,
  createSession: () => createSession,
  deleteSession: () => deleteSession,
  getSession: () => getSession,
  updateSession: () => updateSession
});
module.exports = __toCommonJS(engine_exports);
var import_crypto = __toESM(require("crypto"));
const sessions = /* @__PURE__ */ new Map();
const SESSION_TIME = 10 * 60 * 1e3;
function createSession(game, playerIds, state = {}) {
  const now = Date.now();
  const session = {
    id: import_crypto.default.randomUUID(),
    game,
    playerIds,
    createdAt: now,
    expiresAt: now + SESSION_TIME,
    state
  };
  sessions.set(session.id, session);
  return session;
}
function getSession(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) {
    return void 0;
  }
  if (Date.now() > session.expiresAt) {
    sessions.delete(sessionId);
    return void 0;
  }
  return session;
}
function updateSession(session) {
  sessions.set(session.id, session);
}
function deleteSession(sessionId) {
  sessions.delete(sessionId);
}
function cleanupSessions() {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now > session.expiresAt) {
      sessions.delete(id);
    }
  }
}
setInterval(cleanupSessions, 6e4).unref();
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  cleanupSessions,
  createSession,
  deleteSession,
  getSession,
  updateSession
});
