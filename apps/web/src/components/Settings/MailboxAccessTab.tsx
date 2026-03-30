import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Mail, Trash2, User, Users } from 'lucide-react';
import { useMailboxes } from '@/hooks/useMailboxes';
import { useMailboxAccess, useGrantMailboxAccess, useRevokeMailboxAccess } from '@/hooks/useMailboxAccess';
import { useGroups } from '@/hooks/useGroups';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';

interface AllUser {
  id: string;
  displayName: string;
  email: string;
}

function useAllUsers() {
  return useQuery<AllUser[]>({
    queryKey: ['users-all'],
    queryFn: () => apiFetch('/users/all'),
    staleTime: 60_000,
  });
}

export function MailboxAccessTab() {
  const { data: mailboxes, isLoading: mailboxesLoading } = useMailboxes();
  const [selectedMailboxId, setSelectedMailboxId] = useState<string | null>(null);

  const { data: accesses, isLoading: accessLoading } = useMailboxAccess(selectedMailboxId);
  const revokeAccess = useRevokeMailboxAccess();

  const handleRevoke = (grantId: string) => {
    if (!selectedMailboxId) return;
    if (confirm('Are you sure you want to revoke this access?')) {
      revokeAccess.mutate({ mailboxId: selectedMailboxId, grantId });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-end gap-4">
        <div className="flex-1 max-w-sm space-y-2">
          <label className="text-sm font-medium">Select Mailbox to Manage</label>
          <Select
            value={selectedMailboxId || ''}
            onValueChange={setSelectedMailboxId}
            disabled={mailboxesLoading}
          >
            <SelectTrigger>
              <SelectValue placeholder="Choose a mailbox...">
                {mailboxes?.find(m => m.id === selectedMailboxId)?.displayName}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {mailboxes?.map(m => (
                <SelectItem key={m.id} value={m.id}>
                  {m.displayName} ({m.emailAddress})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {selectedMailboxId ? (
        <Card className="border-none shadow-md shadow-neutral-200/50">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Access List</CardTitle>
              <CardDescription>Users and groups with access to this mailbox.</CardDescription>
            </div>
            <AddAccessDialog mailboxId={selectedMailboxId} />
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Grantee</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accessLoading ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground py-6 animate-pulse">Loading...</TableCell>
                  </TableRow>
                ) : accesses?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground py-6">No access grants yet.</TableCell>
                  </TableRow>
                ) : accesses?.map(a => (
                  <TableRow key={a.id}>
                    <TableCell>
                      {a.granteeType === 'USER' ? (
                        <div className="font-medium">{a.user?.displayName} <span className="text-xs text-muted-foreground ml-2">{a.user?.email}</span></div>
                      ) : (
                        <div className="font-medium">{a.group?.displayName || a.group?.name}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        {a.granteeType === 'USER' ? <User className="w-4 h-4" /> : <Users className="w-4 h-4" />}
                        {a.granteeType}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" className="hover:text-destructive" onClick={() => handleRevoke(a.id)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <div className="text-center py-12 text-muted-foreground border rounded-lg border-dashed">
          <Mail className="w-10 h-10 mx-auto mb-4 opacity-50" />
          <p>Select a mailbox above to manage its access settings.</p>
        </div>
      )}
    </div>
  );
}

function AddAccessDialog({ mailboxId }: { mailboxId: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [type, setType] = useState<'USER' | 'GROUP'>('USER');
  const [selectedId, setSelectedId] = useState<string>('');

  const { data: users = [] } = useAllUsers();
  const { data: groups = [] } = useGroups();
  const grantAccess = useGrantMailboxAccess();

  const handleGrant = async () => {
    if (!selectedId) return;
    try {
      await grantAccess.mutateAsync({
        mailboxId,
        userId: type === 'USER' ? selectedId : undefined,
        groupId: type === 'GROUP' ? selectedId : undefined,
      });
      setIsOpen(false);
      setSelectedId('');
    } catch (e: any) {
      alert(e.message || 'Failed to grant access');
    }
  };

  const selectedUserLabel = users.find(u => u.id === selectedId);
  const selectedGroupLabel = groups.find(g => g.id === selectedId);
  const selectedLabel = type === 'USER'
    ? (selectedUserLabel ? `${selectedUserLabel.displayName} (${selectedUserLabel.email})` : '')
    : (selectedGroupLabel ? (selectedGroupLabel.displayName || selectedGroupLabel.name) : '');

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger render={<Button>Grant Access</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Grant Access</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Grantee Type</label>
            <Select value={type} onValueChange={(val: any) => { setType(val); setSelectedId(''); }}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="USER">User</SelectItem>
                <SelectItem value="GROUP">Group</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Select {type === 'USER' ? 'User' : 'Group'}</label>
            <Select value={selectedId} onValueChange={(val) => setSelectedId(val || '')}>
              <SelectTrigger>
                <SelectValue placeholder={`Choose a ${type.toLowerCase()}...`}>
                  {selectedLabel || undefined}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {type === 'USER' ? (
                  users.map(u => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.displayName} ({u.email})
                    </SelectItem>
                  ))
                ) : (
                  groups.map(g => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.displayName || g.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setIsOpen(false)}>Cancel</Button>
          <Button onClick={handleGrant} disabled={!selectedId || grantAccess.isPending}>
            {grantAccess.isPending ? 'Granting...' : 'Grant Access'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
