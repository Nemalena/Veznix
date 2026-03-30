import { useState } from 'react';
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
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Plus, Pencil, Trash2, FileText, BookOpen, Loader2 } from 'lucide-react';
import { useCannedResponses, useCreateCannedResponse, useUpdateCannedResponse, useDeleteCannedResponse } from '@/hooks/useTickets';
import { useMailboxes } from '@/hooks/useMailboxes';
import { useNotificationPrefs } from '@/hooks/useNotificationPrefs';

interface CannedResponse {
  id: string;
  title: string;
  bodyHtml: string;
  mailboxId: string | null;
  createdByUserId: string | null;
  createdAt: string;
}

interface TemplateFormData {
  title: string;
  bodyHtml: string;
  mailboxId: string | null;
}

const EMPTY_FORM: TemplateFormData = { title: '', bodyHtml: '', mailboxId: null };

export function Templates() {
  const { data: currentUser } = useNotificationPrefs();
  const isAdmin = currentUser?.isAdmin ?? false;

  const { data: allTemplates = [], isLoading } = useCannedResponses();
  const { data: mailboxes = [] } = useMailboxes();
  const createMutation = useCreateCannedResponse();
  const updateMutation = useUpdateCannedResponse();
  const deleteMutation = useDeleteCannedResponse();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CannedResponse | null>(null);
  const [form, setForm] = useState<TemplateFormData>(EMPTY_FORM);
  const [deleteConfirm, setDeleteConfirm] = useState<CannedResponse | null>(null);

  const canDelete = (t: CannedResponse) =>
    isAdmin || (t.createdByUserId !== null && t.createdByUserId === currentUser?.id);

  const openNew = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (t: CannedResponse) => {
    setEditing(t);
    setForm({ title: t.title, bodyHtml: t.bodyHtml, mailboxId: t.mailboxId });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.title.trim() || !form.bodyHtml.trim()) return;
    if (editing) {
      await updateMutation.mutateAsync({ id: editing.id, ...form });
    } else {
      await createMutation.mutateAsync(form);
    }
    setDialogOpen(false);
  };

  const handleDelete = async (t: CannedResponse) => {
    await deleteMutation.mutateAsync(t.id);
    setDeleteConfirm(null);
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <BookOpen className="w-7 h-7 text-primary" />
            Canned Responses
          </h1>
          <p className="text-muted-foreground mt-1">Reusable reply templates. Select from the composer toolbar inside a ticket.</p>
        </div>
        <Button onClick={openNew} className="gap-2">
          <Plus className="w-4 h-4" />
          New Template
        </Button>
      </div>

      <Card className="border-none shadow-md shadow-neutral-200/50 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Title</TableHead>
              <TableHead>Mailbox scope</TableHead>
              <TableHead>Preview</TableHead>
              <TableHead className="text-right w-[100px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-12 text-muted-foreground animate-pulse">
                  Loading templates…
                </TableCell>
              </TableRow>
            ) : allTemplates.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-16 text-muted-foreground">
                  <div className="flex flex-col items-center gap-3">
                    <FileText className="w-10 h-10 opacity-20" />
                    <p className="font-medium">No templates yet.</p>
                    <Button variant="outline" size="sm" onClick={openNew} className="gap-1.5">
                      <Plus className="w-3.5 h-3.5" />
                      Create your first template
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ) : (allTemplates as CannedResponse[]).map((t) => {
              const mailbox = mailboxes.find((m: any) => m.id === t.mailboxId);
              return (
                <TableRow key={t.id} className="group">
                  <TableCell>
                    <span className="font-semibold text-sm flex items-center gap-2">
                      <FileText className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                      {t.title}
                    </span>
                  </TableCell>
                  <TableCell>
                    {mailbox ? (
                      <Badge variant="outline" className="text-xs font-medium">
                        {mailbox.displayName}
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground italic">All mailboxes</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-muted-foreground line-clamp-1 max-w-xs">
                      {t.bodyHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(t)}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      {canDelete(t) && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => setDeleteConfirm(t)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(v) => { if (!v && !isSaving) setDialogOpen(false); }}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Template' : 'New Template'}</DialogTitle>
            <DialogDescription>
              {editing ? 'Update the canned response.' : 'Create a reusable reply template.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Title</Label>
              <Input
                placeholder='E.g. "Thank you for your email"'
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Mailbox (optional)</Label>
              <Select
                value={form.mailboxId ?? 'ALL'}
                onValueChange={v => setForm(f => ({ ...f, mailboxId: v === 'ALL' ? null : v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All mailboxes">
                    {form.mailboxId
                      ? mailboxes.find((m: any) => m.id === form.mailboxId)?.displayName
                      : 'All mailboxes'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All mailboxes</SelectItem>
                  {mailboxes.map((m: any) => (
                    <SelectItem key={m.id} value={m.id}>{m.displayName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">If set, this template only appears when composing from that mailbox.</p>
            </div>

            <div className="space-y-1.5">
              <Label>Body</Label>
              <textarea
                className="w-full min-h-[160px] rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring resize-y placeholder:text-muted-foreground/50"
                placeholder="Write the template text here…"
                value={form.bodyHtml}
                onChange={e => setForm(f => ({ ...f, bodyHtml: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">Basic HTML is supported (p, b, i, a, ul/ol).</p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)} disabled={isSaving}>Cancel</Button>
            <Button onClick={handleSave} disabled={!form.title.trim() || !form.bodyHtml.trim() || isSaving} className="gap-1.5">
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {editing ? 'Save Changes' : 'Create Template'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <Dialog open={!!deleteConfirm} onOpenChange={(v) => { if (!v) setDeleteConfirm(null); }}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Delete Template?</DialogTitle>
            <DialogDescription>
              This will permanently delete <strong>"{deleteConfirm?.title}"</strong>. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirm && handleDelete(deleteConfirm)}
              disabled={deleteMutation.isPending}
              className="gap-1.5"
            >
              {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
