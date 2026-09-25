/* ================================================================
 * PRODUCTION TOOL REGISTRY BOOTSTRAP
 *
 * The single production composition point where Discord AI tools are
 * registered into the global ToolRegistry. index.ts calls this after
 * the Discord client exists and before the app accepts interactions.
 *
 * Without this registration every tool lookup (executeTool,
 * checkFullAuthorization, confirmation handler) returns "not
 * registered" and the entire AI tool subsystem silently fails — so:
 *
 *   1. Registration is idempotent (never double-registers).
 *   2. The caller must verify a non-zero count (index.ts fails fast).
 *   3. Preflight reports the registry as REQUIRED (see checkTools).
 *
 * Tests exercise this exact function — never a hand-built registry.
 * ================================================================ */

import type { Client } from "discord.js";
import { logger } from "../../../logger";
import { toolRegistry } from "../registry";
import { createDiscordTools } from "./index";

let productionRegistered = false;

/**
 * Register every Discord AI tool into the global registry.
 *
 * Safe to call more than once: subsequent calls are no-ops while the
 * registry still holds tools. If the registry was cleared (tests),
 * a follow-up call re-registers so composition tests can recover.
 *
 * @param getClient lazy accessor — invoked only at tool execution
 *                  time, so registration never requires a live
 *                  gateway connection.
 * @returns the total number of tools in the registry afterwards.
 */
export function registerProductionDiscordTools(
  getClient: () => Client | null,
): number {
  if (productionRegistered && toolRegistry.count() > 0) {
    return toolRegistry.count();
  }

  const tools = createDiscordTools(getClient);
  toolRegistry.registerAll(tools);
  productionRegistered = true;

  const count = toolRegistry.count();
  logger.info(
    `Registered ${tools.length} Discord AI tools (registry count=${count}).`,
  );
  return count;
}

/** True once the production composition root has performed registration. */
export function isProductionToolRegistrationComplete(): boolean {
  return productionRegistered;
}
