import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { mailboxPollQueue } from '../jobs/mailbox-poll.job.js';

export async function webhookRoutes(fastify: FastifyInstance) {
  /**
   * MS Graph Webhook Receiver
   */
  fastify.post('/graph', async (request: FastifyRequest, reply: FastifyReply) => {
    // 1. Validation for subscription creation (initial handshake)
    const { validationToken } = request.query as { validationToken?: string };
    if (validationToken) {
      return reply.type('text/plain').status(200).send(validationToken);
    }

    // 2. Notification handling
    const payload = request.body as any;
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
        await mailboxPollQueue.add('poll-single', { mailboxEmail });
      }
    }

    // Graph expects a 202 Accepted
    return reply.status(202).send();
  });
}
