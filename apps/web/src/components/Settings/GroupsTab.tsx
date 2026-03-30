import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Users, Plus, Trash2, Shield, User, Loader2 } from 'lucide-react';
import { useGroups, useCreateGroup, useDeleteGroup, useUpdateGroup, useGroup } from '@/hooks/useGroups';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogDescription
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';

interface AllUser {
  id: string;
  displayName: string;
  email: string;
  isActive: boolean;
}

function useAllUsers() {
  return useQuery<AllUser[]>({
    queryKey: ['users-all'],
    queryFn: () => apiFetch('/users/all'),
    staleTime: 60_000,
  });
}

export function GroupsTab() {
  const { data: groups, isLoading } = useGroups();
  const deleteGroup = useDeleteGroup();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h3 className="text-2xl font-bold">Groups</h3>
          <p className="text-muted-foreground">Manage user groups for easier access control and ticket assignment.</p>
        </div>
        <CreateGroupDialog />
      </div>

      <Card className="border-none shadow-md shadow-neutral-200/50">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Group Name</TableHead>
              <TableHead>System Slug</TableHead>
              <TableHead>Members</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-6 animate-pulse text-muted-foreground">Loading groups...</TableCell>
              </TableRow>
            ) : groups?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-10 text-muted-foreground">
                  <Users className="w-8 h-8 mx-auto mb-2 opacity-20" />
                  No groups created yet.
                </TableCell>
              </TableRow>
            ) : groups?.map(group => (
              <TableRow key={group.id} className="group">
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-all">
                      <Shield className="w-4 h-4" />
                    </div>
                    <span className="font-semibold text-sm">{group.displayName}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <code className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-mono uppercase text-muted-foreground">{group.name}</code>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <User className="w-3.5 h-3.5" />
                    {group._count?.members || 0} users
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <EditGroupDialog group={group} />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => {
                        if (confirm(`Delete group "${group.displayName}"? This will not delete the users.`)) {
                          deleteGroup.mutate(group.id);
                        }
                      }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
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

function UserCheckList({
  users,
  selectedIds,
  onChange,
}: {
  users: AllUser[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const toggle = (id: string, checked: boolean) =>
    onChange(checked ? [...selectedIds, id] : selectedIds.filter(x => x !== id));

  return (
    <ScrollArea className="h-52 border rounded-md p-2">
      <div className="space-y-1">
        {users.map(u => (
          <div key={u.id} className="flex items-center gap-2 hover:bg-muted/50 p-1.5 rounded transition-colors">
            <Checkbox
              id={`member-${u.id}`}
              checked={selectedIds.includes(u.id)}
              onCheckedChange={(checked) => toggle(u.id, !!checked)}
            />
            <label htmlFor={`member-${u.id}`} className="text-xs flex-1 cursor-pointer">
              <div className="font-medium">{u.displayName}</div>
              <div className="text-muted-foreground opacity-70">{u.email}</div>
            </label>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}

function CreateGroupDialog() {
  const [open, setOpen] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const { data: users = [], isLoading: loadingUsers } = useAllUsers();
  const createGroup = useCreateGroup();

  const handleCreate = async () => {
    if (!displayName) return;
    await createGroup.mutateAsync({ name: displayName, displayName, userIds: selectedUserIds });
    setDisplayName('');
    setSelectedUserIds([]);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button className="gap-2"><Plus className="w-4 h-4" /> Create Group</Button>} />
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Create New Group</DialogTitle>
          <DialogDescription>Group members can be assigned tickets and granted mailbox access together.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Group Name</label>
            <Input
              placeholder="Support Belgrade"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Members</label>
            {loadingUsers ? (
              <div className="flex items-center justify-center h-52 border rounded-md text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
              </div>
            ) : (
              <UserCheckList users={users} selectedIds={selectedUserIds} onChange={setSelectedUserIds} />
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleCreate} disabled={!displayName || createGroup.isPending}>
            {createGroup.isPending ? 'Creating...' : 'Create Group'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditGroupDialog({ group }: { group: any }) {
  const [open, setOpen] = useState(false);
  const [displayName, setDisplayName] = useState(group.displayName);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);

  const { data: groupDetail, isLoading: loadingGroup } = useGroup(group.id);
  const { data: users = [], isLoading: loadingUsers } = useAllUsers();
  const updateGroup = useUpdateGroup(group.id);

  // Pre-populate members when group detail loads
  useEffect(() => {
    if (groupDetail?.members) {
      setSelectedUserIds(groupDetail.members.map(m => m.userId));
    }
  }, [groupDetail?.members]);

  // Reset display name when group prop changes
  useEffect(() => {
    setDisplayName(group.displayName);
  }, [group.displayName]);

  const handleUpdate = async () => {
    await updateGroup.mutateAsync({ displayName, userIds: selectedUserIds });
    setOpen(false);
  };

  const isLoading = loadingGroup || loadingUsers;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="sm" className="h-8">Edit</Button>} />
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Edit Group</DialogTitle>
          <DialogDescription>Update the group name and its members.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Group Name</label>
            <Input value={displayName} onChange={e => setDisplayName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Members</label>
            {isLoading ? (
              <div className="flex items-center justify-center h-52 border rounded-md text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
              </div>
            ) : (
              <UserCheckList users={users} selectedIds={selectedUserIds} onChange={setSelectedUserIds} />
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleUpdate} disabled={!displayName || updateGroup.isPending}>
            {updateGroup.isPending ? 'Saving...' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
