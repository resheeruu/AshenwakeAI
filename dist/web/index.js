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
var web_exports = {};
__export(web_exports, {
  clearPageCache: () => import_fetch.clearPageCache,
  clearRobotsCache: () => import_robots.clearRobotsCache,
  clearWebCaches: () => import_pipeline.clearWebCaches,
  extractArticle: () => import_extract.extractArticle,
  extractContent: () => import_extract.extractContent,
  extractStructured: () => import_extract.extractStructured,
  fetchPage: () => import_fetch.fetchPage,
  isUrlAllowedByRobots: () => import_robots.isUrlAllowedByRobots,
  normalizeContent: () => import_extract.normalizeContent,
  webPipeline: () => import_pipeline.webPipeline,
  webSearch: () => import_search.webSearch
});
module.exports = __toCommonJS(web_exports);
var import_search = require("./search");
var import_fetch = require("./fetch");
var import_extract = require("./extract");
var import_pipeline = require("./pipeline");
var import_robots = require("./robots");
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  clearPageCache,
  clearRobotsCache,
  clearWebCaches,
  extractArticle,
  extractContent,
  extractStructured,
  fetchPage,
  isUrlAllowedByRobots,
  normalizeContent,
  webPipeline,
  webSearch
});
