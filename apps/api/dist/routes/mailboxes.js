"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.mailboxRoutes = mailboxRoutes;
const prisma_js_1 = require("../lib/prisma.js");
const auth_js_1 = require("../middleware/auth.js");
const sanitize_js_1 = require("../lib/sanitize.js");
const sanitize_html_1 = __importDefault(require("sanitize-html"));
const SIGNATURE_ALLOWED_HTML = sanitize_js_1.SIGNATURE_HTML_OPTIONS;
async function mailboxRoutes(fastify) {
    fastify.addHook('preHandler', auth_js_1.authenticate);
    /** List all mailboxes — non-admins only see mailboxes they are granted access to */
    fastify.get('/', async (request, reply) => {
        const user = request.user;
        const where = {};
        if (!user.isAdmin) {
            const { getAccessibleMailboxIds } = await import('../services/access.service.js');
            const accessibleMailboxIds = await getAccessibleMailboxIds(user.id);
            where.id = { in: accessibleMailboxIds };
        }
        return prisma_js_1.prisma.mailbox.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                emailAddress: true,
                displayName: true,
                isActive: true,
                graphMailboxId: true,
                signature: true,
                createdAt: true,
                _count: { select: { tickets: true } }
                // webhookSubscriptionId, webhookExpiry, deltaLink intentionally omitted
            }
        });
    });
    /** Get a single mailbox */
    fastify.get('/:id', async (request, reply) => {
        const { id } = request.params;
        const mailbox = await prisma_js_1.prisma.mailbox.findUnique({ where: { id } });
        if (!mailbox)
            return reply.status(404).send({ error: 'Mailbox not found' });
        return mailbox;
    });
    /** Create a new mailbox — admin only */
    fastify.post('/', async (request, reply) => {
        if (!request.user?.isAdmin) {
            return reply.status(403).send({ error: 'Forbidden', message: 'Only admins can create mailboxes' });
        }
        const { emailAddress, displayName, isActive } = request.body;
        if (!emailAddress || !displayName) {
            return reply.status(400).send({ error: 'emailAddress and displayName are required' });
        }
        const existing = await prisma_js_1.prisma.mailbox.findUnique({ where: { emailAddress } });
        if (existing)
            return reply.status(400).send({ error: 'Email address already registered' });
        return prisma_js_1.prisma.mailbox.create({
            data: { emailAddress, displayName, isActive: isActive ?? true }
        });
    });
    /**
     * Update a mailbox — admin only
     * Signature is sanitized server-side with sanitize-html before storing.
     */
    fastify.patch('/:id', async (request, reply) => {
        if (!request.user?.isAdmin) {
            return reply.status(403).send({ error: 'Forbidden', message: 'Only admins can update mailboxes' });
        }
        const { id } = request.params;
        const { emailAddress, displayName, isActive, graphMailboxId, signature } = request.body;
        const data = {};
        if (emailAddress !== undefined)
            data.emailAddress = emailAddress;
        if (displayName !== undefined)
            data.displayName = displayName;
        if (isActive !== undefined)
            data.isActive = isActive;
        if (graphMailboxId !== undefined)
            data.graphMailboxId = graphMailboxId;
        if (signature !== undefined) {
            // Sanitize HTML on write (server-side) — DOMPurify is browser-only
            data.signature = signature ? (0, sanitize_html_1.default)(signature, SIGNATURE_ALLOWED_HTML) : null;
        }
        return prisma_js_1.prisma.mailbox.update({ where: { id }, data });
    });
    /** Delete a mailbox (admin only; only if no non-deleted tickets) */
    fastify.delete('/:id', async (request, reply) => {
        if (!request.user?.isAdmin) {
            return reply.status(403).send({ error: 'Forbidden', message: 'Only admins can delete mailboxes' });
        }
        const { id } = request.params;
        // Exclude soft-deleted tickets from the guard — they no longer count
        const ticketCount = await prisma_js_1.prisma.ticket.count({
            where: { originMailboxId: id, deletedAt: null }
        });
        if (ticketCount > 0) {
            return reply.status(400).send({ error: 'Cannot delete mailbox with active tickets. Deactivate it instead.' });
        }
        await prisma_js_1.prisma.mailbox.delete({ where: { id } });
        return { success: true };
    });
    // ─────────────────────────────────────────────────────────────
    // Mailbox Access Management (admin only)
    // ─────────────────────────────────────────────────────────────
    /**
     * GET /api/mailboxes/:id/access
     * Returns all access grants for a mailbox.
     */
    fastify.get('/:id/access', async (request, reply) => {
        if (!request.user?.isAdmin) {
            return reply.status(403).send({ error: 'Forbidden', message: 'Admin only' });
        }
        const { id } = request.params;
        const mailbox = await prisma_js_1.prisma.mailbox.findUnique({ where: { id } });
        if (!mailbox)
            return reply.status(404).send({ error: 'Mailbox not found' });
        return prisma_js_1.prisma.mailboxAccess.findMany({
            where: { mailboxId: id },
            include: {
                user: { select: { id: true, displayName: true, email: true } },
                group: { select: { id: true, name: true, displayName: true } }
            }
        });
    });
    /**
     * POST /api/mailboxes/:id/access
     * Grant access to a user or group.
     * Body: { userId } OR { groupId }
     */
    fastify.post('/:id/access', async (request, reply) => {
        if (!request.user?.isAdmin) {
            return reply.status(403).send({ error: 'Forbidden', message: 'Admin only' });
        }
        const { id: mailboxId } = request.params;
        const { userId, groupId } = request.body;
        if (!userId && !groupId) {
            return reply.status(400).send({ error: 'Either userId or groupId is required' });
        }
        if (userId && groupId) {
            return reply.status(400).send({ error: 'Provide either userId or groupId, not both' });
        }
        const mailbox = await prisma_js_1.prisma.mailbox.findUnique({ where: { id: mailboxId } });
        if (!mailbox)
            return reply.status(404).send({ error: 'Mailbox not found' });
        const granteeType = userId ? 'USER' : 'GROUP';
        const grant = await prisma_js_1.prisma.mailboxAccess.create({
            data: { mailboxId, granteeType, userId, groupId }
        }).catch((e) => {
            if (e.code === 'P2002')
                throw Object.assign(new Error('Access already granted'), { statusCode: 409 });
            throw e;
        });
        return reply.status(201).send(grant);
    });
    /**
     * DELETE /api/mailboxes/:id/access/:grantId
     * Revoke a specific access grant.
     */
    fastify.delete('/:id/access/:grantId', async (request, reply) => {
        if (!request.user?.isAdmin) {
            return reply.status(403).send({ error: 'Forbidden', message: 'Admin only' });
        }
        const { id: mailboxId, grantId } = request.params;
        await prisma_js_1.prisma.mailboxAccess.delete({
            where: { id: grantId, mailboxId }
        }).catch(() => { });
        return { success: true };
    });
}
