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
var tools_exports = {};
__export(tools_exports, {
  ToolRegistry: () => import_registry.ToolRegistry,
  addChannelScope: () => import_channel_scope.addChannelScope,
  addChatRole: () => import_channel_scope.addChatRole,
  addManagementRole: () => import_channel_scope.addManagementRole,
  assertGuildIsolation: () => import_channel_scope.assertGuildIsolation,
  createActionPlan: () => import_executor.createActionPlan,
  deleteGuildAIConfig: () => import_channel_scope.deleteGuildAIConfig,
  executeTool: () => import_executor.executeTool,
  getAllGuildAIConfigs: () => import_channel_scope.getAllGuildAIConfigs,
  getChannelScopes: () => import_channel_scope.getChannelScopes,
  getToolAuditLog: () => import_audit.getToolAuditLog,
  isChannelAllowed: () => import_channel_scope.isChannelAllowed,
  loadGuildAIConfig: () => import_channel_scope.loadGuildAIConfig,
  recordToolAudit: () => import_audit.recordToolAudit,
  removeChannelScope: () => import_channel_scope.removeChannelScope,
  removeChatRole: () => import_channel_scope.removeChatRole,
  removeManagementRole: () => import_channel_scope.removeManagementRole,
  removeSingleChannelScope: () => import_channel_scope.removeSingleChannelScope,
  saveGuildAIConfig: () => import_channel_scope.saveGuildAIConfig,
  setChannelScope: () => import_channel_scope.setChannelScope,
  toolRegistry: () => import_registry.toolRegistry,
  validateArguments: () => import_validator.validateArguments,
  validateBatch: () => import_executor.validateBatch,
  validateChannelScope: () => import_validator.validateChannelScope,
  validateRisk: () => import_validator.validateRisk,
  validateRole: () => import_validator.validateRole,
  validateToolRequest: () => import_validator.validateToolRequest
});
module.exports = __toCommonJS(tools_exports);
var import_registry = require("./registry");
var import_validator = require("./validator");
var import_executor = require("./executor");
var import_channel_scope = require("./channel-scope");
var import_audit = require("./audit");
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  ToolRegistry,
  addChannelScope,
  addChatRole,
  addManagementRole,
  assertGuildIsolation,
  createActionPlan,
  deleteGuildAIConfig,
  executeTool,
  getAllGuildAIConfigs,
  getChannelScopes,
  getToolAuditLog,
  isChannelAllowed,
  loadGuildAIConfig,
  recordToolAudit,
  removeChannelScope,
  removeChatRole,
  removeManagementRole,
  removeSingleChannelScope,
  saveGuildAIConfig,
  setChannelScope,
  toolRegistry,
  validateArguments,
  validateBatch,
  validateChannelScope,
  validateRisk,
  validateRole,
  validateToolRequest
});
