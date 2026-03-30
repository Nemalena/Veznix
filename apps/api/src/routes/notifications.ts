import { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { addSseClient, removeSseClient } from '../lib/sse.js';

export async function notificationRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticate);

  /**
   * GET /api/notifications/stream
   * Server-Sent Events endpoint — stays open, pushes events in real-time.
   * Client reconnects automatically via EventSource.
   */
  fastify.get('/stream', async (request, reply) => {
    const userId = (request as any).user.id;

    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.setHeader('Access-Control-Allow-Origin', request.headers.origin || '*');
    reply.raw.setHeader('Access-Control-Allow-Credentials', 'true');
    reply.raw.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
    reply.raw.flushHeaders();

    // Send initial keepalive so client knows the connection is open
    reply.raw.write(': connected\n\n');

    // Register this connection
    addSseClient(userId, reply);

    // Keepalive ping every 30s to prevent proxy timeouts
    const keepalive = setInterval(() => {
      try {
        reply.raw.write(': ping\n\n');
      } catch {
        clearInterval(keepalive);
      }
    }, 30_000);

    // Clean up when client disconnects
    request.raw.on('close', () => {
      clearInterval(keepalive);
      removeSseClient(userId, reply);
    });

    // Don't resolve the handler — keep the stream open
    await new Promise<void>(resolve => request.raw.on('close', resolve));
  });

  /**
   * GET /api/notifications?unreadOnly=true&cursor=<id>&limit=50
   * Returns the current user's notifications with cursor-based pagination.
   */
  fastify.get('/', async (request, reply) => {
    const userId = (request as any).user.id;
    const { unreadOnly, cursor, limit } = request.query as {
      unreadOnly?: string;
      cursor?: string;
      limit?: string;
    };

    const take = Math.min(Number(limit) || 50, 100); // cap at 100

    const notifications = await prisma.notification.findMany({
      where: {
        recipientUserId: userId,
        ...(unreadOnly === 'true' ? { isRead: false } : {})
      },
      orderBy: { createdAt: 'desc' },
      take: take + 1, // fetch one extra to detect if there's a next page
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        ticket: { select: { id: true, subject: true } }
      }
    });

    const hasMore = notifications.length > take;
    const items = hasMore ? notifications.slice(0, take) : notifications;
    const nextCursor = hasMore ? items[items.length - 1].id : null;

    return { data: items, nextCursor, hasMore };
  });

  /**
   * GET /api/notifications/unread-count
   */
  fastify.get('/unread-count', async (request) => {
    const userId = (request as any).user.id;
    const count = await prisma.notification.count({
      where: { recipientUserId: userId, isRead: false }
    });
    return { count };
  });

  /**
   * PATCH /api/notifications/:id/read
   */
  fastify.patch('/:id/read', async (request, reply) => {
    const userId = (request as any).user.id;
    const { id } = request.params as { id: string };

    await prisma.notification.updateMany({
      where: { id, recipientUserId: userId },
      data: { isRead: true }
    });

    return { success: true };
  });

  /**
   * POST /api/notifications/mark-all-read
   */
  fastify.post('/mark-all-read', async (request) => {
    const userId = (request as any).user.id;
    await prisma.notification.updateMany({
      where: { recipientUserId: userId, isRead: false },
      data: { isRead: true }
    });
    return { success: true };
  });
}
