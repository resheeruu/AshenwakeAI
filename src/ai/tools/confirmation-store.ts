import { logger } from "../../logger";
import type { ActionPlan } from "./types";

/* ================================================================
 * PENDING ACTION PLAN STORE
 *
 * Stores ActionPlans in memory between confirmation prompt and
 * confirmation button press. Plans expire after 5 minutes.
 *
 * Anti-tampering: plans are stored server-side. Button interactions
 * verify the plan by ID, not by reconstructing from button text.
 * ================================================================ */

interface StoredPlan {
  plan: ActionPlan;
  executed: boolean;
}

const pendingPlans = new Map<string, StoredPlan>();
const CLEANUP_INTERVAL_MS = 60_000;

let cleanupTimer: ReturnType<typeof setInterval> | null = null;

function startCleanup(): void {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [id, stored] of pendingPlans) {
      if (stored.plan.expiresAt < now) {
        pendingPlans.delete(id);
      }
    }
  }, CLEANUP_INTERVAL_MS);
  if (cleanupTimer.unref) cleanupTimer.unref();
}

/* ================================================================
 * STORE / RETRIEVE / VERIFY
 * ================================================================ */

export function storePendingPlan(plan: ActionPlan): void {
  pendingPlans.set(plan.id, { plan, executed: false });
  startCleanup();
  logger.info(`Stored pending plan: ${plan.id} tool=${plan.toolName} guild=${plan.guildId}`);
}

export function getPendingPlan(planId: string): ActionPlan | undefined {
  const stored = pendingPlans.get(planId);
  return stored?.plan;
}

export function removePendingPlan(planId: string): boolean {
  return pendingPlans.delete(planId);
}

export function isPlanExpired(plan: ActionPlan): boolean {
  return plan.expiresAt < Date.now();
}

export function isPlanExecuted(planId: string): boolean {
  return pendingPlans.get(planId)?.executed ?? false;
}

export function verifyPlan(
  plan: ActionPlan,
  confirmerId: string,
  guildId: string,
  channelId?: string,
  sessionId?: string,
): { valid: boolean; reason?: string } {
  if (plan.requesterId !== confirmerId) {
    return { valid: false, reason: "CONFIRMATION_INVALID" };
  }
  if (plan.guildId !== guildId) {
    return { valid: false, reason: "CONFIRMATION_INVALID" };
  }
  // Channel binding: if plan specifies a channel, the confirmation must match
  if (channelId && plan.channelId && plan.channelId !== channelId) {
    return { valid: false, reason: "CONFIRMATION_INVALID" };
  }
  // Session binding: for browser operations, session must match
  if (sessionId && plan.sessionId && plan.sessionId !== sessionId) {
    return { valid: false, reason: "CONFIRMATION_INVALID" };
  }
  if (isPlanExpired(plan)) {
    return { valid: false, reason: "CONFIRMATION_EXPIRED" };
  }
  if (isPlanExecuted(plan.id)) {
    return { valid: false, reason: "ALREADY_EXECUTED" };
  }
  return { valid: true };
}

export function markPlanExecuted(planId: string): void {
  const stored = pendingPlans.get(planId);
  if (stored) {
    stored.executed = true;
  }
}

export function getPendingPlanCount(): number {
  return pendingPlans.size;
}

export function clearAllPendingPlans(): void {
  pendingPlans.clear();
}
