import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';
import { Mailbox } from '../types/ticket';

export function useMailboxes() {
  return useQuery<Mailbox[]>({
    queryKey: ['mailboxes'],
    queryFn: () => apiFetch('/mailboxes'),
  });
}

export function useCreateMailbox() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Mailbox>) => apiFetch('/mailboxes', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mailboxes'] });
    },
  });
}

export function useUpdateMailbox() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<Mailbox> & { id: string }) => apiFetch(`/mailboxes/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mailboxes'] });
    },
  });
}

export function useDeleteMailbox() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/mailboxes/${id}`, {
      method: 'DELETE',
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mailboxes'] });
    },
  });
}
