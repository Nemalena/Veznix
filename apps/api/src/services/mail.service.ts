import { Message } from '@microsoft/microsoft-graph-types';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { prisma } from '../lib/prisma.js';
import { ArticleType, TicketStatus, Ticket } from '@prisma/client';
import { recordEvent } from './ticket-events.service.js';
import { notifyNewTicket, notifyAssigned } from './notification.service.js';
import { graphService } from './graph.service.js';
import { evaluateAssignmentRules } from '../routes/assignment-rules.js';

/** 25MB — matches Exchange/Graph limit */
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

const ATTACHMENTS_ROOT = '/data/attachments';

const BLOCKED_EXTENSIONS = new Set([
  '.exe', '.bat', '.cmd', '.sh', '.ps1', '.msi', '.vbs',
  '.scr', '.hta', '.com', '.pif', '.cpl', '.msc',
  '.docm', '.xlsm', '.pptm'
]);

// Checks ALL segments — catches double extensions like .exe.jpg
function isAttachmentSafe(filename: string): boolean {
  const parts = filename.toLowerCase().split('.');
  return !parts.some(part => BLOCKED_EXTENSIONS.has('.' + part));
}

export class MailService {
  /**
   * Processes a batch of Graph messages for a specific mailbox.
   */
  async processMessages(mailboxId: string, mailboxEmail: string, messages: Message[]) {
    for (const msg of messages) {
      await this.ingestMessage(mailboxId, mailboxEmail, msg);
    }
  }

  /**
   * Ingests a single message from Graph.
   * Handles deduplication, thread grouping, attachments, and new-ticket notifications.
   */
  public async ingestMessage(mailboxId: string, mailboxEmail: string, msg: Message) {
    if (!msg.id) return;

    // Dedup: bail early if we've already processed this message
    const existingArticle = await prisma.ticketArticle.findUnique({
      where: { graphMessageId: msg.id }
    });
    if (existingArticle) return;

    // Extract In-Reply-To header (RFC 2822 — survives subject line edits)
    let inReplyToId: string | undefined;
    if (msg.internetMessageHeaders) {
      const header = msg.internetMessageHeaders.find(
        (h) => h.name?.toLowerCase() === 'in-reply-to'
      );
      if (header?.value) {
        inReplyToId = header.value.replace(/[<>]/g, '');
      }
    }

    let ticket: Ticket | null = null;
    let isNewTicket = false;

    // Layer 1: conversationId
    if (msg.conversationId) {
      ticket = await prisma.ticket.findFirst({
        where: { externalThreadId: msg.conversationId, deletedAt: null }
      });
    }

    // Layer 2: In-Reply-To header
    if (!ticket && inReplyToId) {
      const parent = await prisma.ticketArticle.findUnique({
        where: { graphMessageId: inReplyToId }
      });
      if (parent) {
        ticket = await prisma.ticket.findUnique({ where: { id: parent.ticketId } });
      }
    }

    // Layer 3: New ticket
    if (!ticket) {
      isNewTicket = true;
      ticket = await prisma.ticket.create({
        data: {
          subject: msg.subject || '(No Subject)',
          externalThreadId: msg.conversationId,
          inReplyToId: inReplyToId,
          originMailboxId: mailboxId,
          status: TicketStatus.NEW,
        }
      });
      await recordEvent(ticket.id, null, 'CREATED', {});

      // Auto-assignment: evaluate rules, apply first match
      const match = await evaluateAssignmentRules(
        mailboxId,
        ticket.subject,
        msg.from?.emailAddress?.address ?? ''
      );
      if (match?.assignToUserId) {
        await prisma.ticket.update({
          where: { id: ticket.id },
          data: { assignedToUserId: match.assignToUserId }
        });
        await recordEvent(ticket.id, null, 'RULE_AUTO_ASSIGNED', { userId: match.assignToUserId });
        notifyAssigned(ticket.id, match.assignToUserId).catch(() => {});
      }

      // SLA: evaluate rules, auto-set dueAt on first match
      const slaRules = await prisma.slaRule.findMany({
        where: { mailboxId, isActive: true },
        orderBy: { priority: 'asc' },
      });
      const senderEmail = msg.from?.emailAddress?.address ?? '';
      const subject = ticket.subject;
      for (const rule of slaRules) {
        const cond = rule.conditions as Record<string, string>;
        let matched = false;
        if (cond.subjectContains && subject.toLowerCase().includes(cond.subjectContains.toLowerCase())) matched = true;
        if (cond.senderDomain && senderEmail.split('@')[1]?.toLowerCase() === cond.senderDomain.toLowerCase()) matched = true;
        if (cond.senderEmail && senderEmail.toLowerCase() === cond.senderEmail.toLowerCase()) matched = true;
        if (matched) {
          const dueAt = new Date(ticket.createdAt.getTime() + rule.responseHours * 3_600_000);
          await prisma.ticket.update({ where: { id: ticket.id }, data: { dueAt } });
          await recordEvent(ticket.id, null, 'DEADLINE_SET', { dueAt: dueAt.toISOString(), slaRuleId: rule.id });
          break; // first match wins
        }
      }
    } else {
      // Reopen resolved ticket; update timestamp
      await prisma.ticket.update({
        where: { id: ticket.id },
        data: {
          updatedAt: new Date(),
          status: ticket.status === TicketStatus.RESOLVED ? TicketStatus.OPEN : ticket.status,
        }
      });
    }

    // Create article — catch P2002 in case of parallel polling
    try {
      const article = await prisma.ticketArticle.create({
        data: {
          ticketId: ticket.id,
          type: ArticleType.EMAIL_INBOUND,
          fromAddress: msg.from?.emailAddress?.address,
          toAddress: msg.toRecipients?.[0]?.emailAddress?.address,
          bodyHtml: msg.body?.content,
          bodyText: msg.body?.contentType === 'text' ? msg.body.content : undefined,
          graphMessageId: msg.id,
          createdAt: msg.receivedDateTime ? new Date(msg.receivedDateTime) : new Date(),
        }
      });

      // Process attachments
      if (msg.hasAttachments && msg.attachments) {
        for (const attachment of msg.attachments) {
          if (!attachment.id) continue;
          const sizeBytes: number = (attachment as any).size || 0;
          const filename = attachment.name || 'unnamed';

          if (!isAttachmentSafe(filename)) continue;
          if (sizeBytes > MAX_ATTACHMENT_BYTES) {
            console.warn(`[mail] Skipping oversized attachment "${filename}" (${sizeBytes} bytes) on msg ${msg.id}`);
            continue;
          }

          const storagePath = path.join(ATTACHMENTS_ROOT, article.id, filename);

          await prisma.attachment.create({
            data: {
              articleId: article.id,
              filename,
              mimeType: attachment.contentType || 'application/octet-stream',
              sizeBytes,
              storagePath,
            }
          });

          // Fetch binary from Graph and write to disk
          try {
            const content = await graphService.fetchAttachment(mailboxEmail, msg.id!, attachment.id);
            await mkdir(path.dirname(storagePath), { recursive: true });
            await writeFile(storagePath, content);
          } catch (err) {
            console.error(`[mail] Failed to save attachment "${filename}" for article ${article.id}:`, err);
          }
        }
      }
    } catch (e: any) {
      if (e.code === 'P2002') {
        console.warn(`[mail] Already processed message ${msg.id}, skipping...`);
        return;
      }
      throw e;
    }

    // Notify users/groups with access to this mailbox — fire-and-forget
    if (isNewTicket) {
      notifyNewTicket(ticket.id, mailboxId).catch(err =>
        console.error(`[mail] Failed to send new ticket notifications for ticket ${ticket!.id}:`, err)
      );
    }
  }
}

export const mailService = new MailService();
