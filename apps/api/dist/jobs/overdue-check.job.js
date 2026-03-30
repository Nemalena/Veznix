"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.overdueCheckWorker = exports.overdueCheckQueue = exports.OVERDUE_CHECK_QUEUE = void 0;
const bullmq_1 = require("bullmq");
const Sentry = __importStar(require("@sentry/node"));
const prisma_js_1 = require("../lib/prisma.js");
const notification_service_js_1 = require("../services/notification.service.js");
const ticket_events_service_js_1 = require("../services/ticket-events.service.js");
const connection = { url: process.env.REDIS_URL || 'redis://localhost:6379' };
exports.OVERDUE_CHECK_QUEUE = 'overdue-check';
exports.overdueCheckQueue = new bullmq_1.Queue(exports.OVERDUE_CHECK_QUEUE, { connection });
async function checkOverdueTickets() {
    const overdue = await prisma_js_1.prisma.ticket.findMany({
        where: {
            deletedAt: null,
            dueAt: { lte: new Date() },
            firstReplyAt: null,
            status: { notIn: ['RESOLVED'] },
            // Only fire once — guard via OVERDUE_NOTIFIED event
            events: { none: { type: 'OVERDUE_NOTIFIED' } }
        },
        select: { id: true, assignedToUserId: true }
    });
    if (overdue.length === 0) {
        console.log('[overdue-check] No overdue tickets.');
        return;
    }
    console.log(`[overdue-check] Found ${overdue.length} overdue ticket(s).`);
    for (const ticket of overdue) {
        try {
            // Record system event first (prevents duplicate notifications if job re-runs)
            // { critical: true } — if this write fails, throw so we don't send a phantom notification
            await (0, ticket_events_service_js_1.recordEvent)(ticket.id, null, 'OVERDUE_NOTIFIED', {}, { critical: true });
            // Notify assigned agent (null = no assignee, notification service handles gracefully)
            await (0, notification_service_js_1.notifyOverdue)(ticket.id, ticket.assignedToUserId);
        }
        catch (err) {
            Sentry.captureException(err, { extra: { ticketId: ticket.id } });
            console.error(`[overdue-check] Failed for ticket ${ticket.id}:`, err);
        }
    }
}
exports.overdueCheckWorker = new bullmq_1.Worker(exports.OVERDUE_CHECK_QUEUE, async (_job) => { await checkOverdueTickets(); }, { connection });
// Run every hour
exports.overdueCheckQueue.add('check', {}, {
    repeat: { every: 60 * 60 * 1000 }
});
console.log('[overdue-check] Worker started. Runs every hour.');
