import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';

export interface MailboxAccess {
  id: string;
  mailboxId: string;
  granteeType: 'USER' | 'GROUP';
  userId?: string | null;
  groupId?: string | null;
  user?: { id: string; displayName: string; email: string } | null;
  group?: { id: string; name: string; displayName: string } | null;
}

export function useMailboxAccess(mailboxId: string | null) {
  return useQuery<MailboxAccess[]>({
    queryKey: ['mailboxes', mailboxId, 'access'],
    queryFn: () => apiFetch(`/mailboxes/${mailboxId}/access`),
    enabled: !!mailboxId,
  });
}

export function useGrantMailboxAccess() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ mailboxId, userId, groupId }: { mailboxId: string; userId?: string; groupId?: string }) => 
      apiFetch(`/mailboxes/${mailboxId}/access`, {
        method: 'POST',
        body: JSON.stringify(userId ? { userId } : { groupId }),
      }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['mailboxes', variables.mailboxId, 'access'] });
    },
  });
}

export function useRevokeMailboxAccess() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ mailboxId, grantId }: { mailboxId: string; grantId: string }) => 
      apiFetch(`/mailboxes/${mailboxId}/access/${grantId}`, {
        method: 'DELETE',
      }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['mailboxes', variables.mailboxId, 'access'] });
    },
  });
}
