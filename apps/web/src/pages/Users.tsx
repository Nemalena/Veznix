import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { useNotificationPrefs } from '@/hooks/useNotificationPrefs';
import { Navigate } from 'react-router-dom';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Card } from '@/components/ui/card';
import { Users as UsersIcon, Loader2 } from 'lucide-react';

interface User {
  id: string;
  displayName: string;
  email: string;
  avatarUrl: string | null;
  isAdmin: boolean;
  isActive: boolean;
  createdAt: string;
}

function useAllUsers() {
  return useQuery<User[]>({
    queryKey: ['users-all'],
    queryFn: () => apiFetch('/users/all'),
    staleTime: 30_000,
  });
}

function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; isAdmin?: boolean; isActive?: boolean }) =>
      apiFetch(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users-all'] }),
  });
}

export function Users() {
  const { data: currentUser, isLoading: loadingMe } = useNotificationPrefs();
  const { data: users = [], isLoading } = useAllUsers();
  const updateUser = useUpdateUser();

  if (loadingMe) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!currentUser?.isAdmin) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <h1 className="text-4xl font-extrabold tracking-tight flex items-center gap-3">
          <UsersIcon className="w-8 h-8 text-primary" />
          Users
        </h1>
        <p className="text-muted-foreground text-lg mt-2">Manage user roles and account access.</p>
      </div>

      <Card className="border-none shadow-md shadow-neutral-200/50 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>User</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Admin</TableHead>
              <TableHead>Active</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-10 text-muted-foreground animate-pulse">
                  Loading users…
                </TableCell>
              </TableRow>
            ) : users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-10 text-muted-foreground">
                  No users found.
                </TableCell>
              </TableRow>
            ) : users.map((u) => (
              <TableRow key={u.id}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    {u.avatarUrl ? (
                      <img src={u.avatarUrl} alt="" className="w-8 h-8 rounded-full object-cover" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm">
                        {u.displayName.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="flex flex-col">
                      <span className="font-semibold text-sm">{u.displayName}</span>
                      {u.id === currentUser.id && (
                        <span className="text-xs text-muted-foreground">(you)</span>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <span className="text-sm text-muted-foreground">{u.email}</span>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={u.isAdmin}
                      disabled={u.id === currentUser.id || updateUser.isPending}
                      onCheckedChange={(checked) =>
                        updateUser.mutate({ id: u.id, isAdmin: checked })
                      }
                    />
                    {u.isAdmin ? (
                      <Badge variant="outline" className="bg-violet-50 text-violet-700 border-violet-200 text-xs">Admin</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">User</span>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={u.isActive}
                      disabled={u.id === currentUser.id || updateUser.isPending}
                      onCheckedChange={(checked) =>
                        updateUser.mutate({ id: u.id, isActive: checked })
                      }
                    />
                    <span className={`text-xs font-semibold ${u.isActive ? 'text-emerald-600' : 'text-neutral-400'}`}>
                      {u.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
