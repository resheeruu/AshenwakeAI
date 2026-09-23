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
var security_exports = {};
__export(security_exports, {
  ToolRateLimiter: () => import_tool_rate_limit.ToolRateLimiter,
  UserRateLimiter: () => import_rate_limit.UserRateLimiter,
  assessRisk: () => import_risk_engine.assessRisk,
  canManage: () => import_permissions.canManage,
  canModerate: () => import_permissions.canModerate,
  createSecurityManager: () => import_admin.createSecurityManager,
  getAuditLog: () => import_audit.getAuditLog,
  getCreatorResponse: () => import_gateway.getCreatorResponse,
  getGenesisHash: () => import_audit_integrity.getGenesisHash,
  getRoleHierarchy: () => import_permissions.getRoleHierarchy,
  hasPermission: () => import_permissions.hasPermission,
  inspectUserInput: () => import_gateway.inspectUserInput,
  isChatAuthentication: () => import_gateway.isChatAuthentication,
  isErrorMessageSafe: () => import_sanitize.isErrorMessageSafe,
  messageRateLimiter: () => messageRateLimiter,
  recordAudit: () => import_audit.recordAudit,
  resolveRole: () => import_permissions.resolveRole,
  sanitizeToolError: () => import_sanitize.sanitizeToolError,
  signEntry: () => import_audit_integrity.signEntry,
  toolRateLimiter: () => import_tool_rate_limit.toolRateLimiter,
  verifyAuditChain: () => import_audit_integrity.verifyAuditChain,
  verifyEntry: () => import_audit_integrity.verifyEntry
});
module.exports = __toCommonJS(security_exports);
var import_rate_limit = require("./rate-limit");
var import_admin = require("./admin");
var import_gateway = require("./gateway");
var import_permissions = require("./permissions");
var import_risk_engine = require("./risk-engine");
var import_audit = require("./audit");
var import_sanitize = require("./sanitize");
var import_audit_integrity = require("./audit-integrity");
var import_rate_limit2 = require("./rate-limit");
var import_tool_rate_limit = require("../ai/tools/tool-rate-limit");
const messageRateLimiter = new import_rate_limit2.UserRateLimiter(
  10,
  6e4
);
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  ToolRateLimiter,
  UserRateLimiter,
  assessRisk,
  canManage,
  canModerate,
  createSecurityManager,
  getAuditLog,
  getCreatorResponse,
  getGenesisHash,
  getRoleHierarchy,
  hasPermission,
  inspectUserInput,
  isChatAuthentication,
  isErrorMessageSafe,
  messageRateLimiter,
  recordAudit,
  resolveRole,
  sanitizeToolError,
  signEntry,
  toolRateLimiter,
  verifyAuditChain,
  verifyEntry
});
