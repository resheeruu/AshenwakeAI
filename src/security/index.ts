export {
  UserRateLimiter,
} from "./rate-limit";

export type {
  RateLimitResult,
} from "./rate-limit";

export {
  createSecurityManager,
} from "./admin";

export {
  inspectUserInput,
  getCreatorResponse,
  isChatAuthentication,
} from "./gateway";

export type {
  SecurityDecision,
  SecurityResult,
} from "./gateway";

export {
  resolveRole,
  hasPermission,
  canManage,
  canModerate,
  getRoleHierarchy,
} from "./permissions";

export type {
  AshenRole,
  PermissionCheck,
} from "./permissions";

export {
  assessRisk,
} from "./risk-engine";

export type {
  RiskLevel,
  RiskAssessment,
} from "./risk-engine";

export {
  recordAudit,
  getAuditLog,
} from "./audit";

export type {
  AuditEntry,
} from "./audit";

export {
  sanitizeToolError,
  isErrorMessageSafe,
} from "./sanitize";

export {
  signEntry,
  verifyEntry,
  verifyAuditChain,
  getGenesisHash,
} from "./audit-integrity";

export type {
  SignableAuditEntry,
  SignedAuditEntry,
} from "./audit-integrity";

import { UserRateLimiter } from "./rate-limit";

export const messageRateLimiter =
  new UserRateLimiter(
    10,
    60_000
  );

export {
  ToolRateLimiter,
  toolRateLimiter,
} from "../ai/tools/tool-rate-limit";

export type {
  ToolRateLimitConfig,
  ToolRateLimitResult,
} from "../ai/tools/tool-rate-limit";
