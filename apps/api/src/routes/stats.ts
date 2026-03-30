import { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { TicketStatus } from '@prisma/client';

export async function statsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticate);

  fastify.get('/', async (request, reply) => {
    const { startDate, endDate } = request.query as { startDate?: string; endDate?: string };

    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;
    
    // Default to last 30 days if no range provided, just for the "recent" metrics like avgResponse/activeAgents
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const baseWhere: any = { deletedAt: null };
    if (start || end) {
      baseWhere.createdAt = {};
      if (start) baseWhere.createdAt.gte = start;
      if (end) baseWhere.createdAt.lte = end;
    }

    const [total, open, resolved, pending, avgResult, activeAgentsResult] = await Promise.all([
      prisma.ticket.count({ where: baseWhere }),
      prisma.ticket.count({ where: { ...baseWhere, status: TicketStatus.OPEN } }),
      prisma.ticket.count({ where: { ...baseWhere, status: TicketStatus.RESOLVED } }),
      prisma.ticket.count({ where: { ...baseWhere, status: TicketStatus.PENDING } }),
      // Average first response time (hours) in the time window (or last 30 days if no window)
      start && end 
        ? prisma.$queryRaw<{ avg_hours: number | null }[]>`
            SELECT AVG(EXTRACT(EPOCH FROM ("firstReplyAt" - "createdAt")) / 3600) AS avg_hours
            FROM "Ticket"
            WHERE "firstReplyAt" IS NOT NULL
              AND "createdAt" >= ${start}
              AND "createdAt" <= ${end}
              AND "deletedAt" IS NULL
          `
        : prisma.$queryRaw<{ avg_hours: number | null }[]>`
            SELECT AVG(EXTRACT(EPOCH FROM ("firstReplyAt" - "createdAt")) / 3600) AS avg_hours
            FROM "Ticket"
            WHERE "firstReplyAt" IS NOT NULL
              AND "createdAt" > ${thirtyDaysAgo}
              AND "deletedAt" IS NULL
          `,
      // Distinct agents who sent at least one reply in the time window (or last 30 days)
      prisma.ticketArticle.findMany({
        where: {
          type: 'EMAIL_OUTBOUND',
          createdAt: { 
            gte: start ?? thirtyDaysAgo,
            lte: end ?? undefined
          },
          sentByUserId: { not: null },
        },
        select: { sentByUserId: true },
        distinct: ['sentByUserId'],
      }),
    ]);

    const avgHours = avgResult[0]?.avg_hours;

    return {
      total,
      open,
      resolved,
      pending,
      avgResponseTime: avgHours != null ? `${Number(avgHours).toFixed(1)}h` : null,
      activeAgents: activeAgentsResult.length,
    };
  });
}
