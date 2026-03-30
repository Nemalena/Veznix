import { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { graphService } from '../services/graph.service.js';
import { getAccessibleMailboxIds } from '../services/access.service.js';
import { mailService } from '../services/mail.service.js';

export async function searchRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticate);

  /**
   * Historical Search — queries Microsoft Graph directly.
   * Scoped to mailboxes the user has access to.
   */
  fastify.get('/historical', async (request, reply) => {
    const user = (request as any).user;
    const { q, mailboxId } = request.query as { q: string; mailboxId?: string };

    if (!q) {
      return reply.status(400).send({ error: 'Search query (q) is required' });
    }

    // 1. Determine which mailboxes to search
    let mailboxIds: string[] = [];

    if (user.isAdmin) {
      if (mailboxId) {
        mailboxIds = [mailboxId];
      } else {
        const allMailboxes = await prisma.mailbox.findMany({ 
          where: { isActive: true },
          select: { id: true } 
        });
        mailboxIds = allMailboxes.map(m => m.id);
      }
    } else {
      const accessibleIds = await getAccessibleMailboxIds(user.id);
      if (mailboxId) {
        if (!accessibleIds.includes(mailboxId)) {
          return reply.status(403).send({ error: 'Forbidden', message: 'You do not have access to this mailbox' });
        }
        mailboxIds = [mailboxId];
      } else {
        mailboxIds = accessibleIds;
      }
    }

    if (mailboxIds.length === 0) {
      return [];
    }

    // 2. Fetch mailbox details (emails) to call Graph
    const mailboxes = await prisma.mailbox.findMany({
      where: { id: { in: mailboxIds }, isActive: true },
      select: { id: true, emailAddress: true, displayName: true }
    });

    // 3. Search in parallel across selected mailboxes
    const results = await Promise.all(
      mailboxes.map(async (m) => {
        try {
          const messages = await graphService.searchMessages(m.emailAddress, q);
          return messages.map(msg => ({
            ...msg,
            mailbox: {
              id: m.id,
              displayName: m.displayName,
              emailAddress: m.emailAddress
            }
          }));
        } catch (err) {
          console.error(`[search] Failed to search mailbox ${m.emailAddress}:`, err);
          return [];
        }
      })
    );

    const flatResults = results.flat();

    // 4. Enrich with import status
    const messageIds = flatResults.map(msg => msg.id);
    const existingArticles = await prisma.ticketArticle.findMany({
      where: { graphMessageId: { in: messageIds as string[] } },
      select: { graphMessageId: true, ticketId: true }
    });

    const statusMap = new Map(existingArticles.map(a => [a.graphMessageId, a.ticketId]));

    const enrichedResults = flatResults.map(msg => ({
      ...msg,
      isImported: msg.id ? statusMap.has(msg.id) : false,
      ticketId: msg.id ? statusMap.get(msg.id) : undefined
    }));

    // Sort by date descending
    enrichedResults.sort((a, b) => {
      const dateA = new Date(a.receivedDateTime || 0).getTime();
      const dateB = new Date(b.receivedDateTime || 0).getTime();
      return dateB - dateA;
    });

    return enrichedResults;
  });

  /**
   * Check if a Graph message is already imported as a ticket.
   * Helps UI show "Already imported" or "Import now" buttons.
   */
  fastify.get('/check-imported', async (request, reply) => {
    const { graphMessageId } = request.query as { graphMessageId: string };
    if (!graphMessageId) return { imported: false };

    const article = await prisma.ticketArticle.findUnique({
      where: { graphMessageId },
      select: { ticketId: true }
    });

    return {
      imported: !!article,
      ticketId: article?.ticketId
    };
  });

  /**
   * Import a message from Graph.
   */
  fastify.post('/import', async (request, reply) => {
    const user = (request as any).user;
    const { graphMessageId, mailboxId } = request.body as { graphMessageId: string; mailboxId: string };

    if (!graphMessageId || !mailboxId) {
      return reply.status(400).send({ error: 'graphMessageId and mailboxId are required' });
    }

    // 1. Access check
    if (!user.isAdmin) {
      const accessible = await getAccessibleMailboxIds(user.id);
      if (!accessible.includes(mailboxId)) {
        return reply.status(403).send({ error: 'Forbidden' });
      }
    }

    // 2. Get mailbox details
    const mailbox = await prisma.mailbox.findUnique({ where: { id: mailboxId } });
    if (!mailbox) return reply.status(404).send({ error: 'Mailbox not found' });

    // 3. Fetch from Graph
    try {
      const message = await graphService.getMessage(mailbox.emailAddress, graphMessageId);
      
      // 4. Ingest
      await mailService.ingestMessage(mailbox.id, mailbox.emailAddress, message);

      // 5. Find the new ticket ID
      const article = await prisma.ticketArticle.findUnique({
        where: { graphMessageId },
        select: { ticketId: true }
      });

      return { ticketId: article?.ticketId };
    } catch (err: any) {
      console.error(`[import] Failed to import message ${graphMessageId}:`, err);
      return reply.status(500).send({ error: 'Import failed', message: err.message });
    }
  });
}
