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
var platform_exports = {};
__export(platform_exports, {
  canTransitionState: () => import_provider_runtime_manager.canTransitionState,
  createDynamicProvider: () => import_provider_adapter.createDynamicProvider,
  decryptCredential: () => import_credential_store.decryptCredential,
  deleteAllCredentials: () => import_credential_store.deleteAllCredentials,
  deleteCredential: () => import_credential_store.deleteCredential,
  discoverModels: () => import_connection_tester.discoverModels,
  encryptCredential: () => import_credential_store.encryptCredential,
  getCredential: () => import_credential_store.getCredential,
  hasCredential: () => import_credential_store.hasCredential,
  isSafeEndpoint: () => import_connection_tester.isSafeEndpoint,
  isSafeEndpointForProtocol: () => import_connection_tester.isSafeEndpointForProtocol,
  loadAllDynamicProviders: () => import_provider_adapter.loadAllDynamicProviders,
  providerRepo: () => import_provider_repo.providerRepo,
  providerService: () => import_provider_service.providerService,
  storeCredential: () => import_credential_store.storeCredential,
  testProviderConnection: () => import_connection_tester.testProviderConnection
});
module.exports = __toCommonJS(platform_exports);
var import_provider_repo = require("./provider-repo");
var import_provider_service = require("./provider-service");
var import_credential_store = require("./credential-store");
var import_connection_tester = require("./connection-tester");
var import_provider_adapter = require("./provider-adapter");
var import_provider_runtime_manager = require("./provider-runtime-manager");
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  canTransitionState,
  createDynamicProvider,
  decryptCredential,
  deleteAllCredentials,
  deleteCredential,
  discoverModels,
  encryptCredential,
  getCredential,
  hasCredential,
  isSafeEndpoint,
  isSafeEndpointForProtocol,
  loadAllDynamicProviders,
  providerRepo,
  providerService,
  storeCredential,
  testProviderConnection
});
