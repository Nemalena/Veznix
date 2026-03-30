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
exports.webhookRenewalWorker = exports.webhookRenewalQueue = exports.WEBHOOK_RENEWAL_QUEUE = void 0;
const bullmq_1 = require("bullmq");
const Sentry = __importStar(require("@sentry/node"));
const prisma_js_1 = require("../lib/prisma.js");
const redis_js_1 = require("../lib/redis.js");
const graph_service_js_1 = require("../services/graph.service.js");
const connection = {
    url: process.env.REDIS_URL || 'redis://localhost:6379'
};
exports.WEBHOOK_RENEWAL_QUEUE = 'webhook-renewal';
exports.webhookRenewalQueue = new bullmq_1.Queue(exports.WEBHOOK_RENEWAL_QUEUE, { connection });
/**
 * Renews all active webhook subscriptions expiring within the next 24h.
 * Records the last successful renewal time in Redis for the /health endpoint.
 * Sends an admin alert email on failure — webhook expiry is completely silent otherwise.
 */
async function renewAllSubscriptions() {
    const soon = new Date();
    soon.setHours(soon.getHours() + 24);
    const mailboxes = await prisma_js_1.prisma.mailbox.findMany({
        where: {
            isActive: true,
            webhookSubscriptionId: { not: null },
            webhookExpiry: { lte: soon }
        }
    });
    if (mailboxes.length === 0) {
        console.log('[webhook-renewal] No subscriptions due for renewal.');
        return;
    }
    console.log(`[webhook-renewal] Renewing ${mailboxes.length} subscription(s)...`);
    for (const mailbox of mailboxes) {
        try {
            await graph_service_js_1.graphService.renewSubscription(mailbox.webhookSubscriptionId);
            // Update expiry in DB (Graph extends by ~48h from now)
            const newExpiry = new Date();
            newExpiry.setHours(newExpiry.getHours() + 48);
            await prisma_js_1.prisma.mailbox.update({
                where: { id: mailbox.id },
                data: { webhookExpiry: newExpiry }
            });
            // Record successful renewal time for the /health endpoint
            await redis_js_1.redis.set('last-webhook-renewal', Date.now().toString());
            console.log(`[webhook-renewal] Renewed subscription for ${mailbox.emailAddress}`);
        }
        catch (err) {
            // A failed renewal means emails will stop arriving — alert loudly
            console.error(`[webhook-renewal] ⚠️ FAILED to renew subscription for ${mailbox.emailAddress}:`, err);
            Sentry.captureException(err, { extra: { mailboxId: mailbox.id, emailAddress: mailbox.emailAddress } });
            // Send alert to all admin users so the failure isn't silent
            await sendAdminAlert(`Webhook renewal FAILED for ${mailbox.emailAddress}. Emails may stop arriving. Check server logs.`, String(err)).catch(alertErr => console.error('[webhook-renewal] Failed to send admin alert:', alertErr));
        }
    }
}
async function sendAdminAlert(message, errorDetail) {
    const [admins, anyMailbox] = await Promise.all([
        prisma_js_1.prisma.user.findMany({ where: { isAdmin: true, isActive: true } }),
        prisma_js_1.prisma.mailbox.findFirst({ where: { isActive: true } }),
    ]);
    if (!anyMailbox || admins.length === 0)
        return;
    const body = [
        '[Tempus] Webhook Renewal Alert',
        '',
        message,
        '',
        `Error: ${errorDetail}`,
        '',
        'Please renew the webhook subscription manually or restart the server.',
    ].join('\n');
    await Promise.all(admins.map(admin => graph_service_js_1.graphService.sendMail(anyMailbox.emailAddress, admin.email, '[Tempus] URGENT: Webhook renewal failed', body)));
}
exports.webhookRenewalWorker = new bullmq_1.Worker(exports.WEBHOOK_RENEWAL_QUEUE, async (job) => {
    if (job.name === 'renew-all') {
        await renewAllSubscriptions();
    }
}, { connection });
// Run every 24 hours
exports.webhookRenewalQueue.add('renew-all', {}, {
    repeat: { every: 24 * 60 * 60 * 1000 }
});
console.log('[webhook-renewal] Worker started. Renewal runs every 24h.');
