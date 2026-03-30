import 'isomorphic-fetch';
import { Client } from '@microsoft/microsoft-graph-client';
import { ConfidentialClientApplication, ClientCredentialRequest } from '@azure/msal-node';
import { Message } from '@microsoft/microsoft-graph-types';

interface DeltaResponse<T> {
  '@odata.nextLink'?: string;
  '@odata.deltaLink'?: string;
  value?: T[];
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Retries a Graph API call on throttling (429) or transient errors (503/504).
 * Respects the Retry-After header; falls back to exponential backoff.
 */
async function graphRequest<T>(fn: () => Promise<T>, retries = 4): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastErr = err;
      const statusCode = err?.statusCode ?? err?.code;
      if (statusCode === 429 || statusCode === 503 || statusCode === 504) {
        // Respect Retry-After header if present (value is in seconds)
        const retryAfterSec = parseInt(err?.headers?.['retry-after'] ?? '0');
        const waitMs = retryAfterSec > 0
          ? retryAfterSec * 1000
          : Math.min(1000 * 2 ** attempt, 30_000); // Exponential backoff, max 30s
        console.warn(`Graph API throttled (${statusCode}). Waiting ${waitMs}ms before retry ${attempt + 1}/${retries}...`);
        await sleep(waitMs);
        continue;
      }
      // Non-retryable error — fail immediately
      throw err;
    }
  }
  throw lastErr;
}

export class GraphService {
  private msalClient: ConfidentialClientApplication;
  private tenantId: string;

  constructor() {
    const clientId = process.env.ENTRA_CLIENT_ID;
    const clientSecret = process.env.ENTRA_CLIENT_SECRET;
    this.tenantId = process.env.ENTRA_TENANT_ID || 'common';

    if (!clientId || !clientSecret) {
      throw new Error('GraphService: ENTRA_CLIENT_ID or ENTRA_CLIENT_SECRET is missing');
    }

    this.msalClient = new ConfidentialClientApplication({
      auth: {
        clientId,
        clientSecret,
        authority: `https://login.microsoftonline.com/${this.tenantId}`,
      }
    });
  }

  /**
   * Gets an access token for the Graph API using Client Credentials flow (Application permissions)
   */
  async getApplicationToken(): Promise<string> {
    const request: ClientCredentialRequest = {
      scopes: ['https://graph.microsoft.com/.default'],
    };

    const response = await this.msalClient.acquireTokenByClientCredential(request);
    if (!response || !response.accessToken) {
      throw new Error('GraphService: Failed to acquire application token');
    }
    return response.accessToken;
  }

  /**
   * Returns an initialized Graph client with an application-level token
   */
  async getClient(): Promise<Client> {
    const token = await this.getApplicationToken();
    return Client.init({
      authProvider: (done) => done(null, token),
    });
  }

  /**
   * Fetches new messages for a specific mailbox using a delta link if available.
   * @param mailboxEmail The email address of the shared mailbox.
   * @param deltaLink Optional delta link from previous poll.
   * @returns An object containing the new messages and the next delta link.
   */
  async fetchMessagesDelta(mailboxEmail: string, deltaLink?: string): Promise<{ messages: Message[], nextDeltaLink?: string }> {
    const client = await this.getClient();
    let messages: Message[] = [];
    let nextLink = deltaLink || `https://graph.microsoft.com/v1.0/users/${mailboxEmail}/mailFolders/Inbox/messages/delta`;

    // Fetch all pages of changes, with retry on each page
    while (nextLink) {
      const response: DeltaResponse<Message> = await graphRequest(() =>
        client.api(nextLink)
          .select('id,subject,body,from,toRecipients,parentFolderId,conversationId,hasAttachments,receivedDateTime,sentDateTime,internetMessageId,internetMessageHeaders')
          .expand('attachments($select=id,name,contentType,size,isInline)')
          .get()
      );

      if (response.value) {
        messages = [...messages, ...response.value];
      }

      // Check for @odata.nextLink (more pages in current sync) or @odata.deltaLink (token for future sync)
      nextLink = (response as any)['@odata.nextLink'] || null;
      
      if (!nextLink && (response as any)['@odata.deltaLink']) {
        return {
          messages,
          nextDeltaLink: (response as any)['@odata.deltaLink']
        };
      }
    }

    return { messages };
  }

  /**
   * Subscribes to notifications for a mailbox Inbox
   */
  async createSubscription(mailboxEmail: string) {
    const client = await this.getClient();
    const expirationDateTime = new Date();
    expirationDateTime.setHours(expirationDateTime.getHours() + 48); // Max for mail is usually around 70h, keeping it safe

    const subscription = {
      changeType: 'created',
      notificationUrl: `${process.env.APP_BASE_URL}/api/webhooks/graph`,
      resource: `users/${mailboxEmail}/mailFolders/Inbox/messages`,
      expirationDateTime: expirationDateTime.toISOString(),
      clientState: process.env.WEBHOOK_SECRET
    };

    return graphRequest(() => client.api('/subscriptions').post(subscription));
  }

  /**
   * Renew an existing subscription
   */
  async renewSubscription(subscriptionId: string) {
    const client = await this.getClient();
    const expirationDateTime = new Date();
    expirationDateTime.setHours(expirationDateTime.getHours() + 48);

    return graphRequest(() =>
      client.api(`/subscriptions/${subscriptionId}`)
        .patch({ expirationDateTime: expirationDateTime.toISOString() })
    );
  }

  /**
   * Send a reply from a shared mailbox.
   *
   * When the original Graph message ID is available we use a 3-step flow so that
   * the email is properly threaded (correct In-Reply-To / References headers):
   *   1. POST …/messages/{id}/createReply  → gets a draft with threading headers pre-set
   *   2. PATCH …/messages/{draftId}         → overwrite body (HTML) and recipients
   *   3. POST …/messages/{draftId}/send     → delivers and saves to Sent Items
   *
   * When no original message ID is available we fall back to /sendMail.
   *
   * CRITICAL: All calls use /users/{sharedMailbox}/ — NOT /me/ which would send
   * from the app's service-principal identity instead of the real mailbox.
   */
  async sendReply(
    fromMailboxEmail: string,
    toAddress: string,
    subject: string,
    bodyHtml: string,
    replyToMessageId?: string,
    cc?: string[],
    bcc?: string[]
  ): Promise<void> {
    const client = await this.getClient();

    if (replyToMessageId) {
      // Step 1 – create a draft reply (sets threading headers automatically)
      const draft: any = await graphRequest(() =>
        client.api(`/users/${fromMailboxEmail}/messages/${replyToMessageId}/createReply`).post({})
      );

      // Step 2 – update draft with our HTML body, recipients and subject
      const patch: any = {
        subject: subject.startsWith('Re:') ? subject : `Re: ${subject}`,
        body: { contentType: 'HTML', content: bodyHtml },
        toRecipients: [{ emailAddress: { address: toAddress } }],
      };
      if (cc?.length) patch.ccRecipients = cc.map(addr => ({ emailAddress: { address: addr } }));
      if (bcc?.length) patch.bccRecipients = bcc.map(addr => ({ emailAddress: { address: addr } }));

      await graphRequest(() =>
        client.api(`/users/${fromMailboxEmail}/messages/${draft.id}`).patch(patch)
      );

      // Step 3 – send the draft (Graph automatically saves a copy to Sent Items)
      await graphRequest(() =>
        client.api(`/users/${fromMailboxEmail}/messages/${draft.id}/send`).post({})
      );
    } else {
      // Fallback: no original message – send via sendMail (no threading headers)
      const message: any = {
        subject: subject.startsWith('Re:') ? subject : `Re: ${subject}`,
        body: { contentType: 'HTML', content: bodyHtml },
        toRecipients: [{ emailAddress: { address: toAddress } }],
      };
      if (cc?.length) message.ccRecipients = cc.map(addr => ({ emailAddress: { address: addr } }));
      if (bcc?.length) message.bccRecipients = bcc.map(addr => ({ emailAddress: { address: addr } }));

      await graphRequest(() =>
        client.api(`/users/${fromMailboxEmail}/sendMail`).post({ message, saveToSentItems: true })
      );
    }
  }

  /**
   * Send a new outbound email (agent-initiated, not a reply to an inbound message).
   * Supports To, CC, BCC, rich HTML body, and saves to Sent Items.
   */
  async sendNewEmail(
    fromMailboxEmail: string,
    to: string[],
    cc: string[],
    subject: string,
    bodyHtml: string,
    bcc?: string[]
  ): Promise<void> {
    const client = await this.getClient();

    const message: any = {
      subject,
      body: { contentType: 'HTML', content: bodyHtml },
      toRecipients: to.map(addr => ({ emailAddress: { address: addr } })),
      ccRecipients: cc.map(addr => ({ emailAddress: { address: addr } })),
    };
    if (bcc?.length) message.bccRecipients = bcc.map(addr => ({ emailAddress: { address: addr } }));

    await graphRequest(() =>
      client.api(`/users/${fromMailboxEmail}/sendMail`).post({ message, saveToSentItems: true })
    );
  }

  /**
   * Send a plain-text notification email from a shared mailbox.
   * Used for internal notifications only — not for customer replies.
   * Does NOT save to Sent Items to avoid polluting the mailbox.
   */
  async sendMail(
    fromMailboxEmail: string,
    toAddress: string,
    subject: string,
    bodyText: string
  ): Promise<void> {
    const client = await this.getClient();

    await graphRequest(() =>
      client.api(`/users/${fromMailboxEmail}/sendMail`).post({
        message: {
          subject,
          body: { contentType: 'Text', content: bodyText },
          toRecipients: [{ emailAddress: { address: toAddress } }],
        },
        saveToSentItems: false,
      })
    );
  }

  /**
   * Fetch the raw binary content of a single attachment.
   * Called during email ingestion to write attachments to disk.
   */
  async fetchAttachment(
    mailboxEmail: string,
    messageId: string,
    attachmentId: string
  ): Promise<Buffer> {
    const client = await this.getClient();
    const response = await graphRequest(() =>
      client.api(`/users/${mailboxEmail}/messages/${messageId}/attachments/${attachmentId}`).get()
    );
    // contentBytes is base64-encoded by Graph
    return Buffer.from(response.contentBytes, 'base64');
  }

  /**
   * Search messages in a mailbox using Graph's $search (KQL).
   * Used for searching old emails that were never imported.
   */
  async searchMessages(mailboxEmail: string, searchQuery: string): Promise<Message[]> {
    const client = await this.getClient();
    
    // We escape double quotes in the query to avoid breaking the OData filter
    const escapedQuery = searchQuery.replace(/"/g, '\\"');
    
    const response = await graphRequest(() =>
      client.api(`/users/${mailboxEmail}/messages`)
        .search(`"${escapedQuery}"`)
        .select('id,subject,from,receivedDateTime,bodyPreview,conversationId')
        .top(10) // Limit to top 10 for performance across multiple mailboxes
        .get()
    );

    return response.value || [];
  }

  /**
   * Fetch a single message from Graph.
   */
  async getMessage(mailboxEmail: string, messageId: string): Promise<Message> {
    const client = await this.getClient();
    return graphRequest(() =>
      client.api(`/users/${mailboxEmail}/messages/${messageId}`)
        .select('id,subject,body,from,toRecipients,parentFolderId,conversationId,hasAttachments,receivedDateTime,sentDateTime,internetMessageId,internetMessageHeaders')
        .expand('attachments($select=id,name,contentType,size,isInline)')
        .get()
    );
  }
}

export const graphService = new GraphService();

