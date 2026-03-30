"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.statsRoutes = statsRoutes;
const prisma_js_1 = require("../lib/prisma.js");
const auth_js_1 = require("../middleware/auth.js");
const client_1 = require("@prisma/client");
async function statsRoutes(fastify) {
    fastify.addHook('preHandler', auth_js_1.authenticate);
    fastify.get('/', async (request, reply) => {
        const { startDate, endDate } = request.query;
        const start = startDate ? new Date(startDate) : undefined;
        const end = endDate ? new Date(endDate) : undefined;
        // Default to last 30 days if no range provided, just for the "recent" metrics like avgResponse/activeAgents
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const baseWhere = { deletedAt: null };
        if (start || end) {
            baseWhere.createdAt = {};
            if (start)
                baseWhere.createdAt.gte = start;
            if (end)
                baseWhere.createdAt.lte = end;
        }
        const [total, open, resolved, pending, avgResult, activeAgentsResult] = await Promise.all([
            prisma_js_1.prisma.ticket.count({ where: baseWhere }),
            prisma_js_1.prisma.ticket.count({ where: { ...baseWhere, status: client_1.TicketStatus.OPEN } }),
            prisma_js_1.prisma.ticket.count({ where: { ...baseWhere, status: client_1.TicketStatus.RESOLVED } }),
            prisma_js_1.prisma.ticket.count({ where: { ...baseWhere, status: client_1.TicketStatus.PENDING } }),
            // Average first response time (hours) in the time window (or last 30 days if no window)
            start && end
                ? prisma_js_1.prisma.$queryRaw `
            SELECT AVG(EXTRACT(EPOCH FROM ("firstReplyAt" - "createdAt")) / 3600) AS avg_hours
            FROM "Ticket"
            WHERE "firstReplyAt" IS NOT NULL
              AND "createdAt" >= ${start}
              AND "createdAt" <= ${end}
              AND "deletedAt" IS NULL
          `
                : prisma_js_1.prisma.$queryRaw `
            SELECT AVG(EXTRACT(EPOCH FROM ("firstReplyAt" - "createdAt")) / 3600) AS avg_hours
            FROM "Ticket"
            WHERE "firstReplyAt" IS NOT NULL
              AND "createdAt" > ${thirtyDaysAgo}
              AND "deletedAt" IS NULL
          `,
            // Distinct agents who sent at least one reply in the time window (or last 30 days)
            prisma_js_1.prisma.ticketArticle.findMany({
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
