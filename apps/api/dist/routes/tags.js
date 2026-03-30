"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tagRoutes = tagRoutes;
const prisma_js_1 = require("../lib/prisma.js");
const auth_js_1 = require("../middleware/auth.js");
async function tagRoutes(fastify) {
    fastify.addHook('preHandler', auth_js_1.authenticate);
    /** List all tags */
    fastify.get('/', async () => {
        return prisma_js_1.prisma.tag.findMany({ orderBy: { name: 'asc' } });
    });
}
