"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mailboxPollWorker = exports.mailboxPollQueue = exports.MAILBOX_POLL_QUEUE = void 0;
exports.pollAllMailboxes = pollAllMailboxes;
exports.pollSingleMailbox = pollSingleMailbox;
const bullmq_1 = require("bullmq");
const prisma_js_1 = require("../lib/prisma.js");
const graph_service_js_1 = require("../services/graph.service.js");
const mail_service_js_1 = require("../services/mail.service.js");
const connection = {
    url: process.env.REDIS_URL || 'redis://localhost:6379'
};
exports.MAILBOX_POLL_QUEUE = 'mailbox-poll';
exports.mailboxPollQueue = new bullmq_1.Queue(exports.MAILBOX_POLL_QUEUE, {
    connection,
});
/**
 * The actual work function for polling all mailboxes.
 */
async function pollAllMailboxes() {
    const mailboxes = await prisma_js_1.prisma.mailbox.findMany({
        where: { isActive: true }
    });
    for (const mailbox of mailboxes) {
        console.log(`Polling mailbox: ${mailbox.emailAddress}`);
        try {
            const { messages, nextDeltaLink } = await graph_service_js_1.graphService.fetchMessagesDelta(mailbox.emailAddress, mailbox.deltaLink || undefined);
            if (messages.length > 0) {
                await mail_service_js_1.mailService.processMessages(mailbox.id, mailbox.emailAddress, messages);
            }
            if (nextDeltaLink) {
                await prisma_js_1.prisma.mailbox.update({
                    where: { id: mailbox.id },
                    data: { deltaLink: nextDeltaLink }
                });
            }
        }
        catch (error) {
            console.error(`Failed to poll mailbox ${mailbox.emailAddress}:`, error);
        }
    }
}
/**
 * Worker setup
 */
exports.mailboxPollWorker = new bullmq_1.Worker(exports.MAILBOX_POLL_QUEUE, async (job) => {
    if (job.name === 'poll-all') {
        await pollAllMailboxes();
    }
    else if (job.name === 'poll-single') {
        const { mailboxEmail } = job.data;
        await pollSingleMailbox(mailboxEmail);
    }
}, { connection });
async function pollSingleMailbox(email) {
    const mailbox = await prisma_js_1.prisma.mailbox.findUnique({
        where: { emailAddress: email }
    });
    if (!mailbox || !mailbox.isActive)
        return;
    try {
        const { messages, nextDeltaLink } = await graph_service_js_1.graphService.fetchMessagesDelta(mailbox.emailAddress, mailbox.deltaLink || undefined);
        if (messages.length > 0) {
            await mail_service_js_1.mailService.processMessages(mailbox.id, mailbox.emailAddress, messages);
        }
        if (nextDeltaLink) {
            await prisma_js_1.prisma.mailbox.update({
                where: { id: mailbox.id },
                data: { deltaLink: nextDeltaLink }
            });
        }
    }
    catch (error) {
        console.error(`Failed to poll single mailbox ${email}:`, error);
    }
}
// Schedule a recurring job if this is the only instance
// In a real production setup, you might move this to a dedicated "scheduler" block
exports.mailboxPollQueue.add('poll-all', {}, {
    repeat: {
        every: 5 * 60 * 1000 // Every 5 minutes
    }
});
