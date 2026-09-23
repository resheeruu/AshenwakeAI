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
var discord_exports = {};
__export(discord_exports, {
  createDiscordTools: () => createDiscordTools,
  createManagementDiscordTools: () => createManagementDiscordTools,
  createModerationDiscordTools: () => createModerationDiscordTools,
  createProtectionDiscordTools: () => createProtectionDiscordTools,
  createReadOnlyDiscordTools: () => createReadOnlyDiscordTools,
  createRoleManagementTools: () => createRoleManagementTools,
  createWriteDiscordTools: () => createWriteDiscordTools,
  executeApplyChannelPreset: () => import_channels7.executeApplyChannelPreset,
  executeAssignRole: () => import_roles2.executeAssignRole,
  executeBanUserPlan: () => import_moderation2.executeBanUserPlan,
  executeConfigureRolePermissions: () => import_roles2.executeConfigureRolePermissions,
  executeCreateCategory: () => import_create_category2.executeCreateCategory,
  executeCreateChannel: () => import_create_channel2.executeCreateChannel,
  executeCreateRole: () => import_roles2.executeCreateRole,
  executeDeleteCategory: () => import_channels5.executeDeleteCategory,
  executeDeleteChannel: () => import_channels4.executeDeleteChannel,
  executeDeleteRole: () => import_roles2.executeDeleteRole,
  executeEditChannel: () => import_channels3.executeEditChannel,
  executeEditRole: () => import_roles2.executeEditRole,
  executeKickUserPlan: () => import_moderation2.executeKickUserPlan,
  executeManageChannelPermissions: () => import_channels6.executeManageChannelPermissions,
  executeMoveChannel: () => import_move_channel2.executeMoveChannel,
  executeProtectCategory: () => import_protection_tools2.executeProtectCategory,
  executeProtectChannel: () => import_protection_tools2.executeProtectChannel,
  executePurgeMessagesPlan: () => import_moderation2.executePurgeMessagesPlan,
  executeRemoveRole: () => import_roles2.executeRemoveRole,
  executeRenameChannel: () => import_rename_channel2.executeRenameChannel,
  executeTimeoutUserPlan: () => import_moderation2.executeTimeoutUserPlan,
  executeUnprotectCategory: () => import_protection_tools2.executeUnprotectCategory,
  executeUnprotectChannel: () => import_protection_tools2.executeUnprotectChannel,
  executeUntimeoutUserPlan: () => import_moderation2.executeUntimeoutUserPlan,
  executeWarnUserPlan: () => import_moderation2.executeWarnUserPlan
});
module.exports = __toCommonJS(discord_exports);
var import_inspect_server = require("./inspect-server");
var import_list_channels = require("./list-channels");
var import_check_permissions = require("./check-permissions");
var import_inspect_ai_config = require("./inspect-ai-config");
var import_health_check = require("./health-check");
var import_create_channel = require("./create-channel");
var import_create_category = require("./create-category");
var import_rename_channel = require("./rename-channel");
var import_move_channel = require("./move-channel");
var import_channels = require("./channels");
var import_protection_tools = require("./protection-tools");
var import_audit_viewer = require("./audit-viewer");
var import_channels2 = require("./channels");
var import_governance = require("../governance");
var import_roles = require("./roles");
var import_moderation = require("./moderation");
var import_create_channel2 = require("./create-channel");
var import_create_category2 = require("./create-category");
var import_rename_channel2 = require("./rename-channel");
var import_move_channel2 = require("./move-channel");
var import_channels3 = require("./channels");
var import_channels4 = require("./channels");
var import_channels5 = require("./channels");
var import_channels6 = require("./channels");
var import_protection_tools2 = require("./protection-tools");
var import_channels7 = require("./channels");
var import_moderation2 = require("./moderation");
var import_roles2 = require("./roles");
function createDiscordTools(getClient) {
  return [
    ...createReadOnlyDiscordTools(getClient),
    ...createWriteDiscordTools(getClient),
    ...createManagementDiscordTools(getClient),
    ...createProtectionDiscordTools(getClient),
    ...(0, import_governance.createGovernanceTools)(getClient),
    ...createModerationDiscordTools(getClient),
    ...createRoleManagementTools(getClient)
  ];
}
function createReadOnlyDiscordTools(getClient) {
  return [
    (0, import_inspect_server.createInspectServerTool)(getClient),
    (0, import_list_channels.createListChannelsTool)(getClient),
    (0, import_check_permissions.createCheckPermissionsTool)(getClient),
    (0, import_inspect_ai_config.createInspectAIConfigTool)(),
    (0, import_health_check.createHealthCheckTool)()
  ];
}
function createWriteDiscordTools(getClient) {
  return [
    (0, import_create_channel.createCreateChannelTool)(getClient),
    (0, import_create_category.createCreateCategoryTool)(getClient),
    (0, import_rename_channel.createRenameChannelTool)(getClient),
    (0, import_move_channel.createMoveChannelTool)(getClient)
  ];
}
function createManagementDiscordTools(getClient) {
  return (0, import_channels.createChannelManagementTools)(getClient);
}
function createProtectionDiscordTools(getClient) {
  return [
    (0, import_protection_tools.createProtectChannelTool)(getClient),
    (0, import_protection_tools.createUnprotectChannelTool)(getClient),
    (0, import_protection_tools.createProtectCategoryTool)(getClient),
    (0, import_protection_tools.createUnprotectCategoryTool)(getClient),
    (0, import_protection_tools.createListProtectedResourcesTool)(getClient),
    ...(0, import_channels2.createPermissionPresetTools)(getClient),
    (0, import_audit_viewer.createViewToolAuditTool)(getClient)
  ];
}
function createModerationDiscordTools(getClient) {
  return [
    (0, import_moderation.createWarnUserTool)(getClient),
    (0, import_moderation.createTimeoutUserTool)(getClient),
    (0, import_moderation.createUntimeoutUserTool)(getClient),
    (0, import_moderation.createKickUserTool)(getClient),
    (0, import_moderation.createBanUserTool)(getClient),
    (0, import_moderation.createViewWarningsTool)(getClient),
    (0, import_moderation.createPurgeMessagesTool)(getClient)
  ];
}
function createRoleManagementTools(getClient) {
  return [
    (0, import_roles.createCreateRoleTool)(getClient),
    (0, import_roles.createEditRoleTool)(getClient),
    (0, import_roles.createDeleteRoleTool)(getClient),
    (0, import_roles.createAssignRoleTool)(getClient),
    (0, import_roles.createRemoveRoleTool)(getClient),
    (0, import_roles.createInspectRolesTool)(getClient),
    (0, import_roles.createConfigureRolePermissionsTool)(getClient)
  ];
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  createDiscordTools,
  createManagementDiscordTools,
  createModerationDiscordTools,
  createProtectionDiscordTools,
  createReadOnlyDiscordTools,
  createRoleManagementTools,
  createWriteDiscordTools,
  executeApplyChannelPreset,
  executeAssignRole,
  executeBanUserPlan,
  executeConfigureRolePermissions,
  executeCreateCategory,
  executeCreateChannel,
  executeCreateRole,
  executeDeleteCategory,
  executeDeleteChannel,
  executeDeleteRole,
  executeEditChannel,
  executeEditRole,
  executeKickUserPlan,
  executeManageChannelPermissions,
  executeMoveChannel,
  executeProtectCategory,
  executeProtectChannel,
  executePurgeMessagesPlan,
  executeRemoveRole,
  executeRenameChannel,
  executeTimeoutUserPlan,
  executeUnprotectCategory,
  executeUnprotectChannel,
  executeUntimeoutUserPlan,
  executeWarnUserPlan
});
