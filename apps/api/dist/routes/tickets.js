"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ticketRoutes = ticketRoutes;
const prisma_js_1 = require("../lib/prisma.js");
const auth_js_1 = require("../middleware/auth.js");
const client_1 = require("@prisma/client");
const graph_service_js_1 = require("../services/graph.service.js");
const ticket_events_service_js_1 = require("../services/ticket-events.service.js");
const notification_service_js_1 = require("../services/notification.service.js");
const access_service_js_1 = require("../services/access.service.js");
const cleanup_service_js_1 = require("../services/cleanup.service.js");
const sanitize_js_1 = require("../lib/sanitize.js");
/** 20MB cumulative limit for outgoing attachments — conservative below Graph's 25MB message cap */
const MAX_OUTGOING_TOTAL_BYTES = 20 * 1024 * 1024;
function validateOutgoingAttachments(attachments) {
    const total = attachments.reduce((sum, a) => sum + a.sizeBytes, 0);
    if (total > MAX_OUTGOING_TOTAL_BYTES) {
        const mb = (total / (1024 * 1024)).toFixed(1);
        throw new Error(`Total attachment size (${mb} MB) exceeds the 20 MB limit for outgoing email.`);
    }
}
const TAG_NAME_REGEX = /^[a-z0-9-]{1,50}$/;
const ALLOWED_STATUSES = new Set(Object.values(client_1.TicketStatus));
async function ticketRoutes(fastify) {
    fastify.addHook('preHandler', auth_js_1.authenticate);
    /**
     * Create a new agent-initiated outbound email ticket.
     * POST /api/tickets/new-outbound
     * Body: { subject, to: string[], cc?: string[], bodyHtml, fromMailboxId }
     */
    fastify.post('/new-outbound', async (request, reply) => {
        const user = request.user;
        const { subject, to, cc, bcc, bodyHtml, fromMailboxId } = request.body;
        if (!subject?.trim() || !to?.length || !bodyHtml?.trim() || !fromMailboxId) {
            return reply.status(400).send({ error: 'subject, to, bodyHtml, and fromMailboxId are required' });
        }
        const fromMailbox = await prisma_js_1.prisma.mailbox.findUnique({ where: { id: fromMailboxId } });
        if (!fromMailbox)
            return reply.status(404).send({ error: 'Mailbox not found' });
        const cleanBody = (0, sanitize_js_1.sanitize)(bodyHtml, sanitize_js_1.RICH_HTML_OPTIONS);
        const signature = fromMailbox.signature ? `<br/><br/>${fromMailbox.signature}` : '';
        const fullBody = cleanBody + signature;
        // Create the ticket record
        const ticket = await prisma_js_1.prisma.ticket.create({
            data: {
                subject: subject.trim(),
                originMailboxId: fromMailboxId,
                assignedToUserId: user.id,
                status: client_1.TicketStatus.OPEN,
            }
        });
        // Create the outbound article
        const article = await prisma_js_1.prisma.ticketArticle.create({
            data: {
                ticketId: ticket.id,
                type: client_1.ArticleType.EMAIL_OUTBOUND,
                fromAddress: fromMailbox.emailAddress,
                toAddress: to.join(', '),
                ccAddresses: cc?.length ? cc.join(', ') : null,
                bccAddresses: bcc?.length ? bcc.join(', ') : null,
                sentFromMailboxId: fromMailboxId,
                sentByUserId: user.id,
                bodyHtml: fullBody,
            }
        });
        // Send via Graph — fire and handle errors gracefully
        try {
            await graph_service_js_1.graphService.sendNewEmail(fromMailbox.emailAddress, to, cc ?? [], subject.trim(), fullBody, bcc?.length ? bcc : undefined);
        }
        catch (err) {
            console.error('[new-outbound] Graph send failed — ticket created but email NOT sent:', err);
            // Don't fail the request — ticket is created, agent can retry
        }
        await prisma_js_1.prisma.ticket.update({
            where: { id: ticket.id },
            data: { firstReplyAt: new Date(), updatedAt: new Date() }
        });
        await (0, ticket_events_service_js_1.recordEvent)(ticket.id, user.id, 'REPLIED', { articleId: article.id });
        return { id: ticket.id };
    });
    /**
     * List tickets with filtering and pagination.
     * Non-admins only see tickets from their accessible mailboxes.
     * Sensitive tickets are hidden from this listing (viewed by direct URL only).
     */
    fastify.get('/', async (request, reply) => {
        const user = request.user;
        const { status, mailboxId, assignedToId, tagId, page = 1, limit = 20, search } = request.query;
        const skip = (Number(page) - 1) * Number(limit);
        const take = Number(limit);
        const where = { deletedAt: null, isSensitive: false };
        // Access control: non-admins only see their accessible mailboxes
        if (!user.isAdmin) {
            const accessibleMailboxIds = await (0, access_service_js_1.getAccessibleMailboxIds)(user.id);
            where.originMailboxId = { in: accessibleMailboxIds };
        }
        if (status && status !== 'ALL')
            where.status = status;
        // Extra mailbox filter (must be within already-accessible ones)
        if (mailboxId) {
            if (!user.isAdmin) {
                // Only allow filtering if this mailbox is already in the accessible set
                const accessible = where.originMailboxId?.in ?? [];
                if (!accessible.includes(mailboxId)) {
                    return { data: [], total: 0, page: Number(page), limit: Number(limit) };
                }
            }
            where.originMailboxId = mailboxId;
        }
        if (assignedToId)
            where.assignedToUserId = assignedToId;
        if (tagId)
            where.tags = { some: { tagId } };
        if (search) {
            where.OR = [
                { subject: { contains: search, mode: 'insensitive' } },
                { articles: { some: { bodyText: { contains: search, mode: 'insensitive' } } } }
            ];
        }
        const [tickets, total] = await Promise.all([
            prisma_js_1.prisma.ticket.findMany({
                where,
                skip,
                take,
                orderBy: { updatedAt: 'desc' },
                include: {
                    originMailbox: {
                        select: { emailAddress: true, displayName: true }
                    },
                    assignedTo: {
                        select: { id: true, displayName: true, avatarUrl: true }
                    },
                    assignedToGroup: {
                        select: { id: true, displayName: true, name: true }
                    },
                    tags: {
                        include: { tag: true }
                    }
                }
            }),
            prisma_js_1.prisma.ticket.count({ where })
        ]);
        return { data: tickets, total, page: Number(page), limit: Number(limit) };
    });
    /**
     * GET /api/tickets/sent-emails — list all outbound articles from accessible mailboxes.
     * Used for the "Sent" mailbox view.
     */
    fastify.get('/sent-emails', async (request) => {
        const user = request.user;
        const { mailboxId, page = 1, limit = 25 } = request.query;
        const skip = (Number(page) - 1) * Number(limit);
        const take = Number(limit);
        const where = { type: client_1.ArticleType.EMAIL_OUTBOUND };
        if (!user.isAdmin) {
            const accessibleMailboxIds = await (0, access_service_js_1.getAccessibleMailboxIds)(user.id);
            where.sentFromMailboxId = { in: accessibleMailboxIds };
        }
        if (mailboxId) {
            where.sentFromMailboxId = mailboxId;
        }
        const [articles, total] = await Promise.all([
            prisma_js_1.prisma.ticketArticle.findMany({
                where,
                skip,
                take,
                orderBy: { createdAt: 'desc' },
                include: {
                    ticket: { select: { id: true, subject: true, status: true } },
                    sentFromMailbox: { select: { id: true, displayName: true, emailAddress: true } },
                    sentBy: { select: { id: true, displayName: true } },
                },
            }),
            prisma_js_1.prisma.ticketArticle.count({ where }),
        ]);
        return { data: articles, total, page: Number(page), limit: Number(limit) };
    });
    /**
     * Get ticket details with thread (articles + events).
     * Enforces access control including sensitive ticket restrictions.
     */
    fastify.get('/:id', async (request, reply) => {
        const user = request.user;
        const { id } = request.params;
        const ticket = await prisma_js_1.prisma.ticket.findUnique({
            where: { id, deletedAt: null },
            include: {
                originMailbox: true,
                assignedTo: {
                    select: { id: true, displayName: true, email: true, avatarUrl: true }
                },
                assignedToGroup: {
                    select: { id: true, displayName: true, name: true }
                },
                articles: {
                    orderBy: { createdAt: 'asc' },
                    include: {
                        sentBy: { select: { displayName: true, avatarUrl: true } },
                        attachments: true
                    }
                },
                events: {
                    orderBy: { createdAt: 'asc' },
                    include: {
                        actor: { select: { id: true, displayName: true } }
                    }
                },
                tags: {
                    include: { tag: true }
                },
                sensitiveAccess: {
                    include: {
                        user: { select: { id: true, displayName: true, email: true } }
                    }
                }
            }
        });
        if (!ticket) {
            return reply.status(404).send({ error: 'Ticket not found' });
        }
        const denied = await (0, access_service_js_1.assertCanAccessTicket)(user.id, user.isAdmin, ticket);
        if (denied)
            return reply.status(403).send(denied);
        return ticket;
    });
    /**
     * Update ticket — status, assignee, deadline, sensitivity (admin only for isSensitive).
     */
    fastify.patch('/:id', async (request, reply) => {
        const user = request.user;
        const { id } = request.params;
        const { status, assignedToUserId, assignedToGroupId, dueAt, isSensitive } = request.body;
        const actorId = user.id;
        const current = await prisma_js_1.prisma.ticket.findUnique({ where: { id, deletedAt: null } });
        if (!current)
            return reply.status(404).send({ error: 'Ticket not found' });
        const denied = await (0, access_service_js_1.assertCanAccessTicket)(user.id, user.isAdmin, current);
        if (denied)
            return reply.status(403).send(denied);
        // Only admins can change sensitivity
        if (isSensitive !== undefined && !user.isAdmin) {
            return reply.status(403).send({ error: 'Forbidden', message: 'Only admins can change ticket sensitivity' });
        }
        const data = { updatedAt: new Date() };
        if (status !== undefined) {
            if (!ALLOWED_STATUSES.has(status)) {
                return reply.status(400).send({ error: `Invalid status: ${status}` });
            }
            data.status = status;
            if (status === client_1.TicketStatus.RESOLVED && !current.resolvedAt) {
                data.resolvedAt = new Date();
            }
        }
        if (assignedToUserId !== undefined) {
            data.assignedToUserId = assignedToUserId;
            if (assignedToUserId)
                data.assignedToGroupId = null; // Clear group when assigned to user
        }
        if (assignedToGroupId !== undefined) {
            data.assignedToGroupId = assignedToGroupId;
            if (assignedToGroupId)
                data.assignedToUserId = null; // Clear user when assigned to group
        }
        if (dueAt !== undefined) {
            data.dueAt = dueAt ? new Date(dueAt) : null;
        }
        if (isSensitive !== undefined) {
            data.isSensitive = isSensitive;
        }
        const updated = await prisma_js_1.prisma.ticket.update({ where: { id }, data });
        // Record events for significant changes
        if (status !== undefined && status !== current.status) {
            await (0, ticket_events_service_js_1.recordEvent)(id, actorId, 'STATUS_CHANGED', { from: current.status, to: status });
        }
        if (assignedToUserId !== undefined && assignedToUserId !== current.assignedToUserId) {
            await (0, ticket_events_service_js_1.recordEvent)(id, actorId, assignedToUserId ? 'ASSIGNED' : 'UNASSIGNED', { userId: assignedToUserId });
            if (assignedToUserId)
                await (0, notification_service_js_1.notifyAssigned)(id, assignedToUserId);
        }
        if (assignedToGroupId !== undefined && assignedToGroupId !== current.assignedToGroupId) {
            await (0, ticket_events_service_js_1.recordEvent)(id, actorId, assignedToGroupId ? 'ASSIGNED' : 'UNASSIGNED', { groupId: assignedToGroupId });
            // TODO: Notify group members if needed
        }
        if (dueAt !== undefined) {
            await (0, ticket_events_service_js_1.recordEvent)(id, actorId, dueAt ? 'DEADLINE_SET' : 'DEADLINE_CLEARED', dueAt ? { dueAt } : {});
        }
        if (isSensitive !== undefined && isSensitive !== current.isSensitive) {
            await (0, ticket_events_service_js_1.recordEvent)(id, actorId, isSensitive ? 'MARKED_SENSITIVE' : 'SENSITIVITY_REMOVED', {});
        }
        return updated;
    });
    /**
     * Send a reply via Microsoft Graph (EMAIL_OUTBOUND)
     * POST /api/tickets/:id/reply
     */
    fastify.post('/:id/reply', async (request, reply) => {
        const user = request.user;
        const { id } = request.params;
        const { bodyHtml, fromMailboxId, mentionedUserIds, cc, bcc } = request.body;
        const actorId = user.id;
        if (!bodyHtml || !fromMailboxId) {
            return reply.status(400).send({ error: 'bodyHtml and fromMailboxId are required' });
        }
        const ticket = await prisma_js_1.prisma.ticket.findUnique({
            where: { id, deletedAt: null },
            include: {
                articles: {
                    where: { type: client_1.ArticleType.EMAIL_INBOUND },
                    orderBy: { createdAt: 'asc' },
                    take: 1
                },
                originMailbox: true
            }
        });
        if (!ticket)
            return reply.status(404).send({ error: 'Ticket not found' });
        const denied = await (0, access_service_js_1.assertCanAccessTicket)(user.id, user.isAdmin, ticket);
        if (denied)
            return reply.status(403).send(denied);
        const fromMailbox = await prisma_js_1.prisma.mailbox.findUnique({ where: { id: fromMailboxId } });
        if (!fromMailbox)
            return reply.status(404).send({ error: 'Mailbox not found' });
        validateOutgoingAttachments([]);
        // The client (rich-text editor) includes the signature already — do not append it again.
        const storedBody = (0, sanitize_js_1.sanitize)(bodyHtml);
        const originalMsg = ticket.articles[0];
        const toAddress = originalMsg?.fromAddress ?? '';
        if (!toAddress) {
            return reply.status(400).send({ error: 'Cannot reply: no inbound fromAddress found on this ticket. The original message may be missing.' });
        }
        const replyToMessageId = originalMsg?.graphMessageId ?? undefined;
        await graph_service_js_1.graphService.sendReply(fromMailbox.emailAddress, toAddress, ticket.subject, storedBody, replyToMessageId, cc?.length ? cc : undefined, bcc?.length ? bcc : undefined);
        const article = await prisma_js_1.prisma.ticketArticle.create({
            data: {
                ticketId: id,
                type: client_1.ArticleType.EMAIL_OUTBOUND,
                fromAddress: fromMailbox.emailAddress,
                toAddress,
                ccAddresses: cc?.length ? cc.join(', ') : null,
                bccAddresses: bcc?.length ? bcc.join(', ') : null,
                sentFromMailboxId: fromMailboxId,
                sentByUserId: actorId,
                bodyHtml: storedBody,
            }
        });
        const now = new Date();
        await prisma_js_1.prisma.ticket.update({
            where: { id },
            data: {
                firstReplyAt: ticket.firstReplyAt ?? now,
                status: ticket.status === client_1.TicketStatus.NEW ? client_1.TicketStatus.OPEN : ticket.status,
                updatedAt: now
            }
        });
        await (0, ticket_events_service_js_1.recordEvent)(id, actorId, 'REPLIED', { articleId: article.id });
        await (0, notification_service_js_1.notifyReplied)(id, actorId, article.id);
        if (mentionedUserIds?.length) {
            await (0, notification_service_js_1.notifyMentioned)(id, article.id, mentionedUserIds, actorId);
        }
        return article;
    });
    /**
     * Add an internal note
     * POST /api/tickets/:id/notes
     */
    fastify.post('/:id/notes', async (request, reply) => {
        const user = request.user;
        const { id } = request.params;
        const { bodyHtml, mentionedUserIds } = request.body;
        const actorId = user.id;
        const ticket = await prisma_js_1.prisma.ticket.findUnique({ where: { id, deletedAt: null } });
        if (!ticket)
            return reply.status(404).send({ error: 'Ticket not found' });
        const denied = await (0, access_service_js_1.assertCanAccessTicket)(user.id, user.isAdmin, ticket);
        if (denied)
            return reply.status(403).send(denied);
        const article = await prisma_js_1.prisma.ticketArticle.create({
            data: {
                ticketId: id,
                type: client_1.ArticleType.INTERNAL_NOTE,
                sentByUserId: actorId,
                bodyHtml: (0, sanitize_js_1.sanitize)(bodyHtml), // Sanitize on write — same as reply endpoint
            }
        });
        await prisma_js_1.prisma.ticket.update({ where: { id }, data: { updatedAt: new Date() } });
        await (0, ticket_events_service_js_1.recordEvent)(id, actorId, 'NOTE_ADDED', { articleId: article.id });
        if (mentionedUserIds?.length) {
            await (0, notification_service_js_1.notifyMentioned)(id, article.id, mentionedUserIds, actorId);
        }
        return article;
    });
    /**
     * Tags — add or remove a tag on a ticket
     */
    fastify.post('/:id/tags', async (request, reply) => {
        const user = request.user;
        const { id } = request.params;
        const { name, colour } = request.body;
        const actorId = user.id;
        if (!TAG_NAME_REGEX.test(name)) {
            return reply.status(400).send({ error: 'Tag name must be lowercase alphanumeric with hyphens, max 50 chars' });
        }
        const ticket = await prisma_js_1.prisma.ticket.findUnique({ where: { id, deletedAt: null } });
        if (!ticket)
            return reply.status(404).send({ error: 'Ticket not found' });
        const denied = await (0, access_service_js_1.assertCanAccessTicket)(user.id, user.isAdmin, ticket);
        if (denied)
            return reply.status(403).send(denied);
        const tag = await prisma_js_1.prisma.tag.upsert({
            where: { name },
            create: { name, colour: colour ?? '#6366f1' },
            update: {}
        });
        await prisma_js_1.prisma.ticketTag.upsert({
            where: { ticketId_tagId: { ticketId: id, tagId: tag.id } },
            create: { ticketId: id, tagId: tag.id },
            update: {}
        });
        await (0, ticket_events_service_js_1.recordEvent)(id, actorId, 'TAG_ADDED', { tagId: tag.id, tagName: name });
        return tag;
    });
    fastify.delete('/:id/tags/:tagId', async (request, reply) => {
        const user = request.user;
        const { id, tagId } = request.params;
        const actorId = user.id;
        const ticket = await prisma_js_1.prisma.ticket.findUnique({ where: { id, deletedAt: null } });
        if (!ticket)
            return reply.status(404).send({ error: 'Ticket not found' });
        const denied = await (0, access_service_js_1.assertCanAccessTicket)(user.id, user.isAdmin, ticket);
        if (denied)
            return reply.status(403).send(denied);
        // Only record the event if the tag was actually attached (P2025 = record not found)
        let deleted = false;
        try {
            await prisma_js_1.prisma.ticketTag.delete({ where: { ticketId_tagId: { ticketId: id, tagId } } });
            deleted = true;
        }
        catch (e) {
            if (e.code !== 'P2025')
                throw e; // unexpected error — rethrow
        }
        if (deleted) {
            await (0, ticket_events_service_js_1.recordEvent)(id, actorId, 'TAG_REMOVED', { tagId });
        }
        return { success: true };
    });
    /**
     * Delete a ticket.
     * - Normal tickets: soft delete (sets deletedAt).
     * - Sensitive tickets: hard delete — cleans disk files, writes DELETED event, then removes the row.
     * Admin only.
     */
    fastify.delete('/:id', async (request, reply) => {
        const user = request.user;
        const { id } = request.params;
        const actorId = user.id;
        if (!user.isAdmin) {
            return reply.status(403).send({ error: 'Forbidden', message: 'Only admins can delete tickets' });
        }
        const ticket = await prisma_js_1.prisma.ticket.findUnique({
            where: { id, deletedAt: null },
            include: {
                articles: {
                    select: { id: true }
                }
            }
        });
        if (!ticket)
            return reply.status(404).send({ error: 'Ticket not found' });
        if (ticket.isSensitive) {
            // Hard delete: clean disk files first, then DB row (Prisma cascade handles articles/attachments rows)
            const articleIds = ticket.articles.map(a => a.id);
            await (0, cleanup_service_js_1.cleanupTicketAttachments)(articleIds);
            await (0, ticket_events_service_js_1.recordEvent)(id, actorId, 'DELETED', { permanent: true });
            await prisma_js_1.prisma.ticket.delete({ where: { id } });
        }
        else {
            // Soft delete
            await prisma_js_1.prisma.ticket.update({
                where: { id },
                data: { deletedAt: new Date() }
            });
            await (0, ticket_events_service_js_1.recordEvent)(id, actorId, 'DELETED', { permanent: false });
        }
        return { success: true };
    });
    /**
     * Sensitive ticket access management (admin only)
     * GET    /api/tickets/:id/sensitive-access
     * POST   /api/tickets/:id/sensitive-access  { userId }
     * DELETE /api/tickets/:id/sensitive-access/:userId
     */
    fastify.get('/:id/sensitive-access', async (request, reply) => {
        const user = request.user;
        const { id } = request.params;
        if (!user.isAdmin) {
            return reply.status(403).send({ error: 'Forbidden', message: 'Admin only' });
        }
        const ticket = await prisma_js_1.prisma.ticket.findUnique({ where: { id } });
        if (!ticket)
            return reply.status(404).send({ error: 'Ticket not found' });
        if (!ticket.isSensitive)
            return reply.status(400).send({ error: 'Ticket is not sensitive' });
        const access = await prisma_js_1.prisma.ticketSensitiveAccess.findMany({
            where: { ticketId: id },
            include: { user: { select: { id: true, displayName: true, email: true } } }
        });
        return access;
    });
    fastify.post('/:id/sensitive-access', async (request, reply) => {
        const user = request.user;
        const { id } = request.params;
        const { userId } = request.body;
        if (!user.isAdmin) {
            return reply.status(403).send({ error: 'Forbidden', message: 'Admin only' });
        }
        const ticket = await prisma_js_1.prisma.ticket.findUnique({ where: { id } });
        if (!ticket)
            return reply.status(404).send({ error: 'Ticket not found' });
        if (!ticket.isSensitive)
            return reply.status(400).send({ error: 'Ticket is not sensitive' });
        const grant = await prisma_js_1.prisma.ticketSensitiveAccess.upsert({
            where: { ticketId_userId: { ticketId: id, userId } },
            create: { ticketId: id, userId },
            update: {}
        });
        return grant;
    });
    fastify.delete('/:id/sensitive-access/:userId', async (request, reply) => {
        const user = request.user;
        const { id, userId } = request.params;
        if (!user.isAdmin) {
            return reply.status(403).send({ error: 'Forbidden', message: 'Admin only' });
        }
        await prisma_js_1.prisma.ticketSensitiveAccess.delete({
            where: { ticketId_userId: { ticketId: id, userId } }
        }).catch(() => { });
        return { success: true };
    });
    /**
     * Merge a ticket into another ticket.
     * POST /api/tickets/:id/merge
     * Body: { targetTicketId: string }
     *
     * - Source articles are re-pointed to the target ticket.
     * - Source is resolved and marked with mergedIntoId.
     * - MERGED_INTO event on source; MERGE_SOURCE event on target.
     * - Sensitive and already-merged tickets cannot be sources.
     */
    fastify.post('/:id/merge', async (request, reply) => {
        const user = request.user;
        const { id: sourceId } = request.params;
        const { targetTicketId } = request.body;
        if (!targetTicketId) {
            return reply.status(400).send({ error: 'targetTicketId is required' });
        }
        if (sourceId === targetTicketId) {
            return reply.status(400).send({ error: 'Cannot merge a ticket into itself' });
        }
        // Load both tickets
        const [source, target] = await Promise.all([
            prisma_js_1.prisma.ticket.findUnique({ where: { id: sourceId, deletedAt: null } }),
            prisma_js_1.prisma.ticket.findUnique({ where: { id: targetTicketId, deletedAt: null } }),
        ]);
        if (!source)
            return reply.status(404).send({ error: 'Source ticket not found' });
        if (!target)
            return reply.status(404).send({ error: 'Target ticket not found' });
        // Access checks on both
        const sourceDenied = await (0, access_service_js_1.assertCanAccessTicket)(user.id, user.isAdmin, source);
        if (sourceDenied)
            return reply.status(403).send(sourceDenied);
        const targetDenied = await (0, access_service_js_1.assertCanAccessTicket)(user.id, user.isAdmin, target);
        if (targetDenied)
            return reply.status(403).send(targetDenied);
        if (source.isSensitive) {
            return reply.status(400).send({ error: 'Sensitive tickets cannot be merged' });
        }
        if (source.mergedIntoId) {
            return reply.status(400).send({ error: 'This ticket has already been merged' });
        }
        const now = new Date();
        await prisma_js_1.prisma.$transaction([
            // Re-point all source articles to the target ticket
            prisma_js_1.prisma.ticketArticle.updateMany({
                where: { ticketId: sourceId },
                data: { ticketId: targetTicketId },
            }),
            // Resolve the source and mark it as merged
            prisma_js_1.prisma.ticket.update({
                where: { id: sourceId },
                data: {
                    mergedIntoId: targetTicketId,
                    status: client_1.TicketStatus.RESOLVED,
                    resolvedAt: source.resolvedAt ?? now,
                    updatedAt: now,
                },
            }),
            // Touch updatedAt on target so it surfaces in the list
            prisma_js_1.prisma.ticket.update({
                where: { id: targetTicketId },
                data: { updatedAt: now },
            }),
        ]);
        // Events (outside transaction — non-critical side effects)
        await (0, ticket_events_service_js_1.recordEvent)(sourceId, user.id, 'MERGED_INTO', { targetId: targetTicketId });
        await (0, ticket_events_service_js_1.recordEvent)(targetTicketId, user.id, 'MERGE_SOURCE', { sourceId });
        return { success: true };
    });
    // ── Bulk update ──────────────────────────────────────────────────────────────
    /**
     * PATCH /api/tickets/bulk
     * Body: { ids: string[], update: { status?: TicketStatus, assignedToUserId?: string | null } }
     *
     * Applies a partial update to all listed tickets in a single DB call.
     * Access: only tickets in mailboxes the caller can access are affected.
     */
    fastify.patch('/bulk', async (request, reply) => {
        const user = request.user;
        const { ids, update } = request.body;
        if (!Array.isArray(ids) || ids.length === 0) {
            return reply.status(400).send({ error: 'ids must be a non-empty array' });
        }
        if (!update || (update.status === undefined && update.assignedToUserId === undefined)) {
            return reply.status(400).send({ error: 'update must include at least one field' });
        }
        if (update.status && !ALLOWED_STATUSES.has(update.status)) {
            return reply.status(400).send({ error: 'Invalid status' });
        }
        const data = {};
        if (update.status !== undefined)
            data.status = update.status;
        if (update.assignedToUserId !== undefined)
            data.assignedToUserId = update.assignedToUserId;
        let where = { id: { in: ids }, deletedAt: null };
        if (!user.isAdmin) {
            const accessibleMailboxIds = await (0, access_service_js_1.getAccessibleMailboxIds)(user.id);
            where = { ...where, originMailboxId: { in: accessibleMailboxIds } };
        }
        const result = await prisma_js_1.prisma.ticket.updateMany({ where, data });
        return { updated: result.count };
    });
    // ── Ticket links ─────────────────────────────────────────────────────────────
    /**
     * GET /api/tickets/:id/links
     * Returns all TicketLink records where this ticket is source or target,
     * including the other side's subject and status.
     */
    fastify.get('/:id/links', async (request, reply) => {
        const user = request.user;
        const { id } = request.params;
        const ticket = await prisma_js_1.prisma.ticket.findUnique({ where: { id, deletedAt: null } });
        if (!ticket)
            return reply.status(404).send({ error: 'Ticket not found' });
        const denied = await (0, access_service_js_1.assertCanAccessTicket)(user.id, user.isAdmin, ticket);
        if (denied)
            return reply.status(403).send(denied);
        const [asSource, asTarget] = await Promise.all([
            prisma_js_1.prisma.ticketLink.findMany({
                where: { sourceTicketId: id },
                include: { targetTicket: { select: { id: true, subject: true, status: true } } },
            }),
            prisma_js_1.prisma.ticketLink.findMany({
                where: { targetTicketId: id },
                include: { sourceTicket: { select: { id: true, subject: true, status: true } } },
            }),
        ]);
        // Normalise: always return { id, linkType, ticket (the other side), direction }
        const links = [
            ...asSource.map(l => ({
                id: l.id, linkType: l.linkType, direction: 'outbound',
                ticket: l.targetTicket, createdAt: l.createdAt,
            })),
            ...asTarget.map(l => ({
                id: l.id, linkType: l.linkType, direction: 'inbound',
                ticket: l.sourceTicket, createdAt: l.createdAt,
            })),
        ];
        return links;
    });
    /**
     * POST /api/tickets/:id/links
     * Body: { targetTicketId: string, linkType: TicketLinkType }
     */
    fastify.post('/:id/links', async (request, reply) => {
        const user = request.user;
        const { id: sourceId } = request.params;
        const { targetTicketId, linkType } = request.body;
        if (!targetTicketId || !linkType) {
            return reply.status(400).send({ error: 'targetTicketId and linkType are required' });
        }
        if (!Object.values(client_1.TicketLinkType).includes(linkType)) {
            return reply.status(400).send({ error: 'Invalid linkType' });
        }
        if (sourceId === targetTicketId) {
            return reply.status(400).send({ error: 'Cannot link a ticket to itself' });
        }
        const [source, target] = await Promise.all([
            prisma_js_1.prisma.ticket.findUnique({ where: { id: sourceId, deletedAt: null } }),
            prisma_js_1.prisma.ticket.findUnique({ where: { id: targetTicketId, deletedAt: null } }),
        ]);
        if (!source)
            return reply.status(404).send({ error: 'Source ticket not found' });
        if (!target)
            return reply.status(404).send({ error: 'Target ticket not found' });
        const denied = await (0, access_service_js_1.assertCanAccessTicket)(user.id, user.isAdmin, source);
        if (denied)
            return reply.status(403).send(denied);
        const link = await prisma_js_1.prisma.ticketLink.upsert({
            where: {
                sourceTicketId_targetTicketId_linkType: {
                    sourceTicketId: sourceId,
                    targetTicketId,
                    linkType: linkType,
                },
            },
            create: {
                sourceTicketId: sourceId,
                targetTicketId,
                linkType: linkType,
            },
            update: {},
            include: { targetTicket: { select: { id: true, subject: true, status: true } } },
        });
        return link;
    });
    /**
     * DELETE /api/tickets/:id/links/:linkId
     */
    fastify.delete('/:id/links/:linkId', async (request, reply) => {
        const user = request.user;
        const { id, linkId } = request.params;
        const ticket = await prisma_js_1.prisma.ticket.findUnique({ where: { id, deletedAt: null } });
        if (!ticket)
            return reply.status(404).send({ error: 'Ticket not found' });
        const denied = await (0, access_service_js_1.assertCanAccessTicket)(user.id, user.isAdmin, ticket);
        if (denied)
            return reply.status(403).send(denied);
        await prisma_js_1.prisma.ticketLink.deleteMany({
            where: {
                id: linkId,
                OR: [{ sourceTicketId: id }, { targetTicketId: id }],
            },
        });
        return { success: true };
    });
}
