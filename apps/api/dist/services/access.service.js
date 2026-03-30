"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAccessibleMailboxIds = getAccessibleMailboxIds;
exports.canAccessTicket = canAccessTicket;
exports.assertCanAccessTicket = assertCanAccessTicket;
const prisma_js_1 = require("../lib/prisma.js");
/**
 * Returns the set of mailbox IDs a user can access.
 *
 * Access is granted if:
 *   a) There is a MailboxAccess row with granteeType=USER and userId=userId, OR
 *   b) The user belongs to a group (via GroupMember) that has a MailboxAccess row
 *      with granteeType=GROUP and groupId matching.
 *
 * Admins bypass this check entirely — callers should short-circuit with isAdmin.
 */
async function getAccessibleMailboxIds(userId) {
    // Get all group IDs the user belongs to
    const groupMemberships = await prisma_js_1.prisma.groupMember.findMany({
        where: { userId },
        select: { groupId: true }
    });
    const groupIds = groupMemberships.map(m => m.groupId);
    // Find all MailboxAccess rows for this user or their groups
    const access = await prisma_js_1.prisma.mailboxAccess.findMany({
        where: {
            OR: [
                { granteeType: 'USER', userId },
                ...(groupIds.length > 0 ? [{ granteeType: 'GROUP', groupId: { in: groupIds } }] : [])
            ]
        },
        select: { mailboxId: true }
    });
    // Deduplicate
    return [...new Set(access.map(a => a.mailboxId))];
}
/**
 * Determines whether a user can access a specific ticket.
 *
 * Rules:
 * 1. Admins can access everything.
 * 2. For non-sensitive tickets: user must have access to the ticket's mailbox.
 * 3. For sensitive tickets: user must have access to the mailbox AND be in
 *    TicketSensitiveAccess, OR be an admin.
 *
 * This function only checks access — it does NOT check `deletedAt`.
 * Callers must separately ensure `deletedAt: null` in their queries.
 */
async function canAccessTicket(userId, isAdmin, ticket) {
    // Admins can see all tickets
    if (isAdmin)
        return true;
    // Get accessible mailbox IDs for this user
    const accessibleMailboxIds = await getAccessibleMailboxIds(userId);
    // User must have access to the ticket's mailbox
    if (!accessibleMailboxIds.includes(ticket.originMailboxId)) {
        return false;
    }
    // For sensitive tickets, also require explicit TicketSensitiveAccess
    if (ticket.isSensitive) {
        const explicitAccess = await prisma_js_1.prisma.ticketSensitiveAccess.findUnique({
            where: { ticketId_userId: { ticketId: ticket.id, userId } }
        });
        return explicitAccess !== null;
    }
    return true;
}
/**
 * Convenience wrapper — returns 403 response object when access is denied.
 * Returns null if access is granted (caller proceeds normally).
 */
async function assertCanAccessTicket(userId, isAdmin, ticket) {
    const allowed = await canAccessTicket(userId, isAdmin, ticket);
    if (!allowed) {
        return { error: 'Forbidden', message: 'You do not have access to this ticket' };
    }
    return null;
}
