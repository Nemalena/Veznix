import { prisma } from '../lib/prisma.js'
import type { Ticket } from '@prisma/client'

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
export async function getAccessibleMailboxIds(userId: string): Promise<string[]> {
  // Get all group IDs the user belongs to
  const groupMemberships = await prisma.groupMember.findMany({
    where: { userId },
    select: { groupId: true }
  })
  const groupIds = groupMemberships.map(m => m.groupId)

  // Find all MailboxAccess rows for this user or their groups
  const access = await prisma.mailboxAccess.findMany({
    where: {
      OR: [
        { granteeType: 'USER', userId },
        ...(groupIds.length > 0 ? [{ granteeType: 'GROUP' as const, groupId: { in: groupIds } }] : [])
      ]
    },
    select: { mailboxId: true }
  })

  // Deduplicate
  return [...new Set(access.map(a => a.mailboxId))]
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
export async function canAccessTicket(
  userId: string,
  isAdmin: boolean,
  ticket: Pick<Ticket, 'id' | 'originMailboxId' | 'isSensitive'>
): Promise<boolean> {
  // Admins can see all tickets
  if (isAdmin) return true

  // Get accessible mailbox IDs for this user
  const accessibleMailboxIds = await getAccessibleMailboxIds(userId)

  // User must have access to the ticket's mailbox
  if (!accessibleMailboxIds.includes(ticket.originMailboxId)) {
    return false
  }

  // For sensitive tickets, also require explicit TicketSensitiveAccess
  if (ticket.isSensitive) {
    const explicitAccess = await prisma.ticketSensitiveAccess.findUnique({
      where: { ticketId_userId: { ticketId: ticket.id, userId } }
    })
    return explicitAccess !== null
  }

  return true
}

/**
 * Convenience wrapper — returns 403 response object when access is denied.
 * Returns null if access is granted (caller proceeds normally).
 */
export async function assertCanAccessTicket(
  userId: string,
  isAdmin: boolean,
  ticket: Pick<Ticket, 'id' | 'originMailboxId' | 'isSensitive'>
): Promise<{ error: string; message: string } | null> {
  const allowed = await canAccessTicket(userId, isAdmin, ticket)
  if (!allowed) {
    return { error: 'Forbidden', message: 'You do not have access to this ticket' }
  }
  return null
}
