"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const Sentry = __importStar(require("@sentry/node"));
// Init Sentry before anything else (no-op if SENTRY_DSN is not set)
Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
});
const fastify_1 = __importDefault(require("fastify"));
const cors_1 = __importDefault(require("@fastify/cors"));
const rate_limit_1 = __importDefault(require("@fastify/rate-limit"));
const prisma_js_1 = require("./lib/prisma.js");
const redis_js_1 = require("./lib/redis.js");
const error_handler_js_1 = require("./middleware/error-handler.js");
const webhooks_js_1 = require("./routes/webhooks.js");
const tickets_js_1 = require("./routes/tickets.js");
const stats_js_1 = require("./routes/stats.js");
const mailboxes_js_1 = require("./routes/mailboxes.js");
const canned_responses_js_1 = require("./routes/canned-responses.js");
const tags_js_1 = require("./routes/tags.js");
const notifications_js_1 = require("./routes/notifications.js");
const users_js_1 = require("./routes/users.js");
const groups_js_1 = require("./routes/groups.js");
const assignment_rules_js_1 = require("./routes/assignment-rules.js");
const search_js_1 = require("./routes/search.js");
const sla_rules_js_1 = require("./routes/sla-rules.js");
require("./jobs/mailbox-poll.job.js"); // Email polling every 5 min
require("./jobs/webhook-renewal.job.js"); // Graph webhook renewal every 24h
require("./jobs/overdue-check.job.js"); // Overdue ticket detection every hour
// Initialize fastify server
const app = (0, fastify_1.default)({ logger: true });
// Setup CORS — in dev allow any localhost origin; in production restrict to APP_URL
const isDev = (process.env.NODE_ENV || 'development') !== 'production';
app.register(cors_1.default, {
    origin: isDev
        ? (origin, cb) => {
            // Allow requests with no origin (curl, Postman) and any localhost port
            if (!origin || /^https?:\/\/localhost(:\d+)?$/.test(origin)) {
                cb(null, true);
            }
            else {
                cb(new Error('Not allowed by CORS'), false);
            }
        }
        : process.env.APP_URL,
    credentials: true,
});
// Setup global error handler
(0, error_handler_js_1.setupErrorHandler)(app);
// Register routes
app.register(webhooks_js_1.webhookRoutes, { prefix: '/api/webhooks' });
app.register(tickets_js_1.ticketRoutes, { prefix: '/api/tickets' });
app.register(stats_js_1.statsRoutes, { prefix: '/api/stats' });
app.register(mailboxes_js_1.mailboxRoutes, { prefix: '/api/mailboxes' });
app.register(canned_responses_js_1.cannedResponseRoutes, { prefix: '/api/canned-responses' });
app.register(tags_js_1.tagRoutes, { prefix: '/api/tags' });
app.register(notifications_js_1.notificationRoutes, { prefix: '/api/notifications' });
app.register(users_js_1.userRoutes, { prefix: '/api/users' });
app.register(groups_js_1.groupRoutes, { prefix: '/api/groups' });
app.register(assignment_rules_js_1.assignmentRuleRoutes, { prefix: '/api/assignment-rules' });
app.register(search_js_1.searchRoutes, { prefix: '/api/search' });
app.register(sla_rules_js_1.slaRuleRoutes, { prefix: '/api/mailboxes' });
// Health check — DB + Redis + webhook renewal age (alert if > 48h)
app.get('/health', async () => {
    const [dbOk, redisOk] = await Promise.all([
        prisma_js_1.prisma.$queryRaw `SELECT 1`.then(() => true).catch(() => false),
        redis_js_1.redis.ping().then(r => r === 'PONG').catch(() => false),
    ]);
    const lastRenewal = await redis_js_1.redis.get('last-webhook-renewal').catch(() => null);
    const renewalAgeHours = lastRenewal
        ? (Date.now() - parseInt(lastRenewal)) / 3600000
        : null;
    return {
        status: dbOk && redisOk ? 'ok' : 'degraded',
        db: dbOk,
        redis: redisOk,
        webhookRenewalAgeHours: renewalAgeHours,
    };
});
const start = async () => {
    try {
        // Register rate limiting
        await app.register(rate_limit_1.default, {
            max: 200,
            timeWindow: '1 minute',
            keyGenerator: (req) => req.user?.id || req.ip
        });
        await app.listen({ port: 3000, host: '0.0.0.0' });
        app.log.info(`API server started on port 3000`);
    }
    catch (err) {
        app.log.error(err);
        process.exit(1);
    }
};
start();
