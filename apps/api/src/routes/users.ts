import { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';

export async function userRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticate);

  /**
   * GET /api/users?search=xxx
   * Returns matching users (all active users if no search provided).
   * Used by @mention autocomplete and assignee dropdowns.
   */
  fastify.get('/', async (request) => {
    const { search } = request.query as { search?: string };

    const where: any = { isActive: true };

    if (search && search.trim().length > 0) {
      where.OR = [
        { displayName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } }
      ];
    }

    return prisma.user.findMany({
      where,
      select: { id: true, displayName: true, email: true, avatarUrl: true },
      orderBy: { displayName: 'asc' },
      take: 50,
    });
  });

  /**
   * GET /api/users/me — current user's profile including notification prefs
   */
  fastify.get('/me', async (request) => {
    const userId = (request as any).user.id;
    return prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, displayName: true, email: true, avatarUrl: true, emailNotificationsEnabled: true, signature: true, isAdmin: true }
    });
  });

  /**
   * PATCH /api/users/me/preferences — toggle email notifications
   */
  fastify.patch('/me/preferences', async (request, reply) => {
    const userId = (request as any).user.id;
    const { emailNotificationsEnabled, signature } = request.body as { emailNotificationsEnabled?: boolean, signature?: string };

    const data: any = {};
    if (typeof emailNotificationsEnabled === 'boolean') {
      data.emailNotificationsEnabled = emailNotificationsEnabled;
    }
    if (typeof signature === 'string') {
      data.signature = signature;
    }

    if (Object.keys(data).length === 0) {
      return reply.status(400).send({ error: 'No valid preference fields provided' });
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data,
      select: { id: true, emailNotificationsEnabled: true, signature: true }
    });

    return updated;
  });

  /**
   * GET /api/users/all — list all users (admin only)
   */
  fastify.get('/all', async (request, reply) => {
    const actor = (request as any).user;
    if (!actor.isAdmin) {
      return reply.status(403).send({ error: 'Forbidden' });
    }

    return prisma.user.findMany({
      select: { id: true, displayName: true, email: true, avatarUrl: true, isAdmin: true, isActive: true, createdAt: true },
      orderBy: { displayName: 'asc' },
    });
  });

  /**
   * PATCH /api/users/:id — update isAdmin / isActive (admin only)
   */
  fastify.patch('/:id', async (request, reply) => {
    const actor = (request as any).user;
    if (!actor.isAdmin) {
      return reply.status(403).send({ error: 'Forbidden' });
    }

    const { id } = request.params as { id: string };
    const { isAdmin, isActive } = request.body as { isAdmin?: boolean; isActive?: boolean };

    // Prevent admin from accidentally removing their own admin rights
    if (id === actor.id && isAdmin === false) {
      return reply.status(400).send({ error: 'You cannot remove your own admin privileges' });
    }

    const data: any = {};
    if (typeof isAdmin === 'boolean') data.isAdmin = isAdmin;
    if (typeof isActive === 'boolean') data.isActive = isActive;

    if (Object.keys(data).length === 0) {
      return reply.status(400).send({ error: 'No valid fields provided' });
    }

    const updated = await prisma.user.update({
      where: { id },
      data,
      select: { id: true, displayName: true, email: true, isAdmin: true, isActive: true },
    });

    return updated;
  });
}
