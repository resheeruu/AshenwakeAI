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
var permissions_exports = {};
__export(permissions_exports, {
  canManage: () => canManage,
  canModerate: () => canModerate,
  getRoleHierarchy: () => getRoleHierarchy,
  hasPermission: () => hasPermission,
  resolveRole: () => resolveRole
});
module.exports = __toCommonJS(permissions_exports);
const ROLE_HIERARCHY = ["owner", "admin", "moderator", "member", "guest"];
function roleLevel(role) {
  return ROLE_HIERARCHY.indexOf(role);
}
function resolveRole(params) {
  const { userId, guildOwnerId, ownerIds = [], adminIds = [], moderatorIds = [], managementRoleIds = [], userRoleIds = [], trustedUserIds = [] } = params;
  if (ownerIds.includes(userId)) return "owner";
  if (guildOwnerId && userId === guildOwnerId) return "owner";
  if (adminIds.includes(userId)) return "admin";
  if (moderatorIds.includes(userId)) return "moderator";
  if (trustedUserIds.includes(userId)) return "moderator";
  if (managementRoleIds.length > 0 && userRoleIds.length > 0) {
    const hasManagementRole = userRoleIds.some((id) => managementRoleIds.includes(id));
    if (hasManagementRole) return "moderator";
  }
  return "member";
}
function hasPermission(userRole, requiredRole) {
  const userLevel = roleLevel(userRole);
  const requiredLevel = roleLevel(requiredRole);
  const allowed = userLevel <= requiredLevel;
  return {
    allowed,
    role: userRole,
    reason: allowed ? void 0 : `Requires ${requiredRole} role (you are ${userRole})`
  };
}
function canManage(targetRole, actorRole) {
  return roleLevel(actorRole) < roleLevel(targetRole);
}
function canModerate(action, actorRole) {
  const roleRequirements = {
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
    restore: "admin"
  };
  const required = roleRequirements[action] || "admin";
  return hasPermission(actorRole, required);
}
function getRoleHierarchy() {
  return [...ROLE_HIERARCHY];
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  canManage,
  canModerate,
  getRoleHierarchy,
  hasPermission,
  resolveRole
});
