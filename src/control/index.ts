export {
  initControlLayer,
  getStatus,
  getHealth,
  getSystemInfo,
  getProviderStatus,
  getProviderPerformance,
  getCurrentModel,
  getMemoryStats,
  getUsageStats,
  getSystemUsageStats,
  getLogs,
  getRecentErrors,
  runDiagnostics,
  getFeatureStatus,
  getConfigurationState,
  getGuildConfigs,
  getGuildConfig,
  updateGuildConfig,
  confirmAction,
  executeAction,
  getAuditEntries,
} from "./control-service";

export {
  authenticateOwner,
  validateSession,
  destroySession,
  createLoginRateLimiter,
  getSessionFromCookie,
  setSessionCookie,
  clearSessionCookie,
  validateCsrfToken,
  getCsrfToken,
  rotateSession,
  destroyAllSessionsForAccount,
  consumePreAuthToken,
} from "./auth";

export type {
  LoginResult,
  Session,
} from "./auth";

export {
  requireAuth,
  requireRole,
  requireCsrf,
  hasRole,
} from "./roles";

export type {
  WebRole,
  AuthenticatedRequest,
} from "./roles";

export {
  getAccountById,
  getAccountByUsername,
  getEnabledAccountByUsername,
  listAccounts,
  createAccount,
  updateAccount,
  updateAccountCredentials,
  deleteAccount,
  changePassword as changeAccountPassword,
  hashPassword,
  verifyPassword,
  sanitizeAccount,
  setOwnerFromEnv,
  hasOwnerAccount,
  generateId,
} from "./account-store";

export type {
  Account,
  SanitizedAccount,
} from "./account-store";

export {
  createSession,
  getActiveSessionCount,
  listSessionsForAccount,
  revokeSession,
} from "./session-store";

export type {
  SessionInfo,
} from "./session-store";

export {
  linkIdentity,
  unlinkIdentity,
  findIdentityByProvider,
  getAccountIdentities,
  unlinkProviderFromAccount,
  hasProviderLinked,
} from "./linked-identities";

export type {
  LinkedIdentity,
  IdentityProvider,
} from "./linked-identities";

export {
  generateResetToken,
  validateResetToken,
  useResetToken,
  invalidateResetTokens,
} from "./password-reset";

export {
  getEmailService,
  sendPasswordResetEmail,
  sendSecurityNotification,
} from "./email-service";

export type {
  EmailMessage,
  EmailService,
} from "./email-service";

export type {
  SystemStatus,
  ProviderInfo,
  SystemInfo,
  MemoryStats,
  UsageSnapshot,
  DiagnosticResult,
  LogSnapshot,
  FeatureStatus,
  ActionResult,
  ActionRequest,
  ActionConfirmation,
  AdminAction,
} from "./types";

export type {
  ConfigurationState,
} from "./control-service";
