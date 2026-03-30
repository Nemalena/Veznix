import { Queue, Worker, Job } from 'bullmq';
import { prisma } from '../lib/prisma.js';
import { graphService } from '../services/graph.service.js';
import { mailService } from '../services/mail.service.js';

const connection = {
  url: process.env.REDIS_URL || 'redis://localhost:6379'
};

export const MAILBOX_POLL_QUEUE = 'mailbox-poll';

export const mailboxPollQueue = new Queue(MAILBOX_POLL_QUEUE, {
  connection,
});

/**
 * The actual work function for polling all mailboxes.
 */
export async function pollAllMailboxes() {
  const mailboxes = await prisma.mailbox.findMany({
    where: { isActive: true }
  });

  for (const mailbox of mailboxes) {
    console.log(`Polling mailbox: ${mailbox.emailAddress}`);
    try {
      const { messages, nextDeltaLink } = await graphService.fetchMessagesDelta(
        mailbox.emailAddress,
        mailbox.deltaLink || undefined
      );

      if (messages.length > 0) {
        await mailService.processMessages(mailbox.id, mailbox.emailAddress, messages);
      }

      if (nextDeltaLink) {
        await prisma.mailbox.update({
          where: { id: mailbox.id },
          data: { deltaLink: nextDeltaLink }
        });
      }
    } catch (error) {
      console.error(`Failed to poll mailbox ${mailbox.emailAddress}:`, error);
    }
  }
}

/**
 * Worker setup
 */
export const mailboxPollWorker = new Worker(
  MAILBOX_POLL_QUEUE,
  async (job: Job) => {
    if (job.name === 'poll-all') {
      await pollAllMailboxes();
    } else if (job.name === 'poll-single') {
      const { mailboxEmail } = job.data;
      await pollSingleMailbox(mailboxEmail);
    }
  },
  { connection }
);

export async function pollSingleMailbox(email: string) {
  const mailbox = await prisma.mailbox.findUnique({
    where: { emailAddress: email }
  });

  if (!mailbox || !mailbox.isActive) return;

  try {
    const { messages, nextDeltaLink } = await graphService.fetchMessagesDelta(
      mailbox.emailAddress,
      mailbox.deltaLink || undefined
    );

    if (messages.length > 0) {
      await mailService.processMessages(mailbox.id, mailbox.emailAddress, messages);
    }

    if (nextDeltaLink) {
      await prisma.mailbox.update({
        where: { id: mailbox.id },
        data: { deltaLink: nextDeltaLink }
      });
    }
  } catch (error) {
    console.error(`Failed to poll single mailbox ${email}:`, error);
  }
}

// Schedule a recurring job if this is the only instance
// In a real production setup, you might move this to a dedicated "scheduler" block
mailboxPollQueue.add('poll-all', {}, {
  repeat: {
    every: 5 * 60 * 1000 // Every 5 minutes
  }
});
