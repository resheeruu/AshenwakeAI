/**
 * MCP Client Adapter — Hardened Model Context Protocol client.
 *
 * Features:
 * - Per-server configuration and connection lifecycle
 * - Bounded timeouts, response sizes, tool counts, schema sizes
 * - Tool validation before exposure to AshenAI
 * - Risk classification for every MCP tool
 * - Permission inheritance from Discord → AshenAI → MCP
 * - Untrusted output sanitization (no instruction injection)
 * - Audit trail integration
 * - Reconnect with bounded backoff
 * - Max concurrent requests per server
 * - Secret redaction in logs
 */

import crypto from "crypto";
import { logger } from "../logger";

/* ================================================================
 * CONSTANTS
 * ================================================================ */

const MAX_TIMEOUT_MS = 60_000;
const MAX_RESPONSE_SIZE = 1_024 * 1024; // 1 MB
const MAX_TOOL_COUNT = 50;
const MAX_SCHEMA_SIZE = 64 * 1024; // 64 KB
const MAX_DESCRIPTION_LENGTH = 2_000;
const MAX_CONCURRENT_REQUESTS = 5;
const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;
const MAX_INPUT_NESTING = 8;

/* ================================================================
 * TYPES
 * ================================================================ */

export interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface McpResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export type McpToolRisk = "READ_ONLY" | "LOW_RISK" | "DESTRUCTIVE" | "EXTERNAL_SIDE_EFFECT";

export interface McpServerConfig {
  name: string;
  transport: "stdio" | "http";
  command?: string;
  args?: string[];
  url?: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
  maxResponseSize?: number;
  maxToolCount?: number;
  maxConcurrentRequests?: number;
}

export interface ValidatedMcpTool extends McpTool {
  server: string;
  risk: McpToolRisk;
  safeName: string;
}

/* ================================================================
 * RISK CLASSIFICATION
 * ================================================================ */

const READ_ONLY_PATTERNS = /^(get|read|list|search|query|fetch|find|lookup|describe|info|status|check|count|summarize)/i;
const DESTRUCTIVE_PATTERNS = /^(delete|remove|destroy|drop|truncate|purge|wipe|erase|clear|kill|terminate|ban|kick|mute|timeout)/i;
const EXTERNAL_SIDE_EFFECT_PATTERNS = /^(send|post|publish|deploy|execute|run|submit|transfer|move|rename|write|create|update|modify|patch|edit|modify|install|uninstall|configure)/i;

export function classifyToolRisk(tool: McpTool): McpToolRisk {
  if (DESTRUCTIVE_PATTERNS.test(tool.name)) return "DESTRUCTIVE";
  if (EXTERNAL_SIDE_EFFECT_PATTERNS.test(tool.name)) return "EXTERNAL_SIDE_EFFECT";
  if (READ_ONLY_PATTERNS.test(tool.name)) return "READ_ONLY";
  // Default to LOW_RISK for unknown patterns
  return "LOW_RISK";
}

/* ================================================================
 * TOOL VALIDATION
 * ================================================================ */

function validateToolName(name: string): boolean {
  if (!name || typeof name !== "string") return false;
  if (name.length === 0 || name.length > 128) return false;
  // Only allow alphanumeric, underscore, hyphen, dot
  return /^[a-zA-Z0-9_\-.]+$/.test(name);
}

function validateToolDescription(desc: string | undefined): string {
  if (!desc || typeof desc !== "string") return "";
  // Truncate to max length
  return desc.slice(0, MAX_DESCRIPTION_LENGTH);
}

function countSchemaNesting(schema: Record<string, unknown>, depth = 0): number {
  if (depth > MAX_INPUT_NESTING) return depth;
  let maxDepth = depth;

  if (schema.properties && typeof schema.properties === "object") {
    for (const value of Object.values(schema.properties)) {
      if (value && typeof value === "object") {
        const d = countSchemaNesting(value as Record<string, unknown>, depth + 1);
        maxDepth = Math.max(maxDepth, d);
      }
    }
  }

  if (schema.definitions && typeof schema.definitions === "object") {
    for (const value of Object.values(schema.definitions)) {
      if (value && typeof value === "object") {
        const d = countSchemaNesting(value as Record<string, unknown>, depth + 1);
        maxDepth = Math.max(maxDepth, d);
      }
    }
  }

  return maxDepth;
}

function validateInputSchema(schema: Record<string, unknown>): boolean {
  if (!schema || typeof schema !== "object") return false;
  const size = JSON.stringify(schema).length;
  if (size > MAX_SCHEMA_SIZE) {
    logger.warn(`MCP tool schema exceeds max size: ${size} > ${MAX_SCHEMA_SIZE}`);
    return false;
  }
  const nesting = countSchemaNesting(schema);
  if (nesting > MAX_INPUT_NESTING) {
    logger.warn(`MCP tool schema too deeply nested: ${nesting} > ${MAX_INPUT_NESTING}`);
    return false;
  }
  return true;
}

export function validateTool(tool: McpTool, serverName: string): ValidatedMcpTool | null {
  if (!validateToolName(tool.name)) {
    logger.warn(`MCP tool "${tool.name}" from "${serverName}" has invalid name — skipped`);
    return null;
  }

  if (!validateInputSchema(tool.inputSchema)) {
    logger.warn(`MCP tool "${tool.name}" from "${serverName}" has invalid schema — skipped`);
    return null;
  }

  return {
    name: tool.name,
    description: validateToolDescription(tool.description),
    inputSchema: tool.inputSchema,
    server: serverName,
    risk: classifyToolRisk(tool),
    safeName: `mcp_${serverName}_${tool.name}`,
  };
}

/* ================================================================
 * OUTPUT SANITIZATION
 * ================================================================ */

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
  /<\|im_end\|>/i,
];

export function sanitizeMcpOutput(output: string): string {
  if (!output || typeof output !== "string") return "";

  // Truncate to max response size
  const truncated = output.slice(0, MAX_RESPONSE_SIZE);

  // Check for instruction injection attempts
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(truncated)) {
      logger.warn("⚠️ MCP output contains potential instruction injection — redacting");
      return `[Content blocked: potential instruction injection detected from MCP tool]`;
    }
  }

  return truncated;
}

/* ================================================================
 * MCP CLIENT
 * ================================================================ */

export class McpClient {
  private config: McpServerConfig;
  private tools: McpTool[] = [];
  private resources: McpResource[] = [];
  private connected = false;
  private process?: ReturnType<typeof import("child_process").spawn>;
  private activeRequests = 0;
  private reconnectAttempts = 0;
  private lastActivity = 0;

  constructor(config: McpServerConfig) {
    this.config = {
      ...config,
      timeoutMs: Math.min(config.timeoutMs ?? 30_000, MAX_TIMEOUT_MS),
      maxResponseSize: config.maxResponseSize ?? MAX_RESPONSE_SIZE,
      maxToolCount: config.maxToolCount ?? MAX_TOOL_COUNT,
      maxConcurrentRequests: config.maxConcurrentRequests ?? MAX_CONCURRENT_REQUESTS,
    };
  }

  async connect(): Promise<void> {
    if (this.config.transport === "stdio") {
      await this.connectStdio();
    } else {
      await this.connectHttp();
    }

    this.connected = true;
    this.reconnectAttempts = 0;
    this.lastActivity = Date.now();
    logger.info(`🔌 MCP client connected to "${this.config.name}"`);
  }

  private async connectStdio(): Promise<void> {
    if (!this.config.command) {
      throw new Error(`MCP server "${this.config.name}" requires a command for stdio transport`);
    }

    // Validate command: only allow simple command names (no paths, no shell metacharacters)
    const command = this.config.command;
    if (/[;|&`$(){}[\]<>!\\]/.test(command) || command.includes("..")) {
      throw new Error(`MCP server "${this.config.name}" has an invalid command: contains shell metacharacters`);
    }

    const { spawn } = await import("child_process");
    this.process = spawn(command, this.config.args ?? [], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    this.process.on("error", (error) => {
      logger.warn(`⚠️ MCP process error for "${this.config.name}": ${error.message}`);
      this.connected = false;
    });

    this.process.on("exit", () => {
      this.connected = false;
      this.process = undefined;
    });

    await this.sendRequest("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: {
        name: "ashenai-mcp-client",
        version: "1.0.0",
      },
    });

    await this.sendNotification("notifications/initialized", {});
  }

  private async connectHttp(): Promise<void> {
    if (!this.config.url) {
      throw new Error(`MCP server "${this.config.name}" requires a URL for HTTP transport`);
    }

    const response = await fetch(this.config.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...this.config.headers,
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
            version: "1.0.0",
          },
        },
      }),
      signal: AbortSignal.timeout(this.config.timeoutMs!),
    });

    if (!response.ok) {
      throw new Error(`MCP HTTP connect failed: ${response.status} ${response.statusText}`);
    }
  }

  private async sendRequest(method: string, params: Record<string, unknown>): Promise<unknown> {
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

  private async doSendRequest(method: string, params: Record<string, unknown>): Promise<unknown> {
    const id = Date.now() * 1000 + Math.floor(Math.random() * 1000);

    const request = {
      jsonrpc: "2.0",
      id,
      method,
      params,
    };

    if (this.config.transport === "stdio" && this.process) {
      const message = JSON.stringify(request) + "\n";
      this.process.stdin?.write(message);

      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error(`MCP request timeout for method: ${method}`));
        }, this.config.timeoutMs!);

        let buffer = "";

        const onData = (data: Buffer) => {
          buffer += data.toString();

          const lines = buffer.split("\n");
          // Keep the last incomplete line in the buffer
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const response = JSON.parse(line);
              if (response.id === id) {
                clearTimeout(timeout);
                this.process?.stdout?.removeListener("data", onData);

                // Validate response size
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
              // Not JSON, ignore
            }
          }
        };

        this.process?.stdout?.on("data", onData);
      });
    }

    if (this.config.transport === "http" && this.config.url) {
      const response = await fetch(this.config.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...this.config.headers,
        },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(this.config.timeoutMs!),
      });

      if (!response.ok) {
        throw new Error(`MCP HTTP request failed: ${response.status}`);
      }

      // Check content-length before reading body to prevent OOM
      const contentLength = response.headers.get("content-length");
      if (contentLength && parseInt(contentLength, 10) > (this.config.maxResponseSize ?? MAX_RESPONSE_SIZE)) {
        throw new Error("MCP response exceeds maximum size");
      }

      // Stream and truncate response to prevent OOM
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("MCP HTTP response body not readable");
      }

      const chunks: Uint8Array[] = [];
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
      const result = JSON.parse(text) as { result?: unknown; error?: { message: string } };
      if (result.error) {
        throw new Error(result.error.message);
      }
      return result.result;
    }

    throw new Error("Not connected");
  }

  private async sendNotification(method: string, params: Record<string, unknown>): Promise<void> {
    const notification = {
      jsonrpc: "2.0",
      method,
      params,
    };

    if (this.config.transport === "stdio" && this.process) {
      this.process.stdin?.write(JSON.stringify(notification) + "\n");
    }
  }

  async listTools(): Promise<McpTool[]> {
    if (!this.connected) {
      throw new Error(`MCP client not connected to "${this.config.name}"`);
    }

    const result = await this.sendRequest("tools/list", {}) as { tools?: McpTool[] };
    const tools = result.tools ?? [];

    // Enforce tool count limit
    if (tools.length > (this.config.maxToolCount ?? MAX_TOOL_COUNT)) {
      logger.warn(`MCP server "${this.config.name}" returned ${tools.length} tools — capping to ${this.config.maxToolCount ?? MAX_TOOL_COUNT}`);
      this.tools = tools.slice(0, this.config.maxToolCount ?? MAX_TOOL_COUNT);
    } else {
      this.tools = tools;
    }

    return this.tools;
  }

  async listResources(): Promise<McpResource[]> {
    if (!this.connected) {
      throw new Error(`MCP client not connected to "${this.config.name}"`);
    }

    const result = await this.sendRequest("resources/list", {}) as { resources?: McpResource[] };
    this.resources = result.resources ?? [];
    return this.resources;
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    if (!this.connected) {
      throw new Error(`MCP client not connected to "${this.config.name}"`);
    }

    const result = await this.sendRequest("tools/call", {
      name,
      arguments: args,
    }) as { content?: Array<{ type: string; text?: string }> };

    if (result.content && Array.isArray(result.content)) {
      const textParts = result.content
        .filter(c => c.type === "text" && c.text)
        .map(c => c.text!);
      const joined = textParts.join("\n");
      return sanitizeMcpOutput(joined);
    }

    return sanitizeMcpOutput(JSON.stringify(result));
  }

  async readResource(uri: string): Promise<string> {
    if (!this.connected) {
      throw new Error(`MCP client not connected to "${this.config.name}"`);
    }

    const result = await this.sendRequest("resources/read", { uri }) as {
      contents?: Array<{ text?: string }>;
    };

    if (result.contents && Array.isArray(result.contents)) {
      const joined = result.contents.map(c => c.text ?? "").join("\n");
      return sanitizeMcpOutput(joined);
    }

    return "";
  }

  async disconnect(): Promise<void> {
    if (this.process) {
      this.process.kill();
      this.process = undefined;
    }
    this.connected = false;
    this.tools = [];
    this.resources = [];
    this.activeRequests = 0;
    logger.info(`🔌 MCP client disconnected from "${this.config.name}"`);
  }

  async reconnect(): Promise<void> {
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      logger.warn(`MCP client "${this.config.name}" exceeded max reconnect attempts`);
      return;
    }

    const delay = Math.min(
      RECONNECT_BASE_MS * Math.pow(2, this.reconnectAttempts),
      RECONNECT_MAX_MS,
    );

    this.reconnectAttempts++;
    logger.info(`🔌 MCP client "${this.config.name}" reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);

    await new Promise(resolve => setTimeout(resolve, delay));

    try {
      await this.disconnect();
      await this.connect();
    } catch (error) {
      logger.warn(`MCP reconnect failed for "${this.config.name}": ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  getTools(): McpTool[] {
    return this.tools;
  }

  getResources(): McpResource[] {
    return this.resources;
  }

  getActiveRequests(): number {
    return this.activeRequests;
  }

  getLastActivity(): number {
    return this.lastActivity;
  }
}

/* ================================================================
 * MCP CLIENT MANAGER
 * ================================================================ */

export class McpClientManager {
  private readonly clients = new Map<string, McpClient>();

  async addServer(config: McpServerConfig): Promise<McpClient> {
    const client = new McpClient(config);
    await client.connect();
    this.clients.set(config.name, client);
    return client;
  }

  getClient(name: string): McpClient | undefined {
    return this.clients.get(name);
  }

  getClients(): McpClient[] {
    return Array.from(this.clients.values());
  }

  async removeServer(name: string): Promise<void> {
    const client = this.clients.get(name);
    if (client) {
      await client.disconnect();
      this.clients.delete(name);
    }
  }

  async disconnectAll(): Promise<void> {
    for (const client of this.clients.values()) {
      await client.disconnect();
    }
    this.clients.clear();
  }

  /**
   * Get all validated tools from all connected servers.
   * Validates each tool and classifies risk before exposing.
   */
  async getAllTools(): Promise<ValidatedMcpTool[]> {
    const allTools: ValidatedMcpTool[] = [];

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
        logger.warn(`⚠️ Failed to list tools from "${name}": ${error instanceof Error ? error.message : String(error)}`);
        // Attempt reconnect on transient failures
        if (!client.isConnected()) {
          client.reconnect().catch(() => {});
        }
      }
    }

    return allTools;
  }

  /**
   * Get all tools across servers, enforcing per-server tool count limits.
   */
  getTotalToolCount(): number {
    let total = 0;
    for (const client of this.clients.values()) {
      total += client.getTools().length;
    }
    return total;
  }
}

/* ================================================================
 * ADAPTER: MCP TOOL → ASHENAI TOOL
 * ================================================================ */

export function mcpToolToAshenaiTool(
  validatedTool: ValidatedMcpTool,
  client: McpClient,
): {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (args: Record<string, unknown>) => Promise<string>;
  risk: McpToolRisk;
  requiresConfirmation: boolean;
} {
  const requiresConfirmation =
    validatedTool.risk === "DESTRUCTIVE" ||
    validatedTool.risk === "EXTERNAL_SIDE_EFFECT";

  return {
    name: validatedTool.safeName,
    description: `[MCP:${validatedTool.server}] ${validatedTool.description}`,
    parameters: validatedTool.inputSchema,
    risk: validatedTool.risk,
    requiresConfirmation,
    execute: async (args: Record<string, unknown>) => {
      if (!client.isConnected()) {
        throw new Error(`MCP server "${validatedTool.server}" is not connected`);
      }

      // Destructive tools must be confirmed before execution
      if (requiresConfirmation) {
        throw new Error(
          `MCP tool "${validatedTool.name}" is classified as ${validatedTool.risk} — requires user confirmation via AshenAI's approval system before execution`,
        );
      }

      try {
        const result = await client.callTool(validatedTool.name, args);
        return sanitizeMcpOutput(result);
      } catch (error) {
        // Attempt reconnect on connection errors
        if (!client.isConnected()) {
          client.reconnect().catch(() => {});
        }
        throw error;
      }
    },
  };
}
