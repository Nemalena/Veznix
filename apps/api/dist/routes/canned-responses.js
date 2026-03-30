"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.cannedResponseRoutes = cannedResponseRoutes;
const prisma_js_1 = require("../lib/prisma.js");
const auth_js_1 = require("../middleware/auth.js");
const sanitize_html_1 = __importDefault(require("sanitize-html"));
const ALLOWED_HTML = {
    allowedTags: ['p', 'br', 'b', 'i', 'u', 'strong', 'em', 'a', 'span', 'div', 'ul', 'ol', 'li', 'blockquote'],
    allowedAttributes: { 'a': ['href', 'target'], '*': ['style'] },
    disallowedTagsMode: 'discard'
};
async function cannedResponseRoutes(fastify) {
    fastify.addHook('preHandler', auth_js_1.authenticate);
    /** List all canned responses (optionally filtered by mailbox) */
    fastify.get('/', async (request, reply) => {
        const { mailboxId } = request.query;
        return prisma_js_1.prisma.cannedResponse.findMany({
            where: mailboxId
                ? { OR: [{ mailboxId }, { mailboxId: null }] }
                : {},
            orderBy: { title: 'asc' }
        });
    });
    /** Create a new canned response — sanitize bodyHtml on write */
    fastify.post('/', async (request, reply) => {
        const userId = request.user.id;
        const { title, bodyHtml, mailboxId } = request.body;
        if (!title || !bodyHtml) {
            return reply.status(400).send({ error: 'title and bodyHtml are required' });
        }
        return prisma_js_1.prisma.cannedResponse.create({
            data: {
                title,
                bodyHtml: (0, sanitize_html_1.default)(bodyHtml, ALLOWED_HTML),
                mailboxId: mailboxId ?? null,
                createdByUserId: userId,
            }
        });
    });
    /** Update a canned response */
    fastify.patch('/:id', async (request, reply) => {
        const { id } = request.params;
        const { title, bodyHtml, mailboxId } = request.body;
        return prisma_js_1.prisma.cannedResponse.update({
            where: { id },
            data: {
                ...(title && { title }),
                ...(bodyHtml && { bodyHtml: (0, sanitize_html_1.default)(bodyHtml, ALLOWED_HTML) }),
                ...(mailboxId !== undefined && { mailboxId })
            }
        });
    });
    /** Delete a canned response — admin can delete anything; users can only delete their own */
    fastify.delete('/:id', async (request, reply) => {
        const actor = request.user;
        const { id } = request.params;
        const template = await prisma_js_1.prisma.cannedResponse.findUnique({ where: { id } });
        if (!template) {
            return reply.status(404).send({ error: 'Not found' });
        }
        // null createdByUserId = legacy record, admin only
        const canDelete = actor.isAdmin || (template.createdByUserId === actor.id);
        if (!canDelete) {
            return reply.status(403).send({ error: 'Forbidden' });
        }
        await prisma_js_1.prisma.cannedResponse.delete({ where: { id } });
        return { success: true };
    });
}
