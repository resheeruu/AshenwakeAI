export interface PendingAction {
  userId: string;
  guildId: string;
  channelId: string;
  action: string;
  targetUserId?: string;
  reason?: string;
  durationMinutes?: number;
  expiresAt: number;
}

const pending = new Map<string, PendingAction>();

const TTL_MS = 30_000;

export function setPendingAction(
  key: string,
  action: PendingAction
): void {
  pending.set(key, action);
}

export function getPendingAction(
  key: string
): PendingAction | null {
  const action = pending.get(key);

  if (!action) {
    return null;
  }

  if (Date.now() > action.expiresAt) {
    pending.delete(key);
    return null;
  }

  return action;
}

export function clearPendingAction(
  key: string
): void {
  pending.delete(key);
}

export function createActionKey(
  userId: string,
  channelId: string
): string {
  return `${userId}:${channelId}`;
}

export function createExpiration(): number {
  return Date.now() + TTL_MS;
}
