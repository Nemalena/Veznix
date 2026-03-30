import { Queue, Worker, Job } from 'bullmq';
import * as Sentry from '@sentry/node';
import { prisma } from '../lib/prisma.js';
import { redis } from '../lib/redis.js';
import { graphService } from '../services/graph.service.js';

const connection = {
  url: process.env.REDIS_URL || 'redis://localhost:6379'
};

export const WEBHOOK_RENEWAL_QUEUE = 'webhook-renewal';

export const webhookRenewalQueue = new Queue(WEBHOOK_RENEWAL_QUEUE, { connection });

/**
 * Renews all active webhook subscriptions expiring within the next 24h.
 * Records the last successful renewal time in Redis for the /health endpoint.
 * Sends an admin alert email on failure — webhook expiry is completely silent otherwise.
 */
async function renewAllSubscriptions() {
  const soon = new Date();
  soon.setHours(soon.getHours() + 24);

  const mailboxes = await prisma.mailbox.findMany({
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
      await graphService.renewSubscription(mailbox.webhookSubscriptionId!);

      // Update expiry in DB (Graph extends by ~48h from now)
      const newExpiry = new Date();
      newExpiry.setHours(newExpiry.getHours() + 48);
      await prisma.mailbox.update({
        where: { id: mailbox.id },
        data: { webhookExpiry: newExpiry }
      });

      // Record successful renewal time for the /health endpoint
      await redis.set('last-webhook-renewal', Date.now().toString());

      console.log(`[webhook-renewal] Renewed subscription for ${mailbox.emailAddress}`);
    } catch (err) {
      // A failed renewal means emails will stop arriving — alert loudly
      console.error(`[webhook-renewal] ⚠️ FAILED to renew subscription for ${mailbox.emailAddress}:`, err);
      Sentry.captureException(err, { extra: { mailboxId: mailbox.id, emailAddress: mailbox.emailAddress } });

      // Send alert to all admin users so the failure isn't silent
      await sendAdminAlert(
        `Webhook renewal FAILED for ${mailbox.emailAddress}. Emails may stop arriving. Check server logs.`,
        String(err)
      ).catch(alertErr =>
        console.error('[webhook-renewal] Failed to send admin alert:', alertErr)
      );
    }
  }
}

async function sendAdminAlert(message: string, errorDetail: string) {
  const [admins, anyMailbox] = await Promise.all([
    prisma.user.findMany({ where: { isAdmin: true, isActive: true } }),
    prisma.mailbox.findFirst({ where: { isActive: true } }),
  ]);

  if (!anyMailbox || admins.length === 0) return;

  const body = [
    '[Tempus] Webhook Renewal Alert',
    '',
    message,
    '',
    `Error: ${errorDetail}`,
    '',
    'Please renew the webhook subscription manually or restart the server.',
  ].join('\n');

  await Promise.all(
    admins.map(admin =>
      graphService.sendMail(
        anyMailbox.emailAddress,
        admin.email,
        '[Tempus] URGENT: Webhook renewal failed',
        body
      )
    )
  );
}

export const webhookRenewalWorker = new Worker(
  WEBHOOK_RENEWAL_QUEUE,
  async (job: Job) => {
    if (job.name === 'renew-all') {
      await renewAllSubscriptions();
    }
  },
  { connection }
);

// Run every 24 hours
webhookRenewalQueue.add('renew-all', {}, {
  repeat: { every: 24 * 60 * 60 * 1000 }
});

console.log('[webhook-renewal] Worker started. Renewal runs every 24h.');
