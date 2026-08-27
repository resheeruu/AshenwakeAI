export type AshenRole = "owner" | "admin" | "moderator" | "member" | "guest";

export interface PermissionCheck {
  allowed: boolean;
  reason?: string;
  role: AshenRole;
}

const ROLE_HIERARCHY: AshenRole[] = ["owner", "admin", "moderator", "member", "guest"];

function roleLevel(role: AshenRole): number {
  return ROLE_HIERARCHY.indexOf(role);
}

export function resolveRole(params: {
  userId: string;
  guildId?: string;
  guildOwnerId?: string;
  ownerIds?: string[];
  adminIds?: string[];
  moderatorIds?: string[];
}): AshenRole {
  const { userId, guildOwnerId, ownerIds = [], adminIds = [], moderatorIds = [] } = params;

  if (ownerIds.includes(userId)) return "owner";
  if (adminIds.includes(userId)) return "admin";
  if (moderatorIds.includes(userId)) return "moderator";
  if (guildOwnerId && userId === guildOwnerId) return "admin";
  return "member";
}

export function hasPermission(
  userRole: AshenRole,
  requiredRole: AshenRole,
): PermissionCheck {
  const userLevel = roleLevel(userRole);
  const requiredLevel = roleLevel(requiredRole);
  const allowed = userLevel <= requiredLevel;
  return {
    allowed,
    role: userRole,
    reason: allowed ? undefined : `Requires ${requiredRole} role (you are ${userRole})`,
  };
}

export function canManage(targetRole: AshenRole, actorRole: AshenRole): boolean {
  return roleLevel(actorRole) < roleLevel(targetRole);
}

export function canModerate(action: string, actorRole: AshenRole): PermissionCheck {
  const roleRequirements: Record<string, AshenRole> = {
    warn: "moderator",
    timeout: "moderator",
    kick: "admin",
    ban: "admin",
    purge: "moderator",
    lock: "admin",
    unlock: "admin",
    slowmode: "moderator",
    role_assign: "admin",
    role_create: "admin",
    role_delete: "admin",
    channel_create: "admin",
    channel_delete: "admin",
    channel_modify: "admin",
    permission_modify: "admin",
    server_settings: "admin",
    automod_configure: "admin",
    knowledge_manage: "admin",
    ticket_manage: "admin",
    automation_manage: "admin",
    backup: "admin",
    restore: "admin",
  };

  const required = roleRequirements[action] || "admin";
  return hasPermission(actorRole, required);
}

export function getRoleHierarchy(): readonly AshenRole[] {
  return [...ROLE_HIERARCHY];
}
