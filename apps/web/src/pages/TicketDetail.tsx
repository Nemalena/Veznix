import { useState, useRef, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import DOMPurify from 'dompurify';
import { apiFetch } from '../lib/api';
import { RichTextEditor, type RichTextEditorHandle } from '@/components/RichTextEditor/RichTextEditor';
import {
  ArrowLeft, Send, FileText, Tag as TagIcon, User, Clock,
  CheckCircle2, RefreshCw, ChevronDown, X, Paperclip,
  Calendar, Shield, CornerUpLeft, StickyNote, BookOpen, Loader2,
  ChevronRight, AlertCircle, Trash2, Users, ClipboardCopy,
  ReplyAll, GitMerge, Search, Printer, Link2, Scissors, Eye,
} from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import {
  useTicket, useUpdateTicket, useSendReply, useAddNote,
  useAddTag, useRemoveTag, useMailboxes, useCannedResponses,
  useTicketLinks, useAddTicketLink, useRemoveTicketLink,
  useTicketPresence, useSplitTicket,
} from '@/hooks/useTickets';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator
} from '@/components/ui/dropdown-menu';
import { MentionInput } from '@/components/MentionInput/MentionInput';
import { useUsers } from '@/hooks/useUsers';
import { useGroups } from '@/hooks/useGroups';

function sanitize(html: string) {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['p','br','b','i','u','strong','em','a','ul','ol','li',
                   'blockquote','pre','code','table','thead','tbody','tr','td','th',
                   'h1','h2','h3','h4','span','div','img'],
    ALLOWED_ATTR: ['href','src','alt','style','class','target'],
  });
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ComponentType<{ className?: string }> }> = {
  NEW:      { label: 'New',      color: 'bg-blue-100 text-blue-700 border-blue-200',       icon: AlertCircle },
  OPEN:     { label: 'Open',     color: 'bg-amber-100 text-amber-700 border-amber-200',    icon: RefreshCw },
  PENDING:  { label: 'Pending',  color: 'bg-purple-100 text-purple-700 border-purple-200', icon: Clock },
  RESOLVED: { label: 'Resolved', color: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: CheckCircle2 },
};

type ComposerMode = 'reply' | 'note';

export function TicketDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: ticket, isLoading, error } = useTicket(id!);
  console.log('[DEBUG] TicketDetail render. id:', id, 'isLoading:', isLoading, 'error:', error, 'ticket:', ticket);
  const updateTicket = useUpdateTicket(id!);
  const sendReply = useSendReply(id!);
  const addNote = useAddNote(id!);
  const addTagMutation = useAddTag(id!);
  const removeTagMutation = useRemoveTag(id!);
  const { data: mailboxes = [] } = useMailboxes();
  const viewers = useTicketPresence(id!);
  const splitTicket = useSplitTicket(id!);

  const draftReplyKey = `draft-reply-${id}`;
  const draftNoteKey = `draft-note-${id}`;
  const draftRestoredRef = useRef(false);
  const [draftSaved, setDraftSaved] = useState(false);

  const [composerMode, setComposerMode] = useState<ComposerMode>('reply');
  const [replyHtml, setReplyHtml] = useState('');   // rich-text reply (Tiptap)
  const [noteBody, setNoteBody] = useState(() => localStorage.getItem(`draft-note-${id}`) ?? '');
  const [selectedMailboxId, setSelectedMailboxId] = useState<string>('');
  const [newTagName, setNewTagName] = useState('');
  const [tagPanelOpen, setTagPanelOpen] = useState(false);
  const [mentionedUserIds, setMentionedUserIds] = useState<string[]>([]);
  const [composerHeight, setComposerHeight] = useState(280);
  // Reply CC / BCC
  const [ccAddresses, setCcAddresses] = useState<string[]>([]);
  const [showCc, setShowCc] = useState(false);
  const [ccInput, setCcInput] = useState('');
  const [bccAddresses, setBccAddresses] = useState<string[]>([]);
  const [showBcc, setShowBcc] = useState(false);
  const [bccInput, setBccInput] = useState('');
  // Links panel
  const [linksPanelOpen, setLinksPanelOpen] = useState(false);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const { data: ticketLinks = [] } = useTicketLinks(id!);
  const addLinkMutation = useAddTicketLink(id!);
  const removeLinkMutation = useRemoveTicketLink(id!);

  // Merge state
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [mergeSearch, setMergeSearch] = useState('');
  const [mergeResults, setMergeResults] = useState<any[]>([]);
  const [mergeSearching, setMergeSearching] = useState(false);
  const [merging, setMerging] = useState(false);
  const [mergeError, setMergeError] = useState<string | null>(null);

  // Split state
  const [splitArticle, setSplitArticle] = useState<any | null>(null);
  const richEditorRef = useRef<RichTextEditorHandle>(null);
  const isResizingRef = useRef(false);
  const resizeStartYRef = useRef(0);
  const resizeStartHeightRef = useRef(0);

  const handleResizeMouseDown = (e: React.MouseEvent) => {
    isResizingRef.current = true;
    resizeStartYRef.current = e.clientY;
    resizeStartHeightRef.current = composerHeight;
    e.preventDefault();

    const onMouseMove = (ev: MouseEvent) => {
      if (!isResizingRef.current) return;
      const delta = resizeStartYRef.current - ev.clientY;
      const next = Math.min(600, Math.max(180, resizeStartHeightRef.current + delta));
      setComposerHeight(next);
    };
    const onMouseUp = () => {
      isResizingRef.current = false;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };
  // ── Draft autosave ───────────────────────────────────────────────
  useEffect(() => {
    const bodyHtml = replyHtml.replace(/<hr\s*\/?>([\s\S]*)$/i, '');
    const bodyText = DOMPurify.sanitize(bodyHtml, { ALLOWED_TAGS: [] }).trim();
    const timer = setTimeout(() => {
      if (bodyText) {
        localStorage.setItem(draftReplyKey, bodyHtml);
        setDraftSaved(true);
      } else {
        localStorage.removeItem(draftReplyKey);
        setDraftSaved(false);
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [replyHtml]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (noteBody.trim()) {
        localStorage.setItem(draftNoteKey, noteBody);
        setDraftSaved(true);
      } else {
        localStorage.removeItem(draftNoteKey);
        setDraftSaved(false);
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [noteBody]);

  // Track the last signature HTML we injected so we can replace it on mailbox switch
  const injectedSigRef = useRef('');

  const { data: cannedResponses = [] } = useCannedResponses(selectedMailboxId || undefined);

  // Auto-select first mailbox
  useEffect(() => {
    if (mailboxes.length > 0 && !selectedMailboxId) {
      setSelectedMailboxId(mailboxes[0].id);
    }
  }, [mailboxes]);

  // Inject mailbox signature into the rich-text reply editor when mailbox or mode changes.
  // Uses an <hr> as the separator so we can strip the old signature on mailbox switch.
  useEffect(() => {
    if (composerMode !== 'reply') return;
    const mailbox = mailboxes.find((m: any) => m.id === selectedMailboxId);
    const newSig = mailbox?.signature ?? '';

    setTimeout(() => {
      const editor = richEditorRef.current;
      if (!editor) return;

      // Strip old injected signature: take everything before the <hr> separator
      const currentHtml = editor.getHTML();
      const hrMatch = currentHtml.match(/^([\s\S]*?)<hr\s*\/?>/i);
      const body = hrMatch
        ? hrMatch[1].trim()
        : (editor.isEmpty() ? '' : currentHtml);

      injectedSigRef.current = newSig;

      // On first load, restore saved draft into the body area
      let effectiveBody = body;
      if (!draftRestoredRef.current) {
        draftRestoredRef.current = true;
        const savedDraft = localStorage.getItem(draftReplyKey);
        if (savedDraft && !body) {
          effectiveBody = savedDraft;
        }
      }

      const newContent = newSig
        ? (effectiveBody ? `${effectiveBody}<p></p><hr>${newSig}` : `<p></p><hr>${newSig}`)
        : (effectiveBody || '');

      editor.setContent(newContent);
      setReplyHtml(newContent);
    }, 0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMailboxId, composerMode, mailboxes]);

  const handleSend = async () => {
    if (composerMode === 'reply') {
      if (!selectedMailboxId) return;
      const html = richEditorRef.current?.getHTML() ?? '';
      // Disabled if body (before <hr> signature separator) has no text
      const bodyText = DOMPurify.sanitize(
        html.replace(/<hr\s*\/?>([\s\S]*)$/i, ''),
        { ALLOWED_TAGS: [] },
      ).trim();
      if (!bodyText) return;
      await sendReply.mutateAsync({
        bodyHtml: html,
        fromMailboxId: selectedMailboxId,
        cc: ccAddresses.length > 0 ? ccAddresses : undefined,
        bcc: bccAddresses.length > 0 ? bccAddresses : undefined,
      } as any);
      // Reset and re-inject signature so the editor is ready for the next reply
      const mailbox = mailboxes.find((m: any) => m.id === selectedMailboxId);
      const sigHtml = mailbox?.signature ? `<p></p><hr>${mailbox.signature}` : '';
      richEditorRef.current?.setContent(sigHtml);
      setReplyHtml(sigHtml);
      setCcAddresses([]);
      setShowCc(false);
      setCcInput('');
      setBccAddresses([]);
      setShowBcc(false);
      setBccInput('');
      localStorage.removeItem(draftReplyKey);
      setDraftSaved(false);
    } else {
      if (!noteBody.trim()) return;
      const html = `<p>${noteBody.replace(/\n/g, '</p><p>')}</p>`;
      await addNote.mutateAsync({
        bodyHtml: html,
        mentionedUserIds: mentionedUserIds.length > 0 ? mentionedUserIds : undefined,
      } as any);
      setNoteBody('');
      setMentionedUserIds([]);
      localStorage.removeItem(draftNoteKey);
      setDraftSaved(false);
    }
  };

  const handleMentionsChange = (ids: string[]) => {
    setMentionedUserIds(ids);
  };

  const handleAddTag = async () => {
    const name = newTagName.trim().toLowerCase().replace(/\s+/g, '-');
    if (!name) return;
    await addTagMutation.mutateAsync({ name });
    setNewTagName('');
  };

  const handleInsertCanned = (bodyHtml: string) => {
    richEditorRef.current?.insertContent(bodyHtml);
  };

  // ── Merge handlers ──────────────────────────────────────────────
  const handleMergeSearch = async (q: string) => {
    setMergeSearch(q);
    if (q.trim().length < 2) { setMergeResults([]); return; }
    setMergeSearching(true);
    try {
      const json = await apiFetch(`/tickets?search=${encodeURIComponent(q)}&limit=8`);
      console.log('[Merge Search]', q, 'results:', json.data?.length ?? 0);
      // Exclude current ticket and already-merged tickets
      setMergeResults((json.data ?? []).filter((t: any) => t.id !== id && !t.mergedIntoId));
    } catch (err) { console.error('[Merge Search Error]', err); }
    finally { setMergeSearching(false); }
  };

  const handleMerge = async (targetId: string) => {
    setMerging(true);
    setMergeError(null);
    try {
      await apiFetch(`/tickets/${id}/merge`, {
        method: 'POST',
        body: JSON.stringify({ targetTicketId: targetId }),
      });
      setShowMergeModal(false);
      // Reload the current ticket to show the merged banner
      window.location.reload();
    } catch (e: any) {
      setMergeError(e.message);
    } finally {
      setMerging(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !ticket) {
    return (
      <div className="flex flex-col items-center justify-center h-full space-y-4">
        <p className="text-muted-foreground">Ticket not found or an error occurred.</p>
        <Link to="/tickets" className={cn(buttonVariants({ variant: 'outline' }), 'px-4')}>
          Back to Tickets
        </Link>
      </div>
    );
  }

  const statusCfg = STATUS_CONFIG[ticket.status] ?? STATUS_CONFIG.NEW;
  const StatusIcon = statusCfg.icon;
  const isSending = sendReply.isPending || addNote.isPending;

  // Unified timeline sorted by createdAt
  const timeline = [
    ...(ticket.articles ?? []).map((a: any) => ({ ...a, _kind: 'article' })),
    ...(ticket.events ?? []).map((e: any) => ({ ...e, _kind: 'event' })),
  ].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  return (
    <div className="flex flex-col h-[calc(100vh-64px-48px)] animate-in slide-in-from-right-4 duration-300">
      {/* ─── Print-only header ─── */}
      <div className="hidden print:block px-6 py-4 border-b">
        <h1 className="text-xl font-bold">{ticket.subject}</h1>
        <div className="flex gap-4 text-sm text-muted-foreground mt-1 flex-wrap">
          <span>Status: {statusCfg.label}</span>
          <span>Created: {new Date(ticket.createdAt).toLocaleString()}</span>
          {ticket.assignedTo && <span>Assigned: {ticket.assignedTo.displayName}</span>}
          {ticket.originMailbox && <span>Mailbox: {ticket.originMailbox.displayName}</span>}
        </div>
      </div>

      {/* ─── Header ─── */}
      <div className="print:hidden flex items-center justify-between px-6 py-3 border-b bg-background/80 backdrop-blur sticky top-0 z-10">
        <div className="flex items-center gap-3 min-w-0">
          <Link to="/tickets" className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }), 'rounded-full flex-shrink-0')}>
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-bold text-lg truncate">{ticket.subject}</h2>
              <Badge className={cn('border font-semibold text-xs', statusCfg.color)}>
                <StatusIcon className="w-3 h-3 mr-1" />
                {statusCfg.label}
              </Badge>
              {ticket.isSensitive && (
                <Badge className="bg-red-100 text-red-700 border-red-200 border">
                  <Shield className="w-3 h-3 mr-1" />Sensitive
                </Badge>
              )}
            </div>
            <div className="flex items-center flex-wrap gap-3 mt-0.5 text-xs text-muted-foreground">
              <span>{ticket.originMailbox?.displayName}</span>
              <span>·</span>
              <span>{new Date(ticket.createdAt).toLocaleString()}</span>
              {ticket.assignedTo && (
                <><span>·</span>
                <span className="flex items-center gap-1">
                  <User className="w-3 h-3" />{ticket.assignedTo.displayName}
                </span></>
              )}
              {ticket.assignedToGroup && (
                <><span>·</span>
                <span className="flex items-center gap-1">
                  <Users className="w-3 h-3" />{ticket.assignedToGroup.displayName}
                </span></>
              )}
              {ticket.dueAt && (
                <><span>·</span>
                <span className={cn('flex items-center gap-1', new Date(ticket.dueAt) < new Date() && 'text-red-600 font-semibold')}>
                  <Calendar className="w-3 h-3" />Due {new Date(ticket.dueAt).toLocaleDateString()}
                </span></>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {/* ─ Presence indicator ─ */}
          {viewers.length > 0 && (
            <div
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-xs font-medium"
              title={viewers.map(v => v.displayName).join(', ') + (viewers.length === 1 ? ' is also viewing' : ' are also viewing')}
            >
              <Eye className="w-3.5 h-3.5" />
              <div className="flex -space-x-1.5">
                {viewers.slice(0, 3).map(v => (
                  <Avatar key={v.userId} className="w-5 h-5 ring-1 ring-amber-200">
                    <AvatarFallback className="text-[9px] font-bold bg-amber-100 text-amber-800">
                      {v.displayName[0]?.toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                ))}
              </div>
              <span>
                {viewers.length === 1
                  ? viewers[0].displayName.split(' ')[0]
                  : `${viewers[0].displayName.split(' ')[0]} +${viewers.length - 1}`}
              </span>
            </div>
          )}

          {/* Print */}
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => window.print()} title="Print ticket thread">
            <Printer className="w-3.5 h-3.5" />Print
          </Button>

          {/* Tags toggle */}
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setTagPanelOpen(o => !o)}>
            <TagIcon className="w-3.5 h-3.5" />Tags
            {(ticket.tags?.length ?? 0) > 0 && (
              <span className="bg-primary/10 text-primary text-xs rounded-full px-1.5 font-bold">{ticket.tags.length}</span>
            )}
          </Button>

          {/* Links toggle */}
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setLinksPanelOpen(o => !o)}>
            <Link2 className="w-3.5 h-3.5" />Links
            {ticketLinks.length > 0 && (
              <span className="bg-primary/10 text-primary text-xs rounded-full px-1.5 font-bold">{ticketLinks.length}</span>
            )}
          </Button>

          {!ticket.mergedIntoId && !ticket.isSensitive && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => { setShowMergeModal(true); setMergeSearch(''); setMergeResults([]); setMergeError(null); }}
            >
              <GitMerge className="w-3.5 h-3.5" />Merge
            </Button>
          )}

          <AssigneeDropdown ticket={ticket} onUpdate={(data) => updateTicket.mutate(data)} />

          <DropdownMenu>
            <DropdownMenuTrigger render={
              <Button variant="outline" size="sm" className="gap-1.5">
                <StatusIcon className="w-3.5 h-3.5" />
                {statusCfg.label}
                <ChevronDown className="w-3 h-3 opacity-50" />
              </Button>
            } />
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Change status</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {Object.entries(STATUS_CONFIG).map(([s, cfg]) => {
                const Icon = cfg.icon;
                return (
                  <DropdownMenuItem key={s} onClick={() => updateTicket.mutate({ status: s })}
                    className={cn('gap-2', ticket.status === s && 'font-bold')}>
                    <Icon className="w-4 h-4" />{cfg.label}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* ─── Tag Panel (collapsible) ─── */}
      {tagPanelOpen && (
        <div className="print:hidden border-b bg-muted/10 px-6 py-3 flex items-center gap-3 flex-wrap">
          {ticket.tags?.map(({ tag }: any) => tag && (
            <span key={tag.id} className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium"
              style={{ backgroundColor: tag.colour + '22', color: tag.colour, border: `1px solid ${tag.colour}44` }}>
              {tag.name}
              <button onClick={() => removeTagMutation.mutate(tag.id)} className="hover:opacity-70 ml-0.5">
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
          <div className="flex items-center gap-1">
            <input
              value={newTagName}
              onChange={e => setNewTagName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddTag()}
              placeholder="add-tag"
              className="text-xs border rounded-md px-2 py-1 bg-card w-28 outline-none focus:ring-1 focus:ring-primary/30"
            />
            <Button size="sm" className="h-6 text-xs px-2" onClick={handleAddTag} disabled={addTagMutation.isPending}>+</Button>
          </div>
        </div>
      )}

      {/* ─── Links Panel ─── */}
      {linksPanelOpen && (
        <div className="print:hidden border-b bg-muted/10 px-6 py-3 flex items-center gap-3 flex-wrap">
          {ticketLinks.length === 0 && (
            <span className="text-xs text-muted-foreground italic">No linked tickets yet.</span>
          )}
          {ticketLinks.map((link: any) => (
            <span key={link.id} className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium bg-sky-50 text-sky-700 border border-sky-200">
              <Link2 className="w-3 h-3" />
              <Link to={`/tickets/${link.ticket.id}`} className="hover:underline font-semibold">
                {link.ticket.subject.length > 40 ? link.ticket.subject.slice(0, 40) + '…' : link.ticket.subject}
              </Link>
              <span className="opacity-60 capitalize">{link.linkType.toLowerCase()}</span>
              <button onClick={() => removeLinkMutation.mutate(link.id)} className="hover:opacity-70 ml-0.5">
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
          <Button size="sm" variant="outline" className="h-6 text-xs px-2 gap-1" onClick={() => setShowLinkModal(true)}>
            <Link2 className="w-3 h-3" />Link ticket
          </Button>
        </div>
      )}

      {/* ─── Merged-Into Banner ─── */}
      {ticket.mergedIntoId && (
        <div className="border-b bg-amber-50 px-6 py-2.5 flex items-center gap-2 text-sm text-amber-800">
          <GitMerge className="w-4 h-4 flex-shrink-0 text-amber-600" />
          <span>This ticket was merged into another ticket.</span>
          <Link
            to={`/tickets/${ticket.mergedIntoId}`}
            className="underline font-semibold hover:text-amber-900 ml-1"
          >
            View target ticket →
          </Link>
        </div>
      )}

      {/* ─── Timeline ─── */}
      <ScrollArea className="flex-1 min-h-0 px-4">
        <div className="max-w-3xl mx-auto py-6 space-y-3">
          {timeline.map((item: any) => {
            if (item._kind === 'event') {
              const EVENT_LABELS: Record<string, string> = {
                CREATED: 'Ticket created',
                ASSIGNED: 'Assigned',
                UNASSIGNED: 'Unassigned',
                STATUS_CHANGED: `Status → ${item.meta?.to ?? ''}`,
                REPLIED: 'Reply sent',
                NOTE_ADDED: 'Internal note added',
                DEADLINE_SET: `Deadline set → ${item.meta?.dueAt ? new Date(String(item.meta.dueAt)).toLocaleDateString() : ''}`,
                DEADLINE_CLEARED: 'Deadline cleared',
                MARKED_SENSITIVE: 'Marked sensitive',
                SENSITIVITY_REMOVED: 'Sensitivity removed',
                TAG_ADDED: `Tag added: ${item.meta?.tagName ?? ''}`,
                TAG_REMOVED: 'Tag removed',
                MERGED_INTO: `Merged into ticket ${String(item.meta?.targetId ?? '').slice(-6)}`,
                MERGE_SOURCE: `Absorbed ticket ${String(item.meta?.sourceId ?? '').slice(-6)}`,
                SPLIT_FROM: `Message split into new ticket — "${item.meta?.subject ?? ''}"`,
                SPLIT_INTO: `Created by splitting from ticket ${String(item.meta?.sourceTicketId ?? '').slice(-6)}`,
                DELETED: 'Ticket deleted',
              };
              return (
                <div key={item.id} className="flex items-center gap-2 text-xs text-muted-foreground py-0.5 px-2">
                  <ChevronRight className="w-3 h-3 opacity-40 flex-shrink-0" />
                  <span>{EVENT_LABELS[item.type] ?? item.type}</span>
                  {item.actor && <span className="font-medium text-foreground/60">by {item.actor.displayName}</span>}
                  <span className="ml-auto flex-shrink-0">
                    {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              );
            }

            const isInbound = item.type === 'EMAIL_INBOUND';
            const isNote = item.type === 'INTERNAL_NOTE';
            return (
              <div key={item.id} className={cn(
                'group rounded-2xl p-4 ring-1 transition-all duration-300',
                isNote ? 'bg-amber-50/80 ring-amber-200/60' :
                isInbound ? 'bg-card ring-border hover:shadow-md' :
                'bg-primary/5 ring-primary/20'
              )}>
                <div className="flex items-center gap-3 mb-3">
                  <Avatar className="w-8 h-8 flex-shrink-0">
                    <AvatarFallback className={cn('text-xs font-bold',
                      isNote ? 'bg-amber-200 text-amber-800' :
                      isInbound ? 'bg-blue-100 text-blue-700' : 'bg-primary/10 text-primary')}>
                      {isNote ? '📝' : (item.fromAddress?.[0]?.toUpperCase() ?? 'A')}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm truncate">
                        {isNote ? (item.sentBy?.displayName ?? 'Agent') :
                         isInbound ? (item.fromAddress ?? 'Unknown') :
                         (item.sentBy?.displayName ?? item.fromAddress ?? 'Agent')}
                      </span>
                      <Badge variant="outline" className={cn('text-[10px] h-4 py-0 border-none font-bold rounded-full flex-shrink-0',
                        isNote ? 'bg-amber-100 text-amber-700' :
                        isInbound ? 'bg-blue-50 text-blue-600' : 'bg-emerald-50 text-emerald-600')}>
                        {isNote ? 'Note' : isInbound ? 'Inbound' : 'Reply'}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {isNote && (
                      <button
                        title="Use as reply"
                        onClick={() => {
                          const html = item.bodyHtml ?? item.bodyText ?? '';
                          richEditorRef.current?.setContent(html);
                          setReplyHtml(html);
                          setComposerMode('reply');
                        }}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-md hover:bg-amber-100 text-amber-600 hover:text-amber-800"
                      >
                        <ClipboardCopy className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {!isNote && !ticket.mergedIntoId && (
                      <button
                        title="Split into new ticket"
                        onClick={() => setSplitArticle(item)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-md hover:bg-primary/10 text-muted-foreground hover:text-primary"
                      >
                        <Scissors className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <span className="text-[11px] text-muted-foreground">
                      {new Date(item.createdAt).toLocaleString()}
                    </span>
                  </div>
                </div>

                {/* To / CC / BCC metadata — shown on outbound articles */}
                {!isNote && (item.toAddress || item.ccAddresses || item.bccAddresses) && (
                  <div className="mb-3 text-xs text-muted-foreground space-y-0.5 border-b pb-2.5">
                    {item.toAddress && (
                      <div className="flex gap-1.5">
                        <span className="font-semibold w-6 flex-shrink-0">To:</span>
                        <span>{item.toAddress}</span>
                      </div>
                    )}
                    {item.ccAddresses && (
                      <div className="flex gap-1.5">
                        <span className="font-semibold w-6 flex-shrink-0">CC:</span>
                        <span>{item.ccAddresses}</span>
                      </div>
                    )}
                    {item.bccAddresses && (
                      <div className="flex gap-1.5 text-amber-700">
                        <span className="font-semibold w-6 flex-shrink-0">BCC:</span>
                        <span>{item.bccAddresses}</span>
                      </div>
                    )}
                  </div>
                )}

                <div
                  className="prose prose-sm max-w-none text-sm leading-relaxed dark:prose-invert"
                  dangerouslySetInnerHTML={{ __html: sanitize(item.bodyHtml ?? item.bodyText ?? '') }}
                />

                {item.attachments?.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {item.attachments.map((att: any) => (
                      <span key={att.id} className="inline-flex items-center gap-1.5 text-xs bg-muted px-2 py-1 rounded-lg">
                        <Paperclip className="w-3 h-3" />{att.filename}
                        <span className="text-muted-foreground">({Math.round(att.sizeBytes / 1024)}KB)</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {timeline.length === 0 && (
            <div className="text-center text-muted-foreground text-sm py-16">No messages yet.</div>
          )}
        </div>
      </ScrollArea>

      {/* ─── Composer ─── */}
      <div
        className="print:hidden flex-shrink-0 flex flex-col bg-muted/10 border-t"
        style={{ height: composerHeight }}
      >
        {/* Resize handle */}
        <div
          className="flex items-center justify-center h-2 cursor-row-resize group flex-shrink-0 hover:bg-primary/5 transition-colors"
          onMouseDown={handleResizeMouseDown}
        >
          <div className="w-8 h-0.5 rounded-full bg-border group-hover:bg-primary/40 transition-colors" />
        </div>
      <div className="flex-1 overflow-auto px-4 pb-4 pt-1">
        <div className="max-w-3xl mx-auto bg-card border rounded-2xl shadow-lg focus-within:ring-2 focus-within:ring-primary/20 transition-all relative">
          {/* Toolbar */}
          <div className="flex items-center gap-1 px-3 py-2 border-b bg-muted/20 rounded-t-2xl">
            <Button variant="ghost" size="sm"
              className={cn('h-7 text-xs font-semibold gap-1.5', composerMode === 'reply' && 'bg-primary/10 text-primary')}
              onClick={() => setComposerMode('reply')}>
              <CornerUpLeft className="w-3.5 h-3.5" />Reply
            </Button>
            <Button variant="ghost" size="sm"
              className={cn('h-7 text-xs font-semibold gap-1.5', composerMode === 'note' && 'bg-amber-100 text-amber-700')}
              onClick={() => setComposerMode('note')}>
              <StickyNote className="w-3.5 h-3.5" />Internal Note
            </Button>

            {composerMode === 'reply' && (
              <>
                <Separator orientation="vertical" className="h-4 mx-1" />
                {/* Mailbox selector */}
                <DropdownMenu>
                  <DropdownMenuTrigger render={
                    <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-muted-foreground">
                      From: {mailboxes.find((m: any) => m.id === selectedMailboxId)?.displayName ?? 'Select'}
                      <ChevronDown className="w-3 h-3" />
                    </Button>
                  } />
                  <DropdownMenuContent>
                    {mailboxes.map((m: any) => (
                      <DropdownMenuItem key={m.id} onClick={() => setSelectedMailboxId(m.id)} className="text-xs">
                        {m.displayName}
                        <span className="text-muted-foreground ml-1.5">({m.emailAddress})</span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* CC toggle */}
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn('h-7 text-xs gap-1', showCc ? 'bg-primary/10 text-primary' : 'text-muted-foreground')}
                  onClick={() => setShowCc(v => !v)}
                  title="Add CC recipients"
                >
                  <ReplyAll className="w-3.5 h-3.5" />
                  CC
                </Button>

                {/* BCC toggle */}
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn('h-7 text-xs gap-1', showBcc ? 'bg-primary/10 text-primary' : 'text-muted-foreground')}
                  onClick={() => setShowBcc(v => !v)}
                  title="Add BCC recipients"
                >
                  BCC
                </Button>

                {/* Canned responses */}
                <DropdownMenu>
                  <DropdownMenuTrigger render={
                    <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-muted-foreground">
                      <BookOpen className="w-3.5 h-3.5" />Templates
                    </Button>
                  } />
                  <DropdownMenuContent className="w-64">
                    <DropdownMenuLabel>Canned Responses</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {cannedResponses.length === 0 && (
                      <p className="text-xs text-muted-foreground px-3 py-2">No templates yet.</p>
                    )}
                    {cannedResponses.map((cr: any) => (
                      <DropdownMenuItem key={cr.id} className="text-xs" onClick={() => handleInsertCanned(cr.bodyHtml)}>
                        <FileText className="w-3.5 h-3.5 mr-2 flex-shrink-0" />
                        <span className="truncate">{cr.title}</span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )}
          </div>

          {/* CC chip input */}
          {composerMode === 'reply' && showCc && (
            <div className="px-4 py-2 border-b bg-muted/10 flex flex-col gap-1">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">CC</span>
              <div className="flex flex-wrap gap-1.5 min-h-[30px] items-center">
                {ccAddresses.map(addr => (
                  <span key={addr} className="inline-flex items-center gap-1 bg-primary/10 text-primary text-xs rounded-full px-2 py-0.5 font-medium">
                    {addr}
                    <button type="button" onClick={() => setCcAddresses(prev => prev.filter(a => a !== addr))} className="hover:opacity-70">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
                <input
                  className="flex-1 min-w-[160px] bg-transparent text-sm outline-none placeholder:text-muted-foreground/50"
                  placeholder="Add CC recipient — press Enter or comma"
                  value={ccInput}
                  onChange={e => setCcInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ',' || e.key === 'Tab') {
                      e.preventDefault();
                      const trimmed = ccInput.trim();
                      if (trimmed && !ccAddresses.includes(trimmed)) setCcAddresses(prev => [...prev, trimmed]);
                      setCcInput('');
                    }
                    if (e.key === 'Backspace' && !ccInput && ccAddresses.length > 0) setCcAddresses(prev => prev.slice(0, -1));
                  }}
                  onBlur={() => {
                    const trimmed = ccInput.trim();
                    if (trimmed && !ccAddresses.includes(trimmed)) setCcAddresses(prev => [...prev, trimmed]);
                    setCcInput('');
                  }}
                />
              </div>
            </div>
          )}

          {/* BCC chip input */}
          {composerMode === 'reply' && showBcc && (
            <div className="px-4 py-2 border-b bg-amber-50/40 flex flex-col gap-1">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">BCC <span className="normal-case font-normal">(hidden from other recipients)</span></span>
              <div className="flex flex-wrap gap-1.5 min-h-[30px] items-center">
                {bccAddresses.map(addr => (
                  <span key={addr} className="inline-flex items-center gap-1 bg-amber-100 text-amber-800 text-xs rounded-full px-2 py-0.5 font-medium">
                    {addr}
                    <button type="button" onClick={() => setBccAddresses(prev => prev.filter(a => a !== addr))} className="hover:opacity-70">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
                <input
                  className="flex-1 min-w-[160px] bg-transparent text-sm outline-none placeholder:text-muted-foreground/50"
                  placeholder="Add BCC recipient — press Enter or comma"
                  value={bccInput}
                  onChange={e => setBccInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ',' || e.key === 'Tab') {
                      e.preventDefault();
                      const trimmed = bccInput.trim();
                      if (trimmed && !bccAddresses.includes(trimmed)) setBccAddresses(prev => [...prev, trimmed]);
                      setBccInput('');
                    }
                    if (e.key === 'Backspace' && !bccInput && bccAddresses.length > 0) setBccAddresses(prev => prev.slice(0, -1));
                  }}
                  onBlur={() => {
                    const trimmed = bccInput.trim();
                    if (trimmed && !bccAddresses.includes(trimmed)) setBccAddresses(prev => [...prev, trimmed]);
                    setBccInput('');
                  }}
                />
              </div>
            </div>
          )}

          {/* Rich-text editor for replies */}
          <div className={cn(composerMode !== 'reply' && 'hidden')}>
            <RichTextEditor
              ref={richEditorRef}
              onChange={setReplyHtml}
              placeholder="Type your reply…"
            />
          </div>

          {/* Plain-text @mention input for internal notes */}
          <div className={cn(composerMode !== 'note' && 'hidden')}>
            <MentionInput
              value={noteBody}
              onChange={setNoteBody}
              placeholder="Write an internal note (only visible to agents)…"
              className="p-4 min-h-[110px] placeholder:text-muted-foreground/50 bg-amber-50/30"
              onMentionsChange={handleMentionsChange}
            />
          </div>

          {/* Footer */}
          {(() => {
            // Compute reply body text (before <hr> signature separator) for char count + disabled check
            const replyBodyText = DOMPurify.sanitize(
              replyHtml.replace(/<hr\s*\/?>([\s\S]*)$/i, ''),
              { ALLOWED_TAGS: [] },
            ).trim();
            const charCount = composerMode === 'reply' ? replyBodyText.length : noteBody.length;
            const isContentEmpty = composerMode === 'reply'
              ? !replyBodyText
              : !noteBody.trim();
            return (
              <div className="flex items-center justify-between px-4 py-2 border-t bg-muted/10 rounded-b-2xl">
                <span className="text-xs text-muted-foreground">
                  {charCount > 0
                    ? `${charCount} chars${draftSaved ? ' · Autosaved' : ''}`
                    : 'Tip: use Templates for quick replies'}
                </span>
                <Button
                  size="sm"
                  className={cn(
                    'gap-1.5 px-5 font-semibold shadow-md transition-all hover:scale-[1.03] active:scale-[0.97]',
                    composerMode === 'note' && 'bg-amber-500 hover:bg-amber-600 shadow-amber-200'
                  )}
                  onClick={handleSend}
                  disabled={isSending || isContentEmpty || (composerMode === 'reply' && !selectedMailboxId)}>
                  {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  {composerMode === 'reply' ? 'Send Reply' : 'Save Note'}
                </Button>
              </div>
            );
          })()}
        </div>
      </div>
      </div>

      {/* ─── Link Modal ─── */}
      {showLinkModal && (
        <LinkModal
          currentTicketId={id!}
          onLink={async (targetTicketId, linkType) => {
            await addLinkMutation.mutateAsync({ targetTicketId, linkType });
            setShowLinkModal(false);
            setLinksPanelOpen(true);
          }}
          onClose={() => setShowLinkModal(false)}
        />
      )}

      {/* ─── Merge Modal ─── */}
      {showMergeModal && (
        <MergeModal
          search={mergeSearch}
          results={mergeResults}
          searching={mergeSearching}
          merging={merging}
          error={mergeError}
          onSearchChange={handleMergeSearch}
          onMerge={handleMerge}
          onClose={() => setShowMergeModal(false)}
        />
      )}

      {/* ─── Split Modal ─── */}
      {splitArticle && (
        <SplitModal
          article={splitArticle}
          defaultSubject={ticket.subject}
          isSplitting={splitTicket.isPending}
          error={splitTicket.error ? (splitTicket.error as any).message : null}
          onSplit={async (subject) => {
            const result = await splitTicket.mutateAsync({ articleId: splitArticle.id, subject });
            setSplitArticle(null);
            window.location.href = `/tickets/${result.id}`;
          }}
          onClose={() => { setSplitArticle(null); splitTicket.reset(); }}
        />
      )}
    </div>
  );
}

function AssigneeDropdown({ ticket, onUpdate }: { ticket: any; onUpdate: (data: any) => void }) {
  const { data: users } = useUsers();
  const { data: groups } = useGroups();
  const currentAssignee = ticket.assignedTo?.displayName || ticket.assignedToGroup?.displayName || 'Unassigned';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={
        <Button variant="outline" size="sm" className="gap-1.5">
          <User className="w-3.5 h-3.5" />
          {currentAssignee}
          <ChevronDown className="w-3 h-3 opacity-50" />
        </Button>
      } />
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-bold flex items-center gap-2">
          <User className="w-4 h-4" /> Assign Ticket
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="max-h-[300px] overflow-y-auto">
          <DropdownMenuLabel className="text-[10px] text-muted-foreground uppercase py-1 px-2 tracking-wider">Users</DropdownMenuLabel>
          {users?.map(u => (
            <DropdownMenuItem key={u.id} onClick={() => onUpdate({ assignedToUserId: u.id })} className="flex items-center justify-between">
              {u.displayName}
              {ticket.assignedToUserId === u.id && <CheckCircle2 className="w-3.5 h-3.5 text-primary" />}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-[10px] text-muted-foreground uppercase py-1 px-2 tracking-wider">Groups</DropdownMenuLabel>
          {groups?.map(g => (
            <DropdownMenuItem key={g.id} onClick={() => onUpdate({ assignedToGroupId: g.id })} className="flex items-center justify-between">
              {g.displayName}
              {ticket.assignedToGroupId === g.id && <CheckCircle2 className="w-3.5 h-3.5 text-primary" />}
            </DropdownMenuItem>
          ))}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => onUpdate({ assignedToUserId: null, assignedToGroupId: null })} className="text-destructive focus:text-destructive font-medium">
          <Trash2 className="w-3.5 h-3.5 mr-2" /> Unassign
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ─── Merge Modal ─────────────────────────────────────────────────────────────

function MergeModal({
  search, results, searching, merging, error,
  onSearchChange, onMerge, onClose,
}: {
  search: string;
  results: any[];
  searching: boolean;
  merging: boolean;
  error: string | null;
  onSearchChange: (q: string) => void;
  onMerge: (targetId: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-card border rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div className="flex items-center gap-2 font-semibold">
            <GitMerge className="w-5 h-5 text-primary" />
            Merge Ticket Into…
          </div>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-muted transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search */}
        <div className="px-5 py-3 border-b">
          <div className="flex items-center gap-2 bg-muted/40 rounded-lg px-3 py-2">
            <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <input
              autoFocus
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
              placeholder="Search by subject…"
              value={search}
              onChange={e => onSearchChange(e.target.value)}
            />
            {searching && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
          </div>
        </div>

        {/* Results */}
        <div className="max-h-72 overflow-y-auto divide-y">
          {results.length === 0 && search.trim().length >= 2 && !searching && (
            <p className="text-sm text-muted-foreground text-center py-8">No tickets found.</p>
          )}
          {search.trim().length < 2 && (
            <p className="text-sm text-muted-foreground text-center py-8">Type at least 2 characters to search.</p>
          )}
          {results.map(t => (
            <div key={t.id} className="flex items-center justify-between px-5 py-3 hover:bg-muted/40 transition-colors group">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{t.subject}</p>
                <p className="text-xs text-muted-foreground">
                  {t.originMailbox?.displayName} · {new Date(t.createdAt).toLocaleDateString()}
                </p>
              </div>
              <Button
                size="sm"
                className="ml-3 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity gap-1.5"
                disabled={merging}
                onClick={() => onMerge(t.id)}
              >
                {merging ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <GitMerge className="w-3.5 h-3.5" />}
                Merge here
              </Button>
            </div>
          ))}
        </div>

        {/* Error */}
        {error && (
          <div className="px-5 py-3 border-t bg-destructive/5 text-destructive text-sm">
            {error}
          </div>
        )}

        {/* Footer */}
        <div className="px-5 py-3 border-t bg-muted/10 text-xs text-muted-foreground">
          The current ticket's conversation will be moved to the target ticket and this ticket will be resolved.
        </div>
      </div>
    </div>
  );
}

// ─── Link Modal ───────────────────────────────────────────────────────────────

const LINK_TYPES = [
  { value: 'RELATED', label: 'Related to' },
  { value: 'DUPLICATE', label: 'Duplicate of' },
  { value: 'BLOCKS', label: 'Blocks' },
];

function LinkModal({
  currentTicketId,
  onLink,
  onClose,
}: {
  currentTicketId: string;
  onLink: (targetTicketId: string, linkType: string) => Promise<void>;
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedType, setSelectedType] = useState('RELATED');
  const [linking, setLinking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async (q: string) => {
    setSearch(q);
    if (q.trim().length < 2) { setResults([]); return; }
    setSearching(true);
    try {
      const json = await apiFetch(`/tickets?search=${encodeURIComponent(q)}&limit=8`);
      console.log('[Link Search]', q, 'results:', json.data?.length ?? 0);
      setResults((json.data ?? []).filter((t: any) => t.id !== currentTicketId));
    } catch (err) { console.error('[Link Search Error]', err); }
    finally { setSearching(false); }
  };

  const handleLink = async (targetId: string) => {
    setLinking(true);
    setError(null);
    try {
      await onLink(targetId, selectedType);
    } catch (e: any) {
      setError(e.message ?? 'Failed to link');
    } finally {
      setLinking(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-card border rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div className="flex items-center gap-2 font-semibold">
            <Link2 className="w-5 h-5 text-primary" />
            Link Ticket
          </div>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-muted transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Link type selector */}
        <div className="px-5 pt-4 pb-2 flex items-center gap-2">
          {LINK_TYPES.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setSelectedType(value)}
              className={cn(
                'text-xs px-3 py-1.5 rounded-full font-medium border transition-colors',
                selectedType === value
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-muted/30 text-muted-foreground border-transparent hover:border-border'
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="px-5 py-3 border-b">
          <div className="flex items-center gap-2 bg-muted/40 rounded-lg px-3 py-2">
            <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <input
              autoFocus
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
              placeholder="Search by subject…"
              value={search}
              onChange={e => handleSearch(e.target.value)}
            />
            {searching && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
          </div>
        </div>

        {/* Results */}
        <div className="max-h-64 overflow-y-auto divide-y">
          {results.length === 0 && search.trim().length >= 2 && !searching && (
            <p className="px-5 py-4 text-sm text-muted-foreground">No tickets found.</p>
          )}
          {results.length === 0 && search.trim().length < 2 && (
            <p className="px-5 py-4 text-sm text-muted-foreground">Type at least 2 characters to search.</p>
          )}
          {results.map((t: any) => (
            <div key={t.id} className="flex items-center justify-between px-5 py-3 hover:bg-muted/30 transition-colors">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{t.subject}</p>
                <p className="text-xs text-muted-foreground">{t.originMailbox?.displayName} · {t.status}</p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="ml-3 h-7 text-xs flex-shrink-0"
                disabled={linking}
                onClick={() => handleLink(t.id)}
              >
                {linking ? <Loader2 className="w-3 h-3 animate-spin" /> : <Link2 className="w-3 h-3 mr-1" />}
                Link
              </Button>
            </div>
          ))}
        </div>

        {error && (
          <div className="px-5 py-2 text-xs text-destructive bg-destructive/5 border-t">{error}</div>
        )}
      </div>
    </div>
  );
}


// ─── Split Modal ──────────────────────────────────────────────────────────────

function SplitModal({
  article,
  defaultSubject,
  isSplitting,
  error,
  onSplit,
  onClose,
}: {
  article: any;
  defaultSubject: string;
  isSplitting: boolean;
  error: string | null;
  onSplit: (subject: string) => Promise<void>;
  onClose: () => void;
}) {
  const [subject, setSubject] = useState(defaultSubject);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-card border rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div className="flex items-center gap-2 font-semibold">
            <Scissors className="w-5 h-5 text-primary" />
            Split into new ticket
          </div>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-muted transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Article preview */}
        <div className="px-5 py-3 border-b bg-muted/20 max-h-40 overflow-y-auto">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Message being split</p>
          <div
            className="prose prose-sm max-w-none text-sm text-muted-foreground leading-relaxed line-clamp-4"
            dangerouslySetInnerHTML={{
              __html: DOMPurify.sanitize(article.bodyHtml ?? article.bodyText ?? '', { ALLOWED_TAGS: ['p','br','b','i','strong','em','ul','ol','li','span'] })
            }}
          />
        </div>

        {/* Subject input */}
        <div className="px-5 py-4 space-y-3">
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">
              New ticket subject
            </label>
            <input
              autoFocus
              className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30 bg-background"
              value={subject}
              onChange={e => setSubject(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !isSplitting && subject.trim() && onSplit(subject)}
              placeholder="Enter subject for the new ticket…"
            />
          </div>

          {error && (
            <p className="text-xs text-destructive bg-destructive/5 px-3 py-2 rounded-lg">{error}</p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={onClose} disabled={isSplitting}>
              Cancel
            </Button>
            <Button
              size="sm"
              className="gap-1.5"
              disabled={isSplitting || !subject.trim()}
              onClick={() => onSplit(subject)}
            >
              {isSplitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Scissors className="w-4 h-4" />}
              Split ticket
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
