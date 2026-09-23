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
var control_exports = {};
__export(control_exports, {
  authenticateOwner: () => import_auth.authenticateOwner,
  changeAccountPassword: () => import_account_store.changePassword,
  clearSessionCookie: () => import_auth.clearSessionCookie,
  confirmAction: () => import_control_service.confirmAction,
  consumePreAuthToken: () => import_auth.consumePreAuthToken,
  createAccount: () => import_account_store.createAccount,
  createLoginRateLimiter: () => import_auth.createLoginRateLimiter,
  createSession: () => import_session_store.createSession,
  deleteAccount: () => import_account_store.deleteAccount,
  destroyAllSessionsForAccount: () => import_auth.destroyAllSessionsForAccount,
  destroySession: () => import_auth.destroySession,
  executeAction: () => import_control_service.executeAction,
  findIdentityByProvider: () => import_linked_identities.findIdentityByProvider,
  generateId: () => import_account_store.generateId,
  generateResetToken: () => import_password_reset.generateResetToken,
  getAccountById: () => import_account_store.getAccountById,
  getAccountByUsername: () => import_account_store.getAccountByUsername,
  getAccountIdentities: () => import_linked_identities.getAccountIdentities,
  getActiveSessionCount: () => import_session_store.getActiveSessionCount,
  getAllGuildConfigs: () => import_control_service.getAllGuildConfigs,
  getAuditEntries: () => import_control_service.getAuditEntries,
  getConfigurationState: () => import_control_service.getConfigurationState,
  getCsrfToken: () => import_auth.getCsrfToken,
  getCurrentModel: () => import_control_service.getCurrentModel,
  getEmailService: () => import_email_service.getEmailService,
  getEnabledAccountByUsername: () => import_account_store.getEnabledAccountByUsername,
  getFeatureStatus: () => import_control_service.getFeatureStatus,
  getGuildConfig: () => import_control_service.getGuildConfig,
  getGuildConfigs: () => import_control_service.getGuildConfigs,
  getHealth: () => import_control_service.getHealth,
  getLogs: () => import_control_service.getLogs,
  getMemoryStats: () => import_control_service.getMemoryStats,
  getProviderPerformance: () => import_control_service.getProviderPerformance,
  getProviderStatus: () => import_control_service.getProviderStatus,
  getRecentErrors: () => import_control_service.getRecentErrors,
  getSessionFromCookie: () => import_auth.getSessionFromCookie,
  getStatus: () => import_control_service.getStatus,
  getSystemInfo: () => import_control_service.getSystemInfo,
  getSystemUsageStats: () => import_control_service.getSystemUsageStats,
  getUsageStats: () => import_control_service.getUsageStats,
  hasOwnerAccount: () => import_account_store.hasOwnerAccount,
  hasProviderLinked: () => import_linked_identities.hasProviderLinked,
  hasRole: () => import_roles.hasRole,
  hashPassword: () => import_account_store.hashPassword,
  initControlLayer: () => import_control_service.initControlLayer,
  invalidateResetTokens: () => import_password_reset.invalidateResetTokens,
  linkIdentity: () => import_linked_identities.linkIdentity,
  listAccounts: () => import_account_store.listAccounts,
  listSessionsForAccount: () => import_session_store.listSessionsForAccount,
  requireAuth: () => import_roles.requireAuth,
  requireCsrf: () => import_roles.requireCsrf,
  requireRole: () => import_roles.requireRole,
  revokeSession: () => import_session_store.revokeSession,
  rotateSession: () => import_auth.rotateSession,
  runDiagnostics: () => import_control_service.runDiagnostics,
  sanitizeAccount: () => import_account_store.sanitizeAccount,
  sendPasswordResetEmail: () => import_email_service.sendPasswordResetEmail,
  sendSecurityNotification: () => import_email_service.sendSecurityNotification,
  setOwnerFromEnv: () => import_account_store.setOwnerFromEnv,
  setSessionCookie: () => import_auth.setSessionCookie,
  unlinkIdentity: () => import_linked_identities.unlinkIdentity,
  unlinkProviderFromAccount: () => import_linked_identities.unlinkProviderFromAccount,
  updateAccount: () => import_account_store.updateAccount,
  updateAccountCredentials: () => import_account_store.updateAccountCredentials,
  updateGuildConfig: () => import_control_service.updateGuildConfig,
  useResetToken: () => import_password_reset.useResetToken,
  validateCsrfToken: () => import_auth.validateCsrfToken,
  validateResetToken: () => import_password_reset.validateResetToken,
  validateSession: () => import_auth.validateSession,
  verifyPassword: () => import_account_store.verifyPassword
});
module.exports = __toCommonJS(control_exports);
var import_control_service = require("./control-service");
var import_auth = require("./auth");
var import_roles = require("./roles");
var import_account_store = require("./account-store");
var import_session_store = require("./session-store");
var import_linked_identities = require("./linked-identities");
var import_password_reset = require("./password-reset");
var import_email_service = require("./email-service");
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  authenticateOwner,
  changeAccountPassword,
  clearSessionCookie,
  confirmAction,
  consumePreAuthToken,
  createAccount,
  createLoginRateLimiter,
  createSession,
  deleteAccount,
  destroyAllSessionsForAccount,
  destroySession,
  executeAction,
  findIdentityByProvider,
  generateId,
  generateResetToken,
  getAccountById,
  getAccountByUsername,
  getAccountIdentities,
  getActiveSessionCount,
  getAllGuildConfigs,
  getAuditEntries,
  getConfigurationState,
  getCsrfToken,
  getCurrentModel,
  getEmailService,
  getEnabledAccountByUsername,
  getFeatureStatus,
  getGuildConfig,
  getGuildConfigs,
  getHealth,
  getLogs,
  getMemoryStats,
  getProviderPerformance,
  getProviderStatus,
  getRecentErrors,
  getSessionFromCookie,
  getStatus,
  getSystemInfo,
  getSystemUsageStats,
  getUsageStats,
  hasOwnerAccount,
  hasProviderLinked,
  hasRole,
  hashPassword,
  initControlLayer,
  invalidateResetTokens,
  linkIdentity,
  listAccounts,
  listSessionsForAccount,
  requireAuth,
  requireCsrf,
  requireRole,
  revokeSession,
  rotateSession,
  runDiagnostics,
  sanitizeAccount,
  sendPasswordResetEmail,
  sendSecurityNotification,
  setOwnerFromEnv,
  setSessionCookie,
  unlinkIdentity,
  unlinkProviderFromAccount,
  updateAccount,
  updateAccountCredentials,
  updateGuildConfig,
  useResetToken,
  validateCsrfToken,
  validateResetToken,
  validateSession,
  verifyPassword
});
