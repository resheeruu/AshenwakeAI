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
  getActionPermission: () => getActionPermission,
  isActionAllowed: () => isActionAllowed
});
module.exports = __toCommonJS(permissions_exports);
const ACTION_PERMISSIONS = {
  project_status: "read",
  check_dependencies: "diagnose",
  check_project: "diagnose",
  search_project: "read",
  typecheck: "test",
  run_tests: "test",
  repair_file: "diagnose",
  coding_agent: "diagnose"
};
function getActionPermission(action) {
  return ACTION_PERMISSIONS[action] ?? null;
}
function isActionAllowed(action, allowed = [
  "read",
  "diagnose",
  "test"
]) {
  const permission = getActionPermission(action);
  if (!permission) {
    return false;
  }
  return allowed.includes(permission);
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  getActionPermission,
  isActionAllowed
});
