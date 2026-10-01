/* ================================================================
 * UPDATE LIFECYCLE COORDINATION
 *
 * Shared, dependency-free flag that tells every subsystem whether an
 * update (git pull / validation / rollback checkout) is currently
 * mutating the source tree.
 *
 * Set by:    src/core/update-manager.ts (performUpdate, triggerRollback)
 * Read by:   src/agent/selfHeal.ts (scan / drain / repair gates)
 *
 * This module is a leaf: it imports nothing, so neither
 * update-manager <-> selfHeal nor any other pair can form a cycle.
 *
 * The flag is deliberately process-local and synchronous: both
 * consumers run inside one Node process, so an in-memory boolean is
 * the cheapest correct coordination primitive.
 * ================================================================ */

let updateInProgress = false;

/** Called by update-manager exactly once when an update/rollback starts. */
export function beginUpdateLifecycle(): void {
  updateInProgress = true;
}

/**
 * Called by update-manager when the process keeps running after the
 * update attempt (failure paths only). On success paths the process
 * exits with the flag still set — the successor process starts clean.
 */
export function endUpdateLifecycle(): void {
  updateInProgress = false;
}

/** True while an update/rollback is mutating the source tree. */
export function isUpdateInProgress(): boolean {
  return updateInProgress;
}
