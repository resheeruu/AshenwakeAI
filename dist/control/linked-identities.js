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
var linked_identities_exports = {};
__export(linked_identities_exports, {
  findIdentityByProvider: () => findIdentityByProvider,
  getAccountIdentities: () => getAccountIdentities,
  getAccountsForIdentity: () => getAccountsForIdentity,
  hasProviderLinked: () => hasProviderLinked,
  linkIdentity: () => linkIdentity,
  reloadIdentities: () => reloadIdentities,
  unlinkIdentity: () => unlinkIdentity,
  unlinkProviderFromAccount: () => unlinkProviderFromAccount
});
module.exports = __toCommonJS(linked_identities_exports);
var import_crypto = __toESM(require("crypto"));
var import_fs = __toESM(require("fs"));
var import_path = __toESM(require("path"));
var import_logger = require("../logger");
const DATA_DIR = import_path.default.join(process.cwd(), "data");
const IDENTITIES_FILE = import_path.default.join(DATA_DIR, "linked-identities.json");
let identities = [];
function ensureDataDir() {
  import_fs.default.mkdirSync(DATA_DIR, { recursive: true });
}
function loadIdentities() {
  try {
    if (!import_fs.default.existsSync(IDENTITIES_FILE)) {
      identities = [];
      return;
    }
    const raw = import_fs.default.readFileSync(IDENTITIES_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      identities = [];
      return;
    }
    identities = parsed.filter(
      (i) => i && typeof i.id === "string" && typeof i.accountId === "string" && typeof i.provider === "string" && typeof i.providerUserId === "string" && ["discord", "google"].includes(i.provider)
    );
  } catch {
    identities = [];
  }
}
function saveIdentities() {
  try {
    ensureDataDir();
    const tmpPath = IDENTITIES_FILE + ".tmp";
    import_fs.default.writeFileSync(tmpPath, JSON.stringify(identities, null, 2), "utf8");
    import_fs.default.renameSync(tmpPath, IDENTITIES_FILE);
  } catch (error) {
    import_logger.logger.warn(
      `\u26A0\uFE0F Could not save linked identities: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
loadIdentities();
function linkIdentity(params) {
  const existing = identities.find(
    (i) => i.provider === params.provider && i.providerUserId === params.providerUserId
  );
  if (existing) {
    existing.accountId = params.accountId;
    existing.providerEmail = params.providerEmail || existing.providerEmail;
    existing.displayName = params.displayName || existing.displayName;
    existing.lastUsedAt = Date.now();
    saveIdentities();
    return existing;
  }
  const identity = {
    id: import_crypto.default.randomBytes(16).toString("hex"),
    accountId: params.accountId,
    provider: params.provider,
    providerUserId: params.providerUserId,
    providerEmail: params.providerEmail,
    displayName: params.displayName,
    createdAt: Date.now(),
    lastUsedAt: Date.now()
  };
  identities.push(identity);
  saveIdentities();
  return identity;
}
function unlinkIdentity(identityId) {
  const idx = identities.findIndex((i) => i.id === identityId);
  if (idx === -1) return false;
  identities.splice(idx, 1);
  saveIdentities();
  return true;
}
function findIdentityByProvider(provider, providerUserId) {
  return identities.find(
    (i) => i.provider === provider && i.providerUserId === providerUserId
  );
}
function getAccountIdentities(accountId) {
  return identities.filter((i) => i.accountId === accountId);
}
function getAccountsForIdentity(provider, providerUserId) {
  return identities.filter(
    (i) => i.provider === provider && i.providerUserId === providerUserId
  );
}
function unlinkProviderFromAccount(accountId, provider) {
  const idx = identities.findIndex(
    (i) => i.accountId === accountId && i.provider === provider
  );
  if (idx === -1) return false;
  identities.splice(idx, 1);
  saveIdentities();
  return true;
}
function hasProviderLinked(accountId, provider) {
  return identities.some(
    (i) => i.accountId === accountId && i.provider === provider
  );
}
function reloadIdentities() {
  loadIdentities();
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  findIdentityByProvider,
  getAccountIdentities,
  getAccountsForIdentity,
  hasProviderLinked,
  linkIdentity,
  reloadIdentities,
  unlinkIdentity,
  unlinkProviderFromAccount
});
