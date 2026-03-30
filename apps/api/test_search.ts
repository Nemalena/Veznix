import { PrismaClient, Prisma } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  try {
    const search = 'test';
    const where: any = { deletedAt: null, isSensitive: false };
    
    where.AND = [
      {
        OR: [
          { subject: { contains: search, mode: 'insensitive' } },
          { articles: { some: {
            bodyText: { contains: search, mode: 'insensitive' }
          } } },
          { articles: { some: {
            bodyHtml: { contains: search, mode: 'insensitive' }
          } } }
        ]
      }
    ];

    const tickets = await prisma.ticket.findMany({
      where,
      take: 8,
      orderBy: { updatedAt: 'desc' },
      include: {
        originMailbox: { select: { emailAddress: true, displayName: true } },
        assignedTo: { select: { id: true, displayName: true, avatarUrl: true } },
        assignedToGroup: { select: { id: true, displayName: true, name: true } },
        tags: { include: { tag: true } }
      }
    });

    console.log(`Found ${tickets.length} tickets:`);
    for (const t of tickets) {
      console.log(`- ID: ${t.id}, Subject: ${t.subject}, MergedInto: ${t.mergedIntoId}`);
    }
  } catch (e: any) {
    console.error("error:", e.message, e);
  }
}
main().finally(() => { prisma.$disconnect(); pool.end(); });
