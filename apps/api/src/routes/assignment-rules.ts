import { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';

/**
 * Validates a single condition object from AssignmentRule.conditions.
 * Throws if the condition is invalid.
 *
 * Supported conditions:
 *   { "subjectContains": "invoice" }
 *   { "senderDomain": "ministry.gov.rs" }
 *   { "subjectMatchesRegex": "^\\[URGENT\\]" }
 *
 * ⚠️ Phase 5: regex is compiled but NOT run in a worker thread (low risk for trusted-admin-only system).
 *    See comments in Plan.md §ReDoS Risk. Upgrade to RE2/Worker in Phase 6 if needed.
 */
function validateConditions(conditions: unknown): void {
  if (!conditions || typeof conditions !== 'object' || Array.isArray(conditions)) {
    throw new Error('conditions must be a non-array object');
  }
  const cond = conditions as Record<string, unknown>;
  const allowed = new Set(['subjectContains', 'senderDomain', 'subjectMatchesRegex']);
  for (const key of Object.keys(cond)) {
    if (!allowed.has(key)) throw new Error(`Unknown condition key: "${key}"`);
    if (typeof cond[key] !== 'string') throw new Error(`Condition "${key}" must be a string value`);
  }
  if (cond.subjectMatchesRegex) {
    // Validate the regex compiles — prevents obviously broken patterns
    try { new RegExp(cond.subjectMatchesRegex as string) }
    catch (e: any) { throw new Error(`Invalid regex in subjectMatchesRegex: ${e.message}`) }
  }
}

/**
 * Evaluates all active assignment rules for a ticket and returns the first matching rule,
 * or null if none match. Rules are evaluated in ascending priority order.
 */
export async function evaluateAssignmentRules(
  mailboxId: string,
  subject: string,
  senderEmail: string
): Promise<{ assignToUserId: string | null; assignToGroupId: string | null } | null> {
  const rules = await prisma.assignmentRule.findMany({
    where: { mailboxId, isActive: true },
    orderBy: { priority: 'asc' }
  });

  for (const rule of rules) {
    const cond = rule.conditions as Record<string, string>;
    let matches = true;

    if (cond.subjectContains) {
      matches = matches && subject.toLowerCase().includes(cond.subjectContains.toLowerCase());
    }
    if (cond.senderDomain) {
      const domain = senderEmail.split('@')[1] ?? '';
      matches = matches && domain.toLowerCase() === cond.senderDomain.toLowerCase();
    }
    if (cond.subjectMatchesRegex) {
      try {
        matches = matches && new RegExp(cond.subjectMatchesRegex).test(subject);
      } catch {
        matches = false; // Fail safe — skip broken regex conditions
      }
    }

    if (matches) {
      return { assignToUserId: rule.assignToUserId, assignToGroupId: rule.assignToGroupId };
    }
  }

  return null;
}

export async function assignmentRuleRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticate);

  // All assignment rule management is admin-only
  fastify.addHook('preHandler', async (request, reply) => {
    if (!(request as any).user?.isAdmin) {
      return reply.status(403).send({ error: 'Forbidden', message: 'Admin only' });
    }
  });

  /**
   * GET /api/assignment-rules?mailboxId=xxx
   */
  fastify.get('/', async (request) => {
    const { mailboxId } = request.query as { mailboxId?: string };
    return prisma.assignmentRule.findMany({
      where: mailboxId ? { mailboxId } : undefined,
      orderBy: [{ mailboxId: 'asc' }, { priority: 'asc' }],
      include: {
        mailbox: { select: { id: true, displayName: true } },
        assignToUser: { select: { id: true, displayName: true } },
        assignToGroup: { select: { id: true, displayName: true } }
      }
    });
  });

  /**
   * POST /api/assignment-rules
   * Body: { mailboxId, priority?, conditions, assignToUserId?, assignToGroupId?, isActive? }
   */
  fastify.post('/', async (request, reply) => {
    const { mailboxId, priority = 0, conditions, assignToUserId, assignToGroupId, isActive = true } = request.body as any;

    if (!mailboxId) return reply.status(400).send({ error: 'mailboxId is required' });
    if (!conditions) return reply.status(400).send({ error: 'conditions is required' });
    if (!assignToUserId && !assignToGroupId) {
      return reply.status(400).send({ error: 'Either assignToUserId or assignToGroupId is required' });
    }

    try {
      validateConditions(conditions);
    } catch (e: any) {
      return reply.status(400).send({ error: e.message });
    }

    const rule = await prisma.assignmentRule.create({
      data: { mailboxId, priority, conditions, assignToUserId, assignToGroupId, isActive }
    });

    return reply.status(201).send(rule);
  });

  /**
   * PATCH /api/assignment-rules/:id
   */
  fastify.patch('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { priority, conditions, assignToUserId, assignToGroupId, isActive } = request.body as any;

    if (conditions !== undefined) {
      try { validateConditions(conditions); }
      catch (e: any) { return reply.status(400).send({ error: e.message }); }
    }

    const rule = await prisma.assignmentRule.update({
      where: { id },
      data: { priority, conditions, assignToUserId, assignToGroupId, isActive }
    }).catch(() => null);

    if (!rule) return reply.status(404).send({ error: 'Rule not found' });
    return rule;
  });

  /**
   * DELETE /api/assignment-rules/:id
   */
  fastify.delete('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    await prisma.assignmentRule.delete({ where: { id } }).catch(() => {});
    return { success: true };
  });
}
