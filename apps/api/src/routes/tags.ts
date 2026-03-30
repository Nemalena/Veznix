import { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';

export async function tagRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticate);

  /** List all tags */
  fastify.get('/', async () => {
    return prisma.tag.findMany({ orderBy: { name: 'asc' } });
  });
}
