import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';

export interface User {
  id: string;
  displayName: string;
  email: string;
  avatarUrl?: string;
}

export function useUsers(search?: string) {
  return useQuery<User[]>({
    queryKey: ['users', search],
    queryFn: () => {
      const qs = search ? `?search=${encodeURIComponent(search)}` : '';
      return apiFetch(`/users${qs}`);
    },
  });
}

export function useUserProfile() {
  return useQuery<User>({
    queryKey: ['current-user-profile'],
    queryFn: () => apiFetch('/users/me'),
  });
}
