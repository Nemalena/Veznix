import { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';

export async function slaRuleRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticate);

  /**
   * GET /api/mailboxes/:id/sla-rules
   * List all SLA rules for a mailbox — admin only.
   */
  fastify.get('/:mailboxId/sla-rules', async (request, reply) => {
    if (!(request as any).user?.isAdmin) {
      return reply.status(403).send({ error: 'Forbidden', message: 'Admin only' });
    }
    const { mailboxId } = request.params as { mailboxId: string };

    const mailbox = await prisma.mailbox.findUnique({ where: { id: mailboxId } });
    if (!mailbox) return reply.status(404).send({ error: 'Mailbox not found' });

    return prisma.slaRule.findMany({
      where: { mailboxId },
      orderBy: { priority: 'asc' },
    });
  });

  /**
   * POST /api/mailboxes/:id/sla-rules
   * Create an SLA rule — admin only.
   * Body: { priority?, conditions, responseHours, isActive? }
   */
  fastify.post('/:mailboxId/sla-rules', async (request, reply) => {
    if (!(request as any).user?.isAdmin) {
      return reply.status(403).send({ error: 'Forbidden', message: 'Admin only' });
    }
    const { mailboxId } = request.params as { mailboxId: string };
    const { priority, conditions, responseHours, isActive } = request.body as {
      priority?: number;
      conditions: Record<string, string>;
      responseHours: number;
      isActive?: boolean;
    };

    if (!conditions || typeof responseHours !== 'number' || responseHours <= 0) {
      return reply.status(400).send({ error: 'conditions and a positive responseHours are required' });
    }

    const mailbox = await prisma.mailbox.findUnique({ where: { id: mailboxId } });
    if (!mailbox) return reply.status(404).send({ error: 'Mailbox not found' });

    const rule = await prisma.slaRule.create({
      data: {
        mailboxId,
        priority: priority ?? 0,
        conditions,
        responseHours,
        isActive: isActive ?? true,
      },
    });

    return reply.status(201).send(rule);
  });

  /**
   * PATCH /api/mailboxes/:id/sla-rules/:ruleId
   * Update an SLA rule — admin only.
   */
  fastify.patch('/:mailboxId/sla-rules/:ruleId', async (request, reply) => {
    if (!(request as any).user?.isAdmin) {
      return reply.status(403).send({ error: 'Forbidden', message: 'Admin only' });
    }
    const { mailboxId, ruleId } = request.params as { mailboxId: string; ruleId: string };
    const { priority, conditions, responseHours, isActive } = request.body as any;

    const rule = await prisma.slaRule.findUnique({ where: { id: ruleId } });
    if (!rule || rule.mailboxId !== mailboxId) {
      return reply.status(404).send({ error: 'SLA rule not found' });
    }

    const data: any = {};
    if (priority !== undefined) data.priority = priority;
    if (conditions !== undefined) data.conditions = conditions;
    if (responseHours !== undefined) data.responseHours = responseHours;
    if (isActive !== undefined) data.isActive = isActive;

    return prisma.slaRule.update({ where: { id: ruleId }, data });
  });

  /**
   * DELETE /api/mailboxes/:id/sla-rules/:ruleId
   * Delete an SLA rule — admin only.
   */
  fastify.delete('/:mailboxId/sla-rules/:ruleId', async (request, reply) => {
    if (!(request as any).user?.isAdmin) {
      return reply.status(403).send({ error: 'Forbidden', message: 'Admin only' });
    }
    const { mailboxId, ruleId } = request.params as { mailboxId: string; ruleId: string };

    const rule = await prisma.slaRule.findUnique({ where: { id: ruleId } });
    if (!rule || rule.mailboxId !== mailboxId) {
      return reply.status(404).send({ error: 'SLA rule not found' });
    }

    await prisma.slaRule.delete({ where: { id: ruleId } });
    return { success: true };
  });
}
