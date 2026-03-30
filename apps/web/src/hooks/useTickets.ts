import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';
import { Ticket, PaginatedResponse } from '../types/ticket';

export function useTickets(params: {
  status?: string;
  page?: number;
  search?: string;
  mailboxId?: string;
  tagId?: string;
  assignedToId?: string;
} = {}) {
  const queryParams = new URLSearchParams();
  if (params.status) queryParams.append('status', params.status);
  if (params.page) queryParams.append('page', params.page.toString());
  if (params.search) queryParams.append('search', params.search);
  if (params.mailboxId) queryParams.append('mailboxId', params.mailboxId);
  if (params.tagId) queryParams.append('tagId', params.tagId);
  if (params.assignedToId) queryParams.append('assignedToId', params.assignedToId);

  return useQuery<PaginatedResponse<Ticket>>({
    queryKey: ['tickets', params],
    queryFn: () => apiFetch(`/tickets?${queryParams.toString()}`),
    staleTime: 30_000,
  });
}

export function useTicket(id: string) {
  return useQuery<Ticket>({
    queryKey: ['tickets', id],
    queryFn: () => apiFetch(`/tickets/${id}`),
    enabled: !!id,
    staleTime: 30_000,
  });
}

export function useStats(params?: { startDate?: string; endDate?: string }) {
  const queryParams = new URLSearchParams();
  if (params?.startDate) queryParams.append('startDate', params.startDate);
  if (params?.endDate) queryParams.append('endDate', params.endDate);

  return useQuery({
    queryKey: ['stats', params],
    queryFn: () => apiFetch(`/stats${queryParams.toString() ? `?${queryParams.toString()}` : ''}`),
    staleTime: 60_000,
  });
}

export function useUpdateTicket(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiFetch(`/tickets/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tickets', id] });
      qc.invalidateQueries({ queryKey: ['tickets'] });
    }
  });
}

export function useSendReply(ticketId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { bodyHtml: string; fromMailboxId: string; cc?: string[]; bcc?: string[] }) =>
      apiFetch(`/tickets/${ticketId}/reply`, { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tickets', ticketId] });
      qc.invalidateQueries({ queryKey: ['tickets'] });
      qc.invalidateQueries({ queryKey: ['sent-emails'] });
    }
  });
}

export function useAddNote(ticketId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { bodyHtml: string }) =>
      apiFetch(`/tickets/${ticketId}/notes`, { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tickets', ticketId] })
  });
}

export function useAddTag(ticketId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; colour?: string }) =>
      apiFetch(`/tickets/${ticketId}/tags`, { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tickets', ticketId] })
  });
}

export function useRemoveTag(ticketId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (tagId: string) =>
      apiFetch(`/tickets/${ticketId}/tags/${tagId}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tickets', ticketId] })
  });
}

export function useMailboxes() {
  return useQuery<any[]>({
    queryKey: ['mailboxes'],
    queryFn: () => apiFetch('/mailboxes'),
    staleTime: 60_000,
  });
}

export function useCannedResponses(mailboxId?: string) {
  const params = mailboxId ? `?mailboxId=${mailboxId}` : '';
  return useQuery<any[]>({
    queryKey: ['canned-responses', mailboxId],
    queryFn: () => apiFetch(`/canned-responses${params}`),
    staleTime: 120_000,
  });
}

export function useTags() {
  return useQuery<any[]>({
    queryKey: ['tags'],
    queryFn: () => apiFetch('/tags'),
  });
}

export function useCreateCannedResponse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { title: string; bodyHtml: string; mailboxId?: string | null }) =>
      apiFetch('/canned-responses', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['canned-responses'] }),
  });
}

export function useUpdateCannedResponse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; title?: string; bodyHtml?: string; mailboxId?: string | null }) =>
      apiFetch(`/canned-responses/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['canned-responses'] }),
  });
}

export function useDeleteCannedResponse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/canned-responses/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['canned-responses'] }),
  });
}

export function useCreateOutboundTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { subject: string; to: string[]; cc?: string[]; bcc?: string[]; bodyHtml: string; fromMailboxId: string }) =>
      apiFetch('/tickets/new-outbound', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tickets'] });
      qc.invalidateQueries({ queryKey: ['sent-emails'] });
    },
  });
}

export function useBulkUpdateTickets() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { ids: string[]; update: { status?: string; assignedToUserId?: string | null } }) =>
      apiFetch('/tickets/bulk', { method: 'PATCH', body: JSON.stringify(payload) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tickets'] }),
  });
}

export function useTicketLinks(ticketId: string) {
  return useQuery<any[]>({
    queryKey: ['ticket-links', ticketId],
    queryFn: () => apiFetch(`/tickets/${ticketId}/links`),
    staleTime: 30_000,
  });
}

export function useAddTicketLink(ticketId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { targetTicketId: string; linkType: string }) =>
      apiFetch(`/tickets/${ticketId}/links`, { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ticket-links', ticketId] }),
  });
}

export function useRemoveTicketLink(ticketId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (linkId: string) =>
      apiFetch(`/tickets/${ticketId}/links/${linkId}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ticket-links', ticketId] }),
  });
}

export function useSentEmails(params: { mailboxId?: string; page?: number } = {}) {
  const queryParams = new URLSearchParams();
  if (params.mailboxId) queryParams.append('mailboxId', params.mailboxId);
  if (params.page) queryParams.append('page', params.page.toString());

  return useQuery<{ data: any[]; total: number; page: number; limit: number }>({
    queryKey: ['sent-emails', params],
    queryFn: () => apiFetch(`/tickets/sent-emails?${queryParams.toString()}`),
    staleTime: 30_000,
  });
}

// ── Presence (collision detection) ──────────────────────────────────────────

export interface TicketViewer {
  userId: string;
  displayName: string;
}

/**
 * Poll the presence endpoint every 15 s while the component is mounted.
 * Returns the list of OTHER agents currently viewing the same ticket.
 */
export function useTicketPresence(ticketId: string): TicketViewer[] {
  const [viewers, setViewers] = useState<TicketViewer[]>([]);

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      try {
        const data = await apiFetch(`/tickets/${ticketId}/presence`, { method: 'POST' });
        if (!cancelled) setViewers(data.viewers ?? []);
      } catch {
        // silently ignore — presence is best-effort
      }
    };

    poll();
    const interval = setInterval(poll, 15_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [ticketId]);

  return viewers;
}

// ── Ticket Splitting ─────────────────────────────────────────────────────────

export function useSplitTicket(ticketId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { articleId: string; subject: string }) =>
      apiFetch(`/tickets/${ticketId}/split`, { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ticket', ticketId] });
    },
  });
}
