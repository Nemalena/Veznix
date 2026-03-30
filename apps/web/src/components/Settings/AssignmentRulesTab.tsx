import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { GitBranch, Mail, Plus, Trash2, Edit2, Play, Pause } from 'lucide-react';
import { useMailboxes } from '@/hooks/useMailboxes';
import { useAssignmentRules, useCreateAssignmentRule, useUpdateAssignmentRule, useDeleteAssignmentRule, AssignmentRule } from '@/hooks/useAssignmentRules';
import { useGroups } from '@/hooks/useGroups';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';

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

export function AssignmentRulesTab() {
  const { data: mailboxes, isLoading: mailboxesLoading } = useMailboxes();
  const [selectedMailboxId, setSelectedMailboxId] = useState<string | null>(null);

  const { data: rules, isLoading: rulesLoading } = useAssignmentRules(selectedMailboxId || undefined);
  const deleteRule = useDeleteAssignmentRule();
  const updateRule = useUpdateAssignmentRule();

  const handleToggle = (id: string, isActive: boolean) => {
    updateRule.mutate({ id, isActive });
  };

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this assignment rule?')) {
      deleteRule.mutate(id);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-end gap-4">
        <div className="flex-1 max-w-sm space-y-2">
          <label className="text-sm font-medium">Select Mailbox rules to manage</label>
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
              <CardTitle>Assignment Rules</CardTitle>
              <CardDescription>Rules are evaluated in priority order (lowest first).</CardDescription>
            </div>
            <EditRuleDialog mailboxId={selectedMailboxId} />
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Prio</TableHead>
                  <TableHead>Conditions</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Manage</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rulesLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-6 animate-pulse">Loading...</TableCell>
                  </TableRow>
                ) : rules?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-6">No assignment rules defined.</TableCell>
                  </TableRow>
                ) : rules?.map(rule => (
                  <TableRow key={rule.id} className="group">
                    <TableCell className="font-mono text-sm">{rule.priority}</TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        {Object.entries(rule.conditions).map(([k, v]) => (
                          <div key={k} className="flex gap-2 text-xs">
                            <Badge variant="outline" className="text-[10px] uppercase font-mono">{k}</Badge>
                            <span className="font-mono text-muted-foreground">"{v}"</span>
                          </div>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 text-sm">
                        <GitBranch className="w-4 h-4 text-primary" />
                        Assign to
                        <span className="font-bold">
                          {rule.assignToUserId ? rule.assignToUser?.displayName : rule.assignToGroup?.displayName}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch checked={rule.isActive} onCheckedChange={(val) => handleToggle(rule.id, val)} />
                        {rule.isActive ? <Play className="w-3 h-3 text-emerald-500" /> : <Pause className="w-3 h-3 text-amber-500" />}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <EditRuleDialog
                          mailboxId={selectedMailboxId}
                          existingRule={rule}
                          trigger={<Button variant="ghost" size="icon" className="hover:text-primary">
                            <Edit2 className="w-4 h-4" />
                          </Button>}
                        />
                        <Button variant="ghost" size="icon" className="hover:text-destructive" onClick={() => handleDelete(rule.id)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
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
          <p>Select a mailbox above to manage its assignment rules.</p>
        </div>
      )}
    </div>
  );
}

function EditRuleDialog({ mailboxId, existingRule, trigger }: { mailboxId: string; existingRule?: AssignmentRule; trigger?: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  // Form State
  const [priority, setPriority] = useState(existingRule?.priority ?? 10);
  const [subjectContains, setSubjectContains] = useState(existingRule?.conditions.subjectContains ?? '');
  const [senderDomain, setSenderDomain] = useState(existingRule?.conditions.senderDomain ?? '');
  const [subjectMatchesRegex, setSubjectMatchesRegex] = useState(existingRule?.conditions.subjectMatchesRegex ?? '');

  const [assignType, setAssignType] = useState<'USER' | 'GROUP'>(existingRule?.assignToUserId ? 'USER' : 'GROUP');
  const [assignId, setAssignId] = useState(existingRule?.assignToUserId ?? existingRule?.assignToGroupId ?? '');

  const { data: users = [] } = useAllUsers();
  const { data: groups = [] } = useGroups();

  const createRule = useCreateAssignmentRule();
  const updateRule = useUpdateAssignmentRule();

  const selectedUserLabel = users.find(u => u.id === assignId)?.displayName ?? '';
  const selectedGroupLabel = (groups.find(g => g.id === assignId)?.displayName || groups.find(g => g.id === assignId)?.name) ?? '';
  const assignLabel = assignType === 'USER' ? selectedUserLabel : selectedGroupLabel;

  const handleSave = async () => {
    if (!assignId) return alert('Please select a target user or group to assign to.');

    const conditions: Record<string, string> = {};
    if (subjectContains) conditions.subjectContains = subjectContains;
    if (senderDomain) conditions.senderDomain = senderDomain;
    if (subjectMatchesRegex) conditions.subjectMatchesRegex = subjectMatchesRegex;

    if (Object.keys(conditions).length === 0) {
      return alert('Please define at least one condition.');
    }

    const payload = {
      mailboxId,
      priority: Number(priority),
      conditions,
      assignToUserId: assignType === 'USER' ? assignId : null,
      assignToGroupId: assignType === 'GROUP' ? assignId : null,
      isActive: existingRule?.isActive ?? true,
    };

    try {
      if (existingRule) {
        await updateRule.mutateAsync({ id: existingRule.id, ...payload });
      } else {
        await createRule.mutateAsync(payload);
      }
      setIsOpen(false);

      // Reset form if creating
      if (!existingRule) {
        setSubjectContains('');
        setSenderDomain('');
        setSubjectMatchesRegex('');
        setAssignId('');
      }
    } catch (e: any) {
      alert(e.message || 'Failed to save rule');
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger
        render={trigger ? (trigger as any) : <Button className="gap-2"><Plus className="w-4 h-4" /> Add Rule</Button>}
      />
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{existingRule ? 'Edit' : 'Create'} Assignment Rule</DialogTitle>
          <DialogDescription>Rules run automatically when a new ticket arrives.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 py-4">
          <div className="grid grid-cols-4 gap-4 items-center">
            <Label className="text-right">Priority</Label>
            <Input
              type="number"
              value={priority}
              onChange={e => setPriority(parseInt(e.target.value) || 0)}
              className="col-span-1"
            />
            <span className="col-span-2 text-xs text-muted-foreground whitespace-nowrap">Lower runs first</span>
          </div>

          <div className="border rounded p-4 space-y-4">
            <h4 className="text-sm font-semibold mb-2">Conditions (ALL must match if multiple specified)</h4>

            <div className="grid grid-cols-4 gap-4 items-center">
              <Label className="text-right">Subject Contains</Label>
              <Input
                value={subjectContains}
                onChange={e => setSubjectContains(e.target.value)}
                placeholder="e.g. invoice"
                className="col-span-3"
              />
            </div>

            <div className="grid grid-cols-4 gap-4 items-center">
              <Label className="text-right">Sender Domain</Label>
              <Input
                value={senderDomain}
                onChange={e => setSenderDomain(e.target.value)}
                placeholder="e.g. apple.com"
                className="col-span-3"
              />
            </div>

            <div className="grid grid-cols-4 gap-4 items-center">
              <Label className="text-right">Subject Regex</Label>
              <Input
                value={subjectMatchesRegex}
                onChange={e => setSubjectMatchesRegex(e.target.value)}
                placeholder="^\\[URGENT\\]"
                className="col-span-3 font-mono text-sm"
              />
            </div>
          </div>

          <div className="border rounded p-4 space-y-4 border-l-4 border-l-primary">
            <h4 className="text-sm font-semibold mb-2 flex items-center gap-2"><GitBranch className="w-4 h-4" /> Action</h4>

            <div className="grid grid-cols-4 gap-4 items-center">
              <Label className="text-right">Assign to</Label>
              <Select value={assignType} onValueChange={(val: any) => { setAssignType(val); setAssignId(''); }}>
                <SelectTrigger className="col-span-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="USER">User</SelectItem>
                  <SelectItem value="GROUP">Group</SelectItem>
                </SelectContent>
              </Select>

              <Select value={assignId} onValueChange={(val) => setAssignId(val || '')}>
                <SelectTrigger className="col-span-2">
                  <SelectValue placeholder="Select target...">
                    {assignLabel || undefined}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {assignType === 'USER' ? (
                    users.map(u => (
                      <SelectItem key={u.id} value={u.id}>{u.displayName}</SelectItem>
                    ))
                  ) : (
                    groups.map(g => (
                      <SelectItem key={g.id} value={g.id}>{g.displayName || g.name}</SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setIsOpen(false)}>Cancel</Button>
          <Button
            onClick={handleSave}
            disabled={createRule.isPending || updateRule.isPending}
          >
            {createRule.isPending || updateRule.isPending ? 'Saving...' : 'Save Rule'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
