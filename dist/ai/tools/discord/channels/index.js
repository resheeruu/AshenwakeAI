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
var channels_exports = {};
__export(channels_exports, {
  createChannelManagementTools: () => createChannelManagementTools,
  createPermissionPresetTools: () => createPermissionPresetTools,
  executeApplyChannelPreset: () => import_permission_presets2.executeApplyChannelPreset,
  executeDeleteCategory: () => import_delete_category2.executeDeleteCategory,
  executeDeleteChannel: () => import_delete_channel2.executeDeleteChannel,
  executeEditChannel: () => import_edit_channel2.executeEditChannel,
  executeManageChannelPermissions: () => import_permissions2.executeManageChannelPermissions
});
module.exports = __toCommonJS(channels_exports);
var import_edit_channel = require("./edit-channel");
var import_delete_channel = require("./delete-channel");
var import_delete_category = require("./delete-category");
var import_permissions = require("./permissions");
var import_permission_presets = require("./permission-presets");
var import_edit_channel2 = require("./edit-channel");
var import_delete_channel2 = require("./delete-channel");
var import_delete_category2 = require("./delete-category");
var import_permissions2 = require("./permissions");
var import_permission_presets2 = require("./permission-presets");
function createChannelManagementTools(getClient) {
  return [
    (0, import_edit_channel.createEditChannelTool)(getClient),
    (0, import_delete_channel.createDeleteChannelTool)(getClient),
    (0, import_delete_category.createDeleteCategoryTool)(getClient),
    (0, import_permissions.createManageChannelPermissionsTool)(getClient)
  ];
}
function createPermissionPresetTools(getClient) {
  return [
    (0, import_permission_presets.createApplyChannelPresetTool)(getClient)
  ];
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  createChannelManagementTools,
  createPermissionPresetTools,
  executeApplyChannelPreset,
  executeDeleteCategory,
  executeDeleteChannel,
  executeEditChannel,
  executeManageChannelPermissions
});
