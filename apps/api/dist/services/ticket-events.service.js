"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.recordEvent = recordEvent;
const prisma_js_1 = require("../lib/prisma.js");
async function recordEvent(ticketId, actorId, // null = system event
type, meta, options = {}) {
    try {
        await prisma_js_1.prisma.ticketEvent.create({
            data: {
                ticketId,
                actorId,
                type,
                meta: (meta ?? {})
            }
        });
    }
    catch (err) {
        console.error(`Failed to record event ${type} for ticket ${ticketId}`, err);
        if (options.critical) {
            throw err; // Caller must handle — do not swallow dedup-critical events
        }
    }
}
