"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
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
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var mcp_client_exports = {};
__export(mcp_client_exports, {
  McpClient: () => McpClient,
  McpClientManager: () => McpClientManager,
  classifyToolRisk: () => classifyToolRisk,
  mcpToolToAshenaiTool: () => mcpToolToAshenaiTool,
  sanitizeMcpOutput: () => sanitizeMcpOutput,
  validateTool: () => validateTool
});
module.exports = __toCommonJS(mcp_client_exports);
var import_logger = require("../logger");
var import_outbound_fetch = require("../security/outbound-fetch");
const MAX_TIMEOUT_MS = 6e4;
const MAX_RESPONSE_SIZE = 1024 * 1024;
const MAX_TOOL_COUNT = 50;
const MAX_SCHEMA_SIZE = 64 * 1024;
const MAX_DESCRIPTION_LENGTH = 2e3;
const MAX_CONCURRENT_REQUESTS = 5;
const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_BASE_MS = 1e3;
const RECONNECT_MAX_MS = 3e4;
const MAX_INPUT_NESTING = 8;
const READ_ONLY_PATTERNS = /^(get|read|list|search|query|fetch|find|lookup|describe|info|status|check|count|summarize)/i;
const DESTRUCTIVE_PATTERNS = /^(delete|remove|destroy|drop|truncate|purge|wipe|erase|clear|kill|terminate|ban|kick|mute|timeout)/i;
const EXTERNAL_SIDE_EFFECT_PATTERNS = /^(send|post|publish|deploy|execute|run|submit|transfer|move|rename|write|create|update|modify|patch|edit|modify|install|uninstall|configure)/i;
function classifyToolRisk(tool) {
  if (DESTRUCTIVE_PATTERNS.test(tool.name)) return "DESTRUCTIVE";
  if (EXTERNAL_SIDE_EFFECT_PATTERNS.test(tool.name)) return "EXTERNAL_SIDE_EFFECT";
  if (READ_ONLY_PATTERNS.test(tool.name)) return "READ_ONLY";
  return "LOW_RISK";
}
function validateToolName(name) {
  if (!name || typeof name !== "string") return false;
  if (name.length === 0 || name.length > 128) return false;
  return /^[a-zA-Z0-9_\-.]+$/.test(name);
}
function validateToolDescription(desc) {
  if (!desc || typeof desc !== "string") return "";
  return desc.slice(0, MAX_DESCRIPTION_LENGTH);
}
function countSchemaNesting(schema, depth = 0) {
  if (depth > MAX_INPUT_NESTING) return depth;
  let maxDepth = depth;
  if (schema.properties && typeof schema.properties === "object") {
    for (const value of Object.values(schema.properties)) {
      if (value && typeof value === "object") {
        const d = countSchemaNesting(value, depth + 1);
        maxDepth = Math.max(maxDepth, d);
      }
    }
  }
  if (schema.definitions && typeof schema.definitions === "object") {
    for (const value of Object.values(schema.definitions)) {
      if (value && typeof value === "object") {
        const d = countSchemaNesting(value, depth + 1);
        maxDepth = Math.max(maxDepth, d);
      }
    }
  }
  return maxDepth;
}
function validateInputSchema(schema) {
  if (!schema || typeof schema !== "object") return false;
  const size = JSON.stringify(schema).length;
  if (size > MAX_SCHEMA_SIZE) {
    import_logger.logger.warn(`MCP tool schema exceeds max size: ${size} > ${MAX_SCHEMA_SIZE}`);
    return false;
  }
  const nesting = countSchemaNesting(schema);
  if (nesting > MAX_INPUT_NESTING) {
    import_logger.logger.warn(`MCP tool schema too deeply nested: ${nesting} > ${MAX_INPUT_NESTING}`);
    return false;
  }
  return true;
}
function validateTool(tool, serverName) {
  if (!validateToolName(tool.name)) {
    import_logger.logger.warn(`MCP tool "${tool.name}" from "${serverName}" has invalid name \u2014 skipped`);
    return null;
  }
  if (!validateInputSchema(tool.inputSchema)) {
    import_logger.logger.warn(`MCP tool "${tool.name}" from "${serverName}" has invalid schema \u2014 skipped`);
    return null;
  }
  return {
    name: tool.name,
    description: validateToolDescription(tool.description),
    inputSchema: tool.inputSchema,
    server: serverName,
    risk: classifyToolRisk(tool),
    safeName: `mcp_${serverName}_${tool.name}`
  };
}
const INJECTION_PATTERNS = [
  /(?:ignore|disregard|override)\s+(?:all\s+)?(?:previous|prior|above|system)\s+instructions/i,
  /you\s+are\s+now\s+(?:a|an|the)\s+/i,
  /new\s+instructions?\s*:/i,
  /system\s*(?:prompt|message|instruction)/i,
  /\[SYSTEM\]/i,
  /\[INST\]/i,
  /<<\|im_start\|>>/i,
  /<<\|im_end\|>>/i,
  /<\|system\|>/i,
  /<\|user\|>/i,
  /<\|assistant\|>/i,
  /<\|im_start\|>/i,
  /<\|im_end\|>/i
];
function sanitizeMcpOutput(output) {
  if (!output || typeof output !== "string") return "";
  const truncated = output.slice(0, MAX_RESPONSE_SIZE);
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(truncated)) {
      import_logger.logger.warn("\u26A0\uFE0F MCP output contains potential instruction injection \u2014 redacting");
      return `[Content blocked: potential instruction injection detected from MCP tool]`;
    }
  }
  return truncated;
}
class McpClient {
  config;
  tools = [];
  resources = [];
  connected = false;
  process;
  activeRequests = 0;
  reconnectAttempts = 0;
  lastActivity = 0;
  constructor(config) {
    this.config = {
      ...config,
      timeoutMs: Math.min(config.timeoutMs ?? 3e4, MAX_TIMEOUT_MS),
      maxResponseSize: config.maxResponseSize ?? MAX_RESPONSE_SIZE,
      maxToolCount: config.maxToolCount ?? MAX_TOOL_COUNT,
      maxConcurrentRequests: config.maxConcurrentRequests ?? MAX_CONCURRENT_REQUESTS
    };
  }
  async connect() {
    if (this.config.transport === "stdio") {
      await this.connectStdio();
    } else {
      await this.connectHttp();
    }
    this.connected = true;
    this.reconnectAttempts = 0;
    this.lastActivity = Date.now();
    import_logger.logger.info(`\u{1F50C} MCP client connected to "${this.config.name}"`);
  }
  async connectStdio() {
    if (!this.config.command) {
      throw new Error(`MCP server "${this.config.name}" requires a command for stdio transport`);
    }
    const command = this.config.command;
    if (/[;|&`$(){}[\]<>!\\]/.test(command) || command.includes("..")) {
      throw new Error(`MCP server "${this.config.name}" has an invalid command: contains shell metacharacters`);
    }
    const { spawn } = await import("child_process");
    this.process = spawn(command, this.config.args ?? [], {
      stdio: ["pipe", "pipe", "pipe"]
    });
    this.process.on("error", (error) => {
      import_logger.logger.warn(`\u26A0\uFE0F MCP process error for "${this.config.name}": ${error.message}`);
      this.connected = false;
    });
    this.process.on("exit", () => {
      this.connected = false;
      this.process = void 0;
    });
    await this.sendRequest("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: {
        name: "ashenai-mcp-client",
        version: "1.0.0"
      }
    });
    await this.sendNotification("notifications/initialized", {});
  }
  async connectHttp() {
    if (!this.config.url) {
      throw new Error(`MCP server "${this.config.name}" requires a URL for HTTP transport`);
    }
    const { response } = await (0, import_outbound_fetch.hardenedFetch)(this.config.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...this.config.headers
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: {
            name: "ashenai-mcp-client",
            version: "1.0.0"
          }
        }
      }),
      timeoutMs: this.config.timeoutMs ?? MAX_TIMEOUT_MS,
      maxRedirects: 3,
      policy: "public"
    });
    if (!response.ok) {
      throw new Error(`MCP HTTP connect failed: ${response.status} ${response.statusText}`);
    }
  }
  async sendRequest(method, params) {
    if (this.activeRequests >= (this.config.maxConcurrentRequests ?? MAX_CONCURRENT_REQUESTS)) {
      throw new Error(`MCP server "${this.config.name}" has too many concurrent requests`);
    }
    this.activeRequests++;
    try {
      return await this.doSendRequest(method, params);
    } finally {
      this.activeRequests--;
      this.lastActivity = Date.now();
    }
  }
  async doSendRequest(method, params) {
    const id = Date.now() * 1e3 + Math.floor(Math.random() * 1e3);
    const request = {
      jsonrpc: "2.0",
      id,
      method,
      params
    };
    if (this.config.transport === "stdio" && this.process) {
      const message = JSON.stringify(request) + "\n";
      this.process.stdin?.write(message);
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error(`MCP request timeout for method: ${method}`));
        }, this.config.timeoutMs);
        let buffer = "";
        const onData = (data) => {
          buffer += data.toString();
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const response = JSON.parse(line);
              if (response.id === id) {
                clearTimeout(timeout);
                this.process?.stdout?.removeListener("data", onData);
                const responseStr = JSON.stringify(response);
                if (responseStr.length > (this.config.maxResponseSize ?? MAX_RESPONSE_SIZE)) {
                  reject(new Error("MCP response exceeds maximum size"));
                  return;
                }
                if (response.error) {
                  reject(new Error(response.error.message));
                } else {
                  resolve(response.result);
                }
                return;
              }
            } catch {
            }
          }
        };
        this.process?.stdout?.on("data", onData);
      });
    }
    if (this.config.transport === "http" && this.config.url) {
      const { response } = await (0, import_outbound_fetch.hardenedFetch)(this.config.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...this.config.headers
        },
        body: JSON.stringify(request),
        timeoutMs: this.config.timeoutMs ?? MAX_TIMEOUT_MS,
        maxRedirects: 3,
        policy: "public"
      });
      if (!response.ok) {
        throw new Error(`MCP HTTP request failed: ${response.status}`);
      }
      const contentLength = response.headers.get("content-length");
      if (contentLength && parseInt(contentLength, 10) > (this.config.maxResponseSize ?? MAX_RESPONSE_SIZE)) {
        throw new Error("MCP response exceeds maximum size");
      }
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("MCP HTTP response body not readable");
      }
      const chunks = [];
      let totalSize = 0;
      const maxSize = this.config.maxResponseSize ?? MAX_RESPONSE_SIZE;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          totalSize += value.length;
          if (totalSize > maxSize) {
            throw new Error("MCP response exceeds maximum size");
          }
          chunks.push(value);
        }
      } finally {
        reader.releaseLock();
      }
      const text = new TextDecoder().decode(Buffer.concat(chunks));
      const result = JSON.parse(text);
      if (result.error) {
        throw new Error(result.error.message);
      }
      return result.result;
    }
    throw new Error("Not connected");
  }
  async sendNotification(method, params) {
    const notification = {
      jsonrpc: "2.0",
      method,
      params
    };
    if (this.config.transport === "stdio" && this.process) {
      this.process.stdin?.write(JSON.stringify(notification) + "\n");
    }
  }
  async listTools() {
    if (!this.connected) {
      throw new Error(`MCP client not connected to "${this.config.name}"`);
    }
    const result = await this.sendRequest("tools/list", {});
    const tools = result.tools ?? [];
    if (tools.length > (this.config.maxToolCount ?? MAX_TOOL_COUNT)) {
      import_logger.logger.warn(`MCP server "${this.config.name}" returned ${tools.length} tools \u2014 capping to ${this.config.maxToolCount ?? MAX_TOOL_COUNT}`);
      this.tools = tools.slice(0, this.config.maxToolCount ?? MAX_TOOL_COUNT);
    } else {
      this.tools = tools;
    }
    return this.tools;
  }
  async listResources() {
    if (!this.connected) {
      throw new Error(`MCP client not connected to "${this.config.name}"`);
    }
    const result = await this.sendRequest("resources/list", {});
    this.resources = result.resources ?? [];
    return this.resources;
  }
  async callTool(name, args) {
    if (!this.connected) {
      throw new Error(`MCP client not connected to "${this.config.name}"`);
    }
    const result = await this.sendRequest("tools/call", {
      name,
      arguments: args
    });
    if (result.content && Array.isArray(result.content)) {
      const textParts = result.content.filter((c) => c.type === "text" && c.text).map((c) => c.text);
      const joined = textParts.join("\n");
      return sanitizeMcpOutput(joined);
    }
    return sanitizeMcpOutput(JSON.stringify(result));
  }
  async readResource(uri) {
    if (!this.connected) {
      throw new Error(`MCP client not connected to "${this.config.name}"`);
    }
    const result = await this.sendRequest("resources/read", { uri });
    if (result.contents && Array.isArray(result.contents)) {
      const joined = result.contents.map((c) => c.text ?? "").join("\n");
      return sanitizeMcpOutput(joined);
    }
    return "";
  }
  async disconnect() {
    if (this.process) {
      this.process.kill();
      this.process = void 0;
    }
    this.connected = false;
    this.tools = [];
    this.resources = [];
    this.activeRequests = 0;
    import_logger.logger.info(`\u{1F50C} MCP client disconnected from "${this.config.name}"`);
  }
  async reconnect() {
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      import_logger.logger.warn(`MCP client "${this.config.name}" exceeded max reconnect attempts`);
      return;
    }
    const delay = Math.min(
      RECONNECT_BASE_MS * Math.pow(2, this.reconnectAttempts),
      RECONNECT_MAX_MS
    );
    this.reconnectAttempts++;
    import_logger.logger.info(`\u{1F50C} MCP client "${this.config.name}" reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
    await new Promise((resolve) => setTimeout(resolve, delay));
    try {
      await this.disconnect();
      await this.connect();
    } catch (error) {
      import_logger.logger.warn(`MCP reconnect failed for "${this.config.name}": ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  isConnected() {
    return this.connected;
  }
  getTools() {
    return this.tools;
  }
  getResources() {
    return this.resources;
  }
  getActiveRequests() {
    return this.activeRequests;
  }
  getLastActivity() {
    return this.lastActivity;
  }
}
class McpClientManager {
  clients = /* @__PURE__ */ new Map();
  async addServer(config) {
    const client = new McpClient(config);
    await client.connect();
    this.clients.set(config.name, client);
    return client;
  }
  getClient(name) {
    return this.clients.get(name);
  }
  getClients() {
    return Array.from(this.clients.values());
  }
  async removeServer(name) {
    const client = this.clients.get(name);
    if (client) {
      await client.disconnect();
      this.clients.delete(name);
    }
  }
  async disconnectAll() {
    for (const client of this.clients.values()) {
      await client.disconnect();
    }
    this.clients.clear();
  }
  /**
   * Get all validated tools from all connected servers.
   * Validates each tool and classifies risk before exposing.
   */
  async getAllTools() {
    const allTools = [];
    for (const [name, client] of this.clients) {
      if (!client.isConnected()) continue;
      try {
        const tools = await client.listTools();
        for (const tool of tools) {
          const validated = validateTool(tool, name);
          if (validated) {
            allTools.push(validated);
          }
        }
      } catch (error) {
        import_logger.logger.warn(`\u26A0\uFE0F Failed to list tools from "${name}": ${error instanceof Error ? error.message : String(error)}`);
        if (!client.isConnected()) {
          client.reconnect().catch(() => {
          });
        }
      }
    }
    return allTools;
  }
  /**
   * Get all tools across servers, enforcing per-server tool count limits.
   */
  getTotalToolCount() {
    let total = 0;
    for (const client of this.clients.values()) {
      total += client.getTools().length;
    }
    return total;
  }
}
function mcpToolToAshenaiTool(validatedTool, client) {
  const requiresConfirmation = validatedTool.risk === "DESTRUCTIVE" || validatedTool.risk === "EXTERNAL_SIDE_EFFECT";
  return {
    name: validatedTool.safeName,
    description: `[MCP:${validatedTool.server}] ${validatedTool.description}`,
    parameters: validatedTool.inputSchema,
    risk: validatedTool.risk,
    requiresConfirmation,
    execute: async (args) => {
      if (!client.isConnected()) {
        throw new Error(`MCP server "${validatedTool.server}" is not connected`);
      }
      if (requiresConfirmation) {
        throw new Error(
          `MCP tool "${validatedTool.name}" is classified as ${validatedTool.risk} \u2014 requires user confirmation via AshenAI's approval system before execution`
        );
      }
      try {
        const result = await client.callTool(validatedTool.name, args);
        return sanitizeMcpOutput(result);
      } catch (error) {
        if (!client.isConnected()) {
          client.reconnect().catch(() => {
          });
        }
        throw error;
      }
    }
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  McpClient,
  McpClientManager,
  classifyToolRisk,
  mcpToolToAshenaiTool,
  sanitizeMcpOutput,
  validateTool
});
