"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createNotification = createNotification;
exports.notifyNewTicket = notifyNewTicket;
exports.notifyAssigned = notifyAssigned;
exports.notifyReplied = notifyReplied;
exports.notifyMentioned = notifyMentioned;
exports.notifyOverdue = notifyOverdue;
const prisma_js_1 = require("../lib/prisma.js");
const client_1 = require("@prisma/client");
const sse_js_1 = require("../lib/sse.js");
const graph_service_js_1 = require("./graph.service.js");
/**
 * Create an in-app notification and push it via SSE to online users.
 * Also sends a plain-text email notification via Graph (fire-and-forget).
 */
async function createNotification(recipientUserId, type, ticketId, articleId) {
    const notification = await prisma_js_1.prisma.notification.create({
        data: { recipientUserId, type, ticketId, articleId },
        include: {
            ticket: { select: { id: true, subject: true } },
        }
    });
    // Push to SSE if user is online
    (0, sse_js_1.pushToUser)(recipientUserId, 'notification', {
        id: notification.id,
        type,
        ticketId,
        ticketSubject: notification.ticket?.subject,
        createdAt: notification.createdAt,
        isRead: false
    });
    // Plain-text email notification — fire-and-forget, never blocks main flow
    sendEmailNotification(recipientUserId, type, ticketId).catch(err => console.error('[notifications] Failed to send email notification:', err));
    return notification;
}
async function sendEmailNotification(recipientUserId, type, ticketId) {
    const [user, ticket] = await Promise.all([
        prisma_js_1.prisma.user.findUnique({ where: { id: recipientUserId } }),
        prisma_js_1.prisma.ticket.findUnique({
            where: { id: ticketId },
            select: { subject: true, originMailbox: { select: { emailAddress: true } } }
        })
    ]);
    if (!user || !ticket)
        return;
    // Respect the user's email notification preference
    if (!user.emailNotificationsEnabled)
        return;
    const mailboxEmail = ticket.originMailbox?.emailAddress;
    if (!mailboxEmail)
        return;
    const appUrl = process.env.APP_URL || 'http://localhost:5173';
    const typeLabel = {
        TICKET_ASSIGNED: 'A ticket was assigned to you',
        MENTIONED: 'You were mentioned on a ticket',
        TICKET_REPLIED: 'A ticket you follow was replied to',
        NEW_TICKET: 'A new ticket arrived',
        TICKET_OVERDUE: 'A ticket is overdue',
    };
    const subject = `[Tempus] ${typeLabel[type]}: "${ticket.subject}"`;
    // Plain text only — no HTML, better deliverability, no sanitization needed
    const body = [
        typeLabel[type] + '.',
        '',
        `Ticket:  ${ticket.subject}`,
        `Mailbox: ${mailboxEmail}`,
        '',
        `Open ticket → ${appUrl}/tickets/${ticketId}`,
        '',
        '---',
        'You are receiving this because you were mentioned or assigned.',
        'Manage notification preferences in the app.',
    ].join('\n');
    await graph_service_js_1.graphService.sendMail(mailboxEmail, user.email, subject, body);
}
/**
 * Notify all users with access to a mailbox about a new ticket.
 * Expands both direct (USER) grants and group (GROUP) grants.
 */
async function notifyNewTicket(ticketId, mailboxId) {
    const access = await prisma_js_1.prisma.mailboxAccess.findMany({
        where: { mailboxId },
        include: {
            user: { select: { id: true } },
            group: {
                include: { members: { select: { userId: true } } }
            }
        }
    });
    const userIds = new Set();
    for (const a of access) {
        if (a.granteeType === client_1.GranteeType.USER && a.userId) {
            userIds.add(a.userId);
        }
        else if (a.granteeType === client_1.GranteeType.GROUP && a.group) {
            for (const m of a.group.members) {
                userIds.add(m.userId);
            }
        }
    }
    await Promise.all([...userIds].map(uid => createNotification(uid, client_1.NotificationType.NEW_TICKET, ticketId)));
}
/**
 * Notify the assigned user.
 */
async function notifyAssigned(ticketId, assignedUserId) {
    await createNotification(assignedUserId, client_1.NotificationType.TICKET_ASSIGNED, ticketId);
}
/**
 * Notify when a ticket is replied to (inform assigned user only, excluding the sender).
 */
async function notifyReplied(ticketId, actorUserId, articleId) {
    const ticket = await prisma_js_1.prisma.ticket.findUnique({
        where: { id: ticketId },
        select: { assignedToUserId: true }
    });
    if (ticket?.assignedToUserId && ticket.assignedToUserId !== actorUserId) {
        await createNotification(ticket.assignedToUserId, client_1.NotificationType.TICKET_REPLIED, ticketId, articleId);
    }
}
/**
 * Notify all mentioned users (excluding the author).
 */
async function notifyMentioned(ticketId, articleId, mentionedUserIds, actorUserId) {
    const targets = mentionedUserIds.filter(id => id !== actorUserId);
    await Promise.all(targets.map(uid => createNotification(uid, client_1.NotificationType.MENTIONED, ticketId, articleId)));
}
/**
 * Notify about an overdue ticket — called by the overdue detection job.
 */
async function notifyOverdue(ticketId, assignedUserId) {
    if (!assignedUserId)
        return;
    await createNotification(assignedUserId, client_1.NotificationType.TICKET_OVERDUE, ticketId);
}
