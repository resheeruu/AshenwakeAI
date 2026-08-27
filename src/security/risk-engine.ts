export type RiskLevel = "safe" | "low" | "medium" | "high" | "critical";

export interface RiskAssessment {
  level: RiskLevel;
  requiresConfirmation: boolean;
  reason: string;
}

const HIGH_RISK_ACTIONS = new Set([
  "ban",
  "channel_delete",
  "role_delete",
  "permission_modify",
  "server_settings",
  "restore",
]);

const MEDIUM_RISK_ACTIONS = new Set([
  "kick",
  "purge",
  "role_create",
  "channel_create",
  "lock",
  "unlock",
  "timeout",
]);

export function assessRisk(
  action: string,
  targetName?: string,
  isBotOwner = false,
): RiskAssessment {
  if (isBotOwner) {
    return {
      level: "low",
      requiresConfirmation: false,
      reason: "Bot owner override",
    };
  }

  if (HIGH_RISK_ACTIONS.has(action)) {
    return {
      level: "critical",
      requiresConfirmation: true,
      reason: `Action "${action}" is high-risk` + (targetName ? ` targeting ${targetName}` : ""),
    };
  }

  if (MEDIUM_RISK_ACTIONS.has(action)) {
    return {
      level: "medium",
      requiresConfirmation: true,
      reason: `Action "${action}" requires confirmation` + (targetName ? ` for ${targetName}` : ""),
    };
  }

  return {
    level: "low",
    requiresConfirmation: false,
    reason: `Action "${action}" is low risk`,
  };
}
