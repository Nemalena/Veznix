import { Queue, Worker, Job } from 'bullmq';
import * as Sentry from '@sentry/node';
import { prisma } from '../lib/prisma.js';
import { notifyOverdue } from '../services/notification.service.js';
import { recordEvent } from '../services/ticket-events.service.js';

const connection = { url: process.env.REDIS_URL || 'redis://localhost:6379' };

export const OVERDUE_CHECK_QUEUE = 'overdue-check';

export const overdueCheckQueue = new Queue(OVERDUE_CHECK_QUEUE, { connection });

async function checkOverdueTickets() {
  const overdue = await prisma.ticket.findMany({
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
      await recordEvent(ticket.id, null, 'OVERDUE_NOTIFIED', {}, { critical: true });

      // Notify assigned agent (null = no assignee, notification service handles gracefully)
      await notifyOverdue(ticket.id, ticket.assignedToUserId);
    } catch (err) {
      Sentry.captureException(err, { extra: { ticketId: ticket.id } });
      console.error(`[overdue-check] Failed for ticket ${ticket.id}:`, err);
    }
  }
}

export const overdueCheckWorker = new Worker(
  OVERDUE_CHECK_QUEUE,
  async (_job: Job) => { await checkOverdueTickets(); },
  { connection }
);

// Run every hour
overdueCheckQueue.add('check', {}, {
  repeat: { every: 60 * 60 * 1000 }
});

console.log('[overdue-check] Worker started. Runs every hour.');
