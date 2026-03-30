import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';

export interface GraphMessage {
  id: string;
  subject: string;
  from: {
    emailAddress: {
      address: string;
      name: string;
    };
  };
  receivedDateTime: string;
  bodyPreview: string;
  conversationId: string;
  mailbox: {
    id: string;
    displayName: string;
    emailAddress: string;
  };
}

export function useHistoricalSearch(query: string, mailboxId?: string) {
  const params = new URLSearchParams();
  if (query) params.append('q', query);
  if (mailboxId && mailboxId !== 'ALL') params.append('mailboxId', mailboxId);

  return useQuery<GraphMessage[]>({
    queryKey: ['historical-search', query, mailboxId],
    queryFn: () => apiFetch(`/search/historical?${params.toString()}`),
    enabled: query.length >= 3, // Only search if query is at least 3 chars
  });
}

export function useCheckImported(graphMessageId: string) {
  return useQuery<{ imported: boolean; ticketId?: string }>({
    queryKey: ['check-imported', graphMessageId],
    queryFn: () => apiFetch(`/search/check-imported?graphMessageId=${graphMessageId}`),
    enabled: !!graphMessageId,
  });
}

export function useImportMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { graphMessageId: string; mailboxId: string }) =>
      apiFetch('/search/import', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tickets'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
      qc.invalidateQueries({ queryKey: ['historical-search'] });
      qc.invalidateQueries({ queryKey: ['check-imported'] });
    }
  });
}
