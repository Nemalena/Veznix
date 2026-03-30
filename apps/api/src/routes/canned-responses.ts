import { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';
import sanitizeHtml from 'sanitize-html';

const ALLOWED_HTML = {
  allowedTags: ['p','br','b','i','u','strong','em','a','span','div','ul','ol','li','blockquote'],
  allowedAttributes: { 'a': ['href', 'target'], '*': ['style'] },
  disallowedTagsMode: 'discard' as const
};

export async function cannedResponseRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticate);

  /** List all canned responses (optionally filtered by mailbox) */
  fastify.get('/', async (request, reply) => {
    const { mailboxId } = request.query as any;
    return prisma.cannedResponse.findMany({
      where: mailboxId
        ? { OR: [{ mailboxId }, { mailboxId: null }] }
        : {},
      orderBy: { title: 'asc' }
    });
  });

  /** Create a new canned response — sanitize bodyHtml on write */
  fastify.post('/', async (request, reply) => {
    const userId = (request as any).user.id;
    const { title, bodyHtml, mailboxId } = request.body as any;
    if (!title || !bodyHtml) {
      return reply.status(400).send({ error: 'title and bodyHtml are required' });
    }
    return prisma.cannedResponse.create({
      data: {
        title,
        bodyHtml: sanitizeHtml(bodyHtml, ALLOWED_HTML),
        mailboxId: mailboxId ?? null,
        createdByUserId: userId,
      }
    });
  });

  /** Update a canned response */
  fastify.patch('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { title, bodyHtml, mailboxId } = request.body as any;
    return prisma.cannedResponse.update({
      where: { id },
      data: {
        ...(title && { title }),
        ...(bodyHtml && { bodyHtml: sanitizeHtml(bodyHtml, ALLOWED_HTML) }),
        ...(mailboxId !== undefined && { mailboxId })
      }
    });
  });

  /** Delete a canned response — admin can delete anything; users can only delete their own */
  fastify.delete('/:id', async (request, reply) => {
    const actor = (request as any).user;
    const { id } = request.params as { id: string };

    const template = await prisma.cannedResponse.findUnique({ where: { id } });
    if (!template) {
      return reply.status(404).send({ error: 'Not found' });
    }

    // null createdByUserId = legacy record, admin only
    const canDelete = actor.isAdmin || (template.createdByUserId === actor.id);
    if (!canDelete) {
      return reply.status(403).send({ error: 'Forbidden' });
    }

    await prisma.cannedResponse.delete({ where: { id } });
    return { success: true };
  });
}
