"use strict";
/**
 * SSE Connection Manager
 *
 * Maintains a Map of userId → Set of active SSE response streams.
 * Multiple tabs/windows per user are supported.
 * Safe for single-server deployment (Hetzner CX32).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.addSseClient = addSseClient;
exports.removeSseClient = removeSseClient;
exports.pushToUser = pushToUser;
exports.getConnectionCount = getConnectionCount;
const connections = new Map();
function addSseClient(userId, reply) {
    if (!connections.has(userId))
        connections.set(userId, new Set());
    connections.get(userId).add(reply);
}
function removeSseClient(userId, reply) {
    connections.get(userId)?.delete(reply);
    if (connections.get(userId)?.size === 0)
        connections.delete(userId);
}
/**
 * Push an SSE event to all active connections for a user.
 */
function pushToUser(userId, event, data) {
    const clients = connections.get(userId);
    if (!clients || clients.size === 0)
        return;
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const reply of clients) {
        try {
            reply.raw.write(payload);
        }
        catch {
            // Client disconnected — remove
            clients.delete(reply);
        }
    }
}
function getConnectionCount() {
    let total = 0;
    for (const set of connections.values())
        total += set.size;
    return total;
}
