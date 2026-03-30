"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.groupRoutes = groupRoutes;
const prisma_js_1 = require("../lib/prisma.js");
const auth_js_1 = require("../middleware/auth.js");
async function groupRoutes(fastify) {
    fastify.addHook('preHandler', auth_js_1.authenticate);
    /**
     * GET /api/groups
     * Returns a list of all groups (e.g. for access assignment dropdowns).
     */
    /** List groups with optional search */
    fastify.get('/', async (request) => {
        const { search } = request.query;
        return prisma_js_1.prisma.group.findMany({
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
        const { id } = request.params;
        const group = await prisma_js_1.prisma.group.findUnique({
            where: { id },
            include: {
                members: { select: { userId: true } }
            }
        });
        if (!group)
            return reply.status(404).send({ error: 'Not found' });
        return group;
    });
    /** Create group */
    fastify.post('/', async (request, reply) => {
        const user = request.user;
        if (!user.isAdmin)
            return reply.status(403).send({ message: 'Admin only' });
        const { name, displayName, userIds } = request.body;
        const slug = name.toLowerCase().replace(/\s+/g, '-');
        return prisma_js_1.prisma.group.create({
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
        const user = request.user;
        if (!user.isAdmin)
            return reply.status(403).send({ message: 'Admin only' });
        const { id } = request.params;
        const { displayName, userIds } = request.body;
        return prisma_js_1.prisma.group.update({
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
        const user = request.user;
        if (!user.isAdmin)
            return reply.status(403).send({ message: 'Admin only' });
        const { id } = request.params;
        await prisma_js_1.prisma.groupMember.deleteMany({ where: { groupId: id } });
        return prisma_js_1.prisma.group.delete({ where: { id } });
    });
}
