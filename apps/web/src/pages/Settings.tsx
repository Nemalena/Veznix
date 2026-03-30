import { useState, useEffect } from 'react';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger
} from '@/components/ui/tabs';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import {
  Mail,
  Plus,
  Trash2,
  Settings as SettingsIcon,
  ShieldCheck,
  RefreshCcw,
  Loader2
} from 'lucide-react';
import { useMailboxes, useCreateMailbox, useDeleteMailbox, useUpdateMailbox } from '@/hooks/useMailboxes';
import { cn } from '@/lib/utils';
import { MailboxAccessTab } from '@/components/Settings/MailboxAccessTab';
import { AssignmentRulesTab } from '@/components/Settings/AssignmentRulesTab';
import { GroupsTab } from '@/components/Settings/GroupsTab';
import { SlaRulesTab } from '@/components/Settings/SlaRulesTab';
import { Users as UsersIcon, Bell, Clock } from 'lucide-react';
import { useNotificationPrefs, useUpdateNotificationPrefs } from '@/hooks/useNotificationPrefs';

export function Settings() {
  const { data: currentUser } = useNotificationPrefs();
  const isAdmin = currentUser?.isAdmin ?? false;

  const { data: mailboxes, isLoading } = useMailboxes();
  const createMailbox = useCreateMailbox();
  const updateMailbox = useUpdateMailbox();
  const deleteMailbox = useDeleteMailbox();

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newMailbox, setNewMailbox] = useState({ displayName: '', emailAddress: '' });

  const handleCreate = async () => {
    try {
      await createMailbox.mutateAsync(newMailbox);
      setNewMailbox({ displayName: '', emailAddress: '' });
      setIsAddOpen(false);
    } catch (err) {
      console.error(err);
    }
  };

  const handleToggleActive = (id: string, isActive: boolean) => {
    updateMailbox.mutate({ id, isActive });
  };

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this mailbox?')) {
      deleteMailbox.mutate(id);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <h1 className="text-4xl font-extrabold tracking-tight">Settings</h1>
        <p className="text-muted-foreground text-lg mt-2">Manage your shared mailboxes, team access, and preferences.</p>
      </div>

      <Tabs defaultValue={isAdmin ? 'mailboxes' : 'preferences'} className="space-y-6">
        <TabsList className="bg-muted/50 p-1">
          {isAdmin && (
            <>
              <TabsTrigger value="mailboxes" className="gap-2">
                <Mail className="w-4 h-4" /> Shared Mailboxes
              </TabsTrigger>
              <TabsTrigger value="team" className="gap-2">
                <ShieldCheck className="w-4 h-4" /> Mailbox Access
              </TabsTrigger>
              <TabsTrigger value="rules" className="gap-2">
                <SettingsIcon className="w-4 h-4" /> Assignment Rules
              </TabsTrigger>
              <TabsTrigger value="sla" className="gap-2">
                <Clock className="w-4 h-4" /> SLA Rules
              </TabsTrigger>
              <TabsTrigger value="groups" className="gap-2">
                <UsersIcon className="w-4 h-4" /> Groups
              </TabsTrigger>
            </>
          )}
          <TabsTrigger value="preferences" className="gap-2">
            <Bell className="w-4 h-4" /> Preferences
          </TabsTrigger>
        </TabsList>

        {isAdmin && (
          <>
            <TabsContent value="mailboxes" className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <h3 className="text-2xl font-bold">Mailboxes</h3>
                  <p className="text-muted-foreground">Connected Microsoft 365 shared mailboxes.</p>
                </div>

                <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
                  <DialogTrigger
                    render={
                      <Button className="gap-2">
                        <Plus className="w-4 h-4" /> Add Mailbox
                      </Button>
                    }
                  />
                  <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                      <DialogTitle>Add Shared Mailbox</DialogTitle>
                      <DialogDescription>
                        Connect a new Microsoft 365 shared mailbox to the ticketing system.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                      <div className="grid gap-2">
                        <Label htmlFor="name">Display Name</Label>
                        <Input
                          id="name"
                          placeholder="Support Belgrade"
                          value={newMailbox.displayName}
                          onChange={(e) => setNewMailbox({ ...newMailbox, displayName: e.target.value })}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="email">Email Address</Label>
                        <Input
                          id="email"
                          placeholder="support@tempus.ac.rs"
                          value={newMailbox.emailAddress}
                          onChange={(e) => setNewMailbox({ ...newMailbox, emailAddress: e.target.value })}
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="ghost" onClick={() => setIsAddOpen(false)}>Cancel</Button>
                      <Button onClick={handleCreate} disabled={!newMailbox.emailAddress || createMailbox.isPending}>
                        {createMailbox.isPending ? 'Adding...' : 'Add Mailbox'}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>

              <Card className="border-none shadow-md shadow-neutral-200/50">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Mailbox Info</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Tickets</TableHead>
                      <TableHead>Graph Sync</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-10 text-muted-foreground animate-pulse">
                          Loading mailboxes...
                        </TableCell>
                      </TableRow>
                    ) : mailboxes?.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-10 text-muted-foreground">
                          No mailboxes connected yet.
                        </TableCell>
                      </TableRow>
                    ) : mailboxes?.map((m) => (
                      <TableRow key={m.id} className="group">
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                              <Mail className="w-4 h-4" />
                            </div>
                            <div className="flex flex-col">
                              <span className="font-bold text-sm">{m.displayName}</span>
                              <span className="text-xs text-muted-foreground">{m.emailAddress}</span>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={m.isActive}
                              onCheckedChange={(checked) => handleToggleActive(m.id, checked)}
                            />
                            <span className={cn(
                              "text-xs font-semibold",
                              m.isActive ? "text-emerald-600" : "text-neutral-400"
                            )}>
                              {m.isActive ? 'Active' : 'Inactive'}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm font-medium">{m._count?.tickets || 0}</span>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <RefreshCcw className={cn("w-3 h-3", m.isActive && "text-emerald-500")} />
                            {m.isActive ? 'Real-time via Webhook' : 'Paused'}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
                            onClick={() => handleDelete(m.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            </TabsContent>

            <TabsContent value="team">
              <MailboxAccessTab />
            </TabsContent>

            <TabsContent value="rules">
              <AssignmentRulesTab />
            </TabsContent>

            <TabsContent value="sla">
              <SlaRulesTab />
            </TabsContent>

            <TabsContent value="groups">
              <GroupsTab />
            </TabsContent>
          </>
        )}

        <TabsContent value="preferences">
          <PreferencesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PreferencesTab() {
  const { data: prefs, isLoading } = useNotificationPrefs();
  const updatePrefs = useUpdateNotificationPrefs();
  const [localSignature, setLocalSignature] = useState<string>('');

  // Sync internal state when data loads
  useEffect(() => {
    if (prefs?.signature) {
      setLocalSignature(prefs.signature);
    }
  }, [prefs?.signature]);

  const handleSaveSignature = () => {
    updatePrefs.mutate({ signature: localSignature });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl animate-in fade-in duration-500">
      <div className="space-y-1">
        <h3 className="text-2xl font-bold tracking-tight">Personal Preferences</h3>
        <p className="text-muted-foreground">Manage your account settings and notification rules.</p>
      </div>

      <div className="grid gap-6">
        {/* Notifications Card */}
        <Card className="border-none shadow-md shadow-neutral-200/50">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Bell className="w-5 h-5 text-primary" />
              Notifications
            </CardTitle>
            <CardDescription>Configure how and when you receive alerts.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-start justify-between gap-4 py-2">
              <div className="space-y-1">
                <div className="font-semibold flex items-center gap-2">
                  Email Alerts
                  {prefs?.emailNotificationsEnabled !== false ? (
                    <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] h-4">Active</Badge>
                  ) : (
                    <Badge variant="outline" className="bg-muted text-muted-foreground text-[10px] h-4">Disabled</Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground max-w-md">
                  Receive email notifications for ticket assignments, @mentions, and updates on tickets you follow.
                </p>
              </div>
              <Switch
                disabled={updatePrefs.isPending}
                checked={prefs?.emailNotificationsEnabled !== false}
                onCheckedChange={(checked) =>
                  updatePrefs.mutate({ emailNotificationsEnabled: checked })
                }
              />
            </div>
          </CardContent>
        </Card>

        {/* Messaging / Signature Card */}
        <Card className="border-none shadow-md shadow-neutral-200/50">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Mail className="w-5 h-5 text-primary" />
              Email Messaging
            </CardTitle>
            <CardDescription>Set your default outgoing email preferences.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="signature" className="font-semibold">Email Signature</Label>
              <textarea
                id="signature"
                className="w-full min-h-[120px] rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring resize-y placeholder:text-muted-foreground/40"
                placeholder="Best regards,\nNemanja"
                value={localSignature}
                onChange={(e) => setLocalSignature(e.target.value)}
              />
              <p className="text-xs text-muted-foreground italic">
                This signature will be appended to your replies if supported by the template.
              </p>
            </div>
            <div className="flex justify-end">
              <Button
                size="sm"
                onClick={handleSaveSignature}
                className="gap-2"
                disabled={updatePrefs.isPending || localSignature === (prefs?.signature || '')}
              >
                {updatePrefs.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Save Signature
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
