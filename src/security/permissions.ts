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
  managementRoleIds?: string[];
  userRoleIds?: string[];
  trustedUserIds?: string[];
}): AshenRole {
  const { userId, guildOwnerId, ownerIds = [], adminIds = [], moderatorIds = [], managementRoleIds = [], userRoleIds = [], trustedUserIds = [] } = params;

  // Bot-level owners always get owner role
  if (ownerIds.includes(userId)) return "owner";

  // Guild owner gets owner role (not downgraded to admin)
  if (guildOwnerId && userId === guildOwnerId) return "owner";

  // Explicit admin IDs
  if (adminIds.includes(userId)) return "admin";

  // Explicit moderator IDs
  if (moderatorIds.includes(userId)) return "moderator";

  // Trusted users get moderator access for server management
  if (trustedUserIds.includes(userId)) return "moderator";

  // Users with a management role get moderator access
  if (managementRoleIds.length > 0 && userRoleIds.length > 0) {
    const hasManagementRole = userRoleIds.some((id) => managementRoleIds.includes(id));
    if (hasManagementRole) return "moderator";
  }

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
