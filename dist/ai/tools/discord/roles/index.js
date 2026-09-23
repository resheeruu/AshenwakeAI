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
var roles_exports = {};
__export(roles_exports, {
  createAssignRoleTool: () => import_assign_role.createAssignRoleTool,
  createConfigureRolePermissionsTool: () => import_configure_role_permissions.createConfigureRolePermissionsTool,
  createCreateRoleTool: () => import_create_role.createCreateRoleTool,
  createDeleteRoleTool: () => import_delete_role.createDeleteRoleTool,
  createEditRoleTool: () => import_edit_role.createEditRoleTool,
  createInspectRolesTool: () => import_inspect_roles.createInspectRolesTool,
  createRemoveRoleTool: () => import_remove_role.createRemoveRoleTool,
  executeAssignRole: () => import_assign_role.executeAssignRole,
  executeConfigureRolePermissions: () => import_configure_role_permissions.executeConfigureRolePermissions,
  executeCreateRole: () => import_create_role.executeCreateRole,
  executeDeleteRole: () => import_delete_role.executeDeleteRole,
  executeEditRole: () => import_edit_role.executeEditRole,
  executeRemoveRole: () => import_remove_role.executeRemoveRole
});
module.exports = __toCommonJS(roles_exports);
var import_create_role = require("./create-role");
var import_edit_role = require("./edit-role");
var import_delete_role = require("./delete-role");
var import_assign_role = require("./assign-role");
var import_remove_role = require("./remove-role");
var import_inspect_roles = require("./inspect-roles");
var import_configure_role_permissions = require("./configure-role-permissions");
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  createAssignRoleTool,
  createConfigureRolePermissionsTool,
  createCreateRoleTool,
  createDeleteRoleTool,
  createEditRoleTool,
  createInspectRolesTool,
  createRemoveRoleTool,
  executeAssignRole,
  executeConfigureRolePermissions,
  executeCreateRole,
  executeDeleteRole,
  executeEditRole,
  executeRemoveRole
});
