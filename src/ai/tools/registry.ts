import { logger } from "../../logger";
import type { ToolDefinition } from "./types";

/**
 * Central registry for all AI management tools.
 *
 * Future server-management capabilities register here.
 * The executor only runs tools that are registered.
 */
export class ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition>();

  register(tool: ToolDefinition): void {
    if (this.tools.has(tool.name)) {
      logger.warn(`Tool "${tool.name}" overwrites existing registration.`);
    }
    this.tools.set(tool.name, tool);
    logger.debug(`Tool registered: ${tool.name} [${tool.category}]`);
  }

  registerAll(tools: ToolDefinition[]): void {
    for (const tool of tools) {
      this.register(tool);
    }
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  getAll(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  getByCategory(category: string): ToolDefinition[] {
    return this.getAll().filter((t) => t.category === category);
  }

  getNames(): string[] {
    return Array.from(this.tools.keys());
  }

  count(): number {
    return this.tools.size;
  }
}

/** Global singleton registry */
export const toolRegistry = new ToolRegistry();
