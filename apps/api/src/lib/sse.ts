/**
 * SSE Connection Manager
 *
 * Maintains a Map of userId → Set of active SSE response streams.
 * Multiple tabs/windows per user are supported.
 * Safe for single-server deployment (Hetzner CX32).
 */

import { FastifyReply } from 'fastify';

type SseClient = FastifyReply;

const connections = new Map<string, Set<SseClient>>();

export function addSseClient(userId: string, reply: SseClient) {
  if (!connections.has(userId)) connections.set(userId, new Set());
  connections.get(userId)!.add(reply);
}

export function removeSseClient(userId: string, reply: SseClient) {
  connections.get(userId)?.delete(reply);
  if (connections.get(userId)?.size === 0) connections.delete(userId);
}

/**
 * Push an SSE event to all active connections for a user.
 */
export function pushToUser(userId: string, event: string, data: unknown) {
  const clients = connections.get(userId);
  if (!clients || clients.size === 0) return;

  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const reply of clients) {
    try {
      reply.raw.write(payload);
    } catch {
      // Client disconnected — remove
      clients.delete(reply);
    }
  }
}

export function getConnectionCount(): number {
  let total = 0;
  for (const set of connections.values()) total += set.size;
  return total;
}
