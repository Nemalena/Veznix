import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';

export interface Group {
  id: string;
  name: string;
  displayName: string;
  _count?: {
    members: number;
  };
}

export function useGroups(search?: string) {
  return useQuery<Group[]>({
    queryKey: ['groups', search],
    queryFn: () => apiFetch(`/groups${search ? `?search=${search}` : ''}`),
  });
}

export function useGroup(id: string) {
  return useQuery<Group & { members: { userId: string }[] }>({
    queryKey: ['groups', id],
    queryFn: () => apiFetch(`/groups/${id}`),
    enabled: !!id,
  });
}

export function useCreateGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; displayName: string; userIds?: string[] }) =>
      apiFetch('/groups', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] });
    },
  });
}

export function useUpdateGroup(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { displayName?: string; userIds?: string[] }) =>
      apiFetch(`/groups/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      queryClient.invalidateQueries({ queryKey: ['groups', id] });
    },
  });
}

export function useDeleteGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/groups/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] });
    },
  });
}
