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
} from "./session-store";

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
