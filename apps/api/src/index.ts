import 'dotenv/config'
import * as Sentry from '@sentry/node'

// Init Sentry before anything else (no-op if SENTRY_DSN is not set)
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV || 'development',
})

import Fastify from 'fastify'
import cors from '@fastify/cors'
import rateLimit from '@fastify/rate-limit'
import { prisma } from './lib/prisma.js'
import { redis } from './lib/redis.js'
import { setupErrorHandler } from './middleware/error-handler.js';
import { webhookRoutes } from './routes/webhooks.js';
import { ticketRoutes } from './routes/tickets.js';
import { statsRoutes } from './routes/stats.js';
import { mailboxRoutes } from './routes/mailboxes.js';
import { cannedResponseRoutes } from './routes/canned-responses.js';
import { tagRoutes } from './routes/tags.js';
import { notificationRoutes } from './routes/notifications.js';
import { userRoutes } from './routes/users.js';
import { groupRoutes } from './routes/groups.js';
import { assignmentRuleRoutes } from './routes/assignment-rules.js';
import { searchRoutes } from './routes/search.js';
import { slaRuleRoutes } from './routes/sla-rules.js';
import './jobs/mailbox-poll.job.js';       // Email polling every 5 min
import './jobs/webhook-renewal.job.js';    // Graph webhook renewal every 24h
import './jobs/overdue-check.job.js';      // Overdue ticket detection every hour

// Initialize fastify server
const app = Fastify({ logger: true })

// Setup CORS — allow localhost in dev; always allow APP_URL / APP_BASE_URL if defined
const isDev = (process.env.NODE_ENV || 'development') !== 'production'
const allowedOrigins = [
  /^https?:\/\/localhost(:\d+)?$/,
  process.env.APP_URL,
  process.env.APP_BASE_URL,
].filter(Boolean) as (string | RegExp)[]

app.register(cors, {
  origin: (origin, cb) => {
    // Allow requests with no origin (like curl or mobile apps that don't set it)
    if (!origin) {
      cb(null, true)
      return
    }

    const isAllowed = allowedOrigins.some((allowed) => {
      if (allowed instanceof RegExp) {
        return allowed.test(origin)
      }
      // Compare both without trailing slashes for robustness
      const cleanAllowed = allowed.replace(/\/$/, '')
      const cleanOrigin = origin.replace(/\/$/, '')
      return cleanOrigin === cleanAllowed
    })

    if (isAllowed) {
      cb(null, true)
    } else {
      app.log.warn({ origin, allowedOrigins }, 'CORS blocked')
      cb(new Error('Not allowed by CORS'), false)
    }
  },
  credentials: true,
})

// Setup global error handler
setupErrorHandler(app)

// Register routes
app.register(webhookRoutes, { prefix: '/api/webhooks' });
app.register(ticketRoutes, { prefix: '/api/tickets' });
app.register(statsRoutes, { prefix: '/api/stats' });
app.register(mailboxRoutes, { prefix: '/api/mailboxes' });
app.register(cannedResponseRoutes, { prefix: '/api/canned-responses' });
app.register(tagRoutes, { prefix: '/api/tags' });
app.register(notificationRoutes, { prefix: '/api/notifications' });
app.register(userRoutes, { prefix: '/api/users' });
app.register(groupRoutes, { prefix: '/api/groups' });
app.register(assignmentRuleRoutes, { prefix: '/api/assignment-rules' });
app.register(searchRoutes, { prefix: '/api/search' });
app.register(slaRuleRoutes, { prefix: '/api/mailboxes' });

// Health check — DB + Redis + webhook renewal age (alert if > 48h)
app.get('/health', async () => {
  const [dbOk, redisOk] = await Promise.all([
    prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false),
    redis.ping().then(r => r === 'PONG').catch(() => false),
  ])
  const lastRenewal = await redis.get('last-webhook-renewal').catch(() => null)
  const renewalAgeHours = lastRenewal
    ? (Date.now() - parseInt(lastRenewal)) / 3600000
    : null

  return {
    status: dbOk && redisOk ? 'ok' : 'degraded',
    db: dbOk,
    redis: redisOk,
    webhookRenewalAgeHours: renewalAgeHours,
  }
})

const start = async () => {
  try {
    // Register rate limiting
    await app.register(rateLimit, {
      max: 200,
      timeWindow: '1 minute',
      keyGenerator: (req) => (req as any).user?.id || req.ip
    })

    await app.listen({ port: 3000, host: '0.0.0.0' })
    app.log.info(`API server started on port 3000`)
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

start()
