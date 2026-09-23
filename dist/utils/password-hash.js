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
var password_hash_exports = {};
__export(password_hash_exports, {
  DIGEST: () => DIGEST,
  ITERATIONS: () => ITERATIONS,
  KEY_LENGTH: () => KEY_LENGTH,
  hashPassword: () => hashPassword,
  verifyPassword: () => verifyPassword
});
module.exports = __toCommonJS(password_hash_exports);
var import_node_crypto = __toESM(require("node:crypto"));
const ITERATIONS = 1e5;
const KEY_LENGTH = 64;
const DIGEST = "sha512";
function hashPassword(password, salt) {
  const useSalt = salt || import_node_crypto.default.randomBytes(32).toString("hex");
  const hash = import_node_crypto.default.pbkdf2Sync(password, useSalt, ITERATIONS, KEY_LENGTH, DIGEST).toString("hex");
  return { hash, salt: useSalt };
}
function verifyPassword(password, hash, salt) {
  const { hash: computed } = hashPassword(password, salt);
  const hashBuf = Buffer.from(computed, "hex");
  const expectedBuf = Buffer.from(hash, "hex");
  if (hashBuf.length !== expectedBuf.length) return false;
  return import_node_crypto.default.timingSafeEqual(hashBuf, expectedBuf);
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  DIGEST,
  ITERATIONS,
  KEY_LENGTH,
  hashPassword,
  verifyPassword
});
