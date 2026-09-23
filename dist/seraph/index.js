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
var seraph_exports = {};
__export(seraph_exports, {
  generateReport: () => import_seraph_service.generateReport,
  getMonitoringInfo: () => import_seraph_service.getMonitoringInfo,
  getReports: () => import_seraph_service.getReports,
  getStatus: () => import_seraph_service.getStatus,
  getSystemInformation: () => import_seraph_service.getSystemInformation,
  getTools: () => import_seraph_service.getTools,
  runDoctor: () => import_seraph_service.runDoctor,
  runInvestigation: () => import_seraph_service.runInvestigation
});
module.exports = __toCommonJS(seraph_exports);
var import_seraph_service = require("./seraph-service");
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  generateReport,
  getMonitoringInfo,
  getReports,
  getStatus,
  getSystemInformation,
  getTools,
  runDoctor,
  runInvestigation
});
