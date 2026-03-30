import { TicketEventType, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';

interface RecordEventOptions {
  /**
   * When true, any DB failure is rethrown instead of being swallowed.
   * Use this for events that act as deduplication guards (e.g. OVERDUE_NOTIFIED),
   * where a silent failure would allow duplicate actions on the next run.
   */
  critical?: boolean;
}

export async function recordEvent(
  ticketId: string,
  actorId: string | null,    // null = system event
  type: TicketEventType,
  meta?: Record<string, unknown>,
  options: RecordEventOptions = {}
) {
  try {
    await prisma.ticketEvent.create({
      data: { 
        ticketId, 
        actorId, 
        type, 
        meta: (meta ?? {}) as Prisma.InputJsonValue
      }
    });
  } catch (err) {
    console.error(`Failed to record event ${type} for ticket ${ticketId}`, err);
    if (options.critical) {
      throw err; // Caller must handle — do not swallow dedup-critical events
    }
  }
}
