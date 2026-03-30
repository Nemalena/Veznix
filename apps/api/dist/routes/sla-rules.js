"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.slaRuleRoutes = slaRuleRoutes;
const prisma_js_1 = require("../lib/prisma.js");
const auth_js_1 = require("../middleware/auth.js");
async function slaRuleRoutes(fastify) {
    fastify.addHook('preHandler', auth_js_1.authenticate);
    /**
     * GET /api/mailboxes/:id/sla-rules
     * List all SLA rules for a mailbox — admin only.
     */
    fastify.get('/:mailboxId/sla-rules', async (request, reply) => {
        if (!request.user?.isAdmin) {
            return reply.status(403).send({ error: 'Forbidden', message: 'Admin only' });
        }
        const { mailboxId } = request.params;
        const mailbox = await prisma_js_1.prisma.mailbox.findUnique({ where: { id: mailboxId } });
        if (!mailbox)
            return reply.status(404).send({ error: 'Mailbox not found' });
        return prisma_js_1.prisma.slaRule.findMany({
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
        if (!request.user?.isAdmin) {
            return reply.status(403).send({ error: 'Forbidden', message: 'Admin only' });
        }
        const { mailboxId } = request.params;
        const { priority, conditions, responseHours, isActive } = request.body;
        if (!conditions || typeof responseHours !== 'number' || responseHours <= 0) {
            return reply.status(400).send({ error: 'conditions and a positive responseHours are required' });
        }
        const mailbox = await prisma_js_1.prisma.mailbox.findUnique({ where: { id: mailboxId } });
        if (!mailbox)
            return reply.status(404).send({ error: 'Mailbox not found' });
        const rule = await prisma_js_1.prisma.slaRule.create({
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
        if (!request.user?.isAdmin) {
            return reply.status(403).send({ error: 'Forbidden', message: 'Admin only' });
        }
        const { mailboxId, ruleId } = request.params;
        const { priority, conditions, responseHours, isActive } = request.body;
        const rule = await prisma_js_1.prisma.slaRule.findUnique({ where: { id: ruleId } });
        if (!rule || rule.mailboxId !== mailboxId) {
            return reply.status(404).send({ error: 'SLA rule not found' });
        }
        const data = {};
        if (priority !== undefined)
            data.priority = priority;
        if (conditions !== undefined)
            data.conditions = conditions;
        if (responseHours !== undefined)
            data.responseHours = responseHours;
        if (isActive !== undefined)
            data.isActive = isActive;
        return prisma_js_1.prisma.slaRule.update({ where: { id: ruleId }, data });
    });
    /**
     * DELETE /api/mailboxes/:id/sla-rules/:ruleId
     * Delete an SLA rule — admin only.
     */
    fastify.delete('/:mailboxId/sla-rules/:ruleId', async (request, reply) => {
        if (!request.user?.isAdmin) {
            return reply.status(403).send({ error: 'Forbidden', message: 'Admin only' });
        }
        const { mailboxId, ruleId } = request.params;
        const rule = await prisma_js_1.prisma.slaRule.findUnique({ where: { id: ruleId } });
        if (!rule || rule.mailboxId !== mailboxId) {
            return reply.status(404).send({ error: 'SLA rule not found' });
        }
        await prisma_js_1.prisma.slaRule.delete({ where: { id: ruleId } });
        return { success: true };
    });
}
