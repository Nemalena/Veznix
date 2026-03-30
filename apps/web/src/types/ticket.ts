export type TicketStatus = 'NEW' | 'OPEN' | 'PENDING' | 'RESOLVED';

export interface Tag {
  id: string;
  name: string;
  colour: string;
}

export interface TicketTag {
  tag: Tag;
}

export interface TicketEvent {
  id: string;
  type: string;
  meta?: Record<string, unknown>;
  createdAt: string;
  actor?: { id: string; displayName: string };
}

export interface TicketArticle {
  id: string;
  ticketId: string;
  type: 'EMAIL_INBOUND' | 'EMAIL_OUTBOUND' | 'INTERNAL_NOTE';
  fromAddress?: string;
  toAddress?: string;
  bodyHtml?: string;
  bodyText?: string;
  graphMessageId?: string;
  createdAt: string;
  sentBy?: { displayName: string; avatarUrl?: string };
  attachments?: { id: string; filename: string; sizeBytes: number; mimeType: string }[];
}

export interface Ticket {
  id: string;
  subject: string;
  status: TicketStatus;
  originMailboxId: string;
  assignedToUserId?: string | null;
  assignedToGroupId?: string | null;
  dueAt?: string | null;
  isSensitive: boolean;
  firstReplyAt?: string | null;
  resolvedAt?: string | null;
  deletedAt?: string | null;
  mergedIntoId?: string | null;
  createdAt: string;
  updatedAt: string;
  originMailbox: {
    id: string;
    emailAddress: string;
    displayName: string;
    signature?: string | null;
  };
  assignedTo?: {
    id: string;
    displayName: string;
    email: string;
    avatarUrl?: string;
  } | null;
  assignedToGroup?: {
    id: string;
    name: string;
    displayName: string;
  } | null;
  tags: TicketTag[];
  articles?: TicketArticle[];
  events?: TicketEvent[];
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
}

export interface Mailbox {
  id: string;
  emailAddress: string;
  displayName: string;
  isActive: boolean;
  signature?: string | null;
  graphMailboxId?: string;
  createdAt: string;
  _count?: {
    tickets: number;
  };
}
