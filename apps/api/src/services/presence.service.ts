/**
 * In-memory ticket presence service.
 * Tracks which agents are currently viewing a ticket, with a TTL-based
 * expiry so stale entries are automatically cleaned up.
 *
 * Intentionally simple (single-process, no Redis) — sufficient for the
 * expected deployment model and avoids a new infrastructure dependency.
 */

const TTL_MS = 30_000; // 30 s — entry is considered stale after this
const CLEANUP_INTERVAL_MS = 60_000; // run cleanup every 60 s

interface PresenceEntry {
  userId: string;
  displayName: string;
  lastSeen: Date;
}

// ticketId → ( userId → PresenceEntry )
const store = new Map<string, Map<string, PresenceEntry>>();

/** Record that a user is currently viewing a ticket. */
export function heartbeat(
  ticketId: string,
  userId: string,
  displayName: string,
): void {
  let viewers = store.get(ticketId);
  if (!viewers) {
    viewers = new Map();
    store.set(ticketId, viewers);
  }
  viewers.set(userId, { userId, displayName, lastSeen: new Date() });
}

/**
 * Return all active viewers for a ticket, optionally excluding one user
 * (typically the caller, so they don't see themselves).
 */
export function getViewers(
  ticketId: string,
  excludeUserId?: string,
): { userId: string; displayName: string }[] {
  const viewers = store.get(ticketId);
  if (!viewers) return [];

  const cutoff = new Date(Date.now() - TTL_MS);
  const result: { userId: string; displayName: string }[] = [];

  for (const entry of viewers.values()) {
    if (entry.lastSeen < cutoff) continue;         // stale
    if (entry.userId === excludeUserId) continue;  // exclude self
    result.push({ userId: entry.userId, displayName: entry.displayName });
  }

  return result;
}

// Periodic cleanup to prevent unbounded memory growth
setInterval(() => {
  const cutoff = new Date(Date.now() - TTL_MS);
  for (const [ticketId, viewers] of store.entries()) {
    for (const [userId, entry] of viewers.entries()) {
      if (entry.lastSeen < cutoff) viewers.delete(userId);
    }
    if (viewers.size === 0) store.delete(ticketId);
  }
}, CLEANUP_INTERVAL_MS);
