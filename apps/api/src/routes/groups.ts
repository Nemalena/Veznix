import { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';

export async function groupRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticate);

  /**
   * GET /api/groups
   * Returns a list of all groups (e.g. for access assignment dropdowns).
   */
  /** List groups with optional search */
  fastify.get('/', async (request) => {
    const { search } = request.query as { search?: string };
    return prisma.group.findMany({
      where: search ? {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { displayName: { contains: search, mode: 'insensitive' } }
        ]
      } : {},
      include: {
        _count: { select: { members: true } }
      },
      orderBy: { displayName: 'asc' }
    });
  });

  /** Get single group with members */
  fastify.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const group = await prisma.group.findUnique({
      where: { id },
      include: {
        members: { select: { userId: true } }
      }
    });
    if (!group) return reply.status(404).send({ error: 'Not found' });
    return group;
  });

  /** Create group */
  fastify.post('/', async (request, reply) => {
    const user = (request as any).user;
    if (!user.isAdmin) return reply.status(403).send({ message: 'Admin only' });

    const { name, displayName, userIds } = request.body as { name: string, displayName: string, userIds?: string[] };
    const slug = name.toLowerCase().replace(/\s+/g, '-');

    return prisma.group.create({
      data: {
        name: slug,
        displayName,
        members: userIds ? {
          create: userIds.map(id => ({ userId: id }))
        } : undefined
      }
    });
  });

  /** Update group members */
  fastify.patch('/:id', async (request, reply) => {
    const user = (request as any).user;
    if (!user.isAdmin) return reply.status(403).send({ message: 'Admin only' });

    const { id } = request.params as { id: string };
    const { displayName, userIds } = request.body as { displayName?: string, userIds?: string[] };

    return prisma.group.update({
      where: { id },
      data: {
        displayName,
        members: userIds ? {
          deleteMany: {},
          create: userIds.map(uid => ({ userId: uid }))
        } : undefined
      }
    });
  });

  /** Delete group */
  fastify.delete('/:id', async (request, reply) => {
    const user = (request as any).user;
    if (!user.isAdmin) return reply.status(403).send({ message: 'Admin only' });

    const { id } = request.params as { id: string };
    await prisma.groupMember.deleteMany({ where: { groupId: id } });
    return prisma.group.delete({ where: { id } });
  });
}
