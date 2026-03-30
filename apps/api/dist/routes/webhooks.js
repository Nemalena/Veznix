"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.webhookRoutes = webhookRoutes;
const mailbox_poll_job_js_1 = require("../jobs/mailbox-poll.job.js");
async function webhookRoutes(fastify) {
    /**
     * MS Graph Webhook Receiver
     */
    fastify.post('/graph', async (request, reply) => {
        // 1. Validation for subscription creation (initial handshake)
        const { validationToken } = request.query;
        if (validationToken) {
            return reply.type('text/plain').status(200).send(validationToken);
        }
        // 2. Notification handling
        const payload = request.body;
        const notifications = payload.value || [];
        for (const notification of notifications) {
            if (notification.clientState !== process.env.WEBHOOK_SECRET) {
                fastify.log.warn('Invalid webhook clientState received');
                continue;
            }
            // Instead of processing the whole payload (which lacks the body usually),
            // we just trigger a poll for that specific mailbox.
            // The resource is usually: "users/{id}/mailFolders/Inbox/messages/{msgId}"
            const resource = notification.resource;
            const mailboxEmailMatch = resource.match(/users\/([^\/]+)\//);
            if (mailboxEmailMatch && mailboxEmailMatch[1]) {
                const mailboxEmail = mailboxEmailMatch[1];
                fastify.log.info(`Webhook received for ${mailboxEmail}. Triggering poll.`);
                // Add to queue to process immediately
                await mailbox_poll_job_js_1.mailboxPollQueue.add('poll-single', { mailboxEmail });
            }
        }
        // Graph expects a 202 Accepted
        return reply.status(202).send();
    });
}
