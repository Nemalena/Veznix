import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';

interface UserPrefs {
  id: string;
  emailNotificationsEnabled: boolean;
  signature: string | null;
  isAdmin: boolean;
}

export function useNotificationPrefs() {
  return useQuery<UserPrefs>({
    queryKey: ['user-prefs'],
    queryFn: () => apiFetch('/users/me'),
    staleTime: 60_000,
  });
}

export function useUpdateNotificationPrefs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { emailNotificationsEnabled?: boolean; signature?: string }) =>
      apiFetch('/users/me/preferences', { method: 'PATCH', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['user-prefs'] }),
  });
}
