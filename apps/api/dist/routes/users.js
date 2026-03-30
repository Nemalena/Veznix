"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.userRoutes = userRoutes;
const prisma_js_1 = require("../lib/prisma.js");
const auth_js_1 = require("../middleware/auth.js");
async function userRoutes(fastify) {
    fastify.addHook('preHandler', auth_js_1.authenticate);
    /**
     * GET /api/users?search=xxx
     * Used by the @mention autocomplete — returns matching users.
     */
    fastify.get('/', async (request) => {
        const { search } = request.query;
        // Require at least 1 character to avoid returning all users on a bare call
        if (!search || search.trim().length < 1)
            return [];
        return prisma_js_1.prisma.user.findMany({
            where: {
                isActive: true,
                OR: [
                    { displayName: { contains: search, mode: 'insensitive' } },
                    { email: { contains: search, mode: 'insensitive' } }
                ]
            },
            select: { id: true, displayName: true, email: true, avatarUrl: true },
            orderBy: { displayName: 'asc' },
            take: 10,
        });
    });
    /**
     * GET /api/users/me — current user's profile including notification prefs
     */
    fastify.get('/me', async (request) => {
        const userId = request.user.id;
        return prisma_js_1.prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, displayName: true, email: true, avatarUrl: true, emailNotificationsEnabled: true, signature: true, isAdmin: true }
        });
    });
    /**
     * PATCH /api/users/me/preferences — toggle email notifications
     */
    fastify.patch('/me/preferences', async (request, reply) => {
        const userId = request.user.id;
        const { emailNotificationsEnabled, signature } = request.body;
        const data = {};
        if (typeof emailNotificationsEnabled === 'boolean') {
            data.emailNotificationsEnabled = emailNotificationsEnabled;
        }
        if (typeof signature === 'string') {
            data.signature = signature;
        }
        if (Object.keys(data).length === 0) {
            return reply.status(400).send({ error: 'No valid preference fields provided' });
        }
        const updated = await prisma_js_1.prisma.user.update({
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
        const actor = request.user;
        if (!actor.isAdmin) {
            return reply.status(403).send({ error: 'Forbidden' });
        }
        return prisma_js_1.prisma.user.findMany({
            select: { id: true, displayName: true, email: true, avatarUrl: true, isAdmin: true, isActive: true, createdAt: true },
            orderBy: { displayName: 'asc' },
        });
    });
    /**
     * PATCH /api/users/:id — update isAdmin / isActive (admin only)
     */
    fastify.patch('/:id', async (request, reply) => {
        const actor = request.user;
        if (!actor.isAdmin) {
            return reply.status(403).send({ error: 'Forbidden' });
        }
        const { id } = request.params;
        const { isAdmin, isActive } = request.body;
        // Prevent admin from accidentally removing their own admin rights
        if (id === actor.id && isAdmin === false) {
            return reply.status(400).send({ error: 'You cannot remove your own admin privileges' });
        }
        const data = {};
        if (typeof isAdmin === 'boolean')
            data.isAdmin = isAdmin;
        if (typeof isActive === 'boolean')
            data.isActive = isActive;
        if (Object.keys(data).length === 0) {
            return reply.status(400).send({ error: 'No valid fields provided' });
        }
        const updated = await prisma_js_1.prisma.user.update({
            where: { id },
            data,
            select: { id: true, displayName: true, email: true, isAdmin: true, isActive: true },
        });
        return updated;
    });
}
