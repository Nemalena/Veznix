# Veznix

A self-hosted email ticketing system for managing shared Microsoft 365 mailboxes. Built for teams that need controlled access to shared inboxes without granting full mailbox membership.

## Overview

Veznix ingests emails from shared mailboxes via the Microsoft Graph API and presents them as tickets. It enables team collaboration, ticket assignment, internal notes with @mentions, and auto-assignment rules — all behind Microsoft Entra ID (SSO) authentication.

**Key capabilities:**
- Ingest emails from shared Microsoft 365 mailboxes as tickets
- Ticket status tracking: NEW → OPEN → PENDING → RESOLVED
- Internal notes with @mentions (users and groups)
- Auto-assignment rules (subject keyword, sender domain, regex)
- Canned response templates per mailbox or globally
- Role-based access control (admin vs regular user)
- Two-layer access control: mailbox access + sensitive ticket grants
- Real-time notifications via Server-Sent Events
- Email notification preferences per user
- Analytics dashboard (response times, SLA, agent productivity)
- Compose and send outbound emails from shared mailboxes
- Full activity audit trail per ticket

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript + Vite |
| UI | shadcn/ui + Tailwind CSS |
| Rich Text Editor | Tiptap 2 |
| Backend | Node.js + Fastify 4 + TypeScript |
| Database | PostgreSQL 16 + Prisma ORM |
| Auth | Microsoft Entra ID (MSAL) |
| Email API | Microsoft Graph API |
| Background Jobs | BullMQ + Redis 7 |
| Real-time | Server-Sent Events (SSE) |
| Error Tracking | Sentry (optional) |
| Reverse Proxy | Caddy 2 (production) |

## Project Structure

```
tiketing_sistem/
├── apps/
│   ├── web/          # React frontend (Vite, port 5173)
│   └── api/          # Fastify backend (port 3000)
│       └── src/
│           ├── routes/       # API endpoints
│           ├── services/     # Graph API, mail ingestion, notifications
│           ├── jobs/         # BullMQ background workers
│           └── prisma/       # Schema and migrations
├── docker-compose.yml        # Local dev: PostgreSQL + Redis
└── docker-compose.prod.yml   # Production: includes Caddy reverse proxy
```

## Prerequisites

- Node.js 18+
- Docker & Docker Compose
- Microsoft Entra app registration with:
  - `Mail.Read`, `Mail.Send`, `Mail.ReadWrite` Graph permissions
  - SPA redirect URI for frontend
  - Client secret for backend

## Local Development Setup

### 1. Clone and install

```bash
git clone <repo-url>
cd tiketing_sistem
npm install
cd apps/api && npm install
cd ../web && npm install
```

### 2. Configure environment variables

**`apps/api/.env`:**
```env
DATABASE_URL="postgresql://tempusmail:password@localhost:5432/tempusmail?schema=public"
ENTRA_TENANT_ID="your-tenant-id"
ENTRA_CLIENT_ID="your-app-client-id"
ENTRA_CLIENT_SECRET="your-client-secret"
WEBHOOK_SECRET="your-random-64-char-hex-string"
APP_BASE_URL="http://localhost:3000"
SENTRY_DSN=""
```

**`apps/web/.env`:**
```env
VITE_ENTRA_TENANT_ID="your-tenant-id"
VITE_ENTRA_CLIENT_ID="your-app-client-id"
```

### 3. Start infrastructure

```bash
docker-compose up -d
```

This starts PostgreSQL 16 and Redis 7.

### 4. Set up the database

```bash
cd apps/api
npx prisma db push --schema=src/prisma/schema.prisma
```

### 5. Run the API

```bash
cd apps/api
npm run dev
```

### 6. Run the frontend

```bash
cd apps/web
npm run dev
```

The app will be available at `http://localhost:5173`.
API health check: `http://localhost:3000/health`

## Available Scripts

### API (`apps/api`)

```bash
npm run dev          # Start dev server with auto-reload
npm run build        # Compile TypeScript to dist/
npm start            # Run compiled production build
npm run db:push      # Push schema changes to database
npm run db:studio    # Open Prisma Studio GUI
npm run db:seed      # Load mock data
npm run db:generate  # Regenerate Prisma client
```

### Frontend (`apps/web`)

```bash
npm run dev          # Start Vite dev server
npm run build        # Build for production
npm run preview      # Preview production build locally
npm run lint         # Run ESLint
```

## Production Deployment

Build both apps and deploy with the production compose file:

```bash
cd apps/api && npm run build
cd ../web && npm run build
docker-compose -f docker-compose.prod.yml up -d
```

The production setup includes:
- Caddy reverse proxy with automatic HTTPS
- Persistent volumes for PostgreSQL data, Redis, and email attachments

You will need a `Caddyfile` configured with your domain and a `.env` file with production values.

## Environment Variables Reference

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `ENTRA_TENANT_ID` | Microsoft Entra tenant ID |
| `ENTRA_CLIENT_ID` | Entra app (client) ID |
| `ENTRA_CLIENT_SECRET` | Entra app client secret — never commit |
| `WEBHOOK_SECRET` | Random secret for Graph webhook validation |
| `APP_BASE_URL` | Public URL of the app (used for webhooks) |
| `SENTRY_DSN` | Sentry error tracking DSN (optional) |
| `REDIS_URL` | Redis connection string (default: `redis://localhost:6379`) |

## Background Jobs

The API runs three background jobs via BullMQ:

| Job | Interval | Purpose |
|-----|----------|---------|
| Mailbox poll | Every 5 min | Ingest new emails from shared mailboxes |
| Webhook renewal | Every 24 hours | Renew Microsoft Graph webhook subscriptions |
| Overdue check | Every 1 hour | Send notifications for overdue tickets |

## Security

- Authentication via Microsoft Entra ID SSO (JWT tokens, no cookies)
- Rate limiting: 200 requests/minute per authenticated user
- XSS protection: DOMPurify (frontend) + sanitize-html (backend)
- Attachment validation: extension blocklist + 20MB cumulative size limit
- Two-layer access control: mailbox membership + sensitive ticket explicit grants
