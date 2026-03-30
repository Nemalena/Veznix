import { prisma } from '../lib/prisma.js';
import { NotificationType, GranteeType } from '@prisma/client';
import { pushToUser } from '../lib/sse.js';
import { graphService } from './graph.service.js';

/**
 * Create an in-app notification and push it via SSE to online users.
 * Also sends a plain-text email notification via Graph (fire-and-forget).
 */
export async function createNotification(
  recipientUserId: string,
  type: NotificationType,
  ticketId: string,
  articleId?: string
) {
  const notification = await prisma.notification.create({
    data: { recipientUserId, type, ticketId, articleId },
    include: {
      ticket: { select: { id: true, subject: true } },
    }
  });

  // Push to SSE if user is online
  pushToUser(recipientUserId, 'notification', {
    id: notification.id,
    type,
    ticketId,
    ticketSubject: (notification as any).ticket?.subject,
    createdAt: notification.createdAt,
    isRead: false
  });

  // Plain-text email notification — fire-and-forget, never blocks main flow
  sendEmailNotification(recipientUserId, type, ticketId).catch(err =>
    console.error('[notifications] Failed to send email notification:', err)
  );

  return notification;
}

async function sendEmailNotification(
  recipientUserId: string,
  type: NotificationType,
  ticketId: string
) {
  const [user, ticket] = await Promise.all([
    prisma.user.findUnique({ where: { id: recipientUserId } }),
    prisma.ticket.findUnique({
      where: { id: ticketId },
      select: { subject: true, originMailbox: { select: { emailAddress: true } } }
    })
  ]);

  if (!user || !ticket) return;

  // Respect the user's email notification preference
  if (!user.emailNotificationsEnabled) return;

  const mailboxEmail = ticket.originMailbox?.emailAddress;
  if (!mailboxEmail) return;

  const appUrl = process.env.APP_URL || 'http://localhost:5173';

  const typeLabel: Record<NotificationType, string> = {
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

  await graphService.sendMail(mailboxEmail, user.email, subject, body);
}

/**
 * Notify all users with access to a mailbox about a new ticket.
 * Expands both direct (USER) grants and group (GROUP) grants.
 */
export async function notifyNewTicket(ticketId: string, mailboxId: string) {
  const access = await prisma.mailboxAccess.findMany({
    where: { mailboxId },
    include: {
      user: { select: { id: true } },
      group: {
        include: { members: { select: { userId: true } } }
      }
    }
  });

  const userIds = new Set<string>();
  for (const a of access) {
    if (a.granteeType === GranteeType.USER && a.userId) {
      userIds.add(a.userId);
    } else if (a.granteeType === GranteeType.GROUP && a.group) {
      for (const m of a.group.members) {
        userIds.add(m.userId);
      }
    }
  }

  await Promise.all(
    [...userIds].map(uid => createNotification(uid, NotificationType.NEW_TICKET, ticketId))
  );
}

/**
 * Notify the assigned user.
 */
export async function notifyAssigned(ticketId: string, assignedUserId: string) {
  await createNotification(assignedUserId, NotificationType.TICKET_ASSIGNED, ticketId);
}

/**
 * Notify when a ticket is replied to (inform assigned user only, excluding the sender).
 */
export async function notifyReplied(ticketId: string, actorUserId: string, articleId: string) {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: { assignedToUserId: true }
  });
  if (ticket?.assignedToUserId && ticket.assignedToUserId !== actorUserId) {
    await createNotification(ticket.assignedToUserId, NotificationType.TICKET_REPLIED, ticketId, articleId);
  }
}

/**
 * Notify all mentioned users (excluding the author).
 */
export async function notifyMentioned(
  ticketId: string,
  articleId: string,
  mentionedUserIds: string[],
  actorUserId: string
) {
  const targets = mentionedUserIds.filter(id => id !== actorUserId);
  await Promise.all(
    targets.map(uid => createNotification(uid, NotificationType.MENTIONED, ticketId, articleId))
  );
}

/**
 * Notify about an overdue ticket — called by the overdue detection job.
 */
export async function notifyOverdue(ticketId: string, assignedUserId: string | null) {
  if (!assignedUserId) return;
  await createNotification(assignedUserId, NotificationType.TICKET_OVERDUE, ticketId);
}
