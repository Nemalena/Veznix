import 'dotenv/config';
import { PrismaClient, TicketStatus, ArticleType, Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

async function seed() {
  const connectionString = process.env.DATABASE_URL;
  const pool = new pg.Pool({ connectionString });
  const adapter = new PrismaPg(pool as any);
  const prisma = new PrismaClient({ adapter } as Prisma.PrismaClientOptions);

  try {
    // 1. Users
    const admin = await prisma.user.upsert({
      where: { email: 'admin@tempus.ac.rs' },
      update: {},
      create: { email: 'admin@tempus.ac.rs', entraId: 'mock-admin-id', displayName: 'System Admin', isAdmin: true },
    });

    const agent = await prisma.user.upsert({
      where: { email: 'agent@tempus.ac.rs' },
      update: {},
      create: { email: 'agent@tempus.ac.rs', entraId: 'mock-agent-id', displayName: 'Support Agent', isAdmin: false },
    });

    // 2. Mailboxes (support only — legal removed)
    const support = await prisma.mailbox.upsert({
      where: { emailAddress: 'support@tempus.ac.rs' },
      update: { displayName: 'General Support', signature: '<p>Best regards,<br/><b>Tempus Support Team</b></p>' },
      create: {
        emailAddress: 'support@tempus.ac.rs',
        displayName: 'General Support',
        signature: '<p>Best regards,<br/><b>Tempus Support Team</b></p>'
      },
    });

    const hr = await prisma.mailbox.upsert({
      where: { emailAddress: 'humanres@tempus.ac.rs' },
      update: {},
      create: { emailAddress: 'humanres@tempus.ac.rs', displayName: 'Human Resources' },
    });

    // 3. Tags
    const tagBug = await prisma.tag.upsert({ where: { name: 'bug' }, create: { name: 'bug', colour: '#ef4444' }, update: {} });
    const tagUrgent = await prisma.tag.upsert({ where: { name: 'urgent' }, create: { name: 'urgent', colour: '#f97316' }, update: {} });
    const tagBilling = await prisma.tag.upsert({ where: { name: 'billing' }, create: { name: 'billing', colour: '#8b5cf6' }, update: {} });

    // 4. Tickets
    const t1 = await prisma.ticket.create({
      data: {
        subject: 'Cannot login to my account',
        status: TicketStatus.NEW,
        originMailboxId: support.id,
        externalThreadId: 'thread_mock_1',
        articles: {
          create: [{
            type: ArticleType.EMAIL_INBOUND,
            fromAddress: 'user@example.com',
            toAddress: support.emailAddress,
            bodyHtml: '<p>Hello, I am having trouble logging into my account. It keeps saying "invalid password" even after resetting. Can you help?</p>',
            bodyText: 'Hello, I am having trouble logging into my account.',
            graphMessageId: 'mock_msg_1',
          }],
        },
        events: { create: { type: 'CREATED', meta: {} } }
      },
    });

    await prisma.ticketTag.createMany({
      data: [{ ticketId: t1.id, tagId: tagBug.id }],
      skipDuplicates: true,
    });

    const t2 = await prisma.ticket.create({
      data: {
        subject: 'Invoice #12345 — Payment not processed',
        status: TicketStatus.OPEN,
        originMailboxId: support.id,
        externalThreadId: 'thread_mock_2',
        assignedToUserId: admin.id,
        firstReplyAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // replied 2h ago
        articles: {
          create: [
            {
              type: ArticleType.EMAIL_INBOUND,
              fromAddress: 'vendor@office.com',
              toAddress: support.emailAddress,
              bodyHtml: '<p>We sent invoice #12345 on March 1st, but payment has not been processed yet. Could you please look into this urgently?</p>',
              graphMessageId: 'mock_msg_2',
              createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000),
            },
            {
              type: ArticleType.EMAIL_OUTBOUND,
              sentByUserId: admin.id,
              fromAddress: support.emailAddress,
              toAddress: 'vendor@office.com',
              bodyHtml: '<p>Hi, we are currently reviewing it with the finance team. Will get back to you within 24 hours.</p><p>Best regards,<br/><b>Tempus Support Team</b></p>',
              graphMessageId: 'mock_msg_3',
              createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
            },
          ],
        },
        events: {
          createMany: {
            data: [
              { type: 'CREATED', meta: {} },
              { type: 'ASSIGNED', actorId: admin.id, meta: { userId: admin.id } },
              { type: 'REPLIED', actorId: admin.id, meta: {} },
            ]
          }
        }
      },
    });

    await prisma.ticketTag.createMany({
      data: [{ ticketId: t2.id, tagId: tagBilling.id }, { ticketId: t2.id, tagId: tagUrgent.id }],
      skipDuplicates: true,
    });

    await prisma.ticket.create({
      data: {
        subject: 'New employee onboarding — Marko Petrović',
        status: TicketStatus.PENDING,
        originMailboxId: hr.id,
        externalThreadId: 'thread_mock_3',
        assignedToUserId: agent.id,
        dueAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // due in 3 days
        articles: {
          create: [
            {
              type: ArticleType.EMAIL_INBOUND,
              fromAddress: 'manager@tempus.ac.rs',
              toAddress: hr.emailAddress,
              bodyHtml: '<p>Please initiate onboarding for Marko Petrović who starts on March 15th. He will be in the IT department.</p>',
              graphMessageId: 'mock_msg_4',
              createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
            },
            {
              type: ArticleType.INTERNAL_NOTE,
              sentByUserId: agent.id,
              bodyHtml: '<p>📋 Created AD account, waiting for equipment allocation from IT. Will follow up tomorrow.</p>',
              createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
            }
          ],
        },
        events: {
          createMany: {
            data: [
              { type: 'CREATED', meta: {} },
              { type: 'ASSIGNED', actorId: agent.id, meta: { userId: agent.id } },
              { type: 'DEADLINE_SET', actorId: agent.id, meta: { dueAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000) } },
              { type: 'NOTE_ADDED', actorId: agent.id, meta: {} },
            ]
          }
        }
      },
    });

    await prisma.ticket.create({
      data: {
        subject: 'Website down — 503 errors on main page',
        status: TicketStatus.RESOLVED,
        originMailboxId: support.id,
        externalThreadId: 'thread_mock_4',
        assignedToUserId: admin.id,
        firstReplyAt: new Date(Date.now() - 4 * 60 * 60 * 1000),
        resolvedAt: new Date(Date.now() - 1 * 60 * 60 * 1000),
        articles: {
          create: [
            {
              type: ArticleType.EMAIL_INBOUND,
              fromAddress: 'webmaster@partner.rs',
              toAddress: support.emailAddress,
              bodyHtml: '<p>Your website is returning 503 Service Unavailable errors since 10:00 AM. Please investigate urgently.</p>',
              graphMessageId: 'mock_msg_5',
              createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000),
            },
            {
              type: ArticleType.EMAIL_OUTBOUND,
              sentByUserId: admin.id,
              fromAddress: support.emailAddress,
              toAddress: 'webmaster@partner.rs',
              bodyHtml: '<p>Issue identified and resolved — a configuration change caused the outage. Service is fully restored as of 14:30.</p>',
              graphMessageId: 'mock_msg_6',
              createdAt: new Date(Date.now() - 1 * 60 * 60 * 1000),
            }
          ],
        },
        events: {
          createMany: {
            data: [
              { type: 'CREATED', meta: {} },
              { type: 'ASSIGNED', actorId: admin.id, meta: {} },
              { type: 'REPLIED', actorId: admin.id, meta: {} },
              { type: 'STATUS_CHANGED', actorId: admin.id, meta: { from: 'OPEN', to: 'RESOLVED' } },
            ]
          }
        }
      },
    });

    // 5. Canned responses
    await prisma.cannedResponse.upsert({
      where: { id: 'canned_1' },
      create: {
        id: 'canned_1',
        title: 'Acknowledgement — Looking into it',
        bodyHtml: '<p>Thank you for reaching out. We have received your message and our team is currently looking into it. We will get back to you within 24 hours.</p>',
        mailboxId: support.id,
      },
      update: {},
    });

    await prisma.cannedResponse.upsert({
      where: { id: 'canned_2' },
      create: {
        id: 'canned_2',
        title: 'Follow-up request',
        bodyHtml: '<p>Thank you for your patience. Could you please provide any additional details or screenshots that might help us resolve this faster?</p>',
      },
      update: {},
    });

    console.log('✅ Mock data seeded successfully!');
    console.log(`   Users: admin@tempus.ac.rs, agent@tempus.ac.rs`);
    console.log(`   Mailboxes: support@tempus.ac.rs, humanres@tempus.ac.rs`);
    console.log(`   Tickets: 4 (NEW, OPEN, PENDING, RESOLVED)`);
    console.log(`   Tags: bug, urgent, billing`);
    console.log(`   Canned responses: 2`);
  } catch (error) {
    console.error('Error seeding data:', error);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

seed();
