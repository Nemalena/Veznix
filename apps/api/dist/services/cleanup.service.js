"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.cleanupArticleAttachments = cleanupArticleAttachments;
exports.cleanupTicketAttachments = cleanupTicketAttachments;
const promises_1 = require("fs/promises");
const path_1 = __importDefault(require("path"));
const ATTACHMENTS_ROOT = process.env.ATTACHMENTS_ROOT || '/data/attachments';
/**
 * Deletes all attachment files on disk for a given article.
 * The DB rows are handled separately by Prisma's onDelete: Cascade.
 *
 * Safe to call even if the directory doesn't exist (force: true).
 */
async function cleanupArticleAttachments(articleId) {
    const dir = path_1.default.join(ATTACHMENTS_ROOT, articleId);
    await (0, promises_1.rm)(dir, { recursive: true, force: true });
}
/**
 * Deletes all attachment files for a list of article IDs.
 * Use when hard-deleting a ticket (which cascades article deletion in DB,
 * but disk files need separate cleanup).
 */
async function cleanupTicketAttachments(articleIds) {
    await Promise.all(articleIds.map(cleanupArticleAttachments));
}
