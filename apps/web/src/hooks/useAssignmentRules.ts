import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';

export interface AssignmentRule {
  id: string;
  mailboxId: string;
  priority: number;
  conditions: Record<string, string>;
  assignToUserId?: string | null;
  assignToGroupId?: string | null;
  isActive: boolean;
  createdAt: string;
  mailbox?: { id: string; displayName: string };
  assignToUser?: { id: string; displayName: string } | null;
  assignToGroup?: { id: string; displayName: string } | null;
}

export function useAssignmentRules(mailboxId?: string) {
  return useQuery<AssignmentRule[]>({
    queryKey: ['assignment-rules', mailboxId],
    queryFn: () => {
      const qs = mailboxId ? `?mailboxId=${mailboxId}` : '';
      return apiFetch(`/assignment-rules${qs}`);
    },
  });
}

export function useCreateAssignmentRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<AssignmentRule>) => 
      apiFetch('/assignment-rules', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assignment-rules'] });
    },
  });
}

export function useUpdateAssignmentRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<AssignmentRule> & { id: string }) => 
      apiFetch(`/assignment-rules/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assignment-rules'] });
    },
  });
}

export function useDeleteAssignmentRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => 
      apiFetch(`/assignment-rules/${id}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assignment-rules'] });
    },
  });
}
