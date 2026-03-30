import { rm } from 'fs/promises'
import path from 'path'

const ATTACHMENTS_ROOT = process.env.ATTACHMENTS_ROOT || '/data/attachments'

/**
 * Deletes all attachment files on disk for a given article.
 * The DB rows are handled separately by Prisma's onDelete: Cascade.
 *
 * Safe to call even if the directory doesn't exist (force: true).
 */
export async function cleanupArticleAttachments(articleId: string): Promise<void> {
  const dir = path.join(ATTACHMENTS_ROOT, articleId)
  await rm(dir, { recursive: true, force: true })
}

/**
 * Deletes all attachment files for a list of article IDs.
 * Use when hard-deleting a ticket (which cascades article deletion in DB,
 * but disk files need separate cleanup).
 */
export async function cleanupTicketAttachments(articleIds: string[]): Promise<void> {
  await Promise.all(articleIds.map(cleanupArticleAttachments))
}
