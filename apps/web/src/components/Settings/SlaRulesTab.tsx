import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Clock, Mail, Plus, Trash2, Edit2, Play, Pause } from 'lucide-react';
import { useMailboxes } from '@/hooks/useMailboxes';

interface SlaRule {
  id: string;
  mailboxId: string;
  priority: number;
  conditions: Record<string, string>;
  responseHours: number;
  isActive: boolean;
  createdAt: string;
}

function useSlaRules(mailboxId?: string) {
  return useQuery<SlaRule[]>({
    queryKey: ['sla-rules', mailboxId],
    queryFn: () => apiFetch(`/mailboxes/${mailboxId}/sla-rules`),
    enabled: !!mailboxId,
    staleTime: 30_000,
  });
}

function useCreateSlaRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<SlaRule, 'id' | 'createdAt'>) =>
      apiFetch(`/mailboxes/${data.mailboxId}/sla-rules`, { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: (_r, vars) => qc.invalidateQueries({ queryKey: ['sla-rules', vars.mailboxId] }),
  });
}

function useUpdateSlaRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, mailboxId, ...data }: Partial<SlaRule> & { id: string; mailboxId: string }) =>
      apiFetch(`/mailboxes/${mailboxId}/sla-rules/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    onSuccess: (_r, vars) => qc.invalidateQueries({ queryKey: ['sla-rules', vars.mailboxId] }),
  });
}

function useDeleteSlaRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, mailboxId }: { id: string; mailboxId: string }) =>
      apiFetch(`/mailboxes/${mailboxId}/sla-rules/${id}`, { method: 'DELETE' }),
    onSuccess: (_r, vars) => qc.invalidateQueries({ queryKey: ['sla-rules', vars.mailboxId] }),
  });
}

export function SlaRulesTab() {
  const { data: mailboxes, isLoading: mailboxesLoading } = useMailboxes();
  const [selectedMailboxId, setSelectedMailboxId] = useState<string | null>(null);

  const { data: rules, isLoading: rulesLoading } = useSlaRules(selectedMailboxId || undefined);
  const deleteRule = useDeleteSlaRule();
  const updateRule = useUpdateSlaRule();

  const handleToggle = (rule: SlaRule) => {
    updateRule.mutate({ id: rule.id, mailboxId: rule.mailboxId, isActive: !rule.isActive });
  };

  const handleDelete = (rule: SlaRule) => {
    if (confirm('Delete this SLA rule?')) {
      deleteRule.mutate({ id: rule.id, mailboxId: rule.mailboxId });
    }
  };

  function formatHours(h: number) {
    return h < 24 ? `${h}h` : `${(h / 24).toFixed(1)}d`;
  }

  function conditionSummary(conditions: Record<string, string>) {
    return Object.entries(conditions).map(([k, v]) => (
      <div key={k} className="flex gap-2 text-xs">
        <Badge variant="outline" className="text-[10px] uppercase font-mono">{k}</Badge>
        <span className="font-mono text-muted-foreground">"{v}"</span>
      </div>
    ));
  }

  return (
    <div className="space-y-6">
      {/* Mailbox selector */}
      <div className="flex-1 max-w-sm space-y-2">
        <label className="text-sm font-medium">Select Mailbox</label>
        <Select
          value={selectedMailboxId || ''}
          onValueChange={setSelectedMailboxId}
          disabled={mailboxesLoading}
        >
          <SelectTrigger>
            <SelectValue placeholder="Choose a mailbox…">
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

      {selectedMailboxId ? (
        <Card className="border-none shadow-md shadow-neutral-200/50">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>SLA Rules</CardTitle>
              <CardDescription>
                Rules are evaluated in priority order (lowest first). First match auto-sets the ticket deadline.
              </CardDescription>
            </div>
            <EditSlaRuleDialog mailboxId={selectedMailboxId} />
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Prio</TableHead>
                  <TableHead>Conditions</TableHead>
                  <TableHead>Response Time</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Manage</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rulesLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-6 animate-pulse">Loading…</TableCell>
                  </TableRow>
                ) : rules?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-6">No SLA rules defined for this mailbox.</TableCell>
                  </TableRow>
                ) : rules?.map(rule => (
                  <TableRow key={rule.id} className="group">
                    <TableCell className="font-mono text-sm">{rule.priority}</TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">{conditionSummary(rule.conditions)}</div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 text-sm font-semibold">
                        <Clock className="w-4 h-4 text-primary" />
                        {formatHours(rule.responseHours)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch checked={rule.isActive} onCheckedChange={() => handleToggle(rule)} />
                        {rule.isActive
                          ? <Play className="w-3 h-3 text-emerald-500" />
                          : <Pause className="w-3 h-3 text-amber-500" />
                        }
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <EditSlaRuleDialog
                          mailboxId={selectedMailboxId}
                          existingRule={rule}
                          trigger={
                            <Button variant="ghost" size="icon" className="hover:text-primary">
                              <Edit2 className="w-4 h-4" />
                            </Button>
                          }
                        />
                        <Button variant="ghost" size="icon" className="hover:text-destructive" onClick={() => handleDelete(rule)}>
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
          <p>Select a mailbox above to manage its SLA rules.</p>
        </div>
      )}
    </div>
  );
}

// ─── Edit / Create dialog ──────────────────────────────────────────────────

function EditSlaRuleDialog({
  mailboxId,
  existingRule,
  trigger,
}: {
  mailboxId: string;
  existingRule?: SlaRule;
  trigger?: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [priority, setPriority] = useState(existingRule?.priority ?? 10);
  const [responseHours, setResponseHours] = useState(existingRule?.responseHours ?? 4);
  const [subjectContains, setSubjectContains] = useState(existingRule?.conditions.subjectContains ?? '');
  const [senderDomain, setSenderDomain] = useState(existingRule?.conditions.senderDomain ?? '');
  const [senderEmail, setSenderEmail] = useState(existingRule?.conditions.senderEmail ?? '');

  const createRule = useCreateSlaRule();
  const updateRule = useUpdateSlaRule();

  const handleSave = async () => {
    const conditions: Record<string, string> = {};
    if (subjectContains.trim()) conditions.subjectContains = subjectContains.trim();
    if (senderDomain.trim()) conditions.senderDomain = senderDomain.trim();
    if (senderEmail.trim()) conditions.senderEmail = senderEmail.trim();

    if (Object.keys(conditions).length === 0) {
      return alert('Please define at least one condition.');
    }
    if (responseHours <= 0) {
      return alert('Response hours must be a positive number.');
    }

    try {
      if (existingRule) {
        await updateRule.mutateAsync({ id: existingRule.id, mailboxId, priority, conditions, responseHours });
      } else {
        await createRule.mutateAsync({ mailboxId, priority, conditions, responseHours, isActive: true });
      }
      setIsOpen(false);
      if (!existingRule) {
        setSubjectContains(''); setSenderDomain(''); setSenderEmail('');
        setPriority(10); setResponseHours(4);
      }
    } catch (e: any) {
      alert(e.message || 'Failed to save SLA rule');
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger
        render={trigger ? (trigger as any) : <Button className="gap-2"><Plus className="w-4 h-4" />Add SLA Rule</Button>}
      />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{existingRule ? 'Edit' : 'Create'} SLA Rule</DialogTitle>
          <DialogDescription>
            When a new ticket matches the conditions, the deadline (dueAt) is automatically set.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {/* Priority */}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right">Priority</Label>
            <Input
              type="number"
              value={priority}
              onChange={e => setPriority(parseInt(e.target.value) || 0)}
              className="col-span-1"
            />
            <span className="col-span-2 text-xs text-muted-foreground">Lower number runs first</span>
          </div>

          {/* Response hours */}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right">Response (h)</Label>
            <Input
              type="number"
              min={0.5}
              step={0.5}
              value={responseHours}
              onChange={e => setResponseHours(parseFloat(e.target.value) || 1)}
              className="col-span-1"
            />
            <span className="col-span-2 text-xs text-muted-foreground">Hours to first reply</span>
          </div>

          {/* Conditions */}
          <div className="border rounded p-4 space-y-3">
            <h4 className="text-sm font-semibold">Conditions (first match wins)</h4>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right text-xs">Subject Contains</Label>
              <Input
                value={subjectContains}
                onChange={e => setSubjectContains(e.target.value)}
                placeholder="invoice"
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right text-xs">Sender Domain</Label>
              <Input
                value={senderDomain}
                onChange={e => setSenderDomain(e.target.value)}
                placeholder="ministry.gov.rs"
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right text-xs">Sender Email</Label>
              <Input
                value={senderEmail}
                onChange={e => setSenderEmail(e.target.value)}
                placeholder="partner@example.com"
                className="col-span-3"
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setIsOpen(false)}>Cancel</Button>
          <Button
            onClick={handleSave}
            disabled={createRule.isPending || updateRule.isPending}
          >
            {createRule.isPending || updateRule.isPending ? 'Saving…' : 'Save Rule'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
